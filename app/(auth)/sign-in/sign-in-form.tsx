"use client";

import { useActionState } from "react";
import { ErrorSummary, Field, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/validation/form";
import { signInAction } from "../actions";

export function SignInForm({ next, email }: { next: string; email: string }) {
  const [state, action] = useActionState(signInAction, initialFormState);
  return (
    <form action={action} noValidate>
      <ErrorSummary state={state} labels={{ email: "Email", password: "Password" }} />
      <input type="hidden" name="next" value={next} />
      <Field name="email" label="Email" type="email" autoComplete="email" required state={state} defaultValue={email} />
      <Field name="password" label="Password" type="password" autoComplete="current-password" required state={{ ...state, values: {} }} />
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
