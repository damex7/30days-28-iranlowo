// Help-centre articles for the fictional store Ọjà Express. The policies are
// consistent across articles because the assistant may quote any of them.

export type SeedArticle = { slug: string; title: string; category: "delivery" | "returns" | "payments" | "account" | "products"; body: string };

export const ARTICLES: SeedArticle[] = [
  // ───────────────────────── delivery ─────────────────────────
  {
    slug: "delivery-times-by-city",
    title: "How long delivery takes in each city",
    category: "delivery",
    body: `We deliver to Lagos, Abuja, Port Harcourt and Ibadan. Times are counted in business days (Monday to Saturday, excluding public holidays) from when your order is confirmed.

## Lagos
Orders confirmed before 2pm are usually delivered the **next business day**, on both the Mainland and the Island. Orders confirmed after 2pm take 1–2 business days.

## Abuja
Delivery takes **2–3 business days** within the FCT, including Gwarinpa, Wuse, Garki, Maitama, Kubwa and Lugbe.

## Port Harcourt
Delivery takes **3–4 business days**. Addresses outside the city ring road may take one extra day.

## Ibadan
Delivery takes **2–3 business days** within Ibadan metropolis.

## Large items
Fridges, freezers, washing machines, mattresses and furniture travel on a separate truck and can take **2 extra business days** in every city. Your order page shows the estimated delivery date once the item ships.`,
  },
  {
    slug: "delivery-fees",
    title: "Delivery fees and free delivery",
    category: "delivery",
    body: `The delivery fee is shown at checkout before you pay. It depends on the city and the size of the items.

## Standard delivery fees
- Lagos: ₦1,500
- Ibadan: ₦2,000
- Abuja: ₦2,500
- Port Harcourt: ₦3,000

## Free delivery
Orders of **₦50,000 or more** get free standard delivery in Lagos and Ibadan. In Abuja and Port Harcourt free delivery starts at **₦75,000**. The threshold is counted after discounts and before the delivery fee.

## Large-item surcharge
Fridges, freezers, washing machines, mattresses and furniture add a **₦5,000 handling surcharge** per order, even when standard delivery is free.

## Fees we never charge
Riders must not ask for extra money at your door. If a rider asks for a "fuel" or "gate" fee, do not pay it and tell us in chat.`,
  },
  {
    slug: "tracking-your-order",
    title: "Tracking your order",
    category: "delivery",
    body: `Every order has an order number that looks like **OJX-204813**. You'll find it in your confirmation email and on the My orders page.

## What each status means
- **Processing**: we are packing your items. You can still ask us to change the address.
- **Shipped**: the parcel has left our warehouse for your city.
- **Out for delivery**: a rider has it today and will call you before arriving.
- **Delivered**: the rider marked it as handed over.
- **Cancelled** or **Returned**: the order is closed; any refund follows our refund timelines.

## Asking the assistant
Signed in, you can ask "where is my order OJX-204813?" in chat. The assistant can only see **your own** orders. If you don't know the number, ask for your recent orders.`,
  },
  {
    slug: "missed-delivery-and-rescheduling",
    title: "Missed a delivery? Rescheduling",
    category: "delivery",
    body: `Riders call the phone number on your order before they arrive. If they can't reach you, they try again the next business day.

## How many attempts
We make **two delivery attempts**. After the second missed attempt the parcel returns to our warehouse and the order is cancelled. Card payments are refunded in full minus the delivery fee.

## Rescheduling
To pick another day, message us before the parcel is out for delivery. We can hold a parcel at the city hub for up to **5 days**.

## Someone else receiving it
Anyone at the address can receive the parcel if they can tell the rider the order number. For pay on delivery orders, they will need to pay the amount due.`,
  },
  {
    slug: "weekend-and-public-holiday-delivery",
    title: "Weekend and public holiday delivery",
    category: "delivery",
    body: `We deliver Monday to Saturday from 8am to 7pm.

## Sundays
There is no delivery on Sundays. Orders confirmed on Saturday after 2pm or on Sunday are processed on Monday.

## Public holidays
We don't deliver on national public holidays such as New Year's Day, Eid, Independence Day (1 October) or Christmas. Estimated delivery dates on your order already skip these days.

## Festive season
In the two weeks before Christmas and before Eid, deliveries in Lagos may take one extra business day because of traffic and volume.`,
  },
  {
    slug: "delayed-orders",
    title: "My order is late",
    category: "delivery",
    body: `Most orders arrive by the estimated delivery date shown on your order page. Sometimes traffic, weather or a stock problem causes a delay.

## What to do
1. Check the status on My orders or ask the assistant with your order number.
2. If the order is **more than 2 business days past** its estimated delivery date, ask to speak to a person and we will chase the courier.

## Compensation for late orders
If a delivery is more than 3 business days late and the delay was our fault, an agent can refund the delivery fee. Agents decide this case by case; the assistant cannot promise it.

## Cancelling a late order
You can ask an agent to cancel an order that hasn't been shipped yet. Once it is shipped, refuse it at the door or return it after delivery instead.`,
  },
  {
    slug: "changing-delivery-address",
    title: "Changing your delivery address",
    category: "delivery",
    body: `You can change the delivery address while the order status is **Processing**.

## How to change it
Talk to a person in chat and give them your order number and the new address. For your security, address changes are made only by an agent, not by the assistant.

## After shipping
Once an order is **Shipped**, the address can only be changed within the same city. Moving an order to another city means cancelling it and placing a new one.

## Wrong address entered
If you entered the wrong address and the order has already been delivered there, contact us immediately so an agent can help.`,
  },

  // ───────────────────────── returns ─────────────────────────
  {
    slug: "returns-policy",
    title: "Returns policy",
    category: "returns",
    body: `You can return most items within **7 days of delivery** for a refund or exchange.

## What can be returned
- Items in their original condition and packaging, with all accessories.
- Electronics that are unopened, or that are faulty on arrival.
- Home goods that are unused.

## What can't be returned
Groceries, opened personal-care items, underwear and swimwear can't be returned unless they arrived damaged, wrong or expired. See "Items that can't be returned".

## Faulty after 7 days
If an electronic item develops a fault after 7 days, it is covered by the warranty instead. See "Product warranty".`,
  },
  {
    slug: "how-to-return-an-item",
    title: "How to return an item",
    category: "returns",
    body: `Returns are free when the item is damaged, faulty or wrong. For change-of-mind returns we deduct the original delivery fee from your refund.

## Steps
1. Start a chat and ask to speak to a person about a return. Have your order number ready.
2. The agent confirms the item is eligible and books a pickup.
3. Pack the item in its original packaging. Our rider collects it within 3 business days in Lagos and 5 business days elsewhere.
4. When the item reaches our warehouse we inspect it within 2 business days and start the refund.

## Drop-off
You can also drop items at our hubs: Ikeja (Lagos), Wuse 2 (Abuja), Trans-Amadi (Port Harcourt) and Ring Road (Ibadan).`,
  },
  {
    slug: "refund-timelines",
    title: "Refund timelines",
    category: "returns",
    body: `We start your refund as soon as the returned item passes inspection, or immediately when an order is cancelled before shipping.

## Card payments
Refunds go back to the same card. Banks usually take **5–10 business days** to show the money.

## Pay on delivery orders
We refund by bank transfer to an account in your name within **3–5 business days**. An agent will ask for the account details over chat; we never ask for your card PIN, OTP or internet-banking password.

## Partial refunds
If you return some items from an order, only those items are refunded. A free-delivery order may lose its free delivery if the remaining total drops below the threshold.

## Refund still missing?
If it's been longer than the timeline above, ask to speak to a person and share your order number.`,
  },
  {
    slug: "damaged-or-wrong-item",
    title: "Damaged, faulty or wrong item received",
    category: "returns",
    body: `We're sorry when this happens. Please report it within **48 hours of delivery**.

## What to send
- Your order number.
- Photos of the item and the packaging, including any dents or broken seals.
- For a wrong item, a photo of the label on the box.

Our chat can't receive attachments yet, so an agent will give you an email address for the photos.

## What we do
An agent arranges a free pickup and either a replacement or a full refund including the delivery fee. For large appliances, a technician may visit first to confirm the damage.

## Refusing at the door
If the box is visibly damaged when the rider arrives, you can refuse it. Pay on delivery orders are not charged; card payments are refunded in full.`,
  },
  {
    slug: "non-returnable-items",
    title: "Items that can't be returned",
    category: "returns",
    body: `For hygiene and safety reasons some items can only be returned if they arrive damaged, wrong or expired.

## Not returnable for change of mind
- Groceries and drinks
- Opened personal-care and beauty products
- Underwear, swimwear and socks
- Mattresses and pillows once the plastic is removed
- Gift cards and airtime vouchers

## Groceries problems
If groceries arrive expired, leaking or damaged, tell us within **24 hours** of delivery and we'll refund or replace them.`,
  },
  {
    slug: "exchanges",
    title: "Exchanging an item for another size or colour",
    category: "returns",
    body: `You can exchange an item for a different size or colour within 7 days of delivery, if the item is unused and in its packaging.

## How exchanges work
Ask a person in chat for an exchange. We send the new item and collect the old one in the same trip in Lagos and Ibadan. In Abuja and Port Harcourt we collect first and send the new item once the original reaches our hub.

## Price differences
If the new item costs more you pay the difference; if it costs less we refund the difference using the refund timelines.`,
  },

  // ───────────────────────── payments ─────────────────────────
  {
    slug: "pay-on-delivery-rules",
    title: "Pay on delivery: how it works",
    category: "payments",
    body: `Pay on delivery lets you pay the rider when your order arrives.

## Limits
- Available for orders up to **₦150,000** in all four cities.
- Not available for large appliances or for orders with a gift card.

## How to pay the rider
You can pay by cash, by bank transfer to the **Ọjà Express account shown on the rider's receipt**, or by card on the rider's POS. Never transfer to a rider's personal account.

## Check before paying
You may open the package in front of the rider to check the item before paying. If anything is wrong, you can refuse the delivery.

## Refused deliveries
If two pay on delivery orders are refused without a reason, pay on delivery is switched off for the account and you'll need to pay by card.`,
  },
  {
    slug: "card-payment-failed",
    title: "My card payment failed",
    category: "payments",
    body: `A card payment can fail because of a wrong OTP, insufficient funds, a daily limit, or a bank network problem.

## Debited but the order failed
If money left your account but the order shows as failed or doesn't appear, don't pay again straight away. Failed payments are **reversed automatically by your bank within 24–72 hours**.

## Still not reversed after 72 hours
Ask to speak to a person and share the date, amount and the last four digits of the card. Never share the full card number, PIN or OTP.

## Tips
- Use 3-D Secure cards (most Nigerian debit cards are).
- Try another card, or choose pay on delivery if your order qualifies.`,
  },
  {
    slug: "charged-twice",
    title: "I was charged twice",
    category: "payments",
    body: `Sometimes a bank shows two debits for one order: usually one is a pending authorisation that disappears on its own.

## Wait for it to settle
Pending duplicate debits are **reversed by the bank within 72 hours**. Check your statement after that time.

## If both charges completed
If you placed one order but two charges completed, an agent will confirm with our payment provider and refund the duplicate to your card within 5–10 business days. Ask to speak to a person and share the date and amount.

## Disputes with your bank
You don't need to open a chargeback with your bank; it usually takes longer than our refund. If you already opened one, tell the agent so we don't refund twice.`,
  },
  {
    slug: "payment-methods",
    title: "Ways to pay",
    category: "payments",
    body: `We accept:

- **Debit and credit cards**: Verve, Visa and Mastercard issued in Nigeria.
- **Pay on delivery**: cash, bank transfer or card on the rider's POS, for orders up to ₦150,000.
- **Gift cards** from Ọjà Express.

## Not accepted
We don't accept cryptocurrency, cheques, or payment to any personal bank account. Our staff will never ask you to pay into a personal account.

## Instalments
We don't offer instalment plans at the moment.`,
  },
  {
    slug: "promo-codes-and-vouchers",
    title: "Promo codes and vouchers",
    category: "payments",
    body: `Enter a promo code at checkout before you pay.

## Rules
- One promo code per order.
- Codes have an expiry date and a minimum order value, shown in the offer.
- Codes don't apply to delivery fees unless the offer says so.

## Code not working
Check the expiry date, the minimum order value and that the items are included in the offer. Codes can't be added after an order is paid.

## Gift cards
Gift cards can be combined with a promo code and never expire.`,
  },
  {
    slug: "receipts-and-invoices",
    title: "Receipts and invoices",
    category: "payments",
    body: `A receipt is emailed when your order is confirmed and again when it is delivered.

## Business invoices
If you need an invoice with your company name for reimbursement, ask an agent in chat with your order number and the company details. Invoices are issued within 2 business days.

## Pay on delivery receipts
The rider gives you a printed or SMS receipt after payment. Keep it until the item's return window has passed.`,
  },

  // ───────────────────────── account ─────────────────────────
  {
    slug: "reset-your-password",
    title: "Resetting your password",
    category: "account",
    body: `If you've forgotten your password, use **Forgot password** on the sign-in page and we'll email you a reset link that works for 30 minutes.

## Email not arriving
- Check your spam or promotions folder.
- Make sure you used the email address on your account.
- Wait 5 minutes before requesting another link: each new link cancels the old one.

## Still stuck
Ask to speak to a person. For your security an agent will never ask for your password, and can't see it.`,
  },
  {
    slug: "update-account-details",
    title: "Updating your name, phone or email",
    category: "account",
    body: `You can change your name and phone number in Account settings.

## Changing your email address
Email changes need confirmation from both the old and the new address. If you can no longer access the old email, ask a person in chat; they will verify your identity using recent order details.

## Phone number
Riders call the phone number on each order. Changing your account phone doesn't change it on orders already placed; ask an agent to update an open order.`,
  },
  {
    slug: "close-your-account",
    title: "Closing your account",
    category: "account",
    body: `You can ask us to close your account at any time.

## Before you close it
Make sure there are no open orders, returns or refunds in progress. Closing the account doesn't cancel them, but you won't be able to track them online.

## How
Ask to speak to a person in chat. They confirm your identity and close the account within 5 business days. Order records are kept for 6 years because Nigerian tax law requires it.`,
  },
  {
    slug: "account-security-and-scams",
    title: "Staying safe: scams and account security",
    category: "account",
    body: `Ọjà Express staff will **never** ask for your card PIN, OTP, BVN, password or internet-banking login, and will never ask you to pay into a personal account.

## Common scams
- Messages offering "refund processing" in exchange for an OTP.
- Fake riders asking for an extra "gate fee".
- WhatsApp accounts using our logo to sell "clearance" items.

## If you think you've been scammed
Talk to a person in chat straight away, and contact your bank to block your card. Report fraud to your bank and, if money was stolen, to the police.

## Protecting your account
Use a unique password and sign out on shared phones.`,
  },

  // ───────────────────────── products ─────────────────────────
  {
    slug: "product-warranty",
    title: "Product warranty",
    category: "products",
    body: `Most electronics and appliances come with a **manufacturer's warranty**, usually 6 to 12 months. The length is shown on the product page and on the warranty card in the box.

## Dead on arrival
If an electronic item doesn't work when you first use it, report it within **7 days of delivery** and we'll replace it or refund you. That's our own promise, on top of the manufacturer's warranty.

## Faults after 7 days
For faults after the first 7 days, the manufacturer's service centre handles the repair. An agent can tell you the nearest centre in Lagos, Abuja, Port Harcourt or Ibadan.

## What warranty doesn't cover
Damage from power surges, water, drops or unauthorised repairs. We recommend a surge protector or stabiliser for fridges, TVs and computers.`,
  },
  {
    slug: "faulty-electronics",
    title: "My device isn't working",
    category: "products",
    body: `Before reporting a fault, try these steps.

## Phones and tablets
Charge for at least 30 minutes with the original charger, then hold the power button for 15 seconds.

## TVs and sound systems
Check the power source with another appliance. Many TVs need a firmware update on first use.

## Fridges and freezers
Wait **4 hours** after delivery before switching a fridge on, so the coolant settles. It can take up to 24 hours to reach full cooling.

## Still faulty
If it still doesn't work, see "Product warranty" for what happens next, or ask to speak to a person.`,
  },
  {
    slug: "groceries-freshness",
    title: "Groceries: freshness and expiry dates",
    category: "products",
    body: `We pick groceries on the day of dispatch and check expiry dates.

## Minimum shelf life
Packaged groceries arrive with at least **30 days** before their expiry date, and dairy with at least 5 days.

## Fresh produce
Fresh fruit and vegetables are delivered in Lagos only, the next morning.

## Problems
If anything is expired, leaking or damaged, report it within 24 hours with your order number and we'll refund or replace it.`,
  },
  {
    slug: "home-goods-assembly",
    title: "Furniture and home goods: assembly",
    category: "products",
    body: `Furniture arrives flat-packed with instructions and all fittings.

## Free assembly
Free assembly is available in **Lagos and Abuja** for beds, wardrobes and dining sets. Ask an agent to book it after delivery; a technician visits within 3 business days.

## Missing parts
If a part is missing, tell us within 7 days and we'll send it at no cost.

## Rugs, curtains and bedding
These are returnable within 7 days if unused and in their packaging.`,
  },
];
