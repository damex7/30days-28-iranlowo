import "server-only";
import { withTransaction, isUniqueViolation, type Db } from "@/lib/db";
import type { Actor } from "@/lib/auth/session";
import { chunkArticle } from "@/lib/knowledge/chunker";
import {
  findArticleById,
  findPublishedBySlug,
  insertArticle,
  listAllArticles,
  rebuildVocabulary,
  replaceChunks,
  updateArticle,
  type ArticleRow,
} from "@/lib/repos/articles";
import { recordAudit } from "@/lib/repos/audit";
import { requireAdmin } from "@/lib/services/permissions";
import { ConflictError, NotFoundError, RuleError } from "@/lib/services/errors";
import { searchKnowledge, ASSISTANT_MIN_SCORE } from "@/lib/services/retrieval";
import type { ArticleInput } from "@/lib/validation/knowledge";

/**
 * Saves the article and rebuilds its chunks and the search vocabulary in
 * ONE transaction. If chunking or any insert fails, the article edit is
 * rolled back too, so search can never serve chunks of a version that
 * doesn't exist (or miss chunks of one that does).
 */
export async function writeArticleWithChunks(tx: Db, article: ArticleRow): Promise<number> {
  const chunks = chunkArticle(article.title, article.body);
  await replaceChunks(tx, article.id, chunks);
  await rebuildVocabulary(tx);
  return chunks.length;
}

export async function saveArticle(actor: Actor | null, input: ArticleInput): Promise<ArticleRow> {
  const admin = requireAdmin(actor);
  try {
    return await withTransaction(async (tx) => {
      let article: ArticleRow | null;
      if (input.id) {
        const before = await findArticleById(input.id, tx);
        if (!before) throw new NotFoundError();
        article = await updateArticle(tx, input.id, input.version ?? 0, input);
        if (!article) throw new ConflictError("Someone else saved this article while you were editing. Reload to see their version.");
        if (before.status !== article.status) {
          await recordAudit(tx, admin.id, `article.${article.status === "published" ? "publish" : article.status === "archived" ? "archive" : "unpublish"}`, "article", article.id, { slug: article.slug });
        }
      } else {
        article = await insertArticle(tx, { ...input, authorId: admin.id });
        if (!article) throw new RuleError("Another article already uses that slug.");
        await recordAudit(tx, admin.id, "article.create", "article", article.id, { slug: article.slug, status: article.status });
      }
      await writeArticleWithChunks(tx, article);
      return article;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new RuleError("Another article already uses that slug.");
    throw error;
  }
}

export async function listArticlesForAdmin(actor: Actor | null) {
  requireAdmin(actor);
  return listAllArticles();
}

export async function getArticleForAdmin(actor: Actor | null, id: string) {
  requireAdmin(actor);
  const article = await findArticleById(id);
  if (!article) throw new NotFoundError();
  return article;
}

export async function getPublishedArticle(slug: string) {
  return findPublishedBySlug(slug);
}

/** Admin "Test retrieval": shows exactly what the assistant would pull, with scores. */
export async function testRetrieval(actor: Actor | null, question: string) {
  requireAdmin(actor);
  const { hits } = await searchKnowledge(question, { minScore: 0, limit: 8 });
  return { threshold: ASSISTANT_MIN_SCORE, hits };
}
