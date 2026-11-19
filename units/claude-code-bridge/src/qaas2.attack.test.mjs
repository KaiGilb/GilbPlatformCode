// @vitest-environment node
// Hostile review QAAS2 (round 2) of bridge 0.3.19, ported from the reviewer's attack tests. They proved each hole; here every one asserts the FIXED
// behavior (they fail on b68ca8d and pass after), plus a test per fix. No real dialog: the dialog is injected, nothing here can run a system dialog
// program. The only system program that runs is `ps` (a read-only process list) under the processes of the test's own fake claude.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 60000, hookTimeout: 30000 });
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import * as B from "../bridge/bridge.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const { createBridge, parseCli } = B;
// These tests rely on POSIX behaviour (process groups, chmod, symlinks, ps); on Windows only the pure ones run (the real Windows paths are covered by the Windows end-to-end jobs).
const D = process.platform === "win32" ? describe.skip : describe;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const RUNNER = path.join(HERE, "qaas2.runner.mjs");
const APP = "http://localhost:5197";

let dir, home, stateDir, accessFile, logFile, base, lastSecret;
const bridges = [], open = [], procs = [], pids = [];
const clock = { t: Date.parse("2026-11-19T10:00:00Z") };

function prep() {
  if (dir) return;
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "qaas2-")));
  home = path.join(dir, "home");
  stateDir = path.join(home, ".gilb-claude-code-bridge");
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  accessFile = path.join(stateDir, "access.json");
  logFile = path.join(dir, "claude.log");
}
const ws = () => { prep(); const p = path.join(home, "Work"); fs.mkdirSync(path.join(p, "alpha"), { recursive: true }); return fs.realpathSync.native(p); };
async function startBridge(opts = {}) {
  prep();
  const b = createBridge({
    port: 0, claudeBin: FAKE, allowedOrigins: [APP, "http://[::1]:5197", "https://gilb.example.test"], workDir: path.join(dir, "work"), home, stateDir,
    codeEnvExtraPrefixes: ["FAKE_"], codePlatform: "darwin", now: () => clock.t, killGraceMs: 300, snapshotMs: 100,
    accessRun: async () => ({ code: null, stdout: "", stderr: "", killed: false, spawnError: true }), // default: the program runner under the real dialog can run nothing, so no real window can ever open
    env: { ...process.env, FAKE_CLAUDE_LOG: logFile }, ...opts,
  });
  bridges.push(b);
  await b.start();
  base = `http://127.0.0.1:${b.port}`;
  const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json", origin: APP }, body: JSON.stringify({ code: b.pairingCode }) });
  lastSecret = (await res.json()).secret;
  return { bridge: b, secret: lastSecret };
}
afterEach(async () => {
  for (const t of open.splice(0)) t.ctl.abort();
  for (const p of procs.splice(0)) { try { p.kill("SIGKILL"); } catch { /* gone */ } }
  for (const b of bridges.splice(0)) await b.close().catch(() => {});
  for (const p of pids.splice(0)) { try { process.kill(-p, "SIGKILL"); } catch { /* gone */ } try { process.kill(p, "SIGKILL"); } catch { /* gone */ } }
  if (logFile && fs.existsSync(logFile)) {
    for (const l of fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean)) {
      try { const r = JSON.parse(l); if (r.pid && ["esc", "grp", "child", "run"].includes(r.event)) { try { process.kill(r.pid, "SIGKILL"); } catch { /* gone */ } } } catch { /* not json */ }
    }
  }
  try { fs.chmodSync(stateDir, 0o700); } catch { /* none */ }
  if (dir) await removeTestDir(dir);
  dir = undefined;
  clock.t = Date.parse("2026-11-19T10:00:00Z");
});
const accessReq = async (secret, body, headers = {}, b = base) => {
  const res = await fetch(`${b}/v1/access`, { method: "POST", headers: { "content-type": "application/json", origin: APP, ...(secret ? { "x-bridge-secret": secret } : {}), ...headers }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const helloFor = async (secret, b = base) => (await fetch(`${b}/v1/hello`, { headers: { origin: APP, "x-bridge-secret": secret } })).json();
const rows = (event) => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.event === event) : []);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { for (let i = 0; i < ms / 25; i++) { const v = await fn(); if (v) return v; await sleep(25); } throw new Error("timed out"); };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function codeTurn(b, secret, prompt) {
  const ctl = new AbortController();
  const res = await fetch(`${b}/v1/turn`, { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", origin: APP, "x-bridge-secret": secret }, body: JSON.stringify({ system: "s", prompt, mode: "code" }) });
  const t = { status: res.status, ctl, json: null };
  open.push(t);
  if (res.status !== 200) { t.json = await res.json().catch(() => null); return t; }
  const reader = res.body.getReader();
  (async () => { try { for (;;) { const { done } = await reader.read(); if (done) break; } } catch { /* hung up */ } })();
  return t;
}

D("QAAS2 G1 (HIGH): a child that leaves the process group is found as a recorded descendant", () => {
  for (const [kind, prompt] of [["setsid (node detached)", "ESC_SETSID"], ["perl POSIX::setsid", "ESC_PERLSETSID"]]) {
    it(`${kind}: POST folder ends the escapee before it answers`, async () => {
      const { secret } = await startBridge({ workspace: ws(), fullAccess: true });
      await codeTurn(base, secret, `${prompt} WAITFOREVER`);
      const esc = (await until(() => rows("esc")[0])).pid;
      pids.push(esc);
      expect(alive(esc)).toBe(true);
      const r = await accessReq(secret, { mode: "folder" });
      expect(r.json.cancelled).toBe(1);
      expect(alive(esc)).toBe(false);
    });
  }
  it("claude exits at once leaving a setsid escapee: it is swept, and ON is refused (409) until it is gone", async () => {
    const dialog = vi.fn(async () => "cancel");
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialog });
    await codeTurn(base, secret, "ESC_SETSID EXITNOW");
    const esc = (await until(() => rows("esc")[0])).pid;
    pids.push(esc);
    let saw409 = false;
    await until(async () => {
      const r = await accessReq(secret, { mode: "computer" });
      if (r.status === 409) saw409 = true;
      return r.status === 403; // the dialog was reached: nothing was left
    });
    expect(alive(esc)).toBe(false);
    expect(saw409 || dialog.mock.calls.length === 1).toBe(true);
  });
  it("a FORGED tag is nothing: a process carrying GILB_BRIDGE_TURN=<anything> in its environment or arguments is never killed, and never blocks ON", async () => {
    const dialog = vi.fn(async () => "cancel");
    prep();
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialog });
    const id = fs.readFileSync(path.join(stateDir, "install-id"), "utf8").trim(); // the install id is not secret: the AI sees it in its own environment
    const fake = `GILB_BRIDGE_TURN=${id}.0123456789abcdef`;
    const strays = [
      spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", env: { PATH: process.env.PATH, GILB_BRIDGE_TURN: `${id}.0123456789abcdef` } }),
      spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", fake], { stdio: "ignore" }),
    ];
    for (const k of strays) pids.push(k.pid);
    await sleep(300);
    expect((await accessReq(secret, { mode: "folder" })).status).toBe(200); // a sweep that trusted tags would kill them here
    expect((await accessReq(secret, { mode: "computer" })).status).toBe(403); // not blocked: the dialog was reached
    await bridges.pop().close();
    await startBridge({ workspace: ws() }); // and neither a close nor a start kills them
    for (const k of strays) expect(alive(k.pid)).toBe(true);
  });
  it("no code child carries any bridge tag in its environment any more", async () => {
    const { secret } = await startBridge({ workspace: ws() });
    await codeTurn(base, secret, "WAITFOREVER");
    const run = await until(() => rows("run")[0]);
    expect(run.envKeys.some((k) => /GILB_BRIDGE/.test(k))).toBe(false);
    expect(B.tagOf).toBeUndefined();
    expect(B.TURN_TAG_ENV).toBeUndefined();
  });
  it("a recorded descendant whose pid now has ANOTHER start time (a recycled pid) is not killed", async () => {
    prep();
    const stray = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    pids.push(stray.pid);
    let phase = 1;
    let claudePid = 0;
    const procList = async () => (claudePid ? [{ pid: claudePid, ppid: 1, start: "C" }, phase === 1 ? { pid: stray.pid, ppid: claudePid, start: "S1" } : { pid: stray.pid, ppid: 1, start: "S2" }] : []); // later: the pid is an unrelated process
    const { secret } = await startBridge({ workspace: ws(), fullAccess: true, procList });
    await codeTurn(base, secret, "WAITFOREVER");
    claudePid = (await until(() => rows("run")[0])).pid;
    await sleep(700); // snapshots record stray (start "S1") below claude
    phase = 2; // the pid is now somebody else's process
    await accessReq(secret, { mode: "folder" });
    expect(alive(stray.pid)).toBe(true);
    await until(async () => (await accessReq(secret, { mode: "computer" })).status !== 409); // and it does not hold ON back (the default dialog refuses: 501)
  });
  it("killPids sends SIGKILL only to what the fresh check still confirms", async () => {
    const k = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(() => {}, 1000)"], { stdio: "ignore" });
    pids.push(k.pid);
    await sleep(300);
    const left = await B.killPids([k.pid], { graceMs: 200, stillMine: async () => [] });
    expect(left).toEqual([k.pid]);
    expect(alive(k.pid)).toBe(true);
    await B.killPids([k.pid], { graceMs: 200, stillMine: async (a) => a });
    expect(alive(k.pid)).toBe(false);
  });
  it("a helper that scrubbed its environment (env -i) is still caught when it was seen below claude (the ppid walk); a folder turn is not touched by a switch to folder", async () => {
    const { secret } = await startBridge({ workspace: ws(), fullAccess: true });
    await codeTurn(base, secret, "ESC_SCRUBENV WAITFOREVER");
    const esc = (await until(() => rows("esc")[0])).pid;
    pids.push(esc);
    await sleep(500); // a few snapshots (100 ms here)
    await accessReq(secret, { mode: "folder" });
    expect(alive(esc)).toBe(false);
  });
  it("what it cannot see: an environment-scrubbed process that was never seen below claude is not found (documented limit; the dialog, the caps and the lock remain)", async () => {
    const rowsSeen = B.descendantsOf([{ pid: 10, ppid: 1, start: "a", tag: null }, { pid: 11, ppid: 1, start: "b", tag: null }], 5);
    expect(rowsSeen).toEqual([]); // reparented to init and unseen: no link left to walk
  });
});

D("QAAS2 G2 (MED): orphans after the bridge dies", () => {
  const startRunner = async (extraEnv = {}) => {
    prep(); ws();
    const p = spawn(process.execPath, [RUNNER, dir, home, stateDir, FAKE, logFile, path.join(home, "Work")], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, ...extraEnv } });
    procs.push(p);
    const info = await new Promise((res, rej) => { let b = ""; p.stdout.on("data", (d) => { b += d; try { res(JSON.parse(b)); } catch { /* partial */ } }); p.on("exit", () => rej(new Error("runner exit"))); });
    return { p, base: `http://127.0.0.1:${info.port}`, secret: info.secret };
  };
  it("kill -9 of the bridge: the next start (same state folder) stops what it left, before it listens, and ON is not allowed on top of it", async () => {
    const r = await startRunner({ RUN_FULL: "1" });
    await codeTurn(r.base, r.secret, "GRP_PLAIN ESC_SETSID WAITFOREVER");
    const claudePid = (await until(() => rows("run")[0])).pid;
    const kid = (await until(() => rows("grp")[0])).pid;
    const esc = (await until(() => rows("esc")[0])).pid;
    pids.push(claudePid, kid, esc);
    await until(() => { try { const g = JSON.parse(fs.readFileSync(path.join(stateDir, "live-groups.json"), "utf8")).groups.find((x) => x.pid === claudePid && x.start); return g && [kid, esc].every((p) => g.desc.some((d) => d[0] === p)); } catch { return false; } });
    r.p.kill("SIGKILL");
    await sleep(600);
    expect(alive(claudePid) && alive(kid) && alive(esc)).toBe(true); // orphans, as the reviewer showed
    const dialog = vi.fn(async () => "cancel");
    await startBridge({ workspace: ws(), accessDialog: dialog }); // start() sweeps
    expect(alive(claudePid)).toBe(false);
    expect(alive(kid)).toBe(false);
    expect(alive(esc)).toBe(false);
  });
  it("SIGHUP (the Terminal is closed) and SIGTERM close the bridge and everything under it", async () => {
    for (const sig of ["SIGHUP", "SIGTERM"]) {
      const r = await startRunner({ RUN_FULL: "1" });
      await codeTurn(r.base, r.secret, "GRP_PLAIN WAITFOREVER");
      const claudePid = (await until(() => rows("run").at(-1))).pid;
      const kid = (await until(() => rows("grp").at(-1))).pid;
      pids.push(claudePid, kid);
      r.p.kill(sig);
      await until(() => !alive(claudePid) && !alive(kid), 10000);
      await new Promise((res) => r.p.on("exit", res));
      fs.rmSync(logFile, { force: true });
    }
  });
  it("the exit hook is the last resort: killAllSync kills what is tracked, synchronously", async () => {
    const { secret, bridge } = await startBridge({ workspace: ws() });
    await codeTurn(base, secret, "GRP_PLAIN WAITFOREVER");
    const claudePid = (await until(() => rows("run")[0])).pid;
    const kid = (await until(() => rows("grp")[0])).pid;
    bridge.killAllSync();
    await until(() => !alive(claudePid) && !alive(kid), 5000);
  });
  it("an update waits for / refuses while a code child lives, even after its page hung up", async () => {
    const { secret } = await startBridge({ workspace: ws(), killGraceMs: 2500 });
    const t = await codeTurn(base, secret, "IGNORETERM WAITFOREVER");
    const pid = (await until(() => rows("run")[0])).pid;
    pids.push(pid);
    t.ctl.abort();
    await sleep(200);
    const res = await fetch(`${base}/v1/update`, { method: "POST", headers: { "content-type": "application/json", origin: APP, "x-bridge-secret": secret }, body: "{}" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("TurnRunning");
  });
});

describe("QAAS2 G3 (MED): Windows", () => {
  it("the process list comes from the system PowerShell in the real SystemRoot", async () => {
    const calls = [];
    const run = async (file, args, env) => { calls.push({ file, args, env }); return JSON.stringify([{ ProcessId: 40, ParentProcessId: 4, CreationDate: "20261119100000.000000+120" }, { ProcessId: 41, ParentProcessId: 40, CreationDate: "20261119100001.000000+120" }]); };
    const procs2 = await B.listProcs("win32", { SystemRoot: "D:\\Win", PATH: "C:\\evil" }, run);
    expect(calls[0].file).toBe("D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
    expect(calls[0].env.PATH).not.toContain("evil");
    expect(calls[0].args.at(-1)).toBe(B.WINDOWS_PROC_SCRIPT);
    expect(procs2).toEqual([{ pid: 40, ppid: 4, start: "20261119100000.000000+120" }, { pid: 41, ppid: 40, start: "20261119100001.000000+120" }]);
    expect(B.parseWinProcs("not json")).toBeNull();
    expect(B.descendantsOf(procs2, 40).map((r) => r.pid)).toEqual([41]);
  });
  it("what is left is ended by pid with taskkill /T /F from the real SystemRoot, one call per process", async () => {
    const calls = [];
    const left = await B.killPids([40, 41, 40], { platform: "win32", env: { SystemRoot: "D:\\Win" }, execFile: (file, args, o, cb) => { calls.push([file, args]); cb(null); } });
    expect(calls).toEqual([["D:\\Win\\System32\\taskkill.exe", ["/PID", "40", "/T", "/F"]], ["D:\\Win\\System32\\taskkill.exe", ["/PID", "41", "/T", "/F"]]]);
    expect(Array.isArray(left)).toBe(true);
  });
  it("macOS and Linux: the list is a plain `ps -A -o pid=,ppid=,lstart=` by absolute path, with no environment and no command line", async () => {
    const calls = [];
    const text = "  200     1 Thu Nov 19 10:00:00 2026\n  201   200 Thu Nov 19 10:00:01 2026\nnot a row\n";
    const rows2 = await B.listProcs("darwin", {}, async (file, args, env) => { calls.push({ file, args, env }); return text; });
    expect(calls[0].file).toBe("/bin/ps");
    expect(calls[0].args).toEqual(["-A", "-o", "pid=,ppid=,lstart="]);
    expect(calls[0].args.join(" ")).not.toMatch(/E/);
    expect(calls[0].env.PATH).toBe("/usr/bin:/bin");
    expect(rows2).toEqual([{ pid: 200, ppid: 1, start: "Thu Nov 19 10:00:00 2026" }, { pid: 201, ppid: 200, start: "Thu Nov 19 10:00:01 2026" }]);
    expect(B.parseMacPs).toBeUndefined();
  });
});

D("QAAS2 G4/G5 (MED): a restart never re-raises full access", () => {
  it("lowering could not be saved at all: the restart (state folder still read-only) starts in folder mode", async () => {
    const { secret } = await startBridge({ workspace: ws(), fullAccess: true });
    fs.chmodSync(accessFile, 0o400);
    fs.chmodSync(stateDir, 0o500);
    try {
      expect((await accessReq(secret, { mode: "folder" })).status).toBe(500);
      await bridges.pop().close();
      expect(B.readAccessFile(accessFile).mode).toBe("computer"); // the file still says so
      const b2 = createBridge({ port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "w2"), home, stateDir, workspace: ws() });
      expect(b2.access).toBe("folder"); // the state folder cannot be written: fail closed
    } finally { fs.chmodSync(stateDir, 0o700); fs.chmodSync(accessFile, 0o600); }
  });
  it("a lowering marker beside access.json makes the next start folder, even though the file says computer; the start puts folder in the file", async () => {
    prep();
    B.writeAccessFile(accessFile, "computer");
    fs.writeFileSync(path.join(stateDir, B.ACCESS_LOWERED), "1");
    await startBridge({ workspace: ws() });
    expect((await helloFor(lastSecret)).access).toBe("folder");
  });
  it("a missing access.json never lets a --full-access flag seed computer once a setting has been saved here", async () => {
    prep();
    let started = await startBridge({ workspace: ws(), fullAccess: true });
    expect((await helloFor(started.secret)).access).toBe("computer");
    await accessReq(started.secret, { mode: "folder" });
    await bridges.pop().close();
    fs.rmSync(accessFile);
    started = await startBridge({ workspace: ws(), fullAccess: true }); // an old plist still carrying the flag
    expect((await helloFor(started.secret)).access).toBe("folder");
  });
  it("lowering writes in place when the temp file cannot be made; the file is removed only when a setting was saved here before", async () => {
    const { secret } = await startBridge({ workspace: ws(), fullAccess: true });
    fs.mkdirSync(`${accessFile}.${process.pid}.tmp`);
    expect((await accessReq(secret, { mode: "folder" })).status).toBe(200);
    expect(JSON.parse(fs.readFileSync(accessFile, "utf8")).mode).toBe("folder");
    expect(fs.existsSync(path.join(stateDir, B.ACCESS_LOWERED))).toBe(false); // saved: the marker is gone
  });
});

describe("QAAS2 MED-5: an old --full-access service entry is rewritten (carefully)", () => {
  const LABEL = "com.gilb.claude-code-bridge";
  const SVC = { GILB_BRIDGE_SUPERVISED: "1" };
  const plistText = (args, label = LABEL) => B.buildPlist({ label, node: "/opt/node/bin/node", file: "/Users/p/b.mjs", args, pathEnv: "/usr/bin", logFile: "/tmp/l.log", workDir: "/tmp" });
  const mk = () => {
    prep();
    const plist = path.join(home, "Library", "LaunchAgents", `${LABEL}.plist`);
    fs.mkdirSync(path.dirname(plist), { recursive: true });
    const args = ["--port", "47821", "--claude", "/x/claude", "--state-dir", stateDir, "--workspace", "/Users/p/Work", "--full-access"];
    fs.writeFileSync(plist, plistText(args));
    return { plist, args, cli: parseCli(["--port", "47821", "--claude", "/x/claude", "--state-dir", stateDir, "--workspace", "/Users/p/Work", "--full-access"]) };
  };
  it("macOS: the flag leaves the plist (same text otherwise, atomic, idempotent) and the first value is saved once", () => {
    const { plist, args, cli } = mk();
    const line = B.migrateServiceFlag(cli, home, "darwin", SVC);
    expect(line).toContain("took --full-access out");
    expect(fs.readFileSync(plist, "utf8")).toBe(plistText(args.slice(0, -1)));
    expect(JSON.parse(fs.readFileSync(accessFile, "utf8")).mode).toBe("computer");
    expect(B.migrateServiceFlag(cli, home, "darwin", SVC)).toBe("");
    expect(fs.readdirSync(path.dirname(plist)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
  it("only the service edits its own entry: a Terminal or dev start (not launched by launchd) changes nothing", () => {
    const { plist, args, cli } = mk();
    expect(B.migrateServiceFlag(cli, home, "darwin", {})).toBe("");
    expect(fs.readFileSync(plist, "utf8")).toBe(plistText(args));
    expect(fs.existsSync(accessFile)).toBe(false);
  });
  it("a bad --label (../ or a path) touches nothing outside LaunchAgents", () => {
    prep();
    const outside = path.join(home, "Work", "other.plist");
    fs.mkdirSync(path.dirname(outside), { recursive: true });
    fs.writeFileSync(outside, plistText(["--full-access"], "other"));
    const cli = parseCli(["--label", "../../Work/other", "--full-access", "--state-dir", stateDir]);
    expect(B.migrateServiceFlag(cli, home, "darwin", SVC)).toBe("");
    expect(fs.readFileSync(outside, "utf8")).toBe(plistText(["--full-access"], "other"));
  });
  it.skipIf(process.platform === "win32")("a symlinked plist is left alone (the link stays a link, the target is not rewritten)", () => {
    const { plist, args, cli } = mk();
    const target = path.join(dir, "dotfiles-plist");
    fs.renameSync(plist, target);
    fs.symlinkSync(target, plist);
    const line = B.migrateServiceFlag(cli, home, "darwin", SVC);
    expect(line).toContain("it is a link");
    expect(fs.lstatSync(plist).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(target, "utf8")).toBe(plistText(args));
  });
  it("a plist for another label (not the one the installer wrote for this bridge) is not touched", () => {
    const { plist, cli } = mk();
    fs.writeFileSync(plist, plistText(["--full-access"], "com.someone.else"));
    expect(B.migrateServiceFlag(cli, home, "darwin", SVC)).toBe("");
    expect(fs.readFileSync(plist, "utf8")).toBe(plistText(["--full-access"], "com.someone.else"));
  });
  it("Windows: the launcher is read and written as UTF-16LE with its BOM, and only our own launcher is touched", () => {
    prep();
    const env = { LOCALAPPDATA: path.join(dir, "Local"), SystemRoot: "C:\\Windows" };
    const cli = parseCli(["--full-access", "--state-dir", stateDir]);
    const f = { launcher: path.join(dir, "Local", "start-com.gilb.claude-code-bridge.js") }; // a pretend-Windows path would be a strange relative name here
    fs.mkdirSync(path.dirname(f.launcher), { recursive: true });
    const where = { target: f.launcher, stateDir };
    const mark = "// Written by `node bridge.mjs --install` for the Gilb Claude Code bridge. `--uninstall` removes it.";
    const body = (flag) => `${mark}\nsh.Run("node b.mjs --supervise --port 1${flag} --label ${LABEL}", 0, false);\n`;
    const u16 = (t) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(t, "utf16le")]);
    fs.writeFileSync(f.launcher, u16(body(" --full-access")));
    expect(B.migrateServiceFlag(cli, home, "win32", env, where)).toContain("took --full-access out");
    const raw = fs.readFileSync(f.launcher);
    expect([raw[0], raw[1]]).toEqual([0xff, 0xfe]);
    expect(raw.subarray(2).toString("utf16le")).toBe(body(""));
    fs.writeFileSync(f.launcher, u16(body(" --full-access").replace(mark, "// not ours")));
    expect(B.migrateServiceFlag(cli, home, "win32", env, where)).toBe("");
  });
});

D("QAAS2 MED-6: three refusals in a row lock asking for a day, persisted", () => {
  it("the lock survives a restart and is lifted by --access-reset", async () => {
    const dialog = vi.fn(async () => "cancel");
    let started = await startBridge({ workspace: ws(), accessDialog: dialog });
    for (const wait of [31_000, 121_000, 0]) {
      expect((await accessReq(started.secret, { mode: "computer" })).status).toBe(403);
      clock.t += wait;
    }
    await bridges.pop().close();
    started = await startBridge({ workspace: ws(), accessDialog: dialog });
    clock.t += 3_600_000;
    expect((await accessReq(started.secret, { mode: "computer" })).json.code).toBe("AccessLocked");
    await B.accessReset(parseCli(["--access-reset", "--state-dir", stateDir]), { platform: "darwin", home });
    expect((await accessReq(started.secret, { mode: "computer" })).status).toBe(403);
  });
});

D("QAAS3: the limits and the CLI", () => {
  const limFile = () => path.join(stateDir, "access-limits.json");
  it("a window nobody answers (timeout) is not a refusal: three of them never lock asking", async () => {
    const dialog = vi.fn(async () => "timeout");
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialog });
    for (let i = 0; i < 3; i++) { expect((await accessReq(secret, { mode: "computer" })).status).toBe(403); clock.t += 31_000; }
    expect(JSON.parse(fs.readFileSync(limFile(), "utf8")).denials).toBe(0);
    const r = await accessReq(secret, { mode: "computer" });
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("AccessDenied");
  });
  it("the refusal count starts again after a day without one", async () => {
    const dialog = vi.fn(async () => "cancel");
    prep();
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialog });
    fs.writeFileSync(limFile(), JSON.stringify({ version: 1, stamps: [], denials: 2, cooldownUntil: 0, lockedUntil: 0, lastDenialAt: clock.t - 25 * 3_600_000 }), { mode: 0o600 });
    expect((await accessReq(secret, { mode: "computer" })).status).toBe(403);
    expect(JSON.parse(fs.readFileSync(limFile(), "utf8"))).toMatchObject({ denials: 1, lockedUntil: 0 }); // not the third: no lock
  });
  it("--access-reset says which folder it reset, and fails when there is none", async () => {
    prep();
    const ok = await B.accessReset(parseCli(["--access-reset", "--state-dir", stateDir]), { platform: "darwin", home });
    expect(ok.ok).toBe(true);
    expect(ok.message).toContain(path.join(stateDir, "access-limits.json"));
    const missing = path.join(dir, "no-such-state");
    const bad = await B.accessReset(parseCli(["--access-reset", "--state-dir", missing]), { platform: "darwin", home });
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain(missing);
    expect(bad.message).toContain("--state-dir");
    expect(fs.existsSync(missing)).toBe(false);
  });
  it("the lock message names --state-dir", async () => {
    const { secret } = await startBridge({ workspace: ws(), accessDialog: vi.fn(async () => "cancel") });
    fs.writeFileSync(limFile(), JSON.stringify({ version: 1, stamps: [], denials: 3, cooldownUntil: clock.t + 3_600_000, lockedUntil: clock.t + 3_600_000, lastDenialAt: clock.t }), { mode: 0o600 });
    const r = await accessReq(secret, { mode: "computer" });
    expect(r.json.code).toBe("AccessLocked");
    expect(r.json.error).toContain("--state-dir");
  });
});

D("QAAS3 MED-4: a Folder request during the post-Allow scan wins", () => {
  it("ON is answered 409 AccessChanged and nothing is saved: the bridge ends in folder mode", async () => {
    let gate;
    const wait = new Promise((r) => { gate = r; });
    let inGap;
    const reached = new Promise((r) => { inGap = r; });
    const dialog = vi.fn(async () => "allow");
    const afterAllowScan = async () => { inGap(); await wait; }; // the scan after Allow takes a while
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialog, afterAllowScan });
    const on = accessReq(secret, { mode: "computer" });
    await reached;
    expect((await accessReq(secret, { mode: "folder" })).status).toBe(200);
    gate();
    const r = await on;
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("AccessChanged");
    expect((await helloFor(secret)).access).toBe("folder");
    expect(JSON.parse(fs.readFileSync(accessFile, "utf8")).mode).toBe("folder");
  });
});

D("QAAS3 MED-3: one bridge per state folder", () => {
  it("a second bridge on the same state folder refuses to start (naming --state-dir) and leaves the first one's turn alone; a stale lock is replaced", async () => {
    const { secret } = await startBridge({ workspace: ws(), fullAccess: true });
    await codeTurn(base, secret, "WAITFOREVER");
    const claudePid = (await until(() => rows("run")[0])).pid;
    const second = createBridge({ port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "w2"), home, stateDir, workspace: ws() });
    await expect(second.start()).rejects.toThrow(/--state-dir/);
    await sleep(500);
    expect(alive(claudePid)).toBe(true);
    await bridges.pop().close();
    fs.writeFileSync(path.join(stateDir, "bridge.lock"), JSON.stringify({ pid: 2147483000, start: "x" })); // an owner that is gone
    await startBridge({ workspace: ws() });
    expect(JSON.parse(fs.readFileSync(path.join(stateDir, "bridge.lock"), "utf8")).pid).toBe(process.pid);
    await bridges.pop().close();
    // a lock with no start time, older than a minute, whose pid is alive (here: this test's parent, standing for a recycled pid) is stale too
    fs.writeFileSync(path.join(stateDir, "bridge.lock"), JSON.stringify({ pid: process.ppid, start: "" }));
    const old = new Date(Date.now() - 120_000);
    fs.utimesSync(path.join(stateDir, "bridge.lock"), old, old);
    await startBridge({ workspace: ws() });
    expect(JSON.parse(fs.readFileSync(path.join(stateDir, "bridge.lock"), "utf8")).pid).toBe(process.pid);
  });
});

D("QAAS3 LOW-6: exit-time kills and the recorded list check start times", () => {
  it("killAllSync leaves a recorded pid alone when its start time no longer matches", async () => {
    prep();
    const stray = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    pids.push(stray.pid);
    let phase = 1;
    let claudePid = 0;
    const list = () => (claudePid ? [{ pid: claudePid, ppid: 1, start: "C" }, phase === 1 ? { pid: stray.pid, ppid: claudePid, start: "S1" } : { pid: stray.pid, ppid: 1, start: "S2" }] : []);
    const procList = async () => list();
    const procListSync = () => list();
    const { secret, bridge } = await startBridge({ workspace: ws(), procList, procListSync });
    await codeTurn(base, secret, "WAITFOREVER");
    claudePid = (await until(() => rows("run")[0])).pid;
    await sleep(700);
    phase = 2;
    bridge.killAllSync();
    await sleep(200);
    expect(alive(stray.pid)).toBe(true); // not the process that was seen
  });
  it("live-groups.json is read with the strict checks: a symlink to a list naming a live process is not followed", async () => {
    prep();
    const stray = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    pids.push(stray.pid);
    await sleep(300);
    const start = B.listProcsSync("darwin").find((r) => r.pid === stray.pid)?.start ?? process.platform === "linux" ? B.listProcsSync("linux").find((r) => r.pid === stray.pid)?.start : undefined;
    expect(start).toBeTruthy();
    const target = path.join(dir, "elsewhere.json");
    fs.writeFileSync(target, JSON.stringify({ version: 1, groups: [{ pid: stray.pid, start, desc: [] }] }), { mode: 0o600 });
    fs.symlinkSync(target, path.join(stateDir, "live-groups.json"));
    await startBridge({ workspace: ws() });
    expect(alive(stray.pid)).toBe(true);
    await bridges.pop().close();
    fs.rmSync(path.join(stateDir, "live-groups.json"));
    fs.copyFileSync(target, path.join(stateDir, "live-groups.json")); // a regular file with the exact pid and start time: stopped
    fs.chmodSync(path.join(stateDir, "live-groups.json"), 0o600);
    await startBridge({ workspace: ws() });
    await until(() => !alive(stray.pid), 8000);
  });
});

D("QAAS2 LOW-7: access-limits.json is read like access.json and fails closed", () => {
  const limFile = () => path.join(stateDir, "access-limits.json");
  const good = (o = {}) => JSON.stringify({ version: 1, stamps: [], denials: 0, cooldownUntil: 0, lockedUntil: 0, ...o });
  const askOnce = async (opts = {}) => {
    const dialog = vi.fn(async () => "cancel");
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialog, ...opts });
    const r = await accessReq(secret, { mode: "computer" });
    return { r, dialog };
  };
  it("garbage, a symlink, a hard link, a wrong mode, a wrong shape: ON waits (429), nothing opens, and a fresh valid file is written", async () => {
    prep();
    const real = path.join(dir, "elsewhere.json");
    const cases = {
      garbage: () => fs.writeFileSync(limFile(), "{{{garbage", { mode: 0o600 }),
      symlink: () => { fs.writeFileSync(real, good(), { mode: 0o600 }); fs.symlinkSync(real, limFile()); },
      hardlink: () => { fs.writeFileSync(real, good(), { mode: 0o600 }); fs.linkSync(real, limFile()); },
      writable: () => { fs.writeFileSync(limFile(), good(), { mode: 0o600 }); fs.chmodSync(limFile(), 0o666); },
      shape: () => fs.writeFileSync(limFile(), JSON.stringify({ version: 1, stamps: "x" }), { mode: 0o600 }),
    };
    for (const [name, make] of Object.entries(cases)) {
      fs.rmSync(limFile(), { force: true }); fs.rmSync(real, { force: true });
      make();
      const { r, dialog } = await askOnce();
      expect(r.status, name).toBe(429);
      expect(dialog, name).not.toHaveBeenCalled();
      expect(JSON.parse(fs.readFileSync(limFile(), "utf8")).version, name).toBe(1); // rewritten
      await bridges.pop().close();
      clock.t += 700_000; // keep the cooldown of the rewritten file out of the next case
      B.resetLimits(stateDir);
    }
  });
  it("deleted after the install started: fail closed, not open", async () => {
    prep();
    await startBridge({ workspace: ws() });
    await bridges.pop().close();
    fs.rmSync(limFile());
    const { r, dialog } = await askOnce();
    expect(r.status).toBe(429);
    expect(dialog).not.toHaveBeenCalled();
  });
  it("a far-future cooldown is capped at 24 h, and future stamps count as now", async () => {
    prep();
    fs.writeFileSync(limFile(), good({ cooldownUntil: 8.64e15 }), { mode: 0o600 });
    const { r } = await askOnce();
    expect(r.status).toBe(429);
    expect(r.json.retryAfterSec).toBeLessThanOrEqual(24 * 3600);
    expect(B.parseLimits(good({ stamps: [1e18] }), clock.t).stamps).toEqual([clock.t]);
  });
  it("a first start makes the file once (valid, 0600)", async () => {
    prep();
    await startBridge({ workspace: ws() });
    expect(JSON.parse(fs.readFileSync(limFile(), "utf8"))).toMatchObject({ version: 1, stamps: [], denials: 0 });
    if (process.platform !== "win32") expect(fs.statSync(limFile()).mode & 0o777).toBe(0o600);
  });
});

D("QAAS2 LOW-8: the page is shown plainly, local pages say so", () => {
  it("a non-https origin gets (local); https does not; bracketed IPv6 is fit to show and can ask", async () => {
    expect(B.accessDialogText("darwin", "http://localhost:5197").split("\n")[1]).toBe("Asked by: http://localhost:5197 (local)");
    expect(B.accessDialogText("darwin", "https://gilb.example.test").split("\n")[1]).toBe("Asked by: https://gilb.example.test");
    expect(B.accessDialogText("linux", "http://[::1]:5197").split("\n")[1]).toBe("Asked by: http://[::1]:5197 (local)");
    expect(B.originFitForDialog("http://[::1]:5197")).toBe(true);
    for (const bad of ["http://[zz]:1", "http://[::1", "http://a b", "https://x.test/p"]) expect(B.originFitForDialog(bad), bad).toBe(false);
    const dialog = vi.fn(async () => "cancel");
    prep();
    const { bridge } = await startBridge({ workspace: ws(), accessDialog: dialog });
    const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json", origin: "http://[::1]:5197" }, body: JSON.stringify({ code: bridge.pairingCode }) });
    const v6 = (await res.json()).secret;
    await accessReq(v6, { mode: "computer" }, { origin: "http://[::1]:5197" });
    expect(dialog).toHaveBeenCalledWith("http://[::1]:5197");
  });
});
