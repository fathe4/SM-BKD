// src/scripts/migrations/addAiBehaviorEngineTables.ts
import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";

async function runMigration() {
  try {
    logger.info("Starting AI Behavior Engine tables migration...");

    if (!supabaseAdmin) {
      throw new Error("Supabase admin client not initialized");
    }

    const statements = [
      // 1. Create types/enums using PL/pgSQL blocks
      `DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'relationship_stage_type') THEN
              CREATE TYPE relationship_stage_type AS ENUM ('UNKNOWN', 'NEW_FRIEND', 'ACQUAINTANCE', 'CASUAL', 'FRIEND', 'CLOSE');
          END IF;
      END$$;`,

      `DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'opportunity_type') THEN
              CREATE TYPE opportunity_type AS ENUM ('FRIEND_ACCEPTED', 'HUMAN_POSTED', 'HUMAN_COMMENTED', 'AI_WAS_MENTIONED', 'NEW_DAY', 'HUMAN_ONLINE');
          END IF;
      END$$;`,

      // 2. Create user_ai_interaction_stats table
      `CREATE TABLE IF NOT EXISTS user_ai_interaction_stats (
          human_user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          first_ai_dm_at TIMESTAMP WITH TIME ZONE,
          last_ai_dm_at TIMESTAMP WITH TIME ZONE,
          last_ai_greeting_at TIMESTAMP WITH TIME ZONE,
          total_ai_dms INTEGER DEFAULT 0,
          total_ai_conversations INTEGER DEFAULT 0,
          last_ai_sender_id UUID REFERENCES users(id)
      );`,

      // 3. Create relationship_stages table
      `CREATE TABLE IF NOT EXISTS relationship_stages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          human_id UUID REFERENCES users(id) ON DELETE CASCADE,
          persona_id UUID REFERENCES persona_identities(id) ON DELETE CASCADE,
          stage relationship_stage_type DEFAULT 'UNKNOWN',
          interactions_count INTEGER DEFAULT 0,
          last_interaction_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE (human_id, persona_id)
      );`,

      // 4. Create behavior_opportunities table
      `CREATE TABLE IF NOT EXISTS behavior_opportunities (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          persona_id UUID REFERENCES persona_identities(id) ON DELETE CASCADE,
          human_id UUID REFERENCES users(id) ON DELETE CASCADE,
          type opportunity_type NOT NULL,
          context JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );`,

      // 5. Create behavior_decisions table
      `CREATE TABLE IF NOT EXISTS behavior_decisions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          opportunity_id UUID REFERENCES behavior_opportunities(id) ON DELETE CASCADE,
          decision VARCHAR(50) NOT NULL,
          probability_score NUMERIC(5,2),
          reason TEXT,
          scheduled_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );`,

      // 6. Indices for performance
      `CREATE INDEX IF NOT EXISTS idx_relationship_stages_human_persona ON relationship_stages(human_id, persona_id);`,
      `CREATE INDEX IF NOT EXISTS idx_behavior_opp_persona_human ON behavior_opportunities(persona_id, human_id);`,
      `CREATE INDEX IF NOT EXISTS idx_behavior_dec_opportunity ON behavior_decisions(opportunity_id);`
    ];

    logger.info("Executing statements one by one via execute_sql RPC...");
    for (const sql_query of statements) {
      const { error } = await supabaseAdmin.rpc("execute_sql", { sql_query });
      if (error) {
        logger.error(`Migration step failed for statement: ${sql_query.slice(0, 100)}...`);
        logger.error(`Error: ${error.message}`);
        throw error;
      }
    }

    logger.info("AI Behavior Engine migration completed successfully!");
  } catch (error) {
    logger.error("Error running migration:", error);
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
