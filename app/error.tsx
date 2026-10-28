"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

// Shown when a page fails, most often because the database or the AI
// provider can't be reached. It never shows technical detail, and it always
// offers a way to a person.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    console.error(error.digest ?? error.message);
  }, [error]);
  return (
    <section className="card mx-auto max-w-xl p-6" aria-labelledby="error-title">
      <h1 id="error-title" ref={heading} tabIndex={-1} className="text-3xl">We couldn&rsquo;t load this page</h1>
      <p className="mt-3 text-muted">
        Something on our side isn&rsquo;t responding right now. Your messages are saved. Please try again in a moment.
      </p>
      <p className="mt-2 text-muted">
        If it&rsquo;s urgent, email <a href="mailto:help@ojaexpress.example">help@ojaexpress.example</a> and a person will reply.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" onClick={() => retry()}>Try again</button>
        <Link className="btn btn-secondary" href="/help">Help centre</Link>
      </div>
    </section>
  );
}
