/**
 * Script: fixAiProfilesAndViews.ts
 * 
 * Fixes three issues:
 * 1. Creates missing `profiles` rows for all AI users (97 missing)
 * 2. Runs RankingService.refreshFeedCaches() to distribute feed_candidates to feed_items (so AI personas can browse and view posts)
 * 3. Runs IngestionService.ingestUserPosts() to ensure all recent posts are in feed_candidates
 */
import { supabaseAdmin } from "../config/supabase";
import { RankingService } from "../services/simulation/ranking.service";
import { IngestionService } from "../services/simulation/ingestion.service";
import { logger } from "../utils/logger";

async function fixAiProfiles() {
  logger.info("=== Step 1: Fixing missing profiles for AI users ===");

  const { data: aiUsers, error } = await supabaseAdmin!
    .from("users")
    .select("id, username, first_name, last_name")
    .eq("is_ai", true);

  if (error || !aiUsers) {
    logger.error("Failed to fetch AI users:", error);
    return;
  }

  // Get existing profile user_ids
  const { data: existingProfiles } = await supabaseAdmin!
    .from("profiles")
    .select("user_id");
  const existingIds = new Set(existingProfiles?.map(p => p.user_id) || []);

  const missing = aiUsers.filter(u => !existingIds.has(u.id));
  logger.info(`Found ${missing.length} AI users without a profile row. Creating...`);

  let created = 0;
  for (const user of missing) {
    const { error: insertErr } = await supabaseAdmin!
      .from("profiles")
      .insert({
        user_id: user.id,
        occupation: "Professional",
        interests: [],
      });

    if (insertErr) {
      logger.error(`Failed to create profile for @${user.username}: ${insertErr.message}`);
    } else {
      created++;
    }
  }
  logger.info(`✅ Created ${created} profile rows for AI users.`);
}

async function refreshFeedAndViews() {
  logger.info("=== Step 2: Ingesting recent user posts into feed_candidates ===");
  const postCount = await IngestionService.ingestUserPosts();
  logger.info(`✅ Ingested ${postCount} new user posts as feed candidates.`);

  logger.info("=== Step 3: Running RankingService to populate feed_items for all personas ===");
  await RankingService.refreshFeedCaches();
  logger.info("✅ Feed caches refreshed — AI personas can now browse and view posts.");

  // Check result
  const { count } = await supabaseAdmin!
    .from("feed_items")
    .select("id", { count: "exact", head: true });
  logger.info(`Total feed_items now in DB: ${count}`);
}

async function main() {
  await fixAiProfiles();
  await refreshFeedAndViews();
  logger.info("=== All fixes complete ===");
}

main().then(() => process.exit(0)).catch(err => {
  logger.error("Fix script failed:", err);
  process.exit(1);
});
