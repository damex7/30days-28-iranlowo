"use client";

import { useActionState } from "react";
import { ErrorSummary, Field, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/validation/form";
import { signUpAction } from "../actions";

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, initialFormState);
  return (
    <form action={action} noValidate>
      <ErrorSummary state={state} labels={{ displayName: "Your name", email: "Email", password: "Password" }} />
      <Field name="displayName" label="Your name" autoComplete="name" required state={state} maxLength={80} />
      <Field name="email" label="Email" type="email" autoComplete="email" required state={state} />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters. A short sentence works well."
        required
        state={{ ...state, values: {} }}
      />
      <SubmitButton pendingText="Creating your account…">Create account</SubmitButton>
    </form>
  );
}
