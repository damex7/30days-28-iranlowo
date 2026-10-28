// Lets plain Node run our TypeScript scripts against the real app modules:
// Node strips the types itself; this hook resolves the "@/..." alias and
// extensionless imports the way the Next.js bundler does.
// Used with: node --conditions=react-server --import ./scripts/register.mjs <script.mts>
// (react-server makes "server-only" resolve to its empty server build.)

import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function candidates(base) {
  return [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, join(base, "index.ts")];
}

registerHooks({
  resolve(specifier, context, next) {
    let base = null;
    if (specifier.startsWith("@/")) base = join(root, specifier.slice(2));
    else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
      base = join(dirname(fileURLToPath(context.parentURL)), specifier);
    }
    if (base) {
      for (const file of candidates(base)) {
        if (existsSync(file) && !file.endsWith("\\") && /\.\w+$/.test(file)) {
          return next(pathToFileURL(file).href, context);
        }
      }
    }
    return next(specifier, context);
  },
});
