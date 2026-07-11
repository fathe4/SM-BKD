import { supabaseAdmin } from "../src/config/supabase";
import { logger } from "../src/utils/logger";

async function checkRecentPosts() {
  if (!supabaseAdmin) {
    logger.error("Supabase admin client not initialized!");
    return;
  }

  logger.info("Fetching last 5 posts in 'posts' table...");
  const { data: posts, error } = await supabaseAdmin
    .from("posts")
    .select("id, content, created_at, is_ai_generated, users(username)")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    logger.error(`Failed to fetch posts: ${error.message}`);
    return;
  }

  if (!posts || posts.length === 0) {
    logger.info("No posts found in the posts table.");
  } else {
    logger.info("Last 5 published posts:");
    posts.forEach((post: any, index: number) => {
      const username = post.users?.username || "unknown";
      logger.info(`[${index + 1}] @${username} | Published: ${post.created_at} | Content: "${post.content ? post.content.replace(/\n/g, " ").slice(0, 80) : ""}"`);
    });
  }
}

checkRecentPosts()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error(`Error: ${err.message}`);
    process.exit(1);
  });
