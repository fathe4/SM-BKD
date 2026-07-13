/**
 * Universal LLM client interface.
 * Every provider adapter (OpenAI, Groq, Anthropic, etc.) must implement this.
 * Callers never import a provider directly — they go through LlmProvider.for(task).
 */

export interface LlmMessageContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export type LlmMessageContent = string | LlmMessageContentPart[];

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: LlmMessageContent;
}

export interface LlmCallParams {
  messages: LlmMessage[];
  temperature?: number;
  max_tokens?: number;
  /** Request JSON object output. Only supported by OpenAI-compatible endpoints. */
  response_format?: { type: "json_object" | "text" };
}

export interface LlmUsage {
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost_usd: number;
}

export interface LlmResponse {
  content: string;
  usage: LlmUsage;
}

export interface LlmClient {
  /**
   * Send a chat completion request to the provider.
   * Returns the text content of the first choice and token usage stats.
   */
  complete(params: LlmCallParams): Promise<LlmResponse>;
}
