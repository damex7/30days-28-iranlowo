import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { DemoButtons } from "@/components/demo-buttons";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/validation/knowledge";

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="grid grid-cols-1 items-center gap-6 md:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="font-semibold text-iroko">Ọjà Express customer support</p>
          <h1 className="mt-1 text-4xl sm:text-5xl">Ẹ ku àbọ̀. How can we help today?</h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            Ask about delivery to Lagos, Abuja, Port Harcourt or Ibadan, returns, payments, or where your order is. Our assistant answers from our own help articles and shows its sources. A person is always one tap away.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/support" className="btn btn-primary">Start a chat</Link>
            <Link href="/help" className="btn btn-secondary">Browse the help centre</Link>
          </div>
        </div>
        <div className="card relative p-6 text-iroko" aria-hidden="true">
          <LogoMark className="h-16 w-16" />
          <div className="mt-4 space-y-3 text-[0.95rem]">
            <p className="ml-auto w-fit max-w-[85%] rounded-[var(--radius-bubble)] rounded-br-sm bg-bubble-customer px-3 py-2 text-on-bubble-customer">Where is my order OJX-204812?</p>
            <div className="max-w-[90%] rounded-[var(--radius-bubble)] rounded-bl-sm border-2 border-muted bg-card px-3 py-2 text-ink">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Assistant</p>
              <p>It shipped yesterday and should reach you in Lagos tomorrow. A rider will call before arriving.</p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="topics">
        <h2 id="topics" className="text-2xl">Popular topics</h2>
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {CATEGORIES.map((c) => (
            <li key={c}>
              <Link href={`/help?category=${c}`} className="card block h-full p-4 font-semibold no-underline hover:border-iroko">
                {CATEGORY_LABELS[c]}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="card grid grid-cols-1 gap-5 p-5 md:grid-cols-2" aria-labelledby="demo">
        <div>
          <h2 id="demo" className="text-2xl">Try the demo</h2>
          <p className="mt-2 text-muted">
            Chat as a customer with your own sample orders, or look around the agent inbox. No password needed; demo data is deleted after a day. The banner at the top says which AI is answering.
          </p>
        </div>
        <DemoButtons />
      </section>

      <section className="card p-5" aria-labelledby="how">
        <h2 id="how" className="text-2xl">How our assistant works</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
          <li>It only answers from published help articles, and links to them.</li>
          <li>Signed in, it can look up <strong>your own</strong> orders, and nobody else&rsquo;s.</li>
          <li>It can&rsquo;t issue refunds or change orders. A person does that.</li>
          <li>If it isn&rsquo;t sure, or you&rsquo;re upset, or you ask, it hands you to a person with a summary so you don&rsquo;t repeat yourself.</li>
        </ul>
      </section>
    </div>
  );
}
