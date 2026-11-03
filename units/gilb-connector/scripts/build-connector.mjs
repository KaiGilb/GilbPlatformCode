#!/usr/bin/env node
/**
 * Builds connector/gilb-connector.mjs from src/connector.ts.
 * Type annotations are removed and nothing else is changed (ts.transpileModule, ES2022, comments kept).
 * The output is committed, because a person runs the file as it is. A test fails if the committed file differs from a fresh build.
 *   node scripts/build-connector.mjs
 *   import { buildAll } from "./build-connector.mjs"   returns { "connector/gilb-connector.mjs": text } without writing
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "connector/gilb-connector.mjs";

export function buildAll() {
  const from = "src/connector.ts";
  const text = readFileSync(join(root, from), "utf8");
  const js = ts.transpileModule(text, {
    fileName: from,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, removeComments: false },
  }).outputText;
  return { [TARGET]: js };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, js] = Object.entries(buildAll())[0];
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), js);
  console.log(`built ${file}`);
}
