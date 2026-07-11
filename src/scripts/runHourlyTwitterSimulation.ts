import { supabaseAdmin } from "../config/supabase";
import { logger } from "../utils/logger";
import { ScraperService, TwitterScrapedPost } from "../services/simulation/scraper.service";
import { TWITTER_PERSONA_CONFIGS } from "../config/twitterSimulationConfig";
import { UUID } from "crypto";

async function main() {
  console.log("\n========================================================");
  console.log("⏰ RUNNING HOURLY TWITTER INTEGRATION SIMULATION ⏰");
  console.log("========================================================\n");

  try {
    // 1. Fetch all active AI personas
    logger.info("Fetching active AI personas...");
    const { data: activeList, error: activeErr } = await supabaseAdmin!
      .from("ai_personas")
      .select("id, user_id")
      .eq("is_active", true);

    if (activeErr || !activeList || activeList.length === 0) {
      logger.error("No active personas found in the database. Exiting.");
      return;
    }

    const activeUserIdsList = activeList.map(p => p.user_id);

    // Fetch corresponding identities
    const { data: identities, error: identityErr } = await supabaseAdmin!
      .from("persona_identities")
      .select("username, humor, user_id")
      .in("user_id", activeUserIdsList);

    if (identityErr || !identities || identities.length === 0) {
      logger.error("Could not fetch persona identities for active personas. Exiting.");
      return;
    }

    // Format active personas
    const formattedPersonas = activeList.map(p => {
      const identity = identities.find(id => id.user_id === p.user_id) || {};
      return {
        id: p.id,
        user_id: p.user_id,
        username: (identity as any).username || "unknown",
        humor: parseFloat((identity as any).humor || "0.5")
      };
    });

    logger.info(`Found ${formattedPersonas.length} active personas.`);

    // 2. Filter out personas who have already posted in the last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    logger.info(`Checking posts since ${twentyFourHoursAgo} to enforce 24h posting limit...`);
    
    const { data: recentPosts, error: postsErr } = await supabaseAdmin!
      .from("posts")
      .select("user_id")
      .gte("created_at", twentyFourHoursAgo);

    if (postsErr) {
      logger.error(`Error querying recent posts: ${postsErr.message}`);
      return;
    }

    const postedUserIds = new Set((recentPosts || []).map(p => p.user_id));
    const eligiblePersonas = formattedPersonas.filter(p => !postedUserIds.has(p.user_id));

    if (eligiblePersonas.length === 0) {
      logger.warn("All active personas have already posted in the last 24 hours. Skipping hourly run.");
      return;
    }

    logger.info(`Eligible personas for posting: ${eligiblePersonas.map(p => `@${p.username}`).join(", ")}`);

    // 3. Weighted random selection based on humor score
    let selectedPersona = eligiblePersonas[0];
    const totalHumor = eligiblePersonas.reduce((sum, p) => sum + p.humor, 0);
    
    if (totalHumor > 0) {
      let roll = Math.random() * totalHumor;
      for (const p of eligiblePersonas) {
        roll -= p.humor;
        if (roll <= 0) {
          selectedPersona = p;
          break;
        }
      }
    } else {
      // Fallback to simple random selection
      const idx = Math.floor(Math.random() * eligiblePersonas.length);
      selectedPersona = eligiblePersonas[idx];
    }

    logger.info(`👉 Selected Persona to post: @${selectedPersona.username} (Humor Score: ${selectedPersona.humor})`);

    // 4. Resolve scraping config for selected persona
    const config = TWITTER_PERSONA_CONFIGS[selectedPersona.username] || { mode: "feed" };
    logger.info(`Scraping Mode: ${config.mode.toUpperCase()}`);

    let scrapedTweets: TwitterScrapedPost[] = [];

    if (config.mode === "profiles" && config.twitterUsernames && config.twitterUsernames.length > 0) {
      logger.info(`Scraping profiles: ${config.twitterUsernames.join(", ")}`);
      for (const username of config.twitterUsernames) {
        const tweets = await ScraperService.scrapeTwitterProfile(username, 5);
        scrapedTweets.push(...tweets);
      }
    } else if (config.mode === "search") {
      const topic = config.searchTopic || "AI breaking news";
      scrapedTweets = await ScraperService.scrapeTwitterSearch(topic, 15);
    } else {
      // Default to personal feed
      scrapedTweets = await ScraperService.scrapeTwitterPersonalFeed(15);
    }

    logger.info(`Total raw tweets fetched: ${scrapedTweets.length}`);

    // 5. Filter and process scraped tweets
    const candidateTweets: TwitterScrapedPost[] = [];
    
    for (const tweet of scrapedTweets) {
      // Rule 1: Must have an image attachment
      if (!tweet.imageUrl) continue;

      // Rule 2: Image URL must be from Twitter's CDN (pbs.twimg.com)
      if (!tweet.imageUrl.includes("pbs.twimg.com")) {
        logger.debug(`Skipping tweet from non-X host: ${tweet.imageUrl}`);
        continue;
      }

      // Rule 3: Must not have been posted already (check by original tweet source url)
      const { data: existing, error: dupErr } = await supabaseAdmin!
        .from("posts")
        .select("id")
        .eq("source", tweet.url)
        .limit(1)
        .maybeSingle();

      if (dupErr) {
        logger.error(`Error checking duplicate post: ${dupErr.message}`);
        continue;
      }

      if (existing) {
        logger.debug(`Skipping duplicate tweet: ${tweet.url}`);
        continue;
      }

      // Rule 4: Skip threads or incomplete/cut-off tweets
      if (isThreadOrIncomplete(tweet.body)) {
        logger.info(`Skipping thread/incomplete tweet: "${tweet.body.substring(0, 50)}..."`);
        continue;
      }

      candidateTweets.push(tweet);
    }

    logger.info(`Valid candidate tweets after image, thread & duplicate filters: ${candidateTweets.length}`);

    if (candidateTweets.length === 0) {
      logger.warn("No suitable new tweets with Twitter CDN images found. Skipping simulation.");
      return;
    }

    // 6. Sort candidate tweets by engagement metrics (descending)
    candidateTweets.sort((a, b) => b.engagement - a.engagement);

    const topTweet = candidateTweets[0];
    logger.info(`\n🔥 Selected Top Tweet for Posting (Engagement: ${topTweet.engagement} - Likes: ${topTweet.likes}, Retweets: ${topTweet.retweets}):`);
    logger.info(`   Author: ${topTweet.author}`);
    logger.info(`   Text: "${topTweet.body}"`);
    logger.info(`   Image: ${topTweet.imageUrl}`);
    logger.info(`   Permalink: ${topTweet.url}\n`);

    // 7. Insert the post directly (no AI translation/rewriting)
    logger.info("Publishing original tweet directly to database...");
    const { data: newPost, error: postInsertErr } = await supabaseAdmin!
      .from("posts")
      .insert({
        user_id: selectedPersona.user_id,
        content: topTweet.body,
        visibility: "public",
        is_ai_generated: false, // Skipping AI generation rewrite as requested
        source: topTweet.url
      })
      .select()
      .single();

    if (postInsertErr || !newPost) {
      logger.error(`Failed to create post: ${postInsertErr?.message}`);
      return;
    }

    // 8. Add media directly linking to Twitter's CDN URL (no Cloudinary uploading)
    const mediaUrl = topTweet.mediaType === "video" ? (topTweet.videoUrl || topTweet.imageUrl) : topTweet.imageUrl;
    logger.info(`Attaching Twitter CDN ${topTweet.mediaType} URL directly: ${mediaUrl}`);
    const { error: mediaErr } = await supabaseAdmin!
      .from("post_media")
      .insert({
        post_id: newPost.id,
        media_url: mediaUrl,
        media_type: topTweet.mediaType,
        order: 0
      });

    if (mediaErr) {
      logger.error(`Failed to insert post media: ${mediaErr.message}`);
    }

    // 9. Add "Follow on Twitter" comment from another active persona
    const commenterCandidates = formattedPersonas.filter(p => p.user_id !== selectedPersona.user_id);
    const commenter = commenterCandidates.length > 0
      ? commenterCandidates[Math.floor(Math.random() * commenterCandidates.length)]
      : selectedPersona;

    logger.info(`💬 Posting comment from @${commenter.username}...`);
    
    const { error: commentErr } = await supabaseAdmin!
      .from("comments")
      .insert({
        post_id: newPost.id,
        user_id: commenter.user_id,
        content: `Follow ${topTweet.author} on Twitter: ${topTweet.url}`,
        is_deleted: false
      });

    if (commentErr) {
      logger.error(`Failed to post comment: ${commentErr.message}`);
    } else {
      logger.info(`✅ Successfully commented: "Follow ${topTweet.author} on Twitter..."`);
    }

    // 10. Update the poster persona's last_posted_at state to prevent posting again for 24h
    logger.info("Updating persona last_posted_at state...");
    await supabaseAdmin!
      .from("persona_states")
      .update({
        last_posted_at: new Date().toISOString()
      })
      .eq("persona_id", selectedPersona.id);

    console.log("\n========================================================");
    console.log("🎉 SUCCESS: Hourly Twitter Post Scraped & Published! 🎉");
    console.log("========================================================\n");

  } catch (error: any) {
    logger.error(`Simulation loop failed: ${error.message}`);
  }
}

function isThreadOrIncomplete(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  // Ends with ellipses (indicates incomplete text)
  if (t.endsWith("...") || t.endsWith("…")) {
    return true;
  }

  // Common thread indicators/emojis
  const threadIndicators = [
    "🧵",
    "thread👇",
    "thread 👇",
    "a thread",
    "below 👇",
    "read below"
  ];
  if (threadIndicators.some(ind => t.toLowerCase().includes(ind))) {
    return true;
  }

  // Matches "1/5", "1/10", "1/n", "(1/5)", "[1/5]" at word boundaries
  const threadPattern = /(\b\d+\/\d+\b|\b\d+\/n\b|\(\d+\/\d+\)|\(\d+\/n\)|\[\d+\/\d+\])/i;
  if (threadPattern.test(t)) {
    return true;
  }

  return false;
}

main();
