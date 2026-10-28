import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { adminOr404 } from "@/lib/admin-guard";
import { listArticlesForAdmin } from "@/lib/services/knowledge";
import { CATEGORY_LABELS } from "@/lib/validation/knowledge";
import { formatDateTime } from "@/lib/format";
import { TestRetrieval } from "./test-retrieval";

export const metadata: Metadata = { title: "Knowledge base" };

export default function KnowledgePage() {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-3xl">Knowledge base</h1>
        <Link href="/admin/knowledge/new" className="btn btn-primary">New article</Link>
      </div>
      <p className="mt-1 max-w-2xl text-muted">The assistant can only answer from published articles. Saving rebuilds an article&rsquo;s search chunks in the same transaction.</p>
      <TestRetrieval />
      <Suspense fallback={<div className="skeleton mt-4 h-96" aria-busy="true" aria-label="Loading articles" />}>
        <ArticleTable />
      </Suspense>
    </div>
  );
}

async function ArticleTable() {
  const user = await adminOr404("/admin/knowledge");
  const articles = await listArticlesForAdmin(user);
  return (
    <div className="card mt-5 overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{articles.length} articles</caption>
        <thead>
          <tr className="text-left text-muted">
            <th scope="col" className="p-3">Title</th>
            <th scope="col" className="p-3">Category</th>
            <th scope="col" className="p-3">Status</th>
            <th scope="col" className="p-3 text-right">Chunks</th>
            <th scope="col" className="p-3">Updated</th>
          </tr>
        </thead>
        <tbody>
          {articles.map((a) => (
            <tr key={a.id} className="border-t border-sand">
              <th scope="row" className="p-3 text-left font-normal"><Link href={`/admin/knowledge/${a.id}`}>{a.title}</Link></th>
              <td className="p-3">{CATEGORY_LABELS[a.category]}</td>
              <td className="p-3">{a.status === "published" ? "✓ Published" : a.status === "draft" ? "✎ Draft" : "■ Archived"}</td>
              <td className="p-3 text-right tabular">{a.chunk_count}</td>
              <td className="p-3 whitespace-nowrap">{formatDateTime(a.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
