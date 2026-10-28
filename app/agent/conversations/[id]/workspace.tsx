"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { MessageItem, type MessageView } from "@/components/message-item";
import { assignAction, draftAction, resolveAction, sendReplyAction } from "./actions";

type Status = "ai" | "waiting_human" | "human" | "resolved" | "closed";
type Canned = { id: string; title: string; body: string; category: string };

export function Workspace(props: {
  conversationId: string;
  version: number;
  status: Status;
  assignedToMe: boolean;
  canWrite: boolean;
  initialMessages: MessageView[];
  initialDraft: string;
  canned: Canned[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(props.initialMessages);
  const [text, setText] = useState(props.initialDraft);
  const [isDraft, setIsDraft] = useState(props.initialDraft !== "");
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pending, startTransition] = useTransition();
  const lastId = useRef(props.initialMessages.at(-1)?.id ?? 0);
  const clientId = useRef<string | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const open = props.status === "waiting_human" || props.status === "human";

  // Keep server-rendered updates (after an action) in step with local state.
  useEffect(() => {
    const t = setTimeout(() => {
      setMessages((prev) => (props.initialMessages.length >= prev.length ? props.initialMessages : prev));
      lastId.current = Math.max(lastId.current, props.initialMessages.at(-1)?.id ?? 0);
    }, 0);
    return () => clearTimeout(t);
  }, [props.initialMessages]);

  // Poll for new customer messages with a `since` cursor.
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations/${props.conversationId}/messages?since=${lastId.current}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: MessageView[] };
      const fresh = data.messages.filter((m) => m.id > lastId.current);
      if (fresh.length === 0) return;
      lastId.current = Math.max(...fresh.map((m) => m.id));
      setMessages((prev) => [...prev, ...fresh.filter((f) => !prev.some((p) => p.id === f.id))]);
      const fromCustomer = fresh.filter((m) => m.sender_role === "customer");
      if (fromCustomer.length) setAnnouncement(`New message from the customer: ${fromCustomer.at(-1)?.content}`);
    } catch {
      /* try again next tick */
    }
  }, [props.conversationId]);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, [open, poll]);

  function run(action: () => Promise<{ ok: boolean; message: string; text?: string }>, after?: (r: { ok: boolean; text?: string }) => void) {
    startTransition(async () => {
      const r = await action();
      setNote(r);
      setAnnouncement(r.message);
      after?.(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="mt-4">
      <ol role="log" aria-label="Conversation thread" className="flex flex-col gap-3">
        {messages.map((m) => (
          <MessageItem key={m.id} m={m} viewer="staff" />
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">{announcement}</p>

      {props.canWrite && open && (
        <div className="mt-4 flex flex-wrap gap-2">
          {!props.assignedToMe && (
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run(() => assignAction({ conversationId: props.conversationId, version: props.version }))}>
              Assign to me
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() => run(() => resolveAction({ conversationId: props.conversationId, version: props.version }))}
          >
            Resolve
          </button>
        </div>
      )}

      {note && (
        <p role={note.ok ? "status" : "alert"} className={`mt-3 rounded-lg border-2 p-3 ${note.ok ? "border-iroko bg-iroko-soft" : "border-danger bg-danger-soft"}`}>
          {note.message}
        </p>
      )}

      {props.canWrite && open ? (
        <form
          className="card sticky bottom-0 mt-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const content = text.trim();
            if (!content) return;
            const id = (clientId.current ??= crypto.randomUUID());
            run(
              () => sendReplyAction({ conversationId: props.conversationId, clientMessageId: id, content }),
              (r) => {
                if (r.ok) {
                  clientId.current = null;
                  setText("");
                  setIsDraft(false);
                  void poll();
                }
                composer.current?.focus();
              },
            );
          }}
        >
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending}
              onClick={() =>
                run(
                  () => draftAction(props.conversationId),
                  (r) => {
                    if (r.ok && r.text) {
                      setText(r.text);
                      setIsDraft(true);
                      composer.current?.focus();
                    }
                  },
                )
              }
            >
              {pending ? "Working…" : "Draft a reply with AI"}
            </button>
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-sm font-semibold">Insert a canned reply</span>
              <select
                className="field"
                value=""
                onChange={(e) => {
                  const c = props.canned.find((x) => x.id === e.target.value);
                  if (c) setText((t) => (t ? `${t}\n\n${c.body}` : c.body));
                  composer.current?.focus();
                }}
              >
                <option value="">Choose…</option>
                {props.canned.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </label>
          </div>
          <label htmlFor="reply" className="mb-1 block font-semibold">
            Your reply {isDraft && <span className="ml-1 rounded bg-warn-soft px-1.5 py-0.5 text-xs font-bold text-warn">AI draft: review before sending</span>}
          </label>
          <textarea
            id="reply"
            ref={composer}
            className="field min-h-32"
            value={text}
            maxLength={4000}
            onChange={(e) => setText(e.target.value)}
            aria-describedby="reply-help"
          />
          <p id="reply-help" className="mt-1 text-xs text-muted">Nothing is sent until you press Send. The customer sees your name.</p>
          <button type="submit" className="btn btn-primary mt-2" disabled={pending || !text.trim()}>
            {pending ? "Sending…" : "Send reply"}
          </button>
        </form>
      ) : (
        <p className="card mt-4 p-4 text-muted">
          {!props.canWrite ? "Read-only demo: replying, assigning and resolving are disabled." : "This conversation is closed to new replies."}
        </p>
      )}
    </div>
  );
}
