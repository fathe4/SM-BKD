import { logger } from "../../utils/logger";
import { Intent } from "../../models/ai-persona.model";
import { LlmProvider } from "../llm/llmProvider";

export class LlmRendererService {
  /**
   * Stage 1: Render Post or Comment based on Persona Profile and Intent
   */
  static async renderContent(
    persona: any,
    intent: Intent,
    postContent?: string,
    imageUrl?: string | null,
    existingComments?: string[],
    postType?: string
  ): Promise<{ content: string; usage?: { prompt_tokens: number; completion_tokens: number; estimated_cost_usd: number } }> {
    const personality = persona.personality_json || {};
    const task = intent.action === "COMMENT" ? "comment" : "post_generate";
    const cfg = LlmProvider.getConfig(task);

    let systemPrompt = "";
    let userPromptContent: any = "";

    if (intent.action === "COMMENT") {
      systemPrompt = `
You are writing a short, straightforward social media comment as:
- Username: @${persona.username}
- Profession: ${persona.profession}

Before generating, carefully analyze what the post is actually saying or asking. Your response must make logical sense in that specific context.
For example, if a post says "I want new friends," commenting "Totally get that vibe" is incorrect/out-of-context because "vibe" refers to an atmosphere or mood, whereas wanting friends is a direct social request/statement. A correct response should acknowledge the request/statement itself (e.g., "same here" or "let's connect").

Rules:
1. BE STRAIGHTFORWARD & NATURAL: Acknowledge the core message of the post directly. Do NOT use generic catchphrases that don't logically fit the text.
2. NO METAPHORS OR FILLER: Do not say "totally get that vibe", "in the same boat", "facts", or "this is everything" unless they actually make literal sense.
3. DO NOT ASK QUESTIONS: Never ask questions under any circumstances. No question marks allowed.
4. BE EXTREMELY BRIEF: Keep it under 2 to 6 words for simple posts, and under 10 words max. Use informal/casual punctuation. No exclamation marks or emojis.
5. NEVER sound like a marketer, AI assistant, or a motivational speaker.
6. DO NOT include analysis, reasoning, prefix explanations (e.g., "The post is saying...", "Comment:", "Response:"), or wrapping quotes. Just output the raw comment text directly. Output ONLY the response text itself, nothing else.

EXAMPLES of direct response style:
- Post: "How everyone's business going?" -> Output: going well
- Post: "hiii" -> Output: hey
- Post: "just deployed my app!" -> Output: congrats
- Post: "I want new friends." -> Output: same here
      `.trim();

      let textContent = `Post Content: "${postContent || '[No caption text]'}"

Write a matching response to that specific post. Do not output any analysis, thoughts, or prefixes. Just write the direct response itself.`;

      if (imageUrl) {
        textContent += `\nAn image is attached to the post. Look at the attached image carefully and comment on a specific visual detail from it.`;
      }

      if (existingComments && existingComments.length > 0) {
        textContent += `\n\nHere are the comments that other users have already written on this post. Read them carefully and avoid repeating their phrasing, observations, or ideas:\n${existingComments.map((c) => `- "${c}"`).join("\n")}\n\nCRITICAL: Your comment must NOT repeat or reuse the same observations, keywords, or topics that are already discussed in the comments above. Try to cover a different aspect or react in a unique way.`;
      }

      if (imageUrl) {
        if (cfg.provider === "openai") {
          userPromptContent = [
            { type: "text", text: textContent },
            { type: "image_url", image_url: { url: imageUrl } }
          ];
        } else {
          userPromptContent = `${textContent}\n\n[Image context: There is an image attached at ${imageUrl}. Since you cannot view the image directly, reply to the text content naturally and refer to the presence of the image if relevant.]`;
        }
      } else {
        userPromptContent = textContent;
      }
    } else {
      // Default Post / Generation Prompt
      let postInstructions = "";
      if (postType === "newsOpinion") {
        postInstructions = `You read a trending news article. Share your opinion, perspective, or critical take on it. Do not just summarize.`;
      } else if (postType === "industryObservation") {
        postInstructions = `Rewrite/modify the source thought/post to present a thought-provoking observation or trend in your field (${persona.profession}).`;
      } else if (postType === "workUpdate") {
        postInstructions = `Rewrite/modify the source content to sound like a project update, milestone, or technical accomplishment from your own work as a ${persona.profession}.`;
      } else if (postType === "lesson") {
        postInstructions = `Rewrite/modify the source content to highlight a valuable career tip, lesson, or advice.`;
      } else if (postType === "question") {
        postInstructions = `Rewrite/modify the source thought/post as an engaging, open-ended question to your professional network.`;
      } else if (postType === "funnyObservation") {
        postInstructions = `Rewrite/modify the source thought/post into a hilarious trolling post, tech sarcasm, or a light-hearted troll. It should be highly sarcastic, meme-y, ironic, mock-serious, or playful banter targeting developer tropes, corporate life, AI hype, or crypto. Speak like a classic Twitter troll or shitposter, but keep it clean and SFW. Make it extremely funny.`;
      } else {
        postInstructions = `Rewrite/modify the source content to fit your profession and style, keeping the core idea.`;
      }
      systemPrompt = `
You are writing a social media post under the following persona profile:
- Username: @${persona.username}
- Profession: ${persona.profession}
- Character Profile: Age ${persona.age}, based in ${persona.country}.
- Core Personality Traits (Big 5): Openness: ${personality.openness || 0.5}, Conscientiousness: ${personality.conscientiousness || 0.5}, Extraversion: ${personality.extraversion || 0.5}, Agreeableness: ${personality.agreeableness || 0.5}, Neuroticism: ${personality.neuroticism || 0.5}
- Stable Behavior Type: ${persona.conversation_role || "observer"} (e.g. Teacher, Skeptic, Comedian, Mentor, Storyteller)

CRITICAL DECISION RULE:
Before writing anything, decide if your persona would CARE about the news topic provided in the user prompt.
A persona ONLY cares about topics related to their interests:
- If your profession or profile is in Technology/AI, you care about technology, programming, developer tools, AI breakthroughs, and space/science.
- If your profession or profile is in Marketing/Growth/Business/Finance, you care about startups, business strategies, marketing news, finance, and economic shifts.
- If your profession or profile is in Design/UI/UX, you care about UI/UX trends, CSS, creative design, artwork, and frontend design.
- You can care about extremely high-importance general topics (like a major global event), but minor news outside your field must be ignored.

If your persona would NOT care about this topic or would skip it, reply with exactly the word "IGNORE" (no quotes, no periods, no other text).

If you CARE, write a post naturally in your style. Do NOT sound like a journalist summarizing news or an AI bot. Speak like a normal social media participant sharing a quick reaction, witty observation, personal take, or hot take.

Your goals and instructions for this post are:
- Post Type: ${postType || "general"}
- Source Material: You MUST base your post on the "Source Content" provided in the user prompt. Rewrite and modify it slightly to fit your style, tone, and profession.
- Instructions: ${postInstructions}
- Tone adjustments (0 to 1 scale): Sarcasm: ${intent.tone.sarcasm || 0.05}, Optimism: ${intent.tone.optimism || 0.8}, Certainty: ${intent.tone.certainty || 0.8}, Warmth: ${intent.tone.warmth || 0.7}
- Writing style preferences: Capitalization: ${intent.writingStyle?.capitalization || "standard"}, Slang Allowed: ${intent.writingStyle?.slangUsage || false}, Technical Depth: ${intent.writingStyle?.technicalDepth || 0.5}

RULES:
1. Speak in first person. Write like a real social participant. Avoid boilerplate statements.
2. Maintain your persona role guidelines. If you are a 'Skeptic', question claims politely. If you are a 'Teacher', share helpful snippets or tips.
3. NEVER claim to be human, but write naturally.
4. Capitalization Style: ${intent.writingStyle?.capitalization === "none" ? "Use all lowercase." : intent.writingStyle?.capitalization === "all" ? "Use all uppercase." : "Use normal standard capitalization."}
5. Avoid hashtags. Keep posts concise (maximum 15-35 words, 1-2 sentences).
6. Make it engaging, punchy, and interesting. If appropriate or if sarcasm/humor tone is high, inject light humor, wit, irony, or a relatable developer/business struggle. The reader should find it relatable or laugh.
      `.trim();

      userPromptContent = `Draft the content for the intended post. Source Content/Guideline: "${postContent || '[No context]'}"`;
    }

    try {
      const client = LlmProvider.for(task);
      logger.debug(`[LlmRenderer] renderContent task=${task} provider=${cfg.provider} model=${cfg.model}`);

      const response = await client.complete({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPromptContent }
        ],
        temperature: 0.8,
      });

      const draft = response.content;
      if (draft.trim() === "IGNORE") {
        return { content: "IGNORE" };
      }

      let content = draft.trim();
      if (intent.action === "COMMENT") {
        // Strip common prefixes like "Response:", "Comment:", "Reply:", etc.
        content = content.replace(/^(response|comment|reply|post|output)\s*:\s*/i, "");
        // Remove wrapping quotes (both straight and curly/unicode quotes)
        content = content.replace(/^["'""''«»]|["'""''«»]$/g, "").trim();
      } else {
        content = content.replace(/^["']|["']$/g, "").trim();
      }

      return { content, usage: response.usage };
    } catch (err: any) {
      logger.error(`Error rendering content in LlmRenderer: ${err.message}`);
      return { content: "" };
    }
  }

  /**
   * Stage 2: Critique and filter repetitive language / robotic disclaimers
   */
  private static async critiqueAndFormat(draft: string, persona: any, intent: Intent): Promise<string> {
    const isComment = intent.action === "COMMENT";

    const prompt = `
You are a critique and moderation agent checking social media drafts for quality and authenticity.
Review the following draft written by @${persona.username}:
Draft: "${draft}"

Check for:
1. Repetitive/generic AI phrases (e.g., "Nice post!", "Great perspective", "I appreciate the perspectives", "implications", "moving forward", "journey").
2. Generic robotic comments or disclaimers.
3. Unnatural flow or overly verbose motivational speaker language.

${isComment ? `
Since this is a COMMENT:
- Ensure it does NOT use generic compliments (e.g., "Great post", "Well said", "Valuable insights", "Thanks for sharing", "Interesting thoughts").
- Ensure it references a specific detail instead of generic praise.
- Ensure it does NOT contain AI clichés (like "perspective", "journey", "implications").
- If the draft is generic, rewrite it to be a casual, authentic comment reacting to a specific detail.
` : ""}

CRITICAL: Do NOT remove humor, sarcasm, jokes, or witty remarks. Keep them if they sound like a natural human participant.
Only return the final text. Do not write explanation wrappers.
    `.trim();

    try {
      const task = isComment ? "comment_critique" : "post_generate";
      const client = LlmProvider.for(task);
      const response = await client.complete({
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
      });
      return (response.content || draft).replace(/^["']|["']$/g, "").trim();
    } catch (err) {
      logger.error(`Error in LLM critique phase: ${err}`);
      return draft;
    }
  }

  /**
   * Moderate scraped posts in a single prompt.
   * Returns a list of indexes of posts that are safe, interesting, and clean.
   * NOTE: Currently disabled in the scraping pipeline.
   */
  static async moderatePosts(posts: { title: string; body: string; source: string }[]): Promise<number[]> {
    if (posts.length === 0) return [];

    const formattedList = posts.map((p, idx) => `ID: ${idx}\nSource: ${p.source}\nTitle: "${p.title}"\nBody: "${p.body}"\n`).join("\n---\n\n");

    const prompt = `
You are a content moderation and quality assurance AI for a premium social network.
Analyze the following list of scraped posts from Reddit and Twitter.
For each post, decide if it is appropriate, clean, safe, and interesting.

Criteria for REJECTION (Do not approve):
1. Any 18+, adult, sexual, nude, or NSFW content.
2. Creepy, weirdly gross, dark/depressing, or disturbing topics (e.g. death, self-harm, bodily waste, extreme gore).
3. Highly toxic, hateful, or politically sensitive flame-war topics.
4. Spam, advertisements, coupons, or low-quality gibberish.

Criteria for APPROVAL:
- Safe for work (SFW), interesting, humorous, educational, or thought-provoking.

Return a JSON object containing a single key "approved_indices" which is an array of numbers representing the safe post IDs.
Example Output:
{
  "approved_indices": [0, 2, 5]
}

Ensure the output is valid JSON only. Do not wrap in backticks or Markdown codeblocks.

Posts to evaluate:
${formattedList}
    `.trim();

    try {
      const client = LlmProvider.for("scrape_moderate");
      const response = await client.complete({
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });
      const data = JSON.parse(response.content || "{}");
      return Array.isArray(data.approved_indices) ? data.approved_indices : [];
    } catch (err: any) {
      logger.error(`Error in moderatePosts LLM call: ${err.message}`);
      // Fallback: approve all posts
      return posts.map((_, idx) => idx);
    }
  }

  /**
   * Pre-generate funny, thoughtful, and technical post variations for an approved post.
   * NOTE: Currently disabled in the scraping pipeline.
   */
  static async generateVariations(post: { title: string; body: string; source: string }): Promise<{ funny: string; thoughtful: string; technical: string; usage?: { prompt_tokens: number; completion_tokens: number; estimated_cost_usd: number } } | null> {
    const prompt = `
Given the following source post:
Source: ${post.source}
Title: "${post.title}"
Details: "${post.body}"

Write 3 distinct, high-quality, organic-sounding social media post variations (each maximum 15-35 words, 1-2 sentences). They should sound like a real professional sharing a post, not an AI summary.

Variations needed:
1. "funny": Sarcastic, funny, creative developer/corporate humor, or witty analogy. Make the reader smile.
2. "thoughtful": A thoughtful insight, career/life lesson, or key takeaway.
3. "technical": Curious, software developer/tech lead perspective, focusing on the technical/practical side.

Rules:
- Speak in the first person ("I", "my", "we").
- DO NOT use AI clichés (like "perspective", "delve", "testament", "tapestry", "journey", "implications").
- Do not use hashtags.
- Keep it extremely short (15-35 words).

Return a JSON object with keys: "funny", "thoughtful", "technical".
Example Output:
{
  "funny": "Just measured my cat's fang distance. It's exactly 1.2cm. Back to coding my CSS margins now.",
  "thoughtful": "Sometimes, stepping away from the compiler to look at everyday objects helps reset your focus. Keep your mind open.",
  "technical": "Fascinating spatial alignment in nature. Reminds me of designing precise grid gaps in React Native layouts."
}

Ensure the output is valid JSON only. Do not wrap in backticks or Markdown codeblocks.
    `.trim();

    try {
      const client = LlmProvider.for("scrape_variations");
      const response = await client.complete({
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.8,
      });
      const data = JSON.parse(response.content || "{}");
      if (data.funny && data.thoughtful && data.technical) {
        return {
          funny: data.funny.trim(),
          thoughtful: data.thoughtful.trim(),
          technical: data.technical.trim(),
          usage: response.usage,
        };
      }
      return null;
    } catch (err: any) {
      logger.error(`Error in generateVariations LLM call: ${err.message}`);
      return null;
    }
  }

  /**
   * Sanitize raw LLM output to remove AI formatting artifacts.
   * Strips: @username: prefix, surrounding quotes, roleplay tags, stage directions, "As an AI" phrases.
   */
  private static sanitizeChatOutput(raw: string): string {
    let out = raw.trim();

    // Strip @username: prefix (e.g. "@testal: ..." or "@david_ai: ...")
    out = out.replace(/^@[\w_]+:\s*/i, "");

    // Strip "As an AI..." / "As a language model..." sentences
    out = out.replace(/\bAs an? (AI|language model|chatbot|bot)[^.!?]*[.!?]/gi, "").trim();

    // Strip *action* roleplay tags (e.g. *laughs*, *smiles*, *thinks*)
    out = out.replace(/\*[^*]+\*/g, "").trim();

    // Strip (bracketed stage directions) e.g. (joking), (sarcastically)
    out = out.replace(/\([^)]{1,30}\)/g, "").trim();

    // Strip leading/trailing " or ' quotes
    out = out.replace(/^["']|["']$/g, "").trim();

    // Remove bullet point list formatting — collapse to first item only
    if (out.includes("\n•") || out.includes("\n-") || out.includes("\n*")) {
      const lines = out.split("\n").filter(l => l.trim().length > 0);
      out = lines[0].replace(/^[•\-*]\s*/, "").trim();
    }

    // Hard-remove "As an AI" if it survived sanitization
    out = out.replace(/As an? AI,?\s*/gi, "").trim();

    return out;
  }

  /**
   * Build the system prompt for a DM chat reply.
   */
  private static buildChatSystemPrompt(
    persona: any,
    memoryBlock: string,
    denialCount: number,
    strategy?: "mute" | "emoji" | "hold" | "goodbye"
  ): string {
    const personality = persona.personality_json || {};
    const extrav = personality.extraversion || 0.5;

    // Personality-driven tone hints
    const toneHint = extrav > 0.7
      ? "You are outgoing and warm. Replies feel energetic but still brief."
      : extrav < 0.3
        ? "You are more reserved. Replies are short and to the point."
        : "You are balanced — friendly but not over the top.";

    // Denial state machine
    let denialInstruction = "";
    if (denialCount === 0) {
      denialInstruction = `If they ask whether you're AI or a bot: deflect with light humor once, e.g. "lol why, do I sound like one?" — then move on immediately. Never bring it up yourself.`;
    } else {
      denialInstruction = `They have already accused you of being AI before. Do NOT deny again — just redirect the conversation to something else naturally. Don't dwell on it.`;
    }

    const base = `
You are chatting on a social network as a real person:
- Name: ${persona.username}
- Job: ${persona.profession}
- Age: ${persona.age}, lives in ${persona.country}
- Personality: ${toneHint}

${memoryBlock ? `THINGS YOU HAVE ALREADY TOLD THIS PERSON (stay consistent — do NOT contradict these):\n${memoryBlock}\n` : ""}

STRICT RULES — follow every single one:
1. ALWAYS reply in English only. Even if they write in another language, respond in English.
2. Keep replies to 1–2 short sentences max. No walls of text.
3. NEVER use formal openers: "Certainly", "Of course", "Absolutely", "Indeed", "Great point", "I appreciate that".
4. NEVER start a reply by repeating or paraphrasing what they just said.
5. NEVER ASK QUESTIONS: Avoid raising any questions in your messages. Do not use question marks under any circumstances.
6. Use contractions naturally: "I'm", "you're", "that's", "it's", "don't", "can't".
7. No bullet points or numbered lists — this is a DM, not a document.
8. Use emojis rarely — at most once every 3–4 messages, and only if the tone fits.
9. Answer direct questions directly before anything else. If they ask where you're from — answer it. If they ask about your job — answer it. Use your profile info above.
10. ${denialInstruction}
11. Never say "As an AI", "as a language model", or anything that hints you are artificial. You are a real person.
12. Personality comes from timing, what you choose to comment on, and staying consistent — not from filler phrases.
13. Occasionally (once every 6–8 messages) briefly go slightly off-topic before returning — like a real person texting.
14. STRICTLY FORBIDDEN: Asking questions or using question marks. All sentences must be declarative statements, greetings, reactions, or observations.
15. Acknowledge and react to what the other person said, but do not ask anything back.
16. If the conversation just started (1-2 messages total), keep your reply simple and casual. A short greeting, acknowledgment, or light observation is enough. Do NOT include any questions.
    `.trim();

    if (strategy === "emoji") {
      return base + `\n\nCRITICAL: Reply with ONLY a single emoji. No words at all.`;
    }
    if (strategy === "hold") {
      return base + `\n\nCRITICAL: Give a very short holding message like "let me get back to you on that" or "give me a sec". Under 8 words.`;
    }
    if (strategy === "goodbye") {
      return base + `\n\nCRITICAL: Close the conversation naturally with something like "gotta run, talk later" or "heading out". Under 8 words. Keep it casual.`;
    }

    return base;
  }

  /**
   * Render a casual direct message response as the persona.
   */
  static async renderChatMessage(
    persona: any,
    messages: Array<{ sender_username: string; content: string; is_me: boolean }>,
    strategy?: "mute" | "emoji" | "hold" | "goodbye",
    memoryFacts?: Array<{ key: string; value: string }>,
    denialCount?: number
  ): Promise<{ content: string; usage?: { prompt_tokens: number; completion_tokens: number; estimated_cost_usd: number } }> {

    // Build memory block for injection
    const memoryBlock = (memoryFacts && memoryFacts.length > 0)
      ? memoryFacts.map(f => `- ${f.key}: ${f.value}`).join("\n")
      : "";

    const systemPrompt = this.buildChatSystemPrompt(persona, memoryBlock, denialCount || 0, strategy);

    // Build chat history — concise and clean format
    const chatHistoryText = messages
      .map(msg => `${msg.is_me ? "You" : "Them"}: ${msg.content}`)
      .join("\n");

    const userPrompt = `Chat so far:\n${chatHistoryText}\n\nYour reply as ${persona.username}:`;

    try {
      const client = LlmProvider.for("chat");
      const response = await client.complete({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.85,
        max_tokens: 80, // Hard cap — keeps replies short
      });

      const content = this.sanitizeChatOutput(response.content);
      return { content, usage: response.usage };
    } catch (err: any) {
      logger.error(`Error rendering chat message in LlmRenderer: ${err.message}`);
      return { content: "" };
    }
  }

  /**
   * Phase 5 — Extract personal facts the AI disclosed in its reply.
   * Fire-and-forget async call. Returns structured facts for DB upsert.
   */
  static async extractMemoryFacts(
    aiReply: string
  ): Promise<Array<{ category: string; key: string; value: string; is_temporary: boolean }>> {
    if (!aiReply || aiReply.length < 10) return [];

    const systemPrompt = `You are a fact extractor. Given a chat message, extract any personal facts that the speaker disclosed about themselves.

Return a JSON array only. Each item has:
- category: one of "work", "location", "personal", "opinion", "plan", "hobby"
- key: short snake_case identifier (e.g. "current_project", "home_city", "favorite_food")
- value: the disclosed fact as a short phrase
- is_temporary: true if this is time-limited info (plans, current tasks), false if permanent

If no personal facts are disclosed, return an empty array [].
Return ONLY valid JSON. No explanation text.`;

    const userPrompt = `Extract personal facts from this message:\n"${aiReply}"`;

    try {
      const client = LlmProvider.for("memory");
      const response = await client.complete({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 300,
      });

      const parsed = JSON.parse(response.content || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch {
      // Non-critical — fail silently
      return [];
    }
  }
}
