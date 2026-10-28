import { z } from "zod";
import { categorySchema } from "@/lib/validation/knowledge";

/** /agent inbox state, all from the URL. Bad values fall back to defaults. */
export const inboxQuerySchema = z.object({
  status: z.enum(["open", "waiting_human", "human", "resolved", "closed", "ai", "all"]).catch("open"),
  mine: z
    .enum(["1"])
    .optional()
    .catch(undefined)
    .transform((v) => v === "1"),
  category: categorySchema.optional().catch(undefined),
  sort: z.enum(["waiting", "newest"]).catch("waiting"),
  after: z.string().max(300).optional().catch(undefined),
});
export type InboxQuery = z.infer<typeof inboxQuerySchema>;

export const agentReplySchema = z.object({
  conversationId: z.uuid(),
  clientMessageId: z.uuid(),
  content: z.string().trim().min(1, "Write a reply first.").max(4000, "Keep replies under 4,000 characters."),
});

export const versionedIdSchema = z.object({ conversationId: z.uuid(), version: z.coerce.number().int().min(1) });
