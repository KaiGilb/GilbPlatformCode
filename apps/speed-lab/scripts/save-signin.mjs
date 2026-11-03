// Saves a signed-in browser state for run-app. The file is a credential: mode 600, never inside a git work tree, and never printed (counts only).
// node scripts/save-signin.mjs --url <app url> --out <file.json> [--key __speedMeter] [--page <name>] [--engine chromium|webkit] [--timeout <ms>]
import { chmodSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright-core";

const BROWSERS = { chromium, webkit };
const FLAGS = {
  "--url": "url",
  "--out": "out",
  "--key": "key",
  "--page": "page",
  "--engine": "engine",
  "--timeout": "timeout",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function whyOf(e) {
  const line = String(e?.message ?? e).split("\n")[0].trim();
  if (!line || line.length > 240 || line.includes("\"value\"")) return "failed";
  return line;
}

function requireHttp(raw) {
  let u;
  try { u = new URL(String(raw)); }
  catch { throw new Error("--url must be http or https"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("--url must be http or https");
  return String(raw);
}

/** True when a parent of `filePath` contains a `.git` file or directory. The file itself need not exist. */
export function insideGitTree(filePath) {
  let dir = dirname(resolve(String(filePath)));
  for (;;) {
    if (existsSync(join(dir, ".git"))) return true;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

function destinationRefusal(out) {
  if (typeof out !== "string" || !out.endsWith(".json")) return "--out must end in .json";
  if (insideGitTree(out)) return "--out is inside a git work tree";
  if (!existsSync(out)) return null;
  let mode;
  try { mode = statSync(out).mode & 0o777; }
  catch { return "existing file is readable by others; remove it first"; }
  if (mode !== 0o600) return "existing file is readable by others; remove it first";
  return null;
}

/** Defaults: engine chromium, key __speedMeter, timeout 600000, page null. Throws on a bad argument. Does not touch the disk. */
export function parseArgs(argv) {
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
  const url = requireHttp(got.url);
  if (!got.out) throw new Error("--out is required");
  if (!String(got.out).endsWith(".json")) throw new Error("--out must end in .json");
  const key = got.key ?? "__speedMeter";
  if (!key) throw new Error("--key needs a value");
  if (got.page !== undefined && got.page === "") throw new Error("--page needs a value");
  const engine = got.engine ?? "chromium";
  if (engine !== "chromium" && engine !== "webkit") throw new Error("--engine must be chromium or webkit");
  let timeout = 600_000;
  if (got.timeout !== undefined) {
    if (!/^\d+$/.test(String(got.timeout))) throw new Error("--timeout needs a whole number of milliseconds");
    timeout = Number(got.timeout);
  }
  return { url, out: String(got.out), key, page: got.page ?? null, engine, timeout };
}

function closedError(e) {
  return /has been closed|Target closed/i.test(String(e?.message ?? e));
}

async function untilPaint(page, key, pageName, timeout) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (page.isClosed()) return { ok: false, why: "the browser window was closed" };
    try {
      const ok = await page.evaluate(({ key, pageName }) => {
        const paint = window[key]?.lastPaint;
        if (paint == null) return false;
        if (pageName != null && paint.page !== pageName) return false;
        return true;
      }, { key, pageName });
      if (ok) return { ok: true };
    } catch (e) {
      if (page.isClosed() || closedError(e)) return { ok: false, why: "the browser window was closed" };
    }
    const left = deadline - Date.now();
    if (left <= 0) return { ok: false, why: `timed out after ${timeout / 1000} s` };
    await sleep(Math.min(1000, left));
  }
}

/**
 * Open one browser, wait until window[key].lastPaint is set (and its page matches, when given), and write the storage state.
 * The CLI passes headless: false. Returns { code } (0 saved, 1 not saved, 2 refused). Never prints the state.
 */
export async function saveSignin(opts) {
  const url = opts?.url;
  const out = opts?.out;
  const key = opts?.key ?? "__speedMeter";
  const pageName = opts?.page ?? null;
  const engine = opts?.engine ?? "chromium";
  const timeout = opts?.timeout ?? 600_000;
  const headless = opts?.headless === true;
  const onReady = opts?.onReady;

  const refusal = destinationRefusal(out);
  if (refusal) {
    console.error(refusal);
    return { code: 2 };
  }
  if (engine !== "chromium" && engine !== "webkit") {
    console.error("--engine must be chromium or webkit");
    return { code: 2 };
  }
  try { requireHttp(url); }
  catch (e) {
    console.error(whyOf(e));
    return { code: 2 };
  }
  if (!key) {
    console.error("--key needs a value");
    return { code: 2 };
  }

  let browser;
  try {
    browser = await BROWSERS[engine].launch({ headless });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    ctx.setDefaultTimeout(timeout);
    const page = await ctx.newPage();
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);
    await page.goto(url, { waitUntil: "load", timeout });
    console.log(`A browser window is open at ${url}. Sign in there, then open the page to be measured.`);
    const where = pageName == null ? "" : ` on page ${JSON.stringify(pageName)}`;
    console.log(`Waiting until window.${key} reports a first paint${where} (up to ${timeout / 1000} s).`);
    if (onReady) await onReady(page);
    const found = await untilPaint(page, key, pageName, timeout);
    if (!found.ok) {
      console.log(`not saved: ${found.why}`);
      return { code: 1 };
    }
    const again = destinationRefusal(out);
    if (again) {
      console.error(again);
      return { code: 2 };
    }
    const state = await ctx.storageState({ indexedDB: true });
    const cookies = Array.isArray(state?.cookies) ? state.cookies.length : 0;
    const origins = Array.isArray(state?.origins) ? state.origins.length : 0;
    if (!Array.isArray(state?.cookies) || !Array.isArray(state?.origins)) {
      console.log("not saved: could not store the session");
      return { code: 1 };
    }
    const json = JSON.stringify(state);
    mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
    writeFileSync(out, json, { mode: 0o600 });
    chmodSync(out, 0o600);
    console.log(`saved: ${out} (${cookies} cookies, ${origins} origins with storage; content not shown)`);
    return { code: 0, cookies, origins };
  } catch (e) {
    if (closedError(e)) console.log("not saved: the browser window was closed");
    else console.log(`not saved: ${whyOf(e)}`);
    return { code: 1 };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function main() {
  let parsed;
  try { parsed = parseArgs(process.argv.slice(2)); }
  catch (e) {
    console.error(whyOf(e));
    process.exitCode = 2;
    return;
  }
  const { code } = await saveSignin({
    url: parsed.url,
    out: parsed.out,
    key: parsed.key,
    page: parsed.page,
    engine: parsed.engine,
    timeout: parsed.timeout,
    headless: false,
  });
  process.exitCode = code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(whyOf(e));
    process.exitCode = 1;
  });
}
