/**
 * Quick test: verifies Groq (comment) and OpenAI (chat) are both working.
 * Run: npx ts-node scratch/testLlmProviders.ts
 */
import * as dotenv from "dotenv";
dotenv.config();

import { LlmProvider } from "../src/services/llm/llmProvider";

async function testComment() {
  console.log("\n─── TEST 1: Comment via Groq ───────────────────────────────");
  const cfg = LlmProvider.getConfig("comment");
  console.log(`Provider: ${cfg.provider}  Model: ${cfg.model}`);

  const client = LlmProvider.for("comment");
  const result = await client.complete({
    messages: [
      {
        role: "system",
        content: `You are writing a short social media comment as @john_dev, a Software Engineer.
Rules: Be brief (under 10 words). No emojis. No exclamation marks. Just raw text.`,
      },
      {
        role: "user",
        content: `Post Content: "just shipped my first open source library!"

Analyze the post. Write a matching comment.`,
      },
    ],
    temperature: 0.8,
  });

  console.log(`✅ Comment: "${result.content}"`);
  console.log(`   Tokens: ${result.usage.prompt_tokens} in / ${result.usage.completion_tokens} out`);
  console.log(`   Cost: $${result.usage.estimated_cost_usd.toFixed(6)}`);
}

async function testChat() {
  console.log("\n─── TEST 2: Chat reply via OpenAI ──────────────────────────");
  const cfg = LlmProvider.getConfig("chat");
  console.log(`Provider: ${cfg.provider}  Model: ${cfg.model}`);

  const client = LlmProvider.for("chat");
  const result = await client.complete({
    messages: [
      {
        role: "system",
        content: `You are chatting as @sarah_miller, a 28-year-old UX Designer.
Keep replies to 1 short sentence. Casual tone.`,
      },
      {
        role: "user",
        content: `Chat so far:
Them: hey, what are you working on lately?

Your reply as sarah_miller:`,
      },
    ],
    temperature: 0.85,
    max_tokens: 60,
  });

  console.log(`✅ Chat reply: "${result.content}"`);
  console.log(`   Tokens: ${result.usage.prompt_tokens} in / ${result.usage.completion_tokens} out`);
  console.log(`   Cost: $${result.usage.estimated_cost_usd.toFixed(6)}`);
}

async function testGroqJsonOutput() {
  console.log("\n─── TEST 3: Groq JSON output (comment critique) ────────────");
  const client = LlmProvider.for("comment_critique");
  const result = await client.complete({
    messages: [
      {
        role: "user",
        content: `Review this social media comment draft and return only the final improved text.
Draft: "Nice post! Great perspective on this!"
The draft is too generic. Rewrite it to be specific and casual. Just return the text, no explanation.`,
      },
    ],
    temperature: 0.5,
  });

  console.log(`✅ Critique result: "${result.content}"`);
  console.log(`   Tokens: ${result.usage.prompt_tokens} in / ${result.usage.completion_tokens} out`);
}

async function main() {
  console.log("🚀 Testing LLM Providers...");
  try {
    await testComment();
    await testChat();
    await testGroqJsonOutput();
    console.log("\n✅ All tests passed!\n");
  } catch (err: any) {
    console.error("\n❌ Test failed:", err.message);
    process.exit(1);
  }
}

main();
