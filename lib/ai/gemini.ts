import "server-only";
import { ApiError, GoogleGenAI, type Content, type Part } from "@google/genai";
import type { AiProvider, GenerateRequest, StreamChunk, ToolCall, Turn } from "@/lib/ai/provider";
import { ProviderError, ProviderRateLimitError, ProviderTimeoutError } from "@/lib/ai/errors";

// The only file that imports the Gemini SDK. It translates our normalised
// turns into Gemini "contents", streams the reply back as our StreamChunks,
// and turns SDK errors into ProviderError subclasses.
//
// Gemini 3 models attach a "thought signature" to function-call parts.
// When we send the conversation back after running a tool, those exact
// parts must be included again, so we keep the raw model parts as the
// opaque providerState of the assistant turn and replay them untouched.

function toContents(turns: Turn[]): Content[] {
  const contents: Content[] = [];
  for (const turn of turns) {
    if (turn.role === "user") contents.push({ role: "user", parts: [{ text: turn.text }] });
    else if (turn.role === "assistant") {
      const raw = Array.isArray(turn.providerState) ? (turn.providerState as Part[]) : null;
      const parts: Part[] =
        raw ??
        [
          ...(turn.text ? [{ text: turn.text }] : []),
          ...(turn.toolCalls ?? []).map((c) => ({ functionCall: { id: c.id, name: c.name, args: (c.args ?? {}) as Record<string, unknown> } })),
        ];
      if (parts.length) contents.push({ role: "model", parts });
    } else {
      contents.push({
        role: "user",
        parts: turn.results.map((r) => ({ functionResponse: { id: r.callId, name: r.name, response: { result: r.result } } })),
      });
    }
  }
  return contents;
}

function normaliseError(error: unknown, signal: AbortSignal | undefined): Error {
  if (signal?.aborted) {
    return signal.reason instanceof ProviderTimeoutError ? signal.reason : new ProviderTimeoutError("Request aborted", { cause: error });
  }
  if (error instanceof ApiError) {
    if (error.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(error.message)) return new ProviderRateLimitError(undefined, { cause: error });
    if (error.status === 504 || error.status === 408) return new ProviderTimeoutError(undefined, { cause: error });
    return new ProviderError(`Gemini error ${error.status}`, `http_${error.status}`, { cause: error });
  }
  if (error instanceof Error && /429|RESOURCE_EXHAUSTED/.test(error.message)) return new ProviderRateLimitError(undefined, { cause: error });
  return new ProviderError("Gemini request failed", "provider_error", { cause: error });
}

export class GeminiProvider implements AiProvider {
  readonly name = "gemini" as const;
  private readonly client: GoogleGenAI;

  constructor(apiKey: string) {
    // The key is read on the server only; it never reaches a client bundle.
    this.client = new GoogleGenAI({ apiKey });
  }

  async *stream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    let response: Awaited<ReturnType<GoogleGenAI["models"]["generateContentStream"]>>;
    try {
      response = await this.client.models.generateContentStream({
        model: request.model,
        contents: toContents(request.turns),
        config: {
          systemInstruction: request.system,
          maxOutputTokens: request.maxOutputTokens,
          temperature: request.purpose === "answer" ? 0.2 : 0,
          abortSignal: request.signal,
          ...(request.json ? { responseMimeType: "application/json" } : {}),
          ...(request.tools?.length
            ? { tools: [{ functionDeclarations: request.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }] }
            : {}),
        },
      });
    } catch (error) {
      throw normaliseError(error, request.signal);
    }

    const modelParts: Part[] = [];
    const calls: ToolCall[] = [];
    let usage = { inputTokens: 0, outputTokens: 0 };
    try {
      for await (const chunk of response) {
        const parts = chunk.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          modelParts.push(part);
          if (part.thought) continue; // never show the model's internal reasoning
          if (part.text) yield { type: "text", text: part.text };
          if (part.functionCall?.name) {
            calls.push({ id: part.functionCall.id ?? `call_${calls.length + 1}`, name: part.functionCall.name, args: part.functionCall.args ?? {} });
          }
        }
        const meta = chunk.usageMetadata;
        if (meta) {
          usage = {
            inputTokens: meta.promptTokenCount ?? usage.inputTokens,
            outputTokens: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0) || usage.outputTokens,
          };
        }
      }
    } catch (error) {
      throw normaliseError(error, request.signal);
    }
    if (calls.length) yield { type: "tool_calls", calls, providerState: modelParts };
    yield { type: "usage", usage };
  }
}
