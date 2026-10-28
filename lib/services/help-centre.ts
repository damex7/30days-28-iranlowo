import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { categoryCounts, findPublishedBySlug, listPublished, recordArticleFeedback, type Category } from "@/lib/repos/articles";
import { searchKnowledge, type SearchHit } from "@/lib/services/retrieval";
import { enforce } from "@/lib/services/rate-limit";
import { NotFoundError } from "@/lib/services/errors";
import type { Actor } from "@/lib/auth/session";
import type { HelpSearch } from "@/lib/validation/knowledge";

const PAGE = 10;
const UUID = /^[0-9a-f-]{36}$/i;

export type HelpPage =
  | { mode: "search"; hits: SearchHit[]; next: string | null; isFirstPage: boolean }
  | { mode: "browse"; articles: { id: string; slug: string; title: string; category: Category; excerpt: string }[]; next: string | null; isFirstPage: boolean };

/** The public help centre, open to visitors (actor may be null). */
export async function helpCentrePage(actor: Actor | null, params: HelpSearch): Promise<HelpPage> {
  if (params.q.length >= 2) {
    const c = decodeCursor(params.after, 2);
    const after = c && Number.isFinite(Number(c[0])) && /^\d+$/.test(c[1] ?? "") ? { score: Number(c[0]), chunkId: Number(c[1]) } : null;
    const { hits, hasMore } = await searchKnowledge(params.q, { category: params.category ?? null, limit: PAGE, after });
    const last = hits.at(-1);
    return { mode: "search", hits, isFirstPage: !after, next: hasMore && last ? encodeCursor([last.score, last.chunkId]) : null };
  }
  const c = decodeCursor(params.after, 2);
  const after = c && UUID.test(c[1] ?? "") ? { title: c[0]!, id: c[1]! } : null;
  const rows = await listPublished(params.category ?? null, after, PAGE);
  const articles = rows.slice(0, PAGE);
  const last = articles.at(-1);
  return { mode: "browse", articles, isFirstPage: !after, next: rows.length > PAGE && last ? encodeCursor([last.title, last.id]) : null };
}

export const helpCategories = () => categoryCounts();

export async function helpArticle(slug: string) {
  const article = await findPublishedBySlug(slug);
  if (!article) throw new NotFoundError();
  return article;
}

/**
 * "Was this helpful?" One vote per browser per article: the voter key is a
 * hash of the user id, or of a random visitor cookie, never an IP address.
 */
export async function voteOnArticle(actor: Actor | null, articleId: string, helpful: boolean): Promise<void> {
  const jar = await cookies();
  let visitor = jar.get("iranlowo_visitor")?.value;
  if (!visitor) {
    visitor = randomBytes(16).toString("base64url");
    jar.set("iranlowo_visitor", visitor, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 365 * 86400 });
  }
  const key = createHash("sha256").update(actor ? `user:${actor.id}` : `visitor:${visitor}`).digest("hex");
  await enforce(`article-vote:${key}`, 30, 3600, "Thanks, we've got your votes.");
  await recordArticleFeedback(articleId, key, helpful);
}
