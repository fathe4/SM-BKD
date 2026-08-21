import OpenAI from "openai";
import { logger } from "../../utils/logger";
import type { LlmClient, LlmCallParams, LlmResponse } from "./llmClient.interface";

/**
 * Groq adapter.
 * Groq's API is 100% OpenAI-compatible, so we reuse the openai SDK
 * pointed at Groq's base URL. No extra dependency needed.
 */
export class GroqAdapter implements LlmClient {
  private client: OpenAI;
  private model: string;

  /** Groq pricing per million tokens (free tier generous; paid tier very cheap). */
  private static readonly COST = {
    // Current lineup (prices are estimates for cost tracking only)
    "openai/gpt-oss-20b":       { input: 0.10, output: 0.10 },
    "openai/gpt-oss-120b":      { input: 0.25, output: 0.25 },
    // Decommissioned by Groq (kept for historical cost records)
    "llama-3.1-8b-instant":    { input: 0.05, output: 0.08 },
    "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
    "llama-3.1-70b-versatile": { input: 0.59, output: 0.79 },
    "mixtral-8x7b-32768":      { input: 0.24, output: 0.24 },
    "gemma2-9b-it":            { input: 0.20, output: 0.20 },
  } as Record<string, { input: number; output: number }>;

  constructor(model: string) {
    this.model = model;
    this.client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
  }

  async complete(params: LlmCallParams, retries = 2, delayMs = 500): Promise<LlmResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: params.messages as any,
        temperature: params.temperature,
        max_tokens: params.max_tokens,
        // Note: Groq supports json_object response_format for most models
        response_format: params.response_format as any,
      });

      const content = response.choices[0].message.content ?? "";
      const prompt_tokens = response.usage?.prompt_tokens ?? 0;
      const completion_tokens = response.usage?.completion_tokens ?? 0;
      const pricing = GroqAdapter.COST[this.model] ?? { input: 0.05, output: 0.08 };
      const estimated_cost_usd =
        (prompt_tokens * pricing.input + completion_tokens * pricing.output) / 1_000_000;

      return { content, usage: { prompt_tokens, completion_tokens, estimated_cost_usd } };
    } catch (err: any) {
      const isRateLimit =
        err.status === 429 ||
        err.statusCode === 429 ||
        err.message?.includes("429") ||
        err.message?.includes("rate_limit");

      if (isRateLimit && retries > 0) {
        logger.warn(
          `[Groq] Rate limit hit (429). Retrying in ${delayMs}ms... (retries left: ${retries})`
        );
        await new Promise((r) => setTimeout(r, delayMs));
        return this.complete(params, retries - 1, delayMs * 2);
      }
      throw err;
    }
  }
}
