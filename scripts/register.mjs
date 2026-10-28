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
    // Next's subpath entry points (next/headers, next/cache…) are CommonJS
    // files without an exports map, so ESM needs the explicit ".js".
    if (/^next\/[a-z-]+$/.test(specifier)) return next(`${specifier}.js`, context);
    // React's server build is CommonJS whose named exports (cache) Node can't
    // detect from ESM; our own files get a tiny re-exporting shim instead.
    const shim = pathToFileURL(join(root, "scripts", "react-shim.mjs")).href;
    if (specifier === "react" && context.parentURL !== shim && !context.parentURL?.includes("node_modules")) {
      return next(shim, context);
    }
    let base = null;
    if (specifier.startsWith("@/")) base = join(root, specifier.slice(2));
    else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:") && !context.parentURL.includes("node_modules")) {
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
