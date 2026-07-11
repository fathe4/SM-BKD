import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";

async function runMigration() {
  try {
    logger.info("Starting behavior_jobs lock RPC setup migration...");

    if (!supabaseAdmin) {
      throw new Error("Supabase admin client not initialized");
    }

    // Drop the function first to allow signature updates
    logger.info("Dropping existing claim_next_job function if exists...");
    const { error: dropError } = await supabaseAdmin.rpc("execute_sql", {
      sql_query: `DROP FUNCTION IF EXISTS claim_next_job();`
    });

    if (dropError) {
      logger.error("Error dropping function:", dropError);
      throw dropError;
    }

    const { error } = await supabaseAdmin.rpc("execute_sql", {
      sql_query: `
        CREATE OR REPLACE FUNCTION claim_next_job()
        RETURNS TABLE (
            r_id UUID,
            r_persona_id UUID,
            r_action_type TEXT,
            r_payload JSONB,
            r_priority INT,
            r_attempts INT,
            r_run_at TIMESTAMPTZ,
            r_status TEXT
        ) AS $$
        DECLARE
            target_job RECORD;
        BEGIN
            -- Select the first pending job that is due and lock it
            SELECT * INTO target_job
            FROM behavior_jobs
            WHERE status = 'pending' AND run_at <= NOW()
            ORDER BY priority DESC, run_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED;

            IF target_job.id IS NOT NULL THEN
                -- Mark as processing and increment attempts
                UPDATE behavior_jobs
                SET status = 'processing', attempts = attempts + 1
                WHERE behavior_jobs.id = target_job.id;

                RETURN QUERY
                SELECT 
                    behavior_jobs.id,
                    behavior_jobs.persona_id,
                    behavior_jobs.action_type,
                    behavior_jobs.payload,
                    behavior_jobs.priority,
                    behavior_jobs.attempts,
                    behavior_jobs.run_at,
                    behavior_jobs.status
                FROM behavior_jobs
                WHERE behavior_jobs.id = target_job.id;
            END IF;
        END;
        $$ LANGUAGE plpgsql;
      `
    });

    if (error) {
      logger.error("Error creating behavior_jobs lock function:", error);
      throw error;
    }

    logger.info("RPC claim_next_job function created/updated successfully!");
  } catch (error) {
    logger.error("Migration failed:", error);
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
