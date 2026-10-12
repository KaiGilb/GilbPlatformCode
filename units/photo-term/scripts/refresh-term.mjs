#!/usr/bin/env node
// Regenerate src/termSnapshot.ts from the live master. The seed is a MEASUREMENT, so it is
// taken by a script, never typed. Runs the control first: if a term that must not exist answers
// anything but 404, the instrument cannot tell a hit from a miss and the capture is refused.
//
// Usage: VEDA_ORIGIN=<GilbVeda origin> [PHOTO_TERM_SLUG=profilePhoto] npm run refresh-term
// The origin is passed in; this unit names no host.
import { writeFile, readFile } from "node:fs/promises";

const ORIGIN = (process.env.VEDA_ORIGIN ?? "").replace(/\/+$/, "");
const SLUG = process.env.PHOTO_TERM_SLUG ?? "profilePhoto";
const CONTROL = "zzqqnotaterm";

if (!/^https?:\/\//.test(ORIGIN)) {
  console.error("REFUSED: set VEDA_ORIGIN to the GilbVeda master's origin, e.g. VEDA_ORIGIN=https://<host>.");
  process.exit(2);
}

const get = async (slug) => {
  const url = `${ORIGIN}/base/a/${slug}`;
  const res = await fetch(url);
  return { url, status: res.status, body: res.ok ? await res.json() : null };
};

const control = await get(CONTROL);
if (control.status !== 404) {
  console.error(`REFUSED: control ${control.url} answered ${control.status}, expected 404.`);
  console.error("An instrument that cannot answer 404 for a term that does not exist cannot");
  console.error("distinguish a real binding from a fabricated one. Not capturing.");
  process.exit(2);
}

const term = await get(SLUG);
if (term.status !== 200 || !term.body) {
  console.error(`REFUSED: ${term.url} answered ${term.status}.`);
  process.exit(2);
}
const predicateAttribute = term.body["a:predicateAttribute"];
if (typeof predicateAttribute !== "string" || !predicateAttribute.trim()) {
  console.error(`REFUSED: ${term.url} carries no a:predicateAttribute.`);
  process.exit(2);
}
const deprecatedNotation = term.body["a:deprecatedNotation"] ?? null;
const ontologyStatus = term.body["a:ontologyStatus"] ?? "unknown";
const capturedAt = new Date().toISOString().slice(0, 10);

const path = new URL("../src/termSnapshot.ts", import.meta.url);
const src = await readFile(path, "utf8");
const patched = src
  .replace(/slug: "[^"]*"/, `slug: ${JSON.stringify(SLUG)}`)
  .replace(/capturedAt: "[^"]*"/, `capturedAt: ${JSON.stringify(capturedAt)}`)
  .replace(/control: "[^"]*"/, `control: ${JSON.stringify(`a/${CONTROL} -> ${control.status}`)}`)
  .replace(/predicateAttribute: "[^"]*"/, `predicateAttribute: ${JSON.stringify(predicateAttribute)}`)
  .replace(
    /deprecatedNotation: (?:"[^"]*"|null)/,
    `deprecatedNotation: ${JSON.stringify(deprecatedNotation)}`,
  )
  .replace(/ontologyStatus: "[^"]*"/, `ontologyStatus: ${JSON.stringify(ontologyStatus)}`);
await writeFile(path, patched);
console.log(`captured ${term.url} (${ontologyStatus})`);
console.log(`  a:predicateAttribute = ${predicateAttribute}`);
console.log(`  a:deprecatedNotation = ${JSON.stringify(deprecatedNotation)}`);
console.log(`  control a/${CONTROL} -> ${control.status}`);
