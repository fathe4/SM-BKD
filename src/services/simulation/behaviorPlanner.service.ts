// src/services/simulation/behaviorPlanner.service.ts
import { domainEvents } from "../../events/domainEvents";
import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";
import { BehaviorContextBuilder } from "./behaviorContext.builder";
import { BehaviorDecisionEngine } from "./behaviorDecision.engine";
import { BehaviorScheduler } from "./behaviorScheduler.service";

export class BehaviorPlannerService {
  /**
   * Initialize and register the event listeners for AI behaviors
   */
  static init() {
    logger.info("Initializing AI Behavior Planner Event Listeners...");
    domainEvents.on("FRIENDSHIP_ACCEPTED", async (payload) => {
      try {
        await this.handleFriendshipAccepted(payload);
      } catch (err: any) {
        logger.error(`Error in FRIENDSHIP_ACCEPTED listener: ${err.message}`);
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

    // 4. Schedule the action
    await BehaviorScheduler.schedule(context, decision, opportunity.id);
  }
}
