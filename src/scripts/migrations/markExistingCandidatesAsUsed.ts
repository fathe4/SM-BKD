// src/scripts/migrations/markExistingCandidatesAsUsed.ts
import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";

async function run() {
  logger.info("Setting is_used = true for candidates that have already been posted...");
  if (!supabaseAdmin) throw new Error("No supabase admin");

  // Fetch all posts with non-null sources
  const { data: posts } = await supabaseAdmin
    .from("posts")
    .select("source")
    .not("source", "is", null);

  const sources = (posts || []).map(p => p.source).filter(Boolean);
  logger.info(`Found ${sources.length} already posted sources.`);

  if (sources.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < sources.length; i += batchSize) {
      const chunk = sources.slice(i, i + batchSize);
      const sql_query = `
        UPDATE feed_candidates 
        SET is_used = true 
        WHERE title IN (${chunk.map(s => `'${s.replace(/'/g, "''")}'`).join(",")});
      `;
      const { error } = await supabaseAdmin.rpc("execute_sql", { sql_query });
      if (error) {
        logger.error(`Error updating chunk: ${error.message}`);
      }
    }
  }
  
  // Also set is_used = true for any feed candidates older than 48 hours to clean up
  const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const cleanupQuery = `
    UPDATE feed_candidates 
    SET is_used = true 
    WHERE created_at < '${twoDaysAgo}' AND is_used = false;
  `;
  await supabaseAdmin.rpc("execute_sql", { sql_query: cleanupQuery });

  logger.info("Done marking existing candidates as used!");
}

run().catch(console.error);
