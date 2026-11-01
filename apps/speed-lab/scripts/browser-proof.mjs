// Runs the built app in real Chromium and WebKit (playwright-core, browsers already on the machine, nothing downloaded) at desktop and phone size.
// REAL browser, MOCK vault: the vault is the app's in-page stand-in. Writes proof-out/results-<ts>.json and proof-out/SPEED-TABLE-<ts>.md.
import { spawn, spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices, webkit } from "playwright-core";
import { appVersion, gitMeta, isoOfTs, runsDir, toResults, writeResults } from "./results.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.PROOF_OUT ?? join(APP, "proof-out"); // next to the app, ignored by git; PROOF_OUT overrides
const LOG = join(homedir(), "Library/Logs/speed-lab-proof.log");
const PORT = 5261;
const BASE = `http://localhost:${PORT}/`;
const QUERY = "?entries=500&latency=600";
const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const T = 60_000;
const DEV = process.argv.includes("--dev"); // only the dev-mode check: `vite` (not the built app) must show the rows, with no console or page error
mkdirSync(OUT, { recursive: true });
mkdirSync(dirname(LOG), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sel = (id) => `[data-testid="${id}"]`;

// ---- the page-side recorder, installed before any app script runs ----
function recorder() {
  window.__seen = [];
  window.__clickT = null; window.__rowT = null; window.__rowSnap = null;
  const hasRow = (n) => n.nodeType === 1 && (n.matches?.('[data-testid="entry-e1"]') || n.querySelector?.('[data-testid="entry-e1"]'));
  const mo = new MutationObserver((recs) => {
    for (const r of recs) {
      const nodes = r.type === "characterData" ? [r.target] : Array.from(r.addedNodes);
      for (const n of nodes) {
        if ((n.textContent || "").includes("Ann entry")) window.__seen.push(Math.round(performance.now()));
        if (window.__clickT !== null && window.__rowT === null && hasRow(n)) {
          window.__rowT = performance.now();
          const p = window.__speedProof;
          window.__rowSnap = p ? { requests: { ...p.requests }, answered: { ...p.answered } } : null;
        }
      }
    }
  });
  mo.observe(document, { subtree: true, childList: true, characterData: true });
  document.addEventListener("click", () => { window.__clickT = performance.now(); window.__rowT = null; window.__rowSnap = null; }, true);
}

// Simulates a slow device read after a reload: from the sign-in click on, holds a readwrite transaction on the app's database for `sessionStorage.__hold` ms,
// so the read waits (started at the click, not at page load, so a slow page load cannot use the hold up first).
function holder() {
  const hold = Number(sessionStorage.getItem("__hold") || 0);
  if (!hold) return;
  document.addEventListener("click", () => {
    const t0 = performance.now();
    const r = indexedDB.open("speedkittaking-cache");
    r.onsuccess = () => {
      const os = r.result.transaction(["meta", "data"], "readwrite").objectStore("data");
      const spin = () => { if (performance.now() - t0 < hold) os.get("x").onsuccess = spin; };
      spin();
    };
  }, { capture: true, once: true });
}

async function dumpDevice(page) {
  return page.evaluate(async () => {
    const out = { databases: [], data: {} };
    const dbs = await indexedDB.databases();
    out.databases = dbs.map((d) => d.name);
    for (const d of dbs) {
      if (d.name !== "speedkittaking-cache") continue;
      const db = await new Promise((res, rej) => { const r = indexedDB.open(d.name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      for (const store of Array.from(db.objectStoreNames)) {
        const os = db.transaction(store, "readonly").objectStore(store);
        const get = (rq) => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
        out.data[store] = { keys: await get(os.getAllKeys()), values: await get(os.getAll()) };
      }
      db.close();
    }
    return JSON.stringify(out);
  });
}

const reading = (page) => page.evaluate(() => ({ paint: window.__speedProof?.lastPaint ?? null, requests: { ...window.__speedProof.requests }, answered: { ...window.__speedProof.answered }, rows: document.querySelectorAll('[data-testid^="entry-e"]').length }));
const rowTiming = (page) => page.evaluate(() => ({ wallMs: window.__rowT === null ? null : Math.round((window.__rowT - window.__clickT) * 10) / 10, snap: window.__rowSnap }));
const waitPaint = (page) => page.waitForFunction(() => window.__speedProof?.lastPaint, null, { timeout: T });

async function signIn(page, who) {
  await page.click(sel(`signin-${who}`));
}

// ---- scenarios; each returns { values, checks: [[name, ok]] } ----
async function b1(page) {
  await signIn(page, "ann");
  await page.waitForSelector(sel("entry-e1"), { timeout: T });
  await waitPaint(page);
  const r = await reading(page), tm = await rowTiming(page);
  await page.waitForFunction(() => window.__speedProof.lastPaint?.fullMs !== undefined && window.__speedProof.answered.records === window.__speedProof.requests.records, null, { timeout: T });
  const done = await reading(page);
  const values = { firstRowMs: r.paint.ms, fullMs: done.paint.fullMs, source: r.paint.source, wallMs: tm.wallMs, requestsAtRow: tm.snap?.requests.records, answeredAtRow: tm.snap?.answered.records, requestsTotal: done.requests.records, rows: done.rows };
  // The first page shows early: head + page 1 is about 2 requests (1200 ms at 600 ms each); the whole list is 5 requests (about 3000 ms).
  return { values, checks: [["500 rows at the end", done.rows === 500], ["source is preview", r.paint.source === "preview"], ["first row after about 2 requests (under 2000 ms)", r.paint.ms < 2000], ["the full list comes later than the first row", done.paint.fullMs > r.paint.ms]] };
}
async function b2(page) {
  await page.click(sel("nav-entry-e1"));
  await page.waitForSelector(sel("rename-input"), { timeout: T });
  await page.click(sel("nav-entries"));
  await page.waitForSelector(sel("entry-e1"), { timeout: T });
  await waitPaint(page);
  const r = await reading(page), tm = await rowTiming(page);
  return { values: { firstRowMs: r.paint.ms, source: r.paint.source, wallMs: tm.wallMs, rows: r.rows }, checks: [["source is memory", r.paint.source === "memory"], ["entry-e1 within 100 ms of the click", tm.wallMs !== null && tm.wallMs <= 100]] };
}
async function b3(page, url) {
  await sleep(1500); // the disk save runs on its own timer: no flush
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector(sel("signin-ann"), { timeout: T });
  await signIn(page, "ann");
  await page.waitForSelector(sel("entry-e1"), { timeout: T });
  await waitPaint(page);
  const r = await reading(page), tm = await rowTiming(page);
  const ans = tm.snap?.answered.records;
  return { values: { firstRowMs: r.paint.ms, source: r.paint.source, wallMs: tm.wallMs, requestsAtRow: tm.snap?.requests.records, answeredAtRow: ans, rows: r.rows }, checks: [["source is device", r.paint.source === "device"], ["answered.records is 0 at the first row", ans === 0], ["500 rows", r.rows === 500]] };
}
async function b4(page) {
  await page.click(sel("signout"));
  await page.waitForSelector(sel("signin-ben"), { timeout: T });
  await page.evaluate(() => { window.__seen.length = 0; });
  let dump = "", settledMs = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) { dump = await dumpDevice(page); settledMs = Date.now() - t0; if (!dump.includes("ann.example.test")) break; await sleep(100); }
  const seenAfterSignOut = await page.evaluate(() => window.__seen.length);
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector(sel("signin-ben"), { timeout: T });
  await signIn(page, "ben");
  await page.getByText("Ben entry 1").first().waitFor({ timeout: T });
  const seenAfterBen = await page.evaluate(() => window.__seen.length);
  const r = await reading(page);
  return { values: { annOnDevice: dump.includes("ann.example.test"), deviceCheckedAfterMs: settledMs, seenAfterSignOut, seenAfterBen, rows: r.rows }, checks: [["no ann.example.test on the device after sign-out", !dump.includes("ann.example.test")], ["no Ann entry text after sign-out", seenAfterSignOut === 0 && seenAfterBen === 0], ["5 rows for Ben", r.rows === 5]] };
}
async function b5(page) {
  await signIn(page, "ann");
  await page.waitForSelector(sel("entry-e1"), { timeout: T });
  await page.click(sel("nav-entry-e1"));
  await page.waitForSelector(sel("rename-input"), { timeout: T });
  await page.evaluate(() => window.__speedProofHooks.clearCache());
  // First look (information, not a check): a hover right after sign-in. The idle warm that ran at sign-in started the "entries" warmer, and prefetch-registry
  // does not start the same warmer again for the same workspace and client within staleMs (30 s), so this hover is expected to send nothing.
  const early0 = (await reading(page)).requests.records;
  await page.hover(sel("nav-entries"));
  await sleep(300);
  const early1 = (await reading(page)).requests.records;
  await page.mouse.move(0, 0);
  await sleep(31_000); // outside the 30 s window
  await page.evaluate(() => window.__speedProofHooks.clearCache());
  const before = (await reading(page)).requests.records;
  await page.hover(sel("nav-entries")); // the real mouse, no click
  await sleep(300);
  const after = (await reading(page)).requests.records;
  return { values: { earlyHoverSent: early1 - early0, recordsBefore: before, recordsAfter: after }, checks: [["requests.records went up on hover (after 31 s), no click", after > before]] };
}
async function b6(page) {
  await signIn(page, "ann");
  await page.waitForSelector(sel("entry-e1"), { timeout: T });
  await sleep(1500);
  await page.reload({ waitUntil: "load" }); // the tab closes without a sign-out
  await page.waitForSelector(sel("signin-ben"), { timeout: T });
  await signIn(page, "ben");
  await page.getByText("Ben entry 1").first().waitFor({ timeout: T });
  const seen = await page.evaluate(() => window.__seen.length);
  const dump = await dumpDevice(page);
  return { values: { seenAfterBenClick: seen, annOnDevice: dump.includes("ann.example.test") }, checks: [["no Ann entry text after Ben's click", seen === 0], ["no ann.example.test on the device", !dump.includes("ann.example.test")]] };
}

// B7: the slow disk. A device copy that arrives after `start` stopped waiting (400 ms) still paints, and the label says device.
async function b7prepare(page) {
  await signIn(page, "ann");
  await page.waitForSelector(sel("entry-e1"), { timeout: T });
  await page.waitForFunction(() => window.__speedProof.lastPaint?.fullMs !== undefined, null, { timeout: T });
  await sleep(1500); // the disk save runs on its own timer
}
async function b7(page, holdMs) {
  await page.evaluate((h) => sessionStorage.setItem("__hold", String(h)), holdMs);
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector(sel("signin-ann"), { timeout: T });
  await signIn(page, "ann");
  await page.waitForSelector(sel("entry-e1"), { timeout: T });
  await waitPaint(page);
  const r = await reading(page);
  const st = await page.evaluate(() => window.__speedProof.start);
  const limit = holdMs === 0 ? 400 : 1100; // well under the network time (a preview takes about 1200 ms, the whole list about 3000)
  return { values: { firstRowMs: r.paint.ms, source: r.paint.source, answeredAtRow: r.answered.records, rows: r.rows, startHydrated: st?.hydrated, startMs: st?.ms }, checks: [["source is device", r.paint.source === "device"], [`first row under ${limit} ms`, r.paint.ms < limit], ["rows shown (at least 200)", r.rows >= 200], ...(holdMs >= 600 ? [["the disk answered after start gave up (hydrated no)", st?.hydrated === false]] : [])] };
}

// ---- the run ----
const rows = [];
async function scenario(engine, profile, name, fn) {
  const row = { engine, profile, scenario: name, pass: false, values: {}, failed: [], error: null };
  rows.push(row);
  try {
    const { values, checks } = await fn();
    row.values = values; row.failed = checks.filter(([, ok]) => !ok).map(([n, , why]) => (why ? `${n}: ${why}` : n)); row.pass = row.failed.length === 0;
  } catch (e) { row.error = String(e?.message ?? e).split("\n")[0]; row.failed = ["error"]; }
  console.log(`${row.pass ? "PASS" : "FAIL"} ${engine}/${profile}/${name} ${JSON.stringify(row.values)}${row.failed.length ? " failed: " + row.failed.join("; ") : ""}${row.error ? " error: " + row.error : ""}`);
  return row.pass;
}
async function context(browser, engine, profile, extra = "", withHolder = false) {
  const { defaultBrowserType, ...phone } = devices["iPhone 13"];
  const ctx = await browser.newContext(profile === "phone" ? phone : { viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(recorder);
  if (withHolder) await ctx.addInitScript(holder);
  ctx.setDefaultTimeout(T);
  const page = await ctx.newPage();
  if (engine === "chromium" && profile === "phone") {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: (1.6 * 1e6) / 8, uploadThroughput: (0.75 * 1e6) / 8 });
  }
  await page.goto(BASE + QUERY + extra, { waitUntil: "load" });
  return { ctx, page };
}

async function main() {
  const logFd = openSync(LOG, "a");
  let server;
  let lsof = "";
  try {
    // the port must be free (strictPort would refuse anyway)
    if (await fetch(BASE).then((r) => r.status, () => 0)) throw new Error(`port ${PORT} is already answering: stop what holds it first`);
    if (!DEV) {
      const build = spawnSync("npm", ["run", "build"], { cwd: APP, stdio: ["ignore", logFd, logFd] });
      if (build.status !== 0) throw new Error(`npm run build failed (see ${LOG})`);
    }
    server = spawn("npx", DEV ? ["vite"] : ["vite", "preview"], { cwd: APP, stdio: ["ignore", logFd, logFd], detached: true });
    let exited = null;
    server.on("exit", (c) => { exited = c; });
    for (let i = 0; ; i++) {
      if (exited !== null) throw new Error(`vite preview exited (${exited}); port ${PORT} taken? see ${LOG}`);
      if ((await fetch(BASE).then((r) => r.status, () => 0)) === 200) break;
      if (i > 100) throw new Error("vite preview did not answer 200 in 20 s");
      await sleep(200);
    }
    if (DEV) {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      const errors = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().split("\n")[0]}`); });
      page.on("pageerror", (e) => errors.push(`pageerror: ${String(e.message).split("\n")[0]}`));
      await scenario("chromium", "desktop", "D1 dev mode", async () => {
        await page.goto(BASE + "?latency=50", { waitUntil: "load" });
        await page.click(sel("signin-ann"));
        let rowsShown = true;
        await page.waitForSelector(sel("entry-e1"), { timeout: 10_000 }).catch(() => { rowsShown = false; });
        return { values: { rows: rowsShown ? 30 : 0 }, checks: [["entry-e1 shown within 10 s", rowsShown], ["no console or page error", errors.length === 0, errors[0]]] };
      });
      await browser.close();
    } else for (const [engine, type] of [["chromium", chromium], ["webkit", webkit]]) {
      const browser = await type.launch();
      const version = browser.version();
      console.log(`${engine} ${version}`);
      for (const profile of ["desktop", "phone"]) {
        const { ctx, page } = await context(browser, engine, profile);
        let ok = await scenario(engine, profile, "B1 cold first visit", () => b1(page));
        if (ok) ok = await scenario(engine, profile, "B2 back from an entry", () => b2(page));
        else rows.push({ engine, profile, scenario: "B2 back from an entry", pass: false, values: {}, failed: ["B1 did not pass"], error: null });
        if (ok) ok = await scenario(engine, profile, "B3 reload, from the device", () => b3(page));
        else rows.push({ engine, profile, scenario: "B3 reload, from the device", pass: false, values: {}, failed: ["an earlier step did not pass"], error: null });
        await page.screenshot({ path: join(OUT, `shot-${ts}-${engine}-${profile}-B3.png`) }).catch(() => undefined);
        if (ok) await scenario(engine, profile, "B4 sign-out and Ben", () => b4(page));
        else rows.push({ engine, profile, scenario: "B4 sign-out and Ben", pass: false, values: {}, failed: ["an earlier step did not pass"], error: null });
        await ctx.close();
        const c5 = await context(browser, engine, profile, "&proofHooks=1");
        await scenario(engine, profile, "B5 hover warms", () => b5(c5.page));
        await c5.ctx.close();
        const c6 = await context(browser, engine, profile);
        await scenario(engine, profile, "B6 tab closed without sign-out", () => b6(c6.page));
        await c6.ctx.close();
        const c7 = await context(browser, engine, profile, "", true);
        const ready = await scenario(engine, profile, "B7 slow disk setup", async () => { await b7prepare(c7.page); return { values: {}, checks: [] }; });
        if (ready) {
          await scenario(engine, profile, "B7 slow disk, held 0 ms", () => b7(c7.page, 0));
          await scenario(engine, profile, "B7 slow disk, held 600 ms", () => b7(c7.page, 600));
        }
        await c7.ctx.close();
        const at = rows.findIndex((r) => r.engine === engine && r.profile === profile && r.scenario === "B7 slow disk setup");
        if (rows[at].pass) rows.splice(at, 1); // the setup row is not a result when it passed
        rows.forEach((r) => { r.browser ??= undefined; });
      }
      rows.filter((r) => r.engine === engine).forEach((r) => { r.browserVersion = version; });
      await browser.close();
    }
  } finally {
    if (server?.pid) { try { process.kill(-server.pid, "SIGTERM"); } catch { /* gone */ } }
    await sleep(800);
    if (server?.pid) { try { process.kill(-server.pid, "SIGKILL"); } catch { /* gone */ } }
    closeSync(logFd);
    lsof = spawnSync("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"], { encoding: "utf8" }).stdout.trim();
  }
  const fmt = (v) => (v === undefined || v === null ? "" : typeof v === "number" ? String(Math.round(v * 10) / 10) : String(v));
  const table = [
    `# Speed table: REAL browser, MOCK vault (${ts})`,
    "",
    "Vault latency 600 ms per request (the stand-in's `?latency=`), Ann has 500 entries (3 walk pages of 200). `firstRowMs` is the app's panel (Entries mount to first effect that saw rows); `wall ms` is click to `entry-e1` in the DOM, measured in the page.",
    "",
    "| engine | profile | scenario | firstRowMs | fullMs | source | wall ms | records req at row | records answered at row | records req total | rows | pass | failed | notes |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.engine} | ${r.profile} | ${r.scenario} | ${fmt(r.values.firstRowMs)} | ${fmt(r.values.fullMs)} | ${fmt(r.values.source)} | ${fmt(r.values.wallMs)} | ${fmt(r.values.requestsAtRow ?? r.values.recordsBefore)} | ${fmt(r.values.answeredAtRow)} | ${fmt(r.values.requestsTotal ?? r.values.recordsAfter)} | ${fmt(r.values.rows)} | ${r.pass ? "pass" : "FAIL"} | ${[...r.failed, r.error ?? ""].filter(Boolean).join("; ")} | ${r.values.earlyHoverSent !== undefined ? `hover right after sign-in sent ${r.values.earlyHoverSent} records requests` : ""} |`),
    "",
  ].join("\n");
  writeFileSync(join(OUT, `results-${ts}.json`), JSON.stringify({ ts, base: BASE + QUERY, rows }, null, 2));
  writeFileSync(join(OUT, `SPEED-TABLE-${ts}.md`), table);
  console.log(table);
  let resultsWritten = true;
  try {
    const { files, unmapped } = toResults({ ts, base: BASE + QUERY, rows }, { ...gitMeta(APP), appVersion: appVersion(APP), at: isoOfTs(ts) });
    const dir = runsDir(process.env, APP);
    writeResults(dir, files);
    console.log(`result files: ${files.length} in ${dir}`);
    if (unmapped.length) console.log(`unmapped scenarios: ${unmapped.join("; ")}`);
  } catch (e) { resultsWritten = false; console.log(`result files NOT written: ${e?.message ?? e}`); }
  const failed = rows.filter((r) => !r.pass).length;
  console.log(failed ? `${failed} check(s) FAILED` : "all checks passed");
  console.log(`lsof :${PORT} LISTEN after the run: ${lsof === "" ? "(empty)" : lsof}`);
  process.exitCode = failed || lsof || !resultsWritten ? 1 : 0;
}
main().catch((e) => { console.error(String(e?.stack ?? e)); try { const l = spawnSync("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"], { encoding: "utf8" }).stdout.trim(); console.log(`lsof :${PORT} LISTEN after the run: ${l === "" ? "(empty)" : l}`); } catch { /* none */ } process.exitCode = 1; });
