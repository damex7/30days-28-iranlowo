"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { feedbackSchema, rateMessage } from "@/lib/services/feedback";
import { rateConversation, resolveMyConversation } from "@/lib/services/conversations";
import { NotFoundError, RuleError } from "@/lib/services/errors";
import type { FormState } from "@/lib/validation/form";

export async function rateMessageAction(input: { messageId: number; rating: "up" | "down"; reason?: string }): Promise<{ ok: boolean; message: string }> {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Couldn't save that." };
  try {
    await rateMessage(await getCurrentUser(), parsed.data);
    return { ok: true, message: parsed.data.rating === "up" ? "Thanks for the feedback." : "Thanks. This helps us improve." };
  } catch {
    return { ok: false, message: "Couldn't save your feedback. Please try again." };
  }
}

export async function resolveAction(conversationId: string): Promise<{ ok: boolean; message: string }> {
  if (!z.uuid().safeParse(conversationId).success) return { ok: false, message: "Not found." };
  try {
    await resolveMyConversation(await getCurrentUser(), conversationId);
    revalidatePath("/support/history");
    return { ok: true, message: "Marked as solved. Thanks!" };
  } catch (error) {
    return { ok: false, message: error instanceof RuleError ? error.message : "Couldn't update the conversation." };
  }
}

const csatSchema = z.object({
  conversationId: z.uuid(),
  rating: z.coerce.number({ message: "Choose a rating from 1 to 5." }).int().min(1, "Choose a rating from 1 to 5.").max(5, "Choose a rating from 1 to 5."),
  comment: z.string().trim().max(1000, "Keep the comment under 1,000 characters.").optional(),
});

export async function csatAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { comment: String(formData.get("comment") ?? "") };
  const parsed = csatSchema.safeParse({
    conversationId: formData.get("conversationId"),
    rating: formData.get("rating") ?? undefined,
    comment: formData.get("comment") || undefined,
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, errors, values };
  }
  try {
    await rateConversation(await getCurrentUser(), parsed.data.conversationId, parsed.data.rating, parsed.data.comment ?? null);
  } catch (error) {
    return { ok: false, errors: { form: error instanceof RuleError ? error.message : error instanceof NotFoundError ? "Not found." : "Couldn't save your rating." }, values };
  }
  revalidatePath("/support/history");
  return { ok: true, message: "Thank you for rating us." };
}
