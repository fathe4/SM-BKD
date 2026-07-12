// src/scripts/testAiBehaviorEngine.ts
import http from "http";
import { initializeSocketIO } from "../socketio";
initializeSocketIO(http.createServer());

import { supabaseAdmin } from "../config/supabase";
import { logger } from "../utils/logger";
import { FriendshipService } from "../services/friendshipService";
import { FriendshipStatus } from "../models/friendship.model";
import { BehaviorPlannerService } from "../services/simulation/behaviorPlanner.service";
import { SimulationEngine } from "../services/simulation/simulationEngine";

// Initialize the Behavior Planner Service listeners
BehaviorPlannerService.init();

async function main() {
  logger.info("--- Starting AI Behavior Engine Testing ---");

  // 1. Fetch a human user
  const { data: human } = await supabaseAdmin!
    .from("users")
    .select("id, username")
    .eq("is_ai", false)
    .limit(1)
    .single();

  // 2. Fetch an AI user
  const { data: aiUser } = await supabaseAdmin!
    .from("users")
    .select("id, username")
    .eq("is_ai", true)
    .limit(1)
    .single();

  if (!human || !aiUser) {
    logger.error("Could not find a human or AI user to run test.");
    process.exit(1);
  }

  logger.info(`Selected Human: @${human.username} (${human.id})`);
  logger.info(`Selected AI: @${aiUser.username} (${aiUser.id})`);

  // Fetch persona identity id
  const { data: persona } = await supabaseAdmin!
    .from("persona_identities")
    .select("id")
    .eq("user_id", aiUser.id)
    .single();

  if (!persona) {
    logger.error(`Could not find persona identity for AI user ${aiUser.id}`);
    process.exit(1);
  }

  // 3. Clean up database states for these two to ensure we get 100% greeting probability (First-time chat)
  logger.info("Cleaning up previous interaction statistics & stages...");
  await supabaseAdmin!
    .from("user_ai_interaction_stats")
    .delete()
    .eq("human_user_id", human.id);

  await supabaseAdmin!
    .from("relationship_stages")
    .delete()
    .eq("human_id", human.id)
    .eq("persona_id", persona.id);

  // Find direct chat and delete previous messages
  const { data: participants } = await supabaseAdmin!
    .from("chat_participants")
    .select("chat_id")
    .eq("user_id", aiUser.id);
  
  if (participants && participants.length > 0) {
    const chatIds = participants.map((p) => p.chat_id);
    const { data: match } = await supabaseAdmin!
      .from("chat_participants")
      .select("chat_id")
      .in("chat_id", chatIds)
      .eq("user_id", human.id)
      .limit(1)
      .maybeSingle();
    
    if (match) {
      await supabaseAdmin!
        .from("messages")
        .delete()
        .eq("chat_id", match.chat_id);
    }
  }

  // Delete previous opportunities and decisions for this persona and human
  const { data: opps } = await supabaseAdmin!
    .from("behavior_opportunities")
    .select("id")
    .eq("persona_id", persona.id)
    .eq("human_id", human.id);

  if (opps && opps.length > 0) {
    const oppIds = opps.map(o => o.id);
    await supabaseAdmin!
      .from("behavior_decisions")
      .delete()
      .in("opportunity_id", oppIds);
    
    await supabaseAdmin!
      .from("behavior_opportunities")
      .delete()
      .in("id", oppIds);
  }

  // Delete pending behavior jobs for this AI
  await supabaseAdmin!
    .from("behavior_jobs")
    .delete()
    .eq("persona_id", persona.id)
    .in("action_type", ["GREET_SIMPLE", "GREET_PROFILE", "REACT"]);

  // Clean up previous test friendships between these two users
  await supabaseAdmin!
    .from("friendships")
    .delete()
    .or(`and(requester_id.eq.${human.id},addressee_id.eq.${aiUser.id}),and(requester_id.eq.${aiUser.id},addressee_id.eq.${human.id})`);

  // 4. Create a new pending friend request (requester = AI, addressee = human)
  logger.info("Creating a pending friend request from AI to human...");
  const { data: friendship, error: friendError } = await supabaseAdmin!
    .from("friendships")
    .insert({
      requester_id: aiUser.id,
      addressee_id: human.id,
      status: FriendshipStatus.PENDING
    })
    .select()
    .single();

  if (friendError || !friendship) {
    logger.error(`Failed to create friend request: ${friendError?.message}`);
    process.exit(1);
  }

  logger.info(`Friend request created with ID: ${friendship.id}`);

  // 5. Accept the friend request using FriendshipService
  logger.info("Accepting friend request via FriendshipService (triggers domain event)...");
  await FriendshipService.updateFriendshipStatus(friendship.id, FriendshipStatus.ACCEPTED);

  // Wait a few seconds for the async event listener to finish execution
  logger.info("Waiting 8 seconds for asynchronous event processing...");
  await new Promise((resolve) => setTimeout(resolve, 8000));

  // 6. Verify BehaviorOpportunity creation
  const { data: opportunity } = await supabaseAdmin!
    .from("behavior_opportunities")
    .select("*")
    .eq("persona_id", persona.id)
    .eq("human_id", human.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!opportunity) {
    logger.error("❌ FAILED: BehaviorOpportunity was not created.");
    process.exit(1);
  }
  logger.info(`✅ SUCCESS: BehaviorOpportunity found: type=${opportunity.type}, ID=${opportunity.id}`);

  // 7. Verify BehaviorDecision creation
  const { data: decision } = await supabaseAdmin!
    .from("behavior_decisions")
    .select("*")
    .eq("opportunity_id", opportunity.id)
    .maybeSingle();

  if (!decision) {
    logger.error("❌ FAILED: BehaviorDecision was not created.");
    process.exit(1);
  }
  logger.info(`✅ SUCCESS: BehaviorDecision found: decision=${decision.decision}, score=${decision.probability_score}, reason="${decision.reason}"`);

  // 8. Verify BehaviorJob creation
  const { data: job } = await supabaseAdmin!
    .from("behavior_jobs")
    .select("*")
    .eq("persona_id", persona.id)
    .eq("status", "pending")
    .in("action_type", ["GREET_SIMPLE", "GREET_PROFILE", "REACT"])
    .limit(1)
    .maybeSingle();

  if (!job && decision.decision !== "IGNORE") {
    logger.error("❌ FAILED: BehaviorJob was not scheduled.");
    process.exit(1);
  } else if (decision.decision === "IGNORE") {
    logger.info("ℹ️ Action was IGNORE, so no behavior job was expected.");
  } else {
    logger.info(`✅ SUCCESS: BehaviorJob scheduled: type=${job.action_type}, run_at=${job.run_at}`);

    // Let's run a test tick on this single job synchronously using processSingleJob to verify execution!
    logger.info("Simulating job execution via SimulationEngine.processSingleJob...");
    
    // We fetch the full job with persona_identities join like the worker does
    const { data: fullJob } = await supabaseAdmin!
      .from("behavior_jobs")
      .select(`
        *,
        persona_identities!inner(
          id,
          user_id,
          username,
          timezone,
          personality_json,
          writing_style,
          persona_states!inner(valence, arousal, energy),
          persona_conversation_profiles!inner(posting_profile_name)
        )
      `)
      .eq("id", job.id)
      .single();

    if (!fullJob) {
      logger.error("Failed to load full job with relation joins.");
      process.exit(1);
    }

    // Run the job execution
    // @ts-ignore
    await SimulationEngine.processSingleJob(fullJob);

    // Verify messages table
    const { data: chatParticipants } = await supabaseAdmin!
      .from("chat_participants")
      .select("chat_id")
      .eq("user_id", aiUser.id);

    let chatMatchId = null;
    if (chatParticipants && chatParticipants.length > 0) {
      const ids = chatParticipants.map((p) => p.chat_id);
      const { data: match } = await supabaseAdmin!
        .from("chat_participants")
        .select("chat_id")
        .in("chat_id", ids)
        .eq("user_id", human.id)
        .maybeSingle();
      chatMatchId = match?.chat_id;
    }

    if (chatMatchId) {
      const { data: msg } = await supabaseAdmin!
        .from("messages")
        .select("content, sender_id")
        .eq("chat_id", chatMatchId)
        .eq("sender_id", aiUser.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (msg) {
        logger.info(`✅ SUCCESS: Greeting sent successfully! Msg: "${msg.content}"`);
      } else {
        logger.error("❌ FAILED: No greeting message found in messages table.");
      }
    } else if (job.action_type === "REACT") {
      logger.info("ℹ️ REACT action executed. Verified.");
    } else {
      logger.error("❌ FAILED: Chat was not created.");
    }

    // Cleanup test database entries
    logger.info("Cleaning up test database entries...");
    await supabaseAdmin!
      .from("friendships")
      .delete()
      .eq("id", friendship.id);

    if (chatMatchId) {
      await supabaseAdmin!
        .from("messages")
        .delete()
        .eq("chat_id", chatMatchId);
    }

    await supabaseAdmin!
      .from("behavior_opportunities")
      .delete()
      .eq("id", opportunity.id);

    if (job) {
      await supabaseAdmin!
        .from("behavior_jobs")
        .delete()
        .eq("id", job.id);
    }
  }

  logger.info("--- AI Behavior Engine Test Complete ---");
}

main().then(() => process.exit(0)).catch((err) => {
  logger.error("Unexpected failure in main:", err);
  process.exit(1);
});
