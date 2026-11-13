// @vitest-environment node
// Batch 8 (QA round 3 fixes): the child's own cwd is checked at init, lexical AND physical inside, NotebookEdit path, NFC and case in the prefix test
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge } from "../bridge/bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";
const APP2 = "http://localhost:5198";

let dir, home, stateDir, wsFile, logFile;
const bridges = [];
function ensureDir() {
  if (dir) return;
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-6a-")));
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
  return fs.realpathSync(p);
};
async function start(opts = {}) {
  ensureDir();
  const bridge = createBridge({ port: 0, claudeBin: FAKE, allowedOrigins: [APP, APP2], workDir: path.join(dir, "work"), home, workspaceFile: wsFile, env: { ...process.env, FAKE_CLAUDE_LOG: logFile }, ...opts });
  bridges.push(bridge);
  await bridge.start();
  const base = `http://127.0.0.1:${bridge.port}`;
  const pair = async (origin) => (await (await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ code: bridge.pairingCode }) })).json()).secret;
  const secret = await pair(APP);
  return { bridge, base, secret, pair };
}
afterEach(async () => {
  for (const b of bridges.splice(0)) await b.close();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});
const hdr = (secret, origin = APP) => ({ "content-type": "application/json", origin, "x-bridge-secret": secret });
const call = async (b, route, body = {}, secret = b.secret, origin = APP) => {
  const res = await fetch(`${b.base}${route}`, { method: "POST", headers: hdr(secret, origin), body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const hello = async (b) => (await fetch(`${b.base}/v1/hello`, { headers: { origin: APP } })).json();
const rows = (event) => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.event === event) : []);
/** A turn read to its end; `decide(request, turnId)` answers each approval_request (undefined: leave it to time out). */
async function turn(b, extra = {}, decide, secret = b.secret) {
  const res = await fetch(`${b.base}/v1/turn`, { method: "POST", headers: hdr(secret), body: JSON.stringify({ system: "You are the agent.", prompt: "hello", ...extra }) });
  if (res.status !== 200) return { status: res.status, json: await res.json(), events: [] };
  const events = [];
  let turnId = "";
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
      const data = JSON.parse(d);
      events.push([e, data]);
      if (e === "start") turnId = data.turnId;
      if (e === "approval_request" && decide) {
        const allow = decide(data, turnId);
        if (allow !== undefined) void call(b, "/v1/approval", { turnId, id: data.id, allow });
      }
    }
  }
  return { status: 200, events, turnId };
}
const ev = (r, name) => r.events.filter((e) => e[0] === name).map((e) => e[1]);
const ASK = (...asks) => `ASKJSON:${JSON.stringify(asks)}`;


describe("N1: the child's own cwd is checked at init", () => {
  it("a folder swapped AFTER the last pre-spawn check: the init check stops the child, nothing is written outside, code mode is off", async () => {
    const ws = mk("CodeC");
    const outside = mk("OutsideC");
    let swapped = false;
    const b = await start({ workspace: ws, beforeSpawn: () => { if (swapped) return; swapped = true; fs.rmSync(ws, { recursive: true }); fs.symlinkSync(outside, ws); } });
    const r = await turn(b, { mode: "code", prompt: "CODEWRITE" });
    expect(ev(r, "message")).toHaveLength(0);
    expect(ev(r, "error")[0].message).toBe("The bridge stopped this code turn: Claude Code did not start in the code folder.");
    await new Promise((res) => setTimeout(res, 500)); // the fake would have written after 200 ms
    expect(fs.readdirSync(outside)).toEqual([]);
    expect(await hello(b)).toMatchObject({ workspace: false });
  });
  it("a different real folder put at the path after the last check is stopped the same way", async () => {
    const ws = mk("CodeD");
    let n = 0;
    const b = await start({ workspace: ws, beforeSpawn: () => { if (n++ === 0) { fs.renameSync(ws, ws + ".old"); fs.mkdirSync(ws); } } });
    const r = await turn(b, { mode: "code", prompt: "CODEWRITE" });
    expect(ev(r, "error")[0].message).toMatch(/did not start in the code folder/);
    await new Promise((res) => setTimeout(res, 500));
    expect(fs.existsSync(path.join(ws, "hello.txt"))).toBe(false);
  });
  it("an init with no cwd stops a code turn; a chat turn does not need one", async () => {
    const ws = mk("CodeN");
    const b = await start({ workspace: ws });
    // FAKE_INIT_CWD=omit makes the stand-in leave cwd out of its init
    await b.bridge.close();
    const b2 = await start({ workspace: ws, env: { ...process.env, FAKE_CLAUDE_LOG: logFile, FAKE_INIT_CWD: "omit" } });
    expect(ev(await turn(b2, { mode: "code" }), "error")[0].message).toMatch(/did not start in the code folder/);
    const b3 = await start({ workspace: ws, env: { ...process.env, FAKE_CLAUDE_LOG: logFile, FAKE_INIT_CWD: "omit" } });
    expect(ev(await turn(b3, {}), "message")).toHaveLength(1);
  });
  it("an unchanged folder passes the init check (the stand-in reports its real cwd)", async () => {
    const ws = mk("CodeOk");
    const b = await start({ workspace: ws });
    expect(ev(await turn(b, { mode: "code" }), "message")).toHaveLength(1);
  });
});

describe("N4: inside means inside both physically and lexically", () => {
  it("nope/../link/secret and nope/../link/x.txt with link -> outside are denied at once", async () => {
    const ws = mk("CodeP");
    const out = mk("OutsideP");
    fs.symlinkSync(out, path.join(ws, "link"));
    const b = await start({ workspace: ws, approvalWaitMs: 300 });
    const r = await turn(b, { mode: "code", approval: "each-write", prompt: ASK(
      { tool_name: "Read", input: { file_path: "nope/../link/secret" } },
      { tool_name: "Write", input: { file_path: "nope/../link/x.txt", content: "x" } },
      { tool_name: "Write", input: { file_path: "nope/nope2/../../link/x.txt", content: "x" } },
      { tool_name: "Write", input: { file_path: "link/x.txt", content: "x" } },
      { tool_name: "Write", input: { file_path: "nope/../fine.txt", content: "x" } },
    ) });
    const d = rows("askjson").map((x) => x.decision.behavior);
    expect(d.slice(0, 4)).toEqual(["deny", "deny", "deny", "deny"]);
    expect(ev(r, "approval_request").map((q) => q.summary)).toEqual(["fine.txt"]);
  });
});

describe("N5: NotebookEdit and the other path keys", () => {
  it("NotebookEdit is decided on notebook_path; any path key outside denies a write tool at once", async () => {
    const ws = mk("CodeNb");
    const outside = path.join(mk("OutsideNb"), "x.ipynb");
    const b = await start({ workspace: ws, approvalWaitMs: 300 });
    const r = await turn(b, { mode: "code", approval: "each-write", prompt: ASK(
      { tool_name: "NotebookEdit", input: { file_path: "n.ipynb", notebook_path: outside } },
      { tool_name: "NotebookEdit", input: { file_path: "n.ipynb" } },
      { tool_name: "NotebookEdit", input: {} },
      { tool_name: "Write", input: { file_path: "a.txt", path: outside, content: "x" } },
      { tool_name: "Write", input: { file_path: "a.txt", notebook_path: outside, content: "x" } },
      { tool_name: "Edit", input: { file_path: "a.txt", path: 5 } },
      { tool_name: "NotebookEdit", input: { notebook_path: "n.ipynb", file_path: "n.ipynb" } },
    ) });
    const d = rows("askjson").map((x) => x.decision);
    expect(d.slice(0, 6)).toEqual(Array(6).fill({ behavior: "deny", message: "Outside the code folder." }));
    expect(ev(r, "approval_request")).toHaveLength(1);
    expect(ev(r, "approval_request")[0]).toMatchObject({ tool: "NotebookEdit", summary: "n.ipynb" });
  });
});

describe("N6: the folder-prefix test ignores case (macOS, Windows) and Unicode form", () => {
  it("on a pretend darwin, an absolute path in another case is inside; on a pretend linux it is not", async () => {
    const ws = mk("MyCode");
    fs.writeFileSync(path.join(ws, "a.txt"), "x");
    const upper = path.join(path.dirname(ws), "MYCODE", "a.txt");
    for (const [platform, want] of [["darwin", "allow"], ["linux", "deny"]]) {
      fs.rmSync(logFile, { force: true });
      const b = await start({ workspace: ws, approvalWaitMs: 300, codePlatform: undefined, platformOpts: { platform } });
      await turn(b, { mode: "code", approval: "each-write", prompt: ASK({ tool_name: "Read", input: { file_path: upper } }) });
      // on a case-sensitive pretend, the real (insensitive) disk still resolves the path physically; the lexical prefix test is what differs
      const d = rows("askjson").map((x) => x.decision.behavior);
      expect(d, platform).toEqual([want]);
      await b.bridge.close();
    }
  });
  it("an NFD spelling of an NFC folder name (and the reverse) is inside; the path handed to claude is not rewritten", async () => {
    const nfc = "caf\u00e9";
    const nfd = nfc.normalize("NFD");
    const ws = mk(nfd);
    fs.writeFileSync(path.join(ws, "a.txt"), "x");
    const b = await start({ workspace: ws, approvalWaitMs: 300, platformOpts: { platform: "linux" } });
    const input = { file_path: path.join(path.dirname(ws), nfc, "a.txt") };
    await turn(b, { mode: "code", approval: "each-write", prompt: ASK({ tool_name: "Read", input }) });
    const dec = rows("askjson").map((x) => x.decision);
    expect(dec[0].behavior).toBe("allow");
    expect(dec[0].updatedInput).toEqual(input); // not rewritten
  });
});
