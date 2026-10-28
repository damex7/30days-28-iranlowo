"use client";

import { useState, useTransition } from "react";
import { testRetrievalAction } from "./actions";

type Hit = { chunkId: number; slug: string; title: string; heading: string; score: number; content: string };

/** Shows exactly which chunks the assistant would pull for a question, and their scores. */
export function TestRetrieval() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<{ threshold: number; hits: Hit[] } | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <section className="card mt-4 p-4" aria-labelledby="test-title">
      <h2 id="test-title" className="text-xl">Test retrieval</h2>
      <form
        className="mt-2 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await testRetrievalAction(question);
            if (r.ok) {
              setResult({ threshold: r.threshold, hits: r.hits });
              setError("");
            } else setError(r.message);
          });
        }}
      >
        <label htmlFor="test-q" className="sr-only">Question</label>
        <input id="test-q" className="field flex-1" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. can i pay the rider with transfer" aria-describedby={error ? "test-error" : undefined} />
        <button className="btn btn-secondary" disabled={pending}>{pending ? "Searching…" : "Test"}</button>
      </form>
      {error && <p id="test-error" className="mt-2 text-sm font-semibold text-danger">{error}</p>}
      <div role="status" aria-live="polite" className="mt-3 text-sm">
        {result && (
          <>
            <p className="font-semibold">
              {result.hits.filter((h) => h.score >= result.threshold).length} chunk(s) above the assistant&rsquo;s threshold of {result.threshold}.
              {result.hits.every((h) => h.score < result.threshold) && " The assistant would say it doesn't know and offer a person."}
            </p>
            <ol className="mt-2 space-y-2">
              {result.hits.map((h) => (
                <li key={h.chunkId} className={`rounded-lg border p-2 ${h.score >= result.threshold ? "border-iroko" : "border-dashed border-line-strong"}`}>
                  <p>
                    <span className="tabular font-bold">{h.score.toFixed(3)}</span> {h.score >= result.threshold ? "✓ used" : "✗ below threshold"} · {h.title} › {h.heading}
                  </p>
                  <p className="line-clamp-2 text-muted">{h.content}</p>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}
