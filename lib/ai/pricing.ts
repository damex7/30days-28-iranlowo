// Estimated PAID cost of each call, so analytics shows what this traffic
// would cost in production even though the free tier bills $0.
//
// Prices are US dollars per 1 million tokens, from
// https://ai.google.dev/gemini-api/docs/pricing (checked 28 Oct 2026, text
// input/output, standard tier). They change: update this table and the
// "checked" date together. Unknown models fall back to the most expensive
// row, so the estimate errs high rather than hiding cost.
//
// Stored as integer micro-dollars (1 USD = 1,000,000 µ$) for the same reason
// money is kept in kobo: no floating-point drift when we SUM thousands of runs.

type Price = { inputPerM: number; outputPerM: number };

export const PRICING_CHECKED = "2026-10-28";

const PRICES: Record<string, Price> = {
  // Introductory price until 31 Dec 2026 ($1.50 / $7.50 from 1 Jan 2027).
  "gemini-3.8-flash": { inputPerM: 0.75, outputPerM: 3.75 },
  "gemini-3.6-flash": { inputPerM: 0.75, outputPerM: 3.75 },
  "gemini-3.5-flash-lite": { inputPerM: 0.3, outputPerM: 2.5 },
  "gemini-3.1-flash-lite": { inputPerM: 0.25, outputPerM: 1.5 },
  // The mock is priced like the default answering model, so demo traffic
  // still shows a realistic estimate.
  "mock-1": { inputPerM: 0.3, outputPerM: 2.5 },
};
const FALLBACK: Price = { inputPerM: 1.5, outputPerM: 7.5 };

export function priceFor(model: string): Price {
  return PRICES[model] ?? FALLBACK;
}

/** tokens x $/1M tokens -> micro-dollars: tokens x price (since 1M tokens x $1 = 1M µ$). */
export function estimateCostMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return Math.round(inputTokens * p.inputPerM + outputTokens * p.outputPerM);
}

export const pricingTable = () => Object.entries(PRICES).map(([model, p]) => ({ model, ...p }));
