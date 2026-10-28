"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { saveArticle, testRetrieval } from "@/lib/services/knowledge";
import { ConflictError, NotFoundError, RuleError } from "@/lib/services/errors";
import { articleSchema } from "@/lib/validation/knowledge";
import type { FormState } from "@/lib/validation/form";

export async function saveArticleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(["id", "version", "title", "slug", "category", "body", "status"].map((k) => [k, formData.get(k) || undefined]));
  const values = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v ?? "")]));
  const parsed = articleSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, errors, values };
  }
  let id: string;
  try {
    const saved = await saveArticle(await getCurrentUser(), parsed.data);
    id = saved.id;
    // Published content is cached; these tags make readers see the new version.
    updateTag("articles");
    updateTag(`article:${saved.slug}`);
  } catch (error) {
    if (error instanceof RuleError || error instanceof ConflictError) return { ok: false, errors: { form: error.message }, values };
    if (error instanceof NotFoundError) return { ok: false, errors: { form: "That article no longer exists." }, values };
    throw error;
  }
  redirect(`/admin/knowledge/${id}?saved=1`);
}

export async function testRetrievalAction(question: string) {
  const q = z.string().trim().min(2).max(200).safeParse(question);
  if (!q.success) return { ok: false as const, message: "Type a question of at least 2 characters." };
  const result = await testRetrieval(await getCurrentUser(), q.data);
  return { ok: true as const, ...result };
}
