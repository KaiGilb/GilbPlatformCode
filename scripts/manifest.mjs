#!/usr/bin/env node
// Validate the per-unit manifest `unit.json` against the unit's README and package.json.
//
//   node scripts/manifest.mjs check [<unit> ...]   validate the given units, or every unit that has a unit.json
//   node scripts/manifest.mjs list                 units with / without unit.json, and counts
//
// Exit 0 ok, 1 a manifest has a problem, 2 could not run (bad arguments, unknown unit).
// Plain Node ESM, no dependencies.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listUnits, repoRoot, resolveUnit } from "./lib/units.mjs";

const TAG = /^t:[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)?$/;
const HEX40 = /^[0-9a-f]{40}$/;

/** The first sentence of the README's "## What this is": the first non-empty line after the heading, up to and including the first ". ", else the whole line. */
export function purposeOf(readme) {
  const lines = String(readme).split(/\r?\n/);
  const at = lines.findIndex((l) => /^##\s+What this is\s*$/.test(l));
  if (at < 0) return null;
  for (let i = at + 1; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) return null;
    const line = lines[i].trim();
    if (!line) continue;
    const cut = line.indexOf(". ");
    return cut < 0 ? line : line.slice(0, cut + 1);
  }
  return null;
}

/** The text of the README's "## Where it came from" section ("" when absent). */
export function provenanceOf(readme) {
  const lines = String(readme).split(/\r?\n/);
  const at = lines.findIndex((l) => /^##\s+Where it came from\s*$/.test(l));
  if (at < 0) return "";
  const out = [];
  for (let i = at + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join("\n");
}

function isRelative(p) {
  return typeof p === "string" && p.length > 0 && !p.startsWith("/") && !/^[A-Za-z]:/.test(p) && !p.split("/").includes("..");
}

/**
 * Pure validator. `m` is the parsed unit.json. `ctx`:
 *   dir      the unit folder as the manifest names it, e.g. "units/type-key"
 *   pkg      the parsed package.json
 *   readme   the README text
 *   exists   (relativePathInUnit) => boolean
 * Returns a list of problem strings (empty = good).
 */
export function validateManifest(m, ctx) {
  const p = [];
  if (m === null || typeof m !== "object" || Array.isArray(m)) return ["unit.json is not an object"];
  if (m.schema !== 1) p.push(`schema is ${JSON.stringify(m.schema)}, expected 1`);
  if (m.unit !== ctx.dir) p.push(`unit is ${JSON.stringify(m.unit)}, expected "${ctx.dir}"`);
  if (m.package !== ctx.pkg.name) p.push(`package is ${JSON.stringify(m.package)}, package.json says ${JSON.stringify(ctx.pkg.name)}`);
  if (m.version !== ctx.pkg.version) p.push(`version is ${JSON.stringify(m.version)}, package.json says ${JSON.stringify(ctx.pkg.version)}`);
  const want = purposeOf(ctx.readme);
  if (want === null) p.push(`README has no "## What this is" sentence to compare purpose with`);
  else if (m.purpose !== want) p.push(`purpose differs from the README's first sentence of "What this is"`);

  const src = m.source;
  if (src === null || typeof src !== "object" || Array.isArray(src)) {
    p.push("source is missing or not an object");
  } else {
    if (typeof src.repo !== "string" || !src.repo) p.push("source.repo is missing");
    if (typeof src.commit !== "string" || !HEX40.test(src.commit)) p.push(`source.commit is not 40 lowercase hex: ${JSON.stringify(src.commit)}`);
    else if (!provenanceOf(ctx.readme).includes(src.commit)) p.push(`source.commit ${src.commit} is not in the README's "Where it came from"`);
    if (!Array.isArray(src.files)) p.push("source.files is not a list");
    else {
      src.files.forEach((f, i) => {
        const at = `source.files[${i}]`;
        if (f === null || typeof f !== "object") { p.push(`${at} is not an object`); return; }
        if (!isRelative(f.path)) p.push(`${at}.path is not a relative path: ${JSON.stringify(f.path)}`);
        if (f.lines !== null) {
          const ok = Array.isArray(f.lines) && f.lines.length === 2 && f.lines.every(Number.isInteger) && f.lines[0] >= 1 && f.lines[0] <= f.lines[1];
          if (!ok) p.push(`${at}.lines must be null or [from, to] with 1 <= from <= to: ${JSON.stringify(f.lines)}`);
        }
        if (f.to !== null) {
          if (typeof f.to !== "string" || !isRelative(f.to)) p.push(`${at}.to is not null or a relative path: ${JSON.stringify(f.to)}`);
          else if (!ctx.exists(f.to)) p.push(`${at}.to "${f.to}" does not exist in ${ctx.dir}`);
        }
      });
    }
  }
  for (const key of ["namedChanges", "newFiles"]) {
    if (!Array.isArray(m[key]) || !m[key].every((s) => typeof s === "string")) p.push(`${key} is not a list of strings`);
  }
  if (Array.isArray(m.newFiles)) {
    for (const f of m.newFiles) if (typeof f === "string" && !ctx.exists(f)) p.push(`newFiles "${f}" does not exist in ${ctx.dir}`);
  }
  if (!Array.isArray(m.host)) p.push("host is not a list");
  else m.host.forEach((h, i) => {
    if (!h || typeof h.member !== "string" || typeof h.replaces !== "string") p.push(`host[${i}] needs string member and replaces`);
  });
  const lib = m.library;
  if (lib === null || typeof lib !== "object" || Array.isArray(lib) || typeof lib.admitted !== "boolean") {
    p.push("library is missing or has no boolean admitted");
  } else if (lib.admitted) {
    if (typeof lib.tag !== "string" || !TAG.test(lib.tag)) p.push(`library.tag is not a tag like t:Name or t:Name.part: ${JSON.stringify(lib.tag)}`);
    for (const k of ["title", "note"]) if (typeof lib[k] !== "string" || !lib[k]) p.push(`library.${k} is missing`);
  }
  return p;
}

/** Read one unit's manifest and validate it. Returns { dir, problems, manifest|null }. */
export function checkUnit(root, unit) {
  const file = path.join(root, unit.dir, "unit.json");
  if (!existsSync(file)) return { dir: unit.dir, problems: ["no unit.json"], manifest: null };
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    return { dir: unit.dir, problems: [`unit.json does not parse: ${e.message}`], manifest: null };
  }
  let readme = "";
  try {
    readme = readFileSync(path.join(root, unit.dir, "README.md"), "utf8");
  } catch {
    return { dir: unit.dir, problems: ["no README.md"], manifest };
  }
  const problems = validateManifest(manifest, {
    dir: unit.dir,
    pkg: unit.pkg,
    readme,
    exists: (rel) => existsSync(path.join(root, unit.dir, rel)),
  });
  return { dir: unit.dir, problems, manifest };
}

/** Units that have a unit.json (in unit order). */
export function withManifest(root) {
  const all = listUnits(root);
  const has = all.filter((u) => existsSync(path.join(root, u.dir, "unit.json")));
  return { all, has, without: all.filter((u) => !has.includes(u)) };
}

/** Check units (or all that have a unit.json). Also: no two units share a library tag. */
export function checkAll(root, units) {
  const picked = units ?? withManifest(root).has;
  const results = picked.map((u) => checkUnit(root, u));
  const owner = new Map();
  for (const r of results) {
    const lib = r.manifest?.library;
    if (lib && lib.admitted && typeof lib.tag === "string") {
      if (owner.has(lib.tag)) {
        const other = results.find((x) => x.dir === owner.get(lib.tag));
        r.problems.push(`library.tag ${lib.tag} is also the tag of ${owner.get(lib.tag)}`);
        other.problems.push(`library.tag ${lib.tag} is also the tag of ${r.dir}`);
      } else owner.set(lib.tag, r.dir);
    }
  }
  return results;
}

const HELP = `usage:
  node scripts/manifest.mjs check [<unit> ...]
  node scripts/manifest.mjs list`;

export function main(argv, root = repoRoot(), out = (s) => process.stdout.write(s + "\n"), err = (s) => process.stderr.write(s + "\n")) {
  const [cmd, ...rest] = argv;
  try {
    if (cmd === "list" && rest.length === 0) {
      const { all, has, without } = withManifest(root);
      for (const u of has) out(`with     ${u.dir}`);
      for (const u of without) out(`without  ${u.dir}`);
      out(`${all.length} units: ${has.length} with unit.json, ${without.length} without`);
      return 0;
    }
    if (cmd === "check") {
      if (rest.some((a) => a.startsWith("--"))) { err(`unknown option ${rest.find((a) => a.startsWith("--"))}\n${HELP}`); return 2; }
      const units = rest.length ? rest.map((a) => resolveUnit(root, a)) : undefined;
      const results = checkAll(root, units);
      let bad = 0;
      for (const r of results) for (const x of r.problems) { err(`${r.dir}: ${x}`); bad++; }
      out(`${results.length} units checked, ${bad} problems`);
      return bad ? 1 : 0;
    }
    err(HELP);
    return 2;
  } catch (e) {
    err(e.message);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
