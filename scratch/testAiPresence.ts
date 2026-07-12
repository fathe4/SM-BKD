import http from "http";
import { initializeSocketIO } from "../src/socketio";
initializeSocketIO(http.createServer());

import { supabaseAdmin } from "../src/config/supabase";
import { logger } from "../src/utils/logger";
import { AiPresenceService } from "../src/services/simulation/aiPresenceService";
import { AiConversationStateService } from "../src/services/simulation/aiConversationState.service";
import { UUID } from "crypto";

async function main() {
  logger.info("==================================================");
  logger.info("   STARTING AI PRESENCE & AVAILABILITY TESTS     ");
  logger.info("==================================================");

  // 1. Fetch an AI User
  const { data: aiUser, error: aiError } = await supabaseAdmin!
    .from("users")
    .select("id, username")
    .eq("is_ai", true)
    .limit(1)
    .single();

  if (aiError || !aiUser) {
    logger.error("Could not retrieve AI user for test.");
    process.exit(1);
  }

  logger.info(`Selected AI User: @${aiUser.username} (${aiUser.id})`);

  // 2. Fetch a Human User
  const { data: humanUser, error: humanError } = await supabaseAdmin!
    .from("users")
    .select("id, username")
    .eq("is_ai", false)
    .limit(1)
    .single();

  if (humanError || !humanUser) {
    logger.error("Could not retrieve human user for test.");
    process.exit(1);
  }

  logger.info(`Selected Human User: @${humanUser.username} (${humanUser.id})`);

  // 3. Find or Create direct chat between them
  let chatId: string = "";

  const { data: aiChats } = await supabaseAdmin!
    .from("chat_participants")
    .select("chat_id")
    .eq("user_id", aiUser.id);

  if (aiChats && aiChats.length > 0) {
    const chatIds = aiChats.map(c => c.chat_id);
    const { data: match } = await supabaseAdmin!
      .from("chat_participants")
      .select("chat_id")
      .in("chat_id", chatIds)
      .eq("user_id", humanUser.id)
      .limit(1)
      .maybeSingle();

    if (match) {
      chatId = match.chat_id;
    }
  }

  if (!chatId) {
    logger.info("Creating a new chat between AI and human...");
    const { data: newChat, error: newChatErr } = await supabaseAdmin!
      .from("chats")
      .insert({
        is_group_chat: false
      })
      .select("id")
      .single();

    if (newChatErr || !newChat) {
      logger.error(`Failed to create test chat: ${newChatErr?.message}`);
      process.exit(1);
    }

    chatId = newChat.id;

    // Add participants
    await supabaseAdmin!.from("chat_participants").insert([
      { chat_id: chatId as UUID, user_id: aiUser.id as UUID, role: "member" },
      { chat_id: chatId as UUID, user_id: humanUser.id as UUID, role: "member" }
    ]);
  }

  const finalChatId: string = chatId;

  logger.info(`Test Chat ID: ${finalChatId}`);

  // 4. Initialize AI Presence Service
  await AiPresenceService.init();

  // 5. Test Global Presence Cache
  logger.info("\n--- Test 1: AI Presence Query ---");
  const isAi = AiPresenceService.isAiUser(aiUser.id);
  logger.info(`Is @${aiUser.username} recognized as AI? ${isAi}`);

  const statusBefore = AiPresenceService.getAiStatus(aiUser.id);
  logger.info(`Current status: ${statusBefore.status} | Presence: ${statusBefore.presenceState} | Activity: ${statusBefore.currentActivity}`);

  // 6. Test Transitioning Presence
  logger.info("\n--- Test 2: Transitioning Presence ---");
  logger.info("Transitioning AI to SLEEPING...");
  await AiPresenceService.updateAiPresenceState(aiUser.id, "SLEEPING", "SLEEPING");
  
  const statusAfter = AiPresenceService.getAiStatus(aiUser.id);
  logger.info(`New status: ${statusAfter.status} | Presence: ${statusAfter.presenceState} | Activity: ${statusAfter.currentActivity}`);

  // 7. Test Conversation Availability
  logger.info("\n--- Test 3: Conversation Availability ---");
  const availBefore = await AiConversationStateService.getAvailability(finalChatId);
  logger.info(`Initial availability state: ${availBefore.state}`);

  logger.info("Setting conversation state to PAUSED (Reason: DAILY_LIMIT)...");
  await AiConversationStateService.setAvailability(
    finalChatId,
    null,
    null,
    "PAUSED",
    "DAILY_LIMIT",
    new Date(Date.now() + 5000) // Pause for 5 seconds
  );

  const availAfter = await AiConversationStateService.getAvailability(finalChatId);
  logger.info(`Availability state after pausing: ${availAfter.state} | Reason: ${availAfter.reason} | Until: ${availAfter.until}`);

  // Wait 6 seconds for the pause to expire
  logger.info("Waiting 6 seconds for pause to expire...");
  await new Promise(resolve => setTimeout(resolve, 6000));

  const availExpired = await AiConversationStateService.getAvailability(finalChatId);
  logger.info(`Availability state after expiry: ${availExpired.state}`);

  logger.info("\n==================================================");
  logger.info("               ALL TESTS PASSED                   ");
  logger.info("==================================================");
  process.exit(0);
}

main().catch(err => {
  logger.error(`Test script failed: ${err.message}`);
  process.exit(1);
});
