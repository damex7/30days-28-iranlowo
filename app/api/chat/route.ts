import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { chatInputSchema, prepareCustomerMessage, runAssistant, type ChatEvent } from "@/lib/services/assistant";
import { errorResponse } from "@/lib/http";

// Allow slow free-tier responses (model + tool round trips) on Vercel.
export const maxDuration = 60;

/**
 * POST /api/chat streams the assistant's answer as NDJSON: one JSON event
 * per line (meta, delta…, done). Why stream: a model takes several seconds
 * to write a full answer; showing words as they arrive makes that wait
 * feel like a conversation, and the customer can press Stop.
 * Thin by design: parse with Zod, call the service, shape the response.
 */
export async function POST(request: NextRequest) {
  const actor = await getCurrentUser().catch(() => null);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request", message: "Send JSON." }, { status: 400 });
  }
  const parsed = chatInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid message." }, { status: 400 });
  }

  let prepared: Awaited<ReturnType<typeof prepareCustomerMessage>>;
  try {
    prepared = await prepareCustomerMessage(actor, parsed.data);
  } catch (error) {
    return errorResponse(error);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: ChatEvent | { type: "error"; message: string; offerHuman: boolean }) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false; // the browser went away; keep running so the answer is saved
        }
      };
      try {
        // request.signal aborts when the customer presses Stop or closes the
        // tab; the assistant then saves the partial answer as interrupted.
        for await (const event of runAssistant(actor!, prepared, parsed.data, request.signal)) send(event);
      } catch (error) {
        console.error("[chat] stream failed:", error instanceof Error ? `${error.name}: ${error.message}` : error);
        send({ type: "error", message: "Something went wrong while answering. Your message is saved. Please try again, or talk to a person.", offerHuman: true });
      } finally {
        if (open) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
