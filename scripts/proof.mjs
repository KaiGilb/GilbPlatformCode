#!/usr/bin/env node
// Runs a unit's proofs: npm ci, npm test, npm run typecheck, npm run check:host-agnostic.
// Usage: node scripts/proof.mjs <unit-folder>... [--changed <base-ref>] [--json] [--keep] [--repo <path>]
// Exit: 0 every unit passed (or no units changed) · 1 a unit failed · 2 usage error or unknown folder.
import { readFileSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i < 0 ? null : argv[i + 1] ?? ""; };
const asJson = argv.includes("--json"), keep = argv.includes("--keep");
const repo = val("--repo") ? resolve(val("--repo")) : resolve(HERE, "..");
const changedBase = val("--changed");
const positional = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--repo" && argv[i - 1] !== "--changed");
const usage = (m) => { console.error(m + "\nusage: node scripts/proof.mjs <unit-folder>... [--changed <base-ref>] [--json] [--keep] [--repo <path>]"); process.exit(2); };
if (changedBase === "") usage("--changed needs a base ref");
if (!positional.length && changedBase === null) usage("no unit given");

const keyOf = (name) => { const n = name.replace(/\/+$/, ""); return n.startsWith("units/") || n.startsWith("web-units/") ? n : `units/${n}`; };
let keys;
if (changedBase !== null) {
  const r = spawnSync("git", ["-C", repo, "diff", "--name-only", `${changedBase}...HEAD`], { encoding: "utf8", shell: false });
  if (r.status !== 0) usage(`git diff against ${changedBase} failed: ${(r.stderr || "").trim()}`);
  const set = new Set();
  for (const f of r.stdout.split("\n")) {
    const m = /^(units|web-units)\/([^/]+)\//.exec(f);
    if (m) set.add(`${m[1]}/${m[2]}`);
  }
  keys = [...set].filter((k) => existsSync(join(repo, k, "package.json"))).sort();
  if (!keys.length) { console.log("no units changed"); process.exit(0); }
} else keys = positional.map(keyOf);
for (const k of keys) if (!existsSync(join(repo, k, "package.json"))) usage(`unknown unit folder: ${k}`);

const tail = (s, n = 30) => s.split("\n").slice(-n - 1).join("\n").trim();
const results = [];
for (const k of keys) {
  const dir = join(repo, k);
  const scripts = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).scripts || {};
  const plan = [
    ["npm ci", ["ci", "--no-audit", "--no-fund"], true],
    ["test", ["test"], true],
    ["typecheck", ["run", "typecheck"], !!scripts.typecheck],
    ["check:host-agnostic", ["run", "check:host-agnostic"], !!scripts["check:host-agnostic"]],
  ];
  const steps = []; let failed = null;
  for (const [name, args, present] of plan) {
    if (failed) break;
    if (!present) { steps.push({ name, exit: null, ms: 0, skipped: true }); continue; }
    const t0 = Date.now();
    const r = spawnSync("npm", args, { cwd: dir, encoding: "utf8", shell: false, maxBuffer: 64 * 1024 * 1024 });
    const exit = r.status ?? 1;
    steps.push({ name, exit, ms: Date.now() - t0, skipped: false });
    if (exit !== 0) failed = { name, exit, out: tail(`${r.stdout || ""}${r.stderr || ""}${r.error ? "\n" + r.error.message : ""}`) };
  }
  if (!keep) rmSync(join(dir, "node_modules"), { recursive: true, force: true });
  results.push({ folder: k, steps, pass: !failed, failed });
}

const passed = results.filter((r) => r.pass).length, nfail = results.length - passed;
const skipped = results.reduce((n, r) => n + r.steps.filter((s) => s.skipped).length, 0);
if (asJson) {
  console.log(JSON.stringify({ units: results.map(({ folder, steps, pass }) => ({ folder, steps, pass })), passed, failed: nfail }, null, 2));
} else {
  for (const r of results) {
    for (const s of r.steps) if (s.skipped) console.log(`${r.folder}: ${s.name} skipped (no script)`);
    console.log(r.pass ? `${r.folder}: PASS` : `${r.folder}: FAIL at ${r.failed.name} (exit ${r.failed.exit})`);
    if (!r.pass) console.log(r.failed.out);
  }
  console.log(`${passed} passed, ${nfail} failed, ${skipped} steps skipped`);
}
process.exit(nfail ? 1 : 0);
