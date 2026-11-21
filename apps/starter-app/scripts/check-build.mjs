#!/usr/bin/env node
// After `vite build`: the build must not hold the fake platform. It is a test stand-in that checks no signature,
// and main.tsx loads it only in the fake mode. Exit 0 = clean, 1 = the build holds it, 2 = no build to read.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
if (!existsSync(dist)) {
  console.error(`check-build ERROR: no build at ${dist}`);
  process.exit(2);
}
const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
const MARKS = ["fake_platform_no_such_route", "https://fake.test"];
const hits = [];
for (const file of walk(dist).filter((f) => /\.(js|html|css)$/.test(f))) {
  const text = readFileSync(file, "utf8");
  for (const mark of MARKS) if (text.includes(mark)) hits.push(`${relative(dist, file)} holds "${mark}"`);
}
if (hits.length) {
  console.error("check-build FAIL: the build holds the fake platform");
  for (const h of hits) console.error("  " + h);
  process.exit(1);
}
console.log("check-build PASS: the build does not hold the fake platform");
