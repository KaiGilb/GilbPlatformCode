#!/usr/bin/env node
/**
 * Browser proof for the relay window (not part of `npm test`). Starts the real built bridge/bridge.mjs on a spare port with the
 * stand-in claude and a throwaway state dir, plays an https opener page at https://gilb.com/relay-check, opens /relay from a click,
 * and checks, in WebKit (Safari's engine):
 *   1. hello through the relay window                      PASS expected
 *   2. the same fetch made directly by the https page      BLOCKED expected (mixed content / local network); printed, never fails the run
 *   3. a pairing call through the relay window, with the code the bridge printed -> a secret comes back, PASS expected
 * Run from this folder, after `npm ci`:
 *   npm i --no-save playwright@1.60
 *   PLAYWRIGHT_BROWSERS_PATH=<browsers folder> node scripts/check-relay-browser.mjs
 * Exit 0 means checks 1 and 3 passed. No full turn is run here.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OPENER = "https://gilb.com";
const pw = await import("playwright");

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });

const port = await freePort();
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-check-"));
const bridgeProc = spawn(
  process.execPath,
  [path.join(root, "bridge/bridge.mjs"), "--port", String(port), "--claude", path.join(root, "src/fake-claude.mjs"), "--state-dir", stateDir, "--allow-origin", OPENER],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let out = "";
bridgeProc.stdout.on("data", (d) => (out += d));
bridgeProc.stderr.on("data", (d) => (out += d));

let failed = false;
const say = (ok, name, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`);
  if (!ok) failed = true;
};
let browser;
try {
  const deadline = Date.now() + 15000;
  while (!/Pairing code: \S+/.test(out)) {
    if (bridgeProc.exitCode !== null) throw new Error("bridge exited early:\n" + out);
    if (Date.now() > deadline) throw new Error("bridge did not print a pairing code:\n" + out);
    await new Promise((r) => setTimeout(r, 100));
  }
  const code = /Pairing code: (\S+)/.exec(out)[1];
  const base = `http://127.0.0.1:${port}`;

  browser = await pw.webkit.launch();
  const context = await browser.newContext();
  await context.route(`${OPENER}/relay-check`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><button id="open">Open bridge window</button><script>
        window.popup = null; window.ready = null; const waiters = new Map(); let n = 0;
        addEventListener("message", (ev) => {
          if (ev.source !== window.popup || ev.origin !== ${JSON.stringify(base)}) return;
          const m = ev.data || {};
          if (m.type === "gilb-bridge-ready") window.ready = m;
          else if (m.type !== "gilb-bridge-head" && waiters.has(m.id)) waiters.get(m.id)(m); // the head comes first; wait for the res
        });
        document.getElementById("open").onclick = () => { window.popup = window.open(${JSON.stringify(base + "/relay")}, "gilb-bridge", "width=420,height=200"); };
        window.relay = (req) => new Promise((resolve, reject) => {
          const id = ++n; const t = setTimeout(() => reject(new Error("timeout")), 10000);
          waiters.set(id, (m) => { clearTimeout(t); waiters.delete(id); resolve(m); });
          window.popup.postMessage({ type: "gilb-bridge-req", id, ...req }, ${JSON.stringify(base)});
        });
      </script>`,
    }),
  );
  const page = await context.newPage();
  await page.goto(`${OPENER}/relay-check`);
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.click("#open")]);
  await page.waitForFunction(() => window.ready, null, { timeout: 10000 });
  say(true, "ready message received from the relay window", JSON.stringify(await page.evaluate(() => window.ready)));

  const hello = await page.evaluate(() => window.relay({ path: "/v1/hello", method: "GET", headers: {} }));
  const hb = JSON.parse(hello.body || "null");
  say(hello.type === "gilb-bridge-res" && hello.status === 200 && hb?.relay === true, "hello via relay", hello.body);

  const direct = await page.evaluate(async (u) => {
    try {
      const r = await fetch(u + "/v1/hello");
      return "NOT BLOCKED, status " + r.status;
    } catch (e) {
      return "BLOCKED (" + e.message + ")";
    }
  }, base);
  console.log("CONTROL direct fetch from the https page: " + direct);

  const pair = await page.evaluate((c) => window.relay({ path: "/v1/pair", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: c }) }), code);
  const pb = JSON.parse(pair.body || "null");
  say(pair.status === 200 && /^[0-9a-f]{64}$/.test(pb?.secret ?? ""), "pairing via relay returns a secret", `status ${pair.status}`);
  const chk = await page.evaluate((s) => window.relay({ path: "/v1/check", method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": s }, body: "{}" }), pb?.secret);
  say(chk.status === 200, "the secret works through the relay", `status ${chk.status}`);
  const status = await popup.textContent("#status");
  say(status === `Connected to ${OPENER}`, "relay window status line", status);
} catch (e) {
  say(false, "script", e.stack || String(e));
} finally {
  await browser?.close().catch(() => {});
  bridgeProc.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 300));
  fs.rmSync(stateDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
