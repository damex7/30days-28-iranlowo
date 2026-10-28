import { z } from "zod";
import type { ToolDefinition } from "@/lib/ai/provider";

// The tool ALLOW-LIST. These three are the only things the model can ask
// the server to do. Notice what is missing: refunds, cancellations,
// address changes. Anything with consequences that are hard to undo goes
// to a person (or would need an explicit customer confirmation step),
// because a model can be wrong or manipulated and a refund can't be unsent.
//
// Each tool has a JSON Schema (sent to the model so it knows the shape) and
// a Zod schema (what we actually enforce). .strict() rejects extra keys, so
// a model that invents { "customer_id": "..." } gets an error, not a lookup.

export const ORDER_NUMBER = /^OJX-\d{6}$/;

export const toolArgSchemas = {
  get_order_status: z.object({ order_number: z.string().trim().toUpperCase().regex(ORDER_NUMBER, "order_number must look like OJX-123456") }).strict(),
  list_my_recent_orders: z.object({}).strict(),
  request_human_agent: z
    .object({ reason: z.enum(["customer_request", "negative_sentiment", "sensitive_topic", "low_confidence"]) })
    .strict(),
} as const;

export type ToolName = keyof typeof toolArgSchemas;
export type ToolArgs<N extends ToolName> = z.infer<(typeof toolArgSchemas)[N]>;
export const isToolName = (name: string): name is ToolName => Object.hasOwn(toolArgSchemas, name);

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "get_order_status",
    description: "Look up one of the signed-in customer's own orders by order number. Returns status, city, estimated delivery date, items and total, or not_found.",
    parameters: {
      type: "object",
      properties: { order_number: { type: "string", description: "Order number like OJX-204813" } },
      required: ["order_number"],
      additionalProperties: false,
    },
  },
  {
    name: "list_my_recent_orders",
    description: "List the signed-in customer's 5 most recent orders (number, status, date, total).",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "request_human_agent",
    description: "Hand the conversation to a human support agent. Use when the customer asks for a person, is very upset, or raises fraud, chargebacks or legal issues.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string", enum: ["customer_request", "negative_sentiment", "sensitive_topic", "low_confidence"] } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];
