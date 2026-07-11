/**
 * Migration: Add persona_chat_memory table
 * Stores facts the AI persona has disclosed to a specific human in DMs.
 * Used to keep AI responses consistent across sessions.
 */
import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";

async function runMigration() {
  logger.info("Running migration: addPersonaChatMemory...");

  const statements = [
    `CREATE TABLE IF NOT EXISTS persona_chat_memory (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      persona_id   UUID NOT NULL REFERENCES persona_identities(id) ON DELETE CASCADE,
      human_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category     TEXT NOT NULL,
      key          TEXT NOT NULL,
      value        TEXT NOT NULL,
      disclosed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at   TIMESTAMPTZ,
      UNIQUE(persona_id, human_id, key)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_persona_chat_memory_lookup
      ON persona_chat_memory(persona_id, human_id)`
  ];

  for (const sql_query of statements) {
    const { error } = await supabaseAdmin!.rpc("execute_sql", { sql_query });
    if (error) {
      logger.error(`Migration step failed: ${error.message}`);
      // Continue — IF NOT EXISTS means safe to re-run
    }
  }

  logger.info("Migration complete.");
}

runMigration().then(() => process.exit(0)).catch(err => {
  logger.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
