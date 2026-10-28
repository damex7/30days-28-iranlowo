import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { pollConversation } from "@/lib/services/conversations";
import { errorResponse } from "@/lib/http";

// GET /api/conversations/:id/messages?since=41 returns only messages newer
// than the last one the browser has.
//
// Why poll instead of WebSockets: on a serverless host each request is a
// short-lived function; there is no long-running server to hold thousands
// of open sockets. A small request every few seconds, answered from an
// index (conversation_id, id), is cheap and works everywhere. At larger
// scale we'd move to a managed realtime service (Pusher, Ably, Supabase
// Realtime) or Server-Sent Events from a long-running server, triggered
// by Postgres LISTEN/NOTIFY.
const query = z.object({ since: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).catch(0) });

export async function GET(request: NextRequest, { params }: RouteContext<"/api/conversations/[id]/messages">) {
  const { id } = await params;
  const { since } = query.parse({ since: request.nextUrl.searchParams.get("since") ?? undefined });
  try {
    const result = await pollConversation(await getCurrentUser(), id, since);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
