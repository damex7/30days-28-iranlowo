import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import { Markdown } from "@/components/markdown";
import { findPublishedBySlug } from "@/lib/repos/articles";
import { CATEGORY_LABELS } from "@/lib/validation/knowledge";
import { formatDate } from "@/lib/format";
import { HelpfulButtons } from "./helpful-buttons";

// Published articles change rarely, so the rendered data is cached and
// tagged. Publishing or editing in /admin/knowledge calls updateTag(), so
// readers see the new version on their next request.
async function loadArticle(slug: string) {
  "use cache";
  cacheTag("articles", `article:${slug}`);
  cacheLife("hours");
  return findPublishedBySlug(slug);
}

export async function generateMetadata({ params }: PageProps<"/help/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const article = /^[a-z0-9-]{1,80}$/.test(slug) ? await loadArticle(slug) : null;
  return { title: article?.title ?? "Article not found" };
}

export default async function ArticlePage({ params }: PageProps<"/help/[slug]">) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  const article = await loadArticle(slug);
  if (!article) notFound();
  return (
    <article className="mx-auto max-w-3xl">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm">
        <Link href="/help">Help centre</Link> <span aria-hidden="true">›</span>{" "}
        <Link href={`/help?category=${article.category}`}>{CATEGORY_LABELS[article.category]}</Link>
      </nav>
      <h1 className="text-4xl">{article.title}</h1>
      <p className="mt-1 text-sm text-muted">Updated {formatDate(article.updated_at)}</p>
      <div className="card mt-5 p-5 sm:p-7">
        <Markdown source={article.body} />
      </div>
      <HelpfulButtons articleId={article.id} />
      <p className="mt-6 text-muted">
        Still need help? <Link href="/support">Chat with us</Link>.
      </p>
    </article>
  );
}
