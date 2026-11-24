/**
 * Why a code turn was refused when Claude Code did not start in the code folder.
 *
 * The log names which init disagreed, the cwd it reported and the folder that was expected.
 * Once code mode is off, a later code turn is told that reason. A real change on disk keeps its own sentence.
 * A resumed turn the bridge refused for the folder is not tried again, so the person sees that turn's own message.
 */
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge } from "../bridge/bridge.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";
const APP2 = "http://localhost:5198";
const CODE_CWD_ERROR = "The bridge stopped this code turn: Claude Code did not start in the code folder.";
const CODE_FOLDER_CHANGED = "The code folder changed on disk. Choose it again.";
const NO_WORKSPACE = "This bridge has no code folder. Start it with --workspace <folder>.";
// 0.3.23: a LATER init outside the folder says so; the first init (or no cwd) keeps the older sentence above.
const CODE_OUTSIDE_ERROR = "The bridge stopped this code turn: Claude Code moved outside the code folder.";
const OFF_CWD = "Code mode is off because an earlier code turn was stopped: Claude Code did not start in the code folder. Choose the code folder again.";
const OFF_DISK = "Code mode is off because the code folder changed on disk. Choose the code folder again.";

let dir, home, stateDir, wsFile, logFile;
const lines = [];
const bridges = [];
function ensureDir() {
  if (dir) return;
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-cwd-why-")));
  home = path.join(dir, "home");
  stateDir = path.join(home, ".gilb-claude-code-bridge");
  fs.mkdirSync(stateDir, { recursive: true });
  wsFile = path.join(stateDir, "workspace.json");
  logFile = path.join(dir, "claude.log");
}
const mk = (name) => {
  ensureDir();
  const p = path.join(home, name);
  fs.mkdirSync(p, { recursive: true });
  return fs.realpathSync.native(p);
};
async function start(opts = {}) {
  ensureDir();
  lines.length = 0;
  const bridge = createBridge({
    port: 0,
    claudeBin: FAKE,
    allowedOrigins: [APP, APP2],
    workDir: path.join(dir, "work"),
    home,
    workspaceFile: wsFile,
    codePlatform: "darwin",
    codeEnvExtraPrefixes: ["FAKE_"],
    env: { ...process.env, FAKE_CLAUDE_LOG: logFile },
    ...opts,
    // The bridge log, the same way other tests pass `log` into createBridge. Kept after opts so a test env cannot drop it.
    log: (l) => lines.push(l),
  });
  bridges.push(bridge);
  await bridge.start();
  const base = `http://127.0.0.1:${bridge.port}`;
  const pair = async (origin) => (await (await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ code: bridge.pairingCode }) })).json()).secret;
  const secret = await pair(APP);
  return { bridge, base, secret, pair };
}
afterEach(async () => {
  for (const b of bridges.splice(0)) await b.close();
  if (dir) await removeTestDir(dir);
  dir = undefined;
});
const hdr = (secret, origin = APP) => ({ "content-type": "application/json", origin, "x-bridge-secret": secret });
const call = async (b, route, body = {}, secret = b.secret, origin = APP) => {
  const res = await fetch(`${b.base}${route}`, { method: "POST", headers: hdr(secret, origin), body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const hello = async (b) => (await fetch(`${b.base}/v1/hello`, { headers: { origin: APP } })).json();
/** A turn read to its end. */
async function turn(b, extra = {}, secret = b.secret) {
  const res = await fetch(`${b.base}/v1/turn`, { method: "POST", headers: hdr(secret), body: JSON.stringify({ system: "You are the agent.", prompt: "hello", ...extra }) });
  if (res.status !== 200) return { status: res.status, json: await res.json(), events: [] };
  const events = [];
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
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
      events.push([e, JSON.parse(d)]);
    }
  }
  return { status: 200, events };
}
const ev = (r, name) => r.events.filter((e) => e[0] === name).map((e) => e[1]);
/** One line per stand-in start (the fake appends event "run" to FAKE_CLAUDE_LOG). */
const runs = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.event === "run") : []);
const RESUME_KEPT = "11111111-1111-4111-8111-111111111111";
const RESUME_LOST = "00000000-0000-4000-8000-000000000000";

describe("the cwd refusal log", () => {
  it("names init 2 and the reported cwd when the second init says /", async () => {
    const ws = mk("CodeTwice");
    const b = await start({ workspace: ws });
    const r = await turn(b, { mode: "code", prompt: "INITTWICECWD" });
    expect(ev(r, "error")[0].message).toBe(CODE_OUTSIDE_ERROR);
    expect(lines.join("\n")).toContain(`init 2: it reported /, expected ${ws}`);
  });
});

describe("a missing cwd in the refusal log", () => {
  it("says no cwd when the init reports none", async () => {
    const ws = mk("CodeOmit");
    const b = await start({ workspace: ws, env: { ...process.env, FAKE_CLAUDE_LOG: logFile, FAKE_INIT_CWD: "omit" } });
    await turn(b, { mode: "code" });
    expect(lines.join("\n")).toContain("init 1: it reported no cwd, expected ");
  });
});

describe("a new code turn after a cwd refusal", () => {
  it("says code mode is off because the child did not start in the folder when another code turn is sent", async () => {
    const ws = mk("CodeLater");
    const b = await start({ workspace: ws });
    const first = await turn(b, { mode: "code", prompt: "INITTWICECWD" });
    expect(ev(first, "error")[0].message).toBe(CODE_OUTSIDE_ERROR);
    // 0.3.23: with the folder unchanged the next use checks it again and code mode comes back (see keepRoot.test.mjs). So that code mode is
    // still off here, the folder is really replaced first. That is now a change on disk, and one cause has one reason: the answer says so
    // (OFF_DISK), the same words the paired hello gives. The folder-unchanged sentence (OFF_CWD) is still asserted by the next test.
    fs.renameSync(ws, `${ws}.old`);
    fs.mkdirSync(ws);
    const next = await turn(b, { mode: "code" });
    expect(next.status).toBe(409);
    expect(next.json.error).toBe(OFF_DISK);
    expect(next.json.error).not.toBe(NO_WORKSPACE);
  });
});

describe("a code turn that passed the entry guard before a refusal", () => {
  it("says code mode is off when the check runs after an earlier turn was refused", async () => {
    const ws = mk("CodeRace");
    // Turn B is the first code turn. The hook sits after its entry guard and before its folder check. Holding the returned promise lets turn A be refused first.
    let releaseB = () => {};
    const gate = new Promise((res) => { releaseB = res; });
    let markB = () => {};
    const bAtCheck = new Promise((res) => { markB = res; });
    let n = 0;
    const b = await start({
      workspace: ws,
      afterSnapshot: () => {
        n += 1;
        if (n === 1) {
          markB();
          return gate;
        }
      },
    });
    const pendingB = turn(b, { mode: "code", prompt: "hello from B" });
    try {
      await bAtCheck;
      const resultA = await turn(b, { mode: "code", prompt: "INITTWICECWD" });
      expect(ev(resultA, "error")[0].message).toBe(CODE_OUTSIDE_ERROR);
      releaseB();
      const resultB = await pendingB;
      expect(resultB.status).toBe(409);
      expect(resultB.json.error).toBe(OFF_CWD);
    } finally {
      releaseB();
      await pendingB.catch(() => {});
    }
  });
});

describe("a real change of the code folder", () => {
  it("says the folder changed on disk when a different folder is put at the path, and the next turn says code mode is off because of that", async () => {
    const ws = mk("CodeSwap");
    let n = 0;
    // afterSnapshot runs before the pre-spawn check, so this swap is a real folder change. beforeSpawn would be too late and would hit the init check instead.
    const b = await start({
      workspace: ws,
      afterSnapshot: () => { if (n++ === 0) { fs.renameSync(ws, `${ws}.old`); fs.mkdirSync(ws); } },
    });
    const first = await turn(b, { mode: "code" });
    expect(first.status).toBe(409);
    expect(first.json.error).toBe(CODE_FOLDER_CHANGED);
    const next = await turn(b, { mode: "code" });
    expect(next.status).toBe(409);
    expect(next.json.error).toBe(OFF_DISK);
  });
});

describe("choosing the code folder again", () => {
  it("runs the next code turn when the folder is chosen again after a refusal", async () => {
    const ws = mk("CodeAgain");
    const b = await start({ workspace: ws, chooseFolder: async () => ws });
    const refused = await turn(b, { mode: "code", prompt: "INITTWICECWD" });
    expect(ev(refused, "error")[0].message).toBe(CODE_OUTSIDE_ERROR);
    const chosen = await call(b, "/v1/workspace/choose");
    expect(chosen.json).toMatchObject({ chosen: true });
    expect(await hello(b)).toMatchObject({ workspace: true });
    expect(ev(await turn(b, { mode: "code" }), "message")).toHaveLength(1);
  });
});

describe("a resumed code turn refused for its cwd", () => {
  it("keeps that error, starts Claude Code once, and logs the init that disagreed", async () => {
    const ws = mk("CodeResumeCwd");
    const b = await start({ workspace: ws, env: { ...process.env, FAKE_CLAUDE_LOG: logFile, FAKE_INIT_CWD: "omit" } });
    const r = await turn(b, { mode: "code", prompt: "hello", sessionId: RESUME_KEPT });
    expect(r.status).toBe(200);
    expect(ev(r, "error")).toHaveLength(1);
    expect(ev(r, "error")[0].message).toBe(CODE_CWD_ERROR);
    expect(runs()).toHaveLength(1);
    expect(runs()[0].argv[runs()[0].argv.indexOf("--resume") + 1]).toBe(RESUME_KEPT);
    expect(lines.join("\n")).toContain(`init 1: it reported no cwd, expected ${ws}`);
  });
});

describe("a resumed code turn whose folder changed before the pre-spawn check", () => {
  it("says the folder changed on disk and does not start Claude Code", async () => {
    const ws = mk("CodeResumeSwap");
    // The same rename as a turn that is not resumed. It has to happen inside runClaude: the earlier check answers 409 before any retry, so it cannot hide this sentence.
    const b = await start({
      workspace: ws,
      beforeRecheck: () => { fs.renameSync(ws, `${ws}.old`); fs.mkdirSync(ws); },
    });
    const first = await turn(b, { mode: "code", sessionId: RESUME_KEPT });
    expect(first.status).toBe(200);
    expect(ev(first, "error")).toHaveLength(1);
    expect(ev(first, "error")[0].message).toBe(CODE_FOLDER_CHANGED);
    expect(runs()).toHaveLength(0);
  });
});

describe("a resumed code turn whose session is gone", () => {
  it("starts one new session and answers", async () => {
    const ws = mk("CodeResumeLost");
    const b = await start({ workspace: ws });
    const lost = await turn(b, { mode: "code", prompt: "hello", sessionId: RESUME_LOST, history: "Person: one" });
    expect(ev(lost, "error")).toHaveLength(0);
    expect(ev(lost, "message")).toHaveLength(1);
    const all = runs();
    expect(all).toHaveLength(2);
    expect(all[0].argv[all[0].argv.indexOf("--resume") + 1]).toBe(RESUME_LOST);
    expect(all[1].argv).toContain("--session-id");
    expect(all[1].argv).not.toContain("--resume");
    expect(all[1].prompt).toContain("Earlier in this conversation:\nPerson: one");
    expect(ev(lost, "message")[0].content).toBe("echo: hello");
    expect(ev(lost, "message")[0].sessionId).toBe(all[1].argv[all[1].argv.indexOf("--session-id") + 1]);
  });
});
