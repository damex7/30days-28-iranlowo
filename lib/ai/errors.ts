// Normalised provider failures. Each maps to an ai_runs outcome and to a
// friendly message plus an offer of a human.

export class ProviderError extends Error {
  override name = "ProviderError";
  readonly code: string;
  constructor(message: string, code = "provider_error", options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}

/** HTTP 429 / RESOURCE_EXHAUSTED: free-tier per-minute or per-day quota hit. */
export class ProviderRateLimitError extends ProviderError {
  override name = "ProviderRateLimitError";
  constructor(message = "The AI provider is rate-limiting us", options?: ErrorOptions) {
    super(message, "rate_limited", options);
  }
}

export class ProviderTimeoutError extends ProviderError {
  override name = "ProviderTimeoutError";
  constructor(message = "The AI provider took too long", options?: ErrorOptions) {
    super(message, "timeout", options);
  }
}
