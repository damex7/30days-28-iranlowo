import "server-only";

// Every tunable limit in one place. Defaults are deliberately low: the
// Gemini free tier allows only a handful of requests per minute and a
// limited number per day, shared by every visitor of the deployed demo.
const int = (name: string, fallback: number) => {
  const n = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = {
  appUrl: process.env.APP_URL || "http://localhost:3028",
  /** Longest customer message accepted (characters). Long inputs cost tokens and hide injections. */
  maxMessageLength: 1000,
  /** Customer messages per customer per Lagos day. */
  dailyMessageCap: int("DAILY_MESSAGE_CAP", 40),
  /** Customer messages in one conversation before we suggest a person. */
  conversationMessageCap: int("CONVERSATION_MESSAGE_CAP", 30),
  /** Chat route: requests per customer per minute. */
  chatPerMinute: int("CHAT_PER_MINUTE", 6),
  /** Recent messages sent to the model as memory. */
  historyMessages: 6,
  /** Retrieved chunks sent to the model. */
  contextChunks: 4,
  /** Max tool-call round trips in one answer. */
  maxToolIterations: 3,
  maxOutputTokens: 400,
  /** Longest assistant answer we will stream or save, whatever the model does. */
  maxAnswerChars: 2400,
  modelTimeoutMs: 20_000,
  sessionDays: 30,
  /** Waiting longer than this in the queue is flagged in the inbox. */
  slaMinutes: 15,
} as const;
