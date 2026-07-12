import { supabaseAdmin } from "../src/config/supabase";
import { logger } from "../src/utils/logger";

async function checkJobExecutionStatus() {
  if (!supabaseAdmin) {
    logger.error("Supabase admin client not initialized!");
    return;
  }

  logger.info("Fetching recent POST jobs...");
  const { data: jobs, error } = await supabaseAdmin
    .from("behavior_jobs")
    .select("id, persona_id, action_type, run_at, status, last_error, attempts, persona_identities(username)")
    .eq("action_type", "POST")
    .eq("status", "pending")
    .order("run_at", { ascending: true })
    .limit(10);

  if (error) {
    logger.error(`Failed to fetch jobs: ${error.message}`);
    return;
  }

  if (!jobs || jobs.length === 0) {
    logger.info("No POST jobs found.");
  } else {
    logger.info(`Recent POST jobs in queue:`);
    jobs.forEach((job: any, index: number) => {
      const username = job.persona_identities?.username || "unknown";
      logger.info(`[${index + 1}] @${username} | Scheduled: ${job.run_at} | Status: ${job.status} | Attempts: ${job.attempts} | Error: ${job.last_error || "none"}`);
    });
  }
}

checkJobExecutionStatus()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error(`Error: ${err.message}`);
    process.exit(1);
  });
