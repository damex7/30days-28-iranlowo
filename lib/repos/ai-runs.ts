import "server-only";
import { db, type Db } from "@/lib/db";
import type { ProviderName, Purpose } from "@/lib/ai/provider";

export type RunOutcome = "answered" | "handoff" | "refused" | "error" | "timeout" | "rate_limited" | "fallback_mock";

export type RunRecord = {
  conversationId: string | null;
  messageId?: number | null;
  purpose: Purpose;
  provider: ProviderName;
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostMicroUsd: number;
  retrievedChunkIds?: number[];
  retrievalTopScore?: number | null;
  /** Names + MASKED arguments only. */
  toolsCalled?: { name: string; args: unknown; ok: boolean }[];
  outcome: RunOutcome;
  errorCode?: string | null;
  /** Already masked + truncated by questionExcerpt(). */
  questionExcerpt?: string | null;
};

export async function insertRuns(runs: RunRecord[], q: Db = db): Promise<void> {
  for (const r of runs) {
    await q.query(
      `INSERT INTO ai_runs (conversation_id, message_id, purpose, provider, model, prompt_version, input_tokens, output_tokens, latency_ms,
                            estimated_cost_micro_usd, retrieved_chunk_ids, retrieval_top_score, tools_called, outcome, error_code, question_excerpt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::bigint[], $12, $13::jsonb, $14, $15, $16)`,
      [
        r.conversationId,
        r.messageId ?? null,
        r.purpose,
        r.provider,
        r.model,
        r.promptVersion,
        r.inputTokens,
        r.outputTokens,
        r.latencyMs,
        r.estimatedCostMicroUsd,
        r.retrievedChunkIds ?? [],
        r.retrievalTopScore ?? null,
        JSON.stringify(r.toolsCalled ?? []),
        r.outcome,
        r.errorCode ?? null,
        r.questionExcerpt ?? null,
      ],
    );
  }
}

export type AiRunListRow = {
  id: number;
  conversation_id: string | null;
  message_id: number | null;
  purpose: Purpose;
  provider: ProviderName;
  model: string;
  prompt_version: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  estimated_cost_micro_usd: string;
  retrieved_chunk_ids: string[];
  retrieval_top_score: number | null;
  tools_called: { name: string; args: unknown; ok: boolean }[];
  outcome: RunOutcome;
  error_code: string | null;
  question_excerpt: string | null;
  created_at: string;
};

/** Newest first, keyset on id (unique and increasing, so no tie-breaker needed). */
export async function listRuns(filter: { outcome: RunOutcome | null; purpose: Purpose | null; beforeId: number | null }, limit: number): Promise<AiRunListRow[]> {
  return db.query<AiRunListRow>(
    `SELECT id::int, conversation_id, message_id::int, purpose, provider, model, prompt_version, input_tokens, output_tokens, latency_ms,
            estimated_cost_micro_usd::text, retrieved_chunk_ids::text[], retrieval_top_score, tools_called, outcome, error_code, question_excerpt, created_at::text
       FROM ai_runs
      WHERE ($1::text IS NULL OR outcome = $1) AND ($2::text IS NULL OR purpose = $2) AND ($3::bigint IS NULL OR id < $3)
      ORDER BY id DESC LIMIT $4`,
    [filter.outcome, filter.purpose, filter.beforeId, limit + 1],
  );
}
