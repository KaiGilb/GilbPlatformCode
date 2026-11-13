// @vitest-environment node
// Batch 7 (QA round 2 fixes): snapshot first then check with device+inode, glob patterns, ~ paths, physical resolution of link/..
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


describe("N1: the folder is checked after the snapshot, with device and inode", () => {
  it("a swap between the snapshot and the check (hook) gives 409 and no claude run; code mode is off", async () => {
    const ws = mk("Code1");
    const outside = mk("Outside");
    let swapped = false;
    const b = await start({ workspace: ws, afterSnapshot: () => { if (swapped) return; swapped = true; fs.rmSync(ws, { recursive: true }); fs.symlinkSync(outside, ws); } });
    const r = await turn(b, { mode: "code", prompt: "CODEWRITE" });
    expect(r).toMatchObject({ status: 409, json: { error: "The code folder changed on disk. Choose it again." } });
    expect(rows("run")).toHaveLength(0);
    expect(fs.readdirSync(outside)).toEqual([]);
    expect(await hello(b)).toMatchObject({ workspace: false });
  });
  it("a different real folder put at the same path (hook, and before a turn) is 409 on device+inode alone", async () => {
    const ws = mk("Code2");
    const b = await start({ workspace: ws });
    expect((await turn(b, { mode: "code" })).status).toBe(200);
    fs.renameSync(ws, ws + ".old");
    fs.mkdirSync(ws);
    const r = await turn(b, { mode: "code" });
    expect(r.status).toBe(409);
    expect(rows("run")).toHaveLength(1);
    // and the same through the hook, on a fresh bridge
    const ws2 = mk("Code2b");
    let n = 0;
    const b2 = await start({ workspace: ws2, afterSnapshot: () => { if (n++ === 0) { fs.renameSync(ws2, ws2 + ".old"); fs.mkdirSync(ws2); } } });
    expect((await turn(b2, { mode: "code" })).status).toBe(409);
    expect(rows("run")).toHaveLength(1);
  });
  it("the identity is recorded for a created folder and a stored one: both keep working while unchanged, and a swap is caught", async () => {
    const b = await start();
    await call(b, "/v1/workspace/create", { name: "Made" });
    expect((await turn(b, { mode: "code" })).status).toBe(200);
    await b.bridge.close();
    const b2 = await start();
    expect(await hello(b2)).toMatchObject({ workspace: true });
    expect((await turn(b2, { mode: "code" })).status).toBe(200);
    fs.renameSync(path.join(home, "Made"), path.join(home, "Made.old"));
    fs.mkdirSync(path.join(home, "Made"));
    expect((await turn(b2, { mode: "code" })).status).toBe(409);
  });
});

describe("N2: each-write globs", () => {
  const decide = async (asks) => {
    const ws = mk("CodeG");
    const b = await start({ workspace: ws, approvalWaitMs: 300 });
    await turn(b, { mode: "code", approval: "each-write", prompt: ASK(...asks.map(([tool_name, input]) => ({ tool_name, input }))) });
    return rows("askjson").map((x) => x.decision.behavior);
  };
  it("climbing, absolute, brace, bracket, backslash and ~ patterns are denied at once; plain ones are allowed", async () => {
    const bad = ["*/../../*", "**/../*", "{..,x}/*", "[.][.]/*", "*/../../../.ssh/*", "..\\*", "{/etc,x}/*", "**/../../**", "../*", "./../*", "sub/../../*", "sub/../*", "/etc/*", "\\etc\\*", "~/.ssh/*", "C:/Users/*", "*.{ts,tsx}", "a b/*", ""];
    const good = ["*", "**/*.txt", "src/**/*.ts", "a?.js", "dir.name/*", ".hidden/*"];
    const d = await decide([...bad, ...good].map((p) => ["Glob", { pattern: p }]));
    expect(d.slice(0, bad.length), JSON.stringify(bad.filter((_, i) => d[i] !== "deny"))).toEqual(Array(bad.length).fill("deny"));
    expect(d.slice(bad.length)).toEqual(Array(good.length).fill("allow"));
  });
  it("Grep's glob filter is held to the same rule; Grep's regex pattern is free", async () => {
    const d = await decide([["Grep", { pattern: "a(b|c)[x]+\\.", glob: "**/*.ts" }], ["Grep", { pattern: "a", glob: "../*" }], ["Grep", { pattern: "a", glob: "{..,x}/*" }], ["Grep", { pattern: "a" }]]);
    expect(d).toEqual(["allow", "deny", "deny", "allow"]);
  });
  it("a non-string or empty path is denied for Glob and Grep; an absent path is the folder", async () => {
    const d = await decide([["Grep", { pattern: "a", path: ["x"] }], ["Grep", { pattern: "a", path: {} }], ["Grep", { pattern: "a", path: "" }], ["Glob", { pattern: "*", path: 5 }], ["Glob", { pattern: "*", path: null }], ["Glob", { pattern: "*", path: "" }], ["Glob", { pattern: "*" }], ["Grep", { pattern: "a", path: "." }]]);
    expect(d).toEqual(["deny", "deny", "deny", "deny", "deny", "deny", "allow", "allow"]);
  });
});

describe("N3: a path that starts with ~ is outside, for every tool", () => {
  it("Read, Write, Edit, NotebookEdit, Glob path and Grep path are denied at once, with no question", async () => {
    const ws = mk("CodeT");
    const b = await start({ workspace: ws, approvalWaitMs: 300 });
    const r = await turn(b, { mode: "code", approval: "each-write", prompt: ASK(
      { tool_name: "Read", input: { file_path: "~/.ssh/id_rsa" } }, { tool_name: "Read", input: { file_path: "~" } },
      { tool_name: "Write", input: { file_path: "~/x.txt", content: "x" } }, { tool_name: "Write", input: { file_path: "~" } },
      { tool_name: "Edit", input: { file_path: "~/.bashrc" } }, { tool_name: "NotebookEdit", input: { notebook_path: "~/n.ipynb" } },
      { tool_name: "Glob", input: { pattern: "*", path: "~" } }, { tool_name: "Grep", input: { pattern: "a", path: "~/.ssh" } },
      { tool_name: "Read", input: { file_path: "$HOME/.ssh/id_rsa" } },
    ) });
    const d = rows("askjson").map((x) => x.decision);
    expect(d).toHaveLength(9);
    for (const x of d) expect(x).toEqual({ behavior: "deny", message: "Outside the code folder." });
    expect(ev(r, "approval_request")).toHaveLength(0);
  });
});

describe("link/../x is resolved like the OS", () => {
  it("a live link to an outside folder: link/../x is the outside folder's parent, so outside; a link to an inside folder keeps it inside", async () => {
    const ws = mk("CodeL");
    const outsideDeep = path.join(mk("OutsideL"), "deep");
    fs.mkdirSync(outsideDeep);
    fs.symlinkSync(outsideDeep, path.join(ws, "out"));
    fs.mkdirSync(path.join(ws, "real", "inner"), { recursive: true });
    fs.symlinkSync(path.join(ws, "real", "inner"), path.join(ws, "in"));
    fs.symlinkSync(path.join(dir, "nowhere"), path.join(ws, "dang"));
    const b = await start({ workspace: ws, approvalWaitMs: 300 });
    const r = await turn(b, { mode: "code", approval: "each-write", prompt: ASK(
      { tool_name: "Write", input: { file_path: "out/../x.txt", content: "x" } },
      { tool_name: "Read", input: { file_path: "out/../../y.txt" } },
      { tool_name: "Write", input: { file_path: "dang/../z.txt", content: "x" } },
      { tool_name: "Write", input: { file_path: "in/../ok.txt", content: "x" } },
      { tool_name: "Write", input: { file_path: "real/../ok2.txt", content: "x" } },
      { tool_name: "Glob", input: { pattern: "*", path: "out/.." } },
    ) });
    const d = rows("askjson").map((x) => x.decision.behavior);
    expect(d.slice(0, 3)).toEqual(["deny", "deny", "deny"]);
    expect(d[5]).toBe("deny");
    expect(ev(r, "approval_request").map((q) => q.summary)).toEqual(["real/ok.txt".replace("real/", ""), "ok2.txt"].map((x) => x));
  });
});
