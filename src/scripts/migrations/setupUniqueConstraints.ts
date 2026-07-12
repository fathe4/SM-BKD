import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";

async function runMigration() {
  try {
    logger.info("Starting database uniqueness constraint migration...");

    if (!supabaseAdmin) {
      throw new Error("Supabase admin client not initialized");
    }

    // 1. Clean up duplicate candidates in feed_candidates (keeping the one with the lowest ID)
    logger.info("Cleaning up duplicate candidates in feed_candidates...");
    const { error: cleanCandidatesError } = await supabaseAdmin.rpc("execute_sql", {
      sql_query: `
        DELETE FROM feed_candidates a
        USING feed_candidates b
        WHERE a.id > b.id
          AND a.title = b.title;
      `
    });

    if (cleanCandidatesError) {
      logger.error("Error cleaning duplicate candidates:", cleanCandidatesError);
      throw cleanCandidatesError;
    }

    // 2. Clean up duplicate posts in posts (including their media elements)
    logger.info("Cleaning up duplicate media and posts in the database...");
    const { error: cleanMediaError } = await supabaseAdmin.rpc("execute_sql", {
      sql_query: `
        DELETE FROM post_media
        WHERE post_id IN (
          SELECT a.id FROM posts a, posts b
          WHERE a.id > b.id
            AND a.source = b.source
            AND a.source IS NOT NULL
            AND a.source != ''
        );
      `
    });

    if (cleanMediaError) {
      logger.error("Error cleaning duplicate post media:", cleanMediaError);
      throw cleanMediaError;
    }

    const { error: cleanPostsError } = await supabaseAdmin.rpc("execute_sql", {
      sql_query: `
        DELETE FROM posts a
        USING posts b
        WHERE a.id > b.id
          AND a.source = b.source
          AND a.source IS NOT NULL
          AND a.source != '';
      `
    });

    if (cleanPostsError) {
      logger.error("Error cleaning duplicate posts:", cleanPostsError);
      throw cleanPostsError;
    }

    // 3. Add UNIQUE constraint on feed_candidates(title)
    logger.info("Adding unique constraint to feed_candidates(title)...");
    const { error: constraintError } = await supabaseAdmin.rpc("execute_sql", {
      sql_query: `
        ALTER TABLE feed_candidates DROP CONSTRAINT IF EXISTS feed_candidates_title_unique;
        ALTER TABLE feed_candidates ADD CONSTRAINT feed_candidates_title_unique UNIQUE (title);
      `
    });

    if (constraintError) {
      logger.error("Error adding unique constraint to feed_candidates:", constraintError);
      throw constraintError;
    }

    // 4. Create UNIQUE index on posts(source)
    logger.info("Creating unique index on posts(source)...");
    const { error: postsIndexError } = await supabaseAdmin.rpc("execute_sql", {
      sql_query: `
        DROP INDEX IF EXISTS posts_source_unique_idx;
        CREATE UNIQUE INDEX posts_source_unique_idx ON posts (source) WHERE (source IS NOT NULL AND source != '');
      `
    });

    if (postsIndexError) {
      logger.error("Error creating unique index on posts(source):", postsIndexError);
      throw postsIndexError;
    }

    logger.info("Database uniqueness constraints migration completed successfully!");
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
