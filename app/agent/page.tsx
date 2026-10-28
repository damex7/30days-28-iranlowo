import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { inbox } from "@/lib/services/agents";
import { inboxQuerySchema, type InboxQuery } from "@/lib/validation/agent";
import { CATEGORY_LABELS, CATEGORIES } from "@/lib/validation/knowledge";
import { StatusBadge } from "@/components/status-badge";
import { InboxRefresher } from "./inbox-refresher";
import { formatDuration, timeAgo } from "@/lib/format";
import { runLazyMaintenance } from "@/lib/services/cron";

export const metadata: Metadata = { title: "Agent inbox" };

const STATUS_LABELS: Record<InboxQuery["status"], string> = {
  open: "Open (waiting + with agent)",
  waiting_human: "Waiting",
  human: "With agent",
  resolved: "Resolved",
  closed: "Closed",
  ai: "With assistant",
  all: "All",
};
const REASONS: Record<string, string> = {
  low_confidence: "Assistant unsure",
  customer_request: "Asked for a person",
  negative_sentiment: "Upset customer",
  sensitive_topic: "Sensitive topic",
  tool_failure: "Lookup failed",
};

function href(q: InboxQuery, change: Partial<InboxQuery>) {
  const m = { ...q, ...change };
  const sp = new URLSearchParams();
  if (m.status !== "open") sp.set("status", m.status);
  if (m.mine) sp.set("mine", "1");
  if (m.category) sp.set("category", m.category);
  if (m.sort !== "waiting") sp.set("sort", m.sort);
  if (m.after) sp.set("after", m.after);
  const s = sp.toString();
  return s ? `/agent?${s}` : "/agent";
}

export default function AgentInboxPage({ searchParams }: PageProps<"/agent">) {
  return (
    <div>
      <h1 className="text-3xl">Inbox</h1>
      <Suspense fallback={<div className="mt-4 space-y-3" aria-busy="true" aria-label="Loading inbox">{[1, 2, 3, 4].map((n) => <div key={n} className="skeleton h-24" />)}</div>}>
        <Inbox searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Inbox({ searchParams }: { searchParams: PageProps<"/agent">["searchParams"] }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/agent");
  if (user.role === "customer") redirect("/support");
  const q = inboxQuerySchema.parse(await searchParams);
  // The daily housekeeping also runs lazily here (at most once a day).
  await runLazyMaintenance().catch(() => undefined);
  const page = await inbox(user, q);

  const chips: { label: string; remove: string }[] = [];
  if (q.status !== "open") chips.push({ label: `Status: ${STATUS_LABELS[q.status]}`, remove: href(q, { status: "open", after: undefined }) });
  if (q.mine) chips.push({ label: "Assigned to me", remove: href(q, { mine: false, after: undefined }) });
  if (q.category) chips.push({ label: `Topic: ${CATEGORY_LABELS[q.category]}`, remove: href(q, { category: undefined, after: undefined }) });
  if (q.sort !== "waiting") chips.push({ label: "Newest first", remove: href(q, { sort: "waiting", after: undefined }) });

  return (
    <>
      {user.isReadOnly && (
        <p className="mt-3 rounded-lg border-2 border-warn bg-warn-soft p-3 text-ink">
          You&rsquo;re looking around as the demo agent: everything is read-only and customer details are masked.
        </p>
      )}
      {/* A GET form: filters live in the URL, so a view can be bookmarked or shared. */}
      <form action="/agent" className="card mt-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Status</span>
          <select name="status" defaultValue={q.status} className="field">
            {(Object.keys(STATUS_LABELS) as InboxQuery["status"][]).filter((s) => s !== "ai" || user.role === "admin").map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Topic</span>
          <select name="category" defaultValue={q.category ?? ""} className="field">
            <option value="">Any topic</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Sort</span>
          <select name="sort" defaultValue={q.sort} className="field">
            <option value="waiting">Waiting longest</option>
            <option value="newest">Newest first</option>
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" name="mine" value="1" defaultChecked={q.mine} className="h-5 w-5 accent-[var(--iroko)]" />
          <span className="font-semibold">Assigned to me</span>
        </label>
        <button className="btn btn-primary" type="submit">Apply filters</button>
      </form>

      {chips.length > 0 && (
        <ul aria-label="Active filters" className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <li key={c.label} className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-card py-1 pl-3 pr-1 text-sm">
              {c.label}
              <Link href={c.remove} className="inline-flex h-8 w-8 items-center justify-center rounded-full no-underline hover:bg-iroko-soft" aria-label={`Remove filter: ${c.label}`}>
                <span aria-hidden="true">✕</span>
              </Link>
            </li>
          ))}
          <li><Link href="/agent" className="btn btn-quiet min-h-9 text-sm">Clear all</Link></li>
        </ul>
      )}

      <InboxRefresher total={page.total} />
      <p role="status" aria-live="polite" className="mt-4 font-semibold">
        {page.total} conversation{page.total === 1 ? "" : "s"}
      </p>

      {page.rows.length === 0 ? (
        <div className="card mt-3 p-5">
          <p>Nothing here. {chips.length ? "Try removing a filter." : "The queue is clear. Nice work."}</p>
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {page.rows.map((r) => {
            const overdue = r.status === "waiting_human" && (r.waiting_minutes ?? 0) > 15;
            return (
              <li key={r.id} className={`card p-4 ${overdue ? "border-2 border-warn" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-sans text-lg font-semibold">
                    <Link href={`/agent/conversations/${r.id}`}>{r.subject}</Link>
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    {overdue && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-warn bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn">
                        <span aria-hidden="true">⚠</span> Over 15 min: waiting {formatDuration((r.waiting_minutes ?? 0) * 60000)}
                      </span>
                    )}
                    <StatusBadge status={r.status} />
                  </div>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {r.customer_name} · {r.handoff_reason ? REASONS[r.handoff_reason] : "No handoff"}
                  {r.topic ? ` · ${CATEGORY_LABELS[r.topic as keyof typeof CATEGORY_LABELS]}` : ""}
                  {r.assigned_agent_name ? ` · ${r.assigned_agent_name}` : " · Unassigned"} · last message {timeAgo(r.last_message_at)}
                  {r.status === "waiting_human" && !overdue && r.waiting_minutes !== null ? ` · waiting ${formatDuration(r.waiting_minutes * 60000)}` : ""}
                </p>
                {r.summary && <p className="mt-2 line-clamp-2 whitespace-pre-line text-sm">{r.summary}</p>}
              </li>
            );
          })}
        </ul>
      )}
      <nav aria-label="Pages" className="mt-5 flex gap-3">
        {!page.isFirstPage && <Link className="btn btn-secondary" href={href(q, { after: undefined })}>First page</Link>}
        {page.next && <Link className="btn btn-secondary" href={href(q, { after: page.next })}>Next page</Link>}
      </nav>
    </>
  );
}
