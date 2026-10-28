/**
 * A Node resolve hook that lets plain `node` run this repo's TypeScript units from scripts.
 *
 * Ported from the Social app's scripts/ops/ts-resolve.mjs. Scripts under scripts/ import the units' TypeScript source
 * (for example units/signin/src/machine.ts). That source uses relative imports without an extension ("./dpop"), which
 * Node's own resolver refuses. This hook retries such an import with ".ts", ".tsx" and "/index.ts". It changes no file.
 *
 * Usage (from the repo root; --experimental-transform-types because units/signin uses constructor parameter properties):
 *   node --experimental-transform-types --no-warnings --import ./scripts/lib/ts-resolve.mjs scripts/<dir>/<tool>.mjs …
 */
import { register } from "node:module";

register("data:text/javascript," + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); }
  catch (e) {
    // Only a relative import with no extension is retried; a package name or a full path fails as Node says.
    if ((spec.startsWith("./") || spec.startsWith("../")) && !/\\.[cm]?[jt]sx?$/.test(spec)) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) { try { return await next(spec + ext, ctx); } catch {} }
    }
    throw e;
  }
}`));
