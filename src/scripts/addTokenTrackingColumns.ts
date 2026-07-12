import { supabaseAdmin } from "../config/supabase";
import { logger } from "../utils/logger";

async function addTrackingColumns() {
  if (!supabaseAdmin) {
    logger.error("Supabase admin client not initialized.");
    process.exit(1);
  }

  const query = `
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT 0;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT 0;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS estimated_cost_usd DECIMAL(10, 8) DEFAULT 0.00000000;

    ALTER TABLE comments ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT 0;
    ALTER TABLE comments ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT 0;
    ALTER TABLE comments ADD COLUMN IF NOT EXISTS estimated_cost_usd DECIMAL(10, 8) DEFAULT 0.00000000;

    ALTER TABLE messages ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT 0;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT 0;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS estimated_cost_usd DECIMAL(10, 8) DEFAULT 0.00000000;
  `;

  try {
    logger.info("Executing database migration to add tracking columns...");
    const { error } = await supabaseAdmin.rpc("execute_sql", {
      sql_query: query,
    });

    if (error) {
      logger.error("Error executing SQL migration:", error);
    } else {
      logger.info("Database migration completed successfully! Tracking columns added.");
    }
  } catch (err: any) {
    logger.error("Migration failed:", err);
  }
}

addTrackingColumns().then(() => process.exit(0));
