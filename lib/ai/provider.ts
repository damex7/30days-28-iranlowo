import "server-only";

// THE PROVIDER INTERFACE. The rest of the app talks to "an AI provider" in
// these normalised shapes (turns, tool definitions, tool calls, streamed
// chunks, token usage) and never imports a vendor SDK. Swapping Gemini for
// another vendor, or for the deterministic mock, means writing one class
// that implements AiProvider; the assistant, tool loop, logging and check
// script don't change.

export type ProviderName = "gemini" | "mock";
export type Purpose = "answer" | "classify" | "summarise" | "draft_reply";

/** A tool the model may ask us to run. parameters is a JSON Schema object. */
export type ToolDefinition = {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
};

/** The model asking us to run a tool. args is UNTRUSTED: always Zod-parse it. */
export type ToolCall = { id: string; name: string; args: unknown };
export type ToolResult = { callId: string; name: string; result: unknown };

export type Turn =
  | { role: "user"; text: string }
  /** providerState: opaque vendor data that must be echoed back (e.g. Gemini thought signatures). */
  | { role: "assistant"; text: string; toolCalls?: ToolCall[]; providerState?: unknown }
  | { role: "tool"; results: ToolResult[] };

export type Usage = { inputTokens: number; outputTokens: number };

export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "tool_calls"; calls: ToolCall[]; providerState?: unknown }
  | { type: "usage"; usage: Usage };

export type GenerateRequest = {
  purpose: Purpose;
  model: string;
  system: string;
  turns: Turn[];
  tools?: ToolDefinition[];
  maxOutputTokens: number;
  /** Ask for a JSON object back (classification). */
  json?: boolean;
  signal?: AbortSignal;
};

export interface AiProvider {
  readonly name: ProviderName;
  /** Streams text and/or tool calls, then one usage chunk. Throws ProviderError subclasses. */
  stream(request: GenerateRequest): AsyncIterable<StreamChunk>;
}

/** Collects a stream into one result: for classify/summarise calls that don't stream to the user. */
export async function collect(provider: AiProvider, request: GenerateRequest) {
  let text = "";
  let toolCalls: ToolCall[] = [];
  let providerState: unknown;
  let usage: Usage = { inputTokens: 0, outputTokens: 0 };
  for await (const chunk of provider.stream(request)) {
    if (chunk.type === "text") text += chunk.text;
    else if (chunk.type === "tool_calls") {
      toolCalls = [...toolCalls, ...chunk.calls];
      providerState = chunk.providerState ?? providerState;
    } else usage = chunk.usage;
  }
  return { text, toolCalls, providerState, usage };
}

export type ProviderInfo = {
  name: ProviderName;
  model: string;
  fastModel: string;
  /** Why the mock is active, when it is. */
  reason: string | null;
};

/**
 * Which provider is active. AI_PROVIDER picks it; with no GEMINI_API_KEY we
 * fall back to the mock automatically so the app (and the demo) always work.
 */
export function providerInfo(): ProviderInfo {
  const wanted = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  const model = process.env.AI_MODEL || "gemini-3.5-flash-lite";
  const fastModel = process.env.AI_FAST_MODEL || "gemini-3.1-flash-lite";
  if (wanted === "mock") return { name: "mock", model: "mock-1", fastModel: "mock-1", reason: "AI_PROVIDER is set to mock" };
  if (!process.env.GEMINI_API_KEY) return { name: "mock", model: "mock-1", fastModel: "mock-1", reason: "no GEMINI_API_KEY is set" };
  return { name: "gemini", model, fastModel, reason: null };
}

let cached: { key: string; provider: AiProvider } | null = null;

export async function getProvider(): Promise<AiProvider> {
  const info = providerInfo();
  if (cached?.key === info.name) return cached.provider;
  const provider =
    info.name === "gemini"
      ? new (await import("@/lib/ai/gemini")).GeminiProvider(process.env.GEMINI_API_KEY ?? "")
      : (await import("@/lib/ai/mock")).mockProvider;
  cached = { key: info.name, provider };
  return provider;
}
