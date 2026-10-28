import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { adminOr404 } from "@/lib/admin-guard";
import { getArticleForAdmin } from "@/lib/services/knowledge";
import { NotFoundError } from "@/lib/services/errors";
import { ArticleEditor } from "./editor";

export const metadata: Metadata = { title: "Edit article" };

export default function EditArticlePage({ params, searchParams }: PageProps<"/admin/knowledge/[id]">) {
  return (
    <div>
      <p className="mb-3 text-sm"><Link href="/admin/knowledge">← All articles</Link></p>
      <Suspense fallback={<div className="skeleton h-96" aria-busy="true" aria-label="Loading editor" />}>
        <Editor params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Editor({ params, searchParams }: Pick<PageProps<"/admin/knowledge/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const user = await adminOr404(`/admin/knowledge/${id}`);
  const saved = (await searchParams).saved === "1";
  if (id === "new") return <ArticleEditor article={null} saved={false} />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const article = await getArticleForAdmin(user, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return <ArticleEditor article={article} saved={saved} />;
}
