import "server-only";
import type { AiProvider, GenerateRequest, StreamChunk, ToolCall, Turn } from "@/lib/ai/provider";
import { ProviderRateLimitError, ProviderTimeoutError } from "@/lib/ai/errors";
import { keywordFlags } from "@/lib/ai/guardrails";

// A deterministic stand-in for a real model. Same input, same output, no
// network, no key, no quota. It is used when GEMINI_API_KEY is missing,
// when AI_PROVIDER=mock, and as the fallback after repeated 429s. It goes
// through exactly the same interface as Gemini, so the tool loop,
// streaming, logging and handoff are exercised for real.
//
// What it does:
//  * answer: if it sees an order number and has tools, it calls
//    get_order_status; "my orders" -> list_my_recent_orders; after tool
//    results it phrases them; otherwise it quotes the first <reference>.
//  * classify: keyword rules -> the same JSON shape the real prompt asks for.
//  * summarise / draft_reply: templates over the transcript.
// The check script can switch on failure scenarios with setMockScenario().

export type MockScenario = "none" | "rate_limit" | "timeout" | "tool_loop" | "bad_tool_args" | "foreign_customer_id";
let scenario: MockScenario = "none";
export function setMockScenario(s: MockScenario) {
  scenario = s;
}

const delayMs = () => Number(process.env.MOCK_STREAM_DELAY_MS ?? 12);
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (ms <= 0) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason instanceof Error ? signal.reason : new ProviderTimeoutError());
    }, { once: true });
  });

const lastUser = (turns: Turn[]) => [...turns].reverse().find((t) => t.role === "user")?.text ?? "";
const customerText = (text: string) => /<customer_message>\n?([\s\S]*?)\n?<\/customer_message>\s*$/.exec(text)?.[1]?.trim() ?? text;

function references(text: string) {
  return [...text.matchAll(/<reference id="(\d+)" article="([^"]+)" title="([^"]*)" section="([^"]*)">\n([\s\S]*?)\n<\/reference>/g)].map((m) => ({
    id: m[1]!,
    title: m[3]!,
    section: m[4]!,
    content: m[5]!,
  }));
}

function firstSentences(text: string, n: number) {
  const clean = text.replace(/\s+/g, " ").replace(/\*\*/g, "").trim();
  const parts = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  return parts
    .slice(0, n)
    .map((p) => p.trim())
    .join(" ");
}

const STATUS_LABEL: Record<string, string> = {
  processing: "being packed at our warehouse",
  shipped: "shipped and on its way",
  out_for_delivery: "out for delivery today",
  delivered: "delivered",
  cancelled: "cancelled",
  returned: "returned",
};

type OrderResult = { found?: boolean; order?: { order_number: string; status: string; delivery_city: string; estimated_delivery_date: string | null; total: string } };

function phraseToolResults(turn: Extract<Turn, { role: "tool" }>): string {
  const lines: string[] = [];
  for (const r of turn.results) {
    const res = r.result as OrderResult & { orders?: { order_number: string; status: string; total: string }[]; error?: string; handed_off?: boolean };
    if (res.error) lines.push("I couldn't look that up just now. Let me get a person to help.");
    else if (r.name === "get_order_status") {
      if (!res.found || !res.order) lines.push("I couldn't find an order with that number on your account. Please check the number (it looks like OJX-123456), or ask for your recent orders.");
      else {
        const o = res.order;
        lines.push(
          `Your order ${o.order_number} is ${STATUS_LABEL[o.status] ?? o.status}${o.status === "delivered" || o.status === "cancelled" || o.status === "returned" ? "" : ` to ${o.delivery_city}`}.` +
            (o.estimated_delivery_date && !["delivered", "cancelled", "returned"].includes(o.status) ? ` The estimated delivery date is ${o.estimated_delivery_date}.` : "") +
            ` Order total: ${o.total}.`,
        );
      }
    } else if (r.name === "list_my_recent_orders") {
      const orders = res.orders ?? [];
      lines.push(orders.length === 0 ? "I can't see any orders on your account yet." : `Here are your recent orders:\n${orders.map((o) => `- ${o.order_number}: ${STATUS_LABEL[o.status] ?? o.status} (${o.total})`).join("\n")}`);
    } else if (r.name === "request_human_agent") {
      lines.push("I've asked a person from our support team to take over. They'll reply here.");
    }
  }
  return lines.join("\n\n");
}

function answer(request: GenerateRequest): { text?: string; calls?: ToolCall[] } {
  const last = request.turns.at(-1);
  const toolsOn = (request.tools?.length ?? 0) > 0;
  // A misbehaving model: keeps asking for tools, even when none are offered.
  if (scenario === "tool_loop") return { calls: [{ id: `loop_${request.turns.length}`, name: "list_my_recent_orders", args: {} }] };
  if (last?.role === "tool") return { text: phraseToolResults(last) };

  const userText = lastUser(request.turns);
  const message = customerText(userText);
  if (toolsOn) {
    if (scenario === "bad_tool_args") return { calls: [{ id: "bad_1", name: "get_order_status", args: { order_number: "1; DROP TABLE orders" } }] };
    const order = /\bOJX-?\s?(\d{6})\b/i.exec(message);
    if (order) {
      const args: Record<string, unknown> = { order_number: `OJX-${order[1]}` };
      // Simulates a model tricked into supplying someone else's id.
      if (scenario === "foreign_customer_id") args.customer_id = "00000000-0000-0000-0000-000000000000";
      return { calls: [{ id: "call_1", name: "get_order_status", args }] };
    }
    if (/\b(my|recent|all)\s+(recent\s+)?orders?\b|\bwhere('s| is) my (order|package|parcel)\b/i.test(message)) {
      return { calls: [{ id: "call_1", name: "list_my_recent_orders", args: {} }] };
    }
  }
  const refs = references(userText);
  const top = refs[0];
  if (!top) return { text: "I'm not sure about that, and I don't want to guess. Would you like me to connect you with a person?" };
  const second = refs[1] && refs[1].title !== top.title ? ` You may also find "${refs[1].title}" useful [${refs[1].id}].` : "";
  return { text: `${firstSentences(top.content, 2)} [${top.id}]${second}` };
}

function classify(request: GenerateRequest): string {
  const text = customerText(lastUser(request.turns));
  const flags = keywordFlags(text);
  return JSON.stringify({ sentiment: flags.negative ? "very_negative" : "neutral", sensitive: flags.sensitive, topic: "other" });
}

function summarise(request: GenerateRequest): string {
  const t = lastUser(request.turns);
  const customerLines = [...t.matchAll(/^Customer: (.+)$/gm)].map((m) => m[1]!);
  const orders = [...new Set([...t.matchAll(/OJX-\d{6}/g)].map((m) => m[0]))];
  const lastAssistant = [...t.matchAll(/^Assistant: (.+)$/gm)].at(-1)?.[1];
  return [
    `Customer asks: ${(customerLines[0] ?? "help").slice(0, 160)}`,
    customerLines.length > 1 ? `Latest message: ${customerLines.at(-1)!.slice(0, 160)}` : null,
    orders.length ? `Orders mentioned: ${orders.join(", ")}` : "No order number given yet.",
    lastAssistant ? `Assistant last said: ${lastAssistant.slice(0, 160)}` : "The assistant had not answered yet.",
    "Next step: read the thread, confirm details with the customer.",
  ]
    .filter(Boolean)
    .join("\n");
}

function draft(request: GenerateRequest): string {
  const t = lastUser(request.turns);
  const name = /^Customer name: (.+)$/m.exec(t)?.[1]?.split(" ")[0] ?? "there";
  const ref = references(t)[0];
  return `Hello ${name}, thanks for your patience. ${ref ? firstSentences(ref.content, 1) + " " : ""}I'm looking into this for you now and will update you here shortly.`;
}

export const mockProvider: AiProvider = {
  name: "mock",
  async *stream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    if (scenario === "rate_limit") throw new ProviderRateLimitError("Simulated 429 from mock provider");
    if (scenario === "timeout") {
      await sleep(60_000, request.signal);
      throw new ProviderTimeoutError();
    }
    const inputTokens = Math.ceil((request.system.length + request.turns.reduce((n, t) => n + JSON.stringify(t).length, 0)) / 4);
    let text = "";
    if (request.purpose === "classify") text = classify(request);
    else if (request.purpose === "summarise") text = summarise(request);
    else if (request.purpose === "draft_reply") text = draft(request);
    else {
      const out = answer(request);
      if (out.calls) {
        yield { type: "tool_calls", calls: out.calls };
        yield { type: "usage", usage: { inputTokens, outputTokens: 12 } };
        return;
      }
      text = out.text ?? "";
    }
    // Stream word by word so the UI's streaming path is exercised.
    for (const piece of text.match(/\S+\s*/g) ?? []) {
      await sleep(request.purpose === "answer" ? delayMs() : 0, request.signal);
      yield { type: "text", text: piece };
    }
    yield { type: "usage", usage: { inputTokens, outputTokens: Math.ceil(text.length / 4) } };
  },
};
