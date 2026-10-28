import "server-only";
import { DatabaseUnavailableError } from "@/lib/db";
import { ForbiddenError, NotFoundError, RateLimitedError, RuleError, UnauthenticatedError, ConflictError } from "@/lib/services/errors";

/** Service errors -> JSON responses for route handlers. Unknown errors never leak details. */
export function errorResponse(error: unknown): Response {
  const json = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
  if (error instanceof UnauthenticatedError) return json(401, { error: "unauthenticated", message: error.message });
  if (error instanceof NotFoundError || error instanceof ForbiddenError) {
    // Forbidden by role is fine to state; "not yours" is always 404 upstream.
    return error instanceof ForbiddenError ? json(403, { error: "forbidden", message: error.message }) : json(404, { error: "not_found", message: "Not found." });
  }
  if (error instanceof RateLimitedError) {
    return json(429, { error: "rate_limited", message: error.message, offerHuman: true }, { "Retry-After": String(error.retryAfterSeconds) });
  }
  if (error instanceof RuleError || error instanceof ConflictError) return json(409, { error: "rule", message: error.message, offerHuman: true });
  if (error instanceof DatabaseUnavailableError) {
    console.error("[db] unavailable:", error.message);
    return json(503, { error: "unavailable", message: "We can't reach our systems right now. Please try again in a minute.", offerHuman: true });
  }
  console.error("[api] unexpected error:", error instanceof Error ? `${error.name}: ${error.message}` : error);
  return json(500, { error: "server", message: "Something went wrong on our side. Please try again.", offerHuman: true });
}
