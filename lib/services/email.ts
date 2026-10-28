import "server-only";
import { Resend } from "resend";
import { maskPII } from "@/lib/ai/guardrails";

export type Email = { to: string; subject: string; text: string };

/**
 * Sends through Resend when RESEND_API_KEY is set; otherwise prints the
 * email to the terminal so every flow works locally with no account.
 * Callers build each email for exactly one recipient from that
 * recipient's own data, so an email can never carry another customer's
 * details.
 */
export async function sendEmail(email: Email): Promise<{ delivered: boolean }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`\n[email:console] to=${email.to}\nsubject: ${email.subject}\n${email.text}\n`);
    return { delivered: false };
  }
  try {
    const { error } = await new Resend(key).emails.send({
      from: process.env.EMAIL_FROM || "Ọjà Express Support <onboarding@resend.dev>",
      to: email.to,
      subject: email.subject,
      text: email.text,
    });
    if (error) {
      console.error(`[email] failed for ${maskPII(email.to)}: ${error.message}`);
      return { delivered: false };
    }
    return { delivered: true };
  } catch (error) {
    console.error(`[email] failed for ${maskPII(email.to)}:`, error instanceof Error ? error.message : error);
    return { delivered: false };
  }
}
