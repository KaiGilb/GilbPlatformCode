// Result files: one file per test (SL-001 to SL-007) per run, written after `npm run proof:browser`.
// `compare.mjs` reads them. Node built-ins only; the pure functions are exported for the tests.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SCHEMA = "speed-lab.result/1";

const t = (id, title, primary, scenarios) => Object.freeze({ id, title, primary, scenarios: Object.freeze(scenarios) });
export const TESTS = Object.freeze({
  "SL-001": t("SL-001", "cold first visit: first row and full list from the network", "firstRowMs", [{ scenario: "B1 cold first visit", variant: null }]),
  "SL-002": t("SL-002", "back from an entry: rows from memory", "firstRowMs", [{ scenario: "B2 back from an entry", variant: null }]),
  "SL-003": t("SL-003", "reload: rows painted from the device before any records answer", "firstRowMs", [{ scenario: "B3 reload, from the device", variant: null }]),
  "SL-004": t("SL-004", "sign-out and Ben: nothing of Ann seen", null, [{ scenario: "B4 sign-out and Ben", variant: null }]),
  "SL-005": t("SL-005", "hover warms: pointing at the nav sends the request", null, [{ scenario: "B5 hover warms", variant: null }]),
  "SL-006": t("SL-006", "tab closed without sign-out: nothing of Ann left", null, [{ scenario: "B6 tab closed without sign-out", variant: null }]),
  "SL-007": t("SL-007", "slow disk: a late device copy still paints, labelled `device`", "firstRowMs", [
    { scenario: "B7 slow disk, held 0 ms", variant: "held 0 ms" },
    { scenario: "B7 slow disk, held 600 ms", variant: "held 600 ms" },
    { scenario: "B7 slow disk setup", variant: "setup" },
  ]),
});

/** scenario string of the proof -> { id, variant }, or null when unknown. */
export function testOf(scenario) {
  for (const def of Object.values(TESTS)) {
    const hit = def.scenarios.find((s) => s.scenario === scenario);
    if (hit) return { id: def.id, variant: hit.variant };
  }
  return null;
}

const stamp = (iso) => iso.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

function conditionOf(base) {
  let entries = null;
  let latencyMs = null;
  try {
    const q = new URL(base).searchParams;
    const num = (k) => { const v = q.get(k); return v !== null && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null; };
    entries = num("entries");
    latencyMs = num("latency");
  } catch { /* not a URL: both stay null */ }
  return { browser: "REAL", vault: "MOCK", base, entries, latencyMs };
}

/** proof = { ts, base, rows }; meta = { commit, dirty, appVersion, at }. */
export function toResults(proof, meta) {
  const byId = new Map();
  const unmapped = [];
  for (const r of proof.rows) {
    const m = testOf(r.scenario);
    if (!m) { if (!unmapped.includes(r.scenario)) unmapped.push(r.scenario); continue; }
    if (!byId.has(m.id)) byId.set(m.id, []);
    byId.get(m.id).push({ engine: r.engine, profile: r.profile, variant: m.variant, pass: r.pass, values: r.values, failed: r.failed, error: r.error ?? null });
  }
  const files = [];
  for (const id of Object.keys(TESTS)) {
    const rows = byId.get(id);
    if (!rows) continue;
    const def = TESTS[id];
    const body = {
      schema: SCHEMA,
      test: id,
      title: def.title,
      primary: def.primary,
      run: { at: meta.at, commit: meta.commit, dirty: meta.dirty, appVersion: meta.appVersion, tool: "proof:browser" },
      condition: conditionOf(proof.base),
      rows,
      pass: rows.every((r) => r.pass === true),
    };
    const name = `${stamp(meta.at)}-${String(meta.commit).slice(0, 7)}${meta.dirty ? "-dirty" : ""}-${id}.json`;
    files.push({ name, body });
  }
  return { files, unmapped };
}

/** Writes each file with flag "wx": an existing name is an error naming the path. Returns the paths written. */
export function writeResults(dir, files) {
  mkdirSync(dir, { recursive: true });
  const paths = [];
  for (const f of files) {
    const p = join(dir, f.name);
    try {
      writeFileSync(p, JSON.stringify(f.body, null, 2) + "\n", { flag: "wx" });
    } catch (e) {
      throw new Error(e?.code === "EEXIST" ? `result file already exists, not overwritten: ${p}` : `cannot write ${p}: ${e?.message ?? e}`);
    }
    paths.push(p);
  }
  return paths;
}

export function runsDir(env, appDir) {
  return env.SPEED_LAB_RUNS ? env.SPEED_LAB_RUNS : join(appDir, "runs");
}

/** commit and dirty from git; when git fails: "unknown" and null (never an invented SHA). */
export function gitMeta(appDir) {
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: appDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: appDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() !== "";
    if (!commit) throw new Error("empty");
    return { commit, dirty };
  } catch {
    return { commit: "unknown", dirty: null };
  }
}

export function appVersion(appDir) {
  return JSON.parse(readFileSync(join(appDir, "package.json"), "utf8")).version;
}

/** The ISO time of a proof's `ts` (YYYYMMDDTHHMMSSZ), the run's start. */
export function isoOfTs(ts) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(ts);
  if (!m) throw new Error(`proof ts is not YYYYMMDDTHHMMSSZ: ${ts}`);
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`;
}

export function main(argv, env, out = console) {
  const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  let from = null;
  let commit = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from" && argv[i + 1]) from = argv[++i];
    else if (argv[i] === "--commit" && argv[i + 1]) commit = argv[++i];
    else { out.error(`usage: node scripts/results.mjs --from <results-<ts>.json> [--commit <sha>]\nunknown or incomplete argument: ${argv[i]}`); return 2; }
  }
  if (!from) { out.error("usage: node scripts/results.mjs --from <results-<ts>.json> [--commit <sha>]"); return 2; }
  try {
    if (!existsSync(from)) throw new Error(`no such file: ${from}`);
    const proof = JSON.parse(readFileSync(from, "utf8"));
    const g = commit ? { commit, dirty: null } : gitMeta(APP);
    const { files, unmapped } = toResults(proof, { commit: g.commit, dirty: g.dirty, appVersion: appVersion(APP), at: isoOfTs(proof.ts) });
    for (const p of writeResults(runsDir(env, APP), files)) out.log(p);
    if (unmapped.length) out.log(`unmapped: ${unmapped.join("; ")}`);
    return 0;
  } catch (e) {
    out.error(String(e?.message ?? e));
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2), process.env);
