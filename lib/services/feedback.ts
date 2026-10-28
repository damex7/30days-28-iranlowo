import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/session";
import { findMessage } from "@/lib/repos/messages";
import { requireCustomer } from "@/lib/services/permissions";
import { NotFoundError } from "@/lib/services/errors";

export const feedbackSchema = z.object({
  messageId: z.coerce.number().int().positive(),
  rating: z.enum(["up", "down"]),
  reason: z.enum(["wrong", "not_relevant", "unclear", "wanted_person", "other"]).optional(),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

/** Thumbs up/down on an assistant answer, by the customer who received it. */
export async function rateMessage(actor: Actor | null, input: FeedbackInput): Promise<void> {
  const customer = requireCustomer(actor);
  const message = await findMessage(input.messageId);
  if (!message || message.customer_id !== customer.id || message.sender_role !== "assistant") throw new NotFoundError();
  // The composite FK also refuses a vote that doesn't match the message's
  // conversation and customer, and CHECK (user_id = customer_id) refuses
  // anyone else's vote.
  await db.query(
    `INSERT INTO message_feedback (message_id, conversation_id, customer_id, user_id, rating, reason)
     VALUES ($1, $2, $3, $3, $4, $5)
     ON CONFLICT (message_id, user_id) DO UPDATE SET rating = EXCLUDED.rating, reason = EXCLUDED.reason`,
    [message.id, message.conversation_id, customer.id, input.rating, input.rating === "down" ? (input.reason ?? null) : null],
  );
}
