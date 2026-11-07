#!/usr/bin/env node
/**
 * Browser proof for the page-side client's relay route (not part of `npm test`). Bundles ../claude-code-client/src/client.ts with
 * esbuild into an https opener page at https://gilb.com/relay-client-check (served by context.route), starts the BUILT bridge on a
 * spare port with the stand-in claude and a throwaway state dir, and runs:
 *   webkit    (Safari's engine): click -> client.openRelay() true; probe() true; pair with the printed code; ONE full sendTurn through the
 *             relay (the platform's /context and /tool calls are fulfilled by context.route) PASS when the reply comes back; then a second
 *             turn (WAITFOREVER) is stopped with disconnect(): PASS when the client rejects with the 499 disconnect error AND the stand-in
 *             claude got SIGTERM (the bridge ended the turn).
 *   chromium  the same, WITHOUT opening the relay: the direct route. Grants the `local-network-access` permission.
 * Run from this folder, after `npm ci` here and in ../claude-code-client:
 *   npm i --no-save playwright@1.60
 *   PLAYWRIGHT_BROWSERS_PATH=<browsers folder> node scripts/check-relay-client-browser.mjs [webkit|chromium|both]   (default both)
 * Exit 0 means every check passed.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientEntry = path.resolve(root, "../claude-code-client/src/client.ts");
const OPENER = "https://gilb.com";
const which = process.argv[2] ?? "both";
const pw = await import("playwright");
const esbuild = await import("esbuild");

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });

const bundle = (
  await esbuild.build({
    stdin: { contents: `export * from ${JSON.stringify(clientEntry)};`, resolveDir: root, loader: "ts" },
    bundle: true,
    format: "iife",
    globalName: "ClientLib",
    write: false,
    target: "es2020",
  })
).outputFiles[0].text;

let failed = false;
const say = (ok, name, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`);
  if (!ok) failed = true;
};

async function run(engine) {
  console.log(`--- ${engine} ---`);
  const port = await freePort();
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-client-"));
  const logFile = path.join(stateDir, "claude.log");
  const bridgeProc = spawn(
    process.execPath,
    [path.join(root, "bridge/bridge.mjs"), "--port", String(port), "--claude", path.join(root, "src/fake-claude.mjs"), "--state-dir", stateDir, "--allow-origin", OPENER],
    { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FAKE_CLAUDE_LOG: logFile } },
  );
  let out = "";
  bridgeProc.stdout.on("data", (d) => (out += d));
  bridgeProc.stderr.on("data", (d) => (out += d));
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
    const useRelay = engine === "webkit";
    browser = await (engine === "webkit" ? pw.webkit : pw.chromium).launch();
    const context = await browser.newContext(engine === "chromium" ? { permissions: ["local-network-access"] } : {});
    const platformCalls = [];
    await context.route(`${OPENER}/relay-client-check`, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><button id="open">Open bridge window</button><script>${bundle}
          window.client = ClientLib.createClaudeCodeClient({ principal: "check", platformOrigin: ${JSON.stringify(OPENER)}, bridgeUrl: ${JSON.stringify(base)}, getAuthHeaders: () => ({}), startCommand: "node bridge.mjs" });
          document.getElementById("open").onclick = () => { window.openP = window.client.openRelay(); };
        </script>`,
      }),
    );
    await context.route(`${OPENER}/base/ai/claude-code/**`, async (route) => {
      const url = route.request().url();
      platformCalls.push(url.replace(OPENER, ""));
      const json = (b) => route.fulfill({ contentType: "application/json", body: JSON.stringify(b) });
      if (url.endsWith("/context")) return json({ system: "You are a test agent.", tools: [{ name: "list_vaults", description: "d", inputSchema: { type: "object", properties: {} } }] });
      return json({ result: JSON.stringify({ vaults: ["one"] }) });
    });
    const page = await context.newPage();
    const directCalls = []; // requests the opener page itself sent to the bridge (the relay window's own requests are on the popup)
    page.on("request", (r) => r.url().startsWith(base) && directCalls.push(r.method() + " " + r.url().slice(base.length)));
    await page.goto(`${OPENER}/relay-client-check`);

    if (useRelay) {
      const [popup] = await Promise.all([page.waitForEvent("popup"), page.click("#open")]);
      say((await page.evaluate(() => window.openP)) === true, "openRelay() resolved true after the click");
      say((await page.evaluate(() => window.client.relayState())) === "open", "relayState is open");
      say((await popup.textContent("#status")).length > 0, "relay window is up");
    } else {
      say((await page.evaluate(() => window.client.relayState())) === "closed", "relay not opened (direct route)");
    }
    say((await page.evaluate(() => window.client.probe())) === true, "probe() true", useRelay ? "through the relay" : "direct");
    const info = await page.evaluate(() => window.client.bridgeInfo());
    say(info.reachable === true && info.build !== null, "bridgeInfo", JSON.stringify(info));
    await page.evaluate((c) => window.client.pair(c), code);
    say((await page.evaluate(() => window.client.readConnected())) !== null, "paired with the printed code");

    const reply = await page.evaluate(() =>
      window.client.sendTurn([{ role: "user", content: "CALLTOOL please" }], { thread: "t1" }).then((r) => ({ ok: r }), (e) => ({ err: String(e.message), status: e.status })),
    );
    say(reply.ok?.content?.startsWith("tool said:"), "one full sendTurn (with a tool round) returned the reply", JSON.stringify(reply));
    say(platformCalls.some((u) => u.endsWith("/context")) && platformCalls.some((u) => u.endsWith("/tool")), "platform context and tool calls were made", platformCalls.join(" "));

    // Stop: a turn that never ends, stopped by disconnect() (the page's Stop path)
    await page.evaluate(() => {
      window.stopP = window.client
        .sendTurn([{ role: "user", content: "WAITFOREVER" }], { thread: "t2", onEvent: (e) => e.event === "start" && (window.started = true) })
        .then((r) => ({ ok: r }), (e) => ({ err: String(e.message), status: e.status }));
    });
    await page.waitForFunction(() => window.started === true, null, { timeout: 15000 });
    // Wait until the stand-in claude of this turn is really running (a second "run" in its log), so Stop has something to end.
    const runs = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").split("\n").filter((l) => l.includes('"event":"run"')).length : 0);
    for (let i = 0; i < 100 && runs() < 2; i++) await new Promise((r) => setTimeout(r, 100));
    await page.evaluate(() => window.client.disconnect());
    const stopped = await page.evaluate(() => window.stopP);
    say(stopped.status === 499, "the stopped turn rejected with the disconnect error", JSON.stringify(stopped));
    let sig = false;
    for (let i = 0; i < 60 && !sig; i++) {
      sig = fs.existsSync(logFile) && fs.readFileSync(logFile, "utf8").includes('"event":"sigterm"');
      if (!sig) await new Promise((r) => setTimeout(r, 100));
    }
    say(sig, "the bridge ended the turn (the stand-in claude got SIGTERM)", sig ? "" : (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").split("\n").map((l) => l.slice(0, 80)).join(" | ") : "no log file") + "\nbridge output: " + out.slice(-600));
    say(useRelay ? directCalls.length === 0 : directCalls.length > 0, useRelay ? "the opener page sent NO direct request to the bridge" : "the opener page called the bridge directly", directCalls.join(", ") || "none");
  } catch (e) {
    say(false, `${engine} script`, e.stack || String(e));
  } finally {
    await browser?.close().catch(() => {});
    bridgeProc.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
}

if (which === "webkit" || which === "both") await run("webkit");
if (which === "chromium" || which === "both") await run("chromium");
process.exit(failed ? 1 : 0);
