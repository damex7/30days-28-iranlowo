// Guardrails that run in code, around the model. Unlike prompt wording,
// these hold even if the model is confused or manipulated.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Nigerian numbers: +234 / 234 / 0 followed by 10 digits, with optional
// spaces or dashes ("0803 123 4567", "+234-803-123-4567").
const PHONE = /(?:\+?234[\s-]?|\b0)[789][01]\d(?:[\s-]?\d){7}\b/g;
const CARD = /\b(?:\d[ -]?){13,19}\b/g;

/**
 * Replaces emails, phone numbers and card-like numbers. Applied to text
 * before it goes to the AI provider, into ai_runs, into logs, and to
 * customer details shown to the read-only demo agent.
 */
export function maskPII(text: string): string {
  return text
    .replace(EMAIL, (m) => {
      const [user = "", domain = ""] = m.split("@");
      return `${user.slice(0, 1)}***@${domain.replace(/^[^.]+/, "***")}`;
    })
    .replace(PHONE, (m) => `${m.slice(0, 4)}*** ****`)
    .replace(CARD, "[card number removed]");
}

/** Order numbers keep their shape but not their digits in logs: OJX-2***13. */
export const maskOrderNumber = (n: string) => n.replace(/^(OJX-\d)\d{3}(\d{2})$/, "$1***$2");

/** "I want a human", "talk to agent", "abeg connect me to person"… */
const HUMAN_REQUEST =
  /\b(speak|talk|chat|connect|transfer|put)\b.{0,30}\b(human|person|agent|someone|somebody|staff|representative|customer care)\b|\b(real|actual|live)\s+(person|human|agent)\b|\bhuman\s+agent\b|\bi\s+want\s+(a\s+)?(human|person|agent)\b/i;

export const asksForHuman = (text: string) => HUMAN_REQUEST.test(text);

/**
 * Cheap keyword pre-check for topics a model should never handle alone.
 * The fast classifier model also looks for these; this catches them even
 * when the classifier is unavailable (free-tier quota, timeout, mock).
 */
const SENSITIVE =
  /\b(fraud|scam(med)?|chargeback|dispute (the|a|my) (charge|payment)|lawyer|legal action|sue|court|police|efcc|stolen card|unauthori[sz]ed (charge|debit|transaction))\b/i;
const ANGRY =
  /\b(useless|rubbish|nonsense|terrible|worst|disgusting|furious|angry|fed up|wicked|thief|thieves|ridiculous)\b|!!!/i;

export function keywordFlags(text: string): { sensitive: boolean; negative: boolean } {
  return { sensitive: SENSITIVE.test(text), negative: ANGRY.test(text) };
}

/** Text inside our delimiters must not be able to close the block early. */
export function escapeForPrompt(text: string): string {
  return text.replace(/<\/?(reference|customer_message|tool_result)[^>]*>/gi, "[tag removed]");
}

/** Whatever the model produced, never stream or save more than this. */
export function capAnswer(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\n"));
  return `${cut.slice(0, lastStop > max * 0.6 ? lastStop + 1 : max)}…`;
}

/** A short, masked version of a question for analytics. */
export const questionExcerpt = (text: string) => maskPII(text.replace(/\s+/g, " ").trim()).slice(0, 200);
