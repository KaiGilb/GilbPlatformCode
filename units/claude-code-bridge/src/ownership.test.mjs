// @vitest-environment node
// Bridge 0.3.4: a turn belongs to the pairing that started it. A hand-off cannot be opened under another pairing's turn (it is
// answered like an unknown turn), the CodeTurnRunning 429 names the running turn only to its owner, and every route answers a
// non-string id with 400 "Bad request." (never a 500).
// Hermetic: a stand-in `claude` (fake-claude.mjs). Prompt words: WAITFOREVER / HOLDAFTER keep the child running.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 }); // a loaded machine runs the whole suite at once; every wait below is bounded anyway
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge } from "../bridge/bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";
const TOOLS = [{ name: "list_vaults", description: "d", inputSchema: { type: "object", properties: {} } }];

let dir;
let bridge;
let base;
let logFile;
let open = [];

async function pairOne() {
  const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: bridge.pairingCode }) });
  return (await res.json()).secret;
}
async function start() {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-turns-")));
  logFile = path.join(dir, "claude.log");
  const ws = path.join(dir, "MyCode");
  fs.mkdirSync(path.join(ws, "alpha"), { recursive: true });
  bridge = createBridge({
    port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "work"), home: dir,
    codeEnvExtraPrefixes: ["FAKE_"], codePlatform: "darwin", workspace: ws,
    env: { ...process.env, FAKE_CLAUDE_LOG: logFile },
  });
  await bridge.start();
  base = `http://127.0.0.1:${bridge.port}`;
  return [await pairOne(), await pairOne()];
}
afterEach(async () => {
  for (const t of open) t.close();
  open = [];
  await bridge?.close();
  bridge = undefined;
  if (dir) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

const logRows = (event) => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.event === event) : []);
// "claude was stopped": off Windows the stand-in logs the SIGTERM it was sent; Windows has none to catch (the bridge ends the tree
// with taskkill /F), so there it is the stand-in process being gone (only runs that wait forever count).
const isWin = process.platform === "win32";
const pidAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const stoppedRuns = () => (isWin ? logRows("run").filter((r) => r.prompt.includes("WAITFOREVER") && !pidAlive(r.pid)) : logRows("sigterm"));
const until = async (fn, ms = 15000) => {
  for (let i = 0; i < ms / 25; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("timed out waiting");
};
const api = async (secret, route, body = {}) => {
  const res = await fetch(`${base}${route}`, { method: "POST", headers: { "content-type": "application/json", ...(secret ? { "x-bridge-secret": secret } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
};

/** Plays the page for one turn in the background: collects events, answers each tool_request with {}, and can hang up. */
async function openTurn(secret, extra) {
  const ctl = new AbortController();
  const res = await fetch(`${base}/v1/turn`, {
    method: "POST", signal: ctl.signal,
    headers: { "content-type": "application/json", "x-bridge-secret": secret },
    body: JSON.stringify({ system: "You are the agent.", tools: TOOLS, prompt: "hello", ...extra }),
  });
  const t = { status: res.status, events: [], turnId: "", ended: false, json: null, close: () => ctl.abort() };
  open.push(t);
  if (res.status !== 200) {
    t.json = await res.json().catch(() => null);
    return t;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  t.done = (async () => {
    let buf = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const blk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /event: (.*)/.exec(blk)?.[1];
          const data = /data: (.*)/.exec(blk)?.[1];
          if (!ev) continue;
          const parsed = JSON.parse(data);
          t.events.push([ev, parsed]);
          if (ev === "start") t.turnId = parsed.turnId;
          if (ev === "tool_request") {
            await fetch(`${base}/v1/tool-result`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify({ turnId: t.turnId, id: parsed.id, result: "{}", isError: false }) });
          }
        }
      }
    } catch {
      /* hung up */
    }
    t.ended = true;
  })();
  return t;
}
const names = (t) => t.events.map((e) => e[0]);


const UNKNOWN_PARENT = { error: "The turn that asked for this hand-off is not running." };
const SPOOF = [{ name: "spoofed_by_B", description: "d", inputSchema: { type: "object", properties: {} } }];

describe("a hand-off under another pairing's turn", () => {
  it("is refused exactly like an unknown parent turn; the owner's hand-off still works", async () => {
    const [a, b] = await start();
    const victim = await openTurn(a, { mode: "code", project: "alpha", prompt: "WAITFOREVER" });
    await until(() => victim.turnId);
    const unknown = await openTurn(b, { parentTurnId: "0000000000000000", prompt: "hi", tools: [] });
    expect(unknown.status).toBe(404);
    expect(unknown.json).toEqual(UNKNOWN_PARENT);
    // B has the id (as if it had leaked): four attempts, each refused with the very same status and body
    for (let i = 0; i < 4; i++) {
      const h = await openTurn(b, { parentTurnId: victim.turnId, prompt: "WAITFOREVER", tools: SPOOF });
      expect(h.status).toBe(unknown.status);
      expect(h.json).toEqual(unknown.json);
    }
    // nothing of A's turn moved, and A's own hand-off is not blocked
    expect((await api(a, "/v1/turns")).json.turns[0].handoffs).toBe(0);
    const own = await openTurn(a, { parentTurnId: victim.turnId, prompt: "hi", tools: [] });
    expect(own.status).toBe(200);
    await own.done;
    expect((await api(a, "/v1/turns")).json.turns[0].handoffs).toBe(1);
  });
  it("a hand-off id of another pairing is also answered as unknown (not 'cannot hand off again')", async () => {
    const [a, b] = await start();
    const p = await openTurn(a, { prompt: "WAITFOREVER" });
    await until(() => p.turnId);
    const h = await openTurn(a, { parentTurnId: p.turnId, prompt: "WAITFOREVER", tools: [] });
    await until(() => h.turnId);
    const viaB = await openTurn(b, { parentTurnId: h.turnId, prompt: "hi", tools: [] });
    expect(viaB.status).toBe(404);
    expect(viaB.json).toEqual(UNKNOWN_PARENT);
  });
});

describe("the CodeTurnRunning 429 body", () => {
  it("the owner gets turnId, startedAt and ownTurn true; any other pairing gets ownTurn false and neither", async () => {
    const [a, b] = await start();
    const first = await openTurn(a, { mode: "code", project: "alpha", prompt: "WAITFOREVER" });
    await until(() => first.turnId);
    const mine = await openTurn(a, { mode: "code", project: "alpha" });
    expect(mine.status).toBe(429);
    expect(mine.json).toEqual({
      error: "A code turn is already running in alpha.", code: "CodeTurnRunning", project: "alpha", ownTurn: true,
      turnId: first.turnId, startedAt: first.events[0][1].startedAt,
    });
    const other = await openTurn(b, { mode: "code", project: "alpha" });
    expect(other.status).toBe(429);
    expect(other.json).toEqual({ error: "A code turn is already running in alpha.", code: "CodeTurnRunning", project: "alpha", ownTurn: false });
    expect(JSON.stringify(other.json)).not.toContain(first.turnId);
    // the code folder itself (project null)
    first.close();
    await first.done;
    await until(async () => (await api(a, "/v1/turns")).json.turns.length === 0);
    const third = await openTurn(a, { mode: "code", prompt: "WAITFOREVER" });
    await until(() => third.turnId);
    expect((await openTurn(b, { mode: "code" })).json).toEqual({ error: "A code turn is already running in MyCode. Wait for it to finish.", code: "CodeTurnRunning", project: null, ownTurn: false });
  });
});

describe("a non-string id is a 400, never a 500", () => {
  const BAD = [{ toString: 1 }, ["x"], 5, null, true, { a: 1 }];
  it("/v1/turn/cancel, /v1/approval and /v1/tool-result", async () => {
    const [a] = await start();
    const t = await openTurn(a, { prompt: "WAITFOREVER" });
    await until(() => t.turnId);
    for (const bad of BAD) {
      for (const [route, body] of [
        ["/v1/turn/cancel", { turnId: bad }],
        ["/v1/approval", { turnId: bad, id: "x", allow: true }],
        ["/v1/approval", { turnId: t.turnId, id: bad, allow: true }],
        ["/v1/tool-result", { turnId: bad, id: "x", result: "{}" }],
        ["/v1/tool-result", { turnId: t.turnId, id: bad, result: "{}" }],
      ]) {
        const r = await api(a, route, body);
        expect([route, JSON.stringify(body), r.status, r.json]).toEqual([route, JSON.stringify(body), 400, { error: "Bad request." }]);
      }
    }
    expect((await api(a, "/v1/turn/cancel", {})).status).toBe(400);
    expect((await api(a, "/v1/turn/cancel", { turnId: "nope" })).json).toEqual({ cancelled: false }); // a string is still just unknown
    expect(t.ended).toBe(false); // the turn was not touched
  });
  it("/v1/turn: a parentTurnId that is not a string; /v1/pair: a code that is not a string", async () => {
    const [a] = await start();
    for (const bad of BAD) {
      const r = await api(a, "/v1/turn", { parentTurnId: bad, system: "s", prompt: "p", tools: [] });
      expect([r.status, r.json]).toEqual([400, { error: "Bad request." }]);
      const p = await api("", "/v1/pair", { code: bad });
      expect([p.status, p.json]).toEqual([400, { error: "Bad request." }]);
    }
  });
});
