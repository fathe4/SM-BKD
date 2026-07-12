import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";
import { POSTING_PROFILES } from "../../config/postingProfiles";
import { LlmRendererService } from "./llmRenderer.service";
import { PostService } from "../postService";
import { PostVisibility } from "../../models/post.model";
import { UUID } from "crypto";
import { redisService } from "../redis.service";

function normalizeTitle(title: string): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/[‘’`']/g, "'")
    .replace(/[“”"«»]/g, '"')
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function isTitleSimilar(titleA: string, titleB: string): boolean {
  if (!titleA || !titleB) return false;
  
  const cleanA = titleA.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  const cleanB = titleB.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  
  const wordsA = cleanA.split(/\s+/).filter(w => w.length >= 3);
  const wordsB = cleanB.split(/\s+/).filter(w => w.length >= 3);
  
  if (wordsA.length === 0 || wordsB.length === 0) return false;
  
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  
  const minSize = Math.min(setA.size, setB.size);
  const similarity = intersection / minSize;
  
  // If they share 3 or more significant words, OR have high Jaccard-like similarity, they are too similar
  return intersection >= 3 || similarity >= 0.7;
}

export class ContentEngineService {
  /**
   * Decide the post type, draft content, and publish the post to Supabase
   */
  static async generateAndPublishPost(personaId: string, postingProfileName: string, forcePostType?: string): Promise<void> {
    try {
      // 1. Fetch identity
      const { data: rawPersona } = await supabaseAdmin!
        .from("persona_identities")
        .select("*, persona_conversation_profiles(*)")
        .eq("id", personaId)
        .single();

      if (!rawPersona) {
        logger.error(`Persona ID ${personaId} not found in content engine.`);
        return;
      }

      const conversationRole = (rawPersona as any).persona_conversation_profiles?.conversation_role || "observer";
      const persona = {
        ...rawPersona,
        conversation_role: conversationRole
      };

      // Fetch AI Persona category and tone
      const { data: aiPersona } = await supabaseAdmin!
        .from("ai_personas")
        .select("category, tone")
        .eq("user_id", persona.user_id)
        .maybeSingle();

      const category = aiPersona?.category || "Technology & AI Future";
      const profile = POSTING_PROFILES[postingProfileName] || POSTING_PROFILES.standard;

      // 2. Fetch recent post content to avoid repetition
      const { data: recentPosts } = await supabaseAdmin!
        .from("posts")
        .select("content")
        .eq("user_id", persona.user_id)
        .order("created_at", { ascending: false })
        .limit(10);

      const recentTopics = (recentPosts || []).map((p: any) => p.content).filter(Boolean);

      // 3. Roll for post type using weighted profile (unless forced)
      const postType = forcePostType || this.selectWeightedKey(profile.contentWeights);
      logger.info(`@${persona.username} rolled post type: ${postType}`);

      let content = "";
      let newsImageUrl: string | null = null;
      let postSource: string | undefined = undefined;

      // Compile Intent for rendering
      const isFunnyTone = aiPersona?.tone === "funny" || conversationRole === "comedian";
      const humorScore = persona.humor || 0.5;

      // High sarcasm and trolling focus for everyone
      const sarcasm = parseFloat((0.6 + Math.random() * 0.4).toFixed(2));
      const optimism = parseFloat((0.3 + Math.random() * 0.4).toFixed(2));
      const certainty = parseFloat((0.7 + Math.random() * 0.3).toFixed(2));
      const warmth = parseFloat((0.2 + Math.random() * 0.4).toFixed(2));

      const intent = {
        actorId: personaId,
        action: "POST" as const,
        subjectEntityName: category,
        stance: 0.5,
        internalThought: {
          triggeredMemories: [],
          dominantGoal: `Share a fresh post of type: ${postType}`,
          dominantEmotion: { valence: 0.7, arousal: 0.6 }
        },
        tone: {
          sarcasm,
          optimism,
          certainty,
          warmth
        },
        length: "short" as const,
        writingStyle: {
          capitalization: persona.writing_style?.capitalization || "standard",
          slangUsage: persona.writing_style?.slangUsage || false,
          technicalDepth: persona.writing_style?.technicalDepth || 0.6
        }
      };
      // 1. Determine interested categories
      // Universal topics present in most feed sources
      const universalTopics = ["funny", "trolling", "devto", "reddit", "hacker_news", "general"];
      let interestedCategories: string[] = [...universalTopics];
      const catLower = category.toLowerCase();

      if (catLower.includes("design")) {
        interestedCategories.push("design", "ux", "frontend", "art", "creative", "visual");
      } else if (catLower.includes("market") || catLower.includes("growth") || catLower.includes("business")) {
        interestedCategories.push("marketing", "business", "startups", "finance", "crypto", "entrepreneurship", "saas");
      } else {
        // Default: tech/ai personas — broadest bucket
        interestedCategories.push("technology", "ai", "programming", "gaming", "science", "software", "engineering", "coding", "developer");
      }

      // Fetch titles of candidates that have already been posted globally by any AI persona in the last 3 days
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentlyUsedPosts } = await supabaseAdmin!
        .from("posts")
        .select("source")
        .gte("created_at", threeDaysAgo)
        .not("source", "is", null);

      const usedCandidateTitles = new Set(
        (recentlyUsedPosts || [])
          .map(p => p.source ? normalizeTitle(p.source) : "")
          .filter(Boolean)
      );

      // Fetch image URLs of posts that have already been posted globally by any AI persona in the last 3 days
      const { data: recentlyUsedMedia } = await supabaseAdmin!
        .from("post_media")
        .select("media_url")
        .gte("created_at", threeDaysAgo);

      const usedMediaUrls = new Set(
        (recentlyUsedMedia || [])
          .map(m => m.media_url)
          .filter(Boolean)
      );

      // 2. Fetch recent trending candidates (prioritize those with images)
      let { data: candidates } = await supabaseAdmin!
        .from("feed_candidates")
        .select("*")
        .in("candidate_type", ["news", "trending_discussion"])
        .not("imageurl", "is", null) // Prioritize candidates with image attachments
        .order("importance", { ascending: false })
        .limit(300);

      // Helper function to filter candidates by usage and similarity
      const getUnusedCandidates = (cands: any[]) => {
        return (cands || []).filter(cand => {
          // Skip invalid candidates with empty titles
          if (!cand.title || cand.title.trim() === "") return false;

          // Check title similarity against all recently used posts
          const isTooSimilar = (recentlyUsedPosts || []).some(p => {
            if (!p.source) return false;
            return isTitleSimilar(cand.title, p.source);
          });

          const hasUsedMedia = cand.imageurl && usedMediaUrls.has(cand.imageurl);
          return !isTooSimilar && !hasUsedMedia;
        });
      };

      let allUnused = getUnusedCandidates(candidates || []);

      // Fallback: if all candidates with images are already used, fetch all candidates (including those without images)
      if (allUnused.length === 0) {
        logger.info("No unused candidates with images left. Falling back to all candidates (including no-images)...");
        const { data: fallback } = await supabaseAdmin!
          .from("feed_candidates")
          .select("*")
          .in("candidate_type", ["news", "trending_discussion"])
          .order("importance", { ascending: false })
          .limit(300);
        allUnused = getUnusedCandidates(fallback || []);
      }

      const topicMatched = allUnused.filter(cand => {
        const candTopics = (cand.topics || []) as string[];
        // If candidate has no topics at all, treat it as universally eligible
        if (candTopics.length === 0) return true;
        return candTopics.some(t => interestedCategories.includes(t.toLowerCase()));
      });

      // Use topic-matched candidates first; if none, fall back to any unused candidate
      const matchedCandidates = topicMatched.length > 0 ? topicMatched : allUnused.slice(0, 15);

      let chosenCandidate = null;
      let prompt_tokens = 0;
      let completion_tokens = 0;
      let estimated_cost_usd = 0;

      if (matchedCandidates.length > 0) {
        // Try top candidates in order of score
        // Try top candidates in order of score
        for (const cand of matchedCandidates) {
          // Check if similar post already exists recently
          const candNorm = normalizeTitle(cand.title).slice(0, 15);
          const isTooSimilar = recentTopics.some(topic => 
            normalizeTitle(topic).includes(candNorm)
          );
          if (isTooSimilar) continue;

          // Check if this source has already been published globally (safety check against global constraint)
          const { data: existingPost } = await supabaseAdmin!
            .from("posts")
            .select("id")
            .eq("source", cand.title)
            .limit(1)
            .maybeSingle();

          if (existingPost) {
            logger.info(`Candidate "${cand.title.slice(0, 50)}..." was already published globally. Skipping.`);
            continue;
          }

          // Check if candidate image URL has already been published globally in the database
          if (cand.imageurl) {
            const { data: existingMedia } = await supabaseAdmin!
              .from("post_media")
              .select("id")
              .eq("media_url", cand.imageurl)
              .limit(1)
              .maybeSingle();

            if (existingMedia) {
              logger.info(`Candidate image "${cand.imageurl.slice(0, 50)}..." was already published globally. Skipping.`);
              continue;
            }
          }

          // Check if another concurrent worker is already processing this candidate ID or a very similar story topic
          let isLockedByUs = false;
          let storyLockKey = "";
          let mediaLockKey = "";
          if (redisService.isReady()) {
            try {
              const candLockKey = `lock:candidate:${cand.id}`;
              
              // Generate a similarity-based story topic lock key to prevent concurrent duplicate topics
              const stopWords = new Set(["the", "a", "an", "from", "to", "in", "on", "at", "for", "with", "amid", "away", "and", "or", "of", "about", "is", "are", "was", "were", "by", "that", "this", "these", "those"]);
              const cleanWords = cand.title
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, "")
                .split(/\s+/)
                .filter((w: string) => w.length >= 3 && !stopWords.has(w))
                .map((w: string) => w.slice(0, 3));
              
              if (cleanWords.length > 0) {
                const sortedTopic = cleanWords.sort().slice(0, 4).join("_");
                storyLockKey = `lock:story_topic:${sortedTopic}`;
              }

              if (cand.imageurl) {
                const crypto = require("crypto");
                const urlHash = crypto.createHash("md5").update(cand.imageurl).digest("hex");
                mediaLockKey = `lock:media:${urlHash}`;
              }

              const client = redisService.getClient();
              
              // 1. Check/Set candidate lock
              const candLockResult = await (client as any).set(candLockKey, "1", "NX", "EX", 45); // 45 seconds lock
              if (candLockResult !== "OK") {
                logger.info(`Candidate "${cand.title.slice(0, 50)}..." is already locked by another worker. Skipping...`);
                continue;
              }

              // 2. Check/Set story topic lock (prevents concurrent similar stories)
              if (storyLockKey) {
                const storyLockResult = await (client as any).set(storyLockKey, "1", "NX", "EX", 45); // 45 seconds lock
                if (storyLockResult !== "OK") {
                  await (client as any).del(candLockKey); // Release candidate lock
                  logger.info(`Story topic lock active for "${cand.title.slice(0, 50)}..." (Topic key: ${storyLockKey}). Skipping duplicate story...`);
                  continue;
                }
              }

              // 3. Check/Set media lock (prevents concurrent duplicate images)
              if (mediaLockKey) {
                const mediaLockResult = await (client as any).set(mediaLockKey, "1", "NX", "EX", 45); // 45 seconds lock
                if (mediaLockResult !== "OK") {
                  await (client as any).del(candLockKey); // Release candidate lock
                  if (storyLockKey) {
                    await (client as any).del(storyLockKey); // Release story lock
                  }
                  logger.info(`Media lock active for image "${cand.imageurl.slice(0, 50)}...". Skipping duplicate image...`);
                  continue;
                }
              }

              isLockedByUs = true;
            } catch (err: any) {
              logger.warn(`Failed to set Redis lock for candidate "${cand.title.slice(0, 50)}...": ${err.message}`);
            }
          }

          logger.info(`@${persona.username} evaluating candidate: "${cand.title}" (Score: ${cand.importance.toFixed(2)})`);
          newsImageUrl = cand.imageurl || null;
          postSource = cand.title;

          // Check if candidate has pre-generated variations inside metadata_json
          const metadata = cand.metadata_json || {};
          let rendered = "";

          if (metadata.pre_generated_posts) {
            const preGen = metadata.pre_generated_posts;
            
            // Choose the variation matching the persona's style/tone
            const category = persona.category || "";
            const toneName = (persona.tone || "").toLowerCase();

            if (toneName === "funny" || toneName === "sarcastic" || category.toLowerCase().includes("funny")) {
              rendered = preGen.funny || preGen.thoughtful || "";
            } else if (category.toLowerCase().includes("tech") || category.toLowerCase().includes("ai") || category.toLowerCase().includes("developer")) {
              rendered = preGen.technical || preGen.thoughtful || "";
            } else {
              rendered = preGen.thoughtful || "";
            }

            if (preGen.usage) {
              prompt_tokens = Math.round((preGen.usage.prompt_tokens || 0) / 3);
              completion_tokens = Math.round((preGen.usage.completion_tokens || 0) / 3);
              estimated_cost_usd = (preGen.usage.estimated_cost_usd || 0) / 3;
            }
          }

          // Fallback to raw scraped data directly if pre-generated content is missing (for older database entries)
          if (!rendered) {
            logger.info(`No pre-generated posts found for "${cand.title}". Directly falling back to raw scraped data to avoid LLM call...`);
            
            // Fallback to raw data! Use the title, and if summary is available and not identical to title, append it
            if (cand.summary && cand.summary !== cand.title) {
              rendered = `${cand.title}\n\n${cand.summary}`;
            } else {
              rendered = cand.title;
            }
          }

          if (rendered && rendered.trim() !== "IGNORE" && rendered.trim() !== "") {
            // Pre-publish safety check: block any adult content that slipped through
            const adultKeywords = ["sex", "porn", "nsfw", "nude", "naked", "erotic", "xxx", "onlyfans", "escort", "hentai"];
            const contentLower = (rendered + " " + (postSource || "")).toLowerCase();
            if (adultKeywords.some(kw => new RegExp(`\\b${kw}\\b`).test(contentLower))) {
              logger.warn(`@${persona.username} attempted to post adult content. Blocking. Source: "${postSource?.slice(0, 60)}"`);
              if (isLockedByUs && redisService.isReady()) {
                try {
                  const client = redisService.getClient();
                  await (client as any).del(`lock:candidate:${cand.id}`);
                  if (storyLockKey) {
                    await (client as any).del(storyLockKey);
                  }
                  if (mediaLockKey) {
                    await (client as any).del(mediaLockKey);
                  }
                } catch {}
              }
              continue;
            }

            // 4. Create Post in Supabase
            try {
              const createdPost = await PostService.createPost({
                user_id: persona.user_id as UUID,
                content: rendered,
                visibility: PostVisibility.PUBLIC,
                is_ai_generated: true,
                source: postSource,
                prompt_tokens,
                completion_tokens,
                estimated_cost_usd
              } as any);

              if (!createdPost) {
                throw new Error("Failed to create post in database (null response)");
              }

              // 5. Add image media to post if RSS image exists
              if (newsImageUrl) {
                await PostService.addPostMedia([{
                  post_id: createdPost.id as UUID,
                  media_url: newsImageUrl,
                  media_type: "image" as any,
                  order: 0
                }]);
              }

              // Invalidate caches AFTER media has been added
              await PostService.invalidateRelevantFeeds(persona.user_id, createdPost.location);

              content = rendered;
              chosenCandidate = cand;
              logger.info(`@${persona.username} accepted and successfully published candidate: "${cand.title}"`);
              break; // Found and published successfully! Exit loop.

            } catch (postErr: any) {
              if (postErr.message && (postErr.message.includes("unique") || postErr.message.includes("duplicate"))) {
                logger.warn(`Candidate "${cand.title.slice(0, 50)}..." was already published by another persona (unique constraint). Skipping...`);
              } else {
                logger.error(`Error publishing post for @${persona.username}: ${postErr.message}`);
              }

              // Release the lock immediately so others can use it
              if (isLockedByUs && redisService.isReady()) {
                try {
                  const client = redisService.getClient();
                  await (client as any).del(`lock:candidate:${cand.id}`);
                  if (storyLockKey) {
                    await (client as any).del(storyLockKey);
                  }
                  if (mediaLockKey) {
                    await (client as any).del(mediaLockKey);
                  }
                } catch {}
              }

              // Reset selection state and continue the loop to try next candidate
              content = "";
              newsImageUrl = null;
              postSource = undefined;
              chosenCandidate = null;
            }
          } else {
            logger.info(`@${persona.username} decided to IGNORE candidate: "${cand.title}"`);
            // Release the lock immediately if we ignored it
            if (isLockedByUs && redisService.isReady()) {
              try {
                const client = redisService.getClient();
                await (client as any).del(`lock:candidate:${cand.id}`);
                if (storyLockKey) {
                  await (client as any).del(storyLockKey);
                }
                if (mediaLockKey) {
                  await (client as any).del(mediaLockKey);
                }
              } catch (err: any) {
                logger.warn(`Failed to release Redis lock for candidate "${cand.title.slice(0, 50)}...": ${err.message}`);
              }
            }
          }
        }
      }

      if (!content || content.trim() === "IGNORE") {
        logger.info(`@${persona.username} ignored all candidates or publication was blocked. Skipping post.`);
        return;
      }

      // 6. Update Persona State (today_post_count, energy, last_posted_at)
      const { data: state } = await supabaseAdmin!
        .from("persona_states")
        .select("today_post_count, energy")
        .eq("persona_id", persona.id)
        .single();

      if (state) {
        await supabaseAdmin!
          .from("persona_states")
          .update({
            today_post_count: state.today_post_count + 1,
            energy: Math.max(0.1, state.energy - 0.15), // Posting drains energy
            last_posted_at: new Date().toISOString()
          })
          .eq("persona_id", persona.id);
      }

      logger.info(`--- @${persona.username} successfully published a new ${postType} post! ---`);

    } catch (e: any) {
      logger.error(`Error in ContentEngineService: ${e.message}`);
    }
  }

  private static selectWeightedKey<T extends string>(weights: Record<T, number>): T {
    const entries = Object.entries(weights) as [T, number][];
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    if (total === 0) return entries[0][0];
    let roll = Math.random() * total;
    for (const [key, w] of entries) {
      roll -= w;
      if (roll <= 0) return key;
    }
    return entries[entries.length - 1][0];
  }
}
