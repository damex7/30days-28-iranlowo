import Link from "next/link";
import { parseMarkdown, type Inline } from "@/lib/markdown";

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((i, n) =>
        i.kind === "bold" ? (
          <strong key={n}>{i.text}</strong>
        ) : i.kind === "link" ? (
          i.href.startsWith("/") ? (
            <Link key={n} href={i.href}>{i.text}</Link>
          ) : (
            <a key={n} href={i.href} rel="noopener noreferrer">{i.text}</a>
          )
        ) : (
          <span key={n}>{i.text}</span>
        ),
      )}
    </>
  );
}

/** Renders our Markdown subset as React elements: no HTML strings anywhere. */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="prose-help">
      {parseMarkdown(source).map((b, n) => {
        if (b.kind === "heading") {
          const H = b.level === 2 ? "h2" : "h3";
          return <H key={n} id={b.id} className="scroll-mt-24">{b.text}</H>;
        }
        if (b.kind === "paragraph") return <p key={n}><Inlines items={b.inlines} /></p>;
        const L = b.ordered ? "ol" : "ul";
        return (
          <L key={n}>
            {b.items.map((it, k) => (
              <li key={k}><Inlines items={it} /></li>
            ))}
          </L>
        );
      })}
    </div>
  );
}
