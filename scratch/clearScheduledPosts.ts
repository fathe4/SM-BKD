import { supabaseAdmin } from "../src/config/supabase";
import { logger } from "../src/utils/logger";

async function clearScheduledPosts() {
  logger.info("Initializing connection to database...");
  if (!supabaseAdmin) {
    logger.error("Supabase admin client not initialized!");
    return;
  }

  logger.info("Deleting all pending POST jobs from behavior_jobs table...");
  const { data, error, count } = await supabaseAdmin
    .from("behavior_jobs")
    .delete({ count: "exact" })
    .eq("status", "pending")
    .eq("action_type", "POST");

  if (error) {
    logger.error(`Failed to delete pending POST jobs: ${error.message}`);
  } else {
    logger.info(`Successfully deleted ${count} pending POST jobs.`);
  }

  // Also delete all pending behavior decisions that are POST actions
  logger.info("Cleaning up scheduled behavior decisions for POST actions...");
  const { error: decError, count: decCount } = await supabaseAdmin
    .from("behavior_decisions")
    .delete({ count: "exact" })
    .eq("decision", "POST")
    .gt("scheduled_at", new Date().toISOString());

  if (decError) {
    logger.error(`Failed to delete scheduled behavior decisions: ${decError.message}`);
  } else {
    logger.info(`Successfully deleted ${decCount} scheduled behavior decisions.`);
  }
}

clearScheduledPosts()
  .then(() => {
    logger.info("Finished clearing scheduled posts.");
    process.exit(0);
  })
  .catch((err) => {
    logger.error(`Failed to clear scheduled posts: ${err.message}`);
    process.exit(1);
  });
