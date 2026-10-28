"use client";

import { useActionState } from "react";
import { voteAction } from "./actions";

export function HelpfulButtons({ articleId }: { articleId: string }) {
  const [state, action, pending] = useActionState(voteAction, { done: false, message: "" });
  return (
    <form action={action} className="card mt-5 flex flex-wrap items-center gap-3 p-4">
      <input type="hidden" name="articleId" value={articleId} />
      <p id="helpful-label" className="font-semibold">Was this helpful?</p>
      {!state.done && (
        <div role="group" aria-labelledby="helpful-label" className="flex gap-2">
          <button className="btn btn-secondary" name="helpful" value="yes" disabled={pending}>Yes</button>
          <button className="btn btn-secondary" name="helpful" value="no" disabled={pending}>No</button>
        </div>
      )}
      <p role="status" aria-live="polite" className="text-muted">{state.message}</p>
    </form>
  );
}
