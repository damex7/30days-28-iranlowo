import Link from "next/link";
import type { ReactNode } from "react";
import type { Citation, SenderRole } from "@/lib/repos/messages";
import { formatDateTime } from "@/lib/format";

export type MessageView = {
  id: number;
  sender_role: SenderRole;
  sender_name: string | null;
  content: string;
  citations: Citation[];
  interrupted: boolean;
  created_at: string;
  is_draft?: boolean;
};

/** Turns "[1]" markers into links to the cited help article. */
function withCitations(text: string, citations: Citation[]): ReactNode[] {
  return text.split(/(\[\d\])/g).map((part, i) => {
    const m = /^\[(\d)\]$/.exec(part);
    const c = m ? citations.find((x) => x.ref === Number(m[1])) : undefined;
    if (!m) return <span key={i}>{part}</span>;
    if (!c) return null;
    return (
      <sup key={i}>
        <Link href={`/help/${c.slug}${c.anchor ? `#${c.anchor}` : ""}`} className="px-0.5 font-semibold" aria-label={`Source ${c.ref}: ${c.title}`}>
          [{c.ref}]
        </Link>
      </sup>
    );
  });
}

const LABEL: Record<SenderRole, string> = { customer: "You", assistant: "Assistant", agent: "Agent", system: "Update" };

/**
 * Four senders, four shapes, each with a visible text label:
 *   customer  - right-aligned filled bubble, square bottom-right corner
 *   assistant - left, outlined bubble with a slate border, square bottom-left
 *   agent     - left, flat card with a thick green rule down the left edge
 *   system    - centred dashed pill
 * Colour reinforces the difference but is never the only signal.
 */
export function MessageItem({ m, viewer = "customer", footer }: { m: MessageView; viewer?: "customer" | "staff"; footer?: ReactNode }) {
  const time = <time dateTime={m.created_at} className="text-xs text-muted">{formatDateTime(m.created_at)}</time>;
  const label = viewer === "staff" && m.sender_role === "customer" ? "Customer" : LABEL[m.sender_role];
  if (m.sender_role === "system") {
    return (
      <li className="flex justify-center">
        <p className="max-w-[92%] rounded-full border-2 border-dashed border-line-strong px-4 py-1.5 text-center text-sm text-muted">
          <span className="font-bold">{label}: </span>
          {m.content}
        </p>
      </li>
    );
  }
  const body = (
    <>
      <p className="mb-1 flex flex-wrap items-baseline gap-x-2 text-xs font-bold uppercase tracking-wide">
        <span>
          {label}
          {m.sender_role === "agent" && m.sender_name ? <span className="normal-case tracking-normal"> · {m.sender_name}</span> : null}
        </span>
        <span className="font-normal normal-case tracking-normal">{time}</span>
      </p>
      <div className="whitespace-pre-wrap break-words">{m.sender_role === "assistant" ? withCitations(m.content, m.citations) : m.content}</div>
      {m.interrupted && <p className="mt-1 text-xs italic">(stopped before finishing)</p>}
      {m.sender_role === "assistant" && m.citations.length > 0 && (
        <div className="mt-2 border-t border-sand pt-2 text-sm">
          <p className="font-semibold">Sources</p>
          <ol className="mt-0.5 space-y-0.5">
            {m.citations.map((c) => (
              <li key={c.ref}>
                [{c.ref}] <Link href={`/help/${c.slug}${c.anchor ? `#${c.anchor}` : ""}`}>{c.title}</Link>
              </li>
            ))}
          </ol>
        </div>
      )}
      {footer}
    </>
  );
  if (m.sender_role === "customer") {
    return (
      <li className="flex justify-end">
        <div className="max-w-[88%] rounded-[var(--radius-bubble)] rounded-br-sm bg-bubble-customer px-4 py-2.5 text-on-bubble-customer [&_.text-muted]:text-on-bubble-customer">{body}</div>
      </li>
    );
  }
  if (m.sender_role === "assistant") {
    return (
      <li className="flex justify-start">
        <div className="max-w-[92%] rounded-[var(--radius-bubble)] rounded-bl-sm border-2 border-muted bg-card px-4 py-2.5">{body}</div>
      </li>
    );
  }
  return (
    <li className="flex justify-start">
      <div className="max-w-[92%] rounded-md border border-sand border-l-[6px] border-l-iroko bg-iroko-soft px-4 py-2.5">{body}</div>
    </li>
  );
}
