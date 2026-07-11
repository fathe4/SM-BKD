import { supabaseAdmin } from "../src/config/supabase";
import { logger } from "../src/utils/logger";

async function updatePendingJobsPriority() {
  if (!supabaseAdmin) {
    logger.error("Supabase admin client not initialized!");
    return;
  }

  logger.info("Updating pending behavior jobs priorities...");

  // Update POST jobs to priority 10
  const { error: postErr } = await supabaseAdmin
    .from("behavior_jobs")
    .update({ priority: 10 })
    .eq("status", "pending")
    .eq("action_type", "POST");

  if (postErr) logger.error(`Error updating POST jobs: ${postErr.message}`);
  else logger.info("Successfully updated pending POST jobs to priority 10");

  // Update COMMENT jobs to priority 5
  const { error: commentErr } = await supabaseAdmin
    .from("behavior_jobs")
    .update({ priority: 5 })
    .eq("status", "pending")
    .eq("action_type", "COMMENT");

  if (commentErr) logger.error(`Error updating COMMENT jobs: ${commentErr.message}`);
  else logger.info("Successfully updated pending COMMENT jobs to priority 5");

  // Update LIKE jobs to priority 1
  const { error: likeErr } = await supabaseAdmin
    .from("behavior_jobs")
    .update({ priority: 1 })
    .eq("status", "pending")
    .eq("action_type", "LIKE");

  if (likeErr) logger.error(`Error updating LIKE jobs: ${likeErr.message}`);
  else logger.info("Successfully updated pending LIKE jobs to priority 1");
}

updatePendingJobsPriority()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error(`Error: ${err.message}`);
    process.exit(1);
  });
