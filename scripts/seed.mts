// npm run db:seed. Safe to run twice: users, articles, orders and canned
// replies are upserted on their natural keys; the seeded conversations use
// fixed ids and are deleted and recreated. The seed never calls the AI
// provider: assistant messages and ai_runs rows are written by hand.

import { withTransaction, type Db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { writeArticleWithChunks } from "@/lib/services/knowledge";
import type { ArticleRow } from "@/lib/repos/articles";
import { ARTICLES } from "@/db/seed/articles";

const userPassword = process.env.SEED_USER_PASSWORD;
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
if (!userPassword || !adminPassword) {
  console.error("Set SEED_USER_PASSWORD and SEED_ADMIN_PASSWORD in .env.local first.");
  process.exit(1);
}

type SeedUser = { key: string; email: string; name: string; role: "customer" | "agent" | "admin"; phone?: string };
const USERS: SeedUser[] = [
  { key: "admin", email: "seed.admin@iranlowo.example", name: "Adaeze Admin", role: "admin" },
  { key: "ngozi", email: "seed.ngozi@iranlowo.example", name: "Ngozi Eze", role: "agent" },
  { key: "musa", email: "seed.musa@iranlowo.example", name: "Musa Danjuma", role: "agent" },
  { key: "bola", email: "seed.bola@iranlowo.example", name: "Bola Adeyemi", role: "customer", phone: "0803 000 0101" },
  { key: "chidi", email: "seed.chidi@iranlowo.example", name: "Chidi Okafor", role: "customer", phone: "0805 000 0202" },
  { key: "halima", email: "seed.halima@iranlowo.example", name: "Halima Bello", role: "customer", phone: "0809 000 0303" },
  { key: "tunde", email: "seed.tunde@iranlowo.example", name: "Tunde Afolabi", role: "customer", phone: "0701 000 0404" },
];

type Item = [name: string, qty: number, unitNaira: number];
type SeedOrder = { number: string; customer: string; status: string; pay: "card" | "pay_on_delivery"; city: string; daysAgo: number; etaDays: number | null; items: Item[] };
const ORDERS: SeedOrder[] = [
  { number: "OJX-204811", customer: "bola", status: "delivered", pay: "card", city: "Lagos", daysAgo: 12, etaDays: -10, items: [["Binatone 1.7L kettle", 1, 18500], ["Golden Penny spaghetti (20 pack)", 1, 14200]] },
  { number: "OJX-204812", customer: "bola", status: "shipped", pay: "card", city: "Lagos", daysAgo: 2, etaDays: 1, items: [["Samsung Galaxy A26 128GB", 1, 289000]] },
  { number: "OJX-204813", customer: "bola", status: "processing", pay: "pay_on_delivery", city: "Lagos", daysAgo: 0, etaDays: 2, items: [["Mama Gold rice 10kg", 2, 21500], ["Kings vegetable oil 3L", 1, 9800]] },
  { number: "OJX-204814", customer: "bola", status: "returned", pay: "card", city: "Lagos", daysAgo: 25, etaDays: -22, items: [["Oraimo wireless earbuds", 1, 24900]] },
  { number: "OJX-310021", customer: "chidi", status: "delivered", pay: "card", city: "Port Harcourt", daysAgo: 6, etaDays: -3, items: [["Hisense 205L double-door fridge", 1, 389000]] },
  { number: "OJX-310022", customer: "chidi", status: "cancelled", pay: "card", city: "Port Harcourt", daysAgo: 15, etaDays: null, items: [["Philips air fryer 4.1L", 1, 96500]] },
  { number: "OJX-310023", customer: "chidi", status: "out_for_delivery", pay: "pay_on_delivery", city: "Port Harcourt", daysAgo: 4, etaDays: 0, items: [["Dangote sugar 1kg", 4, 1900], ["Milo refill 500g", 2, 4300]] },
  // The delayed one: estimated delivery 4 days ago, still shipped.
  { number: "OJX-415501", customer: "halima", status: "shipped", pay: "card", city: "Abuja", daysAgo: 9, etaDays: -4, items: [["LG 43\" smart TV", 1, 412000]] },
  { number: "OJX-415502", customer: "halima", status: "delivered", pay: "pay_on_delivery", city: "Abuja", daysAgo: 8, etaDays: -6, items: [["Peak milk powder 900g", 2, 9600], ["Indomie chicken (carton)", 1, 11800]] },
  { number: "OJX-415503", customer: "halima", status: "delivered", pay: "card", city: "Abuja", daysAgo: 30, etaDays: -27, items: [["Vitafoam 6x6 mattress", 1, 245000]] },
  { number: "OJX-520101", customer: "tunde", status: "delivered", pay: "card", city: "Ibadan", daysAgo: 20, etaDays: -18, items: [["Kenwood blender 1.5L", 1, 52000]] },
  { number: "OJX-520102", customer: "tunde", status: "processing", pay: "pay_on_delivery", city: "Ibadan", daysAgo: 1, etaDays: 2, items: [["Morning fresh 900ml", 3, 2600], ["Ariel detergent 2kg", 1, 7400], ["Dettol soap (6 pack)", 1, 4900]] },
  { number: "OJX-520103", customer: "tunde", status: "delivered", pay: "card", city: "Ibadan", daysAgo: 45, etaDays: -42, items: [["Dell Inspiron 15 laptop", 1, 685000]] },
];

// Messages: [role, minutesAgo, content, extra?]
type Msg = [role: "customer" | "assistant" | "agent" | "system", minutesAgo: number, content: string, extra?: { agent?: string; cite?: string[]; draft?: boolean }];
type SeedConversation = {
  n: number;
  customer: string;
  subject: string;
  status: "ai" | "waiting_human" | "human" | "resolved" | "closed";
  agent?: string;
  reason?: "low_confidence" | "customer_request" | "negative_sentiment" | "sensitive_topic" | "tool_failure";
  summary?: string;
  resolvedBy?: "ai" | "agent" | "customer";
  csat?: [number, string | null];
  closed?: boolean;
  messages: Msg[];
  feedback?: { assistantIndex: number; rating: "up" | "down"; reason?: string }[];
};

const DAY = 1440;
const CONVERSATIONS: SeedConversation[] = [
  {
    n: 1, customer: "bola", subject: "Delivery fee to Lekki", status: "resolved", resolvedBy: "ai",
    messages: [
      ["customer", 3 * DAY + 30, "How much is delivery to Lekki?"],
      ["assistant", 3 * DAY + 29, "Standard delivery anywhere in Lagos, including Lekki, is ₦1,500. Orders of ₦50,000 or more get free standard delivery in Lagos [1].", { cite: ["delivery-fees"] }],
      ["customer", 3 * DAY + 25, "Great, thanks"],
    ],
    feedback: [{ assistantIndex: 0, rating: "up" }],
  },
  {
    n: 2, customer: "bola", subject: "Where is my phone?", status: "ai",
    messages: [
      ["customer", 50, "Where is my order OJX-204812?"],
      ["assistant", 49, "Your order OJX-204812 (Samsung Galaxy A26) has shipped and is on its way to Lagos. The estimated delivery date is tomorrow. A rider will call you before arriving [1].", { cite: ["tracking-your-order"] }],
    ],
  },
  {
    n: 3, customer: "chidi", subject: "Fridge arrived dented", status: "waiting_human", reason: "customer_request",
    summary: "Customer received a Hisense 205L fridge (order OJX-310021, Port Harcourt) 3 days ago with a dented door.\nAssistant explained damage must be reported within 48 hours with photos.\nCustomer is just outside the 48-hour window and asked for a person.\nNext step: decide whether to accept the late report and book a technician visit.",
    messages: [
      ["customer", 40, "My fridge came with a dent on the door"],
      ["assistant", 39, "I'm sorry about that. Damaged items should be reported within 48 hours of delivery, with photos of the item and packaging. An agent then arranges a pickup and a replacement or refund [1].", { cite: ["damaged-or-wrong-item"] }],
      ["customer", 35, "It's been 3 days. Can I talk to a person?"],
      ["system", 35, "Handed to a support agent: you asked for a person. The next available agent will reply here."],
    ],
  },
  {
    n: 4, customer: "chidi", subject: "Refund for cancelled air fryer", status: "human", agent: "ngozi", reason: "customer_request",
    summary: "Customer cancelled order OJX-310022 (Philips air fryer, ₦96,500, card) 15 days ago.\nRefund not yet visible on their card statement.\nCard refunds take 5–10 business days; this is at the edge of that window.",
    messages: [
      ["customer", 2 * DAY, "I cancelled my air fryer order and haven't seen my refund"],
      ["assistant", 2 * DAY - 1, "Refunds to a card usually take 5–10 business days to appear, depending on your bank [1]. If it's been longer, a person can check it for you.", { cite: ["refund-timelines"] }],
      ["customer", 2 * DAY - 5, "It's been over two weeks. Please get me someone"],
      ["system", 2 * DAY - 5, "Handed to a support agent: you asked for a person. The next available agent will reply here."],
      ["agent", 2 * DAY - 30, "Hi Chidi, I'm Ngozi. I can see the refund of ₦96,500 was sent to your card on the 14th. I've asked our payment provider for the reference number so you can show it to your bank.", { agent: "ngozi" }],
    ],
  },
  {
    n: 5, customer: "halima", subject: "Charged twice", status: "waiting_human", reason: "negative_sentiment",
    summary: "Customer is upset about two debits for one order (OJX-415501, LG TV, ₦412,000).\nThey also say the TV is late: estimated delivery was 4 days ago, still shipped.\nAssistant had not answered yet when the conversation was handed over.\nPriority: confirm whether the second debit completed, and chase the courier.",
    messages: [
      ["customer", 25, "You people charged me TWICE for my TV and it still hasn't come. This is rubbish!!!"],
      ["system", 25, "Handed to a support agent: this sounds frustrating, so a person will take it from here."],
    ],
  },
  {
    n: 6, customer: "halima", subject: "Change delivery address", status: "resolved", agent: "musa", reason: "customer_request", resolvedBy: "agent", csat: [5, "Musa was quick and kind."],
    summary: "Customer wanted to change the address on order OJX-415502 while it was processing.",
    messages: [
      ["customer", 9 * DAY, "Can I change my delivery address?"],
      ["assistant", 9 * DAY - 1, "Yes, while the order is still Processing. Address changes are made by an agent for your security, so I'll connect you with one [1].", { cite: ["changing-delivery-address"] }],
      ["system", 9 * DAY - 1, "Handed to a support agent: you asked for a person. The next available agent will reply here."],
      ["agent", 9 * DAY - 20, "Hello Halima, Musa here. Please send the new address and I'll update order OJX-415502.", { agent: "musa" }],
      ["customer", 9 * DAY - 25, "Plot 14, Aminu Kano Crescent, Wuse 2"],
      ["agent", 9 * DAY - 28, "Done: the order will be delivered to the Wuse 2 address. Anything else?", { agent: "musa" }],
    ],
  },
  {
    n: 7, customer: "tunde", subject: "Pay on delivery limit", status: "resolved", resolvedBy: "ai", csat: [4, null],
    messages: [
      ["customer", 6 * DAY, "is there a limit for pay on delivery"],
      ["assistant", 6 * DAY - 1, "Yes: pay on delivery is available for orders up to ₦150,000, and not for large appliances or orders using a gift card. You can pay the rider by cash, transfer to the Ọjà Express account on the receipt, or card on their POS [1].", { cite: ["pay-on-delivery-rules"] }],
    ],
    feedback: [{ assistantIndex: 0, rating: "up" }],
  },
  {
    n: 8, customer: "tunde", subject: "Blender stopped working", status: "resolved", agent: "ngozi", reason: "low_confidence", resolvedBy: "agent", csat: [3, "Got the answer but I had to wait a while."],
    summary: "Customer's Kenwood blender (OJX-520101, delivered 18 days ago) stopped working.\nOutside our 7-day dead-on-arrival window; manufacturer's warranty applies.\nCustomer needs the nearest service centre in Ibadan.",
    messages: [
      ["customer", 5 * DAY, "my blender stopped working after 2 weeks what do i do"],
      ["assistant", 5 * DAY - 1, "Faults after the first 7 days are handled by the manufacturer's service centre under the warranty, usually 6 to 12 months [1]. An agent can tell you the nearest centre.", { cite: ["product-warranty"] }],
      ["customer", 5 * DAY - 3, "where is the kenwood centre in ibadan"],
      ["assistant", 5 * DAY - 4, "I don't have the address of the service centre in Ibadan. Let me get a person to help you with that."],
      ["system", 5 * DAY - 4, "Handed to a support agent: I couldn't find this in our help articles. The next available agent will reply here."],
      ["agent", 5 * DAY - 90, "Hi Tunde, the Kenwood service partner in Ibadan is on Ring Road, near our hub. Take the blender with your receipt; repairs under warranty are free.", { agent: "ngozi" }],
    ],
    feedback: [{ assistantIndex: 1, rating: "down", reason: "not_relevant" }],
  },
  {
    n: 9, customer: "bola", subject: "Earbuds refund", status: "waiting_human", reason: "sensitive_topic",
    summary: "Customer returned Oraimo earbuds (OJX-204814, returned) and says the refund is missing.\nCustomer mentions opening a chargeback with their bank.\nCheck refund status and warn against a double refund if a chargeback is open.",
    messages: [
      ["customer", 70, "My earbuds refund never came. I'm going to do a chargeback with my bank"],
      ["system", 70, "Handed to a support agent: this needs a person to look at it. The next available agent will reply here."],
    ],
  },
  {
    n: 10, customer: "chidi", subject: "Two promo codes", status: "waiting_human", reason: "low_confidence",
    summary: "Customer asks whether a referral credit can be combined with a promo code.\nThe help centre covers promo codes and gift cards but not referral credit.\nKnowledge gap: consider adding a referral programme article.",
    messages: [
      ["customer", 3 * DAY, "can I use my referral credit with a promo code?"],
      ["assistant", 3 * DAY - 1, "I'm not sure about referral credit: our help articles don't cover it. You can rephrase, or I can get a person."],
      ["customer", 3 * DAY - 2, "referral bonus plus discount code together?"],
      ["assistant", 3 * DAY - 3, "I still can't find this in our help articles, so I've asked a person to help."],
      ["system", 3 * DAY - 3, "Handed to a support agent: I couldn't find this in our help articles. The next available agent will reply here."],
    ],
    feedback: [{ assistantIndex: 0, rating: "down", reason: "wanted_person" }],
  },
  {
    n: 11, customer: "halima", subject: "Expired milk powder", status: "human", agent: "musa", reason: "customer_request",
    summary: "Customer says Peak milk powder in OJX-415502 was past its expiry date.\nGroceries problems must be reported within 24 hours; delivered 6 days ago.\nAgent is checking with the warehouse.",
    messages: [
      ["customer", 4 * 60, "The milk powder I got is expired"],
      ["assistant", 4 * 60 - 1, "I'm sorry. Expired groceries should be reported within 24 hours of delivery and we'll refund or replace them [1]. I'll get a person to look at your order.", { cite: ["groceries-freshness"] }],
      ["system", 4 * 60 - 1, "Handed to a support agent: you asked for a person. The next available agent will reply here."],
      ["agent", 3 * 60, "Hello Halima, Musa here. Can you tell me the expiry date printed on the tin? I'm checking the batch with our Abuja warehouse.", { agent: "musa" }],
      ["agent", 2 * 60, "", { agent: "musa", draft: true }],
    ],
  },
  {
    n: 12, customer: "tunde", subject: "Password reset email", status: "closed", agent: "ngozi", reason: "customer_request", resolvedBy: "agent", closed: true, csat: [5, null],
    messages: [
      ["customer", 8 * DAY, "I'm not getting the password reset email"],
      ["assistant", 8 * DAY - 1, "Check your spam or promotions folder, make sure you used the email on your account, and wait 5 minutes between requests, since each new link cancels the old one [1].", { cite: ["reset-your-password"] }],
      ["customer", 8 * DAY - 10, "still nothing, I need someone"],
      ["system", 8 * DAY - 10, "Handed to a support agent: you asked for a person. The next available agent will reply here."],
      ["agent", 8 * DAY - 40, "Hi Tunde, your account email had a typo (gmial.com). I've corrected it; the reset link should arrive now.", { agent: "ngozi" }],
    ],
  },
];

const CANNED = [
  { title: "Greeting", category: "general", body: "Hello, thanks for waiting. I'm looking at your conversation now." },
  { title: "Ask for order number", category: "general", body: "Could you share your order number? It looks like OJX-123456 and is in your confirmation email." },
  { title: "Refund timeline (card)", category: "returns", body: "Card refunds go back to the same card and usually show within 5–10 business days, depending on your bank." },
  { title: "Photos for damaged item", category: "returns", body: "I'm sorry the item arrived damaged. Please email photos of the item and the packaging to returns@ojaexpress.example with your order number, and I'll book a free pickup." },
  { title: "Courier chased", category: "delivery", body: "I've chased the courier for your order and asked for an update today. I'll message you here as soon as I hear back." },
  { title: "Never share OTP", category: "payments", body: "Please never share your card PIN, OTP or password with anyone, including our staff. We will never ask for them." },
  { title: "Closing", category: "general", body: "Is there anything else I can help with? If not, I'll mark this as resolved. Thanks for shopping with Ọjà Express." },
];

const seedConversationId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function seedUsers(tx: Db): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const u of USERS) {
    const hash = await hashPassword(u.role === "admin" ? adminPassword! : userPassword!);
    // ON CONFLICT updates the hash too, so changing SEED_* passwords and
    // re-seeding really changes the logins.
    const rows = await tx.query<{ id: string }>(
      `INSERT INTO users (email, display_name, password_hash, role, phone)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, password_hash = EXCLUDED.password_hash,
                                         role = EXCLUDED.role, phone = EXCLUDED.phone, is_active = true
       RETURNING id`,
      [u.email, u.name, hash, u.role, u.phone ?? null],
    );
    ids[u.key] = rows[0]!.id;
  }
  return ids;
}

async function seedArticles(tx: Db, adminId: string) {
  for (const a of ARTICLES) {
    const rows = await tx.query<ArticleRow>(
      `INSERT INTO articles (slug, title, category, body, status, author_id, published_at)
       VALUES ($1, $2, $3, $4, 'published', $5, now() - interval '30 days')
       ON CONFLICT (slug) DO UPDATE
         SET title = EXCLUDED.title, category = EXCLUDED.category, body = EXCLUDED.body, status = 'published',
             published_at = COALESCE(articles.published_at, EXCLUDED.published_at),
             version = articles.version + CASE WHEN articles.body IS DISTINCT FROM EXCLUDED.body OR articles.title IS DISTINCT FROM EXCLUDED.title THEN 1 ELSE 0 END
       RETURNING id, slug, title, category, body, status, version, author_id, published_at::text, updated_at::text`,
      [a.slug, a.title, a.category, a.body, adminId],
    );
    const { replaceChunks } = await import("@/lib/repos/articles");
    const { chunkArticle } = await import("@/lib/knowledge/chunker");
    await replaceChunks(tx, rows[0]!.id, chunkArticle(a.title, a.body));
  }
  // Vocabulary once at the end (writeArticleWithChunks would rebuild it per article).
  const last = await tx.query<ArticleRow>(`SELECT id, slug, title, category, body, status, version, author_id, published_at::text, updated_at::text FROM articles WHERE slug = $1`, [ARTICLES.at(-1)!.slug]);
  await writeArticleWithChunks(tx, last[0]!);
}

async function seedOrders(tx: Db, ids: Record<string, string>) {
  for (const o of ORDERS) {
    const total = o.items.reduce((sum, [, qty, unit]) => sum + qty * unit * 100, 0);
    const rows = await tx.query<{ id: string }>(
      `INSERT INTO orders (customer_id, order_number, status, payment_method, total_kobo, delivery_city, estimated_delivery_date, delivered_at, created_at)
       VALUES ($1, $2, $3, $4, $5::bigint, $6,
               CASE WHEN $7::int IS NULL THEN NULL ELSE ((now() AT TIME ZONE 'Africa/Lagos')::date + $7::int) END,
               CASE WHEN $3 IN ('delivered', 'returned') THEN now() + make_interval(days => $7::int) END,
               now() - make_interval(days => $8::int))
       ON CONFLICT (order_number) DO UPDATE
         SET customer_id = EXCLUDED.customer_id, status = EXCLUDED.status, payment_method = EXCLUDED.payment_method,
             total_kobo = EXCLUDED.total_kobo, delivery_city = EXCLUDED.delivery_city,
             estimated_delivery_date = EXCLUDED.estimated_delivery_date, delivered_at = EXCLUDED.delivered_at, created_at = EXCLUDED.created_at
       RETURNING id`,
      [ids[o.customer]!, o.number, o.status, o.pay, String(total), o.city, o.etaDays, o.daysAgo],
    );
    const orderId = rows[0]!.id;
    await tx.query(`DELETE FROM order_items WHERE order_id = $1`, [orderId]);
    await tx.query(
      `INSERT INTO order_items (order_id, product_name, quantity, unit_kobo)
       SELECT $1, * FROM unnest($2::text[], $3::int[], $4::bigint[])`,
      [orderId, o.items.map((i) => i[0]), o.items.map((i) => i[1]), o.items.map((i) => String(i[2] * 100))],
    );
  }
}

async function seedConversations(tx: Db, ids: Record<string, string>) {
  const convIds = CONVERSATIONS.map((c) => seedConversationId(c.n));
  // Messages are append-only; the purge flag is the one sanctioned way round
  // it, scoped to this transaction (set_config(..., true) = SET LOCAL).
  await tx.query(`SELECT set_config('app.allow_purge', 'on', true)`);
  await tx.query(`DELETE FROM message_feedback WHERE conversation_id = ANY($1::uuid[])`, [convIds]);
  await tx.query(`DELETE FROM ai_runs WHERE conversation_id = ANY($1::uuid[])`, [convIds]);
  await tx.query(`DELETE FROM messages WHERE conversation_id = ANY($1::uuid[])`, [convIds]);
  await tx.query(`DELETE FROM conversations WHERE id = ANY($1::uuid[])`, [convIds]);
  await tx.query(`SELECT set_config('app.allow_purge', 'off', true)`);

  const chunkFor = async (slug: string) =>
    (await tx.query<{ id: number; title: string }>(
      `SELECT c.id::int, a.title FROM article_chunks c JOIN articles a ON a.id = c.article_id WHERE a.slug = $1 ORDER BY c.position LIMIT 1`,
      [slug],
    ))[0];

  for (const c of CONVERSATIONS) {
    const id = seedConversationId(c.n);
    const customerId = ids[c.customer]!;
    const first = c.messages[0]![1];
    const last = c.messages.filter((m) => !m[3]?.draft).at(-1)![1];
    const resolvedMinutes = c.resolvedBy ? Math.max(last - 30, 1) : null;
    const handoff = c.messages.find((m) => m[0] === "system");
    const firstAgent = c.messages.find((m) => m[0] === "agent" && !m[3]?.draft);
    const firstReply = c.messages.find((m) => m[0] !== "customer");
    // Insert in an open state first; agent-resolved ones are resolved after
    // their agent messages exist (the resolve-trail trigger checks that).
    await tx.query(
      `INSERT INTO conversations (id, customer_id, subject, status, assigned_agent_id, handoff_reason, handed_off_at, summary,
                                  first_response_at, first_agent_reply_at, last_message_at, created_at, customer_last_seen_at, csat_requested_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() - make_interval(mins => $7::int), $8,
               now() - make_interval(mins => $9::int), now() - make_interval(mins => $10::int),
               now() - make_interval(mins => $11::int), now() - make_interval(mins => $12::int), now() - make_interval(mins => $11::int),
               CASE WHEN $13 THEN now() - make_interval(mins => $11::int) END)`,
      [
        id, customerId, c.subject,
        c.status === "resolved" || c.status === "closed" ? (c.agent ? "human" : "ai") : c.status,
        c.agent ? ids[c.agent]! : null,
        c.reason ?? null,
        handoff ? handoff[1] : null,
        c.summary ?? null,
        firstReply ? firstReply[1] : null,
        firstAgent ? firstAgent[1] : null,
        last, first,
        !!c.csat,
      ],
    );
    const messageIds: number[] = [];
    const assistantIds: number[] = [];
    let previousCustomer: number | null = null;
    for (const [role, minutesAgo, content, extra] of c.messages) {
      const citations: { ref: number; chunkId: number; slug: string; title: string; anchor: string }[] = [];
      for (const slug of extra?.cite ?? []) {
        const chunk = await chunkFor(slug);
        if (chunk) citations.push({ ref: citations.length + 1, chunkId: chunk.id, slug, title: chunk.title, anchor: "" });
      }
      const rows: { id: number }[] = await tx.query<{ id: number }>(
        `INSERT INTO messages (conversation_id, customer_id, sender_role, sender_id, content, citations, is_draft, client_message_id, in_reply_to, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, CASE WHEN $3 = 'customer' THEN gen_random_uuid() END, $8, now() - make_interval(mins => $9::int))
         RETURNING id::int`,
        [
          id, customerId, role,
          role === "customer" ? customerId : role === "agent" ? ids[extra?.agent ?? "ngozi"]! : null,
          extra?.draft ? "Thanks for waiting, Halima. The warehouse confirmed that batch expired early. I'll arrange a replacement tin with your next delivery, or a refund of ₦9,600 if you prefer." : content,
          JSON.stringify(citations),
          !!extra?.draft,
          role === "assistant" ? previousCustomer : null,
          minutesAgo,
        ],
      );
      const mid: number = rows[0]!.id;
      messageIds.push(mid);
      if (role === "customer") previousCustomer = mid;
      if (role === "assistant") {
        assistantIds.push(mid);
        const chunkIds = citations.map((x) => x.chunkId);
        await tx.query(
          `INSERT INTO ai_runs (conversation_id, message_id, purpose, provider, model, prompt_version, input_tokens, output_tokens, latency_ms,
                                estimated_cost_micro_usd, retrieved_chunk_ids, retrieval_top_score, outcome, question_excerpt, created_at)
           VALUES ($1, $2, 'answer', 'mock', 'mock-1', 'support-v1', $3, $4, $5, $6, $7::bigint[], $8, $9, $10, now() - make_interval(mins => $11::int))`,
          [
            id, mid, 620 + content.length, Math.ceil(content.length / 4), 900 + (mid % 7) * 130,
            Math.round((620 + content.length) * 0.3 + Math.ceil(content.length / 4) * 2.5),
            chunkIds, chunkIds.length ? 0.42 : 0.05,
            chunkIds.length ? "answered" : "handoff",
            c.messages.filter((m) => m[0] === "customer" && m[1] >= minutesAgo).at(-1)?.[2]?.slice(0, 200) ?? null,
            minutesAgo,
          ],
        );
      }
    }
    if (handoff) {
      await tx.query(
        `INSERT INTO ai_runs (conversation_id, purpose, provider, model, prompt_version, input_tokens, output_tokens, latency_ms, estimated_cost_micro_usd, outcome, question_excerpt, created_at)
         VALUES ($1, 'summarise', 'mock', 'mock-1', 'summary-v1', 410, 70, 640, 298, 'handoff', $2, now() - make_interval(mins => $3::int))`,
        [id, c.messages.find((m) => m[0] === "customer")?.[2].slice(0, 200) ?? null, handoff[1]],
      );
    }
    if (c.resolvedBy) {
      await tx.query(
        `UPDATE conversations
            SET status = $2, resolved_by = $3, resolved_at = now() - make_interval(mins => $4::int),
                closed_at = CASE WHEN $2 = 'closed' THEN now() - make_interval(mins => $4::int) + interval '3 days' END,
                csat_rating = $5, csat_comment = $6
          WHERE id = $1`,
        [id, c.closed ? "closed" : "resolved", c.resolvedBy, resolvedMinutes, c.csat?.[0] ?? null, c.csat?.[1] ?? null],
      );
    }
    for (const f of c.feedback ?? []) {
      const mid = assistantIds[f.assistantIndex];
      if (mid) {
        await tx.query(
          `INSERT INTO message_feedback (message_id, conversation_id, customer_id, user_id, rating, reason) VALUES ($1, $2, $3, $3, $4, $5)`,
          [mid, id, customerId, f.rating, f.reason ?? null],
        );
      }
    }
  }
}

async function seedCanned(tx: Db, adminId: string) {
  for (const r of CANNED) {
    await tx.query(
      `INSERT INTO canned_replies (title, body, category, created_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (title) DO UPDATE SET body = EXCLUDED.body, category = EXCLUDED.category`,
      [r.title, r.body, r.category, adminId],
    );
  }
}

const started = Date.now();
await withTransaction(async (tx) => {
  const ids = await seedUsers(tx);
  await seedArticles(tx, ids.admin!);
  await seedOrders(tx, ids);
  await seedConversations(tx, ids);
  await seedCanned(tx, ids.admin!);
});
console.log(`Seeded ${USERS.length} users, ${ARTICLES.length} articles, ${ORDERS.length} orders, ${CONVERSATIONS.length} conversations, ${CANNED.length} canned replies in ${Date.now() - started} ms.`);
console.log("Sign in with seed.bola@iranlowo.example (customer), seed.ngozi@iranlowo.example (agent) or seed.admin@iranlowo.example (admin).");
process.exit(0);
