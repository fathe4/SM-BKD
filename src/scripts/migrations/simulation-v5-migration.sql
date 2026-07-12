-- Phase 1 Migration: NPC Multi-Agent Simulation Engine Schema
BEGIN;

-- 1. Clock & Telemetry
CREATE TABLE IF NOT EXISTS simulation_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    current_tick INT DEFAULT 0,
    current_day INT DEFAULT 0,
    season TEXT DEFAULT 'spring',
    last_decay_run TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tick INT NOT NULL,
    active_personas_count INT,
    posts_created_count INT,
    comments_created_count INT,
    likes_created_count INT,
    average_energy FLOAT,
    average_valence FLOAT,
    average_arousal FLOAT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Archetypes & Profile Identities
CREATE TABLE IF NOT EXISTS persona_archetypes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    base_personality JSONB DEFAULT '{}'::jsonb,
    base_style JSONB DEFAULT '{}'::jsonb,
    base_goals TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS persona_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    archetype_id UUID REFERENCES persona_archetypes(id) ON DELETE SET NULL,
    username TEXT NOT NULL UNIQUE,
    profession TEXT,
    age INT,
    country TEXT,
    timezone TEXT DEFAULT 'UTC',
    education TEXT,
    personality_json JSONB DEFAULT '{}'::jsonb,
    writing_style JSONB DEFAULT '{}'::jsonb,
    humor FLOAT DEFAULT 0.5,
    political_bias FLOAT DEFAULT 0.0,
    attention_span FLOAT DEFAULT 0.5,
    curiosity FLOAT DEFAULT 0.5,
    confidence FLOAT DEFAULT 0.5,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS persona_states (
    persona_id UUID PRIMARY KEY REFERENCES persona_identities(id) ON DELETE CASCADE,
    valence FLOAT DEFAULT 0.0 CHECK (valence >= -1.0 AND valence <= 1.0),
    arousal FLOAT DEFAULT 0.5 CHECK (arousal >= 0.0 AND arousal <= 1.0),
    energy FLOAT DEFAULT 1.0 CHECK (energy >= 0.0 AND energy <= 1.0),
    last_online_at TIMESTAMPTZ DEFAULT now(),
    currently_reading_type TEXT,
    currently_reading_id UUID,
    today_post_count INT DEFAULT 0,
    today_comment_count INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS persona_conversation_profiles (
    persona_id UUID PRIMARY KEY REFERENCES persona_identities(id) ON DELETE CASCADE,
    conversation_role TEXT DEFAULT 'observer',
    avg_response_delay_minutes INT DEFAULT 30,
    max_comments_per_thread INT DEFAULT 2,
    reply_probability FLOAT DEFAULT 0.25,
    question_probability FLOAT DEFAULT 0.15,
    disagreement_probability FLOAT DEFAULT 0.20,
    encouragement_probability FLOAT DEFAULT 0.30,
    humor_probability FLOAT DEFAULT 0.10,
    emoji_probability FLOAT DEFAULT 0.05,
    thread_depth_limit INT DEFAULT 3,
    duplicate_tolerance FLOAT DEFAULT 0.20,
    interruption_tolerance FLOAT DEFAULT 0.30,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS persona_social_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id UUID REFERENCES persona_identities(id) ON DELETE CASCADE,
    goal_type TEXT NOT NULL,
    priority FLOAT DEFAULT 0.5 CHECK (priority >= 0.0 AND priority <= 1.0),
    progress FLOAT DEFAULT 0.0 CHECK (progress >= 0.0 AND progress <= 1.0),
    metadata_json JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(persona_id, goal_type)
);

CREATE TABLE IF NOT EXISTS persona_reputations (
    persona_id UUID PRIMARY KEY REFERENCES persona_identities(id) ON DELETE CASCADE,
    technical_credibility FLOAT DEFAULT 0.5 CHECK (technical_credibility >= 0.0 AND technical_credibility <= 1.0),
    humor FLOAT DEFAULT 0.5 CHECK (humor >= 0.0 AND humor <= 1.0),
    kindness FLOAT DEFAULT 0.5 CHECK (kindness >= 0.0 AND kindness <= 1.0),
    toxicity FLOAT DEFAULT 0.0 CHECK (toxicity >= 0.0 AND toxicity <= 1.0),
    helpfulness FLOAT DEFAULT 0.5 CHECK (helpfulness >= 0.0 AND helpfulness <= 1.0),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Knowledge Layer & Evolving Beliefs
CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('topic', 'brand', 'person', 'company', 'product', 'event')),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS persona_interests (
    persona_id UUID REFERENCES persona_identities(id) ON DELETE CASCADE,
    topic_entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    weight FLOAT NOT NULL CHECK (weight >= 0.0 AND weight <= 1.0),
    PRIMARY KEY (persona_id, topic_entity_id)
);

CREATE TABLE IF NOT EXISTS persona_expertise (
    persona_id UUID REFERENCES persona_identities(id) ON DELETE CASCADE,
    topic_entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    knowledge_score FLOAT NOT NULL CHECK (knowledge_score >= 0.0 AND knowledge_score <= 1.0),
    PRIMARY KEY (persona_id, topic_entity_id)
);

CREATE TABLE IF NOT EXISTS persona_opinions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id UUID REFERENCES persona_identities(id) ON DELETE CASCADE,
    entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    stance FLOAT NOT NULL CHECK (stance >= -1.0 AND stance <= 1.0),
    confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0.0 AND confidence <= 1.0),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(persona_id, entity_id)
);

-- 4. Directed Relationships
CREATE TABLE IF NOT EXISTS relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id UUID REFERENCES persona_identities(id) ON DELETE CASCADE,
    target_persona_id UUID REFERENCES persona_identities(id) ON DELETE CASCADE,
    trust FLOAT DEFAULT 0.5 CHECK (trust >= 0.0 AND trust <= 1.0),
    agreement FLOAT DEFAULT 0.5 CHECK (agreement >= 0.0 AND agreement <= 1.0),
    friendship FLOAT DEFAULT 0.5 CHECK (friendship >= 0.0 AND friendship <= 1.0),
    relationship_state JSONB DEFAULT '{}'::jsonb,
    interaction_count INT DEFAULT 0,
    last_interaction TIMESTAMPTZ DEFAULT now(),
    UNIQUE(persona_id, target_persona_id)
);

CREATE TABLE IF NOT EXISTS persona_user_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id UUID REFERENCES persona_identities(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    trust FLOAT DEFAULT 0.5 CHECK (trust >= 0.0 AND trust <= 1.0),
    familiarity FLOAT DEFAULT 0.0 CHECK (familiarity >= 0.0 AND familiarity <= 1.0),
    respect FLOAT DEFAULT 0.5 CHECK (respect >= 0.0 AND respect <= 1.0),
    interaction_style TEXT DEFAULT 'neutral',
    last_topics TEXT[] DEFAULT '{}',
    last_positive_interaction TIMESTAMPTZ,
    last_negative_interaction TIMESTAMPTZ,
    inside_jokes TEXT[] DEFAULT '{}',
    preferred_depth INT DEFAULT 2,
    response_rate FLOAT DEFAULT 0.5,
    last_reply_from_user TEXT,
    interaction_count INT DEFAULT 0,
    last_seen TIMESTAMPTZ DEFAULT now(),
    UNIQUE(persona_id, user_id)
);

CREATE TABLE IF NOT EXISTS social_graph (
    persona_id UUID REFERENCES persona_identities(id) ON DELETE CASCADE,
    target_persona_id UUID REFERENCES persona_identities(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL CHECK (relation_type IN ('follow', 'block', 'mute', 'favorite')),
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (persona_id, target_persona_id, relation_type)
);

-- 5. Ingestion Pool & Caching
CREATE TABLE IF NOT EXISTS feed_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_type TEXT NOT NULL CHECK (candidate_type IN ('news', 'user_post', 'ai_post', 'trending_discussion')),
    origin TEXT NOT NULL CHECK (origin IN ('HUMAN', 'AI', 'NEWS', 'SYSTEM')),
    reference_id UUID,
    title TEXT NOT NULL,
    summary TEXT,
    source TEXT,
    importance FLOAT DEFAULT 0.5,
    topics TEXT[] DEFAULT '{}',
    imageUrl TEXT,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    published_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_metrics (
    feed_candidate_id UUID PRIMARY KEY REFERENCES feed_candidates(id) ON DELETE CASCADE,
    views INT DEFAULT 0,
    likes INT DEFAULT 0,
    comments INT DEFAULT 0,
    shares INT DEFAULT 0,
    velocity FLOAT DEFAULT 0.0,
    controversy FLOAT DEFAULT 0.0,
    quality FLOAT DEFAULT 0.5,
    novelty FLOAT DEFAULT 1.0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feed_items (
    persona_id UUID REFERENCES persona_identities(id) ON DELETE CASCADE,
    feed_candidate_id UUID REFERENCES feed_candidates(id) ON DELETE CASCADE,
    score FLOAT DEFAULT 0.0,
    reason TEXT,
    seen BOOLEAN DEFAULT false,
    clicked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (persona_id, feed_candidate_id)
);
CREATE INDEX IF NOT EXISTS idx_feed_items_expiry ON feed_items(created_at);

-- 6. Communities
CREATE TABLE IF NOT EXISTS communities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    topic TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_members (
    community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
    persona_id UUID REFERENCES persona_identities(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member',
    activity_score FLOAT DEFAULT 0.0,
    last_active_at TIMESTAMPTZ DEFAULT now(),
    notifications_enabled BOOLEAN DEFAULT true,
    joined_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (community_id, persona_id)
);

-- 7. Memories (Episodic and Semantic)
CREATE TABLE IF NOT EXISTS persona_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id UUID REFERENCES persona_identities(id) ON DELETE CASCADE,
    memory_type TEXT NOT NULL CHECK (memory_type IN ('EPISODIC', 'SEMANTIC')),
    entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    importance FLOAT DEFAULT 0.5,
    confidence FLOAT DEFAULT 1.0,
    decay_rate FLOAT DEFAULT 0.05,
    last_recalled_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,
    data_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Jobs & History Decision Trace Logs
CREATE TABLE IF NOT EXISTS behavior_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id UUID REFERENCES persona_identities(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    priority INT DEFAULT 0,
    cost FLOAT DEFAULT 0.0,
    retryable BOOLEAN DEFAULT true,
    run_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending',
    attempts INT DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation_decision_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tick INT NOT NULL,
    persona_id UUID REFERENCES persona_identities(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    target_id UUID,
    decision_trace JSONB DEFAULT '{}'::jsonb,
    internal_thought JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed global clock setting
INSERT INTO simulation_state (current_tick, current_day, season)
VALUES (0, 0, 'spring')
ON CONFLICT DO NOTHING;

COMMIT;
