import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";
import { IngestionService } from "./ingestion.service";
import { DiscoveryService } from "./discovery.service";
import { RankingService } from "./ranking.service";
import { EtiquetteService } from "./etiquette.service";
import { LlmRendererService } from "./llmRenderer.service";
import { CommentService } from "../commentService";
import { ReactionService } from "../reactionService";
import { ChatService } from "../chatService";
import { EnhancedMessageService } from "../enhancedMessageService";
import { TargetType, ReactionType } from "../../models/interaction.model";
import { Intent } from "../../models/ai-persona.model";
import { UUID } from "crypto";
import { POSTING_PROFILES } from "../../config/postingProfiles";
import { ContentEngineService } from "./contentEngine.service";
import { AiBehaviorService } from "./aiBehavior.service";
import { getUserBasicProfile } from "../../utils/profileUtils";
import { getIO } from "../../socketio";
import { getUserSocketIds } from "../../socketio/handlers/connectionHandler";

export class SimulationEngine {
  /**
   * Run one complete tick cycle (Ingestion, Ranking, Attention Scroll, Queue Processing)
   */
  static async runSimulationCycle(): Promise<void> {
    logger.info("Starting simulation tick cycle...");

    try {
      // Get clock state early to check tick count and use later for updating
      const { data: clockState } = await supabaseAdmin!
        .from("simulation_state")
        .select("*")
        .single();

      let currentTick = 0;
      if (clockState) {
        currentTick = clockState.current_tick;
      }

      // 1. Ingest new candidates using Content Discovery Service
      logger.info("Running Ingestion & Content Discovery phase...");
      let discoveryCount = 0;

      if (currentTick === 0 || currentTick % 720 === 0) {
        logger.info("RSS & DEV.to Discovery Pipeline is disabled. Skipping.");
        try {
          const { ScraperService } = require("./scraper.service");
          const scrapedCount = await ScraperService.runScraperPipeline();
          logger.info(`Playwright scraped and ingested ${scrapedCount} posts.`);
        } catch (scrapErr: any) {
          logger.error(`Playwright scraper error in cycle: ${scrapErr.message}`);
        }
      } else {
        logger.info(`Skipping discovery pipeline for tick ${currentTick} (runs every 720 ticks).`);
      }

      const postCount = await IngestionService.ingestUserPosts();
      logger.info(`Discovered ${discoveryCount} high-scoring topics, ingested ${postCount} user posts.`);

      // 2. Rank candidates and refresh caches
      logger.info("Running Ranking phase...");
      await RankingService.refreshFeedCaches();

      // 3. Increment global clock
      if (clockState) {
        const nextTick = clockState.current_tick + 1;
        const nextDay = Math.floor(nextTick / 24);
        
        await supabaseAdmin!
          .from("simulation_state")
          .update({
            current_tick: nextTick,
            current_day: nextDay,
            updated_at: new Date().toISOString()
          })
          .eq("id", clockState.id);
      }

      // 3.5. Run AI Direct Message and Friendship behaviors
      await AiBehaviorService.autoAcceptFriendRequests();
      await AiBehaviorService.processUnreadDMs();
      await AiBehaviorService.processScheduledReplies();

      // 4. Attention, Post & Etiquette loop for each active persona
      logger.info("Running Attention, Post & Etiquette phase...");
      const { data: personas } = await supabaseAdmin!
        .from("persona_identities")
        .select(`
          id,
          user_id,
          username,
          timezone,
          persona_states!inner(energy, today_post_count, today_post_budget, last_posted_at),
          persona_conversation_profiles!inner(posting_profile_name)
        `);

      if (personas) {
        for (const persona of personas) {
          const state = (persona.persona_states as any);
          const convProfile = (persona.persona_conversation_profiles as any);
          
          if (!state || !convProfile) continue;

          // Sleep check based on timezone
          let timezoneOffset = 0;
          if (persona.timezone === "EST") timezoneOffset = -5;
          else if (persona.timezone === "PST") timezoneOffset = -8;
          else if (persona.timezone === "GMT") timezoneOffset = 0;
          else if (persona.timezone === "CET") timezoneOffset = 1;
          else if (persona.timezone === "AEST") timezoneOffset = 10;
          else if (persona.timezone === "SGT") timezoneOffset = 8;

          const localHour = (new Date().getUTCHours() + timezoneOffset + 24) % 24;
          const isAwake = localHour >= 7 && localHour <= 23; // Waking window: 7:00 AM to 11:00 PM

          if (!isAwake) {
            logger.info(`@${persona.username} is sleeping (local hour: ${localHour}). Skipping tick.`);
            continue;
          }

          const profileName = convProfile.posting_profile_name || "standard";
          const activeProfile = POSTING_PROFILES[profileName] || POSTING_PROFILES.standard;

          let action: "POST" | "BROWSE" | "NONE" = "NONE";

          // Calculate post opportunity
          let budget = state.today_post_budget;
          if (budget === null || budget === undefined) {
            const roll = Math.random();
            budget = roll < 0.50 ? 3 : 4;
            await supabaseAdmin!
              .from("persona_states")
              .update({ today_post_budget: budget })
              .eq("persona_id", persona.id);
          }

          // Count pending post jobs in the queue
          const { count: pendingPostJobs } = await supabaseAdmin!
            .from("behavior_jobs")
            .select("id", { count: "exact", head: true })
            .eq("persona_id", persona.id)
            .eq("action_type", "POST")
            .eq("status", "pending");

          const effectivePostCount = (state.today_post_count || 0) + (pendingPostJobs || 0);
          const remainingBudget = Math.max(0, budget - effectivePostCount);

          if (remainingBudget > 0 && state.energy >= 0.4) {
            // Fetch any pending post jobs to check their run_at times for cooldown calculation
            const { data: latestPendingJob } = await supabaseAdmin!
              .from("behavior_jobs")
              .select("run_at")
              .eq("persona_id", persona.id)
              .eq("action_type", "POST")
              .eq("status", "pending")
              .order("run_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            const lastPostedTime = latestPendingJob?.run_at 
              ? new Date(latestPendingJob.run_at) 
              : (state.last_posted_at ? new Date(state.last_posted_at) : null);

            // Enforce minimum 2 hours cooldown between posts
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            const cooldownOk = !lastPostedTime || lastPostedTime < twoHoursAgo;

            if (cooldownOk) {
              const isPreferredHour = activeProfile.activeHours.includes(localHour);
              const remainingWakingHours = Math.max(1, 23 - localHour); // day ends at 11 PM (23:00)

              let hourlyRate = remainingBudget / remainingWakingHours;
              if (!isPreferredHour) hourlyRate *= 0.2;
              hourlyRate *= state.energy; // higher energy increases motivation

              // Weekend vs Weekday modifier
              const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;
              const dayWeight = isWeekend ? activeProfile.weekendWeight : activeProfile.weekdayWeight;
              hourlyRate *= dayWeight;

              if (Math.random() < Math.min(0.85, hourlyRate)) {
                action = "POST";
              }
            }
          }

          // If not posting, roll for browse
          if (action === "NONE") {
            const browseWeight = activeProfile.actionWeights.scroll || 0.70;
            if (Math.random() < browseWeight) {
              action = "BROWSE";
            }
          }

          logger.info(`@${persona.username} decided action for this tick: ${action}`);

          if (action === "POST") {
            // Retrieve latest enqueued POST job to space out new post
            const { data: latestPostJob } = await supabaseAdmin!
              .from("behavior_jobs")
              .select("run_at")
              .eq("action_type", "POST")
              .order("run_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            let baseTime = Date.now();
            if (latestPostJob && latestPostJob.run_at) {
              const latestRunAt = new Date(latestPostJob.run_at).getTime();
              if (latestRunAt > baseTime) {
                baseTime = latestRunAt;
              }
            }

            // Space posts out: next post runs 1 to 5 minutes after the last scheduled one
            const spacingMinutes = Math.floor(Math.random() * 5) + 1;
            const runAt = new Date(baseTime + spacingMinutes * 60000).toISOString();

            await supabaseAdmin!
              .from("behavior_jobs")
              .insert({
                persona_id: persona.id,
                action_type: "POST",
                payload: { profile_name: profileName },
                run_at: runAt,
                status: "pending",
                priority: 10
              });

            logger.info(`Enqueued paced POST action for @${persona.username} at ${runAt}`);
          } else if (action === "BROWSE") {
            const { data: feedItem } = await supabaseAdmin!
              .from("feed_items")
              .select("*, feed_candidates(*)")
              .eq("persona_id", persona.id)
              .eq("seen", false)
              .order("score", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (feedItem && feedItem.feed_candidates) {
              const candidate = feedItem.feed_candidates;
              await EtiquetteService.evaluateEngagement(persona.id, candidate);

              // Organic browsing friend request trigger (5% probability)
              if (candidate.origin === "HUMAN" && candidate.reference_id) {
                try {
                  const { data: post } = await supabaseAdmin!
                    .from("posts")
                    .select("user_id")
                    .eq("id", candidate.reference_id)
                    .single();

                  if (post && post.user_id) {
                    const roll = Math.random();
                    if (roll < 0.05) {
                      const { FriendshipService } = require("../friendshipService");
                      const friendship = await FriendshipService.getFriendshipBetweenUsers(persona.user_id, post.user_id);
                      if (!friendship) {
                        logger.info(`AI user ${persona.user_id} (@${persona.username}) decided to send friend request to human ${post.user_id} while browsing feed.`);
                        await FriendshipService.sendFriendRequest(persona.user_id, post.user_id);
                      }
                    }
                  }
                } catch (err: any) {
                  logger.error(`Error sending outbound friend request on BROWSE: ${err.message}`);
                }
              }
            }
          }
        }
      }

      // 5. Process execution queue (behavior_jobs)
      logger.info("Running Queue Processor phase...");
      await this.processBehaviorQueue();

      // 6. Evolve and decay dynamic metrics hourly/daily
      await this.runDynamicDecays();

      logger.info("Simulation tick cycle completed successfully.");
    } catch (err: any) {
      logger.error(`Error in simulation cycle run: ${err.message}`);
    }
  }

  /**
   * Process pending behavior jobs concurrently using atomic PostgreSQL Skip-Locked queue.
   */
  public static async processBehaviorQueue(): Promise<void> {
    let processedCount = 0;
    const maxJobsPerTick = 15;

    const worker = async () => {
      while (true) {
        if (processedCount >= maxJobsPerTick) break;

        // Try to atomically claim a job using FOR UPDATE SKIP LOCKED
        const { data: lockedJobs, error } = await supabaseAdmin!.rpc("claim_next_job");
        if (error) {
          logger.error(`Error claiming next job from queue: ${error.message}`);
          break;
        }

        if (!lockedJobs || lockedJobs.length === 0) {
          break; // No more due jobs in queue
        }

        processedCount++;
        const lockedJob = lockedJobs[0];

        // Fetch full job detail with relations
        const { data: fullJob, error: fetchError } = await supabaseAdmin!
          .from("behavior_jobs")
          .select("*, persona_identities(*, persona_conversation_profiles(*))")
          .eq("id", lockedJob.r_id)
          .single();

        if (fetchError || !fullJob) {
          logger.error(`Error fetching claimed job details for job ${lockedJob.r_id}: ${fetchError?.message}`);
          continue;
        }

        await this.processSingleJob(fullJob);
      }
    };

    // Spawn 5 concurrent workers
    const workers = Array.from({ length: 5 }, () => worker());
    await Promise.all(workers);
  }

  /**
   * Process a single behavior job
   */
  private static async processSingleJob(job: any): Promise<void> {
    try {
      const rawPersona = job.persona_identities;
      if (!rawPersona) return;

      const conversationRole = (rawPersona as any).persona_conversation_profiles?.conversation_role || "observer";
      const persona = {
        ...rawPersona,
        conversation_role: conversationRole
      };
      
      if (job.action_type === "LIKE") {
        const targetId = job.payload?.post_id;
        if (!targetId || targetId === "null" || targetId === "undefined") {
          logger.warn(`Skipping LIKE job ${job.id} due to invalid or null post_id.`);
          await supabaseAdmin!
            .from("behavior_jobs")
            .update({ status: "done" })
            .eq("id", job.id);
          return;
        }

        await ReactionService.createReaction({
          target_id: targetId as UUID,
          user_id: persona.user_id as UUID,
          target_type: TargetType.POST,
          reaction_type: ReactionType.LIKE,
        });

        logger.info(`@${persona.username} liked post ${targetId}`);
        await SimulationEngine.applyFeedbackToPostAuthor(targetId, "like");
      }

      if (job.action_type === "COMMENT") {
        const targetId = job.payload?.post_id;
        if (!targetId || targetId === "null" || targetId === "undefined") {
          logger.warn(`Skipping COMMENT job ${job.id} due to invalid or null post_id.`);
          await supabaseAdmin!
            .from("behavior_jobs")
            .update({ status: "done" })
            .eq("id", job.id);
          return;
        }

        // Fetch target post to get context
        const { data: post } = await supabaseAdmin!
          .from("posts")
          .select("content")
          .eq("id", targetId)
          .single();

        // Fetch post media to check for attached images
        const { data: media } = await supabaseAdmin!
          .from("post_media")
          .select("media_url")
          .eq("post_id", targetId)
          .limit(1)
          .maybeSingle();

        // Fetch existing comments on post to prevent AI from repeating them
        const { data: existingComments } = await supabaseAdmin!
          .from("comments")
          .select("content")
          .eq("post_id", targetId)
          .order("created_at", { ascending: true })
          .limit(10);

        const postContent = post?.content || "";
        const imageUrl = media?.media_url || null;
        const previousComments = (existingComments || []).map((c: any) => c.content);

        // Fetch AI Persona tone
        const { data: aiPersona } = await supabaseAdmin!
          .from("ai_personas")
          .select("tone")
          .eq("user_id", persona.user_id)
          .maybeSingle();

        const isFunnyTone = aiPersona?.tone === "funny" || conversationRole === "comedian";
        const humorScore = persona.humor || 0.5;

        const sarcasm = isFunnyTone 
          ? parseFloat((0.55 + Math.random() * 0.35).toFixed(2)) 
          : humorScore > 0.6 
            ? parseFloat((0.3 + Math.random() * 0.35).toFixed(2))
            : parseFloat((0.05 + Math.random() * 0.2).toFixed(2));

        const optimism = isFunnyTone
          ? parseFloat((0.3 + Math.random() * 0.35).toFixed(2))
          : parseFloat((0.55 + Math.random() * 0.3).toFixed(2));

        const warmth = isFunnyTone
          ? parseFloat((0.25 + Math.random() * 0.35).toFixed(2))
          : parseFloat((0.5 + Math.random() * 0.35).toFixed(2));

        // Compile Intent
        const intent: Intent = {
          actorId: persona.id,
          action: "COMMENT",
          targetType: "post",
          targetId: targetId,
          subjectEntityName: "General Discussion",
          stance: 0.5,
          internalThought: {
            triggeredMemories: [],
            dominantGoal: `React authentically to the post: ${postContent.slice(0, 100)}...`,
            dominantEmotion: { valence: 0.5, arousal: 0.5 }
          },
          tone: {
            sarcasm,
            optimism,
            certainty: 0.8,
            warmth
          },
          length: "short",
          writingStyle: {
            capitalization: persona.writing_style?.capitalization || "standard",
            slangUsage: persona.writing_style?.slangUsage || false,
            technicalDepth: persona.writing_style?.technicalDepth || 0.5
          }
        };

        // Render comment using twin-stage LLM
        const result = await LlmRendererService.renderContent(persona, intent, postContent, imageUrl, previousComments);
        const commentText = result.content;
        const usage = result.usage;

        if (commentText && commentText !== "IGNORE") {
          try {
            await CommentService.createComment({
              post_id: targetId as UUID,
              user_id: persona.user_id as UUID,
              content: commentText,
              is_ai_generated: true,
              prompt_tokens: usage?.prompt_tokens || 0,
              completion_tokens: usage?.completion_tokens || 0,
              estimated_cost_usd: usage?.estimated_cost_usd || 0
            } as any);

            logger.info(`@${persona.username} commented on post ${targetId}: "${commentText}"`);
            await SimulationEngine.applyFeedbackToPostAuthor(targetId, "comment");

            // Update stats
            const { data: state } = await supabaseAdmin!
              .from("persona_states")
              .select("today_comment_count, energy")
              .eq("persona_id", persona.id)
              .single();

            if (state) {
              await supabaseAdmin!
                .from("persona_states")
                .update({
                  today_comment_count: state.today_comment_count + 1,
                  energy: Math.max(0.1, state.energy - 0.05), // Conspire energy drain
                  last_online_at: new Date().toISOString()
                })
                .eq("persona_id", persona.id);
            }

            // Record Decision Trace
            await supabaseAdmin!.from("simulation_decision_logs").insert({
              tick: 0,
              persona_id: persona.id,
              action_type: "COMMENT",
              target_id: job.payload.post_id,
              decision_trace: { engagement: "high", reason: "Interest triggered response" },
              internal_thought: intent.internalThought
            });
          } catch (commentErr: any) {
            logger.warn(`Skipping comment for @${persona.username} on post ${targetId}: ${commentErr.message}`);
          }
        }
      }

      if (job.action_type === "POST") {
        const profileName = job.payload?.profile_name || "standard";
        await ContentEngineService.generateAndPublishPost(persona.id, profileName);
      }

      if (job.action_type === "GREET_SIMPLE" || job.action_type === "GREET_PROFILE") {
        const humanUserId = job.payload?.human_user_id;
        const opportunityId = job.payload?.opportunity_id;
        if (!humanUserId) {
          logger.warn(`Skipping greeting job ${job.id} due to missing human_user_id.`);
          await supabaseAdmin!.from("behavior_jobs").update({ status: "done" }).eq("id", job.id);
          return;
        }

        // Helper for typing duration
        const getTypingDurationMs = (content: string) => {
          const len = content.length;
          if (len < 20) return Math.random() * 1000 + 1000;
          if (len < 60) return Math.random() * 2000 + 2000;
          return Math.random() * 2000 + 4000;
        };

        // 1. Verify friendship still exists and is accepted
        const { data: friendship } = await supabaseAdmin!
          .from("friendships")
          .select("status")
          .or(`and(requester_id.eq.${persona.user_id},addressee_id.eq.${humanUserId}),and(requester_id.eq.${humanUserId},addressee_id.eq.${persona.user_id})`)
          .maybeSingle();

        if (!friendship || friendship.status !== "accepted") {
          logger.info(`Cancelling greeting job ${job.id} - users are no longer accepted friends.`);
          await supabaseAdmin!.from("behavior_jobs").update({ status: "done" }).eq("id", job.id);
          return;
        }

        // 2. Check if a chat already exists, and if human has sent any message
        const { data: participants } = await supabaseAdmin!
          .from("chat_participants")
          .select("chat_id")
          .eq("user_id", persona.user_id);
        
        let existingChatId: string | null = null;
        if (participants && participants.length > 0) {
          const chatIds = participants.map((p: any) => p.chat_id);
          const { data: match } = await supabaseAdmin!
            .from("chat_participants")
            .select("chat_id")
            .in("chat_id", chatIds)
            .eq("user_id", humanUserId)
            .limit(1)
            .maybeSingle();
          if (match) {
            existingChatId = match.chat_id;
          }
        }

        if (existingChatId) {
          const { count } = await supabaseAdmin!
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("chat_id", existingChatId)
            .eq("sender_id", humanUserId);

          if (count && count > 0) {
            logger.info(`Cancelling greeting job ${job.id} - human user ${humanUserId} already sent messages in chat.`);
            await supabaseAdmin!.from("behavior_jobs").update({ status: "done" }).eq("id", job.id);
            return;
          }
        }

        // 3. Sleeping check
        let timezoneOffset = 0;
        if (persona.timezone === "EST") timezoneOffset = -5;
        else if (persona.timezone === "PST") timezoneOffset = -8;
        else if (persona.timezone === "GMT") timezoneOffset = 0;
        else if (persona.timezone === "CET") timezoneOffset = 1;
        else if (persona.timezone === "AEST") timezoneOffset = 10;
        else if (persona.timezone === "SGT") timezoneOffset = 8;

        const localHour = (new Date().getUTCHours() + timezoneOffset + 24) % 24;
        const isAwake = localHour >= 7 && localHour <= 23;
        if (!isAwake) {
          const tomorrow = new Date();
          tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
          const targetUtcHour = (7 + 24 - timezoneOffset) % 24;
          tomorrow.setUTCHours(targetUtcHour, 30, 0, 0);
          
          logger.info(`@${persona.username} is sleeping. Rescheduling greeting job ${job.id} to ${tomorrow.toISOString()}`);
          await supabaseAdmin!
            .from("behavior_jobs")
            .update({ run_at: tomorrow.toISOString() })
            .eq("id", job.id);
          return;
        }

        // 3.5 Check daily DM budget revalidation
        const { data: stateData } = await supabaseAdmin!
          .from("persona_states")
          .select("today_dm_count, today_dm_budget")
          .eq("persona_id", persona.id)
          .single();

        if (stateData) {
          const todayDmCount = stateData.today_dm_count || 0;
          const todayDmBudget = stateData.today_dm_budget || 5;
          if (todayDmCount >= todayDmBudget) {
            const tomorrow = new Date();
            tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
            tomorrow.setUTCHours(9, 0, 0, 0); // Reschedule to tomorrow morning 9 AM UTC
            logger.info(`Rescheduling greeting job ${job.id} - @${persona.username} has reached daily DM budget (${todayDmCount}/${todayDmBudget}).`);
            await supabaseAdmin!
              .from("behavior_jobs")
              .update({ run_at: tomorrow.toISOString(), status: "pending" })
              .eq("id", job.id);
            return;
          }
        }

        // 4. Create or obtain direct chat
        let chatId = existingChatId;
        if (!chatId) {
          const chatRes = await ChatService.createChat({
            context_type: "direct",
            creator_id: persona.user_id as UUID,
            is_group_chat: false
          }, [humanUserId]);
          chatId = chatRes.chat.id;
        }

        // 5. Generate message content
        let greetingText = "";
        if (job.action_type === "GREET_SIMPLE") {
          const simpleGreetings = [
            `hey! thanks for connecting. how's it going?`,
            `hey, thanks for the add! what are you up to?`,
            `hi there! nice to connect. what do you do?`,
            `hey! good to have you in my network. been busy?`
          ];
          greetingText = simpleGreetings[Math.floor(Math.random() * simpleGreetings.length)];
        } else {
          const { data: profile } = await supabaseAdmin!
            .from("profiles")
            .select("occupation")
            .eq("user_id", humanUserId)
            .maybeSingle();
          const profession = profile?.occupation || "";
          
          let instructionPrompt = "Become friends with them. Say hi and ask a natural question about their background or profession.";
          if (profession) {
            instructionPrompt = `Become friends with them. Say hi and ask a brief, natural question related to their work/profession as a ${profession}.`;
          }

          const promptOverride = [
            { 
              sender_username: persona.username,
              content: `[System Action: Initiate chat with new friend. Instruction: ${instructionPrompt}]`,
              is_me: true
            }
          ];

          const result = await LlmRendererService.renderChatMessage(
            persona,
            promptOverride,
            undefined,
            [],
            0
          );
          
          if (!result || !result.content) {
            throw new Error("LlmRenderer failed to generate chat greeting or returned empty content.");
          }
          
          greetingText = result.content;
        }

        // 6. Typing Simulation and Broadcast
        const io = getIO();
        const humanSocketIds = getUserSocketIds(humanUserId);

        if (io && humanSocketIds.length > 0) {
          const typingPayload = { chatId, userId: persona.user_id, name: persona.username, isTyping: true, timestamp: new Date() };
          humanSocketIds.forEach(sid => io.to(sid).emit("chat:typing", typingPayload));
          await new Promise(resolve => setTimeout(resolve, getTypingDurationMs(greetingText)));
          humanSocketIds.forEach(sid => io.to(sid).emit("chat:typing", { ...typingPayload, isTyping: false }));
        }

        const message = await EnhancedMessageService.createMessage({
          chat_id: chatId as UUID,
          sender_id: persona.user_id as UUID,
          content: greetingText
        } as any);

        // 7. Update fatigue stats and interaction metadata
        const { InteractionStatsService } = require("./interactionStats.service");
        await InteractionStatsService.recordDm(humanUserId, persona.user_id);

        // Update daily DM count and consume energy
        const { data: pState } = await supabaseAdmin!
          .from("persona_states")
          .select("today_dm_count, energy")
          .eq("persona_id", persona.id)
          .single();

        if (pState) {
          await supabaseAdmin!
            .from("persona_states")
            .update({
              today_dm_count: (pState.today_dm_count || 0) + 1,
              energy: Math.max(0.1, pState.energy - 0.05),
              last_online_at: new Date().toISOString()
            })
            .eq("persona_id", persona.id);
        }

        await AiBehaviorService.broadcastMessage(humanUserId, chatId, persona.user_id, persona.username, greetingText, message);
        logger.info(`✅ Executed greeting job (${job.action_type}) for @${persona.username} -> Human ${humanUserId}`);
      }

      if (job.action_type === "REACT") {
        const humanUserId = job.payload?.human_user_id;
        if (!humanUserId) {
          logger.warn(`Skipping REACT job ${job.id} due to missing human_user_id.`);
          await supabaseAdmin!.from("behavior_jobs").update({ status: "done" }).eq("id", job.id);
          return;
        }

        // 1. Verify friendship still exists and is accepted
        const { data: friendship } = await supabaseAdmin!
          .from("friendships")
          .select("status")
          .or(`and(requester_id.eq.${persona.user_id},addressee_id.eq.${humanUserId}),and(requester_id.eq.${humanUserId},addressee_id.eq.${persona.user_id})`)
          .maybeSingle();

        if (!friendship || friendship.status !== "accepted") {
          logger.info(`Cancelling REACT job ${job.id} - users are no longer accepted friends.`);
          await supabaseAdmin!.from("behavior_jobs").update({ status: "done" }).eq("id", job.id);
          return;
        }

        // 2. Fetch the latest post by the human user
        const { data: latestPosts } = await supabaseAdmin!
          .from("posts")
          .select("id")
          .eq("user_id", humanUserId)
          .order("created_at", { ascending: false })
          .limit(1);

        if (latestPosts && latestPosts.length > 0) {
          const postId = latestPosts[0].id;
          
          // Check if already reacted
          const { data: existingReaction } = await supabaseAdmin!
            .from("reactions")
            .select("id")
            .eq("target_id", postId)
            .eq("user_id", persona.user_id)
            .eq("reaction_type", "like")
            .maybeSingle();

          if (!existingReaction) {
            await ReactionService.createReaction({
              target_id: postId as UUID,
              user_id: persona.user_id as UUID,
              target_type: TargetType.POST,
              reaction_type: ReactionType.LIKE,
            });
            logger.info(`@${persona.username} liked latest post ${postId} of new friend ${humanUserId} as a gesture.`);
            await SimulationEngine.applyFeedbackToPostAuthor(postId, "like");
          }
        } else {
          logger.info(`REACT job ${job.id}: human ${humanUserId} has no posts. Skipping react action.`);
        }
      }

      // Set status to done
      await supabaseAdmin!
        .from("behavior_jobs")
        .update({ status: "done" })
        .eq("id", job.id);

    } catch (err: any) {
      logger.error(`Failed to process behavior job ${job.id}: ${err.message}`);
      const attempts = (job.attempts || 0) + 1;
      const maxAttempts = 3;
      
      let status = "pending";
      let nextRunAt = new Date();

      if (attempts >= maxAttempts) {
        status = "failed";
      } else {
        // Exponential backoff retry: 2m, 5m, 15m
        const delayMinutes = attempts === 1 ? 2 : attempts === 2 ? 5 : 15;
        nextRunAt = new Date(Date.now() + delayMinutes * 60000);
      }

      await supabaseAdmin!
        .from("behavior_jobs")
        .update({
          status,
          attempts,
          last_error: err.message,
          run_at: nextRunAt.toISOString()
        })
        .eq("id", job.id);
    }
  }

  /**
   * Run hourly decays on energy levels, social memory, and relationships familiarity
   */
  private static async runDynamicDecays(): Promise<void> {
    try {
      // Restore energy levels by 0.02 every cycle, capped at 1.0
      const { data: states } = await supabaseAdmin!
        .from("persona_states")
        .select("persona_id, energy");

      if (states) {
        for (const st of states) {
          const nextEnergy = Math.min(1.0, st.energy + 0.02);
          await supabaseAdmin!
            .from("persona_states")
            .update({ energy: nextEnergy })
            .eq("persona_id", st.persona_id);
        }
      }

      // Reset daily counts and plan budgets at midnight (once per real-world calendar day in UTC)
      const todayDate = new Date().toISOString().split("T")[0];

      const { data: clock } = await supabaseAdmin!
        .from("simulation_state")
        .select("id, last_budget_reset_date")
        .single();

      if (clock && clock.last_budget_reset_date !== todayDate) {
        logger.info(`New real-world day reached: ${todayDate}. Resetting daily budgets and counts for all personas.`);
        
        await supabaseAdmin!
          .from("simulation_state")
          .update({ last_budget_reset_date: todayDate })
          .eq("id", clock.id);

        const { data: statesList } = await supabaseAdmin!
          .from("persona_states")
          .select("persona_id");

        if (statesList) {
          for (const st of statesList) {
            const roll = Math.random();
            const budget = roll < 0.50 ? 3 : 4;
            const dmBudget = roll < 0.50 ? 5 : 6;

            await supabaseAdmin!
              .from("persona_states")
              .update({
                today_post_count: 0,
                today_comment_count: 0,
                today_dm_count: 0,
                today_post_budget: budget,
                today_dm_budget: dmBudget
              })
              .eq("persona_id", st.persona_id);
          }
        }
      }
    } catch (err: any) {
      logger.error(`Failed to run metric decays: ${err.message}`);
    }
  }

  /**
   * Feedback Engine: Update author energy and reputation based on engagement feedback (likes/comments)
   */
  private static async applyFeedbackToPostAuthor(postId: string, feedbackType: "like" | "comment"): Promise<void> {
    try {
      const { data: post } = await supabaseAdmin!
        .from("posts")
        .select("user_id")
        .eq("id", postId)
        .single();

      if (!post || !post.user_id) return;

      const { data: persona } = await supabaseAdmin!
        .from("persona_identities")
        .select("id")
        .eq("user_id", post.user_id)
        .maybeSingle();

      if (!persona) return; // Not an AI persona, skip

      const { data: rep } = await supabaseAdmin!
        .from("persona_reputations")
        .select("*")
        .eq("persona_id", persona.id)
        .maybeSingle();

      const { data: state } = await supabaseAdmin!
        .from("persona_states")
        .select("energy")
        .eq("persona_id", persona.id)
        .maybeSingle();

      const energyDelta = feedbackType === "like" ? 0.02 : 0.05;
      const repDelta = feedbackType === "like" ? 0.005 : 0.01;

      if (state) {
        await supabaseAdmin!
          .from("persona_states")
          .update({
            energy: Math.min(1.0, state.energy + energyDelta)
          })
          .eq("persona_id", persona.id);
      }

      if (rep) {
        await supabaseAdmin!
          .from("persona_reputations")
          .update({
            technical_credibility: Math.min(1.0, rep.technical_credibility + repDelta),
            helpfulness: Math.min(1.0, rep.helpfulness + repDelta)
          })
          .eq("persona_id", persona.id);
      }

      logger.info(`Feedback Engine applied ${feedbackType} to author @${persona.id}: +${energyDelta} energy, +${repDelta} reputation.`);
    } catch (err: any) {
      logger.error(`Failed to apply feedback to post author: ${err.message}`);
    }
  }
}
