import "server-only";
import type { Actor } from "@/lib/auth/session";
import { ForbiddenError, ReadOnlyDemoError, UnauthenticatedError } from "@/lib/services/errors";

// Role rules in one place, used by every service. The pages hide buttons
// too, but that is only for comfort: these checks are what protect data.

export function requireUser(actor: Actor | null): Actor {
  if (!actor) throw new UnauthenticatedError();
  return actor;
}

export function requireCustomer(actor: Actor | null): Actor {
  const a = requireUser(actor);
  if (a.role !== "customer") throw new ForbiddenError("This page is for customers.");
  return a;
}

export const isStaff = (a: Actor | null): a is Actor => !!a && (a.role === "agent" || a.role === "admin");

export function requireStaff(actor: Actor | null): Actor {
  const a = requireUser(actor);
  if (!isStaff(a)) throw new ForbiddenError("This page is for support agents.");
  return a;
}

export function requireAdmin(actor: Actor | null): Actor {
  const a = requireUser(actor);
  if (a.role !== "admin") throw new ForbiddenError("This page is for admins.");
  return a;
}

/** Any write by staff goes through this: the shared demo agent is read-only. */
export function requireWritableStaff(actor: Actor | null): Actor {
  const a = requireStaff(actor);
  if (a.isReadOnly) throw new ReadOnlyDemoError();
  return a;
}

export function homeFor(actor: Actor): string {
  if (actor.role === "admin") return "/admin/analytics";
  if (actor.role === "agent") return "/agent";
  return "/support";
}
