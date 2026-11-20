#!/usr/bin/env node
// The "Needs:" first line of a unit README: the unit's direct library peers, short names, sorted, from its package.json
// (peerDependencies, plus dependencies with a file: spec; the same edges peers.mjs reads). A unit with none has no line.
// Usage: node scripts/needs.mjs check [--repo <path>]   report READMEs whose line is missing or wrong
//        node scripts/needs.mjs write [--repo <path>]   put the line right (adds it, or replaces a wrong one)
// Exit: 0 ok · 1 a README is wrong (check) · 2 usage.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGraph } from "./lib/graph.mjs";

const PREFIX = /^@kaigilb\/(gilbplatformcode|gilbwebsitecode)-/;
const LINE = /^Needs: .*(\r?\n|$)/;

/** The line a unit's README must start with, or "" when the unit has no library peers. */
export function needsLine(pkg) {
  const names = pkg.libs.map((n) => n.replace(PREFIX, "")).sort();
  return names.length ? `Needs: ${names.join(", ")}` : "";
}

/** What the README should look like: the right first line, a blank line, then the rest. Pure. */
export function withNeeds(text, line) {
  const rest = text.replace(LINE, "").replace(/^\s*\n/, "");
  return line ? `${line}\n\n${rest}` : rest;
}

/** One problem per unit whose README does not start with its Needs line. */
export function problems(repo) {
  const { pkgs } = loadGraph(repo);
  const out = [];
  for (const [key, pkg] of pkgs) {
    const readme = join(repo, key, "README.md");
    if (!existsSync(readme)) continue;
    const want = needsLine(pkg);
    const first = readFileSync(readme, "utf8").split(/\r?\n/, 1)[0];
    const have = first.startsWith("Needs:") ? first : "";
    if (have !== want) out.push({ key, readme, want, have });
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--repo");
  const repo = i >= 0 ? resolve(argv[i + 1] || ".") : resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const cmd = argv[0];
  if (cmd !== "check" && cmd !== "write") { console.error("usage: node scripts/needs.mjs check|write [--repo <path>]"); process.exit(2); }
  const bad = problems(repo);
  if (cmd === "write") {
    for (const p of bad) writeFileSync(p.readme, withNeeds(readFileSync(p.readme, "utf8"), p.want));
    console.log(`${bad.length} README(s) written`);
  } else {
    for (const p of bad) console.error(`${p.key}/README.md: first line is ${p.have ? `"${p.have}"` : "missing"}, want "${p.want || "(no Needs line)"}"`);
    if (bad.length) { console.error(`${bad.length} README(s) wrong; run: node scripts/needs.mjs write`); process.exit(1); }
    console.log("every unit README has the right Needs line");
  }
}
