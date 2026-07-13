// src/services/simulation/behaviorPlanner.service.ts
import { domainEvents } from "../../events/domainEvents";
import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";
import { BehaviorContextBuilder } from "./behaviorContext.builder";
import { BehaviorDecisionEngine } from "./behaviorDecision.engine";
import { BehaviorScheduler } from "./behaviorScheduler.service";

export class BehaviorPlannerService {
  static init() {
    logger.info("Initializing AI Behavior Planner Event Listeners...");
    domainEvents.on("FRIENDSHIP_ACCEPTED", async (payload) => {
      try {
        await this.handleFriendshipAccepted(payload);
      } catch (err: any) {
        logger.error(`Error in FRIENDSHIP_ACCEPTED listener: ${err.message}`);
      }
    });

    domainEvents.on("POST_CREATED", async (payload) => {
      try {
        await this.handlePostCreated(payload);
      } catch (err: any) {
        logger.error(`Error in POST_CREATED listener: ${err.message}`);
      }
    });
  }

  /**
   * Handle the FRIENDSHIP_ACCEPTED domain event
   */
  private static async handleFriendshipAccepted(payload: { requesterId: string; addresseeId: string; friendshipId: string }) {
    const { requesterId, addresseeId, friendshipId } = payload;
    logger.info(`BehaviorPlanner: handling friendship accepted event for friendship ${friendshipId}`);

    // Check if requester (AI) and addressee (human)
    const { data: requesterUser } = await supabaseAdmin!
      .from("users")
      .select("is_ai")
      .eq("id", requesterId)
      .single();

    const { data: addresseeUser } = await supabaseAdmin!
      .from("users")
      .select("is_ai")
      .eq("id", addresseeId)
      .single();

    const requesterIsAi = requesterUser?.is_ai || false;
    const addresseeIsAi = addresseeUser?.is_ai || false;

    // We only care if the requester (the one who sent the request) is an AI,
    // and the addressee (who accepted) is a human.
    if (!requesterIsAi || addresseeIsAi) {
      logger.info(`Friendship accepted event skipped (requester is not AI, or addressee is AI).`);
      return;
    }

    const aiUserId = requesterId;
    const humanUserId = addresseeId;

    // Fetch persona identity ID
    const { data: persona } = await supabaseAdmin!
      .from("persona_identities")
      .select("id")
      .eq("user_id", aiUserId)
      .single();

    if (!persona) {
      logger.error(`Failed to find persona identity for AI user ${aiUserId}`);
      return;
    }

    const personaId = persona.id;

    // 1. Create a BehaviorOpportunity record (idempotent / duplicate prevention)
    const { data: opportunity, error: oppError } = await supabaseAdmin!
      .from("behavior_opportunities")
      .insert({
        persona_id: personaId,
        human_id: humanUserId,
        type: "FRIEND_ACCEPTED",
        context: { 
          friendship_id: friendshipId,
          acceptedAt: new Date().toISOString(),
          mutualFriends: 0,
          friendshipAgeSeconds: 0
        }
      })
      .select()
      .single();

    if (oppError) {
      if (oppError.code === "23505") {
        logger.warn(`BehaviorPlanner: Skipping duplicate FRIEND_ACCEPTED opportunity for persona ${personaId} and human ${humanUserId}`);
        return;
      }
      logger.error(`Failed to create behavior opportunity: ${oppError.message}`);
      return;
    }

    if (!opportunity) return;

    // 2. Build behavior context
    const context = await BehaviorContextBuilder.build({
      personaId,
      humanId: humanUserId,
      opportunity: { type: "FRIEND_ACCEPTED", context: opportunity.context }
    });

    if (!context) {
      logger.error(`Failed to build behavior context for persona ${personaId} and human ${humanUserId}`);
      return;
    }

    // 3. Decide action using the decision engine
    const decision = await BehaviorDecisionEngine.decide(context);

    // Force a greeting action to guarantee "chat after friend request"
    if (decision.decision === "IGNORE" || decision.decision === "REACT") {
      decision.decision = Math.random() < 0.6 ? "GREET_PROFILE" : "GREET_SIMPLE";
      decision.reason = (decision.reason ? decision.reason + "; " : "") + "Forced greeting to guarantee chat after friend request";
    }

    // 4. Schedule the action
    await BehaviorScheduler.schedule(context, decision, opportunity.id);
  }

  /**
   * Handle the POST_CREATED domain event
   */
  private static async handlePostCreated(payload: { postId: string; authorId: string }) {
    const { postId, authorId } = payload;
    logger.info(`BehaviorPlanner: handling new post event for post ${postId} by author ${authorId}`);

    try {
      // 1. Verify if authorId is a human
      const { data: user, error: userError } = await supabaseAdmin!
        .from("users")
        .select("is_ai")
        .eq("id", authorId)
        .single();

      if (userError || !user) {
        logger.warn(`BehaviorPlanner: Failed to fetch author ${authorId} or author not found: ${userError?.message}`);
        return;
      }

      if (user.is_ai) {
        logger.info(`BehaviorPlanner: Author ${authorId} is an AI. Skipping human post engagement planning.`);
        return;
      }

      // 2. Ingest the post immediately into feed_candidates
      const { IngestionService } = require("./ingestion.service");
      const candidate = await IngestionService.ingestSinglePost(postId);
      if (!candidate) {
        logger.error(`BehaviorPlanner: Failed to ingest post ${postId} into feed_candidates.`);
        return;
      }

      // 3. Fetch all AI personas
      const { data: allPersonas, error: personasError } = await supabaseAdmin!
        .from("persona_identities")
        .select("id, user_id, username, personality_json");

      if (personasError || !allPersonas || allPersonas.length === 0) {
        logger.warn(`BehaviorPlanner: No AI personas found or error fetching personas: ${personasError?.message}`);
        return;
      }

      // Shuffle and pick a small random subset (e.g., 8 to 12 personas) to evaluate the post immediately.
      // This prevents a "swarm" of instant likes/comments from all 100 personas at once.
      // The rest of the personas will discover and interact with the post organically during their normal BROWSE/hourly runs.
      const shuffled = [...allPersonas].sort(() => Math.random() - 0.5);
      const immediateCount = Math.floor(Math.random() * 5) + 8; // 8 to 12 personas
      const personas = shuffled.slice(0, immediateCount);

      // 4. Let the engine decide on comments/likes for the subset of personas in parallel
      const { EtiquetteService } = require("./etiquette.service");
      let naturalFriendRequestScheduled = false;

      await Promise.all(personas.map(async (p) => {
        try {
          // Run natural Etiquette evaluateEngagement
          await EtiquetteService.evaluateEngagement(p.id, candidate);

          // Evaluate natural friend request decision
          const { FriendshipService } = require("../friendshipService");
          const friendship = await FriendshipService.getFriendshipBetweenUsers(p.user_id, authorId);
          if (!friendship) {
            const extroversion = p.personality_json?.extroversion ?? 0.5;
            const friendRoll = Math.random();
            // Extroverted personas have higher chance to initiate connection naturally (up to 15%)
            const friendChance = extroversion * 0.15;

            if (friendRoll < friendChance) {
              // Schedule FRIEND_REQUEST job
              const friendDelayMs = Math.random() * (540 * 1000 - 30 * 1000) + 30 * 1000; // 30s to 9m
              const friendRunAt = new Date(Date.now() + friendDelayMs).toISOString();

              await supabaseAdmin!
                .from("behavior_jobs")
                .insert({
                  persona_id: p.id,
                  action_type: "FRIEND_REQUEST",
                  payload: {
                    human_user_id: authorId
                  },
                  run_at: friendRunAt,
                  status: "pending",
                  priority: 8
                });
              logger.info(`🎲 @${p.username} naturally decided to send a friend request to human ${authorId} (scheduled at ${friendRunAt})`);
              naturalFriendRequestScheduled = true;
            }
          }
        } catch (err: any) {
          logger.error(`Error in parallel evaluation for persona @${p.username}: ${err.message}`);
        }
      }));

      // 5. Enforce fallback guarantees:
      // A. Guarantee at least 1 comment within 5 minutes
      const { count: commentJobCount } = await supabaseAdmin!
        .from("behavior_jobs")
        .select("id", { count: "exact", head: true })
        .eq("payload->>post_id", postId)
        .eq("action_type", "COMMENT")
        .eq("status", "pending");

      if ((commentJobCount || 0) === 0) {
        logger.info(`BehaviorPlanner: No persona naturally decided to comment. Enforcing fallback comment constraint.`);
        const randomCommentPersona = allPersonas[Math.floor(Math.random() * allPersonas.length)];
        const commentDelayMs = Math.random() * (270 * 1000 - 30 * 1000) + 30 * 1000;
        const commentRunAt = new Date(Date.now() + commentDelayMs).toISOString();

        const { error: fallbackCommentErr } = await supabaseAdmin!
          .from("behavior_jobs")
          .insert({
            persona_id: randomCommentPersona.id,
            action_type: "COMMENT",
            payload: {
              post_id: postId,
              target_user_id: authorId,
              candidate_id: candidate.id,
              is_guaranteed: true
            },
            run_at: commentRunAt,
            status: "pending",
            priority: 8
          });

        if (fallbackCommentErr) {
          logger.error(`Failed to schedule fallback comment job: ${fallbackCommentErr.message}`);
        } else {
          logger.info(`📅 Scheduled fallback comment on post ${postId} by @${randomCommentPersona.username} at ${commentRunAt}`);
        }
      } else {
        logger.info(`BehaviorPlanner: ${commentJobCount} comment job(s) naturally enqueued by the engine.`);
      }

      // B. Guarantee at least 1 friend request within 10 minutes
      // Check if any friend request job is already enqueued
      const { count: friendJobCount } = await supabaseAdmin!
        .from("behavior_jobs")
        .select("id", { count: "exact", head: true })
        .eq("payload->>human_user_id", authorId)
        .eq("action_type", "FRIEND_REQUEST")
        .eq("status", "pending");

      if ((friendJobCount || 0) === 0 && !naturalFriendRequestScheduled) {
        logger.info(`BehaviorPlanner: No persona naturally decided to connect. Enforcing fallback friend request constraint.`);
        
        let friendRequestPersona = null;
        const shuffledPersonas = [...allPersonas].sort(() => Math.random() - 0.5);
        const { FriendshipService } = require("../friendshipService");

        for (const p of shuffledPersonas) {
          const friendship = await FriendshipService.getFriendshipBetweenUsers(p.user_id, authorId);
          if (!friendship) {
            friendRequestPersona = p;
            break;
          }
        }

        if (friendRequestPersona) {
          const friendDelayMs = Math.random() * (540 * 1000 - 30 * 1000) + 30 * 1000;
          const friendRunAt = new Date(Date.now() + friendDelayMs).toISOString();

          const { error: fallbackFriendErr } = await supabaseAdmin!
            .from("behavior_jobs")
            .insert({
              persona_id: friendRequestPersona.id,
              action_type: "FRIEND_REQUEST",
              payload: {
                human_user_id: authorId,
                is_guaranteed: true
              },
              run_at: friendRunAt,
              status: "pending",
              priority: 8
            });

          if (fallbackFriendErr) {
            logger.error(`Failed to schedule fallback friend request: ${fallbackFriendErr.message}`);
          } else {
            logger.info(`📅 Scheduled fallback friend request to human ${authorId} by @${friendRequestPersona.username} at ${friendRunAt}`);
          }
        } else {
          logger.info(`BehaviorPlanner: All AI personas already have a friendship relationship or pending request with human ${authorId}.`);
        }
      } else {
        logger.info(`BehaviorPlanner: Friend request job already enqueued naturally.`);
      }

    } catch (err: any) {
      logger.error(`BehaviorPlanner: Unexpected error in handlePostCreated: ${err.message}`);
    }
  }
}
