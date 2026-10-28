import "server-only";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/services/email";

// Each email is built for exactly one customer from that customer's own
// row (name, email, their conversation's subject), so it can never carry
// another customer's details. No message content is included: the
// customer reads the reply after signing in.

/**
 * "An agent replied while you were away", once per burst: the UPDATE only
 * matches when the customer has been away for 2+ minutes AND has looked at
 * the chat since our last such email (or there was none). Five quick agent
 * replies in a row therefore send one email, not five. The UPDATE claims
 * the send atomically, so two concurrent replies can't both email.
 */
export async function notifyCustomerOfAgentReply(conversationId: string): Promise<boolean> {
  const rows = await db.query<{ email: string; display_name: string; subject: string; is_demo: boolean }>(
    `UPDATE conversations c SET agent_reply_emailed_at = now()
       FROM users u
      WHERE c.id = $1 AND u.id = c.customer_id
        AND c.customer_last_seen_at < now() - interval '2 minutes'
        AND (c.agent_reply_emailed_at IS NULL OR c.agent_reply_emailed_at < c.customer_last_seen_at)
      RETURNING u.email::text, u.display_name, c.subject, u.is_demo`,
    [conversationId],
  );
  const r = rows[0];
  if (!r) return false;
  await sendEmail({
    to: r.email,
    subject: `An agent replied: ${r.subject}`,
    text: `Hello ${r.display_name.split(" ")[0]},\n\nA member of the Ọjà Express support team replied to your conversation "${r.subject}".\n\nRead and reply here: ${config.appUrl}/support?c=${conversationId}\n\nỌjà Express support`,
  });
  return true;
}

/** The CSAT request after resolution. The caller claims it (csat_requested_at) first. */
export async function sendCsatRequest(to: { email: string; name: string; conversationId: string; subject: string }) {
  await sendEmail({
    to: to.email,
    subject: "How did we do?",
    text: `Hello ${to.name.split(" ")[0]},\n\nYour conversation "${to.subject}" is resolved. Could you rate it from 1 to 5? It takes ten seconds:\n${config.appUrl}/support/history\n\nThank you,\nỌjà Express support`,
  });
}
