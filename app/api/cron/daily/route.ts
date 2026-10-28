import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { connection } from "next/server";
import { runDailyMaintenance } from "@/lib/services/cron";
import { errorResponse } from "@/lib/http";

export const maxDuration = 60;

/**
 * GET /api/cron/daily, called by Vercel Cron (see vercel.json) with
 * "Authorization: Bearer <CRON_SECRET>". Anyone else gets 401.
 */
export async function GET(request: NextRequest) {
  await connection();
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const ok = !!secret && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const results = await runDailyMaintenance("cron");
    return Response.json({ ok: true, results });
  } catch (error) {
    return errorResponse(error);
  }
}
