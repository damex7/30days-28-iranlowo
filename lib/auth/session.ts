import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { config } from "@/lib/config";
import { deleteSession, insertSession, touchSession } from "@/lib/repos/sessions";
import type { Role, UserRow } from "@/lib/repos/users";

export const SESSION_COOKIE = "iranlowo_session";

/** The signed-in person as every service sees them. */
export type Actor = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  isDemo: boolean;
  /** The shared demo agent: may look, may not write. */
  isReadOnly: boolean;
};

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function toActor(u: UserRow): Actor {
  return { id: u.id, email: u.email, displayName: u.display_name, role: u.role, isDemo: u.is_demo, isReadOnly: u.is_read_only };
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    // httpOnly: page JavaScript (and so any injected script) can't read it.
    httpOnly: true,
    // Secure in production: never sent over plain HTTP.
    secure: process.env.NODE_ENV === "production",
    // Lax: sent on normal navigation, not on cross-site POSTs (basic CSRF guard).
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Creates a session row and sets the cookie. Call from a Server Action or route handler. */
export async function startSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await insertSession(hashToken(token), userId, config.sessionDays);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(config.sessionDays * 86400));
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(hashToken(token));
  jar.delete(SESSION_COOKIE);
}

/**
 * The one way to learn who is asking. Every page, action, route handler and
 * service entry point starts here. React's cache() dedupes it within one
 * request, but nothing is cached across requests: signing out or
 * deactivating an agent takes effect on the very next request.
 */
export const getCurrentUser = cache(async (): Promise<Actor | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const user = await touchSession(hashToken(token), config.sessionDays);
  return user ? toActor(user) : null;
});
