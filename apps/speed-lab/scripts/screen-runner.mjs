// Times a screen in Chromium until every row on the first screen has its text and its picture.
// With --done-text, it also waits until the page's own text matches that regular expression.
// The done rule lives in screen-core.mjs (settle). The probe below is the same rule, checked every frame.
// --override answers the app's files from a local folder. Everything else still goes to the network.
// node scripts/screen-runner.mjs --url <app url> --app <name> --rows <css> --network <label> [options]
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright-core";
import { checkStorageStateFile, commitFromVersionJson, validAppName } from "./app-runner.mjs";
import { appVersion, gitMeta, runsDir } from "./results.mjs";
import { cacheControlOf, compileDoneText, contentTypeOf, overridePath, parseOverride, parseScreenSteps, redactUrl, selectorOf, spaFallback, summarise } from "./screen-core.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = 'usage: node scripts/screen-runner.mjs --url <app url> --app <name> --rows <css> --network <label> [--face <css>] [--storage-state <file.json>] [--open-steps "<step>;<step>"] [--away-steps "<step>;..."] [--back-steps "<step>;..."] [--entries cold,hard,refresh,return] [--repeat <n>] [--quiet <ms>] [--min-rows <n>] [--done-text <regexp>] [--timeout <ms>] [--away-wait <ms>] [--profile desktop|phone] [--commit <sha> | --version-url <url>] [--override "<prefix>=<dir>"] [--runs <dir>] [--no-shots] [--headed]';
const ENTRIES = ["cold", "hard", "refresh", "return"];
const CLICKS = new Set(["click", "click-css", "click-label"]);
const FLAGS = {
  "--url": "url",
  "--app": "app",
  "--rows": "rows",
  "--network": "network",
  "--face": "face",
  "--storage-state": "storageState",
  "--open-steps": "openSteps",
  "--away-steps": "awaySteps",
  "--back-steps": "backSteps",
  "--entries": "entries",
  "--repeat": "repeat",
  "--quiet": "quiet",
  "--min-rows": "minRows",
  "--done-text": "doneText",
  "--timeout": "timeout",
  "--away-wait": "awayWait",
  "--profile": "profile",
  "--commit": "commit",
  "--version-url": "versionUrl",
  "--runs": "runs",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round1 = (n) => Math.round(n * 10) / 10;

function stampOf(iso) {
  return iso.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function shortCommit(commit) {
  if (typeof commit !== "string" || commit === "" || commit === "unknown") return "unknown";
  return commit.slice(0, 7);
}

function fmt(n) {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(1) : "-";
}

function parseWhole(raw, flag) {
  if (!/^\d+$/.test(String(raw))) throw new Error(`--${flag} needs a whole number`);
  return Number(raw);
}

function parseHttp(raw, flag) {
  let u;
  try { u = new URL(raw); } catch { throw new Error(`--${flag} is not a url`); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`--${flag} must be http or https`);
  return raw;
}

function parseEntries(raw) {
  const items = String(raw).split(",").map((s) => s.trim()).filter((s) => s !== "");
  if (!items.length || items.some((x) => !ENTRIES.includes(x))) throw new Error(`--entries must be a comma-separated list of: ${ENTRIES.join(", ")}`);
  return items;
}

// Installed at document start of every document. No Node values: arm() receives the settings later.
export function installScreenProbe() {
  const state = {
    armed: false,
    done: false,
    startMs: 0,
    doneAt: null,
    firstRowAt: null,
    allTextAt: null,
    lastFaceAt: null,
    doneTextAt: null,
    counts: { rows: 0, painted: 0, none: 0, broken: 0 },
    totalRowsInDom: 0,
    firstRowText: null,
    fault: null,
  };
  let rowsSel = "";
  let faceSel = "img";
  let quietMs = 0;
  let minRows = 1;
  let doneTextRe = null;
  let lastSig = null;
  let lastChange = null;
  let changeText = null;
  let prevAllText = false;
  let prevPainted = new Map();
  let timeline = [];
  let raf = 0;
  let gen = 0;

  function findVisible(selector) {
    const nodes = document.querySelectorAll(selector);
    for (const el of nodes) {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth) return el;
    }
    return null;
  }

  function signature(rows, textOk) {
    const parts = [];
    for (const r of rows) parts.push([r.key, r.text === true, r.face, r.sig]);
    return JSON.stringify([textOk, parts]);
  }

  function bodyMatches() {
    if (!doneTextRe) return true;
    const text = document.body ? document.body.innerText : "";
    return doneTextRe.test(text);
  }

  function tally(rows) {
    let painted = 0;
    let none = 0;
    let broken = 0;
    for (const r of rows) {
      if (r.face === "painted") painted++;
      else if (r.face === "none") none++;
      else if (r.face === "broken") broken++;
    }
    return { rows: rows.length, painted, none, broken };
  }

  function collect() {
    const all = document.querySelectorAll(rowsSel);
    state.totalRowsInDom = all.length;
    const rows = [];
    let firstRowText = null;
    let seen = 0;
    for (const el of all) {
      const rect = el.getBoundingClientRect();
      const inView = rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0;
      if (!inView) continue;
      const raw = el.innerText.trim();
      if (firstRowText === null) firstRowText = raw.slice(0, 40);
      const record = el.getAttribute("data-record-id");
      const testid = el.getAttribute("data-testid");
      const key = record != null && record !== "" ? record : testid != null && testid !== "" ? testid : String(seen);
      seen += 1;
      const text = raw.length > 0;
      const img = el.querySelector(faceSel);
      let face = "none";
      let sig = "";
      if (img) {
        sig = img.currentSrc.length + ":" + img.currentSrc.slice(-24);
        if (img.complete && img.naturalWidth > 0) face = "painted";
        else if (img.complete && img.naturalWidth === 0) face = "broken";
        else face = "loading";
      }
      rows.push({ key, text, face, sig });
    }
    return { rows, firstRowText };
  }

  function arm(cfg) {
    const token = ++gen;
    if (raf) window.cancelAnimationFrame(raf);
    rowsSel = cfg.rowsSel;
    faceSel = cfg.faceSel;
    quietMs = cfg.quietMs;
    minRows = cfg.minRows;
    doneTextRe = null;
    lastSig = null;
    lastChange = null;
    changeText = null;
    prevAllText = false;
    prevPainted = new Map();
    timeline = [];
    state.armed = true;
    state.done = false;
    state.startMs = cfg.startMs;
    state.doneAt = null;
    state.firstRowAt = null;
    state.allTextAt = null;
    state.lastFaceAt = null;
    state.doneTextAt = null;
    state.counts = { rows: 0, painted: 0, none: 0, broken: 0 };
    state.totalRowsInDom = 0;
    state.firstRowText = null;
    state.fault = null;
    if (typeof cfg.doneText === "string") {
      try { doneTextRe = new RegExp(cfg.doneText); }
      catch (e) {
        state.fault = "done-text: " + String(e && e.message ? e.message : e);
        return;
      }
    }

    const frame = () => {
      if (token !== gen) return;
      try {
        const now = window.performance.now();
        const got = collect();
        const rows = got.rows;
        state.counts = tally(rows);
        state.firstRowText = got.firstRowText;
        const textOk = bodyMatches();
        if (doneTextRe && textOk && state.doneTextAt === null) state.doneTextAt = now;
        const sig = signature(rows, textOk);
        if (sig !== lastSig) {
          lastSig = sig;
          lastChange = now;
          changeText = got.firstRowText;
          if (state.firstRowAt === null && rows.some((r) => r.text === true)) state.firstRowAt = now;
          const textReady = rows.length >= minRows && rows.every((r) => r.text === true);
          if (textReady && !prevAllText) state.allTextAt = now;
          prevAllText = textReady;
          let became = false;
          const nextPainted = new Map();
          for (const r of rows) {
            if (r.face !== "painted") continue;
            const key = String(r.key);
            nextPainted.set(key, true);
            if (!prevPainted.has(key)) became = true;
          }
          if (became) state.lastFaceAt = now;
          prevPainted = nextPainted;
          timeline.push({ t: now, rows, textOk });
          if (timeline.length > 5000) timeline.shift();
        }
        const ready = textOk && rows.length >= minRows && rows.every((r) => r.text === true) && rows.every((r) => r.face !== "loading");
        if (ready && lastChange !== null && now >= lastChange + quietMs) {
          state.done = true;
          state.doneAt = lastChange;
          state.firstRowText = changeText;
          return;
        }
      } catch (e) {
        state.fault = String(e && e.message ? e.message : e);
        return;
      }
      if (token === gen) raf = window.requestAnimationFrame(frame);
    };
    raf = window.requestAnimationFrame(frame);
  }

  function read() {
    if (state.fault) throw new Error("screen probe: " + state.fault);
    return {
      armed: state.armed,
      done: state.done,
      startMs: state.startMs,
      doneAt: state.doneAt,
      firstRowAt: state.firstRowAt,
      allTextAt: state.allTextAt,
      lastFaceAt: state.lastFaceAt,
      doneTextAt: state.doneTextAt,
      counts: {
        rows: state.counts.rows,
        painted: state.counts.painted,
        none: state.counts.none,
        broken: state.counts.broken,
      },
      totalRowsInDom: state.totalRowsInDom,
      firstRowText: state.firstRowText,
    };
  }

  window.__screenProbe = { arm, read, findVisible };
}

function contextOptions(profile, storageState) {
  const { defaultBrowserType, ...phone } = devices["iPhone 13"];
  const opts = profile === "phone"
    ? { ...phone }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
  if (storageState) opts.storageState = storageState;
  return opts;
}

function attachNetwork(page) {
  const net = {
    active: false,
    wall0: 0,
    stopAt: Infinity,
    items: [],
    byReq: new Map(),
    pending: new Set(),
  };
  page.on("request", (req) => {
    if (!net.active) return;
    const now = Date.now();
    if (now > net.stopAt) return;
    let host = "(unparsable)";
    try { host = new URL(req.url()).host; } catch { /* unparsable */ }
    const rec = {
      url: redactUrl(req.url()),
      method: req.method(),
      type: req.resourceType(),
      status: null,
      startMs: round1(now - net.wall0),
      endMs: null,
      bytes: null,
      host,
      startWall: now,
      finished: false,
    };
    net.items.push(rec);
    net.byReq.set(req, rec);
  });
  page.on("requestfinished", (req) => {
    const rec = net.byReq.get(req);
    if (!rec || rec.finished) return;
    rec.finished = true;
    rec.endMs = round1(Date.now() - net.wall0);
    const p = (async () => {
      try {
        const res = await req.response();
        rec.status = res ? res.status() : null;
      } catch {
        rec.status = null;
      }
      try {
        const s = await req.sizes();
        const b = s.responseBodySize + s.responseHeadersSize;
        rec.bytes = Number.isFinite(b) && b >= 0 ? b : null;
      } catch {
        rec.bytes = null;
      }
    })();
    net.pending.add(p);
    p.finally(() => net.pending.delete(p));
  });
  page.on("requestfailed", (req) => {
    const rec = net.byReq.get(req);
    if (!rec || rec.finished) return;
    rec.status = "failed";
    rec.endMs = round1(Date.now() - net.wall0);
    rec.bytes = null;
    rec.finished = true;
  });
  return net;
}

function beginNet(net) {
  net.active = true;
  net.wall0 = Date.now();
  net.stopAt = Infinity;
  net.items = [];
  net.byReq = new Map();
  if (net.served) {
    net.served.n = 0;
    net.served.active = true;
  }
}

function markDone(net, doneWall) {
  const inflightAtDone = net.items.filter((r) => !r.finished && r.startWall <= doneWall).length;
  net.stopAt = doneWall + 500;
  return inflightAtDone;
}

async function drainNet(net, inflightAtDone) {
  const remain = net.stopAt - Date.now();
  if (remain > 0) await sleep(remain);
  net.active = false;
  if (net.served) net.served.active = false;
  await sleep(30);
  while (net.pending.size) await Promise.all([...net.pending]);
  const byHost = {};
  let bytes = 0;
  for (const r of net.items) {
    const slot = byHost[r.host] ?? { n: 0, bytes: 0 };
    slot.n += 1;
    if (typeof r.bytes === "number") {
      slot.bytes += r.bytes;
      bytes += r.bytes;
    }
    byHost[r.host] = slot;
  }
  const waterfall = net.items.map((r) => ({
    url: r.url,
    method: r.method,
    type: r.type,
    status: r.status,
    startMs: r.startMs,
    endMs: r.endMs,
    bytes: r.bytes,
  }));
  return { requests: net.items.length, bytes, byHost, inflightAtDone, waterfall };
}

function minus(at, start) {
  if (typeof at !== "number" || typeof start !== "number" || !Number.isFinite(at) || !Number.isFinite(start)) return null;
  return round1(at - start);
}

function resolveInside(rootDir, rel) {
  if (typeof rel !== "string" || rel.includes("\0")) return null;
  const root = resolve(rootDir);
  const full = resolve(root, rel);
  const fromRoot = relative(root, full);
  if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || fromRoot.split(sep).includes("..")) return null;
  return full;
}

function isFile(p) {
  try { return statSync(p).isFile(); }
  catch { return false; }
}

function noteServed(served) {
  if (served.active) served.n += 1;
}

async function fulfillPlain(route, status, body) {
  await route.fulfill({
    status,
    contentType: "text/plain; charset=utf-8",
    headers: { "cache-control": "no-cache" },
    body,
  });
}

async function fulfillFile(route, rel, full) {
  await route.fulfill({
    status: 200,
    contentType: contentTypeOf(rel),
    headers: { "cache-control": cacheControlOf(rel) },
    body: readFileSync(full),
  });
}

// A document with no file is the app shell. A picture or an API with no dot is not:
// it goes to the network, so the live site still answers it.
async function fulfillOverride(route, ov, served) {
  const decision = overridePath(ov.prefix, route.request().url());
  if (decision.kind === "outside") {
    await route.fallback();
    return;
  }
  if (decision.kind !== "file") {
    noteServed(served);
    await fulfillPlain(route, 400, "bad path");
    return;
  }
  const full = resolveInside(ov.dir, decision.rel);
  if (!full) {
    noteServed(served);
    await fulfillPlain(route, 400, "bad path");
    return;
  }
  if (isFile(full)) {
    noteServed(served);
    await fulfillFile(route, decision.rel, full);
    return;
  }
  if (spaFallback(decision.rel)) {
    if (route.request().resourceType() !== "document") {
      await route.fallback();
      return;
    }
    const index = resolveInside(ov.dir, "index.html");
    if (!index || !isFile(index)) {
      noteServed(served);
      await fulfillPlain(route, 404, "not found");
      return;
    }
    noteServed(served);
    await fulfillFile(route, "index.html", index);
    return;
  }
  noteServed(served);
  await fulfillPlain(route, 404, "not found");
}

async function openContext(browser, opt) {
  const opts = contextOptions(opt.profile, opt.storageState);
  if (opt.overrides.length) opts.serviceWorkers = "block";
  const ctx = await browser.newContext(opts);
  ctx.setDefaultTimeout(opt.timeoutMs);
  const served = { n: 0, active: false };
  const ordered = [...opt.overrides].sort((a, b) => a.prefix.length - b.prefix.length);
  for (const ov of ordered) {
    await ctx.route(`${ov.prefix}**`, (route) => fulfillOverride(route, ov, served));
  }
  await ctx.addInitScript(installScreenProbe);
  const page = await ctx.newPage();
  const net = attachNetwork(page);
  net.served = served;
  return { ctx, page, net };
}

async function arm(page, cfg) {
  let last = "screen probe is not installed";
  for (let i = 0; i < 50; i++) {
    try {
      const ok = await page.evaluate((c) => {
        if (!window.__screenProbe) return false;
        window.__screenProbe.arm(c);
        return true;
      }, cfg);
      if (ok) return;
    } catch (e) {
      last = String(e?.message ?? e).split("\n")[0];
    }
    await sleep(20);
  }
  throw new Error(last);
}

async function waitDone(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let reading = null;
  for (;;) {
    reading = await page.evaluate(() => {
      const p = window.__screenProbe;
      if (!p) return null;
      return p.read();
    });
    if (!reading) throw new Error("screen probe is not installed");
    if (reading.done) return { reading, timedOut: false, doneWall: Date.now() };
    if (Date.now() >= deadline) return { reading, timedOut: true, doneWall: Date.now() };
    await sleep(Math.min(100, Math.max(0, deadline - Date.now())));
  }
}

async function runSteps(page, steps, timeout) {
  for (const step of steps) {
    if (step.kind === "pause") {
      await sleep(Number(step.arg));
      continue;
    }
    const selector = selectorOf(step);
    if (step.kind === "wait" || step.kind === "wait-css") {
      await page.waitForSelector(selector, { state: "visible", timeout });
      continue;
    }
    if (step.kind === "click-label") {
      await page.waitForFunction((sel) => !!(window.__screenProbe && window.__screenProbe.findVisible(sel)), selector, { timeout });
      await page.evaluate((sel) => window.__screenProbe.findVisible(sel).click(), selector);
      continue;
    }
    await page.click(selector, { timeout });
  }
}

async function clickAtStart(page, step) {
  const selector = selectorOf(step);
  const t = await page.evaluate((sel) => {
    const el = window.__screenProbe && window.__screenProbe.findVisible(sel);
    if (!el) throw new Error("not found or not visible");
    const t = performance.now();
    el.click();
    return t;
  }, selector);
  if (typeof t !== "number" || !Number.isFinite(t)) throw new Error("back step did not return a start time");
  return t;
}

function runLine(run, repeat) {
  const c = run.counts ?? {};
  return `${run.entry} ${run.i}/${repeat}  done ${fmt(run.doneMs)} ms  first row ${fmt(run.firstRowMs)}  all text ${fmt(run.allTextMs)}  last face ${fmt(run.lastFaceMs)}  done-text ${fmt(run.doneTextMs)}  rows ${c.rows ?? "-"} (pictures ${c.painted ?? "-"}, none ${c.none ?? "-"}, broken ${c.broken ?? "-"})  requests ${run.requests}  override ${run.overrideServed}`;
}

function printTable(out, entries, summary, file) {
  const head = ["entry", "n", "median done", "slowest done", "median first row", "median all text"];
  const body = entries.map((e) => {
    const s = summary[e];
    return [e, String(s.doneMs.n), fmt(s.doneMs.median), fmt(s.doneMs.max), fmt(s.firstRowMs.median), fmt(s.allTextMs.median)];
  });
  const rows = [head, ...body];
  const width = head.map((_, c) => Math.max(...rows.map((r) => r[c].length)));
  for (const r of rows) out.log(r.map((cell, c) => cell.padEnd(width[c])).join("  "));
  out.log(`result file: ${file}`);
}

function checkedOverride(raw) {
  const parsed = parseOverride(raw);
  const dir = resolve(parsed.dir);
  let st;
  try { st = statSync(dir); }
  catch { throw new Error(`override folder does not exist: ${parsed.dir}`); }
  if (!st.isDirectory()) throw new Error(`override folder is not a folder: ${parsed.dir}`);
  const index = join(dir, "index.html");
  if (!existsSync(index) || !isFile(index)) throw new Error(`override folder has no index.html: ${parsed.dir}`);
  return { prefix: parsed.prefix, dir, dirName: basename(dir) };
}

function optionsFrom(argv) {
  const got = {};
  const bools = {};
  const overrideArgs = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-shots" || a === "--headed") {
      if (bools[a]) throw new Error(`${a} given twice`);
      bools[a] = true;
      continue;
    }
    if (a === "--override") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error("--override needs a value");
      overrideArgs.push(v);
      continue;
    }
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
  if (!validAppName(got.app)) throw new Error('--app must be a short name /^[a-z0-9][a-z0-9-]{0,39}$/ (a letter or digit, then up to 39 more of those or "-")');
  if (!got.rows || got.rows.trim() === "") throw new Error("--rows is required");
  if (got.network === undefined) throw new Error("--network is required");
  if (got.network.trim() === "" || got.network.length > 80) throw new Error("--network must be 1 to 80 characters");
  const face = got.face ?? "img";
  if (face.trim() === "") throw new Error("--face needs a value");
  const profile = got.profile ?? "desktop";
  if (profile !== "desktop" && profile !== "phone") throw new Error("--profile must be desktop or phone");
  const doneText = got.doneText === undefined ? null : compileDoneText(got.doneText);
  const entries = parseEntries(got.entries ?? "cold,hard,refresh,return");
  const openSteps = parseScreenSteps(got.openSteps ?? "");
  const awaySteps = got.awaySteps === undefined ? [] : parseScreenSteps(got.awaySteps);
  const backSteps = got.backSteps === undefined ? [] : parseScreenSteps(got.backSteps);
  if (entries.includes("return")) {
    if (!got.awaySteps || awaySteps.length === 0) throw new Error("return needs --away-steps");
    if (!got.backSteps || backSteps.length === 0) throw new Error("return needs --back-steps");
    if (!CLICKS.has(backSteps[0].kind)) throw new Error("the first back step must be a click");
  }
  const repeat = got.repeat === undefined ? 5 : parseWhole(got.repeat, "repeat");
  if (repeat < 1) throw new Error("--repeat must be at least 1");
  const quietMs = got.quiet === undefined ? 4000 : parseWhole(got.quiet, "quiet");
  const minRows = got.minRows === undefined ? 1 : parseWhole(got.minRows, "min-rows");
  const timeoutMs = got.timeout === undefined ? 60_000 : parseWhole(got.timeout, "timeout");
  const awayWait = got.awayWait === undefined ? 2500 : parseWhole(got.awayWait, "away-wait");
  if (got.commit !== undefined && got.versionUrl !== undefined) throw new Error("pass --commit or --version-url, not both");
  if (overrideArgs.length > 4) throw new Error("at most 4 overrides");
  const overrides = overrideArgs.map(checkedOverride);
  return {
    url: got.url,
    app: got.app,
    rows: got.rows,
    network: got.network,
    face,
    storageState: got.storageState,
    openSteps,
    awaySteps,
    backSteps,
    entries,
    repeat,
    quietMs,
    minRows,
    doneText,
    timeoutMs,
    awayWait,
    profile,
    commit: got.commit,
    versionUrl: got.versionUrl,
    overrides,
    runs: got.runs,
    noShots: bools["--no-shots"] === true,
    headed: bools["--headed"] === true,
  };
}

function readLocalVersion(overrides) {
  for (const ov of overrides) {
    const p = join(ov.dir, "version.json");
    if (!existsSync(p) || !isFile(p)) continue;
    let text;
    try { text = readFileSync(p, "utf8"); }
    catch { throw new Error(`local version.json could not be read (${ov.dirName})`); }
    let obj;
    try { obj = JSON.parse(text); }
    catch { throw new Error(`local version.json is not JSON (${ov.dirName})`); }
    return { commit: commitFromVersionJson(obj), dirName: ov.dirName };
  }
  return null;
}

async function commitOf(opt, out) {
  if (opt.commit !== undefined) return opt.commit;
  if (opt.overrides.length) {
    if (opt.versionUrl !== undefined) {
      parseHttp(opt.versionUrl, "version-url");
      const found = readLocalVersion(opt.overrides);
      if (found) {
        out.log(`commit: local version.json (${found.dirName}) ${found.commit}`);
        return found.commit;
      }
    }
    out.log("commit: local");
    return "local";
  }
  if (opt.versionUrl === undefined) return "unknown";
  const url = parseHttp(opt.versionUrl, "version-url");
  let res;
  try {
    res = await fetch(url, { credentials: "omit", redirect: "follow", signal: AbortSignal.timeout(Math.max(opt.timeoutMs, 1)) });
  } catch (e) {
    throw new Error(`version url could not be read: ${String(e?.message ?? e).split("\n")[0]}`);
  }
  let obj;
  try { obj = await res.json(); } catch { throw new Error("version url did not return JSON"); }
  return commitFromVersionJson(obj);
}

function armCfg(opt, startMs) {
  return { rowsSel: opt.rows, faceSel: opt.face, startMs, quietMs: opt.quietMs, minRows: opt.minRows, doneText: opt.doneText };
}

/** Runs the screen timer and writes one result file. Returns { code, runs, file, summary }. Does not exit the process. */
export async function main(argv, env = process.env, out = console) {
  let opt;
  try { opt = optionsFrom(argv); }
  catch (e) { out.error(`${USAGE}\n${String(e?.message ?? e).split("\n")[0]}`); return { code: 2, runs: [], file: null, summary: null }; }
  if (opt.storageState) {
    const problem = checkStorageStateFile(opt.storageState);
    if (problem) { out.error(problem); return { code: 2, runs: [], file: null, summary: null }; }
  }
  for (const ov of opt.overrides) out.log(`override: ${ov.prefix} ← local folder ${ov.dirName}`);
  let appCommit;
  try { appCommit = await commitOf(opt, out); }
  catch (e) { out.error(String(e?.message ?? e).split("\n")[0]); return { code: 2, runs: [], file: null, summary: null }; }

  const runs = [];
  let browser;
  let shared = null;
  try {
    browser = await chromium.launch({ headless: !opt.headed });
    const at = new Date().toISOString();
    const base = `${stampOf(at)}-${opt.app}-${shortCommit(appCommit)}-screen`;
    const dir = opt.runs ?? runsDir(env, APP);
    mkdirSync(dir, { recursive: true });
    const lab = gitMeta(APP);

    const record = async (page, net, entry, i, startMs) => {
      await page.bringToFront();
      await arm(page, armCfg(opt, startMs));
      const { reading, timedOut, doneWall } = await waitDone(page, opt.timeoutMs);
      const inflightAtDone = markDone(net, doneWall);
      let shot = null;
      if (!opt.noShots) {
        mkdirSync(join(dir, "shots"), { recursive: true });
        const name = `${base}-${entry}-${i}.png`;
        await page.screenshot({ path: join(dir, "shots", name) });
        shot = `shots/${name}`;
      }
      const netSummary = await drainNet(net, inflightAtDone);
      const run = {
        entry,
        i,
        timedOut,
        doneMs: minus(reading.doneAt, reading.startMs),
        firstRowMs: minus(reading.firstRowAt, reading.startMs),
        allTextMs: minus(reading.allTextAt, reading.startMs),
        lastFaceMs: minus(reading.lastFaceAt, reading.startMs),
        doneTextMs: minus(reading.doneTextAt, reading.startMs),
        firstRowText: typeof reading.firstRowText === "string" ? reading.firstRowText.slice(0, 40) : null,
        counts: reading.counts,
        totalRowsInDom: reading.totalRowsInDom,
        requests: netSummary.requests,
        overrideServed: net.served ? net.served.n : 0,
        bytes: netSummary.bytes,
        byHost: netSummary.byHost,
        inflightAtDone: netSummary.inflightAtDone,
        shot,
        waterfall: netSummary.waterfall,
      };
      runs.push(run);
      out.log(runLine(run, opt.repeat));
    };

    const warm = async (opened) => {
      await opened.page.bringToFront();
      await opened.page.goto(opt.url, { waitUntil: "commit", timeout: opt.timeoutMs });
      await runSteps(opened.page, opt.openSteps, opt.timeoutMs);
      await arm(opened.page, armCfg(opt, 0));
      const { reading } = await waitDone(opened.page, opt.timeoutMs);
      if (!reading.done) throw new Error("warm-up timed out");
    };

    const sharedPage = async () => {
      if (!shared) {
        shared = await openContext(browser, opt);
        await warm(shared);
      }
      return shared;
    };

    for (const entry of opt.entries) {
      for (let i = 1; i <= opt.repeat; i++) {
        if (entry === "cold") {
          const opened = await openContext(browser, opt);
          try {
            await opened.page.bringToFront();
            beginNet(opened.net);
            await opened.page.goto(opt.url, { waitUntil: "commit", timeout: opt.timeoutMs });
            await runSteps(opened.page, opt.openSteps, opt.timeoutMs);
            await record(opened.page, opened.net, entry, i, 0);
          } finally {
            await opened.ctx.close();
          }
          continue;
        }
        const opened = await sharedPage();
        if (entry === "hard") {
          const cdp = await opened.ctx.newCDPSession(opened.page);
          await cdp.send("Network.enable");
          await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
          await cdp.send("Network.setBypassServiceWorker", { bypass: true });
          let error;
          try {
            await opened.page.bringToFront();
            beginNet(opened.net);
            await opened.page.reload({ waitUntil: "commit", timeout: opt.timeoutMs });
            await record(opened.page, opened.net, entry, i, 0);
          } catch (e) {
            error = e;
          }
          await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
          await cdp.send("Network.setBypassServiceWorker", { bypass: false });
          if (error) throw error;
          continue;
        }
        if (entry === "refresh") {
          await opened.page.bringToFront();
          beginNet(opened.net);
          await opened.page.reload({ waitUntil: "commit", timeout: opt.timeoutMs });
          await record(opened.page, opened.net, entry, i, 0);
          continue;
        }
        await runSteps(opened.page, opt.awaySteps, opt.timeoutMs);
        await sleep(opt.awayWait);
        await opened.page.bringToFront();
        beginNet(opened.net);
        const t = await clickAtStart(opened.page, opt.backSteps[0]);
        await runSteps(opened.page, opt.backSteps.slice(1), opt.timeoutMs);
        await record(opened.page, opened.net, entry, i, t);
      }
    }

    const entryOrder = [];
    for (const e of opt.entries) if (!entryOrder.includes(e)) entryOrder.push(e);
    const summary = {};
    for (const entry of entryOrder) {
      const list = runs.filter((r) => r.entry === entry);
      summary[entry] = {
        doneMs: summarise(list.map((r) => r.doneMs)),
        firstRowMs: summarise(list.map((r) => r.firstRowMs)),
        allTextMs: summarise(list.map((r) => r.allTextMs)),
        lastFaceMs: summarise(list.map((r) => r.lastFaceMs)),
        timedOut: list.filter((r) => r.timedOut).length,
      };
    }
    const body = {
      schema: "speed-lab.screen/1",
      app: { name: opt.app, url: redactUrl(opt.url), commit: appCommit },
      run: {
        tool: "run-screen",
        at,
        speedLab: { commit: lab.commit, version: appVersion(APP) },
        chromium: browser.version(),
        profile: opt.profile,
        network: opt.network,
        platform: process.platform,
      },
      settings: {
        rows: opt.rows,
        face: opt.face,
        quietMs: opt.quietMs,
        minRows: opt.minRows,
        ...(opt.doneText != null ? { doneText: opt.doneText } : {}),
        repeat: opt.repeat,
        entries: opt.entries,
        timeoutMs: opt.timeoutMs,
        ...(opt.overrides.length ? { overrides: opt.overrides.map((o) => ({ prefix: o.prefix, dirName: o.dirName })) } : {}),
      },
      runs,
      summary,
    };
    const file = join(dir, `${base}.json`);
    const text = JSON.stringify(body, null, 2) + "\n";
    try {
      writeFileSync(file, text, { flag: "wx", mode: 0o644 });
    } catch (e) {
      if (e?.code === "EEXIST") throw new Error(`result file already exists, not overwritten: ${file}`);
      throw e;
    }
    chmodSync(file, 0o644);
    printTable(out, entryOrder, summary, file);
    const timed = runs.filter((r) => r.timedOut).length;
    if (timed) out.log(`WARNING ${timed} ${timed === 1 ? "run" : "runs"} timed out`);
    return { code: 0, runs, file, summary };
  } catch (e) {
    out.error(String(e?.stack ?? e));
    return { code: 1, runs, file: null, summary: null };
  } finally {
    if (shared) await shared.ctx.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2), process.env).then(
    ({ code }) => { process.exitCode = code; },
    (e) => { console.error(String(e?.stack ?? e)); process.exitCode = 1; },
  );
}
