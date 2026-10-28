// A deliberately small Markdown subset for help articles: ## / ### headings,
// paragraphs, "-" and "1." lists, **bold**, and [links](/help/...). Parsed
// into plain data (never HTML strings), so rendering can't inject markup.
// Shared by the chunker (server) and the admin preview (browser).

export type Inline = { kind: "text" | "bold"; text: string } | { kind: "link"; text: string; href: string };
export type Block =
  | { kind: "heading"; level: 2 | 3; text: string; id: string }
  | { kind: "paragraph"; inlines: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] };

export const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: "bold", text: m[1] });
    else {
      const href = m[3] ?? "";
      // Only same-site paths and https links; "javascript:" etc. become text.
      if (/^(\/[\w\-/#?=&.]*|https:\/\/[^\s]+)$/.test(href)) out.push({ kind: "link", text: m[2] ?? href, href });
      else out.push({ kind: "text", text: m[2] ?? "" });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;
  const flush = () => {
    if (para.length) blocks.push({ kind: "paragraph", inlines: parseInline(para.join(" ")) });
    para = [];
    if (list) blocks.push({ kind: "list", ...list });
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    const heading = /^(#{2,3})\s+(.+)$/.exec(line);
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (!line) flush();
    else if (heading) {
      flush();
      const text = heading[2] ?? "";
      blocks.push({ kind: "heading", level: heading[1] === "##" ? 2 : 3, text, id: slugify(text) });
    } else if (bullet || numbered) {
      if (para.length) {
        blocks.push({ kind: "paragraph", inlines: parseInline(para.join(" ")) });
        para = [];
      }
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) {
        if (list) blocks.push({ kind: "list", ...list });
        list = { ordered, items: [] };
      }
      list.items.push(parseInline((bullet?.[1] ?? numbered?.[1]) || ""));
    } else {
      if (list) {
        blocks.push({ kind: "list", ...list });
        list = null;
      }
      para.push(line);
    }
  }
  flush();
  return blocks;
}

export const inlineText = (inlines: Inline[]) => inlines.map((i) => i.text).join("");

export function blockText(b: Block): string {
  if (b.kind === "heading") return b.text;
  if (b.kind === "paragraph") return inlineText(b.inlines);
  return b.items.map((it, i) => `${b.ordered ? `${i + 1}.` : "-"} ${inlineText(it)}`).join("\n");
}
