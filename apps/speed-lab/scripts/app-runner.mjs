// Drives any app in real Chromium and WebKit and records what its speed meter reports.
// SL-101 is the first open. SL-102 is the same reading after a reload. The checks are generic: the runner records, compare judges.
// node scripts/app-runner.mjs --url <app url> --app <name> [options]
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices, webkit } from "playwright-core";
import { appVersion, gitMeta, runsDir, toAppResults, writeResults } from "./results.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = "usage: node scripts/app-runner.mjs --url <app url> --app <name> [--key <globalKey>] [--page <name>] [--steps <step>,<step>] [--reload-steps <step>,...] [--engines chromium,webkit] [--profiles desktop,phone] [--storage-state <file.json>] [--commit <sha> | --version-url <url>] [--runs <dir>] [--timeout <ms>] [--settle <ms>]";
const APP_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SOURCES = ["memory", "device", "preview", "network"];
const ENGINES = ["chromium", "webkit"];
const PROFILES = ["desktop", "phone"];
const BROWSERS = { chromium, webkit };
const FLAGS = {
  "--url": "url",
  "--app": "app",
  "--key": "key",
  "--page": "page",
  "--steps": "steps",
  "--reload-steps": "reloadSteps",
  "--engines": "engines",
  "--profiles": "profiles",
  "--storage-state": "storageState",
  "--commit": "commit",
  "--version-url": "versionUrl",
  "--runs": "runs",
  "--timeout": "timeout",
  "--settle": "settle",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function validAppName(name) {
  return typeof name === "string" && APP_NAME.test(name);
}

/** "click:id, wait:id" -> [{ kind, testid }]. Empty string -> []. An unknown kind throws. */
export function parseSteps(str) {
  const parts = String(str ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "");
  return parts.map((part) => {
    const i = part.indexOf(":");
    const kind = i === -1 ? part : part.slice(0, i).trim();
    const testid = i === -1 ? "" : part.slice(i + 1).trim();
    if (kind !== "click" && kind !== "wait") throw new Error(`unknown step kind: ${kind || part}`);
    if (!testid) throw new Error(`step ${kind} needs a data-testid`);
    return { kind, testid };
  });
}

/** First string among revision, commit, sha, gitSha. Anything else is "unknown". Never invents a sha. */
export function commitFromVersionJson(obj) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return "unknown";
  for (const k of ["revision", "commit", "sha", "gitSha"]) {
    const v = obj[k];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return "unknown";
}

function parseList(raw, allowed, flag) {
  const items = String(raw).split(",").map((s) => s.trim()).filter((s) => s !== "");
  if (!items.length || items.some((x) => !allowed.includes(x))) throw new Error(`--${flag} must be a comma-separated list of: ${allowed.join(", ")}`);
  return items;
}

function parseMs(raw, flag) {
  if (!/^\d+$/.test(String(raw))) throw new Error(`--${flag} needs a whole number of milliseconds`);
  return Number(raw);
}

function parseHttp(raw, flag) {
  let u;
  try { u = new URL(raw); } catch { throw new Error(`--${flag} is not a url`); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`--${flag} must be http or https`);
  return raw;
}

function sel(id) {
  return `[data-testid="${String(id).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
}

function isTimeout(e) {
  return e?.name === "TimeoutError" || /Timeout/i.test(String(e?.message ?? ""));
}

// Same desktop and phone setup as browser-proof.mjs, including the Chromium phone throttle. One context, one page, for both tests.
async function openContext(browser, engine, profile, storageState, timeout) {
  const { defaultBrowserType, ...phone } = devices["iPhone 13"];
  const opts = profile === "phone" ? { ...phone } : { viewport: { width: 1280, height: 800 } };
  if (storageState) opts.storageState = storageState;
  const ctx = await browser.newContext(opts);
  ctx.setDefaultTimeout(timeout);
  const page = await ctx.newPage();
  if (engine === "chromium" && profile === "phone") {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: (1.6 * 1e6) / 8, uploadThroughput: (0.75 * 1e6) / 8 });
  }
  return { ctx, page };
}

async function readSnap(page, key) {
  return page.evaluate((key) => {
    const m = window[key];
    if (m == null) return { missing: true };
    const paint = m.lastPaint ?? null;
    let requestsTotal = 0;
    const requests = m.requests;
    if (requests && typeof requests === "object") {
      for (const v of Object.values(requests)) if (typeof v === "number" && Number.isFinite(v)) requestsTotal += v;
    }
    return {
      missing: false,
      hasPaint: paint != null,
      firstRowMs: paint && typeof paint.ms === "number" ? paint.ms : null,
      fullMs: paint && typeof paint.fullMs === "number" && Number.isFinite(paint.fullMs) ? paint.fullMs : null,
      source: paint ? (paint.source ?? null) : null,
      page: paint ? (paint.page ?? null) : null,
      requestsTotal,
      writes: Array.isArray(m.writes) ? m.writes.length : 0,
    };
  }, key);
}

function judged(snap, key, pageName) {
  if (snap.missing) return { values: {}, failed: [`meter found at window.${key}`], pass: false, error: null };
  const pageOk = pageName == null || snap.page === pageName;
  const values = {
    firstRowMs: snap.firstRowMs,
    fullMs: snap.fullMs,
    source: snap.source,
    page: snap.page,
    requestsTotal: snap.requestsTotal,
    writes: snap.writes,
  };
  const checks = [
    [`meter found at window.${key}`, true],
    ["lastPaint present", snap.hasPaint === true && pageOk],
    ["source is one of memory, device, preview, network", SOURCES.includes(snap.source)],
    ["firstRowMs is a finite number >= 0", typeof snap.firstRowMs === "number" && Number.isFinite(snap.firstRowMs) && snap.firstRowMs >= 0],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  return { values, failed, pass: failed.length === 0, error: null };
}

async function runSteps(page, steps, timeout) {
  for (const step of steps) {
    const target = sel(step.testid);
    if (step.kind === "click") await page.click(target, { timeout });
    else await page.waitForSelector(target, { state: "visible", timeout });
  }
}

async function waitPaint(page, key, pageName, timeout) {
  await page.waitForFunction(({ key, pageName }) => {
    const p = window[key]?.lastPaint;
    if (!p) return false;
    if (pageName != null && p.page !== pageName) return false;
    return true;
  }, { key, pageName }, { timeout });
}

async function waitFull(page, key, pageName, timeout) {
  await page.waitForFunction(({ key, pageName }) => {
    const p = window[key]?.lastPaint;
    if (!p || p.fullMs === undefined) return false;
    if (pageName != null && p.page !== pageName) return false;
    return true;
  }, { key, pageName }, { timeout });
}

/** Open, or reload, then steps, then the meter's lastPaint. fullMs may stay null. */
async function measure(page, { url, reload, key, pageName, steps, timeout }) {
  if (reload) await page.reload({ waitUntil: "load", timeout });
  else await page.goto(url, { waitUntil: "load", timeout });
  await runSteps(page, steps, timeout);
  let painted = false;
  try {
    await waitPaint(page, key, pageName, timeout);
    painted = true;
  } catch (e) {
    const snap = await readSnap(page, key).catch(() => ({ missing: true }));
    if (snap.missing) return { values: {}, failed: [`meter found at window.${key}`], pass: false, error: null };
    if (!isTimeout(e)) throw e;
    painted = snap.hasPaint === true && (pageName == null || snap.page === pageName);
  }
  if (painted) await waitFull(page, key, pageName, timeout).catch((e) => { if (!isTimeout(e)) throw e; });
  return judged(await readSnap(page, key), key, pageName);
}

function line(row) {
  return `${row.pass ? "PASS" : "FAIL"} ${row.engine}/${row.profile}/${row.test} ${JSON.stringify(row.values)}${row.failed.length ? " failed: " + row.failed.join("; ") : ""}${row.error ? " error: " + row.error : ""}`;
}

async function commitOf(got, timeout) {
  if (got.commit !== undefined && got.versionUrl !== undefined) throw new Error("pass --commit or --version-url, not both");
  if (got.commit !== undefined) return got.commit;
  if (got.versionUrl === undefined) return "unknown";
  const url = parseHttp(got.versionUrl, "version-url");
  let res;
  try {
    res = await fetch(url, { credentials: "omit", redirect: "follow", signal: AbortSignal.timeout(Math.max(timeout, 1)) });
  } catch (e) {
    throw new Error(`version url could not be read: ${String(e?.message ?? e).split("\n")[0]}`);
  }
  let obj;
  try { obj = await res.json(); } catch { throw new Error("version url did not return JSON"); }
  return commitFromVersionJson(obj);
}

function optionsFrom(argv) {
  const got = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const slot = FLAGS[a];
    if (!slot) throw new Error(`unknown argument: ${a}`);
    const v = argv[++i];
    if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
    if (got[slot] !== undefined) throw new Error(`${a} given twice`);
    got[slot] = v;
  }
  if (!got.url) throw new Error("--url is required");
  parseHttp(got.url, "url");
  if (!got.app) throw new Error("--app is required");
  if (!validAppName(got.app)) throw new Error(`--app must be a short name ${APP_NAME} (a letter or digit, then up to 39 more of those or "-"): ${JSON.stringify(got.app)}`);
  const key = got.key ?? "__speedMeter";
  if (!key) throw new Error("--key needs a value");
  const steps = parseSteps(got.steps ?? "");
  const reloadSteps = got.reloadSteps === undefined ? steps : parseSteps(got.reloadSteps);
  const engines = parseList(got.engines ?? "chromium,webkit", ENGINES, "engines");
  const profiles = parseList(got.profiles ?? "desktop,phone", PROFILES, "profiles");
  const timeout = got.timeout === undefined ? 60_000 : parseMs(got.timeout, "timeout");
  const settle = got.settle === undefined ? 1500 : parseMs(got.settle, "settle");
  return { got, key, pageName: got.page ?? null, steps, reloadSteps, engines, profiles, timeout, settle };
}

/** Runs the browsers and writes the two result files. Returns { code, rows }. Does not exit the process. */
export async function main(argv, env = process.env, out = console) {
  let opt;
  try { opt = optionsFrom(argv); }
  catch (e) { out.error(`${USAGE}\n${String(e?.message ?? e).split("\n")[0]}`); return { code: 2, rows: [] }; }
  const { got, key, pageName, steps, reloadSteps, engines, profiles, timeout, settle } = opt;
  if (got.storageState && !existsSync(got.storageState)) {
    out.error(`storage state file not found: ${got.storageState}`);
    return { code: 2, rows: [] };
  }
  let appCommit;
  try { appCommit = await commitOf(got, timeout); }
  catch (e) { out.error(String(e?.message ?? e).split("\n")[0]); return { code: 2, rows: [] }; }

  const rows = [];
  const scenario = async (engine, profile, test, fn) => {
    const row = { test, engine, profile, pass: false, values: {}, failed: [], error: null };
    rows.push(row);
    try {
      const gotRow = await fn();
      row.values = gotRow.values;
      row.failed = gotRow.failed;
      row.pass = gotRow.pass;
      row.error = gotRow.error ?? null;
    } catch (e) {
      row.error = String(e?.message ?? e).split("\n")[0];
      row.failed = ["error"];
      row.pass = false;
    }
    out.log(line(row));
    return row;
  };

  let runError = null;
  try {
    for (const engine of engines) {
      const browser = await BROWSERS[engine].launch();
      try {
        out.log(`${engine} ${browser.version()}`);
        for (const profile of profiles) {
          const opened = await openContext(browser, engine, profile, got.storageState, timeout);
          try {
            await scenario(engine, profile, "SL-101", () => measure(opened.page, { url: got.url, reload: false, key, pageName, steps, timeout }));
            await sleep(settle); // the device copy is written on its own timer; SL-102 reloads this same page
            await scenario(engine, profile, "SL-102", () => measure(opened.page, { url: got.url, reload: true, key, pageName, steps: reloadSteps, timeout }));
          } finally {
            await opened.ctx.close();
          }
        }
      } finally {
        await browser.close();
      }
    }
  } catch (e) {
    runError = e;
    out.error(String(e?.message ?? e).split("\n")[0]);
  }

  const dir = got.runs ?? runsDir(env, APP);
  let writeOk = true;
  if (rows.length) {
    try {
      const at = new Date().toISOString();
      const { files } = toAppResults(rows, {
        app: { name: got.app, url: got.url, commit: appCommit },
        at,
        runner: { ...gitMeta(APP), appVersion: appVersion(APP) },
      });
      writeResults(dir, files);
      out.log(`result files: ${files.length} in ${dir}`);
    } catch (e) {
      writeOk = false;
      out.log(`result files NOT written: ${e?.message ?? e}`);
    }
  }
  const passed = rows.length > 0 && rows.every((r) => r.pass === true);
  const code = runError || !writeOk || !passed ? 1 : 0;
  return { code, rows };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2), process.env).then(
    ({ code }) => { process.exitCode = code; },
    (e) => { console.error(String(e?.stack ?? e)); process.exitCode = 1; },
  );
}
