import "server-only";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/session";
import { maskPII } from "@/lib/ai/guardrails";
import { requireAdmin } from "@/lib/services/permissions";
import { listRuns } from "@/lib/repos/ai-runs";

// MEASURING THE AI. Every number is computed in SQL over a time window,
// straight from the tables the app writes as it works: conversations
// (status, handoff, timings, CSAT), message_feedback (thumbs) and ai_runs
// (one row per model call: tokens, cost estimate, outcome).

export type Window = 7 | 30;

export async function analytics(actor: Actor | null, days: Window) {
  requireAdmin(actor);
  const [conv, reasons, feedback, usage, outcomes, gaps, downReasons] = await Promise.all([
    db.query<{
      total: number;
      ai_resolved: number;
      handed_off: number;
      avg_first_response_s: number | null;
      avg_agent_pickup_s: number | null;
      avg_csat: number | null;
      csat_count: number;
    }>(
      `SELECT count(*)::int AS total,
              -- "Resolved without a human": the customer marked it solved while only the AI had spoken.
              count(*) FILTER (WHERE resolved_by = 'ai')::int AS ai_resolved,
              count(*) FILTER (WHERE handed_off_at IS NOT NULL)::int AS handed_off,
              avg(extract(epoch FROM first_response_at - created_at))::float8 AS avg_first_response_s,
              avg(extract(epoch FROM first_agent_reply_at - handed_off_at)) FILTER (WHERE handed_off_at IS NOT NULL)::float8 AS avg_agent_pickup_s,
              avg(csat_rating)::float8 AS avg_csat,
              count(csat_rating)::int AS csat_count
         FROM conversations WHERE created_at > now() - make_interval(days => $1)`,
      [days],
    ),
    db.query<{ reason: string; n: number }>(
      `SELECT handoff_reason AS reason, count(*)::int AS n FROM conversations
        WHERE created_at > now() - make_interval(days => $1) AND handoff_reason IS NOT NULL
        GROUP BY handoff_reason ORDER BY n DESC`,
      [days],
    ),
    db.query<{ total: number; down: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE rating = 'down')::int AS down
         FROM message_feedback WHERE created_at > now() - make_interval(days => $1)`,
      [days],
    ),
    db.query<{ purpose: string; provider: string; calls: number; input_tokens: number; output_tokens: number; cost_micro_usd: string; avg_latency_ms: number | null }>(
      `SELECT purpose, provider, count(*)::int AS calls, COALESCE(sum(input_tokens), 0)::int AS input_tokens,
              COALESCE(sum(output_tokens), 0)::int AS output_tokens, COALESCE(sum(estimated_cost_micro_usd), 0)::text AS cost_micro_usd,
              round(avg(latency_ms))::int AS avg_latency_ms
         FROM ai_runs WHERE created_at > now() - make_interval(days => $1)
        GROUP BY purpose, provider ORDER BY purpose, provider`,
      [days],
    ),
    db.query<{ outcome: string; n: number }>(
      `SELECT outcome, count(*)::int AS n FROM ai_runs WHERE created_at > now() - make_interval(days => $1) GROUP BY outcome ORDER BY n DESC`,
      [days],
    ),
    // Knowledge gaps: the first customer question of conversations the AI
    // couldn't answer (low confidence), grouped by the question text.
    db.query<{ question: string; n: number; last_at: string }>(
      `SELECT lower(left(regexp_replace(m.content, '\\s+', ' ', 'g'), 90)) AS question, count(*)::int AS n, max(c.created_at)::text AS last_at
         FROM conversations c
         JOIN LATERAL (SELECT content FROM messages WHERE conversation_id = c.id AND sender_role = 'customer' ORDER BY id LIMIT 1) m ON true
        WHERE c.created_at > now() - make_interval(days => $1) AND c.handoff_reason IN ('low_confidence', 'tool_failure')
        GROUP BY 1 ORDER BY n DESC, last_at DESC LIMIT 10`,
      [days],
    ),
    db.query<{ reason: string | null; n: number }>(
      `SELECT reason, count(*)::int AS n FROM message_feedback
        WHERE rating = 'down' AND created_at > now() - make_interval(days => $1) GROUP BY reason ORDER BY n DESC`,
      [days],
    ),
  ]);
  const c = conv[0]!;
  const f = feedback[0]!;
  return {
    days,
    conversations: c.total,
    aiResolutionRate: c.total ? c.ai_resolved / c.total : null,
    aiResolved: c.ai_resolved,
    handoffRate: c.total ? c.handed_off / c.total : null,
    handedOff: c.handed_off,
    handoffReasons: reasons,
    avgFirstResponseSeconds: c.avg_first_response_s,
    avgAgentPickupSeconds: c.avg_agent_pickup_s,
    avgCsat: c.avg_csat,
    csatCount: c.csat_count,
    feedbackTotal: f.total,
    thumbsDownRate: f.total ? f.down / f.total : null,
    downReasons,
    usage,
    totalCostMicroUsd: usage.reduce((s, u) => s + Number(u.cost_micro_usd), 0),
    totalTokens: usage.reduce((s, u) => s + u.input_tokens + u.output_tokens, 0),
    outcomes,
    knowledgeGaps: gaps.map((g) => ({ ...g, question: maskPII(g.question) })),
  };
}

/** /admin/ai-runs: newest first, keyset on id. */
export async function browseRuns(actor: Actor | null, filter: Parameters<typeof listRuns>[0], limit: number) {
  requireAdmin(actor);
  return listRuns(filter, limit);
}
