#!/usr/bin/env node
// A unit's library peers in install order, with the npm install line.
// Usage: node scripts/peers.mjs <unit-folder> [--json] [--repo <path>]
// Exit: 0 ok · 1 usage · 2 unknown folder · 3 conflicting third-party peer ranges · 4 cycle · 5 peer name with no folder.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (f) => { const i = argv.indexOf(f); return i < 0 ? "" : argv[i + 1] || ""; };
const json = argv.includes("--json");
const repo = flag("--repo") ? resolve(flag("--repo")) : resolve(HERE, "..");
const positional = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--repo");
if (positional.length !== 1) { console.error("usage: node scripts/peers.mjs <unit-folder> [--json] [--repo <path>]"); process.exit(1); }

const LIB = /^@kaigilb\/(gilbplatformcode|gilbwebsitecode)-/;
const given = positional[0].replace(/\/+$/, "");
const key = given.startsWith("web-units/") ? given : given.startsWith("units/") ? given : `units/${given}`;
const wantWeb = key.startsWith("web-units/");

// key ("units/x" | "web-units/x") -> { name, peers, files, third }
const pkgs = new Map();
for (const dir of wantWeb ? ["units", "web-units"] : ["units"]) {
  const root = join(repo, dir);
  if (!existsSync(root)) continue;
  for (const f of readdirSync(root).sort()) {
    const p = join(root, f, "package.json");
    if (!existsSync(p)) continue;
    const j = JSON.parse(readFileSync(p, "utf8"));
    const libs = [], third = {};
    for (const [n, r] of Object.entries(j.peerDependencies || {})) if (LIB.test(n)) libs.push(n); else third[n] = r;
    for (const [n, v] of Object.entries(j.dependencies || {})) if (LIB.test(n) && String(v).startsWith("file:")) libs.push(n);
    pkgs.set(`${dir}/${f}`, { name: j.name, libs: [...new Set(libs)], third });
  }
}
const byName = new Map([...pkgs].map(([k, v]) => [v.name, k]));
if (!pkgs.has(key)) { console.error(`unknown unit folder: ${given}`); process.exit(2); }

// Depth-first from the given unit; children visited in name order, so the order is deterministic.
const done = new Set(), onPath = [], order = [];
function visit(k) {
  if (done.has(k)) return;
  const at = onPath.indexOf(k);
  if (at >= 0) { console.error("cycle: " + [...onPath.slice(at), k].join(" -> ")); process.exit(4); }
  onPath.push(k);
  const deps = pkgs.get(k).libs.map((n) => {
    const t = byName.get(n);
    if (!t) { console.error(`peer ${n} (needed by ${k}) has no folder`); process.exit(5); }
    return t;
  }).sort();
  for (const d of deps) visit(d);
  onPath.pop(); done.add(k); order.push(k);
}
visit(key);
// A depth-first order is valid but not name-ordered among independent units; re-sort by levels (Kahn), ties by name.
const remaining = new Set(order), placed = [], seen = new Set();
while (remaining.size) {
  const ready = [...remaining].filter((k) => pkgs.get(k).libs.every((n) => seen.has(byName.get(n)))).sort();
  if (!ready.length) { console.error("cycle among: " + [...remaining].join(", ")); process.exit(4); }
  const pick = ready[0]; // the given unit needs every other unit in the closure, so it is always last
  placed.push(pick); seen.add(pick); remaining.delete(pick);
}
const short = (k) => (k.startsWith("units/") ? k.slice(6) : k);

const third = {}, conflicts = [];
const askedBy = {};
for (const k of placed) for (const [n, r] of Object.entries(pkgs.get(k).third)) {
  (askedBy[n] ||= new Map()).set(r, [...(askedBy[n].get(r) || []), short(k)]);
}
for (const n of Object.keys(askedBy).sort()) {
  if (askedBy[n].size > 1) conflicts.push(`${n}: ` + [...askedBy[n]].map(([r, us]) => `${r} (${us.join(", ")})`).join(" vs "));
  else third[n] = [...askedBy[n].keys()][0];
}
if (conflicts.length) { console.error("conflicting third-party peer ranges:\n" + conflicts.join("\n")); process.exit(3); }

const tp = Object.keys(third).sort().map((n) => `${n}@${third[n]}`);
const npm = ["npm install", ...tp, ...placed.map((k) => `<path-to-the-library>/${k}`)].join(" ");
if (json) {
  console.log(JSON.stringify({ unit: short(key), order: placed.map(short), thirdParty: Object.fromEntries(Object.keys(third).sort().map((n) => [n, third[n]])), npm }, null, 2));
} else {
  console.log(`${placed.length} units, in install order:`);
  for (const k of placed) console.log(short(k));
  console.log("third-party peers: " + tp.join(" "));
  console.log(npm);
}
