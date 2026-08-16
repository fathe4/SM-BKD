import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { CronJob } from "cron";
import { logger } from "../utils/logger";
import { SimulationEngine } from "../services/simulation/simulationEngine";
import { CommentService } from "../services/commentService";
import { ReactionService } from "../services/reactionService";
import { TargetType, ReactionType } from "../models/interaction.model";
import { UUID } from "crypto";
import Parser from "rss-parser";
import axios from "axios";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MAX_AI_LIKES = 5;
const MAX_AI_COMMENTS = 3;

const COMMENT_TEMPLATES = [
  "Nice one 🔥",
  "Interesting take",
  "Didn’t know this",
  "This is helpful",
  "Clean post",
  "Good insight",
  "Makes sense",
];

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function delayMinutes(min: number, max: number) {
  return new Date(Date.now() + rand(min, max) * 60000);
}

export function sanitize(text: string) {
  return text
    .replace(/u\/\w+/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .slice(0, 180);
}

// ------------------- GENERATOR -------------------

export async function runGenerator() {
  console.log(`[sim ${new Date().toISOString()}] generator cycle start`);
  logger.info("Redirecting generator trigger to new Simulation Engine Cycle...");
  try {
    await SimulationEngine.runSimulationCycle();
    console.log(`[sim ${new Date().toISOString()}] generator cycle complete`);
  } catch (e: any) {
    console.log(`[sim ${new Date().toISOString()}] generator cycle ERROR: ${e?.message}`);
    throw e;
  }
}

// ------------------- REAL USER ENGAGEMENT -------------------

async function engageRealUsers() {
  if (Math.random() < 0.0) return; // 100% chance for testing (was 0.5)

  const { data: posts } = await supabase
    .from("posts")
    .select("id, user_id")
    .gt("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString());

  if (!posts || posts.length === 0) return;

  const { data: personas } = await supabase
    .from("ai_personas")
    .select("*")
    .eq("is_active", true);

  if (!personas || personas.length === 0) return;

  const postIds = posts.slice(0, 5).map((p) => p.id);

  // Get existing likes in the reactions table
  const { data: existingLikes } = await supabase
    .from("reactions")
    .select("post_id, user_id")
    .in("post_id", postIds);

  // Get existing comments in the comments table
  const { data: existingComments } = await supabase
    .from("comments")
    .select("post_id, user_id")
    .in("post_id", postIds);

  // Get existing jobs in the queue to avoid double-queueing
  const { data: existingJobs } = await supabase
    .from("job_queue")
    .select("type, payload")
    .in("status", ["pending", "processing", "done"]);

  const likedSet = new Set((existingLikes || []).map((l) => `${l.post_id}:${l.user_id}`));
  const commentedSet = new Set((existingComments || []).map((c) => `${c.post_id}:${c.user_id}`));
  
  for (const job of existingJobs || []) {
    if (job.payload && job.payload.post_id && job.payload.user_id) {
      const key = `${job.payload.post_id}:${job.payload.user_id}`;
      if (job.type === "like") likedSet.add(key);
      if (job.type === "comment") commentedSet.add(key);
    }
  }

  for (const post of posts.slice(0, 5)) {
    const selected = shuffle(personas).slice(0, rand(2, 4));

    for (const persona of selected) {
      if (persona.user_id === post.user_id) continue;

      const hasLiked = likedSet.has(`${post.id}:${persona.user_id}`);
      const hasCommented = commentedSet.has(`${post.id}:${persona.user_id}`);

      if (!hasLiked && Math.random() < 1.0) { // 100% chance for testing (was 0.7)
        await enqueueJob("like", {
          post_id: post.id,
          user_id: persona.user_id,
        }, delayMinutes(1, 2), post.user_id); // 1-2 mins delay (was 2-15)
        likedSet.add(`${post.id}:${persona.user_id}`); // Mark in memory immediately
      }

      if (!hasCommented && Math.random() < 1.0) { // 100% chance for testing (was 0.4)
        await enqueueJob("comment", {
          post_id: post.id,
          user_id: persona.user_id,
        }, delayMinutes(1, 2), post.user_id); // 1-2 mins delay (was 5-25)
        commentedSet.add(`${post.id}:${persona.user_id}`); // Mark in memory immediately
      }
    }
  }
}

// ------------------- ENGAGEMENT SCHEDULING -------------------

async function scheduleEngagement(postId: string, ownerId: string) {
  const { data: personas } = await supabase
    .from("ai_personas")
    .select("*")
    .eq("is_active", true);

  if (!personas || personas.length === 0) return;

  const selected = shuffle(personas).slice(0, rand(2, 4));

  let likeCount = 0;
  let commentCount = 0;

  for (const persona of selected) {
    if (persona.user_id === ownerId) continue;

    if (likeCount < MAX_AI_LIKES && Math.random() < 0.7) {
      likeCount++;
      await enqueueJob("like", {
        post_id: postId,
        user_id: persona.user_id,
      }, delayMinutes(2, 20), ownerId);
    }

    if (commentCount < MAX_AI_COMMENTS && Math.random() < 0.5) {
      commentCount++;
      await enqueueJob("comment", {
        post_id: postId,
        user_id: persona.user_id,
      }, delayMinutes(5, 30), ownerId);
    }
  }
}

async function enqueueJob(type: string, payload: any, runAt: Date, targetUserId: string) {
  await supabase.from("job_queue").insert({
    type,
    payload,
    target_user_id: targetUserId,
    run_at: runAt.toISOString(),
  });
}

// ------------------- QUEUE PROCESSOR -------------------

export async function runQueueProcessor() {
  logger.info("Processing NPC Simulation Behavior Queue...");
  await SimulationEngine.processBehaviorQueue();
}

// ------------------- AI GENERATION -------------------

async function generatePost(persona: any) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        // Enhanced Prompt
        content: `Write a short social media post (max 15 words)\n\nCategory: ${persona.category}\nTone: ${persona.tone}\n\nRules:\n- Sound natural, not robotic\n- Avoid hashtags\n- Avoid being too perfect\n- Slight human imperfection is okay`,
      },
    ],
  });

  return completion.choices[0].message.content;
}

async function generateComment(postContent: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        // Enhanced Comment Prompt using post content
        content: `Write a short, natural social media comment (max 8 words) reacting to this post:\n"${postContent}"\n\nRules:\n- casual tone\n- sometimes neutral or questioning, not always positive\n- no emojis most of the time\n- avoid generic phrases like "Great post" or "Nice one"`,
      },
    ],
  });

  return completion.choices[0].message.content || "";
}

// ------------------- RSS FEED AGGREGATION & MEDIA MIRRORING -------------------

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['enclosure', 'enclosure'],
    ],
  }
});

const FEED_MAP: Record<string, string[]> = {
  "Technology & AI Future": [
    "https://techcrunch.com/feed/",
    "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml"
  ],
  "Design & UI/UX": [
    "https://www.smashingmagazine.com/feed/",
    "https://uxdesign.cc/feed"
  ],
  "Marketing & Growth": [
    "https://blog.hubspot.com/marketing/rss.xml",
    "https://feedpress.me/mozblog"
  ]
};

async function fetchTrendingContent(category: string) {
  const feeds = FEED_MAP[category];
  if (!feeds || feeds.length === 0) return null;

  const url = feeds[Math.floor(Math.random() * feeds.length)];
  
  try {
    const feed = await parser.parseURL(url);
    if (!feed.items || feed.items.length === 0) return null;

    const items = feed.items.slice(0, 5);
    const item = items[Math.floor(Math.random() * items.length)];

    let imageUrl = "";

    if (item.enclosure && item.enclosure.url) {
      imageUrl = item.enclosure.url;
    } else if ((item as any).mediaContent && (item as any).mediaContent.$ && (item as any).mediaContent.$.url) {
      imageUrl = (item as any).mediaContent.$.url;
    }

    if (!imageUrl) {
      const content = item.content || (item as any)['content:encoded'] || "";
      const match = content.match(/src="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
      if (match && match[1]) {
        imageUrl = match[1];
      }
    }

    return {
      title: item.title || "",
      summary: item.contentSnippet || item.content || "",
      imageUrl: imageUrl || undefined,
    };
  } catch (e) {
    logger.error(`Error parsing feed ${url}:`, e);
    return null;
  }
}

async function uploadToCloudinary(imageUrl: string): Promise<string | null> {
  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const buffer = Buffer.from(response.data, 'binary');
    const base64Data = buffer.toString('base64');
    const mimeType = response.headers['content-type'] || 'image/jpeg';
    const dataUri = `data:${mimeType};base64,${base64Data}`;
    
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName || !uploadPreset) {
      logger.error("Cloudinary configuration missing in environment");
      return null;
    }
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    
    const form = new FormData();
    const blob = new Blob([buffer], { type: mimeType });
    form.append("file", blob, "image.jpg");
    form.append("upload_preset", uploadPreset);

    const uploadResponse = await axios.post(url, form);
    
    return uploadResponse.data.secure_url;
  } catch (e: any) {
    const errMsg = e.response?.data ? JSON.stringify(e.response.data) : (e.message || e);
    logger.error(`Failed to upload image to Cloudinary: ${errMsg}`);
    return null;
  }
}

async function generateOpinionPost(persona: any, title: string, summary: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `You are an expert in "${persona.category}" with profile name "${persona.username}" and a "${persona.tone}" tone.
You read this trending article:
Title: "${title}"
Summary: "${summary.slice(0, 500)}"

Write a short, engaging social media post (max 20 words) sharing your opinion, perspective, or take on this.
Rules:
- Speak in the first person ("I think...", "Interesting to see...", etc.).
- Sound like a real person, not an AI.
- Do not mention AI or OpenAI.`,
      },
    ],
  });

  return completion.choices[0].message.content;
}

// ------------------- UTILS -------------------

function shuffle(arr: any[]) {
  return arr.sort(() => Math.random() - 0.5);
}

// ------------------- CRON SETUP -------------------

export function setupAiEngagementJob(): void {
  // Generator runs every 1 minute for testing (was 15 minutes)
  new CronJob(
    "* * * * *",
    async () => {
      const t0 = Date.now();
      try {
        await runGenerator();
      } catch (e) {
        logger.error("AI Generator Error:", e);
      } finally {
        console.log(`[tick] generator tick finished in ${Date.now() - t0}ms`);
      }
    },
    null,
    true,
    "UTC"
  );

  // Processor runs every 1 minute for testing (was 2 minutes)
  new CronJob(
    "* * * * *",
    async () => {
      const t0 = Date.now();
      try {
        await runQueueProcessor();
      } catch (e) {
        logger.error("AI Queue Processor Error:", e);
      } finally {
        console.log(`[tick] queue processor tick finished in ${Date.now() - t0}ms`);
      }
    },
    null,
    true,
    "UTC"
  );

  logger.info("AI Engagement jobs scheduled (Generator: 1m, Processor: 1m)");
}
