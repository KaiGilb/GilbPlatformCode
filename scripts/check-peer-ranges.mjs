#!/usr/bin/env node
// Every unit's peerDependencies range on another unit in this repo must accept that unit's version.
//
//   node scripts/check-peer-ranges.mjs
//
// Exit 0 ok, 1 a range does not accept the current version, 2 could not run (bad arguments, or a
// version or range this check cannot read). A range it cannot read fails; it is not treated as a match.
// peerDependencies only. An @kaigilb name with no unit in this repo is ignored. `||` is or.
// A caret is the npm rule: ^0.1.0 is >=0.1.0 <0.2.0, ^0.0.x bumps the patch, ^1.x bumps the major.
// Plain Node ESM, no dependencies.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { listUnits, repoRoot } from "./lib/units.mjs";

const HELP = "usage: node scripts/check-peer-ranges.mjs";

/** @returns {[number, number, number] | null} */
export function parseVersion(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(s).trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function cmp(a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** True when `v` satisfies one npm caret. Null when `range` is not a caret. */
export function caretAccepts(range, v) {
  const m = /^\^(\d+\.\d+\.\d+)$/.exec(String(range).trim());
  if (!m) return null;
  const lo = parseVersion(m[1]);
  if (!lo) return null;
  const hi = lo[0] > 0 ? [lo[0] + 1, 0, 0] : lo[1] > 0 ? [0, lo[1] + 1, 0] : [0, 0, lo[2] + 1];
  return cmp(v, lo) >= 0 && cmp(v, hi) < 0;
}

/**
 * True when any `||` alternative accepts `v`.
 * @returns {{ ok: boolean, unreadable: boolean }}
 */
export function rangeAccepts(range, v) {
  const parts = String(range).split("||");
  if (parts.length === 0 || parts.some((p) => p.trim() === "")) return { ok: false, unreadable: true };
  let any = false;
  for (const p of parts) {
    const hit = caretAccepts(p, v);
    if (hit === null) return { ok: false, unreadable: true };
    if (hit) any = true;
  }
  return { ok: any, unreadable: false };
}

/**
 * @param {string} root
 * @returns {{ units: number, mismatches: Array<{dir: string, peer: string, range: string, version: string, peerDir: string}>, unreadable: Array<{dir: string, detail: string}> }}
 */
export function peerMismatches(root) {
  const units = listUnits(root);
  const byName = new Map();
  const unreadable = [];
  for (const u of units) {
    if (typeof u.pkg.name !== "string" || typeof u.pkg.version !== "string") {
      unreadable.push({ dir: u.dir, detail: "package.json name or version is not a string" });
      continue;
    }
    if (parseVersion(u.pkg.version) === null) {
      unreadable.push({ dir: u.dir, detail: `version ${JSON.stringify(u.pkg.version)} is not major.minor.patch` });
    }
    const prev = byName.get(u.pkg.name);
    if (prev) unreadable.push({ dir: u.dir, detail: `package name ${u.pkg.name} is also ${prev.dir}` });
    else byName.set(u.pkg.name, u);
  }
  const mismatches = [];
  for (const u of units) {
    const peers = u.pkg.peerDependencies;
    if (peers === undefined) continue;
    if (peers === null || typeof peers !== "object" || Array.isArray(peers)) {
      unreadable.push({ dir: u.dir, detail: "peerDependencies is not an object" });
      continue;
    }
    for (const [name, range] of Object.entries(peers)) {
      if (!name.startsWith("@kaigilb/")) continue;
      const peer = byName.get(name);
      if (!peer) continue;
      if (typeof range !== "string") {
        unreadable.push({ dir: u.dir, detail: `peer ${name} range is not a string` });
        continue;
      }
      const version = parseVersion(peer.pkg.version);
      if (version === null) {
        unreadable.push({ dir: u.dir, detail: `peer ${name} version ${JSON.stringify(peer.pkg.version)} is not major.minor.patch` });
        continue;
      }
      const hit = rangeAccepts(range, version);
      if (hit.unreadable) {
        unreadable.push({ dir: u.dir, detail: `peer ${name} range ${JSON.stringify(range)} is not carets joined by ||` });
        continue;
      }
      if (!hit.ok) {
        mismatches.push({ dir: u.dir, peer: name, range, version: peer.pkg.version, peerDir: peer.dir });
      }
    }
  }
  mismatches.sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : a.peer < b.peer ? -1 : 1));
  return { units: units.length, mismatches, unreadable };
}

export function main(argv, root = repoRoot(), out = (s) => process.stdout.write(s + "\n"), err = (s) => process.stderr.write(s + "\n")) {
  if (argv.length) {
    err(HELP);
    return 2;
  }
  const { units, mismatches, unreadable } = peerMismatches(root);
  for (const u of unreadable) err(`${u.dir}: ${u.detail}`);
  for (const m of mismatches) {
    err(`${m.dir}: peer ${m.peer} ${JSON.stringify(m.range)} does not accept ${m.peerDir} ${m.version}`);
  }
  if (unreadable.length) {
    out(`${units} units checked, ${unreadable.length} unreadable, ${mismatches.length} mismatches`);
    return 2;
  }
  out(`${units} units checked, ${mismatches.length} mismatches`);
  return mismatches.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
