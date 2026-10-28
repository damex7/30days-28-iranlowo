import "server-only";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { startSession, type Actor } from "@/lib/auth/session";
import { findUserForSignIn, insertUser } from "@/lib/repos/users";
import { enforce } from "@/lib/services/rate-limit";
import { RuleError } from "@/lib/services/errors";
import type { SignInInput, SignUpInput } from "@/lib/validation/auth";
import { sendEmail } from "@/lib/services/email";

// One message for every failure, so the form never reveals whether an
// email has an account.
const GENERIC = "That email and password don't match an account.";

export async function signIn(actor: Actor | null, input: SignInInput, ip: string): Promise<Actor> {
  // Two limits: per IP (one attacker, many emails) and per email (many
  // IPs, one victim). Both count attempts, not failures, so they can't be
  // reset by a lucky success.
  await enforce(`signin:ip:${ip}`, 20, 15 * 60, "Too many sign-in attempts. Wait a few minutes and try again.");
  await enforce(`signin:email:${input.email}`, 8, 15 * 60, "Too many sign-in attempts. Wait a few minutes and try again.");

  const user = await findUserForSignIn(input.email);
  // verifyPassword runs a full scrypt even when user is null (dummy hash).
  const ok = await verifyPassword(input.password, user?.password_hash ?? null);
  if (!user || !ok || !user.is_active) throw new RuleError(GENERIC);

  await startSession(user.id);
  return { id: user.id, email: user.email, displayName: user.display_name, role: user.role, isDemo: user.is_demo, isReadOnly: user.is_read_only };
}

/**
 * Creates a customer account. Whether or not the email was already taken,
 * the caller shows the same "now sign in" message; the existing owner gets
 * an email instead, so sign-up can't be used to test which emails exist.
 */
export async function signUp(actor: Actor | null, input: SignUpInput, ip: string): Promise<void> {
  await enforce(`signup:ip:${ip}`, 10, 60 * 60, "Too many sign-ups from this network. Try again later.");
  const created = await insertUser({ email: input.email, displayName: input.displayName, passwordHash: await hashPassword(input.password) });
  if (!created) {
    await sendEmail({
      to: input.email,
      subject: "Someone tried to create an Ọjà Express support account with your email",
      text: "If this was you, you already have an account: sign in, or ask an agent for help. If not, you can ignore this email.",
    });
  }
}
