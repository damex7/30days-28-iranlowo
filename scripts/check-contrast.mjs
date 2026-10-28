// Reads the colour tokens from app/globals.css and checks WCAG contrast for
// the pairs the UI actually uses, in light and dark mode.
//   npm run check:contrast
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
function block(selector) {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}
const themes = { light: block(":root {"), dark: block(':root[data-theme="dark"]') };

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

// [foreground, background, minimum]: 4.5 for text, 3 for UI boundaries.
const pairs = [
  ["ink", "paper", 4.5], ["ink", "card", 4.5], ["muted", "paper", 4.5], ["muted", "card", 4.5],
  ["iroko", "paper", 4.5], ["iroko", "card", 4.5], ["on-iroko", "iroko", 4.5], ["on-iroko", "iroko-hover", 4.5],
  ["iroko", "iroko-soft", 4.5], ["ink", "iroko-soft", 4.5],
  ["on-bubble-customer", "bubble-customer", 4.5],
  ["warn", "warn-soft", 4.5], ["warn", "card", 4.5], ["danger", "danger-soft", 4.5], ["danger", "card", 4.5],
  ["line-strong", "card", 3], ["line-strong", "paper", 3], ["focus", "paper", 3], ["focus", "card", 3], ["muted", "iroko-soft", 4.5],
];

let failed = 0;
for (const [name, t] of Object.entries(themes)) {
  for (const [fg, bg, min] of pairs) {
    const r = ratio(t[fg], t[bg]);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(`${ok ? "pass" : "FAIL"}  ${name.padEnd(5)} ${fg.padEnd(20)} on ${bg.padEnd(16)} ${r.toFixed(2)} (needs ${min})`);
  }
}
console.log(failed ? `\n${failed} pair(s) fail.` : "\nAll pairs pass.");
process.exitCode = failed ? 1 : 0;
