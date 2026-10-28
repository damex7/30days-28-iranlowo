"use client";

import { useActionState } from "react";
import { ErrorSummary, Field, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/validation/form";
import { promoteAction } from "./actions";

export function PromoteForm() {
  const [state, action] = useActionState(promoteAction, initialFormState);
  return (
    <form action={action} noValidate className="card p-4">
      <h2 className="mb-2 text-xl">Promote a customer to agent</h2>
      <ErrorSummary state={state} labels={{ email: "Email" }} />
      {state.ok && <p role="status" className="mb-3 rounded-lg bg-iroko-soft p-3">{state.message}</p>}
      <Field name="email" label="Their account email" type="email" state={state.ok ? { ok: true } : state} required />
      <SubmitButton pendingText="Promoting…">Make agent</SubmitButton>
    </form>
  );
}
