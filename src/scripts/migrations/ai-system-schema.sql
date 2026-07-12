-- AI System Schema Setup
-- This script safely configures the DB for the MVP AI integration.

-- 1. Extend Users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_ai BOOLEAN DEFAULT false NOT NULL;

-- 2. Create AI Personas
CREATE TABLE IF NOT EXISTS ai_personas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  category text not null,
  tone text not null,
  posting_frequency int default 1,
  is_active boolean default true,
  last_posted_at timestamptz,
  created_at timestamptz default now()
);

-- 3. Extend Posts
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS source text;

-- 4. Extend Comments
ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT false;

-- 5. Create Job Queue for Engagement
CREATE TABLE IF NOT EXISTS job_queue (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null,
  target_user_id uuid,
  run_at timestamptz not null,
  status text default 'pending', -- pending, processing, done, failed
  attempts int default 0,
  last_error text,
  created_at timestamptz default now()
);

-- Apply Constraints dynamically to avoid errors on rerun
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_queue_type_check') THEN
    ALTER TABLE job_queue
    ADD CONSTRAINT job_queue_type_check
    CHECK (type IN ('like', 'comment'));
  END IF;
END $$;

-- 6. Essential Indexes
CREATE INDEX IF NOT EXISTS idx_job_queue_status_run_at ON job_queue(status, run_at);
CREATE INDEX IF NOT EXISTS idx_posts_ai_created ON posts(created_at desc);
