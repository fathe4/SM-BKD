// src/scripts/migrations/updateBehaviorDecisionsTable.ts
import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";

async function runMigration() {
  try {
    logger.info("Starting Behavior Decisions update migration...");

    if (!supabaseAdmin) {
      throw new Error("Supabase admin client not initialized");
    }

    const statements = [
      // 1. Add algorithm_version column
      `ALTER TABLE behavior_decisions ADD COLUMN IF NOT EXISTS algorithm_version VARCHAR(20) DEFAULT 'v1.0';`,

      // 2. Add context_snapshot column
      `ALTER TABLE behavior_decisions ADD COLUMN IF NOT EXISTS context_snapshot JSONB DEFAULT '{}'::jsonb;`,

      // Clean up previous opportunities to prevent duplication conflict during index build
      `DELETE FROM behavior_opportunities WHERE id IS NOT NULL;`,

      // 3. Create unique index on behavior_opportunities for duplicate prevention on FRIEND_ACCEPTED
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_friend_accepted_opp 
       ON behavior_opportunities(persona_id, human_id, type) 
       WHERE type = 'FRIEND_ACCEPTED';`
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

    logger.info("Behavior Decisions table successfully updated!");
  } catch (error) {
    logger.error("Error running update migration:", error);
    process.exit(1);
  }
}

// Run the migration if executed directly
if (require.main === module) {
  runMigration().catch((error) => {
    logger.error("Migration failed:", error);
    process.exit(1);
  });
}

export default runMigration;
