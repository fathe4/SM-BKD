import { supabaseAdmin } from "../src/config/supabase";
import { logger } from "../src/utils/logger";

async function checkDbTime() {
  if (!supabaseAdmin) {
    logger.error("Supabase admin client not initialized!");
    return;
  }

  const { data, error } = await supabaseAdmin.rpc("execute_sql", {
    sql_query: "SELECT NOW() as db_now, timezone('UTC', NOW()) as db_utc_now;"
  });

  if (error) {
    logger.error(`Error querying DB time: ${error.message}`);
    return;
  }

  logger.info(`DB Time check response: ${JSON.stringify(data)}`);
}

checkDbTime()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error(`Error: ${err.message}`);
    process.exit(1);
  });
