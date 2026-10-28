"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/lib/validation/form";

/**
 * Shown above a form after a failed submit. It takes focus, so screen-reader
 * and keyboard users land on the list of problems; each item links to its
 * field.
 */
export function ErrorSummary({ state, labels }: { state: FormState; labels: Record<string, string> }) {
  const ref = useRef<HTMLDivElement>(null);
  const errors = state.errors ?? {};
  const keys = Object.keys(errors);
  useEffect(() => {
    if (keys.length > 0) ref.current?.focus();
    // Re-focus whenever a new state object arrives (each submit).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  if (keys.length === 0) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alert" aria-labelledby="error-summary-title" className="mb-5 rounded-lg border-2 border-danger bg-danger-soft p-4 text-ink">
      <h2 id="error-summary-title" className="font-sans text-base font-bold text-danger">
        {keys.length === 1 ? "There is a problem" : `There are ${keys.length} problems`}
      </h2>
      <ul className="mt-2 list-disc pl-5">
        {keys.map((k) => (
          <li key={k}>
            {k === "form" ? errors[k] : <a href={`#${k}`} className="text-danger underline">{labels[k] ?? k}: {errors[k]}</a>}
          </li>
        ))}
      </ul>
    </div>
  );
}

type FieldProps = {
  name: string;
  label: string;
  state: FormState;
  type?: string;
  hint?: string;
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
};

/** Label + input + hint + inline error, wired together with aria-describedby. */
export function Field({ name, label, state, type = "text", hint, autoComplete, required, defaultValue, multiline, rows = 4, maxLength }: FieldProps) {
  const error = state.errors?.[name];
  const describedBy = [hint ? `${name}-hint` : null, error ? `${name}-error` : null].filter(Boolean).join(" ") || undefined;
  const value = state.values?.[name] ?? defaultValue ?? "";
  const common = {
    id: name,
    name,
    required,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": describedBy,
    className: "field",
    // key forces the value back in after a failed submit.
    defaultValue: value,
    maxLength,
  };
  return (
    <div className="mb-4">
      <label htmlFor={name} className="mb-1 block font-semibold">
        {label}
      </label>
      {hint && (
        <p id={`${name}-hint`} className="mb-1 text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} className="mb-1 text-sm font-semibold text-danger">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
      {multiline ? <textarea key={value} rows={rows} {...common} /> : <input key={value} type={type} autoComplete={autoComplete} {...common} />}
    </div>
  );
}

export function SubmitButton({ children, pendingText, className = "btn btn-primary" }: { children: ReactNode; pendingText: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} aria-disabled={pending} disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
