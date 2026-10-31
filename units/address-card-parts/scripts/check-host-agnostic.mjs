#!/usr/bin/env node
/**
 * Host-agnostic check for this unit body.
 *
 * Fails when a source file under src/ (tests excepted) names a vault host on any line, comments
 * included; when it imports anything but its own modules ("./x") and the packages listed in
 * ALLOWED_IMPORT; and when a CSS file pulls anything in (`@import`, `url(`) or names a host.
 * Imports are parsed with the TypeScript compiler, not matched by line, so a multi-line import and a
 * template-literal dynamic import are both seen. Tests may use example.test.
 *
 * Usage: node scripts/check-host-agnostic.mjs [rootDir]   (rootDir defaults to this unit)
 * Exit 0 = PASS, 1 = FAIL, 2 = could not read.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const UNIT = "units/address-card-parts";
const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
const srcRoot = join(root, "src");
const FORBIDDEN = [/gilb\.com/i, /veda\.[a-z0-9]/i, /localhost/i, /127\.0\.0\.1/, /w3id\.org/i];
const ALLOWED_IMPORT = [/^\.\/[A-Za-z0-9_-]+$/, /^@kaigilb\/gilbplatformcode-button$/, /^@kaigilb\/gilbplatformcode-card-mode$/, /^@kaigilb\/gilbplatformcode-flag-image$/, /^@kaigilb\/gilbplatformcode-geo-catalogue$/, /^@kaigilb\/gilbplatformcode-place-claims$/, /^@kaigilb\/gilbplatformcode-place-clear$/, /^@kaigilb\/gilbplatformcode-place-draft$/, /^@kaigilb\/gilbplatformcode-place-line$/, /^@kaigilb\/gilbplatformcode-place-lines$/, /^@kaigilb\/gilbplatformcode-place-names$/, /^@kaigilb\/gilbplatformcode-place-picker$/, /^@kaigilb\/gilbplatformcode-remove-control$/, /^@kaigilb\/gilbplatformcode-role-label$/, /^react$/];

if (!existsSync(srcRoot)) {
  console.error(`Host-agnostic check ERROR — no src/ under ${root}`);
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
const all = walk(srcRoot).filter((f) => !/\.test\.(ts|tsx|js)$/.test(f));
const code = all.filter((f) => /\.(ts|tsx|js|mjs)$/.test(f));
const css = all.filter((f) => /\.css$/.test(f));
if (code.length === 0) {
  console.error(`Host-agnostic check ERROR — no source files under ${srcRoot}`);
  process.exit(2);
}

function importsOf(file, text) {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : /\.(js|mjs)$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
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

const hits = [];
for (const file of code) {
  const rel = relative(root, file);
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const re of FORBIDDEN) if (re.test(lines[i])) hits.push(`${rel}:${i + 1}: host named: ${lines[i].trim().slice(0, 80)}`);
  }
  for (const [spec, line] of importsOf(file, text)) {
    if (!ALLOWED_IMPORT.some((re) => re.test(spec))) hits.push(`${rel}:${line}: import outside the unit: ${spec}`);
  }
}
for (const file of css) {
  const rel = relative(root, file);
  const text = readFileSync(file, "utf8");
  for (const re of FORBIDDEN) if (re.test(text)) hits.push(`${rel}: host named in CSS`);
  const noComments = text.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of noComments.matchAll(/@import\b[^;]*;?|url\(\s*[^)]*\)/gi)) hits.push(`${rel}: CSS pulls something in: ${m[0].trim().slice(0, 80)}`);
}
if (hits.length) {
  console.error(`Host-agnostic check FAIL — ${UNIT}`);
  for (const h of hits) console.error("  " + h);
  process.exit(1);
}
console.log(`Host-agnostic check PASS — ${UNIT} (${code.length} code file(s), ${css.length} CSS file(s))`);
