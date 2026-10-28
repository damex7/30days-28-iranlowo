"use client";

import { useActionState, useState } from "react";
import { ErrorSummary, Field, SubmitButton } from "@/components/form";
import { Markdown } from "@/components/markdown";
import { initialFormState } from "@/lib/validation/form";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/validation/knowledge";
import { saveArticleAction } from "../actions";

type Article = { id: string; version: number; title: string; slug: string; category: string; body: string; status: string };

const LABELS = { title: "Title", slug: "Slug", category: "Category", status: "Status", body: "Body" };

export function ArticleEditor({ article, saved }: { article: Article | null; saved: boolean }) {
  const [state, action] = useActionState(saveArticleAction, initialFormState);
  const [body, setBody] = useState(state.values?.body ?? article?.body ?? "## First section\n\nWrite the answer here.");
  const v = (k: keyof Article) => state.values?.[k] ?? String(article?.[k] ?? "");
  const errorFor = (k: string) => state.errors?.[k];

  return (
    <div>
      <h1 className="text-3xl">{article ? `Edit: ${article.title}` : "New article"}</h1>
      {saved && !state.errors && <p role="status" className="mt-3 rounded-lg bg-iroko-soft p-3">Saved. Search chunks were rebuilt.</p>}
      <form action={action} noValidate className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <ErrorSummary state={state} labels={LABELS} />
          {article && <input type="hidden" name="id" value={article.id} />}
          {/* Optimistic locking: if someone saved after we loaded, the save is refused. */}
          {article && <input type="hidden" name="version" value={article.version} />}
          <Field name="title" label="Title" state={state} defaultValue={v("title")} required maxLength={120} />
          <Field name="slug" label="Slug" hint="Used in the URL: /help/your-slug" state={state} defaultValue={v("slug")} required maxLength={80} />
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-semibold">Category</span>
              <select name="category" id="category" defaultValue={v("category") || "delivery"} className="field" aria-invalid={errorFor("category") ? true : undefined}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-semibold">Status</span>
              <select name="status" id="status" defaultValue={v("status") || "draft"} className="field">
                <option value="draft">Draft (hidden)</option>
                <option value="published">Published (searchable, used by the assistant)</option>
                <option value="archived">Archived (hidden)</option>
              </select>
            </label>
          </div>
          <label htmlFor="body" className="mb-1 block font-semibold">Body (Markdown: ## headings, - lists, **bold**, [links](/help/slug))</label>
          {errorFor("body") && <p id="body-error" className="mb-1 text-sm font-semibold text-danger">⚠ {errorFor("body")}</p>}
          <textarea
            id="body"
            name="body"
            className="field min-h-96 font-mono text-sm"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-invalid={errorFor("body") ? true : undefined}
            aria-describedby={errorFor("body") ? "body-error" : undefined}
          />
          <div className="mt-3">
            <SubmitButton pendingText="Saving and rebuilding chunks…">Save article</SubmitButton>
          </div>
        </div>
        <section aria-labelledby="preview-title" className="min-w-0">
          <h2 id="preview-title" className="text-xl">Preview</h2>
          <div className="card mt-2 p-5">
            <Markdown source={body} />
          </div>
        </section>
      </form>
    </div>
  );
}
