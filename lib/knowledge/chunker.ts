import { blockText, parseMarkdown, slugify } from "@/lib/markdown";

// CHUNKING. We split each article at its ## / ### headings, then split any
// long section at paragraph boundaries so no chunk passes ~900 characters
// (~225 tokens). Why:
//  * precision: the question "how much is delivery to Ibadan?" should pull
//    the Ibadan paragraph, not a 2,000-word delivery article where the
//    answer is diluted by everything else;
//  * budget: we send only 4 chunks to the model, so each must be small and
//    self-contained. Every chunk carries its heading for that reason.

export type Chunk = { position: number; heading: string; anchor: string; content: string; tokenEstimate: number };

const MAX_CHARS = 900;

/** ~4 characters per token for English text: good enough for budgeting. */
export const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 4));

export function chunkArticle(title: string, body: string): Chunk[] {
  const sections: { heading: string; parts: string[] }[] = [{ heading: title, parts: [] }];
  for (const block of parseMarkdown(body)) {
    if (block.kind === "heading") sections.push({ heading: block.text, parts: [] });
    else sections.at(-1)?.parts.push(blockText(block));
  }

  const chunks: Chunk[] = [];
  for (const section of sections) {
    let current = "";
    const push = () => {
      const content = current.trim();
      if (content) {
        chunks.push({ position: chunks.length, heading: section.heading, anchor: section.heading === title ? "" : slugify(section.heading), content, tokenEstimate: estimateTokens(content) });
      }
      current = "";
    };
    for (const part of section.parts) {
      if (current && current.length + part.length + 2 > MAX_CHARS) push();
      current += (current ? "\n\n" : "") + part.slice(0, 3800);
    }
    push();
  }
  return chunks;
}
