import "server-only";
import { neon, Pool, type PoolClient } from "@neondatabase/serverless";

// The only module that talks to Postgres directly. Two rules hold here:
//  1. Parameterised queries only: SQL text and values travel separately
//     ($1, $2...), so user input can never change the shape of a query.
//  2. Multi-step writes go through withTransaction(), which holds one
//     connection and runs BEGIN ... COMMIT (or ROLLBACK on any error).

export type Row = Record<string, unknown>;
export type Param = string | number | boolean | bigint | null | Date | readonly unknown[] | Record<string, unknown>;

/** Anything that can run a query: the shared HTTP client or a transaction. */
export interface Db {
  query<T extends Row = Row>(text: string, params?: readonly Param[]): Promise<T[]>;
}

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new DatabaseUnavailableError("DATABASE_URL is not set");
  return url;
}

function normalise(params: readonly Param[]): unknown[] {
  // jsonb columns get plain objects/arrays as JSON text; bigints as strings.
  return params.map((p) =>
    typeof p === "bigint" ? p.toString() : p !== null && typeof p === "object" && !(p instanceof Date) && !Array.isArray(p) ? JSON.stringify(p) : p,
  );
}

let http: ReturnType<typeof neon> | null = null;

/** One-shot queries over HTTP: no connection to manage, ideal for serverless reads. */
export const db: Db = {
  async query<T extends Row = Row>(text: string, params: readonly Param[] = []): Promise<T[]> {
    http ??= neon(databaseUrl());
    try {
      return (await http.query(text, normalise(params))) as T[];
    } catch (error) {
      throw wrapError(error);
    }
  },
};

let pool: Pool | null = null;

/**
 * Runs fn inside BEGIN/COMMIT on one pooled WebSocket connection. Any throw
 * rolls the whole thing back, so e.g. "save article + rebuild its chunks"
 * can never leave half the chunks behind.
 */
export async function withTransaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  pool ??= new Pool({ connectionString: databaseUrl() });
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    throw wrapError(error);
  }
  const tx: Db = {
    async query<R extends Row = Row>(text: string, params: readonly Param[] = []): Promise<R[]> {
      try {
        return (await client.query(text, normalise(params))).rows as R[];
      } catch (error) {
        throw wrapError(error);
      }
    },
  };
  try {
    await client.query("BEGIN");
    const result = await fn(tx);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Raised when Postgres cannot be reached, so pages can show a friendly screen. */
export class DatabaseUnavailableError extends Error {
  override name = "DatabaseUnavailableError";
}

/** A Postgres error with its SQLSTATE code (23505 unique, 23503 FK, 23514 check...). */
export class DatabaseError extends Error {
  override name = "DatabaseError";
  readonly code: string | undefined;
  readonly constraint: string | undefined;
  constructor(message: string, code: string | undefined, constraint: string | undefined, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.constraint = constraint;
  }
}

function wrapError(error: unknown): Error {
  if (error instanceof DatabaseError || error instanceof DatabaseUnavailableError) return error;
  const e = error as { code?: unknown; constraint?: unknown; message?: unknown };
  if (typeof e?.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) {
    return new DatabaseError(String(e.message), e.code, typeof e.constraint === "string" ? e.constraint : undefined, { cause: error });
  }
  // Prerender aborts inside Next must keep propagating as-is.
  if (error instanceof Error && /HANGING_PROMISE|prerender/i.test(error.message)) return error;
  return new DatabaseUnavailableError(error instanceof Error ? error.message : "database unreachable", { cause: error });
}

export const isUniqueViolation = (e: unknown, constraint?: string) =>
  e instanceof DatabaseError && e.code === "23505" && (!constraint || e.constraint === constraint);
export const isCheckViolation = (e: unknown) => e instanceof DatabaseError && (e.code === "23514" || e.code === "23503");
