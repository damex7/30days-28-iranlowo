-- 001: extensions and shared helpers.
--
-- Migrations are numbered so every database applies them in the same order,
-- forward-only so we never have to guess how to "undo" production data, and
-- never edited once applied: a database that already ran 001 will not run it
-- again, so an edit would silently split dev and prod. Fix mistakes with a
-- new, higher-numbered file instead.

-- citext: case-insensitive text, so "Ada@Example.com" and "ada@example.com"
-- are the same email for the unique constraint without lower() everywhere.
CREATE EXTENSION IF NOT EXISTS citext;

-- pg_trgm: splits text into three-letter pieces ("refund" -> " r"," re","ref",
-- "efu","fun","und","nd ") and measures how many pieces two strings share.
-- That is what lets "refnd" or "delivry" still find the right article when
-- full-text search, which matches whole (stemmed) words only, finds nothing.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Keeps updated_at honest without every UPDATE having to remember it.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
