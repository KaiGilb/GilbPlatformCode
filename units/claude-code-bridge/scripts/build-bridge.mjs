#!/usr/bin/env node
/**
 * Builds bridge/bridge.mjs and bridge/vite-plugin.mjs from src/bridge.ts and src/vitePlugin.ts.
 * Type annotations are removed and nothing else is changed (ts.transpileModule, ES2022, comments kept).
 * The output is committed, because a person takes the file as it is. A test fails if the committed files differ from a fresh build.
 *   node scripts/build-bridge.mjs           writes the two files
 *   import { buildAll } from "./build-bridge.mjs"   returns { "bridge.mjs": text, "vite-plugin.mjs": text } without writing
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const TARGETS = [
  { from: "src/bridge.ts", to: "bridge/bridge.mjs" },
  // The plugin imports the bridge by its source name; in the built folder that file is bridge.mjs.
  { from: "src/vitePlugin.ts", to: "bridge/vite-plugin.mjs", swap: ['from "./bridge.js"', 'from "./bridge.mjs"'] },
];

export function buildAll() {
  const out = {};
  for (const t of TARGETS) {
    const text = readFileSync(join(root, t.from), "utf8");
    let js = ts.transpileModule(text, {
      fileName: t.from,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, removeComments: false },
    }).outputText;
    if (t.swap) {
      if (js.split(t.swap[0]).length !== 2) throw new Error(`${t.from}: expected ${t.swap[0]} exactly once`);
      js = js.replace(t.swap[0], t.swap[1]);
    }
    out[t.to] = js;
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [to, js] of Object.entries(buildAll())) {
    mkdirSync(dirname(join(root, to)), { recursive: true });
    writeFileSync(join(root, to), js);
    console.log(`built ${to}`);
  }
}
