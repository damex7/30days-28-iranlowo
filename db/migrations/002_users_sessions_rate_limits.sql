-- 002: people, sign-in sessions and the database-backed rate limiter.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- citext + UNIQUE: one account per email, whatever the capitalisation.
  email         citext NOT NULL UNIQUE CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  display_name  text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  -- "scrypt$N$r$p$salt$hash": the parameters travel with the hash so they
  -- can be raised later without breaking old passwords. NULL = no password
  -- (demo users sign in only through the demo button).
  password_hash text,
  role          text NOT NULL DEFAULT 'customer'
                CHECK (role IN ('customer', 'agent', 'admin')),
  -- Agents are deactivated, never deleted, so their old replies keep an author.
  is_active     boolean NOT NULL DEFAULT true,
  -- Demo users are the only rows the daily cron is allowed to delete.
  is_demo       boolean NOT NULL DEFAULT false,
  -- The read-only shared demo agent: services refuse every write for it.
  is_read_only  boolean NOT NULL DEFAULT false,
  phone         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- Cron looks for old demo users; a partial index keeps that lookup tiny.
CREATE INDEX users_demo_created_idx ON users (created_at) WHERE is_demo;

CREATE TABLE sessions (
  -- We store only SHA-256(token). The raw token lives in the browser cookie.
  -- If this table leaks (a backup, a log, a SQL injection elsewhere), the
  -- hashes cannot be replayed as cookies, because you cannot reverse SHA-256
  -- of 32 random bytes. A random token needs no salt or slow hash: there is
  -- nothing to brute-force.
  token_hash  text PRIMARY KEY,
  -- CASCADE: a session means nothing without its user; deleting a demo user
  -- signs them out everywhere in the same statement.
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
-- "Sign out everywhere" and cleanup of a user's sessions.
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- Fixed-window rate limiter. On serverless every request may run in a fresh
-- instance, so an in-memory counter resets constantly and each instance has
-- its own; the database is the one place all instances share.
CREATE TABLE rate_limits (
  -- e.g. 'signin:ip:1.2.3.4', 'chat:user:<uuid>', 'demo:ip:...'
  key          text NOT NULL,
  -- Start of the window (now() truncated to the window size), so each window
  -- is its own row and old rows can simply be deleted.
  window_start timestamptz NOT NULL,
  count        integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  -- The primary key is what makes INSERT ... ON CONFLICT DO UPDATE atomic:
  -- two concurrent requests cannot both create the row and both read 0.
  PRIMARY KEY (key, window_start)
);
CREATE INDEX rate_limits_window_idx ON rate_limits (window_start);
