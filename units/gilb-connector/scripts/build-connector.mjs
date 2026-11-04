#!/usr/bin/env node
/**
 * Builds connector/gilb-connector.mjs and connector/vite-plugin.mjs from src/connector.ts and src/vitePlugin.ts.
 * Type annotations are removed and nothing else is changed (ts.transpileModule, ES2022, comments kept).
 * The plugin imports nothing from the connector, so no import path is rewritten.
 * The output is committed, because a person takes the files as they are. A test fails if the committed files differ from a fresh build.
 *   node scripts/build-connector.mjs           writes the two files
 *   import { buildAll } from "./build-connector.mjs"   returns { "connector/gilb-connector.mjs": text, "connector/vite-plugin.mjs": text } without writing
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const TARGETS = [
  { from: "src/connector.ts", to: "connector/gilb-connector.mjs" },
  { from: "src/vitePlugin.ts", to: "connector/vite-plugin.mjs" },
];

export function buildAll() {
  const out = {};
  for (const t of TARGETS) {
    const text = readFileSync(join(root, t.from), "utf8");
    const js = ts.transpileModule(text, {
      fileName: t.from,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, removeComments: false },
    }).outputText;
    out[t.to] = js;
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [file, js] of Object.entries(buildAll())) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), js);
    console.log(`built ${file}`);
  }
}
