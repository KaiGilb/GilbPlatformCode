#!/usr/bin/env node
/** A hardcoded vault host in source is a fail. Tests may use example.test. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = join(root, "src");
const FORBIDDEN = [/gilb\.com/i, /veda\./i, /localhost/i, /127\.0\.0\.1/, /w3id\.org/i];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
const hits = [];
for (const file of walk(srcRoot)) {
  if (!/\.(ts|tsx|js|mjs)$/.test(file)) continue;
  if (/\.test\.(ts|tsx|js)$/.test(file)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const re of FORBIDDEN) {
      if (re.test(lines[i])) hits.push(`${relative(root, file)}:${i + 1}: ${lines[i].trim()}`);
    }
  }
}
if (hits.length) {
  console.error("Host-agnostic check FAIL");
  for (const h of hits) console.error("  " + h);
  process.exit(1);
}
console.log("Host-agnostic check PASS — fact-faithful");
