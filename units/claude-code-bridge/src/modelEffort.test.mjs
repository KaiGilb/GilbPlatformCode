// @vitest-environment node
// Bridge 0.3.5: the person chooses the model and the effort (chat and code turns), and may tell the model to hand coding jobs to the
// `sonnet-coder` subagent (code turns). Also: /v1/tool-result checks the turn's owner (L-D), a hand-off under a parent whose cancel was
// asked for is refused like a closed parent (L-E).
// Hermetic: a stand-in `claude` (fake-claude.mjs). The real CLI's flags were checked by hand against Claude Code 2.1.325.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge, CODE_TOOLS, FILES_ONLY_TOOLS, DELEGATE_SENTENCE } from "../bridge/bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";
const TOOLS = [{ name: "list_vaults", description: "d", inputSchema: { type: "object", properties: {} } }];

let dir;
let bridge;
let base;
let logFile;
let open = [];

/** access: "folder" (full folder mode), "files-only" (Windows folder mode) or "computer". */
async function start({ access = "folder", env = {}, pairings = 1 } = {}) {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-model-")));
  logFile = path.join(dir, "claude.log");
  const ws = path.join(dir, "MyCode");
  fs.mkdirSync(ws);
  bridge = createBridge({
    port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "work"), home: dir,
    codeEnvExtraPrefixes: ["FAKE_"], codePlatform: access === "files-only" ? "win32" : "darwin", workspace: ws,
    ...(access === "computer" ? { fullAccess: true } : {}),
    env: { ...process.env, FAKE_CLAUDE_LOG: logFile, ...env },
  });
  await bridge.start();
  base = `http://127.0.0.1:${bridge.port}`;
  const secrets = [];
  for (let i = 0; i < pairings; i++) {
    const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: bridge.pairingCode }) });
    secrets.push((await res.json()).secret);
  }
  return pairings === 1 ? secrets[0] : secrets;
}
afterEach(async () => {
  for (const t of open) t.close();
  open = [];
  await bridge?.close();
  bridge = undefined;
  if (dir) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

const runs = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.event === "run") : []);
const logRows = (event) => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.event === event) : []);
const until = async (fn, ms = 15000) => {
  for (let i = 0; i < ms / 25; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("timed out waiting");
};
const after = (argv, flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);

/** A whole turn, read to its end. */
async function turn(secret, extra) {
  const res = await fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify({ system: "You are the agent.", prompt: "hello", ...extra }) });
  if (res.status !== 200) return { status: res.status, json: await res.json().catch(() => null), events: [] };
  const events = [];
  for (const blk of (await res.text()).split("\n\n")) {
    const e = /event: (.*)/.exec(blk)?.[1];
    const d = /data: (.*)/.exec(blk)?.[1];
    if (e) events.push([e, JSON.parse(d)]);
  }
  return { status: 200, events, message: events.find((e) => e[0] === "message")?.[1], error: events.find((e) => e[0] === "error")?.[1] };
}

/** A turn kept open in the background (the child waits forever). */
async function openTurn(secret, extra) {
  const ctl = new AbortController();
  const res = await fetch(`${base}/v1/turn`, { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify({ system: "You are the agent.", tools: TOOLS, prompt: "hello", ...extra }) });
  const t = { status: res.status, events: [], turnId: "", json: null, close: () => ctl.abort() };
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
          const e = /event: (.*)/.exec(blk)?.[1];
          const d = /data: (.*)/.exec(blk)?.[1];
          if (!e) continue;
          const parsed = JSON.parse(d);
          t.events.push([e, parsed]);
          if (e === "start") t.turnId = parsed.turnId;
        }
      }
    } catch {
      /* hung up */
    }
  })();
  return t;
}
const api = async (secret, route, body = {}) => {
  const res = await fetch(`${base}${route}`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
};

describe("GET /v1/hello options", () => {
  it("lists the models, the efforts and delegateCoding so the page can feature-detect", async () => {
    await start();
    const body = await (await fetch(`${base}/v1/hello`)).json();
    expect(body.options).toEqual({ models: ["opus", "sonnet", "haiku", "fable"], efforts: ["low", "medium", "high", "xhigh", "max"], delegateCoding: true });
  });
});

describe("model and effort on a turn", () => {
  it("chat: an alias or a full name becomes --model, an effort becomes --effort; neither given means neither flag", async () => {
    const secret = await start();
    for (const model of ["opus", "sonnet", "haiku", "fable", "claude-opus-5-5", "claude-sonnet-4.5-20250929"]) {
      expect((await turn(secret, { model, effort: "high" })).status).toBe(200);
    }
    for (const effort of ["low", "medium", "high", "xhigh", "max"]) await turn(secret, { effort });
    await turn(secret, {});
    const argvs = runs().map((r) => r.argv);
    expect(argvs.slice(0, 6).map((a) => after(a, "--model"))).toEqual(["opus", "sonnet", "haiku", "fable", "claude-opus-5-5", "claude-sonnet-4.5-20250929"]);
    expect(argvs.slice(0, 6).map((a) => after(a, "--effort"))).toEqual(Array(6).fill("high"));
    expect(argvs.slice(6, 11).map((a) => after(a, "--effort"))).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(argvs[11]).not.toContain("--model");
    expect(argvs[11]).not.toContain("--effort");
  });

  it("code turns (folder, files-only and computer) pass --model and --effort too", async () => {
    for (const access of ["folder", "files-only", "computer"]) {
      const secret = await start({ access });
      await turn(secret, { mode: "code", model: "opus", effort: "xhigh" });
      const argv = runs()[0].argv;
      expect(after(argv, "--model")).toBe("opus");
      expect(after(argv, "--effort")).toBe("xhigh");
      await bridge.close();
      bridge = undefined;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a model that is not on the list is 400 and no child starts", async () => {
    const secret = await start();
    for (const model of ["--dangerously-skip-permissions", "-x", "gpt-5", "Opus", "opus ", "claude-", "CLAUDE-opus", "claude-opus 5", "claude-" + "a".repeat(64), "", null, 5, {}, ["opus"], true]) {
      for (const mode of ["chat", "code"]) {
        const r = await turn(secret, { mode, model });
        expect(r.status, JSON.stringify(model)).toBe(400);
        expect(r.json).toEqual({ error: "That model is not allowed." });
      }
    }
    expect(runs()).toHaveLength(0);
  });

  it("an effort that is not on the list is 400 and no child starts", async () => {
    const secret = await start();
    for (const effort of ["extreme", "High", "", "--x", null, 3, {}, ["low"]]) {
      const r = await turn(secret, { effort });
      expect(r.status, JSON.stringify(effort)).toBe(400);
      expect(r.json).toEqual({ error: "That effort is not allowed." });
    }
    expect(runs()).toHaveLength(0);
  });

  it("the final message says the model, the effort and delegateCoding as used", async () => {
    const secret = await start();
    const chat = await turn(secret, { model: "sonnet", effort: "low" });
    expect(chat.message).toMatchObject({ model: "fake-model", effort: "low" });
    expect(chat.message).not.toHaveProperty("delegateCoding");
    const none = await turn(secret, {});
    expect(none.message).not.toHaveProperty("effort");
    const code = await turn(secret, { mode: "code", effort: "max", delegateCoding: true });
    expect(code.message).toMatchObject({ mode: "code", effort: "max", delegateCoding: true });
    const plain = await turn(secret, { mode: "code" });
    expect(plain.message).toMatchObject({ mode: "code", delegateCoding: false });
  });
});

describe("hand-offs inherit the parent's model and effort", () => {
  it("inherit when they carry none; their own wins when valid; an invalid own one is 400", async () => {
    const secret = await start();
    const parent = await openTurn(secret, { prompt: "WAITFOREVER", model: "opus", effort: "high" });
    await until(() => parent.turnId);
    const inherits = await turn(secret, { parentTurnId: parent.turnId, prompt: "HOPONE", tools: [] });
    expect(inherits.status).toBe(200);
    const own = await turn(secret, { parentTurnId: parent.turnId, prompt: "HOPTWO", tools: [], model: "haiku", effort: "low" });
    expect(own.status).toBe(200);
    const badModel = await turn(secret, { parentTurnId: parent.turnId, prompt: "HOPTHREE", tools: [], model: "nope" });
    expect([badModel.status, badModel.json]).toEqual([400, { error: "That model is not allowed." }]);
    const badEffort = await turn(secret, { parentTurnId: parent.turnId, prompt: "HOPFOUR", tools: [], effort: "nope" });
    expect([badEffort.status, badEffort.json]).toEqual([400, { error: "That effort is not allowed." }]);
    const byPrompt = (w) => runs().find((r) => r.prompt.includes(w))?.argv;
    expect([after(byPrompt("HOPONE"), "--model"), after(byPrompt("HOPONE"), "--effort")]).toEqual(["opus", "high"]);
    expect([after(byPrompt("HOPTWO"), "--model"), after(byPrompt("HOPTWO"), "--effort")]).toEqual(["haiku", "low"]);
    expect(byPrompt("HOPTHREE")).toBeUndefined();
    expect(byPrompt("HOPFOUR")).toBeUndefined();
  });

  it("a parent without a model or effort passes none on", async () => {
    const secret = await start();
    const parent = await openTurn(secret, { prompt: "WAITFOREVER" });
    await until(() => parent.turnId);
    await turn(secret, { parentTurnId: parent.turnId, prompt: "HOPONE", tools: [] });
    const argv = runs().find((r) => r.prompt.includes("HOPONE")).argv;
    expect(argv).not.toContain("--model");
    expect(argv).not.toContain("--effort");
  });

  it("a hand-off cannot ask for delegateCoding (it is not a code turn)", async () => {
    const secret = await start();
    const parent = await openTurn(secret, { prompt: "WAITFOREVER" });
    await until(() => parent.turnId);
    const r = await turn(secret, { parentTurnId: parent.turnId, prompt: "HOPONE", tools: [], delegateCoding: true });
    expect([r.status, r.json]).toEqual([400, { error: "delegateCoding is only for code turns." }]);
  });
});

describe("delegateCoding", () => {
  it("is refused on a chat turn; false is allowed; a non-boolean is a bad request", async () => {
    const secret = await start();
    for (const mode of [undefined, "chat"]) {
      const r = await turn(secret, { ...(mode ? { mode } : {}), delegateCoding: true });
      expect([r.status, r.json]).toEqual([400, { error: "delegateCoding is only for code turns." }]);
    }
    expect((await turn(secret, { delegateCoding: false })).status).toBe(200);
    for (const v of ["true", 1, null, {}]) {
      const r = await turn(secret, { mode: "code", delegateCoding: v });
      expect([r.status, r.json]).toEqual([400, { error: "Bad request." }]);
    }
    expect(runs()).toHaveLength(1);
  });

  const CODER = {
    description: "Writes and changes code from a detailed brief, then reports what it changed and the checks it ran.",
    model: "sonnet",
  };

  it("folder mode: --agents has the sonnet-coder with exactly the code tools, --tools gains Agent, the system prompt gains the sentence", async () => {
    const secret = await start();
    await turn(secret, { mode: "code", delegateCoding: true });
    const argv = runs()[0].argv;
    const agents = JSON.parse(after(argv, "--agents"));
    expect(Object.keys(agents)).toEqual(["sonnet-coder"]);
    expect(agents["sonnet-coder"]).toMatchObject({ ...CODER, tools: CODE_TOOLS });
    expect(agents["sonnet-coder"].prompt).toMatch(/only inside the folder/);
    expect(agents["sonnet-coder"].prompt).toMatch(/Claim nothing you did not run/);
    expect(after(argv, "--tools")).toBe([...CODE_TOOLS, "Agent"].join(","));
    expect(after(argv, "--append-system-prompt")).toMatch(/When you finish, list the files you changed\. Hand each coding job to the sonnet-coder agent with a detailed brief/);
    expect(after(argv, "--append-system-prompt").endsWith(DELEGATE_SENTENCE)).toBe(true);
    expect(DELEGATE_SENTENCE).toBe("Hand each coding job to the sonnet-coder agent with a detailed brief (files, exact change, checks to run). Then check its work yourself: read the diff and run the checks. Do the planning, reviewing and talking to the person yourself.");
    // the sandbox, the restriction and the permission flags are the same as a turn without delegation
    for (const f of ["--restricted", "--strict-mcp-config", "--disable-slash-commands"]) expect(argv).toContain(f);
    expect(after(argv, "--permission-mode")).toBe("acceptEdits");
  });

  it("files-only mode: the subagent has exactly the files-only tools", async () => {
    const secret = await start({ access: "files-only" });
    await turn(secret, { mode: "code", delegateCoding: true });
    const argv = runs()[0].argv;
    expect(JSON.parse(after(argv, "--agents"))["sonnet-coder"].tools).toEqual(FILES_ONLY_TOOLS);
    expect(after(argv, "--tools")).toBe([...FILES_ONLY_TOOLS, "Agent"].join(","));
  });

  it("computer mode: the subagent has no tools key (it inherits), there is no --tools, and the sentence is appended", async () => {
    const secret = await start({ access: "computer" });
    await turn(secret, { mode: "code", delegateCoding: true });
    const argv = runs()[0].argv;
    const coder = JSON.parse(after(argv, "--agents"))["sonnet-coder"];
    expect(coder).toMatchObject(CODER);
    expect(coder).not.toHaveProperty("tools");
    expect(argv).not.toContain("--tools");
    expect(after(argv, "--append-system-prompt").endsWith(`\n\n${DELEGATE_SENTENCE}`)).toBe(true);
  });

  it("without delegateCoding (or with false) there is no --agents, no Agent tool, no sentence", async () => {
    for (const access of ["folder", "files-only", "computer"]) {
      const secret = await start({ access });
      await turn(secret, { mode: "code" });
      await turn(secret, { mode: "code", delegateCoding: false });
      for (const r of runs()) {
        expect(r.argv).not.toContain("--agents");
        expect(after(r.argv, "--tools") ?? "").not.toMatch(/Agent|Task/);
        expect(after(r.argv, "--append-system-prompt")).not.toContain("sonnet-coder");
      }
      await bridge.close();
      bridge = undefined;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a chat turn never gets --agents", async () => {
    const secret = await start();
    await turn(secret, { model: "opus", delegateCoding: false });
    expect(runs()[0].argv).not.toContain("--agents");
  });
});

describe("the init check lets the subagent tool through only with delegateCoding", () => {
  const INIT = JSON.stringify(["Bash", "Read", "Task", "mcp__gilb__x"]);
  it("folder mode: a Task tool in the init is refused without delegateCoding and accepted with it", async () => {
    const secret = await start({ env: { FAKE_INIT_TOOLS: INIT } });
    const without = await turn(secret, { mode: "code" });
    expect(without.message).toBeUndefined();
    expect(without.error?.message).toMatch(/limits|stopped|folder/i);
    const withIt = await turn(secret, { mode: "code", delegateCoding: true });
    expect(withIt.error).toBeUndefined();
    expect(withIt.message).toMatchObject({ mode: "code", delegateCoding: true });
  });

  it("the name Agent is accepted with delegateCoding too; other extra tools are still refused", async () => {
    const secret = await start({ env: { FAKE_INIT_TOOLS: JSON.stringify(["Bash", "Agent", "mcp__gilb__x"]) } });
    expect((await turn(secret, { mode: "code", delegateCoding: true })).message).toBeDefined();
    await bridge.close();
    fs.rmSync(dir, { recursive: true, force: true });
    const secret2 = await start({ env: { FAKE_INIT_TOOLS: JSON.stringify(["Bash", "Task", "WebFetch"]) } });
    const r = await turn(secret2, { mode: "code", delegateCoding: true });
    expect(r.message).toBeUndefined();
    expect(r.error).toBeDefined();
  });

  it("files-only mode: the subagent tool is accepted with delegateCoding, Bash is not", async () => {
    const secret = await start({ access: "files-only", env: { FAKE_INIT_TOOLS: JSON.stringify(["Read", "Task"]) } });
    expect((await turn(secret, { mode: "code" })).error).toBeDefined();
    expect((await turn(secret, { mode: "code", delegateCoding: true })).message).toBeDefined();
    await bridge.close();
    fs.rmSync(dir, { recursive: true, force: true });
    const secret2 = await start({ access: "files-only", env: { FAKE_INIT_TOOLS: JSON.stringify(["Read", "Bash", "Task"]) } });
    expect((await turn(secret2, { mode: "code", delegateCoding: true })).error).toBeDefined();
  });
});

describe("each-write approval for a delegating turn", () => {
  const decisionOf = async (secret, extra) => {
    const res = await fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify({ system: "s", prompt: "ASKTASK", mode: "code", approval: "each-write", ...extra }) });
    await res.text();
    return logRows("approve").at(-1)?.decision;
  };
  it("starting the subagent is allowed only when delegating; its writes still ask (asking is unchanged)", async () => {
    const secret = await start();
    expect((await decisionOf(secret, {})).behavior).toBe("deny");
    expect((await decisionOf(secret, { delegateCoding: true })).behavior).toBe("allow");
  });
});

describe("L-D: /v1/tool-result checks the turn's owner", () => {
  it("another pairing is answered exactly like an unknown turn, and the owner's call is not touched", async () => {
    const [a, b] = await start({ pairings: 2 });
    const t = await openTurn(a, { prompt: "CALLTOOL" });
    await until(() => t.events.find((e) => e[0] === "tool_request"));
    const callId = t.events.find((e) => e[0] === "tool_request")[1].id;
    const viaB = await api(b, "/v1/tool-result", { turnId: t.turnId, id: callId, result: "INJECTED", isError: false });
    const unknown = await api(b, "/v1/tool-result", { turnId: "0000000000000000", id: callId, result: "x", isError: false });
    expect(viaB).toEqual(unknown);
    expect(viaB.status).toBe(404);
    // the call is still waiting: the owner answers it, and the model sees the owner's answer, not B's
    expect((await api(a, "/v1/tool-result", { turnId: t.turnId, id: callId, result: "REAL", isError: false })).status).toBe(200);
    await t.done;
    expect(JSON.stringify(t.events)).toContain("tool said: REAL");
    expect(JSON.stringify(t.events)).not.toContain("INJECTED");
  });

  it("the owner is not told a cancelled call differently, but another pairing never learns it was cancelled", async () => {
    const [a, b] = await start({ pairings: 2 });
    const t = await openTurn(a, { prompt: "WAITFOREVER" });
    await until(() => t.turnId);
    const viaB = await api(b, "/v1/tool-result", { turnId: t.turnId, id: "abcdef0123456789", result: "x" });
    expect(viaB).toEqual({ status: 404, json: { error: "No such tool call is waiting." } });
  });
});

describe("L-E: a hand-off on a parent whose cancel was asked for is refused like a closed parent", () => {
  it("404 with the unknown-parent sentence, even while the parent's child is still stopping", async () => {
    const a = await start();
    const p = await openTurn(a, { prompt: "WAITFOREVER IGNORETERM", mode: "code" });
    await until(() => p.turnId);
    await until(() => runs().length === 1);
    const before = await turn(a, { parentTurnId: p.turnId, prompt: "HOPOK", tools: [] });
    expect(before.status).toBe(200);
    expect((await api(a, "/v1/turn/cancel", { turnId: p.turnId })).json).toEqual({ cancelled: true });
    // the child ignores SIGTERM for 3 s, so the parent has not closed yet
    const r = await turn(a, { parentTurnId: p.turnId, prompt: "HOPLATE", tools: [] });
    expect([r.status, r.json]).toEqual([404, { error: "The turn that asked for this hand-off is not running." }]);
    expect(runs().some((x) => x.prompt.includes("HOPLATE"))).toBe(false);
  });
});
