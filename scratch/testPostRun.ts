import { supabaseAdmin } from "../src/config/supabase";
import { logger } from "../src/utils/logger";
import { POSTING_PROFILES } from "../src/config/postingProfiles";
import { redisService } from "../src/services/redis.service";

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
  
  return intersection >= 3 || similarity >= 0.7;
}

async function runTest() {
  const personaId = '7c829422-9832-41f2-a01b-8dc26c496748';
  
  // 1. Fetch raw persona
  const { data: rawPersona } = await supabaseAdmin!
    .from("persona_identities")
    .select("*, persona_conversation_profiles(*)")
    .eq("id", personaId)
    .single();

  console.log("Persona:", rawPersona.username);

  // Fetch AI Persona category and tone
  const { data: aiPersona } = await supabaseAdmin!
    .from("ai_personas")
    .select("category, tone")
    .eq("user_id", rawPersona.user_id)
    .maybeSingle();

  const category = aiPersona?.category || "Technology & AI Future";
  console.log("Category:", category);

  // 2. Fetch recent post content to avoid repetition
  const { data: recentPosts } = await supabaseAdmin!
    .from("posts")
    .select("content")
    .eq("user_id", rawPersona.user_id)
    .order("created_at", { ascending: false })
    .limit(10);

  const recentTopics = (recentPosts || []).map((p: any) => p.content).filter(Boolean);
  console.log("Recent Topics:", recentTopics);

  // Determine interested categories
  const universalTopics = ["funny", "trolling", "devto", "reddit", "hacker_news", "general"];
  let interestedCategories: string[] = [...universalTopics];
  const catLower = category.toLowerCase();
  if (catLower.includes("design")) {
    interestedCategories.push("design", "ux", "frontend", "art", "creative", "visual");
  } else if (catLower.includes("market") || catLower.includes("growth") || catLower.includes("business")) {
    interestedCategories.push("marketing", "business", "startups", "finance", "crypto", "entrepreneurship", "saas");
  } else {
    interestedCategories.push("technology", "ai", "programming", "gaming", "science", "software", "engineering", "coding", "developer");
  }
  console.log("Interested Categories:", interestedCategories);

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

  console.log("Used candidate titles count in last 3 days:", usedCandidateTitles.size);

  const { data: recentlyUsedMedia } = await supabaseAdmin!
    .from("post_media")
    .select("media_url")
    .gte("created_at", threeDaysAgo);

  const usedMediaUrls = new Set(
    (recentlyUsedMedia || [])
      .map(m => m.media_url)
      .filter(Boolean)
  );
  console.log("Used media URLs count:", usedMediaUrls.size);

  // Fetch recent trending candidates
  let { data: candidates } = await supabaseAdmin!
    .from("feed_candidates")
    .select("*")
    .in("candidate_type", ["news", "trending_discussion"])
    .not("imageurl", "is", null)
    .order("importance", { ascending: false })
    .limit(300);

  console.log("Candidates with images count:", candidates?.length);

  // Filter candidates
  const allUnused = (candidates || []).filter(cand => {
    const isTooSimilar = (recentlyUsedPosts || []).some(p => {
      if (!p.source) return false;
      return isTitleSimilar(cand.title, p.source);
    });

    const hasUsedMedia = cand.imageurl && usedMediaUrls.has(cand.imageurl);
    return !isTooSimilar && !hasUsedMedia;
  });
  console.log("All unused candidates count:", allUnused.length);

  const topicMatched = allUnused.filter(cand => {
    const candTopics = (cand.topics || []) as string[];
    if (candTopics.length === 0) return true;
    return candTopics.some(t => interestedCategories.includes(t.toLowerCase()));
  });
  console.log("Topic matched unused candidates count:", topicMatched.length);

  const matchedCandidates = topicMatched.length > 0 ? topicMatched : allUnused.slice(0, 15);
  console.log("Matched candidates count:", matchedCandidates.length);

  if (matchedCandidates.length > 0) {
    for (const cand of matchedCandidates) {
      console.log(`\nEvaluating: "${cand.title}" (ID: ${cand.id})`);
      const candNorm = normalizeTitle(cand.title).slice(0, 15);
      console.log(`candNorm: "${candNorm}"`);
      const isTooSimilar = recentTopics.some(topic => 
        normalizeTitle(topic).includes(candNorm)
      );
      console.log(`isTooSimilar to recentTopics:`, isTooSimilar);
      if (isTooSimilar) continue;

      let isLockedByUs = false;
      if (redisService.isReady()) {
        try {
          const lockKey = `lock:candidate:${cand.id}`;
          const client = redisService.getClient();
          const lockResult = await (client as any).set(lockKey, "1", "NX", "EX", 45);
          console.log(`Redis lock result:`, lockResult);
          if (lockResult !== "OK") {
            console.log(`Locked by another worker!`);
            continue;
          }
          isLockedByUs = true;
          // Delete lock immediately for testing
          await (client as any).del(lockKey);
        } catch (err: any) {
          console.log(`Redis lock error:`, err.message);
        }
      } else {
        console.log("Redis not ready");
      }
    }
  }
}

runTest();
