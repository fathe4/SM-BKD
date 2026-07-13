import OpenAI from "openai";
import { logger } from "../../utils/logger";
import type { LlmClient, LlmCallParams, LlmResponse } from "./llmClient.interface";

/**
 * OpenAI adapter. Wraps the official openai SDK.
 * Handles 429 rate-limit retries with exponential backoff.
 */
export class OpenAiAdapter implements LlmClient {
  private client: OpenAI;
  private model: string;

  /** Cost per million tokens (input / output) in USD. Update when pricing changes. */
  private static readonly COST = {
    "gpt-4o":        { input: 2.50,  output: 10.00 },
    "gpt-4o-mini":   { input: 0.15,  output: 0.60 },
    "gpt-4-turbo":   { input: 10.00, output: 30.00 },
    "gpt-3.5-turbo": { input: 0.50,  output: 1.50 },
  } as Record<string, { input: number; output: number }>;

  constructor(model: string) {
    this.model = model;
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async complete(params: LlmCallParams, retries = 3, delayMs = 1000): Promise<LlmResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: params.messages as any,
        temperature: params.temperature,
        max_tokens: params.max_tokens,
        response_format: params.response_format as any,
      });

      const content = response.choices[0].message.content ?? "";
      const prompt_tokens = response.usage?.prompt_tokens ?? 0;
      const completion_tokens = response.usage?.completion_tokens ?? 0;
      const pricing = OpenAiAdapter.COST[this.model] ?? { input: 0.15, output: 0.60 };
      const estimated_cost_usd =
        (prompt_tokens * pricing.input + completion_tokens * pricing.output) / 1_000_000;

      return { content, usage: { prompt_tokens, completion_tokens, estimated_cost_usd } };
    } catch (err: any) {
      const isRateLimit =
        err.status === 429 ||
        err.statusCode === 429 ||
        err.message?.includes("429") ||
        err.message?.includes("Rate limit");

      if (isRateLimit && retries > 0) {
        logger.warn(
          `[OpenAI] Rate limit hit (429). Retrying in ${delayMs}ms... (retries left: ${retries})`
        );
        await new Promise((r) => setTimeout(r, delayMs));
        return this.complete(params, retries - 1, delayMs * 2);
      }
      throw err;
    }
  }
}
