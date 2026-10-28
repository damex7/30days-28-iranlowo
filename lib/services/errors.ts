// Errors that services throw and the thin layers translate (404 page, 429
// JSON, inline form message). Services never return HTTP codes themselves.

/**
 * "Not found" also covers "exists but isn't yours". Answering 403 would
 * confirm that conversation 7f3c... exists and belongs to someone else,
 * which lets an attacker map other people's IDs. 404 tells them nothing.
 */
export class NotFoundError extends Error {
  override name = "NotFoundError";
  constructor(what = "Not found") {
    super(what);
  }
}

/** Signed out where sign-in is required. */
export class UnauthenticatedError extends Error {
  override name = "UnauthenticatedError";
  constructor() {
    super("Please sign in.");
  }
}

/** Signed in, but this role may never do this (e.g. a customer opening /admin). */
export class ForbiddenError extends Error {
  override name = "ForbiddenError";
  constructor(message = "You can't do that.") {
    super(message);
  }
}

/** The shared demo agent can look but not touch. */
export class ReadOnlyDemoError extends ForbiddenError {
  override name = "ReadOnlyDemoError";
  constructor() {
    super("The demo agent is read-only. Sign in as a seeded agent to make changes.");
  }
}

export class RateLimitedError extends Error {
  override name = "RateLimitedError";
  readonly retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** A business rule said no; the message is safe to show. */
export class RuleError extends Error {
  override name = "RuleError";
}

/** Someone else saved first (optimistic locking via a version column). */
export class ConflictError extends Error {
  override name = "ConflictError";
  constructor(message = "This was changed by someone else. Reload and try again.") {
    super(message);
  }
}
