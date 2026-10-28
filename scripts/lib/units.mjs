// Helpers for manifest.mjs and drift.mjs; install order lives in peers.mjs.
// Find the units, resolve a unit name, locate the repo root.
//
// Layout: units/<name>/ (React/TS) and web-units/<name>/ (Vue/Nuxt); a unit is a
// folder with a package.json. Plain Node ESM, no dependencies.
// Callers turn a thrown Error from here into exit code 2 (bad input).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FOLDERS = ["units", "web-units"];

/** The repo root: two levels above scripts/lib/. `override` is for tests. */
export function repoRoot(override) {
  if (override) return path.resolve(override);
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function readPkg(root, dir) {
  const file = path.join(root, dir, "package.json");
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${dir}: cannot read ${dir}/package.json: ${e.message}`);
  }
}

/** Every unit: [{ dir: "units/type-key", name: "type-key", folder: "units", pkg }], sorted by dir. */
export function listUnits(root) {
  const out = [];
  for (const folder of FOLDERS) {
    const base = path.join(root, folder);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base).sort()) {
      const dir = `${folder}/${name}`;
      if (!statSync(path.join(base, name)).isDirectory()) continue;
      if (!existsSync(path.join(base, name, "package.json"))) continue;
      out.push({ dir, name, folder, pkg: readPkg(root, dir) });
    }
  }
  return out.sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

/** Accepts `type-key`, `units/type-key`, `web-units/hero`. Throws on unknown or ambiguous. */
export function resolveUnit(root, arg) {
  const units = listUnits(root);
  const clean = String(arg).replace(/\/+$/, "").replace(/^\.\//, "");
  if (clean.includes("/")) {
    const hit = units.find((u) => u.dir === clean);
    if (!hit) throw new Error(`unknown unit "${arg}": no ${clean}/package.json`);
    return hit;
  }
  const hits = units.filter((u) => u.name === clean);
  if (hits.length === 0) throw new Error(`unknown unit "${arg}": no units/${clean} or web-units/${clean}`);
  if (hits.length > 1) {
    throw new Error(`ambiguous unit "${arg}": exists as ${hits.map((h) => h.dir).join(" and ")}; give the folder`);
  }
  return hits[0];
}
