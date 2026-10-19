#!/usr/bin/env node
/**
 * Builds lib/*.mjs, the plain JavaScript Nitro and Node can load from a packed copy, from src/*.ts.
 * Why: Nitro does not compile TypeScript inside node_modules, so the package's "default" export points here.
 * `--check` writes nothing and exits 1 when a committed lib/ file is not what src/ would give (a test runs it).
 * Usage: node scripts/build-lib.mjs [--check]
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const unit = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const FILES = ["entryAfterPaint", "index"];
let stale = 0;
for (const name of FILES) {
  const src = readFileSync(join(unit, "src", `${name}.ts`), "utf8");
  let out = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, removeComments: false },
  }).outputText.replace(/from "\.\/entryAfterPaint"/g, 'from "./entryAfterPaint.mjs"');
  out = `// GENERATED from src/${name}.ts by scripts/build-lib.mjs. Do not edit.\n${out}`;
  const dest = join(unit, "lib", `${name}.mjs`);
  if (check) {
    if (!existsSync(dest) || readFileSync(dest, "utf8") !== out) { console.error(`STALE ${dest}`); stale = 1; }
  } else {
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, out);
  }
}
process.exit(stale);
