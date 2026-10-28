import "server-only";
import { db, type Db } from "@/lib/db";
import type { Category } from "@/lib/repos/articles";
import { slugify } from "@/lib/markdown";

// RETRIEVAL: one SQL query turns a question into ranked chunks of
// published help articles. The same function serves the public help-centre
// search and the assistant, so customers and the AI see the same answers.
//
// How the query scores a chunk (all parts are 0..1):
//
//   score = 0.55 x text rank      ts_rank_cd over the chunk's tsvector, using an
//                                 OR of the (typo-repaired) question words, so a
//                                 chunk covering more of them, closer together,
//                                 ranks higher. Heading words weigh more than body.
//                                 Normalisation 32 maps rank r to r/(r+1).
//         + 0.15 x all words     1 if the chunk matches websearch_to_tsquery of the
//                                 raw question (every word present, quotes and
//                                 -minus respected), else 0.
//         + 0.30 x name match    pg_trgm word_similarity of the chunk heading or
//                                 article title against the question: catches
//                                 "refnd" / "delivry fee" even when no word matches.
//
// Typo repair: each question word of 4+ letters that is not in kb_words (the
// vocabulary of the knowledge base) is swapped for its nearest kb_words
// entry by trigram distance, if one is similar enough. "refnd" -> "refund".
//
// Candidate rows are found through indexes before any scoring:
//   search @@ loose     -> GIN index on article_chunks.search
//   heading % question  -> GIN trigram index on article_chunks.heading
//   title % question    -> GIN trigram index on articles.title
// then only those candidates are scored. Rows below minScore are dropped:
// "no result" is an answer too. It means the knowledge base doesn't cover the
// question, and the assistant must say so and offer a person rather than guess.

export type SearchHit = {
  chunkId: number;
  articleId: string;
  slug: string;
  title: string;
  category: Category;
  heading: string;
  anchor: string;
  content: string;
  snippet: string;
  score: number;
};

export type SearchOptions = {
  category?: Category | null;
  /** Assistant uses a stricter bar than the help centre. */
  minScore?: number;
  limit?: number;
  /** Keyset cursor from the previous page: (score, chunkId) of its last row. */
  after?: { score: number; chunkId: number } | null;
};

/** Below this the help centre shows "no results". */
export const HELP_MIN_SCORE = 0.2;
/** Below this the assistant treats retrieval as "nothing found". Calibrated on the seed: on-topic questions (typos included) score 0.44+, off-topic ones 0.18 or less. */
export const ASSISTANT_MIN_SCORE = 0.3;

export const SEARCH_SQL = `
WITH words AS (
  SELECT w.word, w.ord
    FROM regexp_split_to_table(lower($1::text), '[^[:alnum:]]+') WITH ORDINALITY AS w(word, ord)
   WHERE length(w.word) >= 2
),
repaired AS (
  SELECT ord,
         CASE
           WHEN length(words.word) < 4 OR words.word ~ '^[0-9]+$'
                OR EXISTS (SELECT 1 FROM kb_words k WHERE k.word = words.word)
             THEN words.word
           ELSE COALESCE((SELECT k.word FROM kb_words k
                           WHERE k.word % words.word
                           ORDER BY k.word <-> words.word LIMIT 1), words.word)
         END AS word
    FROM words
),
q AS (
  SELECT websearch_to_tsquery('english', $1::text) AS strict,
         -- plainto_tsquery stems and drops stop words; swapping & for | turns
         -- "all of these words" into "any of these words".
         replace(plainto_tsquery('english', COALESCE(string_agg(word, ' ' ORDER BY ord), ''))::text, ' & ', ' | ')::tsquery AS loose,
         COALESCE(string_agg(word, ' ' ORDER BY ord), '') AS fixed_text
    FROM repaired
),
scored AS (
  SELECT c.id, a.id AS article_id, a.slug, a.title, a.category, c.heading, c.content,
         round((
           0.55 * ts_rank_cd(c.search || setweight(a.search_title, 'A'), q.loose, 32)
         + 0.15 * (c.search @@ q.strict)::int
         + 0.30 * greatest(word_similarity(c.heading, q.fixed_text), word_similarity(a.title, q.fixed_text))
         )::numeric, 6) AS score,
         q.loose
    FROM article_chunks c
    JOIN articles a ON a.id = c.article_id
   CROSS JOIN q
   WHERE a.status = 'published'
     AND ($2::text IS NULL OR a.category = $2::text)
     AND (c.search @@ q.loose OR c.heading % $1::text OR a.title % $1::text)
)
SELECT id::int AS chunk_id, article_id, slug, title, category, heading, content, score::float8 AS score,
       ts_headline('english', content, loose, 'MaxWords=28, MinWords=12, StartSel=<<, StopSel=>>') AS snippet
  FROM scored
 WHERE score >= $3::numeric
   AND ($5::numeric IS NULL OR (score, id) < ($5::numeric, $6::bigint))
 ORDER BY score DESC, id DESC
 LIMIT $4::int`;

type SearchRow = {
  chunk_id: number;
  article_id: string;
  slug: string;
  title: string;
  category: Category;
  heading: string;
  content: string;
  score: number;
  snippet: string;
};

/**
 * Returns up to `limit` hits plus whether more exist. Input is passed as
 * parameters only; the SQL text above never changes with what was typed.
 */
export async function searchKnowledge(query: string, options: SearchOptions = {}, q: Db = db): Promise<{ hits: SearchHit[]; hasMore: boolean }> {
  const text = query.trim().slice(0, 200);
  if (text.length < 2) return { hits: [], hasMore: false };
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 20);
  const rows = await q.query<SearchRow>(SEARCH_SQL, [
    text,
    options.category ?? null,
    options.minScore ?? HELP_MIN_SCORE,
    limit + 1,
    options.after?.score ?? null,
    options.after?.chunkId ?? null,
  ]);
  return {
    hasMore: rows.length > limit,
    hits: rows.slice(0, limit).map((r) => ({
      chunkId: r.chunk_id,
      articleId: r.article_id,
      slug: r.slug,
      title: r.title,
      category: r.category,
      heading: r.heading,
      anchor: r.heading === r.title ? "" : slugify(r.heading),
      content: r.content,
      snippet: r.snippet,
      score: r.score,
    })),
  };
}

/** The assistant's view: the top few chunks above the stricter threshold. */
export async function retrieveForAssistant(question: string, limit: number) {
  const { hits } = await searchKnowledge(question, { minScore: ASSISTANT_MIN_SCORE, limit });
  return hits;
}
