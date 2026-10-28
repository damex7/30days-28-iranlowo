"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Refreshes the inbox every 20 s (a server re-render, no full reload) and
 * politely announces when the number of conversations changes.
 */
export function InboxRefresher({ total }: { total: number }) {
  const router = useRouter();
  const previous = useRef(total);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(timer);
  }, [router]);
  useEffect(() => {
    if (previous.current === total) return;
    const diff = total - previous.current;
    previous.current = total;
    const t = setTimeout(() => setMessage(diff > 0 ? `${diff} new conversation${diff === 1 ? "" : "s"} in this view.` : "Inbox updated."), 0);
    return () => clearTimeout(t);
  }, [total]);
  return (
    <p className="sr-only" aria-live="polite">
      {message}
    </p>
  );
}
