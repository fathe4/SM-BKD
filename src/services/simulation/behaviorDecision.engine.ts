// src/services/simulation/behaviorDecision.engine.ts
import { BehaviorContext } from "./behaviorContext.builder";
import {
  DecisionFactor,
  FirstInteractionFactor,
  EnergyFactor,
  ExtroversionFactor,
  FatigueFactor,
  DailyBudgetFactor,
  GlobalCapFactor
} from "./behaviorDecision.factors";

export interface DecisionResult {
  decision: "GREET_SIMPLE" | "GREET_PROFILE" | "REACT" | "IGNORE";
  intent: "HIGH_INTERACTION" | "MEDIUM_INTERACTION" | "IGNORE";
  score: number;
  reason: string;
  algorithm_version: string;
  context_snapshot: any;
}

export class BehaviorDecisionEngine {
  private static factors: DecisionFactor[] = [
    new DailyBudgetFactor(),
    new FirstInteractionFactor(),
    new EnergyFactor(),
    new ExtroversionFactor(),
    new FatigueFactor(),
    new GlobalCapFactor()
  ];

  static async decide(ctx: BehaviorContext): Promise<DecisionResult> {
    const algorithm_version = "v2.0";
    let score = 30; // Base score
    const reasons: string[] = ["Base score = 30"];
    let vetoed = false;

    // Evaluate all factors
    for (const factor of this.factors) {
      const res = await factor.evaluate(ctx);
      score += res.score;
      if (res.reason) {
        reasons.push(res.reason);
      }
      if (res.veto) {
        vetoed = true;
      }
    }

    // Clamp score between 0 and 100
    score = Math.max(0, Math.min(100, score));

    // Build the context snapshot for debugging/observability
    const context_snapshot = {
      energy: ctx.persona.energy,
      extroversion: ctx.persona.personality_json?.extroversion ?? 0.5,
      relationshipStage: ctx.relationshipStage,
      dailyBudgetRemaining: ctx.dailyBudgetRemaining,
      lastAiGreetingHoursAgo: ctx.interactionStats.lastAiGreetingAt
        ? Number(((Date.now() - new Date(ctx.interactionStats.lastAiGreetingAt).getTime()) / (3600 * 1000)).toFixed(1))
        : null,
      activity: ctx.activity,
      localHour: ctx.localHour
    };

    // If vetoed or score too low, force IGNORE
    if (vetoed || score < 30) {
      return {
        decision: "IGNORE",
        intent: "IGNORE",
        score: vetoed ? 0 : score,
        reason: reasons.join("; ") + (vetoed ? " | Vetoed due to constraints" : " | Low interaction score"),
        algorithm_version,
        context_snapshot
      };
    }

    // Determine Intent
    let intent: "HIGH_INTERACTION" | "MEDIUM_INTERACTION" | "IGNORE" = "MEDIUM_INTERACTION";
    if (score >= 60) {
      intent = "HIGH_INTERACTION";
    }

    // Map Intent to Action Roll
    const roll = Math.random();
    let decision: "GREET_SIMPLE" | "GREET_PROFILE" | "REACT" | "IGNORE" = "IGNORE";

    if (intent === "HIGH_INTERACTION") {
      if (roll < 0.50) {
        decision = "GREET_PROFILE";
      } else if (roll < 0.85) {
        decision = "GREET_SIMPLE";
      } else {
        decision = "REACT";
      }
    } else {
      // MEDIUM_INTERACTION
      if (roll < 0.40) {
        decision = "REACT";
      } else {
        decision = "IGNORE";
      }
    }

    reasons.push(`Action roll: ${decision} (roll: ${roll.toFixed(2)})`);

    return {
      decision,
      intent,
      score,
      reason: reasons.join("; "),
      algorithm_version,
      context_snapshot
    };
  }
}
