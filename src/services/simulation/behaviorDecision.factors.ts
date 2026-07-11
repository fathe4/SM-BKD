// src/services/simulation/behaviorDecision.factors.ts
import { BehaviorContext } from "./behaviorContext.builder";

export interface ScoreResult {
  score: number;
  reason: string;
  veto?: boolean; // If true, forces decision to IGNORE regardless of other factors
}

export interface DecisionFactor {
  name: string;
  evaluate(ctx: BehaviorContext): Promise<ScoreResult> | ScoreResult;
}

/**
 * 1. First Ever AI Interaction Factor
 */
export class FirstInteractionFactor implements DecisionFactor {
  name = "FirstInteraction";

  evaluate(ctx: BehaviorContext): ScoreResult {
    if (ctx.interactionStats.totalAiDms === 0) {
      return { score: 40, reason: "First ever AI interaction (+40)" };
    }
    return { score: 0, reason: "Not first AI interaction (+0)" };
  }
}

/**
 * 2. Persona Energy Factor
 */
export class EnergyFactor implements DecisionFactor {
  name = "Energy";

  evaluate(ctx: BehaviorContext): ScoreResult {
    const energy = ctx.persona.energy;
    const score = Math.round(15 * energy);
    return { score, reason: `Energy level modifier (+${score}, energy=${energy.toFixed(2)})` };
  }
}

/**
 * 3. Persona Extroversion Factor
 */
export class ExtroversionFactor implements DecisionFactor {
  name = "Extroversion";

  evaluate(ctx: BehaviorContext): ScoreResult {
    const extroversion = ctx.persona.personality_json?.extroversion ?? 0.5;
    if (extroversion > 0.7) {
      return { score: 20, reason: `Highly extroverted (+20, extroversion=${extroversion.toFixed(2)})` };
    } else if (extroversion < 0.3) {
      return { score: -20, reason: `Introverted (-20, extroversion=${extroversion.toFixed(2)})` };
    }
    return { score: 0, reason: "Average extroversion (+0)" };
  }
}

/**
 * 4. Fatigue Control Factor (Soft Cap)
 */
export class FatigueFactor implements DecisionFactor {
  name = "Fatigue";

  evaluate(ctx: BehaviorContext): ScoreResult {
    const lastGreetingStr = ctx.interactionStats.lastAiGreetingAt;
    if (lastGreetingStr) {
      const lastGreeting = new Date(lastGreetingStr);
      const hoursAgo = (Date.now() - lastGreeting.getTime()) / (3600 * 1000);
      if (hoursAgo < 12) {
        return { score: -50, reason: `Greeting fatigue: last AI greeting was ${hoursAgo.toFixed(1)}h ago (-50)` };
      }
    }
    return { score: 0, reason: "No recent AI greetings (+0)" };
  }
}

/**
 * 5. Daily Budget Factor (Hard Cap / Veto)
 */
export class DailyBudgetFactor implements DecisionFactor {
  name = "DailyBudget";

  evaluate(ctx: BehaviorContext): ScoreResult {
    if (ctx.dailyBudgetRemaining <= 0) {
      return { score: 0, reason: "AI has exhausted daily DM budget (VETO)", veto: true };
    }
    return { score: 0, reason: `AI daily DM budget remaining: ${ctx.dailyBudgetRemaining} (+0)` };
  }
}

/**
 * 6. Global Conversation Cap Factor
 */
export class GlobalCapFactor implements DecisionFactor {
  name = "GlobalCap";

  evaluate(ctx: BehaviorContext): ScoreResult {
    const totalDms = ctx.interactionStats.totalAiDms;
    // Estimate active conversations: if they've received DMs, we cap it
    if (totalDms >= 10) {
      return { score: -30, reason: "Human has received too many DMs globally (-30)" };
    }
    return { score: 0, reason: "Below global DM cap (+0)" };
  }
}
