// Scripts only: React's server build is CommonJS, and Node can't see its
// named exports (cache, ...) from ESM. Re-export them explicitly.
import { createRequire } from "node:module";
const React = createRequire(import.meta.url)("react");
export default React;
export const { cache } = React;
