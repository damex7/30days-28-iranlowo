import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { adminOr404 } from "@/lib/admin-guard";
import { browseRuns } from "@/lib/services/analytics";
import { formatDateTime, formatMicroUsd } from "@/lib/format";

export const metadata: Metadata = { title: "AI runs" };

const OUTCOMES = ["answered", "handoff", "refused", "error", "timeout", "rate_limited", "fallback_mock"] as const;
const PURPOSES = ["answer", "classify", "summarise", "draft_reply"] as const;
const search = z.object({
  outcome: z.enum(OUTCOMES).optional().catch(undefined),
  purpose: z.enum(PURPOSES).optional().catch(undefined),
  before: z.coerce.number().int().positive().optional().catch(undefined),
});
const PAGE = 25;

export default function AiRunsPage({ searchParams }: PageProps<"/admin/ai-runs">) {
  return (
    <div>
      <h1 className="text-3xl">AI runs</h1>
      <p className="mt-1 max-w-2xl text-muted">One row per model call. Questions are stored masked and shortened; tool arguments are masked; full prompts are never stored.</p>
      <Suspense fallback={<div className="skeleton mt-4 h-96" aria-busy="true" aria-label="Loading runs" />}>
        <Runs searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Runs({ searchParams }: { searchParams: PageProps<"/admin/ai-runs">["searchParams"] }) {
  const user = await adminOr404("/admin/ai-runs");
  const q = search.parse(await searchParams);
  const rows = await browseRuns(user, { outcome: q.outcome ?? null, purpose: q.purpose ?? null, beforeId: q.before ?? null }, PAGE);
  const page = rows.slice(0, PAGE);
  const qs = (extra: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ outcome: q.outcome, purpose: q.purpose, ...extra })) if (v) sp.set(k, v);
    return `/admin/ai-runs${sp.size ? `?${sp}` : ""}`;
  };
  return (
    <>
      <form action="/admin/ai-runs" className="card mt-4 flex flex-wrap items-end gap-3 p-4">
        <label>
          <span className="mb-1 block text-sm font-semibold">Outcome</span>
          <select name="outcome" defaultValue={q.outcome ?? ""} className="field">
            <option value="">Any</option>
            {OUTCOMES.map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold">Purpose</span>
          <select name="purpose" defaultValue={q.purpose ?? ""} className="field">
            <option value="">Any</option>
            {PURPOSES.map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}
          </select>
        </label>
        <button className="btn btn-primary">Filter</button>
      </form>
      <p role="status" className="mt-3 text-sm text-muted">Showing {page.length} run{page.length === 1 ? "" : "s"}, newest first.</p>
      <ul className="mt-2 space-y-2">
        {page.map((r) => (
          <li key={r.id} className="card p-3 text-sm">
            <p className="flex flex-wrap gap-x-3 gap-y-1">
              <strong className="tabular">#{r.id}</strong>
              <span>{formatDateTime(r.created_at)}</span>
              <span>{r.purpose.replace("_", " ")}</span>
              <span>{r.provider} · {r.model}</span>
              <span className={r.outcome === "answered" ? "" : "font-bold"}>{r.outcome.replace("_", " ")}{r.error_code ? ` (${r.error_code})` : ""}</span>
              <span className="tabular">{r.latency_ms} ms</span>
              <span className="tabular">{r.input_tokens}+{r.output_tokens} tokens</span>
              <span className="tabular">{formatMicroUsd(r.estimated_cost_micro_usd)}</span>
            </p>
            {r.question_excerpt && <p className="mt-1">Q: &ldquo;{r.question_excerpt}&rdquo;</p>}
            <p className="mt-1 text-muted">
              Chunks: {r.retrieved_chunk_ids.length ? r.retrieved_chunk_ids.join(", ") : "none"}
              {r.retrieval_top_score !== null ? ` (top score ${r.retrieval_top_score.toFixed(2)})` : ""}
              {r.tools_called.length ? ` · Tools: ${r.tools_called.map((t) => `${t.name}(${JSON.stringify(t.args)})${t.ok ? "" : " ✗"}`).join(", ")}` : ""}
              {r.conversation_id ? <> · <Link href={`/agent/conversations/${r.conversation_id}`}>conversation</Link></> : null}
            </p>
          </li>
        ))}
      </ul>
      <nav aria-label="Pages" className="mt-4 flex gap-3">
        {q.before && <Link className="btn btn-secondary" href={qs({})}>Newest</Link>}
        {rows.length > PAGE && page.at(-1) && <Link className="btn btn-secondary" href={qs({ before: String(page.at(-1)!.id) })}>Older runs</Link>}
      </nav>
    </>
  );
}
