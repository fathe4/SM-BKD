import { supabaseAdmin } from "../config/supabase";
import { logger } from "../utils/logger";
import { ScraperService, TwitterScrapedPost } from "../services/simulation/scraper.service";

async function main() {
  console.log("\n========================================================");
  console.log("🔥 FETCHING & POSTING HIGH-ENGAGEMENT TWITTER CONTENT 🔥");
  console.log("========================================================\n");

  // Get optional count from environment/command line (default to 1 post)
  const postsCount = parseInt(process.env.POSTS_COUNT || "1", 10);

  try {
    // 1. Fetch active AI personas
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

    // 2. Define list of target high-engagement/trolling/funny profiles to scrape
    const targetProfiles = ["Can_TheOnee", "linadreaamy", "YashRMFC", "elonmusk", "levelsio"];
    logger.info(`Scraping target public profiles: ${targetProfiles.join(", ")}`);

    const scrapedTweets: any[] = [];
    for (const profile of targetProfiles) {
      try {
        const tweets = await ScraperService.scrapeTwitterProfile(profile, 10);
        const taggedTweets = tweets.map(t => ({ ...t, scrapedFrom: profile }));
        scrapedTweets.push(...taggedTweets);
      } catch (err: any) {
        logger.error(`Failed to scrape profile @${profile}: ${err.message}`);
      }
    }

    logger.info(`Total raw tweets fetched: ${scrapedTweets.length}`);

    // 3. Filter and parse candidates
    const candidateTweets: any[] = [];
    
    for (const tweet of scrapedTweets) {
      // Allow text-only tweets (no image required)

      // Still skip non-CDN images if an image exists
      if (tweet.imageUrl && !tweet.imageUrl.includes("pbs.twimg.com")) {
        continue;
      }

      // Filter out potential adult content
      if (containsAdultContent(tweet.body) || containsAdultContent(tweet.imageUrl || "") || containsAdultContent(tweet.url || "")) {
        logger.info(`Skipping tweet because it contains potential adult content: "${tweet.body.substring(0, 50)}..."`);
        continue;
      }

      // Rule for Can_TheOnee (since they repost everything): only get high engagement posts
      const isCanTheOnee = tweet.scrapedFrom?.toLowerCase() === "can_theonee" || tweet.author?.toLowerCase().includes("can_theonee");
      if (isCanTheOnee && tweet.engagement < 200) {
        logger.info(`Skipping tweet from @Can_TheOnee due to low engagement (${tweet.engagement} < 200).`);
        continue;
      }

      // Check duplicates
      const { data: existing, error: dupErr } = await supabaseAdmin!
        .from("posts")
        .select("id")
        .eq("source", tweet.url)
        .limit(1)
        .maybeSingle();

      if (dupErr || existing) {
        continue;
      }

      // Filter out thread/incomplete posts
      if (isThreadOrIncomplete(tweet.body)) {
        continue;
      }

      candidateTweets.push(tweet);
    }

    logger.info(`Valid candidates after thread & duplicate filters: ${candidateTweets.length}`);

    if (candidateTweets.length === 0) {
      logger.warn("No valid high-engagement candidates found. Exiting.");
      return;
    }

    // 4. Sort candidates by engagement (descending)
    candidateTweets.sort((a, b) => b.engagement - a.engagement);

    // Limit to requested postsCount
    const selectedTweets = candidateTweets.slice(0, postsCount);
    logger.info(`Selected top ${selectedTweets.length} posts to publish.`);

    for (let idx = 0; idx < selectedTweets.length; idx++) {
      const topTweet = selectedTweets[idx];
      console.log(`\n--- Posting Candidate #${idx + 1} ---`);
      console.log(`Author: ${topTweet.author}`);
      console.log(`Text: "${topTweet.body.substring(0, 100)}..."`);
      console.log(`Engagement Metric: ${topTweet.engagement} (Likes: ${topTweet.likes}, RTs: ${topTweet.retweets}, Replies: ${topTweet.replies})`);
      console.log(`Media Type: ${topTweet.mediaType}`);
      console.log(`Media URL: ${topTweet.videoUrl || topTweet.imageUrl}`);

      // Choose a random poster persona
      const poster = formattedPersonas[Math.floor(Math.random() * formattedPersonas.length)];
      logger.info(`Publishing to database under @${poster.username}...`);

      const { data: newPost, error: postInsertErr } = await supabaseAdmin!
        .from("posts")
        .insert({
          user_id: poster.user_id,
          content: topTweet.body,
          visibility: "public",
          is_ai_generated: false,
          source: topTweet.url
        })
        .select()
        .single();

      if (postInsertErr || !newPost) {
        logger.error(`Failed to create post: ${postInsertErr?.message}`);
        continue;
      }

      // Attach media (only if available)
      const mediaUrl = topTweet.mediaType === "video" ? (topTweet.videoUrl || topTweet.imageUrl) : topTweet.imageUrl;
      if (mediaUrl) {
        logger.info(`Attaching media (${topTweet.mediaType}) directly: ${mediaUrl}`);
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
      } else {
        logger.info(`Text-only tweet — no media to attach.`);
      }

      // Add follow comment from another persona
      const commenterCandidates = formattedPersonas.filter(p => p.user_id !== poster.user_id);
      const commenter = commenterCandidates.length > 0
        ? commenterCandidates[Math.floor(Math.random() * commenterCandidates.length)]
        : poster;

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

      // Update poster state
      await supabaseAdmin!
        .from("persona_states")
        .update({ last_posted_at: new Date().toISOString() })
        .eq("persona_id", poster.id);
    }

    console.log("\n========================================================");
    console.log("🎉 SUCCESS: High Engagement Posts Scraping & Posting Complete! 🎉");
    console.log("========================================================\n");

  } catch (error: any) {
    logger.error(`High engagement script failed: ${error.message}`);
  }
}

function isThreadOrIncomplete(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  // Ends with ellipses (indicates incomplete text) - only if text is short (under 100 chars)
  if ((t.endsWith("...") || t.endsWith("…")) && t.length < 100) {
    return true;
  }

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

  const threadPattern = /(\b\d+\/\d+\b|\b\d+\/n\b|\(\d+\/\d+\)|\(\d+\/n\)|\[\d+\/\d+\])/i;
  if (threadPattern.test(t)) {
    return true;
  }

  return false;
}

function containsAdultContent(text: string): boolean {
  if (!text) return false;
  const lowercaseText = text.toLowerCase();
  const adultKeywords = [
    "nsfw", "porn", "sex", "naked", "nude", "erotic", "scat", "poop", 
    "piss", "fart", "ass", "boob", "dick", "vagina", "hentai", 
    "adult content", "xxx", "onlyfans", "ofans", "escort"
  ];
  return adultKeywords.some(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b|${keyword}`, 'i');
    return regex.test(lowercaseText);
  });
}

main();
