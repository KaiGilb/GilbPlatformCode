#!/usr/bin/env node
// Which units' source ranges changed in the app since the unit was copied.
//
//   node scripts/drift.mjs --app-repo <path> --to <sha> [<unit> ...]    default: every unit with a unit.json
//   node scripts/drift.mjs ... --json
//   node scripts/drift.mjs ... --fail-on-drift                          exit 1 when a unit drifted
//   node scripts/drift.mjs ... --app-repo-name KaiGilb/GilbApp          units citing another repo are skipped
//   node scripts/drift.mjs --app-repo <path> --to <sha> --manifest <file>   check one unit.json from a path
//
// For each `source.files[]` entry the source is read at `source.commit` and at `--to` with
// `git -C <app-repo> show <sha>:<path>` (read only: no checkout, no fetch). A range is the
// "block": the old lines [from..to]; it is `same` when the block occurs verbatim as a run of lines
// in the new file (a move is reported), `changed` when it does not, `gone` when the file is missing.
// A null range compares the whole file. The app repo is private: only paths, ranges and verdicts
// are printed, never a source line.
//
// Exit 0 ran (drift is information), 1 --fail-on-drift and something drifted, 2 could not run.
// Needs a local clone of the private app repo; CI does not run it. Plain Node ESM, no dependencies.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repoRoot, resolveUnit } from "./lib/units.mjs";
import { withManifest } from "./manifest.mjs";

/** Text -> lines; a final newline does not make an extra empty line. */
export function linesOf(text) {
  const lines = String(text).split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Pure. Is the block (old lines from..to, 1-based inclusive) in the new text as a run of lines?
 * Returns { verdict: "same", range: [from, to], moved: boolean } or { verdict: "changed" }.
 * A match at the old position wins; otherwise the first match.
 * Throws RangeError when the range does not lie in the old text.
 */
export function compareBlock(oldText, newText, from, to) {
  const oldLines = linesOf(oldText);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || from > to || to > oldLines.length) {
    throw new RangeError(`lines ${from}-${to} are not inside the old file (${oldLines.length} lines)`);
  }
  const block = oldLines.slice(from - 1, to);
  const newLines = linesOf(newText);
  const at = (start) => block.every((l, i) => newLines[start + i] === l);
  const last = newLines.length - block.length;
  if (from - 1 <= last && at(from - 1)) return { verdict: "same", range: [from, to], moved: false };
  for (let s = 0; s <= last; s++) {
    if (at(s)) return { verdict: "same", range: [s + 1, s + block.length], moved: true };
  }
  return { verdict: "changed" };
}

/** Pure. Whole-file compare: "same" or "changed". */
export function compareWhole(oldText, newText) {
  return oldText === newText ? "same" : "changed";
}

/**
 * Pure. One manifest entry against two readers (path -> text | null).
 * Returns { path, lines, verdict: "same"|"changed"|"gone", moved?: [a, b] }.
 * A missing or out-of-range OLD source throws (the manifest is wrong, or the clone lacks the commit).
 */
export function compareEntry(entry, readOld, readNew) {
  const oldText = readOld(entry.path);
  if (oldText === null) throw new Error(`${entry.path} is not in the app repo at the unit's own commit`);
  const base = { path: entry.path, lines: entry.lines };
  const newText = readNew(entry.path);
  if (newText === null) return { ...base, verdict: "gone" };
  if (entry.lines === null) return { ...base, verdict: compareWhole(oldText, newText) };
  const r = compareBlock(oldText, newText, entry.lines[0], entry.lines[1]);
  if (r.verdict === "changed") return { ...base, verdict: "changed" };
  return r.moved ? { ...base, verdict: "same", moved: r.range } : { ...base, verdict: "same" };
}

/**
 * Pure. One unit: { unit, verdict: "unchanged"|"drifted", entries } (entries = all; `bad` = those not same).
 * `trivial` (the target is the unit's own commit) makes every entry same without reading.
 */
export function driftUnit(manifest, readOld, readNew, trivial = false) {
  const entries = manifest.source.files.map((f) =>
    trivial ? { path: f.path, lines: f.lines, verdict: "same" } : compareEntry(f, readOld, readNew),
  );
  const bad = entries.filter((e) => e.verdict !== "same");
  return { unit: manifest.unit, verdict: bad.length ? "drifted" : "unchanged", entries, bad };
}

const rangeText = (l) => (l ? ` ${l[0]}-${l[1]}` : "");

/** The line printed for a unit. */
export function unitLine(r) {
  if (r.verdict === "drifted") {
    return `drifted ${r.unit}  ${r.bad.map((e) => `${e.path}${rangeText(e.lines)} ${e.verdict}`).join("; ")}`;
  }
  const moved = r.entries.filter((e) => e.moved);
  if (!moved.length) return `unchanged ${r.unit}`;
  return `unchanged ${r.unit}  (moved: ${moved.map((e) => `${e.path}${rangeText(e.lines)} → ${e.moved[0]}-${e.moved[1]}`).join("; ")})`;
}

function git(repo, args) {
  return spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", shell: false, maxBuffer: 256 << 20 });
}

/** Resolve a revision to a full commit sha in the app repo, or throw. */
export function resolveCommit(repo, rev) {
  const r = git(repo, ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`]);
  if (r.error) throw new Error(`cannot run git: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${rev} is not a commit in ${repo}`);
  return r.stdout.trim();
}

/** A cached reader: path -> text at that commit, or null when the file is not there. */
export function gitReader(repo, sha) {
  const cache = new Map();
  return (p) => {
    if (cache.has(p)) return cache.get(p);
    const r = git(repo, ["show", `${sha}:${p}`]);
    const text = r.status === 0 ? r.stdout : null;
    cache.set(p, text);
    return text;
  };
}

const HELP = `usage:
  node scripts/drift.mjs --app-repo <path> --to <sha> [<unit> ...] [--json] [--fail-on-drift] [--app-repo-name <owner/repo>]
  node scripts/drift.mjs --app-repo <path> --to <sha> --manifest <unit.json>`;

function parseArgs(argv) {
  const o = { units: [], json: false, failOnDrift: false, appRepoName: "KaiGilb/GilbApp" };
  const valued = { "--app-repo": "appRepo", "--to": "to", "--app-repo-name": "appRepoName", "--manifest": "manifest" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (valued[a]) {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      o[valued[a]] = argv[++i];
    } else if (a === "--json") o.json = true;
    else if (a === "--fail-on-drift") o.failOnDrift = true;
    else if (a === "--help") o.help = true;
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else o.units.push(a);
  }
  return o;
}

export function main(argv, root = repoRoot(), out = (s) => process.stdout.write(s + "\n"), err = (s) => process.stderr.write(s + "\n")) {
  try {
    const o = parseArgs(argv);
    if (o.help) { out(HELP); return 0; }
    if (!o.appRepo || !o.to) throw new Error(`--app-repo and --to are required\n${HELP}`);
    if (o.manifest && o.units.length) throw new Error("--manifest checks one unit.json; do not also name units");
    const repo = path.resolve(o.appRepo);
    const to = resolveCommit(repo, o.to);

    let manifests;
    if (o.manifest) {
      let m;
      try { m = JSON.parse(readFileSync(o.manifest, "utf8")); } catch (e) { throw new Error(`cannot read ${o.manifest}: ${e.message}`); }
      if (!m?.source?.files || !m.source.commit) throw new Error(`${o.manifest} has no source.commit and source.files`);
      manifests = [m];
    } else {
      const picked = o.units.length ? o.units.map((a) => resolveUnit(root, a)) : withManifest(root).has;
      manifests = picked.map((u) => {
        try { return JSON.parse(readFileSync(path.join(root, u.dir, "unit.json"), "utf8")); }
        catch (e) { throw new Error(`${u.dir}: cannot read unit.json: ${e.message}`); }
      });
    }

    const results = [];
    const skipped = [];
    const readers = new Map();
    const reader = (sha) => { if (!readers.has(sha)) readers.set(sha, gitReader(repo, sha)); return readers.get(sha); };
    for (const m of manifests) {
      if (m.source.repo !== o.appRepoName) { skipped.push({ unit: m.unit, repo: m.source.repo }); continue; }
      const from = resolveCommit(repo, m.source.commit);
      try {
        results.push(driftUnit(m, reader(from), reader(to), from === to));
      } catch (e) {
        throw new Error(`${m.unit}: ${e.message}`);
      }
    }
    const drifted = results.filter((r) => r.verdict === "drifted").length;
    const summary = { unchanged: results.length - drifted, drifted, skipped: skipped.length };
    if (o.json) {
      out(JSON.stringify({
        to,
        units: results.map((r) => ({ unit: r.unit, verdict: r.verdict, entries: r.entries })),
        skipped,
        summary,
      }));
    } else {
      for (const r of results) out(unitLine(r));
      for (const s of skipped) out(`skipped ${s.unit}  cites ${s.repo}, not ${o.appRepoName}`);
      out(`${summary.unchanged} unchanged, ${summary.drifted} drifted, ${summary.skipped} skipped`);
    }
    return o.failOnDrift && drifted ? 1 : 0;
  } catch (e) {
    err(e.message);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
