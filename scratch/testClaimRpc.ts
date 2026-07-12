import { supabaseAdmin } from "../src/config/supabase";
import { logger } from "../src/utils/logger";

async function testClaim() {
  if (!supabaseAdmin) {
    logger.error("Supabase admin client not initialized!");
    return;
  }

  logger.info("Attempting to call RPC 'claim_next_job'...");
  const { data: lockedJobs, error } = await supabaseAdmin.rpc("claim_next_job");
  if (error) {
    logger.error(`Error calling claim_next_job: ${error.message}`);
    return;
  }

  logger.info(`Locked jobs returned: ${JSON.stringify(lockedJobs)}`);
}

testClaim()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error(`Error: ${err.message}`);
    process.exit(1);
  });
