import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";
import { FriendshipService } from "../friendshipService";
import { FriendshipStatus } from "../../models/friendship.model";
import { ChatService } from "../chatService";
import { EnhancedMessageService } from "../enhancedMessageService";
import { LlmRendererService } from "./llmRenderer.service";
import { AiChatRegistryService } from "./aiChatRegistry.service";
import { AiConversationStateService } from "./aiConversationState.service";
import { redisService } from "../redis.service";
import { getIO } from "../../socketio";
import { getUserSocketIds } from "../../socketio/handlers/connectionHandler";
import { UUID } from "crypto";

// ---------------------------------------------------------------------------
// Phase 7 — Variable Reply Delay
// ---------------------------------------------------------------------------

/** Roll a probabilistic reply delay in milliseconds. */
function rollReplyDelayMs(persona: any): number {
  const personality = persona.personality_json || {};
  const extraversion = personality.extraversion || 0.5;
  const conscientiousness = personality.conscientiousness || 0.5;

  // Determine local hour for time-of-day modifier
  let tzOffset = 0;
  if (persona.timezone === "EST") tzOffset = -5;
  else if (persona.timezone === "PST") tzOffset = -8;
  else if (persona.timezone === "CET") tzOffset = 1;
  else if (persona.timezone === "AEST") tzOffset = 10;
  else if (persona.timezone === "SGT") tzOffset = 8;

  const localHour = (new Date().getUTCHours() + tzOffset + 24) % 24;
  const isEvening = localHour >= 18 && localHour <= 22;
  const isWorkHours = localHour >= 9 && localHour < 18;

  // Base probabilities for each bucket [instant, quick, delayed, late, next-day]
  // Shifted heavily to favor instant (55%) and quick (30%) replies
  let probs = [0.55, 0.30, 0.10, 0.03, 0.02];

  // Time-of-day adjustments
  if (isEvening) {
    probs = [0.70, 0.20, 0.07, 0.02, 0.01]; // evening → even faster (70% instant)
  } else if (isWorkHours) {
    probs = [0.40, 0.35, 0.15, 0.07, 0.03]; // work hours → slightly slower but still highly instant (40%)
  }

  // Personality adjustments
  if (extraversion > 0.7) probs[0] += 0.08, probs[1] += 0.05, probs[2] -= 0.08, probs[3] -= 0.05;
  if (conscientiousness > 0.7) probs[4] = Math.max(0, probs[4] - 0.03); // less likely to forget

  // Normalise
  const total = probs.reduce((a, b) => a + b, 0);
  probs = probs.map(p => p / total);

  // Weighted random draw
  const r = Math.random();
  let cumul = 0;
  let bucket = 1;
  for (let i = 0; i < probs.length; i++) {
    cumul += probs[i];
    if (r < cumul) { bucket = i; break; }
  }

  const ranges: [number, number][] = [
    [5_000,    30_000],      // instant   5s–30s
    [60_000,   300_000],     // quick     1min–5min
    [900_000,  3_600_000],   // delayed   15min–60min
    [7_200_000, 21_600_000], // late      2h–6h
    [28_800_000, 72_000_000] // next-day  8h–20h
  ];

  const [min, max] = ranges[bucket];
  const delay = Math.floor(Math.random() * (max - min) + min);
  const labels = ["instant", "quick", "delayed", "late", "next-day"];
  logger.info(`Reply delay bucket: ${labels[bucket]} → ${Math.round(delay / 1000)}s`);
  return delay;
}

/** Typing duration in ms based on message length. */
function typingDurationMs(content: string): number {
  const len = content.length;
  if (len < 20)  return Math.random() * 1000 + 1000;  // 1–2s
  if (len < 60)  return Math.random() * 2000 + 2000;  // 2–4s
  return Math.random() * 2000 + 4000;                 // 4–6s
}

// ---------------------------------------------------------------------------
// Persona Memory helpers (Phase 5)
// ---------------------------------------------------------------------------

async function loadMemoryFacts(personaId: string, humanId: string): Promise<Array<{ key: string; value: string }>> {
  const now = new Date().toISOString();
  const { data } = await supabaseAdmin!
    .from("persona_chat_memory")
    .select("key, value")
    .eq("persona_id", personaId)
    .eq("human_id", humanId)
    .or(`expires_at.is.null,expires_at.gt.${now}`);
  return data || [];
}

async function saveMemoryFacts(
  personaId: string,
  humanId: string,
  facts: Array<{ category: string; key: string; value: string; is_temporary: boolean }>
): Promise<void> {
  for (const fact of facts) {
    const expiresAt = fact.is_temporary
      ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() // 14 days
      : null;

    await supabaseAdmin!
      .from("persona_chat_memory")
      .upsert({
        persona_id: personaId,
        human_id: humanId,
        category: fact.category,
        key: fact.key,
        value: fact.value,
        disclosed_at: new Date().toISOString(),
        expires_at: expiresAt
      }, { onConflict: "persona_id,human_id,key" });
  }
}

// ---------------------------------------------------------------------------
// Denial count helpers (Phase 1/3)
// ---------------------------------------------------------------------------

async function getDenialCount(chatId: string): Promise<number> {
  const key = `chat:${chatId}:ai_denial_count`;
  const val = await redisService.get<number>(key);
  return val || 0;
}

async function incrementDenialCount(chatId: string): Promise<void> {
  const key = `chat:${chatId}:ai_denial_count`;
  const current = await redisService.get<number>(key) || 0;
  await redisService.set(key, current + 1, 7 * 24 * 3600); // 7 days TTL
}

// ---------------------------------------------------------------------------
// Reply scheduling helpers (Phase 7)
// ---------------------------------------------------------------------------

interface ScheduledReply {
  chatId: string;
  aiUserId: string;
  humanUserId: string;
  scheduledAt: number; // unix ms
  personaId: string;
}

async function scheduleReply(payload: ScheduledReply): Promise<void> {
  const key = `ai:reply_queue:${payload.chatId}`;
  await redisService.set(key, payload, 24 * 3600); // expire after 24h
}

async function getScheduledReply(chatId: string): Promise<ScheduledReply | null> {
  return redisService.get<ScheduledReply>(`ai:reply_queue:${chatId}`);
}

async function deleteScheduledReply(chatId: string): Promise<void> {
  await redisService.deleteKey(`ai:reply_queue:${chatId}`);
}

function getTimezoneOffset(timezone: string): number {
  const map: Record<string, number> = { EST: -5, PST: -8, GMT: 0, CET: 1, AEST: 10, SGT: 8 };
  return map[timezone] || 0;
}

// ---------------------------------------------------------------------------
// Main Service
// ---------------------------------------------------------------------------

export class AiBehaviorService {
  /**
   * Auto-accept pending friend requests sent by humans to AI personas.
   */
  static async autoAcceptFriendRequests(): Promise<void> {
    try {
      logger.info("Running Auto-Accept Friend Requests phase...");

      const { data: pendingRequests, error } = await supabaseAdmin!
        .from("friendships")
        .select(`
          id, requester_id, addressee_id, status,
          requester:users!requester_id(is_ai),
          addressee:users!addressee_id(is_ai)
        `)
        .eq("status", "pending");

      if (error) { logger.error(`Error fetching pending requests: ${error.message}`); return; }
      if (!pendingRequests || pendingRequests.length === 0) return;

      for (const req of pendingRequests) {
        const requesterIsAi = (req.requester as any)?.is_ai || false;
        const addresseeIsAi = (req.addressee as any)?.is_ai || false;

        if (!requesterIsAi && addresseeIsAi) {
          logger.info(`Auto-accepting friend request ${req.id} (human→AI)`);
          await FriendshipService.updateFriendshipStatus(req.id, FriendshipStatus.ACCEPTED);

          // 100% chance to send an initial greeting to guarantee chat after friend request
          if (true) {
            setTimeout(async () => {
              try {
                const chatRes = await ChatService.createChat({
                  context_type: "direct",
                  creator_id: req.addressee_id as UUID,
                  is_group_chat: false
                }, [req.requester_id]);

                const chatId = chatRes.chat.id;
                const { data: persona } = await supabaseAdmin!
                  .from("persona_identities")
                  .select("username, profession")
                  .eq("user_id", req.addressee_id)
                  .single();

                if (!persona) return;

                const greetings = [
                  `hey!`,
                  `yo, what's up`,
                  `hey, saw your profile — pretty cool`,
                  `hey, just connected. how's your day going`,
                  `hey there`,
                  `nice one connecting`,
                  `hey — hope you're having a good one`,
                  `finally got around to saying hi lol`,
                  `oh hey, didn't expect you to connect back so fast`,
                  `yo, what's good`
                ];
                const greetingText = greetings[Math.floor(Math.random() * greetings.length)];

                const message = await EnhancedMessageService.createMessage({
                  chat_id: chatId as UUID,
                  sender_id: req.addressee_id as UUID,
                  content: greetingText
                });

                this.broadcastMessage(req.requester_id, chatId, req.addressee_id, persona.username, greetingText, message);
              } catch (err: any) {
                logger.error(`Error sending milestone greeting: ${err.message}`);
              }
            }, 5000 + Math.random() * 10000); // 5–15s organic delay
          }
        }
      }
    } catch (err: any) {
      logger.error(`Error in autoAcceptFriendRequests: ${err.message}`);
    }
  }

  /**
   * Phase 7: Schedule replies for unread DMs. Marks messages as read immediately.
   * Actual reply happens via processScheduledReplies().
   */
  static async processUnreadDMs(): Promise<void> {
    try {
      logger.info("Scanning for unread DMs to AI personas...");

      const { data: directChats } = await supabaseAdmin!
        .from("chats").select("id").eq("is_group_chat", false);

      if (!directChats || directChats.length === 0) return;

      for (const chat of directChats) {
        // Skip if a reply is already scheduled
        const existing = await getScheduledReply(chat.id);
        if (existing) continue;

        const { data: participants } = await supabaseAdmin!
          .from("chat_participants")
          .select("user_id, users!inner(id, username, is_ai)")
          .eq("chat_id", chat.id);

        if (!participants || participants.length !== 2) continue;

        const aiPart = participants.find(p => (p.users as any).is_ai);
        const humanPart = participants.find(p => !(p.users as any).is_ai);
        if (!aiPart || !humanPart) continue;

        const { data: lastMsgs } = await supabaseAdmin!
          .from("messages").select("*")
          .eq("chat_id", chat.id)
          .order("created_at", { ascending: false }).limit(1);

        if (!lastMsgs || lastMsgs.length === 0) continue;
        const lastMsg = lastMsgs[0];

        if (!lastMsg.is_read && lastMsg.sender_id === humanPart.user_id) {
          // Fetch persona for delay calculation
          const { data: persona } = await supabaseAdmin!
            .from("persona_identities").select("*")
            .eq("user_id", aiPart.user_id).single();

          if (!persona) continue;

          // Wake check — if sleeping, force next-day delay
          const localHour = (new Date().getUTCHours() + getTimezoneOffset(persona.timezone) + 24) % 24;
          const isSleeping = localHour < 7 || localHour > 23;

          const delayMs = isSleeping
            ? Math.floor(Math.random() * (72_000_000 - 28_800_000) + 28_800_000) // force next-day
            : rollReplyDelayMs(persona);

          const scheduledAt = Date.now() + delayMs;

          // Mark messages as read immediately (shows read receipt to human)
          await supabaseAdmin!
            .from("messages")
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq("chat_id", chat.id).eq("is_read", false).eq("sender_id", humanPart.user_id);

          // Schedule the reply
          await scheduleReply({
            chatId: chat.id,
            aiUserId: aiPart.user_id,
            humanUserId: humanPart.user_id,
            scheduledAt,
            personaId: persona.id
          });

          logger.info(`Scheduled reply for chat ${chat.id} in ${Math.round(delayMs / 1000)}s`);
        }
      }
    } catch (err: any) {
      logger.error(`Error in processUnreadDMs: ${err.message}`);
    }
  }

  /**
   * Phase 7: Process all scheduled replies whose time has elapsed.
   * Called every simulation tick.
   */
  static async processScheduledReplies(): Promise<void> {
    try {
      // Scan for ai:reply_queue:* keys in Redis
      const keys = await redisService.scanKeys("ai:reply_queue:*");
      if (!keys || keys.length === 0) return;

      logger.info(`Checking ${keys.length} scheduled replies...`);

      for (const key of keys) {
        const payload = await redisService.get<ScheduledReply>(key);
        if (!payload) continue;
        if (Date.now() < payload.scheduledAt) continue; // not yet due

        logger.info(`Executing scheduled reply for chat ${payload.chatId}`);
        await deleteScheduledReply(payload.chatId);

        this.executeReply(payload.chatId, payload.aiUserId, payload.humanUserId, payload.personaId)
          .catch(err => logger.error(`Failed scheduled reply for chat ${payload.chatId}: ${err.message}`));
      }
    } catch (err: any) {
      logger.error(`Error in processScheduledReplies: ${err.message}`);
    }
  }

  /**
   * Execute the actual DM reply: memory load → limit check → LLM → typing → send → memory save.
   */
  private static async executeReply(chatId: string, aiUserId: string, humanUserId: string, personaId: string): Promise<void> {
    try {
      // 1. Fetch persona
      const { data: persona } = await supabaseAdmin!
        .from("persona_identities").select("*").eq("user_id", aiUserId).single();
      if (!persona) return;

      // 2. Acquire slot
      const gotSlot = await AiChatRegistryService.acquireChatSlot(personaId);
      if (!gotSlot) { logger.info(`No active slot for @${persona.username}`); return; }

      // 2.b Check conversation availability
      const availability = await AiConversationStateService.getAvailability(chatId);
      if (availability.state !== "AVAILABLE") {
        logger.info(`Conversation ${chatId} is not available (state: ${availability.state}). Skipping reply.`);
        return;
      }

      // 3. Daily message limit check
      const limitStatus = await AiChatRegistryService.checkDailyMessageLimit(chatId);
      let exitStrategy: "mute" | "emoji" | "hold" | "goodbye" | undefined;

      if (!limitStatus.allowed) {
        if (limitStatus.count > limitStatus.limit) return; // Already over, silent
        
        exitStrategy = AiChatRegistryService.selectExitStrategy();

        // Put the AI on temporary leave (pause conversation) for 24 hours
        await AiConversationStateService.setAvailability(
          chatId,
          personaId,
          humanUserId,
          "PAUSED",
          "DAILY_LIMIT",
          new Date(Date.now() + 24 * 3600 * 1000)
        );

        if (exitStrategy === "mute") { 
          await AiChatRegistryService.incrementMessageCount(chatId); 
          return; 
        }
      } else {
        // Roll for early goodbye exit based on probability (increases as message count grows, up to max 25)
        const count = limitStatus.count;
        if (count >= 5) {
          const prob = 0.03 + (count - 5) * 0.012; // starts at 3% at 5 msgs, rises to ~21% at 20 msgs
          if (Math.random() < prob) {
            exitStrategy = "goodbye";
            logger.info(`AI Behavior: Proactively rolled early goodbye exit strategy (probability: ${prob.toFixed(3)}) for chat ${chatId} at message ${count}`);
          }
        }
      }

      // 4. Load memory facts (Phase 5)
      const memoryFacts = await loadMemoryFacts(personaId, humanUserId);

      // 5. Load denial count (Phase 3)
      const denialCount = await getDenialCount(chatId);

      // 6. Fetch conversation history
      const { data: rawMessages } = await supabaseAdmin!
        .from("messages")
        .select("*, sender:users!sender_id(username, is_ai)")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true })
        .limit(12);

      const history = (rawMessages || []).map((m: any) => ({
        sender_username: m.sender?.username || "unknown",
        content: m.content || "",
        is_me: m.sender?.is_ai || false
      }));

      // 7. Render response (Phases 1–6)
      const result = await LlmRendererService.renderChatMessage(
        persona, history, exitStrategy, memoryFacts, denialCount
      );

      if (!result.content) return;

      // 8. Detect if this reply involved an AI denial deflection — bump counter
      const lowerContent = result.content.toLowerCase();
      if (lowerContent.includes("sound like") || lowerContent.includes("not a bot") || lowerContent.includes("regular guy") || lowerContent.includes("not ai")) {
        await incrementDenialCount(chatId);
      }

      // 9. Typing simulation (Phase 7 — human-speed typing)
      const io = getIO();
      const humanSocketIds = getUserSocketIds(humanUserId);

      if (io && humanSocketIds.length > 0) {
        const typingPayload = { chatId, userId: aiUserId, name: persona.username, isTyping: true, timestamp: new Date() };
        humanSocketIds.forEach(sid => io.to(sid).emit("chat:typing", typingPayload));
        await new Promise(resolve => setTimeout(resolve, typingDurationMs(result.content)));
        humanSocketIds.forEach(sid => io.to(sid).emit("chat:typing", { ...typingPayload, isTyping: false }));
      }

      // 10. Save message
      const message = await EnhancedMessageService.createMessage({
        chat_id: chatId as UUID,
        sender_id: aiUserId as UUID,
        content: result.content,
        prompt_tokens: result.usage?.prompt_tokens || 0,
        completion_tokens: result.usage?.completion_tokens || 0,
        estimated_cost_usd: result.usage?.estimated_cost_usd || 0
      } as any);

      await AiChatRegistryService.incrementMessageCount(chatId);

      // 11. Broadcast
      this.broadcastMessage(humanUserId, chatId, aiUserId, persona.username, result.content, message);

      // 11.b Handle early exit or semantic goodbye detection to temporarily pause conversation (which turns off green dot)
      const goodbyeKeywords = [
        "gotta go", "gotta run", "talk later", "heading out", 
        "heading off", "see ya", "bye", "goodbye", "catch you later"
      ];
      const hasGoodbyeKeyword = goodbyeKeywords.some(keyword => lowerContent.includes(keyword));

      if (exitStrategy === "goodbye" && limitStatus.allowed) {
        // Early exit probability triggered
        const reasons: Array<"BUSY" | "WORK" | "SOCIAL_FATIGUE"> = ["BUSY", "WORK", "SOCIAL_FATIGUE"];
        const randomReason = reasons[Math.floor(Math.random() * reasons.length)];
        const pauseHours = Math.floor(Math.random() * 4) + 2; // 2 to 5 hours
        const pauseUntil = new Date(Date.now() + pauseHours * 3600 * 1000);

        await AiConversationStateService.setAvailability(
          chatId,
          personaId,
          humanUserId,
          "PAUSED",
          randomReason,
          pauseUntil
        );
        logger.info(`AI Behavior: Early exit probability triggered. Conversation ${chatId} paused (${randomReason}) until ${pauseUntil.toISOString()}`);
      } else if (hasGoodbyeKeyword) {
        // Natural goodbye detected semantically in the LLM text
        const currentAvail = await AiConversationStateService.getAvailability(chatId);
        if (currentAvail.state === "AVAILABLE") {
          const reasons: Array<"BUSY" | "WORK" | "SOCIAL_FATIGUE"> = ["BUSY", "WORK", "SOCIAL_FATIGUE"];
          const randomReason = reasons[Math.floor(Math.random() * reasons.length)];
          const pauseHours = Math.floor(Math.random() * 4) + 2; // 2 to 5 hours
          const pauseUntil = new Date(Date.now() + pauseHours * 3600 * 1000);

          await AiConversationStateService.setAvailability(
            chatId,
            personaId,
            humanUserId,
            "PAUSED",
            randomReason,
            pauseUntil
          );
          logger.info(`AI Behavior: Semantic goodbye detected ("${result.content}"). Conversation ${chatId} paused (${randomReason}) until ${pauseUntil.toISOString()}`);
        }
      }

      // 12. Async memory extraction (Phase 5) — fire-and-forget
      LlmRendererService.extractMemoryFacts(result.content).then(async (facts) => {
        if (facts.length > 0) {
          await saveMemoryFacts(personaId, humanUserId, facts);
          logger.info(`Saved ${facts.length} memory facts for persona ${personaId} <-> human ${humanUserId}`);
        }
      }).catch(() => { /* non-critical */ });

    } catch (err: any) {
      logger.error(`Error in executeReply for chat ${chatId}: ${err.message}`);
    }
  }

  /** Broadcast a message + chat updates via Socket.IO */
  public static async broadcastMessage(
    recipientUserId: string,
    chatId: string,
    senderId: string,
    senderUsername: string,
    content: string,
    message: any
  ): Promise<void> {
    try {
      const io = getIO();
      const socketIds = getUserSocketIds(recipientUserId);
      if (!io || socketIds.length === 0) return;

      const sender = { id: senderId, username: senderUsername, first_name: "", last_name: "", profile_picture: null };
      const payload = { ...message, sender };

      socketIds.forEach(sid => {
        io.to(sid).emit("message:new", { message: payload });
        io.to(sid).emit("chats:update", { chatId, lastMessage: { content, sender_id: senderId, created_at: new Date() } });
      });

      const { chats, total } = await ChatService.getUserChats(recipientUserId, 1, 20);
      socketIds.forEach(sid => {
        io.to(sid).emit("chats:latest", { chats, total, page: 1, totalPages: Math.ceil(total / 20), limit: 20, updatedChatId: chatId });
      });
    } catch (err: any) {
      logger.error(`Error broadcasting message: ${err.message}`);
    }
  }

  /**
   * Trigger friendship gesture when human interacts with AI's post (comment/like).
   */
  static async handleHumanInteraction(humanUserId: string, aiUserId: string): Promise<void> {
    try {
      const friendship = await FriendshipService.getFriendshipBetweenUsers(humanUserId, aiUserId);
      if (friendship) return;

      if (Math.random() < 0.80) {
        logger.info(`AI ${aiUserId} sending friend request to human ${humanUserId} after interaction`);
        await FriendshipService.sendFriendRequest(aiUserId, humanUserId);
      }
    } catch (err: any) {
      logger.error(`Error in handleHumanInteraction: ${err.message}`);
    }
  }
}
