#!/usr/bin/env node
/**
 * A hardcoded vault host in source is a fail. Tests may use example.test.
 *
 * This is a LOCAL-ONLY unit (RuleGpcunitHostAgnostic, local-only item 5): it is a process on the person's own computer that
 * must accept connections only from that computer. The loopback binding is its security property, so the host app cannot
 * pass it in. The allow list below is therefore the only exception: exactly these two literals, nothing else.
 * Each is blanked out of a line before the FORBIDDEN list is applied, so a line that also names a refused host still fails.
 *
 * Scans src/ and bridge/ (the built files a person actually runs), .ts .tsx .js .mjs .mts, tests excepted.
 * Usage: node scripts/check-host-agnostic.mjs [rootDir]   (rootDir defaults to this unit)
 * Exit 0 = PASS, 1 = FAIL, 2 = could not read.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
const SCANNED = ["src", "bridge"];
const ALLOWED_LITERALS = ["127.0.0.1", "localhost"];
const FORBIDDEN = [/gilb\.com/i, /veda\./i, /localhost/i, /127\.0\.0\.1/, /w3id\.org/i];

const roots = SCANNED.map((d) => join(root, d));
if (!existsSync(roots[0]) || !existsSync(roots[1])) {
  console.error(`Host-agnostic check ERROR — need src/ and bridge/ under ${root}`);
  process.exit(2);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
const stripAllowed = (line) => ALLOWED_LITERALS.reduce((l, lit) => l.split(lit).join(" "), line);

const files = roots.flatMap(walk).filter((f) => /\.(ts|tsx|js|mjs|mts)$/.test(f) && !/\.test\.(ts|tsx|js|mjs)$/.test(f));
if (files.length === 0) {
  console.error(`Host-agnostic check ERROR — no source files under ${root}`);
  process.exit(2);
}
const hits = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = stripAllowed(lines[i]);
    for (const re of FORBIDDEN) {
      if (re.test(line)) hits.push(`${relative(root, file)}:${i + 1}: ${lines[i].trim()}`);
    }
  }
}
if (hits.length) {
  console.error("Host-agnostic check FAIL");
  for (const h of hits) console.error("  " + h);
  process.exit(1);
}
console.log(`Host-agnostic check PASS — claude-code-bridge (${files.length} file(s); allowed literals: ${ALLOWED_LITERALS.join(", ")})`);
