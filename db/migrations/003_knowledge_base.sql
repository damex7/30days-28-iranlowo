-- 003: help articles, their searchable chunks and the typo lexicon.

CREATE TABLE articles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The public URL /help/<slug>; unique so a citation always points at one article.
  slug         text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  category     text NOT NULL
               CHECK (category IN ('delivery', 'returns', 'payments', 'account', 'products')),
  body         text NOT NULL CHECK (char_length(body) <= 20000),
  -- Only 'published' articles are searched or shown publicly. 'archived'
  -- keeps old citations resolvable for admins without serving stale policy.
  status       text NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'published', 'archived')),
  -- Optimistic locking: an editor saves "version = 3"; if someone else saved
  -- first the row is at 4 and the UPDATE matches nothing.
  version      integer NOT NULL DEFAULT 1,
  -- SET NULL: an article outlives the account that wrote it.
  author_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  published_at timestamptz,
  -- Title words, weighted A, so a title match outranks a passing mention.
  search_title tsvector GENERATED ALWAYS AS (to_tsvector('english', title)) STORED,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'published' OR published_at IS NOT NULL)
);
CREATE TRIGGER articles_updated_at BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- Help centre browsing: published articles in a category, keyset by (title, id).
CREATE INDEX articles_browse_idx ON articles (status, category, title, id);
-- Trigram index so "retrns policy" still matches the title "Returns policy".
CREATE INDEX articles_title_trgm_idx ON articles USING gin (title gin_trgm_ops);

-- Why chunks? An article about delivery covers four cities, fees and
-- weekends. The assistant needs the one paragraph about Ibadan fees, not the
-- whole page: smaller pieces rank more precisely, and only a few fit in the
-- short prompt we can afford on a free tier.
CREATE TABLE article_chunks (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- CASCADE: chunks are derived data, rebuilt from the article on every save.
  article_id     uuid NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  position       integer NOT NULL CHECK (position >= 0),
  heading        text NOT NULL,
  content        text NOT NULL CHECK (char_length(content) <= 4000),
  -- ~4 characters per token; used to stay inside the context budget.
  token_estimate integer NOT NULL CHECK (token_estimate > 0),
  -- Generated, so it can never drift from content. Heading words weigh more (A)
  -- than body words (B).
  search         tsvector GENERATED ALWAYS AS (
                   setweight(to_tsvector('english', heading), 'A') ||
                   setweight(to_tsvector('english', content), 'B')
                 ) STORED,
  -- One chunk per position: a rebuild that ran twice would fail loudly
  -- instead of producing duplicate search hits.
  UNIQUE (article_id, position)
);
-- GIN = an inverted index: lexeme -> list of chunks. "search @@ query" looks
-- up each query word instead of reading every chunk.
CREATE INDEX article_chunks_search_idx ON article_chunks USING gin (search);
-- Trigram index on headings for typo-tolerant heading matches.
CREATE INDEX article_chunks_heading_trgm_idx ON article_chunks USING gin (heading gin_trgm_ops);

-- Every distinct word that appears in published chunks. Retrieval fixes a
-- misspelt query word ("refnd") to its nearest real word ("refund") before
-- building the full-text query. Rebuilt with the chunks.
CREATE TABLE kb_words (
  word text PRIMARY KEY CHECK (word = lower(word))
);
-- GiST (not GIN) because nearest-neighbour ordering, "ORDER BY word <-> 'refnd'",
-- needs a distance-capable index.
CREATE INDEX kb_words_trgm_idx ON kb_words USING gist (word gist_trgm_ops);

-- "Was this helpful?" on public help articles. voter_key is a hash of a
-- random visitor cookie (or the user id), so one vote per browser per article.
CREATE TABLE article_feedback (
  article_id uuid NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  voter_key  text NOT NULL,
  helpful    boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, voter_key)
);
