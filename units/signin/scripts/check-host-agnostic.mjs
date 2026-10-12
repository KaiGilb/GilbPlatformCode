#!/usr/bin/env node
/**
 * Host-agnostic check for this unit body. Two passes.
 *
 * 1. Every source file under src/ (tests excepted), line by line, comments included: a vault host
 *    named anywhere is a fail. Injected hosts in tests use example.test.
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
  const lines = readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const re of FORBIDDEN) {
      if (re.test(lines[i])) hits.push(`${relative(root, file)}:${i + 1}: host named: ${lines[i].trim().slice(0, 80)}`);
    }
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
