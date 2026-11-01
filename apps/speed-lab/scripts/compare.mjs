// node scripts/compare.mjs <SL-id> [--app <name>] [--last N] [--runs <dir>]
// Lists the last runs of one test from the result files and flags the latest run when a row failed or got slower.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_TESTS, SCHEMA, allTests, runsDir } from "./results.mjs";

export const SLOWER_RATIO = 1.25;
export const SLOWER_MIN_MS = 20;
export const MIN_EARLIER = 2;

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** rowsByKey: { [key]: [{ pass, values, ... } oldest ... latest] }. Returns [{ key, flags: [..], notes: [..] }]. */
export function judge(rowsByKey, primary) {
  const out = [];
  for (const [key, rows] of Object.entries(rowsByKey)) {
    const latest = rows[rows.length - 1];
    const flags = [];
    const notes = [];
    if (latest.pass !== true) flags.push("FAIL");
    if (primary) {
      const now = num(latest.values?.[primary]);
      if (now === null) flags.push("NO READING");
      else {
        const earlier = rows.slice(0, -1).map((r) => num(r.values?.[primary])).filter((v) => v !== null);
        if (earlier.length < MIN_EARLIER) notes.push("too few runs to judge");
        else {
          const med = median(earlier);
          if (now > SLOWER_RATIO * med && now - med > SLOWER_MIN_MS) flags.push("SLOWER");
        }
      }
    }
    out.push({ key, flags, notes });
  }
  return out;
}

const fmt = (v) => (v === undefined || v === null ? "" : typeof v === "number" ? String(Math.round(v * 10) / 10) : String(v));
const keyOf = (r) => `${r.engine}/${r.profile}${r.variant ? `/${r.variant}` : ""}`;

export function main(argv, env, out = console) {
  const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const usage = "usage: node scripts/compare.mjs <SL-id> [--app <name>] [--last N] [--runs <dir>]";
  let id = null;
  let last = 5;
  let dir = runsDir(env, APP);
  let appName = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--last" && argv[i + 1] !== undefined) {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) { out.error(`${usage}\n--last needs a whole number of at least 1`); return 2; }
      last = n;
    } else if (a === "--runs" && argv[i + 1]) dir = argv[++i];
    else if (a === "--app" && argv[i + 1]) appName = argv[++i];
    else if (!a.startsWith("--") && id === null) id = a;
    else { out.error(`${usage}\nunknown or incomplete argument: ${a}`); return 2; }
  }
  if (!id) { out.error(usage); return 2; }
  const tests = allTests();
  if (!Object.hasOwn(tests, id)) { out.error(`${usage}\nunknown test ${id}; known: ${Object.keys(tests).join(", ")}`); return 2; }
  const appTest = Object.hasOwn(APP_TESTS, id);
  if (appTest && !appName) { out.error(`${id} needs --app <name>`); return 2; }
  const def = tests[id];

  const names = existsSync(dir) ? readdirSync(dir) : [];
  const runs = [];
  for (const n of names.filter((x) => x.endsWith(`-${id}.json`))) {
    try {
      const b = JSON.parse(readFileSync(join(dir, n), "utf8"));
      if (b?.schema !== SCHEMA || b.test !== id || !Array.isArray(b.rows)) continue;
      // SL-001 to SL-007 stay Speed Lab's own proof: a runner file (it has `app`) is not one of them.
      // SL-101 and SL-102 are one app's files only.
      if (appTest) { if (b.app?.name !== appName) continue; }
      else if (Object.hasOwn(b, "app")) continue;
      runs.push(b);
    } catch { /* not a result file */ }
  }
  if (!runs.length) {
    const named = appName ? ` for app ${appName}` : "";
    out.error(`no result files for ${id}${named} in ${dir} (searched ${names.length} files)`);
    return 2;
  }
  runs.sort((a, b) => String(a.run.at).localeCompare(String(b.run.at)));
  const shown = runs.slice(-last);

  out.log(`dir: ${dir}`);
  out.log(`${id} ${def.title}`);
  out.log(`${runs.length} result file(s) found, last ${shown.length} shown`);

  const rowsByKey = {};
  for (const run of shown) {
    for (const r of run.rows) {
      (rowsByKey[keyOf(r)] ??= []).push({ ...r, at: run.run.at, commit: run.run.commit, appVersion: run.run.appVersion, dirty: run.run.dirty });
    }
  }
  const primary = def.primary;
  for (const [key, rows] of Object.entries(rowsByKey)) {
    out.log("");
    out.log(key);
    const head = primary ? ["at", "commit", "appVersion", "pass", primary, ...(rows.some((r) => num(r.values?.fullMs) !== null) ? ["fullMs"] : [])] : ["at", "commit", "appVersion", "pass", "failed"];
    out.log(`| ${head.join(" | ")} |`);
    out.log(`|${head.map(() => "---").join("|")}|`);
    for (const r of rows) {
      const cells = [r.at, `${String(r.commit).slice(0, 7)}${r.dirty ? "-dirty" : ""}`, r.appVersion, r.pass ? "pass" : "FAIL"];
      if (primary) { cells.push(fmt(r.values?.[primary])); if (head.includes("fullMs")) cells.push(fmt(r.values?.fullMs)); }
      else cells.push([...(r.failed ?? []), r.error ?? ""].filter(Boolean).join("; "));
      out.log(`| ${cells.join(" | ")} |`);
    }
  }

  const latestAt = shown[shown.length - 1].run.at;
  const present = Object.fromEntries(Object.entries(rowsByKey).filter(([, rows]) => rows[rows.length - 1].at === latestAt));
  const verdicts = judge(present, primary);
  out.log("");
  const flagged = [];
  for (const key of Object.keys(rowsByKey)) if (!(key in present)) { out.log(`MISSING IN LATEST: ${key}`); flagged.push(`MISSING IN LATEST ${key}`); }
  for (const v of verdicts) {
    for (const f of v.flags) { out.log(`${f}: ${v.key}`); flagged.push(`${f} ${v.key}`); }
    for (const n of v.notes) out.log(`${n}: ${v.key}`);
  }
  const notJudged = verdicts.filter((v) => v.notes.includes("too few runs to judge")).length;
  if (flagged.length) out.log(`${id}: ${flagged.length} flag(s): ${flagged.join("; ")}${notJudged ? `; not judged: ${notJudged} key(s)` : ""}`);
  else if (notJudged) out.log(`${id}: not judged for ${notJudged} key(s) (too few runs: need ${MIN_EARLIER} earlier readings); no flags otherwise (latest ${latestAt})`);
  else out.log(`${id}: no flags (latest ${latestAt}, compared with ${shown.length - 1} earlier runs)`);
  return flagged.length ? 1 : notJudged ? 3 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2), process.env);
