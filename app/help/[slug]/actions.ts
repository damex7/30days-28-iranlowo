"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { voteOnArticle } from "@/lib/services/help-centre";
import { RateLimitedError } from "@/lib/services/errors";

const voteSchema = z.object({ articleId: z.uuid(), helpful: z.enum(["yes", "no"]) });

export async function voteAction(_prev: { done: boolean; message: string }, formData: FormData) {
  const parsed = voteSchema.safeParse({ articleId: formData.get("articleId"), helpful: formData.get("helpful") });
  if (!parsed.success) return { done: false, message: "Something went wrong. Please try again." };
  try {
    await voteOnArticle(await getCurrentUser(), parsed.data.articleId, parsed.data.helpful === "yes");
  } catch (error) {
    if (error instanceof RateLimitedError) return { done: true, message: error.message };
    return { done: false, message: "We couldn't save that just now. Please try again." };
  }
  return {
    done: true,
    message: parsed.data.helpful === "yes" ? "Thanks! Glad it helped." : "Thanks for telling us. You can chat with us if you still need help.",
  };
}
