// @vitest-environment node
// Bridge 0.3.2: the page can learn which turns are running (POST /v1/turns), cancel one (POST /v1/turn/cancel), is told
// when a turn starts (turn_started), and a refused code turn says which turn is running (429 code CodeTurnRunning).
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

describe("turn_started", () => {
  it("is the first event of a chat turn, and of a code turn in a project", async () => {
    const [a] = await start();
    const chat = await openTurn(a, { prompt: "hello" });
    await chat.done;
    expect(names(chat)[0]).toBe("turn_started");
    expect(chat.events[0][1]).toEqual({ turnId: chat.turnId, startedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT.*Z$/), mode: "chat", project: null });
    expect(names(chat)[1]).toBe("start");
    const code = await openTurn(a, { mode: "code", project: "alpha", prompt: "hello" });
    await code.done;
    expect(names(code)[0]).toBe("turn_started");
    expect(code.events[0][1]).toMatchObject({ mode: "code", project: "alpha" });
  });
});

describe("429 bodies", () => {
  it("a running code turn: code, project, turnId, startedAt, and the old text", async () => {
    const [a] = await start();
    const first = await openTurn(a, { mode: "code", project: "alpha", prompt: "WAITFOREVER" });
    await until(() => first.turnId);
    const second = await openTurn(a, { mode: "code", project: "alpha" });
    expect(second.status).toBe(429);
    expect(second.json).toEqual({
      error: "A code turn is already running in alpha.", code: "CodeTurnRunning", project: "alpha", turnId: first.turnId,
      startedAt: first.events[0][1].startedAt,
    });
    first.close();
    await first.done;
    await until(async () => (await api(a, "/v1/turns")).json.turns.length === 0);
    // the code folder itself: project null
    const third = await openTurn(a, { mode: "code", prompt: "WAITFOREVER" });
    await until(() => third.turnId);
    const fourth = await openTurn(a, { mode: "code" });
    expect(fourth.status).toBe(429);
    expect(fourth.json).toMatchObject({ error: "A code turn is already running in MyCode. Wait for it to finish.", code: "CodeTurnRunning", project: null, turnId: third.turnId });
  });

  it("too many turns: the same text, code TooManyTurns", async () => {
    const [a] = await start();
    for (let i = 0; i < 4; i++) {
      const t = await openTurn(a, { prompt: "WAITFOREVER" });
      await until(() => t.turnId);
    }
    const fifth = await openTurn(a, { prompt: "WAITFOREVER" });
    expect(fifth.status).toBe(429);
    expect(fifth.json).toEqual({ error: "Too many turns at once.", code: "TooManyTurns" });
  });
});

describe("POST /v1/turns", () => {
  it("lists only the caller's top-level turns; another pairing sees none; unpaired is refused", async () => {
    const [a, b] = await start();
    const mine = await openTurn(a, { prompt: "WAITFOREVER" });
    await until(() => mine.turnId);
    const code = await openTurn(a, { mode: "code", project: "alpha", prompt: "WAITFOREVER" });
    await until(() => code.turnId);
    const list = (await api(a, "/v1/turns")).json.turns;
    expect(list.map((t) => t.turnId).sort()).toEqual([mine.turnId, code.turnId].sort());
    const c = list.find((t) => t.turnId === code.turnId);
    expect(c).toEqual({ turnId: code.turnId, mode: "code", project: "alpha", startedAt: expect.any(String), lastActivityAt: expect.any(String), lastActivity: "", toolCalls: 0, handoffs: 0 });
    expect(list.find((t) => t.turnId === mine.turnId)).toMatchObject({ mode: "chat", project: null });
    // the other pairing: nothing
    expect((await api(b, "/v1/turns")).json).toEqual({ turns: [] });
    expect((await api("", "/v1/turns")).status).toBe(401);
    expect((await api("not-a-secret", "/v1/turns")).status).toBe(401);
  });

  it("counts built-in tool calls (with the activity wording) and platform (MCP) tool calls, and hand-offs", async () => {
    const [a] = await start();
    const code = await openTurn(a, { mode: "code", prompt: "CODEWRITE HOLDAFTER" });
    await until(() => code.turnId);
    const row = await until(async () => (await api(a, "/v1/turns")).json.turns.find((t) => t.toolCalls === 1));
    expect(row).toMatchObject({ lastActivity: "hello.txt", toolCalls: 1 });
    expect(Date.parse(row.lastActivityAt)).toBeGreaterThanOrEqual(Date.parse(row.startedAt));
    const chat = await openTurn(a, { prompt: "CALLTOOL HOLDAFTER" });
    await until(() => chat.turnId);
    const crow = await until(async () => (await api(a, "/v1/turns")).json.turns.find((t) => t.turnId === chat.turnId && t.toolCalls === 1));
    expect(crow.lastActivity).toBe("list_vaults");
    // a hand-off: counted on its parent, never listed by itself
    const hop = await openTurn(a, { parentTurnId: chat.turnId, prompt: "hi", tools: [] });
    await hop.done;
    const after = (await api(a, "/v1/turns")).json.turns;
    expect(after.find((t) => t.turnId === chat.turnId).handoffs).toBe(1);
    expect(after.map((t) => t.turnId)).not.toContain(hop.turnId);
  });
});

describe("POST /v1/turn/cancel", () => {
  it("another pairing cannot cancel (and is told nothing); the owner can, and the child is stopped", async () => {
    const [a, b] = await start();
    const t = await openTurn(a, { mode: "code", prompt: "WAITFOREVER" });
    await until(() => t.turnId);
    expect((await api(b, "/v1/turn/cancel", { turnId: t.turnId })).json).toEqual({ cancelled: false });
    expect((await api(a, "/v1/turn/cancel", { turnId: "nope" })).json).toEqual({ cancelled: false });
    expect((await api(a, "/v1/turn/cancel", {})).json).toEqual({ cancelled: false });
    expect((await api("", "/v1/turn/cancel", { turnId: t.turnId })).status).toBe(401);
    await new Promise((r) => setTimeout(r, 150));
    expect(stoppedRuns()).toHaveLength(0);
    expect(t.ended).toBe(false);
    // the owner
    expect((await api(a, "/v1/turn/cancel", { turnId: t.turnId })).json).toEqual({ cancelled: true });
    await until(() => stoppedRuns().length === 1);
    await t.done;
    expect(t.events.find((e) => e[0] === "error")[1]).toEqual({ message: "The turn was cancelled." });
    expect(names(t)).not.toContain("message");
    expect((await api(a, "/v1/turns")).json).toEqual({ turns: [] });
    expect((await api(a, "/v1/turn/cancel", { turnId: t.turnId })).json).toEqual({ cancelled: false });
    // the project is free again
    const again = await openTurn(a, { mode: "code", prompt: "hello" });
    expect(again.status).toBe(200);
  });

  it("a hand-off id cannot be cancelled by itself", async () => {
    const [a] = await start();
    const parent = await openTurn(a, { prompt: "WAITFOREVER" });
    await until(() => parent.turnId);
    const hop = await openTurn(a, { parentTurnId: parent.turnId, prompt: "WAITFOREVER", tools: [] });
    await until(() => hop.turnId);
    expect((await api(a, "/v1/turn/cancel", { turnId: hop.turnId })).json).toEqual({ cancelled: false });
  });
});
