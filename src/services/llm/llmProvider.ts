import type { LlmClient } from "./llmClient.interface";
import { OpenAiAdapter } from "./openai.adapter";
import { GroqAdapter } from "./groq.adapter";

/**
 * All tasks that can be routed to an LLM provider.
 * Add new tasks here when needed; no other file needs to change.
 */
export type LlmTask =
  | "comment"            // NPC comment generation        → Groq
  | "comment_critique"   // Comment quality filter        → Groq
  | "post_generate"      // NPC post generation           → OpenAI
  | "chat"               // NPC DM / chat reply           → OpenAI
  | "memory"             // Chat memory fact extraction   → OpenAI
  | "scrape_moderate"    // Scrape content moderation     → disabled (OpenAI fallback)
  | "scrape_variations"  // Scrape variation generation   → disabled (OpenAI fallback)
  | "topic_extract";     // Discovery topic extraction    → disabled (OpenAI fallback)

type Provider = "openai" | "groq";

interface TaskConfig {
  provider: Provider;
  model: string;
}

/**
 * ─────────────────────────────────────────────────
 *  SINGLE SOURCE OF TRUTH — change provider/model
 *  for any task by editing one line here.
 *  No callers need to change.
 * ─────────────────────────────────────────────────
 */
const TASK_CONFIG: Record<LlmTask, TaskConfig> = {
  // ── Active tasks ──────────────────────────────
  comment:           { provider: "groq",   model: "llama-3.1-8b-instant" },
  comment_critique:  { provider: "groq",   model: "llama-3.1-8b-instant" },
  post_generate:     { provider: "openai", model: "gpt-4o-mini" },
  chat:              { provider: "groq",   model: "llama-3.3-70b-versatile" },
  memory:            { provider: "groq",   model: "llama-3.1-8b-instant" },

  // ── Disabled tasks (scraping pipeline off) ────
  // These still have valid config so enabling them later is just uncommenting
  scrape_moderate:   { provider: "openai", model: "gpt-4o-mini" },
  scrape_variations: { provider: "openai", model: "gpt-4o-mini" },
  topic_extract:     { provider: "openai", model: "gpt-4o-mini" },
};

/**
 * Factory that returns the correct LlmClient for a given task.
 *
 * @example
 *   const client = LlmProvider.for("comment");
 *   const result = await client.complete({ messages, temperature: 0.8 });
 */
export class LlmProvider {
  static for(task: LlmTask): LlmClient {
    const cfg = TASK_CONFIG[task];
    switch (cfg.provider) {
      case "groq":
        return new GroqAdapter(cfg.model);
      case "openai":
      default:
        return new OpenAiAdapter(cfg.model);
    }
  }

  /** Expose config for logging / debugging. */
  static getConfig(task: LlmTask): TaskConfig {
    return TASK_CONFIG[task];
  }
}
