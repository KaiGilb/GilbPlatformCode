#!/usr/bin/env node
/**
 * Host-agnostic check for this unit body. Two passes.
 *
 * 1. Every source file under src/ (tests excepted), line by line, comments included: a vault host
 *    named anywhere is a fail. Injected hosts in tests use example.test.
 *    One exception: `credentialsForPage` in src/http.ts names the first-party page hosts once each,
 *    as exact quoted literals (`gilb.com`, `www.gilb.com`, `localhost`, `127.0.0.1`, `[::1]`).
 *    Those classify the page for the verify-code cookie decision; they are not a request target.
 *    Any other host text in that file, or a second copy of one of those literals, is still a fail.
 * 2. The headless entries (`core`, `session`, `machine`) and every file they reach by relative
 *    import, parsed with the TypeScript compiler: an import of anything but a sibling module
 *    (`./x`) is a fail. A package import (React included) or an import from an app would tie the
 *    headless kit to that package or app. Parsed, not matched by line, so a multi-line import, a
 *    template-literal dynamic import and the files an entry pulls in are all seen.
 *
 * Usage: node scripts/check-host-agnostic.mjs [rootDir]   (rootDir defaults to this unit)
 * Exit 0 = PASS, 1 = FAIL, 2 = could not read.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
const srcRoot = join(root, "src");
const FORBIDDEN = [/gilb\.com/i, /veda\./i, /localhost/i, /127\.0\.0\.1/, /w3id\.org/i];
// Exact quoted literals credentialsForPage is allowed to name, once each. Longer host first so
// "www.gilb.com" is not also counted as "gilb.com".
const PAGE_CREDENTIAL_HOSTS = ["gilb.com", "www.gilb.com", "localhost", "127.0.0.1"];

function pageCredentialLiteralRe() {
  return /"(?:www\.gilb\.com|gilb\.com|localhost|127\.0\.0\.1)"/g;
}

function stripPageCredentialLiterals(line) {
  return line.replace(pageCredentialLiteralRe(), '""');
}

function pageCredentialHosts(text) {
  return [...text.matchAll(pageCredentialLiteralRe())].map((m) => m[0].slice(1, -1));
}
const HEADLESS_ENTRIES = ["src/core.ts", "src/session.ts", "src/machine.ts"];
const SIBLING_IMPORT = /^\.\/[A-Za-z0-9_-]+$/;

function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function importsOf(file, text) {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  /** @type {Array<[string, number]>} */
  const specs = [];
  const at = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const lit = (n) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null);
  const visit = (n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) specs.push([lit(n.moduleSpecifier) ?? "<non-literal>", at(n)]);
    else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) specs.push([lit(n.moduleReference.expression) ?? "<non-literal>", at(n)]);
    else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require"))) specs.push([lit(n.arguments[0]) ?? "<non-literal>", at(n)]);
    else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument)) specs.push([lit(n.argument.literal) ?? "<non-literal>", at(n)]);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return specs;
}

if (!existsSync(srcRoot)) {
  console.error(`Host-agnostic check ERROR — no src/ under ${root}`);
  process.exit(2);
}

const hits = [];

// Pass 1: no host named in any source line.
for (const file of walk(srcRoot)) {
  if (!/\.(ts|tsx|js|mjs)$/.test(file)) continue;
  if (/\.test\.(ts|tsx|js)$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const rel = relative(root, file).split("\\").join("/");
  const pageRule = rel === "src/http.ts";
  for (let i = 0; i < lines.length; i++) {
    const scanned = pageRule ? stripPageCredentialLiterals(lines[i]) : lines[i];
    for (const re of FORBIDDEN) {
      if (re.test(scanned)) hits.push(`${rel}:${i + 1}: host named: ${lines[i].trim().slice(0, 80)}`);
    }
  }
  if (pageRule) {
    const found = pageCredentialHosts(text);
    for (const host of PAGE_CREDENTIAL_HOSTS) {
      const n = found.filter((h) => h === host).length;
      if (n !== 1) hits.push(`${rel}: first-party page host ${host} appears ${n} times; want 1`);
    }
    const v6 = [...text.matchAll(/"\[::1\]"/g)].length;
    if (v6 !== 1) hits.push(`${rel}: first-party page host [::1] appears ${v6} times; want 1`);
  }
}

// Pass 2: the headless entries import only their siblings.
const queue = [...HEADLESS_ENTRIES];
const walked = new Set();
while (queue.length) {
  const rel = queue.shift();
  if (walked.has(rel)) continue;
  walked.add(rel);
  const file = join(root, rel);
  if (!existsSync(file)) {
    console.error(`Host-agnostic check ERROR — cannot read ${rel} under ${root}`);
    process.exit(2);
  }
  for (const [spec, line] of importsOf(file, readFileSync(file, "utf8"))) {
    if (!SIBLING_IMPORT.test(spec)) {
      hits.push(`${rel}:${line}: headless entry imports outside the unit: ${spec}`);
      continue;
    }
    const next = ["ts", "tsx"].map((x) => join(dirname(rel), `${spec.slice(2)}.${x}`)).find((p) => existsSync(join(root, p)));
    if (next) queue.push(next);
    else hits.push(`${rel}:${line}: import does not resolve to a unit file: ${spec}`);
  }
}

if (hits.length) {
  console.error("Host-agnostic check FAIL — units/signin");
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}

console.log(
  `Host-agnostic check PASS — no vault host in units/signin/src; headless entries import only siblings (${[...walked]
    .map((f) => relative("src", f))
    .join(", ")})`,
);
