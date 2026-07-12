import { supabaseAdmin } from "../src/config/supabase";
import { logger } from "../src/utils/logger";

async function countDueJobs() {
  if (!supabaseAdmin) {
    logger.error("Supabase admin client not initialized!");
    return;
  }

  // Count total pending
  const { count: pendingCount, error: err1 } = await supabaseAdmin
    .from("behavior_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  // Count due pending (run_at <= now)
  const now = new Date().toISOString();
  const { count: dueCount, error: err2 } = await supabaseAdmin
    .from("behavior_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lte("run_at", now);

  if (err1 || err2) {
    logger.error(`Error: ${err1?.message || err2?.message}`);
    return;
  }

  logger.info(`Total pending behavior jobs: ${pendingCount}`);
  logger.info(`Due pending behavior jobs (run_at <= ${now}): ${dueCount}`);
}

countDueJobs()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error(`Error: ${err.message}`);
    process.exit(1);
  });
