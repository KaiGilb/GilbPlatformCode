// @vitest-environment node
// Batches 10 and 11 (QA rounds 5 and 6): a code turn's child gets an allow-listed environment (one spelling per name, no secret-looking LC_ names); CLAUDE_CONFIG_DIR is unreadable
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge, codeChildEnv, codeTurnSettings, CODE_ENV_ALLOW, childEnv } from "../bridge/bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";
const APP2 = "http://localhost:5198";

let dir, home, stateDir, wsFile, logFile;
const bridges = [];
function ensureDir() {
  if (dir) return;
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-6a-")));
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
  const bridge = createBridge({ port: 0, claudeBin: FAKE, allowedOrigins: [APP, APP2], workDir: path.join(dir, "work"), home, workspaceFile: wsFile, codePlatform: "darwin", env: { ...process.env, FAKE_CLAUDE_LOG: logFile }, ...opts });
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


const SECRETS = { GITHUB_TOKEN: "gh-fake", AWS_SECRET_ACCESS_KEY: "aws-fake", NPM_TOKEN: "npm-fake", SSH_AUTH_SOCK: "/tmp/agent.sock", MY_RANDOM_VAR: "x", CLAUDE_CODE_SOME_KEY: "k" };
const ORDINARY = { HTTPS_PROXY: "http://proxy.example:3128", LC_ALL: "C", LANG: "C" };
const keysOf = (r) => JSON.parse(/^envkeys:(.*)$/s.exec(ev(r, "message")[0].content)[1]);
const has = (keys, name) => keys.some((k) => k.toLowerCase() === name.toLowerCase());

describe("N7: the code child's environment", () => {
  const env = () => ({ ...process.env, ...SECRETS, ...ORDINARY, FAKE_CLAUDE_LOG: logFile });
  for (const [label, extra] of [["full", {}], ["files-only", { codePlatform: "win32" }]]) {
    it(`${label}: no token, key, socket or random variable reaches the child; PATH, HOME, LANG, HTTPS_PROXY and LC_ALL do`, async () => {
      const ws = mk("CodeEnv" + label);
      const b = await start({ workspace: ws, env: env(), ...extra });
      const r = await turn(b, { mode: "code", prompt: "ENVKEYS" });
      expect(ev(r, "message")).toHaveLength(1);
      const keys = keysOf(r);
      for (const bad of Object.keys(SECRETS)) expect(has(keys, bad), bad).toBe(false);
      for (const good of ["PATH", "LANG", "HTTPS_PROXY", "LC_ALL"]) expect(has(keys, good), good).toBe(true);
      if (process.platform !== "win32") expect(has(keys, "HOME")).toBe(true);
      expect(has(keys, "MCP_TOOL_TIMEOUT")).toBe(true);
    });
  }
  it("a chat turn still gets all of them, as before", async () => {
    const ws = mk("CodeEnvChat");
    const b = await start({ workspace: ws, env: env() });
    const r = await turn(b, { prompt: "ENVKEYS" });
    const keys = keysOf(r);
    for (const name of [...Object.keys(SECRETS), ...Object.keys(ORDINARY)]) expect(has(keys, name), name).toBe(true);
  });
  it("the billing variables are still removed first", async () => {
    const ws = mk("CodeEnvBill");
    const b = await start({ workspace: ws, env: { ...env(), ANTHROPIC_API_KEY: "sk-fake" } });
    expect(has(keysOf(await turn(b, { mode: "code", prompt: "ENVKEYS" })), "ANTHROPIC_API_KEY")).toBe(false);
  });
});

describe("codeChildEnv", () => {
  it("keeps the allow-list, LC_*, and CLAUDE_CODE_* except names with TOKEN, KEY or SECRET; drops everything else", () => {
    const out = codeChildEnv({ PATH: "/bin", HOME: "/h", LC_CTYPE: "UTF-8", CLAUDE_CONFIG_DIR: "/c", CLAUDE_CODE_FOO: "1", CLAUDE_CODE_API_KEY: "k", CLAUDE_CODE_MY_TOKEN: "t", CLAUDE_CODE_X_SECRET: "s", GITHUB_TOKEN: "g", ANTHROPIC_API_KEY: "a", http_proxy: "p", XDG_CONFIG_HOME: "/x", NVM_DIR: "/n", SystemRoot: "C:\\Windows" }, "linux");
    expect(Object.keys(out).sort()).toEqual(["CLAUDE_CODE_FOO", "CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT", "CLAUDE_CONFIG_DIR", "HOME", "LC_CTYPE", "MCP_TOOL_TIMEOUT", "NVM_DIR", "PATH", "XDG_CONFIG_HOME", "http_proxy"]);
    expect(CODE_ENV_ALLOW).toContain("COREPACK_HOME");
  });
  it("win32: names match without regard to case, and the Windows names are kept; on linux they are exact", () => {
    const e = { Path: "C:\\x", SYSTEMROOT: "C:\\Windows", comspec: "cmd", "ProgramFiles(x86)": "p", AWS_SECRET_ACCESS_KEY: "s", Github_Token: "g" };
    expect(Object.keys(codeChildEnv(e, "win32")).sort()).toEqual(["CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT", "MCP_TOOL_TIMEOUT", "Path", "ProgramFiles(x86)", "SYSTEMROOT", "comspec"].sort());
    expect(Object.keys(codeChildEnv(e, "linux")).sort()).toEqual(["CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT", "MCP_TOOL_TIMEOUT"]);
  });
  it("starts from childEnv: it adds nothing childEnv did not have except its own timeouts", () => {
    const base = childEnv({ PATH: "/bin" });
    expect(Object.keys(codeChildEnv({ PATH: "/bin" }, "linux")).sort()).toEqual(Object.keys(base).sort());
  });
});

describe("N8: CLAUDE_CONFIG_DIR is unreadable in a code turn", () => {
  it("codeTurnSettings adds it (made absolute, ~ left as is) when given, and nothing when not", () => {
    const abs = path.resolve("some/cfg");
    expect(codeTurnSettings("/Users/p", "darwin", [], "session", "some/cfg").sandbox.filesystem.denyRead).toContain(abs);
    expect(codeTurnSettings("/Users/p", "darwin", [], "session", "~/.claude-alt").sandbox.filesystem.denyRead).toContain("~/.claude-alt");
    expect(codeTurnSettings("/Users/p", "darwin", [], "session", "  ").sandbox.filesystem.denyRead).toEqual(codeTurnSettings("/Users/p", "darwin").sandbox.filesystem.denyRead);
    expect(codeTurnSettings("/Users/p", "darwin")).toEqual(codeTurnSettings("/Users/p", "darwin", [], "session", ""));
  });
  it("a code turn's --settings carries the person's CLAUDE_CONFIG_DIR; with it unset there is no such entry", async () => {
    const cfg = path.join(mk("CfgHolder"), "claude-cfg");
    const ws = mk("CodeCfg");
    const b = await start({ workspace: ws, codeEnvExtraPrefixes: ["FAKE_"], env: { ...process.env, FAKE_CLAUDE_LOG: logFile, CLAUDE_CONFIG_DIR: cfg } });
    await turn(b, { mode: "code" });
    const settingsOf = (i) => { const a = rows("run")[i].argv; return JSON.parse(a[a.indexOf("--settings") + 1]); };
    expect(settingsOf(0).sandbox.filesystem.denyRead).toContain(cfg);
    await b.bridge.close();
    const env2 = { ...process.env, FAKE_CLAUDE_LOG: logFile };
    delete env2.CLAUDE_CONFIG_DIR;
    const b2 = await start({ workspace: ws, codeEnvExtraPrefixes: ["FAKE_"], env: env2 });
    await turn(b2, { mode: "code" });
    expect(settingsOf(1).sandbox.filesystem.denyRead).not.toContain(cfg);
    expect(settingsOf(1).sandbox.filesystem.denyRead).toEqual(codeTurnSettings(os.homedir(), "darwin").sandbox.filesystem.denyRead);
  });
});

describe("L11: one spelling per name on Windows", () => {
  it("Path+PATH and SystemRoot+SYSTEMROOT give one each, the allow-list's spelling preferred, else the first seen", () => {
    const out = codeChildEnv({ Path: "a", PATH: "b", SYSTEMROOT: "x", SystemRoot: "y", comspec: "c1", COMSPEC: "c2", Temp: "t1", TEMP: "t2" }, "win32");
    const names = Object.keys(out).filter((k) => !/MCP_TOOL/.test(k));
    expect(names.sort()).toEqual(["PATH", "SystemRoot", "TEMP", "comspec"].sort()); // PATH, SystemRoot, TEMP are the list's own spellings; no spelling of ComSpec is, so the first seen stays
    expect(out.PATH).toBe("b");
    expect(out.SystemRoot).toBe("y");
  });
  it("when no spelling is the list's own, the first seen is kept", () => {
    const out = codeChildEnv({ comspec: "c1", COMSPEC: "c2" }, "win32");
    expect(Object.keys(out).filter((k) => k.toUpperCase() === "COMSPEC")).toEqual(["comspec"]);
  });
});

describe("L13: secret-looking LC_ names are stripped", () => {
  it("LC_SECRET, lc_token and LC_API_KEY go; LC_ALL and LC_CTYPE stay", () => {
    const out = codeChildEnv({ LC_SECRET: "s", lc_token: "t", LC_API_KEY: "k", LC_ALL: "C", LC_CTYPE: "UTF-8" }, "linux");
    expect(Object.keys(out).filter((k) => /^lc_/i.test(k)).sort()).toEqual(["LC_ALL", "LC_CTYPE"]);
  });
});
