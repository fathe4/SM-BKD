import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";
import { config } from "dotenv";

config();

async function runPresenceMigration() {
  if (!supabaseAdmin) {
    logger.error("Supabase admin client not initialized.");
    process.exit(1);
  }

  try {
    logger.info("Starting AI presence and conversation availability migration...");

    const statements = [
      "ALTER TABLE persona_states ADD COLUMN IF NOT EXISTS presence_state TEXT DEFAULT 'ONLINE';",
      "ALTER TABLE persona_states ADD COLUMN IF NOT EXISTS current_activity TEXT DEFAULT 'ONLINE';",
      `CREATE TABLE IF NOT EXISTS ai_conversation_states (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          chat_id UUID REFERENCES chats(id) ON DELETE CASCADE UNIQUE,
          persona_id UUID REFERENCES persona_identities(id) ON DELETE CASCADE,
          human_id UUID REFERENCES users(id) ON DELETE CASCADE,
          state TEXT NOT NULL DEFAULT 'AVAILABLE',
          until TIMESTAMPTZ,
          reason TEXT NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT now()
      );`
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

    logger.info("AI presence and conversation availability migration completed successfully!");
  } catch (error) {
    logger.error("Migration failed:", error);
    process.exit(1);
  }
}

runPresenceMigration().catch((error) => {
  logger.error("Migration script failed:", error);
  process.exit(1);
});
