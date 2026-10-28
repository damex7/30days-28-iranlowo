"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { endSession, getCurrentUser } from "@/lib/auth/session";
import { signIn, signUp } from "@/lib/services/auth";
import { RateLimitedError, RuleError } from "@/lib/services/errors";
import { safeNext, signInSchema, signUpSchema } from "@/lib/validation/auth";
import type { FormState } from "@/lib/validation/form";
import { homeFor } from "@/lib/services/permissions";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: String(formData.get("email") ?? ""), next: String(formData.get("next") ?? "") };
  const parsed = signInSchema.safeParse({ ...values, password: formData.get("password") });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error), values };
  let destination: string;
  try {
    const actor = await signIn(null, parsed.data, await clientIp());
    destination = safeNext(parsed.data.next, homeFor(actor));
  } catch (error) {
    if (error instanceof RuleError || error instanceof RateLimitedError) {
      return { ok: false, errors: { form: error.message }, values };
    }
    throw error;
  }
  redirect(destination);
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { displayName: String(formData.get("displayName") ?? ""), email: String(formData.get("email") ?? "") };
  const parsed = signUpSchema.safeParse({ ...values, password: formData.get("password") });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error), values };
  try {
    await signUp(null, parsed.data, await clientIp());
  } catch (error) {
    if (error instanceof RateLimitedError) return { ok: false, errors: { form: error.message }, values };
    throw error;
  }
  redirect(`/sign-in?notice=created&email=${encodeURIComponent(parsed.data.email)}`);
}

export async function signOutAction(): Promise<void> {
  if (await getCurrentUser()) await endSession();
  redirect("/");
}
