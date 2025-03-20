// src/scripts/migrations/addUserPrivacySettingsTable.ts
import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";

async function runMigration() {
  try {
    logger.info("Starting user_privacy_settings table migration...");

    if (!supabaseAdmin) {
      throw new Error("Supabase admin client not initialized");
    }

    // Create the user_privacy_settings table
    const { error: createTableError } = await supabaseAdmin
      .from("user_privacy_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    // If table doesn't exist, create it
    if (createTableError && createTableError.code === "42P01") {
      // Table doesn't exist
      logger.info("Table doesn't exist, creating it...");

      // We'll use Supabase's SQL API which allows for more controlled execution
      const { error } = await supabaseAdmin.rpc("pgrest_exec", {
        query: `
          CREATE TABLE IF NOT EXISTS user_privacy_settings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            settings JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(user_id)
          );

          CREATE INDEX IF NOT EXISTS idx_user_privacy_settings_user_id ON user_privacy_settings(user_id);
        `,
      });

      if (error) {
        logger.error("Error creating table:", error);
        throw error;
      }

      logger.info("Table created successfully");
    } else if (createTableError) {
      // Some other error occurred
      logger.error("Error checking if table exists:", createTableError);
      throw createTableError;
    } else {
      logger.info("Table already exists, skipping creation");
    }

    logger.info("Migration completed successfully!");
  } catch (error) {
    logger.error("Error running migration:", error);
    process.exit(1);
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  runMigration().catch((error) => {
    logger.error("Migration failed:", error);
    process.exit(1);
  });
}

export default runMigration;
