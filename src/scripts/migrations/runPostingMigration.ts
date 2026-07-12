import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";
import { config } from "dotenv";

config();

async function runPostingMigration() {
  if (!supabaseAdmin) {
    logger.error("Supabase admin client not initialized.");
    process.exit(1);
  }

  try {
    logger.info("Starting posting behavior fields migration...");

    const statements = [
      "ALTER TABLE persona_conversation_profiles ADD COLUMN IF NOT EXISTS posting_profile_name TEXT DEFAULT 'standard';",
      "ALTER TABLE persona_states ADD COLUMN IF NOT EXISTS today_post_budget INT DEFAULT 0;",
      "ALTER TABLE persona_states ADD COLUMN IF NOT EXISTS last_posted_at TIMESTAMPTZ;"
    ];

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      logger.info(`Executing: ${stmt}`);
      const { error } = await supabaseAdmin.rpc("execute_sql", {
        sql_query: stmt,
      });

      if (error) {
        logger.error(`Error executing statement ${i + 1}:`, error);
        throw error;
      }
    }

    logger.info("Posting behavior fields migration completed successfully!");
  } catch (error) {
    logger.error("Migration failed:", error);
    process.exit(1);
  }
}

runPostingMigration().catch((error) => {
  logger.error("Migration script failed:", error);
  process.exit(1);
});
