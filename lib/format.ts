// Display helpers. Money is integer kobo everywhere; it only becomes naira
// text here. Dates are shown in Lagos time with plain Intl, no date library.

const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

/** 9650000 (kobo, as number, bigint or numeric string) -> "₦96,500.00" */
export function formatKobo(kobo: number | bigint | string): string {
  const k = BigInt(kobo);
  // Split into naira and kobo with integer maths, so huge totals never lose precision.
  const whole = k / 100n;
  const frac = Number(k % 100n) / 100;
  return naira.format(Number(whole) + frac);
}

export const TZ = "Africa/Lagos";

const dateTime = new Intl.DateTimeFormat("en-NG", { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const dateOnly = new Intl.DateTimeFormat("en-NG", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" });

/**
 * Accepts Date objects, ISO strings, Postgres timestamptz text
 * ("2026-10-26 18:22:11.12+00", whose "+00" offset JS can't parse) and
 * plain dates ("2026-10-30", read as midday in Lagos).
 */
function toDate(v: string | Date): Date {
  if (v instanceof Date) return v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T12:00:00+01:00`);
  return new Date(v.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
}

export const formatDateTime = (v: string | Date) => dateTime.format(toDate(v));
/** A calendar date ("2026-10-30") shown as a Lagos date. */
export const formatDate = (v: string | Date) => dateOnly.format(toDate(v));

/** "4 min", "2 h 5 min", "3 days" */
export function formatDuration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
  const days = Math.round(min / 1440);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function timeAgo(v: string | Date, now = Date.now()): string {
  const ms = now - toDate(v).getTime();
  return ms < 60000 ? "just now" : `${formatDuration(ms)} ago`;
}

/** micro-dollars -> "$0.0123" */
export const formatMicroUsd = (micro: number | string) => `$${(Number(micro) / 1_000_000).toFixed(Number(micro) < 10_000 ? 4 : 2)}`;
