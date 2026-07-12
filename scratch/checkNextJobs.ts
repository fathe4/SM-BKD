import { supabaseAdmin } from "../src/config/supabase";
import { logger } from "../src/utils/logger";

async function checkNextJobs() {
  if (!supabaseAdmin) {
    logger.error("Supabase admin client not initialized!");
    return;
  }

  logger.info("Fetching next 10 pending jobs from behavior_jobs...");
  const { data: jobs, error } = await supabaseAdmin
    .from("behavior_jobs")
    .select("id, persona_id, action_type, run_at, status, persona_identities(username)")
    .eq("status", "pending")
    .eq("action_type", "POST")
    .order("run_at", { ascending: true })
    .limit(10);

  if (error) {
    logger.error(`Failed to fetch jobs: ${error.message}`);
    return;
  }

  if (!jobs || jobs.length === 0) {
    logger.info("No pending jobs are currently scheduled.");
  } else {
    logger.info(`Found ${jobs.length} pending jobs:`);
    jobs.forEach((job: any, index: number) => {
      const username = job.persona_identities?.username || "unknown";
      logger.info(`[${index + 1}] @${username} scheduled for ${job.action_type} at ${job.run_at}`);
    });
  }
}

checkNextJobs()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error(`Error: ${err.message}`);
    process.exit(1);
  });
