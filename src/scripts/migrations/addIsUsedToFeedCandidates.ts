// src/scripts/migrations/addIsUsedToFeedCandidates.ts
import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";

async function runMigration() {
  try {
    logger.info("Starting addIsUsedToFeedCandidates migration...");

    if (!supabaseAdmin) {
      throw new Error("Supabase admin client not initialized");
    }

    const statements = [
      `ALTER TABLE feed_candidates ADD COLUMN IF NOT EXISTS is_used BOOLEAN DEFAULT false;`,
      `CREATE INDEX IF NOT EXISTS idx_feed_candidates_is_used ON feed_candidates(is_used) WHERE is_used = false;`
    ];

    logger.info("Executing update statements via execute_sql RPC...");
    for (const sql_query of statements) {
      const { error } = await supabaseAdmin.rpc("execute_sql", { sql_query });
      if (error) {
        logger.error(`Migration step failed for statement: ${sql_query.slice(0, 100)}...`);
        logger.error(`Error: ${error.message}`);
        throw error;
      }
    }

    logger.info("feed_candidates table successfully updated with is_used column!");
  } catch (error) {
    logger.error("Error running addIsUsedToFeedCandidates migration:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  runMigration().catch((error) => {
    logger.error("Migration failed:", error);
    process.exit(1);
  });
}

export default runMigration;
