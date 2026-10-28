-- 005: conversations and their append-only message trail.

CREATE TABLE conversations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT: support history is never removed by deleting an account.
  -- Only demo cleanup deletes conversations, and it does so explicitly.
  customer_id           uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  subject               text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 120),
  -- ai: the assistant answers. waiting_human: handed off, in the queue.
  -- human: an agent has it. resolved: done, CSAT may follow. closed: archived.
  status                text NOT NULL DEFAULT 'ai'
                        CHECK (status IN ('ai', 'waiting_human', 'human', 'resolved', 'closed')),
  -- SET NULL: deactivating or removing an agent returns the case to the
  -- queue rather than deleting the customer's conversation.
  assigned_agent_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  handoff_reason        text CHECK (handoff_reason IN
                          ('low_confidence', 'customer_request', 'negative_sentiment', 'sensitive_topic', 'tool_failure')),
  handed_off_at         timestamptz,
  -- 3–5 lines written by the model (or a template if the model is down) so
  -- the agent does not have to read the whole thread first.
  summary               text CHECK (char_length(summary) <= 1200),
  -- Consecutive questions retrieval could not answer; two in a row = handoff.
  low_conf_streak       integer NOT NULL DEFAULT 0 CHECK (low_conf_streak >= 0),
  first_response_at     timestamptz,
  first_agent_reply_at  timestamptz,
  resolved_at           timestamptz,
  -- 'ai' when the customer marked an assistant-only conversation solved;
  -- this is what "AI resolution rate" counts.
  resolved_by           text CHECK (resolved_by IN ('ai', 'agent', 'customer')),
  closed_at             timestamptz,
  csat_rating           smallint CHECK (csat_rating BETWEEN 1 AND 5),
  csat_comment          text CHECK (char_length(csat_comment) <= 1000),
  -- Each set at most once, so cron steps are idempotent: "send if NULL, then set".
  csat_requested_at     timestamptz,
  stale_flagged_at      timestamptz,
  -- "Agent replied while you were away" goes out once per burst: only when
  -- the customer has not looked since the last email.
  customer_last_seen_at timestamptz NOT NULL DEFAULT now(),
  agent_reply_emailed_at timestamptz,
  last_message_at       timestamptz NOT NULL DEFAULT now(),
  version               integer NOT NULL DEFAULT 1,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- The target of the composite foreign keys below.
  UNIQUE (id, customer_id),
  -- A conversation in the human queue always says why it got there.
  CHECK (status NOT IN ('waiting_human', 'human') OR handoff_reason IS NOT NULL),
  CHECK (status NOT IN ('resolved', 'closed') OR resolved_at IS NOT NULL),
  CHECK (status <> 'human' OR assigned_agent_id IS NOT NULL),
  -- You can only rate a conversation that was resolved.
  CHECK (csat_rating IS NULL OR resolved_at IS NOT NULL)
);
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- Agent inbox: filter by status, keyset on (last_message_at, id) both ways.
CREATE INDEX conversations_inbox_idx ON conversations (status, last_message_at, id);
CREATE INDEX conversations_assigned_idx ON conversations (assigned_agent_id, status) WHERE assigned_agent_id IS NOT NULL;
-- "My conversations", newest first.
CREATE INDEX conversations_customer_idx ON conversations (customer_id, last_message_at DESC);

CREATE TABLE messages (
  -- bigint identity: strictly increasing, so it doubles as the polling
  -- cursor ("give me messages with id > 41").
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id   uuid NOT NULL,
  -- Copied from the conversation so the composite FK below can check it.
  customer_id       uuid NOT NULL,
  sender_role       text NOT NULL CHECK (sender_role IN ('customer', 'assistant', 'agent', 'system')),
  -- RESTRICT: authors are deactivated, not deleted, so attribution survives.
  sender_id         uuid REFERENCES users (id) ON DELETE RESTRICT,
  content           text NOT NULL CHECK (char_length(content) <= 6000),
  -- [{ "chunkId": 12, "slug": "returns-policy", "title": "..." }]
  citations         jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(citations) = 'array'),
  -- An AI-drafted agent reply that a human has not sent yet. Customers never
  -- see drafts; a draft is never sent automatically.
  is_draft          boolean NOT NULL DEFAULT false,
  -- Generated in the browser per send. The unique constraint below turns a
  -- double tap or network retry into a no-op instead of a second message
  -- (and a second model call).
  client_message_id uuid,
  -- The customer message an assistant answer replies to; a retried send
  -- uses it to return the answer already given.
  in_reply_to       bigint REFERENCES messages (id) ON DELETE CASCADE,
  -- The stream was cut (closed tab, Stop button): we keep what was said.
  interrupted       boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- THE COMPOSITE FOREIGN KEY. A plain FK on conversation_id would only
  -- check that the conversation exists. This one checks that it exists
  -- AND belongs to customer_id. Example: Bola's conversation is
  -- (c1, bola). A buggy or malicious insert of
  -- (conversation_id = c1, customer_id = chidi) is refused by the database,
  -- because no conversation (c1, chidi) exists, even if the service
  -- check had a hole.
  -- RESTRICT: messages are the audit trail; a conversation with messages
  -- cannot vanish by accident.
  FOREIGN KEY (conversation_id, customer_id)
    REFERENCES conversations (id, customer_id) ON DELETE RESTRICT,
  -- Assistant and system messages have no human author; others must.
  CHECK ((sender_role IN ('assistant', 'system')) = (sender_id IS NULL)),
  -- A customer can only speak in their own conversation.
  CHECK (sender_role <> 'customer' OR sender_id = customer_id),
  CHECK (NOT is_draft OR sender_role = 'agent'),
  CHECK (content <> '' OR interrupted),
  UNIQUE (conversation_id, client_message_id),
  -- Target for message_feedback's composite FK.
  UNIQUE (id, conversation_id, customer_id)
);
-- Thread reads and polling: WHERE conversation_id = $1 AND id > $since.
CREATE INDEX messages_conversation_idx ON messages (conversation_id, id);
CREATE INDEX messages_reply_idx ON messages (in_reply_to) WHERE in_reply_to IS NOT NULL;

-- Messages are append-only: what the customer was told is a record, like a
-- receipt. Editing it later would make disputes, audits and AI evaluation
-- meaningless. Two exceptions:
--   * a draft (is_draft = true) is scratch paper; it may be edited or
--     deleted, and sending it inserts a fresh, immutable message;
--   * demo cleanup sets app.allow_purge for its own transaction.
CREATE OR REPLACE FUNCTION messages_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.allow_purge', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF OLD.is_draft AND (TG_OP = 'DELETE' OR NEW.is_draft) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'messages are append-only (id %)', OLD.id
    USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER messages_append_only BEFORE UPDATE OR DELETE ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_append_only();

-- A foreign key can say "sender exists", not "sender is an agent". This
-- trigger closes that gap for agent messages.
CREATE OR REPLACE FUNCTION messages_agent_sender() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sender_role = 'agent' AND NOT EXISTS (
    SELECT 1 FROM users WHERE id = NEW.sender_id AND role IN ('agent', 'admin') AND is_active
  ) THEN
    RAISE EXCEPTION 'agent messages need an active agent sender'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER messages_agent_sender BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_agent_sender();

-- An agent can only resolve a conversation that has a trail of a human
-- reply: "resolved" must mean somebody actually answered. Enforced here as
-- well as in the service.
CREATE OR REPLACE FUNCTION conversations_resolve_trail() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'resolved' AND OLD.status <> 'resolved' AND NEW.resolved_by = 'agent'
     AND NOT EXISTS (
       SELECT 1 FROM messages
       WHERE conversation_id = NEW.id AND sender_role = 'agent' AND NOT is_draft
     ) THEN
    RAISE EXCEPTION 'cannot resolve without an agent reply'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER conversations_resolve_trail BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION conversations_resolve_trail();
