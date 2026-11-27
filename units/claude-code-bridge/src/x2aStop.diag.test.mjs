// @vitest-environment node
// Batch F diagnostic: removed before merge. X2A: what the person's Stop (POST /v1/turn/cancel) does to a running code turn's child
// and to a grandchild it started. Measures time from Stop to the child's end, and whether both processes are really gone.
// It asserts only that the turn started; everything else is printed as [X2A-STOP] lines.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createBridge } from "../bridge/bridge.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => {
  if (process.platform === "win32") {
    try { return execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH"], { encoding: "utf8" }).includes(` ${pid} `); } catch { return null; }
  }
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
};

describe("X2A Stop on a running code turn (diagnostic)", () => {
  it("measures Stop to child end, and the grandchild", async () => {
    const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-x2a-")));
    const logFile = path.join(dir, "claude.log");
    const ws = path.join(dir, "MyCode"); fs.mkdirSync(ws);
    const bridge = createBridge({ port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "work"), home: dir, workspace: fs.realpathSync.native(ws),
      codeEnvExtraPrefixes: ["FAKE_"], codePlatform: "darwin", env: { ...process.env, FAKE_CLAUDE_LOG: logFile } });
    await bridge.start();
    const base = `http://127.0.0.1:${bridge.port}`;
    const secret = (await (await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: bridge.pairingCode }) })).json()).secret;
    const H = { "content-type": "application/json", "x-bridge-secret": secret };
    const res = await fetch(`${base}/v1/turn`, { method: "POST", headers: H, body: JSON.stringify({ system: "s", prompt: "GRP_PLAIN WAITFOREVER", mode: "code" }) });
    const reader = res.body.getReader();
    let text = "";
    let turnId = null;
    while (!turnId) { const { value, done } = await reader.read(); if (done) break; text += new TextDecoder().decode(value); turnId = /"turnId":"([0-9a-f]+)"/.exec(text)?.[1] ?? null; }
    expect(turnId).toBeTruthy();
    const rows = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
    for (let i = 0; i < 100 && !(rows().some((r) => r.event === "run") && rows().some((r) => r.event === "grp")); i++) await sleep(50);
    const child = rows().find((r) => r.event === "run")?.pid;
    const grand = rows().find((r) => r.event === "grp")?.pid;
    console.log(`[X2A-STOP] ${process.platform} node ${process.version}: child pid ${child}, grandchild pid ${grand}, both alive before Stop: ${alive(child)}/${alive(grand)}`);
    const t0 = Date.now();
    const c = await (await fetch(`${base}/v1/turn/cancel`, { method: "POST", headers: H, body: JSON.stringify({ turnId }) })).json();
    console.log(`[X2A-STOP] cancel answered ${JSON.stringify(c)} after ${Date.now() - t0} ms`);
    let childGone = null, grandGone = null;
    for (let i = 0; i < 400 && (childGone === null || grandGone === null); i++) {
      if (childGone === null && alive(child) === false) childGone = Date.now() - t0;
      if (grandGone === null && alive(grand) === false) grandGone = Date.now() - t0;
      await sleep(50);
    }
    console.log(`[X2A-STOP] child gone after ${childGone} ms; grandchild gone after ${grandGone} ms (null = still alive after 20 s)`);
    const tClose = Date.now();
    await reader.cancel().catch(() => {});
    bridge.server.closeAllConnections?.();
    await bridge.close();
    console.log(`[X2A-STOP] bridge.close() after Stop took ${Date.now() - tClose} ms; child alive ${alive(child)}, grandchild alive ${alive(grand)}`);
    if (alive(grand)) { try { process.kill(grand); } catch { /* gone */ } }
    await removeTestDir(dir);
  }, 60_000);
});
