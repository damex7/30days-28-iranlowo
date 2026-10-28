-- 006: one row per model call, and thumbs up/down on assistant answers.

-- Why log every model call?
--   * debugging: "why did it say that?" -> which chunks, which tools, which outcome;
--   * cost: tokens add up; the free tier hides that, the estimate shows it;
--   * evaluation: handoff reasons + thumbs-down + retrieved chunks show where
--     the knowledge base has gaps.
-- What we must NOT log: full prompts with personal details. We keep a short,
-- masked excerpt of the question (emails and phone numbers replaced) and the
-- names and masked arguments of the tools called, never their full results.
CREATE TABLE ai_runs (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- CASCADE: a run is diagnostic data about its conversation; when demo
  -- cleanup deletes a conversation, its runs go too. NULL = not tied to a
  -- conversation (none today, kept for admin tools).
  conversation_id          uuid REFERENCES conversations (id) ON DELETE CASCADE,
  -- SET NULL: a draft message can be discarded; the run (and its cost) stays.
  message_id               bigint REFERENCES messages (id) ON DELETE SET NULL,
  purpose                  text NOT NULL CHECK (purpose IN ('answer', 'classify', 'summarise', 'draft_reply')),
  provider                 text NOT NULL CHECK (provider IN ('gemini', 'mock')),
  model                    text NOT NULL,
  prompt_version           text NOT NULL,
  input_tokens             integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens            integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  latency_ms               integer NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  -- What this call would cost on a paid plan, in millionths of a dollar
  -- (integer, like kobo): tokens x price from lib/ai/pricing.ts.
  estimated_cost_micro_usd bigint NOT NULL DEFAULT 0 CHECK (estimated_cost_micro_usd >= 0),
  retrieved_chunk_ids      bigint[] NOT NULL DEFAULT '{}',
  retrieval_top_score      real,
  -- [{ "name": "get_order_status", "args": { "order_number": "OJX-2***13" }, "ok": true }]
  tools_called             jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(tools_called) = 'array'),
  outcome                  text NOT NULL CHECK (outcome IN
                             ('answered', 'handoff', 'refused', 'error', 'timeout', 'rate_limited', 'fallback_mock')),
  error_code               text,
  -- Masked, truncated question: powers "top questions that caused handoffs".
  question_excerpt         text CHECK (char_length(question_excerpt) <= 200),
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_runs_created_idx ON ai_runs (created_at DESC, id DESC);
CREATE INDEX ai_runs_conversation_idx ON ai_runs (conversation_id);
CREATE INDEX ai_runs_message_idx ON ai_runs (message_id) WHERE message_id IS NOT NULL;

CREATE TABLE message_feedback (
  message_id      bigint NOT NULL,
  conversation_id uuid NOT NULL,
  customer_id     uuid NOT NULL,
  -- CASCADE: a vote belongs to the voter.
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rating          text NOT NULL CHECK (rating IN ('up', 'down')),
  reason          text CHECK (reason IN ('wrong', 'not_relevant', 'unclear', 'wanted_person', 'other')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Composite FK: the vote must point at a message of THIS conversation of
  -- THIS customer. CASCADE: feedback is about the message; it goes with it.
  FOREIGN KEY (message_id, conversation_id, customer_id)
    REFERENCES messages (id, conversation_id, customer_id) ON DELETE CASCADE,
  -- Only the customer who owns the conversation can rate its answers.
  CHECK (user_id = customer_id),
  CHECK (rating = 'down' OR reason IS NULL),
  -- One vote per person per message; changing your mind updates it.
  UNIQUE (message_id, user_id)
);
CREATE TRIGGER message_feedback_updated_at BEFORE UPDATE ON message_feedback
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX message_feedback_created_idx ON message_feedback (created_at);
