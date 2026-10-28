"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageItem, type MessageView } from "@/components/message-item";
import { CsatForm } from "@/components/csat-form";
import { rateMessageAction, resolveAction } from "./actions";

type Status = "ai" | "waiting_human" | "human" | "resolved" | "closed";
export type ChatMessage = MessageView & { my_rating?: "up" | "down" | null };

type ServerEvent =
  | { type: "meta"; conversationId: string; customerMessage: ChatMessage; duplicate: boolean }
  | { type: "delta"; text: string }
  | { type: "done"; messages: ChatMessage[]; status: Status; offerHuman: boolean }
  | { type: "error"; message: string; offerHuman: boolean };

const MAX = 1000;
const HUMAN_TEXT = "I'd like to talk to a person, please.";

export function Chat(props: { conversationId: string; initialMessages: ChatMessage[]; initialStatus: Status; agentName: string | null; csatRating: number | null; isNew: boolean }) {
  const [conversationId] = useState(props.conversationId);
  const [messages, setMessages] = useState<ChatMessage[]>(props.initialMessages);
  const [status, setStatus] = useState<Status>(props.initialStatus);
  const [agentName, setAgentName] = useState(props.agentName);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerHuman, setOfferHuman] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [text, setText] = useState("");
  const [rated, setRated] = useState(props.csatRating !== null);

  const textarea = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  // Kept across a failed attempt, so "send again" reuses the same id and the
  // server can recognise a retry of a message it already saved.
  const pendingClientId = useRef<string | null>(null);
  const lastId = useRef<number>(props.initialMessages.at(-1)?.id ?? 0);

  const addMessages = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const next = [...prev.filter((m) => m.id > 0), ...incoming.filter((m) => !seen.has(m.id))].sort((a, b) => a.id - b.id);
      lastId.current = Math.max(lastId.current, ...next.map((m) => m.id));
      return next;
    });
  }, []);

  const scrollToEnd = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    end.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  };

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages?since=${lastId.current}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { status: Status; assignedAgentName: string | null; messages: ChatMessage[] };
      const fresh = data.messages.filter((m) => m.id > lastId.current);
      addMessages(fresh);
      setStatus(data.status);
      setAgentName(data.assignedAgentName);
      const fromAgent = fresh.filter((m) => m.sender_role === "agent");
      if (fromAgent.length) setAnnouncement(`New message from ${fromAgent.at(-1)?.sender_name ?? "an agent"}: ${fromAgent.at(-1)?.content}`);
    } catch {
      /* offline for a moment: the next poll catches up */
    }
  }, [conversationId, addMessages]);

  // While a person has the conversation, check for their replies every 5 s.
  useEffect(() => {
    if (status !== "waiting_human" && status !== "human") return;
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, [status, poll]);

  useEffect(() => {
    scrollToEnd();
  }, [messages.length, streaming]);

  async function send(raw: string, requestHuman = false) {
    const content = raw.trim();
    if (!content || pending) return;
    setPending(true);
    setError(null);
    setOfferHuman(false);
    const clientMessageId = (pendingClientId.current ??= crypto.randomUUID());
    const optimistic: ChatMessage = { id: -Date.now(), sender_role: "customer", sender_name: null, content, citations: [], interrupted: false, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, optimistic]);
    const controller = new AbortController();
    abort.current = controller;
    let streamed = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, clientMessageId, text: content, requestHuman }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; offerHuman?: boolean };
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setError(data.message ?? "We couldn't send that. Please try again.");
        setOfferHuman(!!data.offerHuman);
        if (res.status !== 0 && res.status < 500) pendingClientId.current = null;
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ServerEvent;
          if (event.type === "meta") {
            // Saved on the server: now it's safe to clear the composer.
            pendingClientId.current = null;
            setText("");
            setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
            addMessages([event.customerMessage]);
            if (props.isNew) window.history.replaceState(null, "", `/support?c=${event.conversationId}`);
            setStreaming("");
          } else if (event.type === "delta") {
            streamed += event.text;
            setStreaming(streamed);
          } else if (event.type === "done") {
            setStreaming(null);
            addMessages(event.messages);
            setStatus(event.status);
            setOfferHuman(event.offerHuman);
            // Announce once, when complete: not every token.
            const last = event.messages.at(-1);
            if (last) setAnnouncement(`${last.sender_role === "assistant" ? "Assistant" : "Update"}: ${last.content}`);
          } else if (event.type === "error") {
            setStreaming(null);
            setError(event.message);
            setOfferHuman(event.offerHuman);
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        // Stopped: the server keeps the partial answer (marked interrupted).
        setStreaming(null);
        setAnnouncement("Stopped.");
        setTimeout(poll, 1200);
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setStreaming(null);
        setError("The connection dropped. Your text is still in the box: press Send to try again.");
        void err;
      }
    } finally {
      setPending(false);
      abort.current = null;
      textarea.current?.focus();
    }
  }

  const withHuman = status === "waiting_human" || status === "human";
  const closed = status === "resolved" || status === "closed";
  const hasAnswer = messages.some((m) => m.sender_role === "assistant" || m.sender_role === "agent");

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted" id="chat-status">
          {status === "ai" && "You're chatting with our assistant. A person is one tap away."}
          {status === "waiting_human" && "Waiting for an agent. You can keep typing; they'll see everything."}
          {status === "human" && `You're chatting with ${agentName ?? "an agent"}.`}
          {status === "resolved" && "This conversation is resolved."}
          {status === "closed" && "This conversation is closed."}
        </p>
        {status === "ai" && hasAnswer && (
          <button
            type="button"
            className="btn btn-secondary min-h-10 text-sm"
            onClick={async () => {
              const r = await resolveAction(conversationId);
              if (r.ok) setStatus("resolved");
              setAnnouncement(r.message);
            }}
          >
            That solved it
          </button>
        )}
      </div>

      {/* The conversation is a log region. aria-live is off here so screen
          readers aren't flooded token by token; the separate status region
          below announces each finished reply once. */}
      <ol role="log" aria-label="Conversation" aria-live="off" className="flex min-h-[40vh] flex-col gap-3 pb-4">
        {messages.length === 0 && (
          <li className="card p-4 text-muted">
            Ask about delivery, returns, payments or an order. For example: &ldquo;How much is delivery to Ibadan?&rdquo; or &ldquo;Where is my order OJX-204812?&rdquo;
          </li>
        )}
        {messages.map((m) => (
          <MessageItem
            key={m.id}
            m={m}
            footer={m.sender_role === "assistant" && m.id > 0 && !closed ? <Feedback messageId={m.id} initial={m.my_rating ?? null} /> : null}
          />
        ))}
        {streaming !== null && (
          <li className="flex justify-start" aria-hidden={streaming === "" ? undefined : "true"}>
            <div className="max-w-[92%] rounded-[var(--radius-bubble)] rounded-bl-sm border-2 border-muted bg-card px-4 py-2.5">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide">Assistant</p>
              {streaming === "" ? (
                <p className="text-muted">
                  <span className="sr-only">Assistant is typing…</span>
                  <span aria-hidden="true">
                    Typing<span className="typing-dot">.</span>
                    <span className="typing-dot [animation-delay:150ms]">.</span>
                    <span className="typing-dot [animation-delay:300ms]">.</span>
                  </span>
                </p>
              ) : (
                <p className="whitespace-pre-wrap break-words">{streaming}</p>
              )}
            </div>
          </li>
        )}
      </ol>
      <div ref={end} />
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      {closed ? (
        <div className="card p-4">
          {!rated ? (
            <CsatForm conversationId={conversationId} onDone={() => setRated(true)} />
          ) : (
            <p>Thanks for your rating.</p>
          )}
          <p className="mt-3">
            <a className="btn btn-primary" href="/support">Start a new chat</a>
          </p>
        </div>
      ) : (
        <form
          className="sticky bottom-0 -mx-4 border-t border-sand bg-paper px-4 pb-3 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          {error && (
            <div role="alert" className="mb-2 rounded-lg border-2 border-danger bg-danger-soft p-3 text-ink">
              <p>{error}</p>
            </div>
          )}
          {offerHuman && status === "ai" && !error && <p className="mb-2 text-sm">Not what you needed? A person can help.</p>}
          <label htmlFor="composer" className="sr-only">Your message</label>
          <textarea
            id="composer"
            ref={textarea}
            className="field min-h-20 resize-y"
            rows={2}
            maxLength={MAX}
            value={text}
            placeholder={withHuman ? "Write to the agent…" : "Ask a question…"}
            aria-describedby="composer-help"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(text);
              }
            }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {pending && streaming !== null ? (
              <button type="button" className="btn btn-secondary" onClick={() => abort.current?.abort()}>
                Stop generating
              </button>
            ) : (
              <button type="submit" className="btn btn-primary" disabled={pending || !text.trim()}>
                {pending ? "Sending…" : "Send"}
              </button>
            )}
            {status === "ai" && (
              <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => void send(HUMAN_TEXT, true)}>
                Talk to a person
              </button>
            )}
            <span id="composer-help" className="ml-auto text-xs text-muted">
              <span className="tabular">{text.length}/{MAX}</span> · Enter to send · AI answers may be wrong; check the sources.
            </span>
          </div>
        </form>
      )}
    </div>
  );
}

function Feedback({ messageId, initial }: { messageId: number; initial: "up" | "down" | null }) {
  const [rating, setRating] = useState(initial);
  const [askReason, setAskReason] = useState(false);
  const [note, setNote] = useState("");
  async function save(r: "up" | "down", reason?: string) {
    const result = await rateMessageAction({ messageId, rating: r, reason });
    if (result.ok) setRating(r);
    setNote(result.message);
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-sand pt-2 text-sm">
      <span className="mr-1 text-muted" id={`fb-${messageId}`}>Helpful?</span>
      <button type="button" className="btn btn-quiet min-h-9 px-2" aria-pressed={rating === "up"} aria-describedby={`fb-${messageId}`} onClick={() => void save("up")}>
        <span aria-hidden="true">👍</span> <span className="sr-only">Yes</span>
      </button>
      <button
        type="button"
        className="btn btn-quiet min-h-9 px-2"
        aria-pressed={rating === "down"}
        aria-describedby={`fb-${messageId}`}
        onClick={() => {
          setAskReason(true);
          void save("down");
        }}
      >
        <span aria-hidden="true">👎</span> <span className="sr-only">No</span>
      </button>
      {askReason && rating === "down" && (
        <label className="flex items-center gap-1">
          <span className="sr-only">What was wrong?</span>
          <select className="field min-h-9 w-auto py-1 text-sm" defaultValue="" onChange={(e) => e.target.value && void save("down", e.target.value)}>
            <option value="" disabled>What was wrong?</option>
            <option value="wrong">It was wrong</option>
            <option value="not_relevant">Didn&rsquo;t answer my question</option>
            <option value="unclear">Hard to understand</option>
            <option value="wanted_person">I wanted a person</option>
            <option value="other">Something else</option>
          </select>
        </label>
      )}
      <span role="status" className="text-muted">{note}</span>
    </div>
  );
}
