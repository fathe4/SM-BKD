// src/services/simulation/behaviorScheduler.service.ts
import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";
import { BehaviorContext } from "./behaviorContext.builder";
import { DecisionResult } from "./behaviorDecision.engine";

export class BehaviorScheduler {
  /**
   * Calculate delay based on persona extroversion, local hour, and current activity
   */
  static calculateDelayMs(ctx: BehaviorContext): number {
    const extroversion = ctx.persona.personality_json?.extroversion ?? 0.5;
    
    // 1. Determine base delay range based on extroversion (in ms)
    let baseDelayMs = 0;
    if (extroversion > 0.7) {
      // Outgoing: 20s to 2m
      baseDelayMs = Math.random() * (120000 - 20000) + 20000;
    } else if (extroversion < 0.3) {
      // Introverted: 12h to 24h
      baseDelayMs = Math.random() * (24 * 3600000 - 12 * 3600000) + 12 * 3600000;
    } else {
      // Normal: 5m to 30m
      baseDelayMs = Math.random() * (30 * 60000 - 5 * 60000) + 5 * 60000;
    }

    // 2. Adjust delay based on current activity / sleep schedule
    if (ctx.activity === "SLEEPING") {
      // Calculate hours to 7 AM wake up
      let hoursToWake = 0;
      if (ctx.localHour >= 23) {
        hoursToWake = (24 - ctx.localHour) + 7;
      } else {
        hoursToWake = 7 - ctx.localHour;
      }
      
      // Delay = time to wake up + base delay + random waking startup buffer (15m to 45m)
      const wakeBufferMs = hoursToWake * 3600000;
      const startupBufferMs = Math.random() * (45 * 60000 - 15 * 60000) + 15 * 60000;
      logger.info(`Scheduler: AI @${ctx.persona.username} is sleeping. Postponing job until morning (${hoursToWake.toFixed(1)}h sleep delay + ${Math.round(startupBufferMs/60000)}m morning startup buffer)`);
      return wakeBufferMs + startupBufferMs;
    } 
    
    if (ctx.activity === "WORKING") {
      // Working: add a busy delay offset (45m to 3h) to simulate being offline/busy
      const workBusyDelayMs = Math.random() * (180 * 60000 - 45 * 60000) + 45 * 60000;
      logger.info(`Scheduler: AI @${ctx.persona.username} is working. Adding busy work-hour delay offset of ${Math.round(workBusyDelayMs/60000)}m`);
      return baseDelayMs + workBusyDelayMs;
    }

    // RELAXING: use base delay as is
    return baseDelayMs;
  }

  /**
   * Schedule the chosen action in the behavior_jobs table
   */
  static async schedule(
    ctx: BehaviorContext,
    decisionResult: DecisionResult,
    opportunityId: string
  ): Promise<void> {
    try {
      // 1. Record behavior decision to behavior_decisions table
      let delayMs = this.calculateDelayMs(ctx);
      if (ctx.opportunity?.type === "FRIEND_ACCEPTED") {
        // Guarantee quick response (10s to 120s) for newly accepted friendship chat greetings
        delayMs = Math.random() * (120000 - 10000) + 10000;
        logger.info(`Scheduler: Overriding delay to ${(delayMs / 1000).toFixed(0)}s for FRIEND_ACCEPTED greeting job.`);
      }
      const runAt = new Date(Date.now() + delayMs);

      const { data: decisionRow, error: decError } = await supabaseAdmin!
        .from("behavior_decisions")
        .insert({
          opportunity_id: opportunityId,
          decision: decisionResult.decision,
          probability_score: decisionResult.score,
          reason: decisionResult.reason,
          scheduled_at: runAt.toISOString(),
          algorithm_version: decisionResult.algorithm_version,
          context_snapshot: decisionResult.context_snapshot
        })
        .select()
        .single();

      if (decError) throw decError;

      // 2. Insert into behavior_jobs if not IGNORE
      if (decisionResult.decision !== "IGNORE") {
        // Enqueue immutable snapshot context data in job payload
        const payload = {
          humanId: ctx.human.id,
          human_user_id: ctx.human.id, // For backward compatibility with existing worker
          personaId: ctx.persona.id,
          relationshipStage: ctx.relationshipStage,
          decision: decisionResult.decision,
          reason: decisionResult.reason,
          opportunityId: opportunityId,
          opportunity_id: opportunityId, // For backward compatibility with existing worker
          opportunity_type: ctx.opportunity?.type || null,
          decisionId: decisionRow.id
        };

        const { error: jobError } = await supabaseAdmin!
          .from("behavior_jobs")
          .insert({
            persona_id: ctx.persona.id,
            action_type: decisionResult.decision,
            payload,
            run_at: runAt.toISOString(),
            status: "pending",
            attempts: 0,
            priority: 8
          });

        if (jobError) throw jobError;
        logger.info(`📅 Scheduled ${decisionResult.decision} behavior job for @${ctx.persona.username} to run at ${runAt.toISOString()} (in ${Math.round(delayMs / 60000)} minutes)`);
      } else {
        logger.info(`Planner: Decision was IGNORE. No job enqueued for @${ctx.persona.username} -> Human ${ctx.human.username}`);
      }
    } catch (err: any) {
      logger.error(`Scheduler: Failed to schedule decision: ${err.message}`);
    }
  }
}
