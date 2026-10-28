import { z } from "zod";

export const CATEGORIES = ["delivery", "returns", "payments", "account", "products"] as const;
export const categorySchema = z.enum(CATEGORIES);

export const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  delivery: "Delivery",
  returns: "Returns & refunds",
  payments: "Payments",
  account: "Your account",
  products: "Products & warranty",
};

export const articleSchema = z.object({
  id: z.uuid().optional(),
  version: z.coerce.number().int().min(1).optional(),
  title: z.string().trim().min(3, "Give the article a title of at least 3 characters.").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single dashes, like delivery-fees-lagos.")
    .max(80),
  category: categorySchema,
  body: z.string().trim().min(20, "Write at least a couple of sentences.").max(20000),
  status: z.enum(["draft", "published", "archived"]),
});
export type ArticleInput = z.infer<typeof articleSchema>;

/**
 * /help search parameters. Every value comes from the URL, so anything can
 * arrive: .catch() gives a safe default instead of an error page.
 */
export const helpSearchSchema = z.object({
  q: z.string().trim().max(200).catch(""),
  category: categorySchema.optional().catch(undefined),
  /** Opaque keyset cursor: base64url of "score:chunkId" or "title\u0000id". */
  after: z.string().max(300).optional().catch(undefined),
});
export type HelpSearch = z.infer<typeof helpSearchSchema>;
