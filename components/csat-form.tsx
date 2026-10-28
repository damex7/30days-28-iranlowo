"use client";

import { useActionState, useEffect } from "react";
import { ErrorSummary, SubmitButton } from "@/components/form";
import { csatAction } from "@/app/support/actions";
import { initialFormState } from "@/lib/validation/form";

/** "How did we do?" 1–5 with an optional comment, shown after resolution. */
export function CsatForm({ conversationId, onDone }: { conversationId: string; onDone?: () => void }) {
  const [state, action] = useActionState(csatAction, initialFormState);
  useEffect(() => {
    if (state.ok) onDone?.();
  }, [state.ok, onDone]);
  if (state.ok) return <p role="status">{state.message}</p>;
  const ratingError = state.errors?.rating;
  return (
    <form action={action} noValidate>
      <ErrorSummary state={state} labels={{ rating: "Rating", comment: "Comment" }} />
      <input type="hidden" name="conversationId" value={conversationId} />
      <fieldset id="rating" aria-describedby={ratingError ? "rating-error" : undefined}>
        <legend className="font-semibold">How did we do?</legend>
        {ratingError && <p id="rating-error" className="text-sm font-semibold text-danger"><span aria-hidden="true">⚠ </span>{ratingError}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="btn btn-secondary min-h-11 cursor-pointer has-[:checked]:bg-iroko has-[:checked]:text-on-iroko">
              <input type="radio" name="rating" value={n} className="sr-only" />
              {n}
              <span className="sr-only">{n === 1 ? " (poor)" : n === 5 ? " (excellent)" : ""}</span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">1 = poor, 5 = excellent</p>
      </fieldset>
      <label htmlFor={`comment-${conversationId}`} className="mt-3 block font-semibold">Anything to add? (optional)</label>
      <textarea id={`comment-${conversationId}`} name="comment" className="field mt-1" rows={2} maxLength={1000} defaultValue={state.values?.comment ?? ""} />
      <div className="mt-3">
        <SubmitButton pendingText="Saving…">Send rating</SubmitButton>
      </div>
    </form>
  );
}
