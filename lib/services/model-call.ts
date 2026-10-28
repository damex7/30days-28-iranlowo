import "server-only";
import { config } from "@/lib/config";
import { getProvider, providerInfo, type GenerateRequest, type ToolCall, type Usage } from "@/lib/ai/provider";
import { mockProvider } from "@/lib/ai/mock";
import { ProviderError, ProviderRateLimitError, ProviderTimeoutError, ProviderUnavailableError } from "@/lib/ai/errors";
import { estimateCostMicroUsd } from "@/lib/ai/pricing";
import type { RunOutcome, RunRecord } from "@/lib/repos/ai-runs";

// One model call, with the free-tier realities handled in one place:
//  * a hard timeout (AbortSignal) so a stuck request can't hang the chat;
//  * HTTP 429 / quota errors, and "can't reach the provider" network errors:
//    wait ~1.5 s (plus jitter), retry once, and if it still fails, answer
//    with the deterministic mock provider instead, marked "fallback_mock" so
//    analytics counts it;
//  * a small circuit breaker: after a call has fallen back, calls in the
//    next 60 s go straight to the mock instead of waiting on a provider we
//    already know is struggling (per server instance, best effort);
//  * every attempt, failed or not, becomes a RunRecord for ai_runs.

export type CallResult = {
  text: string;
  toolCalls: ToolCall[];
  providerState: unknown;
  usage: Usage;
  /** Records for every attempt; the caller adds message ids and saves them. */
  runs: RunRecord[];
  fellBack: boolean;
};

export class ModelUnavailableError extends Error {
  override name = "ModelUnavailableError";
  readonly outcome: RunOutcome;
  readonly runs: RunRecord[];
  readonly partialText: string;
  constructor(outcome: RunOutcome, runs: RunRecord[], partialText: string) {
    super(`model unavailable: ${outcome}`);
    this.outcome = outcome;
    this.runs = runs;
    this.partialText = partialText;
  }
}

type CallOptions = Omit<GenerateRequest, "model" | "signal"> & {
  fast?: boolean;
  promptVersion: string;
  conversationId: string | null;
  /** Aborts when the customer disconnects or presses Stop. */
  signal?: AbortSignal;
  /** Filled in per run: retrieval context and masked question. */
  runExtras?: Partial<RunRecord>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BREAKER_MS = 60_000;
let degradedUntil = 0;
/** For the check script: forget a tripped breaker. */
export const resetCircuitBreaker = () => {
  degradedUntil = 0;
};

/**
 * Streams one model call: yields text deltas as they arrive and returns the
 * full result. Use with a manual loop or yield* in the assistant.
 */
export async function* streamModel(options: CallOptions): AsyncGenerator<string, CallResult> {
  const info = providerInfo();
  const runs: RunRecord[] = [];
  let attempt = 0;
  // Breaker tripped recently: skip the real provider for now.
  let useMock = info.name !== "mock" && Date.now() < degradedUntil;

  for (;;) {
    attempt++;
    const provider = useMock ? mockProvider : await getProvider();
    const model = provider.name === "mock" ? "mock-1" : options.fast ? info.fastModel : info.model;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new ProviderTimeoutError()), config.modelTimeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
    const started = Date.now();
    let text = "";
    let toolCalls: ToolCall[] = [];
    let providerState: unknown;
    let usage: Usage = { inputTokens: 0, outputTokens: 0 };
    const record = (outcome: RunOutcome, errorCode: string | null = null): RunRecord => ({
      conversationId: options.conversationId,
      purpose: options.purpose,
      provider: provider.name,
      model,
      promptVersion: options.promptVersion,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      latencyMs: Date.now() - started,
      estimatedCostMicroUsd: estimateCostMicroUsd(model, usage.inputTokens, usage.outputTokens),
      outcome,
      errorCode,
      ...options.runExtras,
    });

    try {
      for await (const chunk of provider.stream({ ...options, model, signal })) {
        if (chunk.type === "text") {
          text += chunk.text;
          yield chunk.text;
        } else if (chunk.type === "tool_calls") {
          toolCalls = [...toolCalls, ...chunk.calls];
          providerState = chunk.providerState ?? providerState;
        } else usage = chunk.usage;
      }
      clearTimeout(timer);
      // An estimate when the provider doesn't report usage.
      if (usage.inputTokens === 0) usage = { inputTokens: Math.ceil(JSON.stringify(options.turns).length / 4), outputTokens: Math.ceil(text.length / 4) };
      const run = record(useMock && info.name !== "mock" ? "fallback_mock" : "answered");
      runs.push(run);
      return { text, toolCalls, providerState, usage, runs, fellBack: useMock && info.name !== "mock" };
    } catch (error) {
      clearTimeout(timer);
      // The customer pressed Stop / closed the tab: not a provider failure.
      if (options.signal?.aborted) {
        runs.push(record("answered", "client_aborted"));
        throw new ModelUnavailableError("answered", runs, text);
      }
      const limited = error instanceof ProviderRateLimitError;
      if ((limited || error instanceof ProviderUnavailableError) && text === "") {
        runs.push(record(limited ? "rate_limited" : "error", error.code));
        if (attempt === 1 && provider.name !== "mock") {
          await sleep(1500 + Math.random() * 500);
          continue;
        }
        if (!useMock) {
          useMock = true;
          degradedUntil = Date.now() + BREAKER_MS;
          continue;
        }
        throw new ModelUnavailableError(limited ? "rate_limited" : "error", runs, text);
      }
      const outcome: RunOutcome = error instanceof ProviderTimeoutError || timeout.signal.aborted ? "timeout" : "error";
      runs.push(record(outcome, error instanceof ProviderError ? error.code : "unknown"));
      console.error(`[ai] ${options.purpose} ${outcome}:`, error instanceof Error ? error.name : "error");
      throw new ModelUnavailableError(outcome, runs, text);
    }
  }
}

/** The same call without streaming, for classify / summarise / draft. */
export async function callModel(options: CallOptions): Promise<CallResult> {
  const gen = streamModel(options);
  for (;;) {
    const step = await gen.next();
    if (step.done) return step.value;
  }
}
