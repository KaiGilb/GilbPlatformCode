#!/usr/bin/env node
/**
 * Build check: did the rewrite happen? Reads every .html under a build folder and fails when a page still has its
 * module entry script from /_nuxt/ in place (the framework's markup changed and the rewrite silently matched
 * nothing), or when no page was rewritten at all. It does not use the unit's own pattern, so it can see a drift.
 *
 * Usage: node scripts/check-rendered-entry.mjs <distDir>
 * Exit 0 = every page with an entry was rewritten, 1 = FAIL, 2 = could not read.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const MARK = "/*entry-after-paint*/";
const dist = process.argv[2] ? resolve(process.argv[2]) : null;
if (!dist || !existsSync(dist)) {
  console.error("Rendered-entry check ERROR — give an existing build folder");
  process.exit(2);
}
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const pages = walk(dist).filter((f) => f.endsWith(".html"));
if (!pages.length) {
  console.error(`Rendered-entry check ERROR — no .html under ${dist}`);
  process.exit(2);
}
const unmoved = [];
let moved = 0;
for (const f of pages) {
  const html = readFileSync(f, "utf8");
  const left = /<script\b[^>]*\btype=["']?module["']?[^>]*\bsrc=["']?\/_nuxt\//i.test(html) || /<script\b[^>]*\bsrc=["']?\/_nuxt\/[^>]*\btype=["']?module/i.test(html);
  if (left) unmoved.push(f);
  else if (html.includes(MARK)) moved++;
}
if (unmoved.length || moved === 0) {
  console.error(`Rendered-entry check FAIL — ${unmoved.length} page(s) still load the entry in <head>, ${moved} rewritten:`);
  for (const f of unmoved.slice(0, 10)) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`Rendered-entry check PASS — ${moved} page(s) rewritten, none left unmoved`);
