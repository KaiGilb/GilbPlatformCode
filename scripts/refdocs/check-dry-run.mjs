// Checks dry-run.out against refdocs-input.json. Read-only. Usage: node check-dry-run.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = "https://appbuilder.gilb.com/base/e/gilbplatformcode-library-06gjdp49a9sm10t4hgdme4agwm";
const argv = (f) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : ""; };
const input = JSON.parse(readFileSync(argv("--input") || join(HERE, "out", "refdocs-input.json"), "utf8"));
const oldNotice = readFileSync(join(HERE, "notice.txt"), "utf8").trim();
const lines = readFileSync(argv("--dry-out") || join(HERE, "out", "dry-run.out"), "utf8").split("\n");
const bodies = []; let cur = null;
for (const l of lines) {
  if (l === "{") cur = [l]; else if (cur) { cur.push(l); if (l === "}") { bodies.push(JSON.parse(cur.join("\n"))); cur = null; } }
}
let bad = 0; const fail = (m) => { bad++; console.log("FAIL " + m); };
if (input.notice !== oldNotice) fail("input notice differs from old units.json notice");
if (bodies.length !== input.units.length * 2) fail(`bodies ${bodies.length} != 2 x units ${input.units.length}`);
const tags = new Set(input.units.map((u) => u.tag)); if (tags.size !== input.units.length) fail("duplicate tags in input");
input.units.forEach((u, i) => {
  const d = bodies[2 * i], e = bodies[2 * i + 1], f = d?.body?.facts, g = e?.body?.facts;
  const w = (m) => fail(`${u.folder}: ${m}`);
  if (d?.body?.type !== "t:ReferenceDocument") w("doc type");
  if (f?.["a:title"] !== u.title || !f?.["a:title"]) w("a:title");
  if (f?.["a:unitTag"] !== u.tag) w("a:unitTag");
  if (f?.["a:appliesTo"] !== u.note || !f?.["a:appliesTo"]) w("a:appliesTo");
  if (f?.["a:attribution"] !== input.notice) w("a:attribution is not the notice");
  if (f?.["a:license"] !== "GilbPlatform.Licence") w("a:license");
  if (!f?.["a:handsOffTo"]?.["@id"]) w("a:handsOffTo");
  if (f?.["a:partOf"]?.["@id"] !== LIB) w("a:partOf is not the library");
  if (e?.body?.type !== "t:ReferenceExhibit") w("exhibit type");
  if (!g?.["a:referenceOf"]) w("a:referenceOf");
  if (g?.["a:referenceOrder"] !== 1) w("a:referenceOrder");
  const x = g?.["a:referenceExhibit"] || "";
  if (x !== u.exhibit) w("exhibit differs from input");
  const L = x.split("\n");
  const ok6 = L.length === 6 && L[0].startsWith("**What it does:** ") && L[1] === "" && L[2] === `GitHub folder: units/${u.folder}` &&
    /^Commit: [0-9a-f]{40}$/.test(L[3]) && /^Package: @kaigilb\/gilbplatformcode-[a-z0-9-]+$/.test(L[4]) && L[5] === "Clone: https://github.com/KaiGilb/GilbPlatformCode.git";
  if (!ok6) w("exhibit lines: not 'What it does' / blank / folder / commit / package / clone");
});
// the dry-run must not have read a key or sent anything
if (!lines.includes("dry-run: nothing sent, no key read")) fail("dry-run footer missing");
console.log(`checked ${input.units.length} units, ${bodies.length} bodies: ${bad === 0 ? "ALL PASS" : bad + " FAILURES"}`);
process.exit(bad ? 1 : 0);
