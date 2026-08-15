-- =============================================================================
-- chat-performance.sql
-- Chat/messaging performance migration for dambala.ca
--
-- What this fixes:
--   1. Sidebar N+1: `getUserChats` used to fire 4-6 queries PER CHAT
--      (~100 round trips for 20 chats). The get_user_chats RPC below returns
--      the entire conversation list in ONE round trip.
--   2. Missing index messages(chat_id, created_at DESC): every "last message"
--      and message-history query sorted in memory after fetching all rows
--      of a chat via the plain (chat_id) index.
--   3. Unread-count queries had no supporting index at all.
--   4. Ordering: conversations are now ordered by a denormalized
--      chats.last_message_at maintained by trigger (the old
--      trigger_update_chat_last_message referenced columns that never existed
--      and was disabled).
--
-- Safe to re-run (idempotent).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Indexes
-- -----------------------------------------------------------------------------

-- Last-message lookups + paginated message history (ORDER BY created_at DESC)
CREATE INDEX IF NOT EXISTS idx_messages_chat_created
  ON public.messages (chat_id, created_at DESC);

-- Unread badge counts: WHERE chat_id = ? AND is_read = false AND sender_id <> ?
CREATE INDEX IF NOT EXISTS idx_messages_chat_unread
  ON public.messages (chat_id, sender_id)
  WHERE is_read = false;

-- Marketplace chat lookup by context
CREATE INDEX IF NOT EXISTS idx_chats_context
  ON public.chats (context_type, context_id);

-- -----------------------------------------------------------------------------
-- 2. Denormalized last-activity column on chats
-- -----------------------------------------------------------------------------

ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz;

-- Sidebar ordering ( populated by the trigger below )
CREATE INDEX IF NOT EXISTS idx_chats_last_message_at
  ON public.chats (last_message_at DESC);

-- Backfill from existing messages (run once; cheap on re-run)
UPDATE public.chats c
SET last_message_at = COALESCE(
  (SELECT MAX(m.created_at)
     FROM public.messages m
    WHERE m.chat_id = c.id AND m.is_deleted = false),
  c.created_at)
WHERE c.last_message_at IS NULL;

-- Keep it fresh on every insert
CREATE OR REPLACE FUNCTION public.set_chat_last_message_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.chats
     SET last_message_at = NEW.created_at
   WHERE id = NEW.chat_id
     AND (last_message_at IS NULL OR NEW.created_at > last_message_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_set_chat_last_message ON public.messages;
CREATE TRIGGER trg_messages_set_chat_last_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.set_chat_last_message_at();

-- -----------------------------------------------------------------------------
-- 3. get_user_chats RPC — the whole conversation list in one round trip
--
--    Returns per chat: chat columns, last message (id/content/sender_name/
--    created_at), unread count, participants (id/username/profile_picture)
--    and AI conversation availability. Privacy filtering of profile pictures
--    stays in the application layer (Redis-cached privacy settings).
--
--    Semantics deliberately match the old Node implementation:
--      - last message:   is_deleted = false only
--      - unread count:   is_read = false AND sender_id <> p_user_id
--      - ordering:       last activity DESC (message time, else chat creation)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_chats(
  p_user_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  is_group_chat boolean,
  name text,
  auto_delete_at timestamptz,
  is_deleted boolean,
  avatar text,
  description text,
  creator_id uuid,
  context_type text,
  context_id uuid,
  last_message jsonb,
  unread_count bigint,
  participants jsonb,
  availability_state text,
  availability_until timestamptz,
  availability_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id, c.created_at, c.is_group_chat, c.name, c.auto_delete_at,
    c.is_deleted, c.avatar, c.description, c.creator_id,
    c.context_type, c.context_id,
    lm.msg                AS last_message,
    uc.cnt                AS unread_count,
    parts.members         AS participants,
    aics.state            AS availability_state,
    aics.until            AS availability_until,
    aics.reason           AS availability_reason
  FROM public.chat_participants cp
  JOIN public.chats c ON c.id = cp.chat_id
  -- last non-deleted message of the chat (index: chat_id, created_at DESC)
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
             'id',          m.id,
             'content',     m.content,
             'sender_name', u.username,
             'created_at',  m.created_at
           ) AS msg
    FROM public.messages m
    JOIN public.users u ON u.id = m.sender_id
    WHERE m.chat_id = c.id
      AND m.is_deleted = false
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON true
  -- unread messages addressed to this user
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.messages m
    WHERE m.chat_id = c.id
      AND m.is_read = false
      AND m.sender_id <> p_user_id
  ) uc ON true
  -- all participants with minimal profile fields
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
             jsonb_build_object(
               'id',              u.id,
               'username',        u.username,
               'profile_picture', u.profile_picture
             ) ORDER BY u.username
           ) AS members
    FROM public.chat_participants cp2
    JOIN public.users u ON u.id = cp2.user_id
    WHERE cp2.chat_id = c.id
  ) parts ON true
  -- AI conversation availability (chat_id is UNIQUE in ai_conversation_states)
  LEFT JOIN public.ai_conversation_states aics ON aics.chat_id = c.id
  WHERE cp.user_id = p_user_id
  ORDER BY COALESCE(
             c.last_message_at,
             (lm.msg->>'created_at')::timestamptz,
             c.created_at
           ) DESC,
           c.created_at DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0)
$$;

-- Allow PostgREST roles to invoke it
GRANT EXECUTE ON FUNCTION public.get_user_chats(uuid, integer, integer)
  TO anon, authenticated;
