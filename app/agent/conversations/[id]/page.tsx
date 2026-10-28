import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { agentConversation } from "@/lib/services/agents";
import { NotFoundError } from "@/lib/services/errors";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatDateTime, formatKobo } from "@/lib/format";
import { Workspace } from "./workspace";

export const metadata: Metadata = { title: "Conversation" };

const REASONS: Record<string, string> = {
  low_confidence: "The assistant couldn't find an answer",
  customer_request: "The customer asked for a person",
  negative_sentiment: "The customer seemed upset",
  sensitive_topic: "Sensitive topic (fraud, chargeback or legal)",
  tool_failure: "An order lookup failed",
};

export default function AgentConversationPage({ params }: PageProps<"/agent/conversations/[id]">) {
  return (
    <div>
      <p className="mb-3 text-sm"><Link href="/agent">← Back to inbox</Link></p>
      <Suspense fallback={<div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]" aria-busy="true" aria-label="Loading conversation"><div className="skeleton h-96" /><div className="skeleton h-64" /></div>}>
        <Conversation params={params} />
      </Suspense>
    </div>
  );
}

async function Conversation({ params }: { params: PageProps<"/agent/conversations/[id]">["params"] }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=/agent/conversations/${id}`);
  if (user.role === "customer") notFound();
  const data = await agentConversation(user, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const { conversation: c, customer, orders } = data;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section aria-labelledby="conv-title" className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 id="conv-title" className="text-3xl">{c.subject}</h1>
          <StatusBadge status={c.status} />
        </div>
        <p className="mt-1 text-sm text-muted">
          Started {formatDateTime(c.created_at)}
          {c.assigned_agent_name ? ` · assigned to ${c.assigned_agent_name}` : " · unassigned"}
          {c.csat_rating ? ` · rated ${c.csat_rating}/5` : ""}
        </p>
        <Workspace
          conversationId={c.id}
          version={c.version}
          status={c.status}
          assignedToMe={c.assigned_agent_id === user.id}
          canWrite={data.canWrite}
          initialMessages={data.messages.filter((m) => !m.is_draft)}
          initialDraft={data.draft?.content ?? ""}
          canned={data.canned}
        />
      </section>

      <aside className="min-w-0 space-y-4" aria-label="Context">
        <section className="card p-4" aria-labelledby="summary-title">
          <h2 id="summary-title" className="text-xl">AI handoff summary</h2>
          {c.handoff_reason && <p className="mt-1 text-sm font-semibold">Why it&rsquo;s here: {REASONS[c.handoff_reason]}</p>}
          {c.summary ? <p className="mt-2 whitespace-pre-line text-sm">{c.summary}</p> : <p className="mt-2 text-sm text-muted">No summary: this conversation wasn&rsquo;t handed off by the assistant.</p>}
          <p className="mt-2 text-xs text-muted">Written by AI from the thread. Check it against the messages.</p>
        </section>

        {customer && (
          <section className="card p-4" aria-labelledby="customer-title">
            <h2 id="customer-title" className="text-xl">Customer</h2>
            <p className="mt-1 font-semibold">{customer.name}</p>
            <p className="break-all text-sm text-muted">{customer.email}{customer.phone ? ` · ${customer.phone}` : ""}</p>
            <h3 className="mt-3 font-sans text-base font-bold">Recent orders</h3>
            {orders.length === 0 ? (
              <p className="text-sm text-muted">No orders.</p>
            ) : (
              <ul className="mt-1 space-y-2 text-sm">
                {orders.map((o) => (
                  <li key={o.id} className="border-t border-sand pt-2">
                    <p className="flex justify-between gap-2 font-semibold"><span className="tabular">{o.order_number}</span><span>{o.status.replaceAll("_", " ")}</span></p>
                    <p className="text-muted">
                      {o.delivery_city} · {formatKobo(o.total_kobo)} · placed {formatDate(o.created_at)}
                      {o.estimated_delivery_date ? ` · ETA ${formatDate(o.estimated_delivery_date)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="card p-4 text-sm" aria-labelledby="loop-title">
          <h2 id="loop-title" className="text-xl">Why a person stays in the loop</h2>
          <p className="mt-1 text-muted">
            The AI writes a draft, but it can be confidently wrong, it can&rsquo;t see what happens outside this thread, and it can&rsquo;t be accountable for a promise. You read, edit and send every reply, and only you can resolve the case or authorise a refund.
          </p>
        </section>

        {data.audit.length > 0 && (
          <section className="card p-4 text-sm" aria-labelledby="audit-title">
            <h2 id="audit-title" className="text-xl">History</h2>
            <ul className="mt-1 space-y-1 text-muted">
              {data.audit.map((a) => (
                <li key={a.id}>{formatDateTime(a.created_at)}: {a.action.replace("conversation.", "")} by {a.actor_name ?? "someone"}</li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
