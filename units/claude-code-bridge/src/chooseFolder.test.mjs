// @vitest-environment node
// Batch 4A: the code folder is chosen from chat and kept; Windows runs a files-only mode; a sandbox that cannot start gives a plain error.
// Hermetic: a stand-in `claude`, and the folder dialog is always injected (a real dialog never opens here).

import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeTurnSettings, createBridge, FILES_ONLY_TOOLS } from "../bridge/bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";

let dir, home, bridge, base, logFile, stateDir, wsFile;
const bridges = [];

function ensureDir() {
  if (!dir) {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-choose-")));
    home = path.join(dir, "home");
    stateDir = path.join(home, ".gilb-claude-code-bridge");
    fs.mkdirSync(stateDir, { recursive: true });
    wsFile = path.join(stateDir, "workspace.json");
    logFile = path.join(dir, "claude.log");
  }
}
/** Starts a bridge on a temp "home" with a state folder. `opts` go to createBridge. Returns the pairing secret. */
async function start(opts = {}, env = {}) {
  ensureDir();
  bridge = createBridge({
    port: 0,
    claudeBin: FAKE,
    allowedOrigins: [APP],
    workDir: path.join(dir, "work"),
    home,
    workspaceFile: wsFile,
    env: { ...process.env, FAKE_CLAUDE_LOG: logFile, ...env },
    ...opts,
  });
  bridges.push(bridge);
  await bridge.start();
  base = `http://127.0.0.1:${bridge.port}`;
  const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: bridge.pairingCode }) });
  return (await res.json()).secret;
}
afterEach(async () => {
  for (const b of bridges.splice(0)) await b.close();
  bridge = undefined;
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

const mk = (name) => {
  ensureDir();
  const p = path.join(home, name);
  fs.mkdirSync(p, { recursive: true });
  return fs.realpathSync(p);
};
const call = async (secret, route, body = {}) => {
  const res = await fetch(`${base}${route}`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const hello = async () => (await fetch(`${base}/v1/hello`)).json();
const runs = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.event === "run") : []);
async function turn(secret, extra = {}) {
  const res = await fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify({ system: "You are the agent.", prompt: "hello", ...extra }) });
  if (res.status !== 200) return { status: res.status, json: await res.json(), events: [] };
  const events = [];
  for (const blk of (await res.text()).split("\n\n")) {
    const e = /event: (.*)/.exec(blk)?.[1];
    const d = /data: (.*)/.exec(blk)?.[1];
    if (e) events.push([e, JSON.parse(d)]);
  }
  return { status: 200, events };
}
const ev = (r, name) => r.events.filter((e) => e[0] === name).map((e) => e[1]);
const stored = () => JSON.parse(fs.readFileSync(wsFile, "utf8"));

describe("POST /v1/workspace/choose", () => {
  it("a chosen folder is stored, switches the bridge, and shows in hello and /v1/workspace", async () => {
    const pick = mk("MyJackfruitCode");
    const secret = await start({ chooseFolder: async () => pick + "/" });
    expect(await hello()).toMatchObject({ workspace: false, codeMode: null });
    const r = await call(secret, "/v1/workspace/choose", { suggest: "MyJackfruitCode" });
    expect(r).toEqual({ status: 200, json: { chosen: true, name: "MyJackfruitCode", path: pick } });
    expect(stored()).toEqual({ version: 1, path: pick });
    expect((fs.statSync(wsFile).mode & 0o777).toString(8)).toBe("600");
    expect(fs.readdirSync(stateDir).filter((n) => n.endsWith(".tmp"))).toEqual([]);
    expect(await hello()).toMatchObject({ workspace: true, codeMode: "full" });
    expect((await call(secret, "/v1/workspace")).json).toEqual({ name: "MyJackfruitCode", path: pick });
  });

  it("needs pairing", async () => {
    await start({ chooseFolder: async () => null });
    const res = await fetch(`${base}/v1/workspace/choose`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(401);
  });

  it("cancel answers chosen:false and changes nothing", async () => {
    const secret = await start({ chooseFolder: async () => null });
    expect((await call(secret, "/v1/workspace/choose")).json).toEqual({ chosen: false });
    expect(fs.existsSync(wsFile)).toBe(false);
    expect((await hello()).workspace).toBe(false);
  });

  it("the home folder is refused with 422 and nothing is stored", async () => {
    const secret = await start({ chooseFolder: async () => home });
    const r = await call(secret, "/v1/workspace/choose");
    expect(r.status).toBe(422);
    expect(r.json.error).toMatch(/home folder/);
    expect(fs.existsSync(wsFile)).toBe(false);
    expect((await hello()).workspace).toBe(false);
  });

  it("a bad suggest is a 400", async () => {
    const secret = await start({ chooseFolder: async () => null });
    expect((await call(secret, "/v1/workspace/choose", { suggest: "a;b" })).status).toBe(400);
    expect((await call(secret, "/v1/workspace/choose", { suggest: "x".repeat(65) })).status).toBe(400);
  });

  it("a second dialog while one is open is 409", async () => {
    let release;
    let opened;
    const isOpen = new Promise((r) => (opened = r));
    const secret = await start({ chooseFolder: () => new Promise((r) => { opened(); release = r; }) });
    const first = call(secret, "/v1/workspace/choose");
    await isOpen;
    const second = await call(secret, "/v1/workspace/choose");
    expect(second.status).toBe(409);
    release(null);
    expect((await first).json).toEqual({ chosen: false });
  });

  it("is refused while a code turn runs", async () => {
    const ws = mk("Work");
    let called = false;
    const secret = await start({ workspace: ws, chooseFolder: async () => { called = true; return null; } });
    const running = turn(secret, { mode: "code", prompt: "WAITFOREVER" });
    for (let i = 0; i < 100 && runs().length === 0; i++) await new Promise((r) => setTimeout(r, 50));
    const r = await call(secret, "/v1/workspace/choose");
    expect(r).toEqual({ status: 409, json: { error: "A code turn is running. Wait for it to finish." } });
    expect(called).toBe(false);
    const c = await call(secret, "/v1/workspace/create", { name: "Other" });
    expect(c.status).toBe(409);
    bridge.server.closeAllConnections?.();
    await bridge.close();
    await running.catch(() => {});
  });

  it("Linux without zenity: 501 with the --workspace sentence", async () => {
    const secret = await start({ platformOpts: { platform: "linux" }, which: () => false });
    const r = await call(secret, "/v1/workspace/choose");
    expect(r).toEqual({ status: 501, json: { error: "No folder dialog on this computer. Start the bridge with --workspace <folder>." } });
  });
});

describe("POST /v1/workspace/create", () => {
  it("makes ~/<name> (mode 0700), stores and switches", async () => {
    const secret = await start();
    const r = await call(secret, "/v1/workspace/create", { name: "MyJackfruitCode" });
    const want = path.join(fs.realpathSync(home), "MyJackfruitCode");
    expect(r).toEqual({ status: 200, json: { name: "MyJackfruitCode", path: want } });
    expect((fs.statSync(want).mode & 0o777).toString(8)).toBe("700");
    expect(stored().path).toBe(want);
    expect(await hello()).toMatchObject({ workspace: true });
  });
  it("an empty existing folder is taken; one with files is 409", async () => {
    const secret = await start();
    mk("Empty");
    expect((await call(secret, "/v1/workspace/create", { name: "Empty" })).status).toBe(200);
    const full = mk("Full");
    fs.writeFileSync(path.join(full, "a.txt"), "x");
    const r = await call(secret, "/v1/workspace/create", { name: "Full" });
    expect(r).toEqual({ status: 409, json: { error: "The folder ~/Full already has files. Choose it with the folder dialog instead." } });
    expect(fs.existsSync(path.join(full, "a.txt"))).toBe(true);
  });
  it("a bad name is 400 and nothing is made", async () => {
    const secret = await start();
    for (const name of ["../x", "a/b", "", "..", ".", "x".repeat(65), 5, undefined]) {
      expect((await call(secret, "/v1/workspace/create", { name })).status, String(name)).toBe(400);
    }
    expect(fs.readdirSync(home)).toEqual([".gilb-claude-code-bridge"]);
  });
  it("a name the folder checks refuse (a secrets folder) is 422 and the new folder is removed", async () => {
    const secret = await start();
    const r = await call(secret, "/v1/workspace/create", { name: ".ssh" });
    expect(r.status).toBe(422);
    expect(fs.existsSync(path.join(home, ".ssh"))).toBe(false);
  });
});

describe("the stored folder", () => {
  it("survives a restart: code mode is on and a code turn runs in it", async () => {
    let secret = await start();
    await call(secret, "/v1/workspace/create", { name: "Kept" });
    await bridge.close();
    secret = await start();
    expect(await hello()).toMatchObject({ workspace: true, codeMode: "full" });
    const r = await turn(secret, { mode: "code" });
    expect(ev(r, "message")[0]).toMatchObject({ mode: "code" });
    expect(fs.realpathSync(runs()[0].cwd)).toBe(path.join(fs.realpathSync(home), "Kept"));
  });
  it("a stored folder that was deleted is ignored with a log line, and the bridge runs", async () => {
    const secret0 = await start();
    await call(secret0, "/v1/workspace/create", { name: "Gone" });
    await bridge.close();
    fs.rmSync(path.join(home, "Gone"), { recursive: true });
    const lines = [];
    await start({ log: (l) => lines.push(l) });
    expect(await hello()).toMatchObject({ workspace: false, codeMode: null });
    expect(lines.join("\n")).toMatch(/stored code folder is not used/);
  });
  it("a stored file that is not ours is ignored; a stored home folder is refused", async () => {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(wsFile, "not json");
    await start();
    expect((await hello()).workspace).toBe(false);
    await bridge.close();
    fs.writeFileSync(wsFile, JSON.stringify({ version: 1, path: home }));
    await start();
    expect((await hello()).workspace).toBe(false);
  });
  it("--workspace wins over a stored folder and is stored", async () => {
    const a = mk("A");
    const b = mk("B");
    fs.writeFileSync(wsFile, JSON.stringify({ version: 1, path: a }));
    await start({ workspace: b });
    expect(stored().path).toBe(b);
  });
});

describe("files-only mode (Windows)", () => {
  const win = { codePlatform: "win32" };
  it("hello says files-only; a code turn gets five tools, no sandbox, no npm cache, the files-only sentence", async () => {
    const ws = mk("W");
    const secret = await start({ workspace: ws, ...win });
    expect(await hello()).toMatchObject({ workspace: true, codeMode: "files-only" });
    const r = await turn(secret, { mode: "code" });
    expect(r.status).toBe(200);
    expect(ev(r, "message")[0]).toMatchObject({ mode: "code", codeMode: "files-only" });
    const run = runs()[0];
    const a = run.argv;
    const val = (f) => a[a.indexOf(f) + 1];
    expect(val("--tools")).toBe("Read,Edit,Write,Glob,Grep");
    expect(val("--tools")).toBe(FILES_ONLY_TOOLS.join(","));
    expect(a).toContain("--restricted");
    expect(val("--permission-mode")).toBe("acceptEdits");
    expect(val("--permission-prompts")).toBe("none");
    const settings = JSON.parse(val("--settings"));
    expect(settings).not.toHaveProperty("sandbox");
    expect(settings.permissions).toEqual({ deny: ["WebFetch", "WebSearch"], disableBypassPermissionsMode: "disable" });
    expect(settings).toEqual(codeTurnSettings(os.homedir(), "win32"));
    const sys = val("--append-system-prompt");
    expect(sys).toContain("You cannot run commands on this computer: you can only read and write files in this folder. If a step needs a command (install, build, run), tell the person the exact command to run themselves.");
    expect(sys).not.toContain("The network reaches only package registries.");
    expect(run.npmCache).toBe(process.env.npm_config_cache);
  });
  it("each-write keeps its asking flags in files-only mode", async () => {
    const ws = mk("W2");
    const secret = await start({ workspace: ws, ...win });
    await turn(secret, { mode: "code", approval: "each-write" });
    const a = runs()[0].argv;
    expect(a[a.indexOf("--permission-mode") + 1]).toBe("manual");
    expect(a[a.indexOf("--tools") + 1]).toBe("Read,Edit,Write,Glob,Grep");
  });
  it("the init check allows only the five tools: Bash in the init stops the turn", async () => {
    const ws = mk("W3");
    const secret = await start({ workspace: ws, ...win }, { FAKE_INIT_TOOLS: JSON.stringify(["Read", "Bash"]) });
    const r = await turn(secret, { mode: "code" });
    expect(ev(r, "message")).toHaveLength(0);
    expect(ev(r, "error")[0].message).toMatch(/did not start with the folder limits/);
  });
  it("the init with exactly the five tools passes", async () => {
    const ws = mk("W4");
    const secret = await start({ workspace: ws, ...win }, { FAKE_INIT_TOOLS: JSON.stringify([...FILES_ONLY_TOOLS, "mcp__gilb__list_vaults"]) });
    expect(ev(await turn(secret, { mode: "code" }), "message")).toHaveLength(1);
  });
  it("a full-mode turn still lists Bash, keeps its sandbox, and the message carries no codeMode", async () => {
    const ws = mk("F");
    const secret = await start({ workspace: ws });
    const r = await turn(secret, { mode: "code" });
    expect(ev(r, "message")[0]).not.toHaveProperty("codeMode");
    expect(JSON.parse(runs()[0].argv[runs()[0].argv.indexOf("--settings") + 1])).toHaveProperty("sandbox");
  });
});

describe("a sandbox that cannot start", () => {
  it("full mode: the turn error names the sandbox and carries the CLI's last stderr line", async () => {
    const ws = mk("S");
    const secret = await start({ workspace: ws });
    const r = await turn(secret, { mode: "code", prompt: "SANDBOXFAIL" });
    expect(ev(r, "message")).toHaveLength(0);
    expect(ev(r, "error")[0].message).toBe("Claude Code could not start its sandbox on this computer, so the code turn was stopped. Error: sandbox required but unavailable: bubblewrap (bwrap) is not installed");
  });
  it("a chat turn that stops without an answer keeps the old message", async () => {
    const ws = mk("S2");
    const secret = await start({ workspace: ws });
    const r = await turn(secret, { prompt: "SANDBOXFAIL" });
    expect(ev(r, "error")[0].message).toMatch(/^Claude Code stopped without an answer\./);
  });
});
