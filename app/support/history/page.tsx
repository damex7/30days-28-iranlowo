import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { listMyConversations } from "@/lib/services/conversations";
import { StatusBadge } from "@/components/status-badge";
import { CsatForm } from "@/components/csat-form";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "My conversations" };

export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-3xl">My conversations</h1>
        <Link className="btn btn-primary" href="/support">New chat</Link>
      </div>
      <Suspense fallback={<div className="space-y-3" aria-busy="true" aria-label="Loading conversations">{[1, 2, 3].map((n) => <div key={n} className="skeleton h-24" />)}</div>}>
        <HistoryList />
      </Suspense>
    </div>
  );
}

async function HistoryList() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/support/history");
  if (user.role !== "customer") redirect("/agent");
  const conversations = await listMyConversations(user);
  if (conversations.length === 0) {
    return (
      <div className="card p-5">
        <p>No conversations yet. Questions about delivery, returns or an order? <Link href="/support">Start a chat</Link>.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {conversations.map((c) => (
        <li key={c.id} className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-sans text-lg font-semibold">
              <Link href={`/support?c=${c.id}`}>{c.subject}</Link>
            </h2>
            <StatusBadge status={c.status} />
          </div>
          <p className="mt-1 text-sm text-muted">
            Last message {formatDateTime(c.last_message_at)} · {c.message_count} message{c.message_count === 1 ? "" : "s"}
            {c.assigned_agent_name ? ` · with ${c.assigned_agent_name}` : ""}
          </p>
          {c.last_preview && <p className="mt-1 line-clamp-2 text-sm">{c.last_preview}</p>}
          {(c.status === "resolved" || c.status === "closed") &&
            (c.csat_rating === null ? (
              <div className="mt-3 border-t border-sand pt-3">
                <CsatForm conversationId={c.id} />
              </div>
            ) : (
              <p className="mt-2 text-sm">
                You rated this <strong>{c.csat_rating} out of 5</strong>.
              </p>
            ))}
        </li>
      ))}
    </ul>
  );
}
