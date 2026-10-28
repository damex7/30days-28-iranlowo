import Link from "next/link";

export default function NotFound() {
  return (
    <section className="card mx-auto max-w-xl p-6" aria-labelledby="nf-title">
      <h1 id="nf-title" className="text-3xl">We can&rsquo;t find that page</h1>
      <p className="mt-3 text-muted">It may have moved, or it isn&rsquo;t available to your account.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link className="btn btn-primary" href="/help">Search the help centre</Link>
        <Link className="btn btn-secondary" href="/support">Chat with us</Link>
      </div>
    </section>
  );
}
