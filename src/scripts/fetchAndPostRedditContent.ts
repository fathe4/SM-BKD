import { supabaseAdmin } from "../config/supabase";
import { logger } from "../utils/logger";
import { ScraperService } from "../services/simulation/scraper.service";
import { REDDIT_SUBREDDITS, getSubredditName } from "../config/redditSimulationConfig";

// Blacklist of adult keywords
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

async function main() {
  console.log("\n========================================================");
  console.log("🤖 Reddit Post Scraping & Publishing Script 🤖");
  console.log("========================================================\n");

  const postsCount = parseInt(process.argv[2] || "1", 10);
  logger.info(`Requested to publish ${postsCount} post(s) from Reddit.`);

  if (!supabaseAdmin) {
    logger.error("Supabase admin client not initialized.");
    process.exit(1);
  }

  // 1. Fetch active AI personas
  const { data: activeList, error: activeErr } = await supabaseAdmin
    .from("ai_personas")
    .select("id, user_id")
    .eq("is_active", true);

  if (activeErr || !activeList || activeList.length === 0) {
    logger.error(`No active personas found: ${activeErr?.message}`);
    process.exit(1);
  }

  const { data: identities, error: identErr } = await supabaseAdmin
    .from("persona_identities")
    .select("user_id, username");

  if (identErr || !identities) {
    logger.error(`Failed to fetch persona identities: ${identErr?.message}`);
    process.exit(1);
  }

  const formattedPersonas = activeList.map(p => {
    const identity = identities.find(id => id.user_id === p.user_id) || {};
    return {
      id: p.id,
      user_id: p.user_id,
      username: (identity as any).username || "unknown"
    };
  });

  logger.info(`Found ${formattedPersonas.length} active personas.`);

  // 2. Scrape subreddits
  const scrapedPosts: any[] = [];
  for (const urlOrName of REDDIT_SUBREDDITS) {
    const subreddit = getSubredditName(urlOrName);
    try {
      logger.info(`Scraping r/${subreddit}...`);
      const posts = await ScraperService.scrapeSubreddit(subreddit, 10);
      scrapedPosts.push(...posts);
    } catch (err: any) {
      logger.error(`Failed to scrape r/${subreddit}: ${err.message}`);
    }
  }

  logger.info(`Total raw Reddit posts fetched: ${scrapedPosts.length}`);

  // 3. Filter candidates
  const candidatePosts: any[] = [];
  for (const post of scrapedPosts) {
    // Must have image attachment
    if (!post.imageUrl) continue;

    // Filter out potential adult content
    if (containsAdultContent(post.title) || containsAdultContent(post.body || "") || containsAdultContent(post.imageUrl || "") || containsAdultContent(post.url || "")) {
      logger.info(`Skipping post because it contains potential adult content: "${post.title.substring(0, 50)}..."`);
      continue;
    }

    // Check duplicates in posts table
    const { data: existing, error: dupErr } = await supabaseAdmin
      .from("posts")
      .select("id")
      .eq("source", post.url)
      .limit(1)
      .maybeSingle();

    if (dupErr || existing) {
      continue;
    }

    candidatePosts.push(post);
  }

  logger.info(`Valid candidates after image, NSFW & duplicate filters: ${candidatePosts.length}`);

  if (candidatePosts.length === 0) {
    logger.warn("No valid Reddit candidates found. Exiting.");
    return;
  }

  // Shuffle or slice to get unique ones
  const selectedPosts = candidatePosts.slice(0, postsCount);
  logger.info(`Selected top ${selectedPosts.length} posts to publish.`);

  for (let idx = 0; idx < selectedPosts.length; idx++) {
    const topPost = selectedPosts[idx];
    console.log(`\n--- Posting Candidate #${idx + 1} ---`);
    console.log(`Title: "${topPost.title}"`);
    console.log(`Image URL: ${topPost.imageUrl}`);
    console.log(`Source: ${topPost.url}`);

    // Choose a random poster persona
    const poster = formattedPersonas[Math.floor(Math.random() * formattedPersonas.length)];
    logger.info(`Publishing to database under @${poster.username}...`);

    // Use body text if available, fallback to title
    const content = topPost.body ? `${topPost.title}\n\n${topPost.body}` : topPost.title;

    const { data: newPost, error: postInsertErr } = await supabaseAdmin
      .from("posts")
      .insert({
        user_id: poster.user_id,
        content: content,
        visibility: "public",
        is_ai_generated: false,
        source: topPost.url
      })
      .select()
      .single();

    if (postInsertErr || !newPost) {
      logger.error(`Failed to create post: ${postInsertErr?.message}`);
      continue;
    }

    // Attach media
    logger.info(`Attaching image directly: ${topPost.imageUrl}`);
    const { error: mediaErr } = await supabaseAdmin
      .from("post_media")
      .insert({
        post_id: newPost.id,
        media_url: topPost.imageUrl,
        media_type: "image",
        order: 0
      });

    if (mediaErr) {
      logger.error(`Failed to insert post media: ${mediaErr.message}`);
    } else {
      logger.info(`Successfully posted: "${topPost.title}"`);
    }
  }

  logger.info("Reddit publishing task complete.");
}

main().then(() => process.exit(0)).catch(err => {
  console.error("❌ Execution failed:", err);
  process.exit(1);
});
