// src/services/simulation/behaviorContext.builder.ts
import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";
import { InteractionStatsService } from "./interactionStats.service";
import { RelationshipService } from "./relationship.service";

export interface BehaviorContext {
  persona: {
    id: string;
    user_id: string;
    username: string;
    timezone: string;
    personality_json: any;
    writing_style: any;
    energy: number;
    today_dm_count: number;
    today_dm_budget: number;
  };
  human: {
    id: string;
    username: string;
  };
  opportunity: {
    type: string;
    context: any;
  };
  relationshipStage: string;
  interactionsCount: number;
  interactionStats: {
    firstAiDmAt: string | null;
    lastAiDmAt: string | null;
    lastAiGreetingAt: string | null;
    totalAiDms: number;
    lastAiSenderId: string | null;
  };
  dailyBudgetRemaining: number;
  localHour: number;
  activity: "SLEEPING" | "WORKING" | "RELAXING";
}

export class BehaviorContextBuilder {
  /**
   * Assemble the behavior context for a given persona, human, and opportunity
   */
  static async build(params: {
    personaId: string;
    humanId: string;
    opportunity: { type: string; context: any };
  }): Promise<BehaviorContext | null> {
    try {
      const { personaId, humanId, opportunity } = params;

      // 1. Fetch persona identity and state
      const { data: persona, error: personaError } = await supabaseAdmin!
        .from("persona_identities")
        .select(`
          id,
          user_id,
          username,
          timezone,
          personality_json,
          writing_style,
          persona_states!inner(energy, today_dm_count, today_dm_budget)
        `)
        .eq("id", personaId)
        .single();

      if (personaError || !persona) {
        logger.error(`ContextBuilder: Failed to fetch persona ${personaId}: ${personaError?.message}`);
        return null;
      }

      // 2. Fetch human basic profile
      const { data: human, error: humanError } = await supabaseAdmin!
        .from("users")
        .select("id, username")
        .eq("id", humanId)
        .single();

      if (humanError || !human) {
        logger.error(`ContextBuilder: Failed to fetch human user ${humanId}: ${humanError?.message}`);
        return null;
      }

      // 3. Fetch relationship stage
      const rel = await RelationshipService.getOrCreateRelationship(humanId, personaId);

      // 4. Fetch interaction stats
      const stats = await InteractionStatsService.getStats(humanId);
      const interactionStats = {
        firstAiDmAt: stats?.first_ai_dm_at || null,
        lastAiDmAt: stats?.last_ai_dm_at || null,
        lastAiGreetingAt: stats?.last_ai_greeting_at || null,
        totalAiDms: stats?.total_ai_dms || 0,
        lastAiSenderId: stats?.last_ai_sender_id || null
      };

      // 5. Calculate local hour and current activity based on timezone
      let timezoneOffset = 0;
      const tz = persona.timezone || "UTC";
      if (tz === "EST") timezoneOffset = -5;
      else if (tz === "PST") timezoneOffset = -8;
      else if (tz === "GMT") timezoneOffset = 0;
      else if (tz === "CET") timezoneOffset = 1;
      else if (tz === "AEST") timezoneOffset = 10;
      else if (tz === "SGT") timezoneOffset = 8;

      const date = new Date();
      const localHour = (date.getUTCHours() + timezoneOffset + 24) % 24;
      const localDay = date.getUTCDay(); // 0 = Sunday, 6 = Saturday

      // Determine activity
      let activity: "SLEEPING" | "WORKING" | "RELAXING" = "RELAXING";
      if (localHour < 7 || localHour >= 23) {
        activity = "SLEEPING";
      } else if (localHour >= 9 && localHour < 17 && localDay !== 0 && localDay !== 6) {
        activity = "WORKING";
      }

      // 6. Calculate budget
      const stateList = persona.persona_states as any;
      const state = Array.isArray(stateList) ? stateList[0] : stateList;
      const todayDmCount = state?.today_dm_count || 0;
      const todayDmBudget = state?.today_dm_budget || 5;
      const dailyBudgetRemaining = Math.max(0, todayDmBudget - todayDmCount);

      return {
        persona: {
          id: persona.id,
          user_id: persona.user_id,
          username: persona.username,
          timezone: tz,
          personality_json: persona.personality_json || {},
          writing_style: persona.writing_style || {},
          energy: state?.energy ?? 1.0,
          today_dm_count: todayDmCount,
          today_dm_budget: todayDmBudget
        },
        human: {
          id: human.id,
          username: human.username
        },
        opportunity,
        relationshipStage: rel.stage || "UNKNOWN",
        interactionsCount: rel.interactions_count || 0,
        interactionStats,
        dailyBudgetRemaining,
        localHour,
        activity
      };
    } catch (err: any) {
      logger.error(`ContextBuilder: Unexpected error assembling context: ${err.message}`);
      return null;
    }
  }
}
