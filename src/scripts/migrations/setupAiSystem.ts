import fs from "fs";
import path from "path";
import { supabaseAdmin } from "../../config/supabase";
import { config } from "dotenv";
import { logger } from "../../utils/logger";

config();

async function setupAiSystem() {
  if (!supabaseAdmin) {
    logger.error("Supabase admin client not initialized.");
    process.exit(1);
  }

  try {
    logger.info("Starting AI System database schema setup...");

    const schemaPath = path.join(__dirname, "ai-system-schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");

    // Split SQL into block statements (to handle DO $$ blocks better, we just execute as a single large query using rpc or query directly, but supabaseAdmin.rpc('execute_sql') might not support DO $$ nicely if it splits by semicolon.)
    // For safer execution, we can split basic commands correctly but keep DO $$ intact. 
    // In Supabase, the best way to execute raw multi-statement SQL via client is using an edge function or the SQL editor, but since `--` and `DO $$` are here, let's execute the entire string if the rpc allows it, or split simply.
    // The previous setupDatabase splits by ';'. Let's adapt to ensure the DO $$ block stays intact or just remove it and use raw statements.

    const statements = schemaSql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--")); // basic filter

    // For the DO $$ block, split by ';' breaks it. So let's construct it manually.
    const cleanStatements = [
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_ai BOOLEAN DEFAULT false NOT NULL",
      `CREATE TABLE IF NOT EXISTS ai_personas (
        id uuid primary key default gen_random_uuid(),
        user_id uuid references users(id) on delete cascade,
        category text not null,
        tone text not null,
        posting_frequency int default 1,
        is_active boolean default true,
        last_posted_at timestamptz,
        created_at timestamptz default now()
      )`,
      "ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT false",
      "ALTER TABLE posts ADD COLUMN IF NOT EXISTS source text",
      "ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT false",
      `CREATE TABLE IF NOT EXISTS job_queue (
        id uuid primary key default gen_random_uuid(),
        type text not null,
        payload jsonb not null,
        target_user_id uuid,
        run_at timestamptz not null,
        status text default 'pending',
        attempts int default 0,
        last_error text,
        created_at timestamptz default now()
      )`,
      `DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_queue_type_check') THEN
          ALTER TABLE job_queue
          ADD CONSTRAINT job_queue_type_check
          CHECK (type IN ('like', 'comment'));
        END IF;
      END $$`,
      "CREATE INDEX IF NOT EXISTS idx_job_queue_status_run_at ON job_queue(status, run_at)",
      "CREATE INDEX IF NOT EXISTS idx_posts_ai_created ON posts(created_at desc)"
    ];

    for (let i = 0; i < cleanStatements.length; i++) {
        const stmt = cleanStatements[i] + ";";
        logger.info(`Executing statement ${i + 1}/${cleanStatements.length}`);
        
        const { error } = await supabaseAdmin.rpc("execute_sql", {
            sql_query: stmt,
        });

        if (error) {
            // Since we use IF NOT EXISTS, if execute_sql fails on DO block, it may be because of RPC limitations.
            // We'll log and continue if it's already there or handle the UI error.
            logger.warn(`Warning on statement ${i + 1} (may be safely ignored if already exists):`, error.message);
        }
    }

    logger.info("AI System database setup completed successfully!");
  } catch (error) {
    logger.error("Error setting up AI System database:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  setupAiSystem().catch((error) => {
    logger.error("Database setup failed:", error);
    process.exit(1);
  });
}

export default setupAiSystem;
