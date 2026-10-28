import "server-only";
import { db, type Db } from "@/lib/db";
import type { Chunk } from "@/lib/knowledge/chunker";

export type Category = "delivery" | "returns" | "payments" | "account" | "products";
export type ArticleStatus = "draft" | "published" | "archived";

export type ArticleRow = {
  id: string;
  slug: string;
  title: string;
  category: Category;
  body: string;
  status: ArticleStatus;
  version: number;
  author_id: string | null;
  published_at: string | null;
  updated_at: string;
};

const COLUMNS = "id, slug, title, category, body, status, version, author_id, published_at::text, updated_at::text";

export async function findPublishedBySlug(slug: string): Promise<ArticleRow | null> {
  const rows = await db.query<ArticleRow>(`SELECT ${COLUMNS} FROM articles WHERE slug = $1 AND status = 'published'`, [slug]);
  return rows[0] ?? null;
}

export async function findArticleById(id: string, q: Db = db): Promise<ArticleRow | null> {
  const rows = await q.query<ArticleRow>(`SELECT ${COLUMNS} FROM articles WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export type ArticleListItem = { id: string; slug: string; title: string; category: Category; status: ArticleStatus; updated_at: string; chunk_count: number };

export async function listAllArticles(): Promise<ArticleListItem[]> {
  return db.query<ArticleListItem>(
    `SELECT a.id, a.slug, a.title, a.category, a.status, a.updated_at::text,
            (SELECT count(*)::int FROM article_chunks c WHERE c.article_id = a.id) AS chunk_count
       FROM articles a ORDER BY a.category, a.title`,
  );
}

/**
 * Published articles for browsing, keyset-paginated on (title, id).
 * "WHERE (title, id) > ($after_title, $after_id)" jumps straight to the
 * next page through the index; OFFSET 40 would read and throw away 40 rows
 * every time, and a row inserted meanwhile would shift every later page.
 * id is the tie-breaker so two articles with the same title never swap.
 */
export async function listPublished(category: Category | null, after: { title: string; id: string } | null, limit: number) {
  return db.query<{ id: string; slug: string; title: string; category: Category; excerpt: string }>(
    `SELECT id, slug, title, category, left(regexp_replace(body, '[#*\\[\\]()]', '', 'g'), 180) AS excerpt
       FROM articles
      WHERE status = 'published'
        AND ($1::text IS NULL OR category = $1)
        AND ($2::text IS NULL OR (title, id) > ($2::text, $3::uuid))
      ORDER BY title, id
      LIMIT $4`,
    [category, after?.title ?? null, after?.id ?? null, limit + 1],
  );
}

export async function categoryCounts(): Promise<{ category: Category; count: number }[]> {
  return db.query(`SELECT category, count(*)::int AS count FROM articles WHERE status = 'published' GROUP BY category ORDER BY category`);
}

export async function insertArticle(
  q: Db,
  input: { slug: string; title: string; category: Category; body: string; status: ArticleStatus; authorId: string | null },
): Promise<ArticleRow | null> {
  const rows = await q.query<ArticleRow>(
    `INSERT INTO articles (slug, title, category, body, status, author_id, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $5 = 'published' THEN now() END)
     ON CONFLICT (slug) DO NOTHING
     RETURNING ${COLUMNS}`,
    [input.slug, input.title, input.category, input.body, input.status, input.authorId],
  );
  return rows[0] ?? null;
}

/** Optimistic update: only succeeds if nobody saved since `version` was read. */
export async function updateArticle(
  q: Db,
  id: string,
  version: number,
  input: { slug: string; title: string; category: Category; body: string; status: ArticleStatus },
): Promise<ArticleRow | null> {
  const rows = await q.query<ArticleRow>(
    `UPDATE articles
        SET slug = $3, title = $4, category = $5, body = $6, status = $7,
            published_at = CASE WHEN $7 = 'published' THEN COALESCE(published_at, now()) ELSE published_at END,
            version = version + 1
      WHERE id = $1 AND version = $2
      RETURNING ${COLUMNS}`,
    [id, version, input.slug, input.title, input.category, input.body, input.status],
  );
  return rows[0] ?? null;
}

export async function replaceChunks(q: Db, articleId: string, chunks: Chunk[]): Promise<void> {
  await q.query(`DELETE FROM article_chunks WHERE article_id = $1`, [articleId]);
  if (chunks.length === 0) return;
  // One INSERT for all chunks, values passed as parallel arrays.
  await q.query(
    `INSERT INTO article_chunks (article_id, position, heading, content, token_estimate)
     SELECT $1, * FROM unnest($2::int[], $3::text[], $4::text[], $5::int[])`,
    [articleId, chunks.map((c) => c.position), chunks.map((c) => c.heading), chunks.map((c) => c.content), chunks.map((c) => c.tokenEstimate)],
  );
}

/** Rebuilds the typo-repair vocabulary from every published chunk. */
export async function rebuildVocabulary(q: Db): Promise<void> {
  await q.query(`DELETE FROM kb_words`);
  await q.query(
    `INSERT INTO kb_words (word)
     SELECT DISTINCT w
       FROM article_chunks c
       JOIN articles a ON a.id = c.article_id AND a.status = 'published',
            regexp_split_to_table(lower(c.heading || ' ' || c.content || ' ' || a.title), '[^[:alnum:]]+') AS w
      WHERE length(w) BETWEEN 3 AND 30
     ON CONFLICT DO NOTHING`,
  );
}

export async function recordArticleFeedback(articleId: string, voterKey: string, helpful: boolean): Promise<void> {
  await db.query(
    `INSERT INTO article_feedback (article_id, voter_key, helpful) VALUES ($1, $2, $3)
     ON CONFLICT (article_id, voter_key) DO UPDATE SET helpful = EXCLUDED.helpful, created_at = now()`,
    [articleId, voterKey, helpful],
  );
}
