import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { helpCentrePage, helpCategories } from "@/lib/services/help-centre";
import { CATEGORIES, CATEGORY_LABELS, helpSearchSchema, type HelpSearch } from "@/lib/validation/knowledge";

export const metadata: Metadata = { title: "Help centre" };

function hrefWith(params: HelpSearch, change: Partial<HelpSearch>): string {
  const merged = { ...params, ...change };
  const sp = new URLSearchParams();
  if (merged.q) sp.set("q", merged.q);
  if (merged.category) sp.set("category", merged.category);
  if (merged.after) sp.set("after", merged.after);
  const s = sp.toString();
  return s ? `/help?${s}` : "/help";
}

/** ts_headline marks matches with << >>; we turn them into <mark> without any HTML strings. */
function Snippet({ text }: { text: string }) {
  return (
    <>
      {text.split(/(<<[^>]*>>)/).map((part, i) =>
        part.startsWith("<<") ? <mark key={i} className="rounded bg-iroko-soft px-0.5 text-ink">{part.slice(2, -2)}</mark> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

export default function HelpPage({ searchParams }: PageProps<"/help">) {
  return (
    <div>
      <h1 className="text-4xl">How can we help?</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Answers about delivery, returns, payments and your account. Can&rsquo;t find it? <Link href="/support">Chat with us</Link>: the assistant reads these same articles, and a person is a tap away.
      </p>
      <Suspense fallback={<HelpSkeleton />}>
        <HelpResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function HelpSkeleton() {
  return (
    <div className="mt-6 space-y-3" aria-hidden="true">
      <div className="skeleton h-12" />
      <div className="skeleton h-8 w-2/3" />
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className="skeleton h-20" />
      ))}
    </div>
  );
}

async function HelpResults({ searchParams }: { searchParams: PageProps<"/help">["searchParams"] }) {
  const params = helpSearchSchema.parse(await searchParams);
  const [page, counts] = await Promise.all([helpCentrePage(null, params), helpCategories()]);
  const total = counts.reduce((s, c) => s + c.count, 0);
  const count = page.mode === "search" ? page.hits.length : page.articles.length;
  const announcement =
    page.mode === "search"
      ? count === 0
        ? `No results for “${params.q}”.`
        : `${count}${page.next ? "+" : ""} result${count === 1 ? "" : "s"} for “${params.q}”${params.category ? ` in ${CATEGORY_LABELS[params.category]}` : ""}.`
      : `${count} article${count === 1 ? "" : "s"}${params.category ? ` in ${CATEGORY_LABELS[params.category]}` : ""}.`;

  return (
    <>
      {/* A plain GET form: the search lives in the URL, so results can be shared and the back button works. */}
      <form role="search" action="/help" className="mt-6 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="q" className="sr-only">Search help articles</label>
        <input id="q" name="q" type="search" defaultValue={params.q} placeholder="e.g. refund to card, delivery fee Ibadan" className="field flex-1" maxLength={200} />
        {params.category && <input type="hidden" name="category" value={params.category} />}
        <button className="btn btn-primary" type="submit">Search</button>
      </form>

      <nav aria-label="Categories" className="mt-4 flex flex-wrap gap-2">
        <Link href={hrefWith(params, { category: undefined, after: undefined })} aria-current={!params.category ? "page" : undefined} className={`btn min-h-10 text-sm ${!params.category ? "btn-primary" : "btn-secondary"}`}>
          All <span className="tabular">({total})</span>
        </Link>
        {CATEGORIES.map((c) => {
          const n = counts.find((x) => x.category === c)?.count ?? 0;
          const active = params.category === c;
          return (
            <Link key={c} href={hrefWith(params, { category: c, after: undefined })} aria-current={active ? "page" : undefined} className={`btn min-h-10 text-sm ${active ? "btn-primary" : "btn-secondary"}`}>
              {CATEGORY_LABELS[c]} <span className="tabular">({n})</span>
            </Link>
          );
        })}
      </nav>

      <p role="status" aria-live="polite" className="mt-5 font-semibold">
        {announcement}
      </p>

      {page.mode === "search" ? (
        page.hits.length === 0 ? (
          <div className="card mt-3 p-5">
            <p>Nothing in the help centre matches that. Try fewer words, or <Link href="/support">ask us in chat</Link> and a person can help.</p>
          </div>
        ) : (
          <ol className="mt-3 space-y-3">
            {page.hits.map((h) => (
              <li key={h.chunkId} className="card p-4">
                <h2 className="text-lg">
                  <Link href={`/help/${h.slug}${h.anchor ? `#${h.anchor}` : ""}`}>
                    {h.title}
                    {h.anchor && <span className="font-sans text-base font-normal text-muted"> › {h.heading}</span>}
                  </Link>
                </h2>
                <p className="mt-1 text-muted"><Snippet text={h.snippet} /></p>
                <p className="mt-1 text-xs text-muted">{CATEGORY_LABELS[h.category]}</p>
              </li>
            ))}
          </ol>
        )
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {page.articles.map((a) => (
            <li key={a.id} className="card p-4">
              <h2 className="text-lg"><Link href={`/help/${a.slug}`}>{a.title}</Link></h2>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{a.excerpt}</p>
              <p className="mt-1 text-xs text-muted">{CATEGORY_LABELS[a.category]}</p>
            </li>
          ))}
        </ul>
      )}

      <nav aria-label="Pages" className="mt-6 flex flex-wrap gap-3">
        {!page.isFirstPage && <Link className="btn btn-secondary" href={hrefWith(params, { after: undefined })}>First page</Link>}
        {page.next && <Link className="btn btn-secondary" href={hrefWith(params, { after: page.next })}>Next page</Link>}
      </nav>
    </>
  );
}
