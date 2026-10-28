-- 007: agent tools and operational history.

CREATE TABLE canned_replies (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 80),
  body       text NOT NULL CHECK (char_length(body) BETWEEN 2 AND 2000),
  category   text NOT NULL CHECK (category IN ('delivery', 'returns', 'payments', 'account', 'products', 'general')),
  -- SET NULL: a useful reply outlives its author.
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (title)
);
CREATE TRIGGER canned_replies_updated_at BEFORE UPDATE ON canned_replies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Who decided what: publishing an article, reassigning or resolving a case,
-- promoting an agent. Append-only by convention (no UPDATE path in the app).
CREATE TABLE audit_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- SET NULL: the record of the decision stays even if the actor goes.
  actor_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  action      text NOT NULL,
  target_type text NOT NULL,
  target_id   text NOT NULL,
  detail      jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_target_idx ON audit_events (target_type, target_id, created_at DESC);
CREATE INDEX audit_events_created_idx ON audit_events (created_at DESC);

-- Daily housekeeping history, from the Vercel cron or a lazy run on page load.
CREATE TABLE cron_runs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trigger     text NOT NULL CHECK (trigger IN ('cron', 'lazy', 'manual')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  results     jsonb NOT NULL DEFAULT '{}',
  error       text
);
CREATE INDEX cron_runs_started_idx ON cron_runs (started_at DESC);
