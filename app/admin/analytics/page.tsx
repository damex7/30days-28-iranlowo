import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { adminOr404 } from "@/lib/admin-guard";
import { analytics } from "@/lib/services/analytics";
import { runLazyMaintenance } from "@/lib/services/cron";
import { formatDuration, formatMicroUsd } from "@/lib/format";
import { PRICING_CHECKED, pricingTable } from "@/lib/ai/pricing";

export const metadata: Metadata = { title: "AI analytics" };

const search = z.object({ days: z.enum(["7", "30"]).catch("7") });
const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);
const REASONS: Record<string, string> = {
  low_confidence: "Assistant unsure",
  customer_request: "Asked for a person",
  negative_sentiment: "Upset customer",
  sensitive_topic: "Sensitive topic",
  tool_failure: "Lookup failed",
};

export default function AnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  return (
    <div>
      <h1 className="text-3xl">How the AI is doing</h1>
      <Suspense fallback={<div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Loading analytics">{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <div key={n} className="skeleton h-24" />)}</div>}>
        <Analytics searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-display text-3xl font-bold tabular">{value}</dd>
      {note && <dd className="mt-1 text-xs text-muted">{note}</dd>}
    </div>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <li className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-2 text-sm">
      <span className="truncate">{label}</span>
      <span className="h-3 rounded bg-iroko-soft" aria-hidden="true">
        <span className="block h-3 rounded bg-iroko" style={{ width: `${max ? Math.max(4, (value / max) * 100) : 0}%` }} />
      </span>
      <span className="text-right tabular">{value}</span>
    </li>
  );
}

async function Analytics({ searchParams }: { searchParams: PageProps<"/admin/analytics">["searchParams"] }) {
  const user = await adminOr404("/admin/analytics");
  const { days } = search.parse(await searchParams);
  await runLazyMaintenance().catch(() => undefined);
  const a = await analytics(user, Number(days) as 7 | 30);
  const maxReason = Math.max(0, ...a.handoffReasons.map((r) => r.n));
  const outcome = (o: string) => a.outcomes.find((x) => x.outcome === o)?.n ?? 0;

  return (
    <>
      <nav aria-label="Time window" className="mt-3 flex gap-2">
        {(["7", "30"] as const).map((d) => (
          <Link key={d} href={`/admin/analytics?days=${d}`} aria-current={days === d ? "page" : undefined} className={`btn min-h-10 text-sm ${days === d ? "btn-primary" : "btn-secondary"}`}>
            Last {d} days
          </Link>
        ))}
      </nav>

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="AI resolution rate" value={pct(a.aiResolutionRate)} note={`${a.aiResolved} of ${a.conversations} solved with no person involved`} />
        <Stat label="Handoff rate" value={pct(a.handoffRate)} note={`${a.handedOff} conversations went to an agent`} />
        <Stat label="Avg first response" value={a.avgFirstResponseSeconds === null ? "–" : formatDuration(a.avgFirstResponseSeconds * 1000)} note={`Agent pick-up after handoff: ${a.avgAgentPickupSeconds === null ? "–" : formatDuration(a.avgAgentPickupSeconds * 1000)}`} />
        <Stat label="Average CSAT" value={a.avgCsat === null ? "–" : `${a.avgCsat.toFixed(1)} / 5`} note={`${a.csatCount} rating${a.csatCount === 1 ? "" : "s"}`} />
        <Stat label="Thumbs-down rate" value={pct(a.thumbsDownRate)} note={`${a.feedbackTotal} votes on answers`} />
        <Stat label="Tokens used" value={a.totalTokens.toLocaleString("en-NG")} note="All model calls, input + output" />
        <Stat label="Estimated paid cost" value={formatMicroUsd(a.totalCostMicroUsd)} note="Actual cost on the free tier: $0" />
        <Stat label="Rate-limited / fallbacks" value={`${outcome("rate_limited")} / ${outcome("fallback_mock")}`} note={`${outcome("timeout")} timeouts, ${outcome("error")} errors`} />
      </dl>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card p-4" aria-labelledby="reasons">
          <h2 id="reasons" className="text-xl">Handoffs by reason</h2>
          {a.handoffReasons.length === 0 ? <p className="mt-2 text-muted">No handoffs in this window.</p> : (
            <ul className="mt-3 space-y-2">{a.handoffReasons.map((r) => <Bar key={r.reason} label={REASONS[r.reason] ?? r.reason} value={r.n} max={maxReason} />)}</ul>
          )}
        </section>
        <section className="card p-4" aria-labelledby="gaps">
          <h2 id="gaps" className="text-xl">Knowledge gaps</h2>
          <p className="text-sm text-muted">First questions of conversations the assistant couldn&rsquo;t answer. Consider writing articles for these.</p>
          {a.knowledgeGaps.length === 0 ? <p className="mt-2 text-muted">None in this window.</p> : (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{a.knowledgeGaps.map((g) => <li key={g.question}>&ldquo;{g.question}&rdquo; <span className="text-muted">×{g.n}</span></li>)}</ol>
          )}
        </section>
        <section className="card p-4" aria-labelledby="down">
          <h2 id="down" className="text-xl">Why answers got a thumbs-down</h2>
          {a.downReasons.length === 0 ? <p className="mt-2 text-muted">No thumbs-down in this window.</p> : (
            <ul className="mt-2 space-y-1 text-sm">{a.downReasons.map((r) => <li key={r.reason ?? "none"}>{(r.reason ?? "no reason given").replace("_", " ")}: <strong>{r.n}</strong></li>)}</ul>
          )}
        </section>
        <section className="card p-4" aria-labelledby="usage">
          <h2 id="usage" className="text-xl">Usage by purpose</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Model calls by purpose and provider</caption>
              <thead><tr className="text-left text-muted"><th scope="col" className="py-1 pr-2">Purpose</th><th scope="col" className="pr-2">Provider</th><th scope="col" className="pr-2 text-right">Calls</th><th scope="col" className="pr-2 text-right">Tokens</th><th scope="col" className="pr-2 text-right">Avg ms</th><th scope="col" className="text-right">Est. cost</th></tr></thead>
              <tbody>
                {a.usage.map((u) => (
                  <tr key={`${u.purpose}-${u.provider}`} className="border-t border-sand tabular">
                    <th scope="row" className="py-1 pr-2 text-left font-normal">{u.purpose.replace("_", " ")}</th>
                    <td className="pr-2">{u.provider}</td>
                    <td className="pr-2 text-right">{u.calls}</td>
                    <td className="pr-2 text-right">{(u.input_tokens + u.output_tokens).toLocaleString("en-NG")}</td>
                    <td className="pr-2 text-right">{u.avg_latency_ms ?? "–"}</td>
                    <td className="text-right">{formatMicroUsd(u.cost_micro_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold">Pricing used for estimates (checked {PRICING_CHECKED})</summary>
            <ul className="mt-1 text-muted">{pricingTable().map((p) => <li key={p.model}>{p.model}: ${p.inputPerM} in / ${p.outputPerM} out per 1M tokens</li>)}</ul>
          </details>
        </section>
      </div>
    </>
  );
}
