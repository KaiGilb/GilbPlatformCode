#!/usr/bin/env node
// Builds refdocs-input.json for write-refdocs.mjs from docs.json (tag, title, note per folder)
// and the merged GilbPlatformCode repo (origin/main). Read-only: it fetches, it never writes to the repo or the vault.
// Usage: node build-input.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = (f) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : ""; };
const REPO = argv("--repo") ? resolve(argv("--repo")) : resolve(HERE, "..", "..");
const CLONE = "https://github.com/KaiGilb/GilbPlatformCode.git";
const git = (...args) => execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
// Same as git(), but a non-zero exit is an answer ("no"), not a crash.
const gitTry = (...args) => { try { return { ok: true, out: git(...args) }; } catch (e) { return { ok: false, out: "", err: String(e.stderr || e.message).trim().split("\n")[0] }; } };

const docs = JSON.parse(readFileSync(join(HERE, "library.json"), "utf8"));
const notice = readFileSync(join(HERE, "notice.txt"), "utf8").trim();
if (!notice || typeof notice !== "string") throw new Error("notice.txt is empty");

if (!process.argv.includes("--no-fetch")) git("fetch", "-q", "origin");
const mainSha = git("rev-parse", "origin/main").trim();
console.log(`origin/main at ${mainSha}`);

// First non-empty line after "## What this is", up to and including the first ". " (else the whole line).
function whatItDoes(readme) {
  const lines = readme.split(/\r?\n/);
  const at = lines.findIndex((l) => /^##\s+What this is\b/i.test(l.trim()));
  if (at < 0) return { err: "README has no '## What this is' heading" };
  for (let i = at + 1; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (l.startsWith("#")) return { err: "'## What this is' has no text before the next heading" };
    const cut = l.indexOf(". ");
    return { text: cut < 0 ? l : l.slice(0, cut + 1) };
  }
  return { err: "'## What this is' is the last thing in the README" };
}

const tagCount = new Map();
for (const d of Object.values(docs)) tagCount.set(d.tag, (tagCount.get(d.tag) || 0) + 1);

const included = [];
const left = [];
for (const [folder, d] of Object.entries(docs)) {
  const out = (reason) => { left.push({ folder, tag: d?.tag, reason }); };
  if (!/^[a-z0-9][a-z0-9-]*$/.test(folder)) { out("folder name is not a plain lowercase-hyphen name"); continue; }
  if (!d || typeof d.tag !== "string" || typeof d.title !== "string" || typeof d.note !== "string") { out("docs.json entry lacks a string tag, title or note"); continue; }
  if (!/^t:[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)?$/.test(d.tag)) { out(`tag '${d.tag}' is not t:Type or t:Type.cut`); continue; }
  if (!d.title.trim() || !d.note.trim() || /[\r\n]/.test(d.title + d.note)) { out("title or note is empty or not one line"); continue; }
  if (tagCount.get(d.tag) > 1) { out(`tag ${d.tag} is used by more than one folder in docs.json (RuleGpcrefOnePerTag)`); continue; }

  const path = `units/${folder}`;
  const onMain = git("ls-tree", "origin/main", path).trim();
  if (!onMain) { out("not on main yet"); continue; }

  const pin = git("log", "-1", "--format=%H", "origin/main", "--", path).trim();
  if (!/^[0-9a-f]{40}$/.test(pin)) { out(`no 40-hex pin from git log (got '${pin}')`); continue; }
  const tree = gitTry("ls-tree", pin, path);
  if (!tree.ok || !tree.out.includes(`\t${path}`)) { out(`RuleGpcrefCommit: git ls-tree ${pin.slice(0, 10)} does not list ${path}`); continue; }
  const anc = gitTry("merge-base", "--is-ancestor", pin, "origin/main");
  if (!anc.ok) { out(`RuleGpcrefCommit: ${pin.slice(0, 10)} is not an ancestor of origin/main`); continue; }

  const pj = gitTry("show", `origin/main:${path}/package.json`);
  let pkg = "";
  try { pkg = String(JSON.parse(pj.out).name || ""); } catch { /* handled below */ }
  if (!pkg) { out("no package name in origin/main package.json"); continue; }

  const rd = gitTry("show", `${pin}:${path}/README.md`);
  if (!rd.ok) { out(`no README.md at pin ${pin.slice(0, 10)}`); continue; }
  const w = whatItDoes(rd.out);
  if (w.err) { out(w.err); continue; }
  if (/[\r\n]/.test(w.text) || !w.text.trim()) { out("What-it-does sentence is empty"); continue; }

  const exhibit = `**What it does:** ${w.text}\n\nGitHub folder: ${path}\nCommit: ${pin}\nPackage: ${pkg}\nClone: ${CLONE}`;
  included.push({ folder, tag: d.tag, title: d.title, note: d.note, exhibit, _pin: pin, _pkg: pkg, _what: w.text });
}

mkdirSync(join(HERE, "out"), { recursive: true });
writeFileSync(join(HERE, "out", "refdocs-input.json"), JSON.stringify({ notice, units: included.map(({ _pin, _pkg, _what, ...u }) => u) }, null, 1) + "\n");

console.log(`\nINCLUDED (${included.length}):`);
for (const u of included) console.log(`  ${u.folder} | ${u.tag} | ${u._pin} | ${u._pkg}\n      ${u._what}`);
console.log(`\nLEFT OUT (${left.length}):`);
for (const l of left) console.log(`  ${l.folder} | ${l.tag} | ${l.reason}`);
console.log(`\nunits in docs.json: ${Object.keys(docs).length}; included: ${included.length}; left out: ${left.length}`);
console.log("wrote refdocs-input.json");
