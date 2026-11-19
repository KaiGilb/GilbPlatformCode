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

describe("QAAS2 G1 (HIGH): a child that leaves the process group is found by its tag, or by the descendants seen", () => {
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
  it("ON is 409 while a tagged process is alive even when no turn and no group is tracked (a stray carrying the tag)", async () => {
    const dialog = vi.fn(async () => "cancel");
    prep();
    const { secret, bridge } = await startBridge({ workspace: ws(), accessDialog: dialog });
    const id = fs.readFileSync(path.join(stateDir, "install-id"), "utf8").trim();
    const stray = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", env: { PATH: process.env.PATH, GILB_BRIDGE_TURN: `${id}.0123456789abcdef` } });
    pids.push(stray.pid);
    await sleep(300);
    const r = await accessReq(secret, { mode: "computer" });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("TurnRunning");
    expect(dialog).not.toHaveBeenCalled();
    expect(bridge).toBeTruthy();
    process.kill(stray.pid, "SIGKILL");
    await until(async () => (await accessReq(secret, { mode: "computer" })).status === 403);
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
  it("every code child carries a tag of this install in its environment, and the tag is a fresh token per turn", async () => {
    const { secret } = await startBridge({ workspace: ws() });
    await codeTurn(base, secret, "WAITFOREVER");
    const run = await until(() => rows("run")[0]);
    expect(run.envKeys).toContain("GILB_BRIDGE_TURN");
    expect(B.tagOf("A=1 GILB_BRIDGE_TURN=0123456789abcdef.fedcba9876543210 B=2")).toBe("0123456789abcdef.fedcba9876543210");
    expect(B.tagOf("GILB_BRIDGE_TURN=short")).toBeNull();
  });
});

describe("QAAS2 G2 (MED): orphans after the bridge dies", () => {
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
    await until(() => { try { return JSON.parse(fs.readFileSync(path.join(stateDir, "live-groups.json"), "utf8")).groups.some((g) => g.pid === claudePid && g.start); } catch { return false; } });
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
  it("the process list comes from the system PowerShell in the real SystemRoot; the environment cannot be read there, so no tag", async () => {
    const calls = [];
    const run = async (file, args, env) => { calls.push({ file, args, env }); return JSON.stringify([{ ProcessId: 40, ParentProcessId: 4, CreationDate: "20261119100000.000000+120" }, { ProcessId: 41, ParentProcessId: 40, CreationDate: "20261119100001.000000+120" }]); };
    const procs2 = await B.listProcs("win32", { SystemRoot: "D:\\Win", PATH: "C:\\evil" }, run);
    expect(calls[0].file).toBe("D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
    expect(calls[0].env.PATH).not.toContain("evil");
    expect(calls[0].args.at(-1)).toBe(B.WINDOWS_PROC_SCRIPT);
    expect(procs2).toEqual([{ pid: 40, ppid: 4, start: "20261119100000.000000+120", tag: null }, { pid: 41, ppid: 40, start: "20261119100001.000000+120", tag: null }]);
    expect(B.parseWinProcs("not json")).toBeNull();
    expect(B.descendantsOf(procs2, 40).map((r) => r.pid)).toEqual([41]);
  });
  it("what is left is ended by pid with taskkill /T /F from the real SystemRoot, one call per process", async () => {
    const calls = [];
    const left = await B.killPids([40, 41, 40], { platform: "win32", env: { SystemRoot: "D:\\Win" }, execFile: (file, args, o, cb) => { calls.push([file, args]); cb(null); } });
    expect(calls).toEqual([["D:\\Win\\System32\\taskkill.exe", ["/PID", "40", "/T", "/F"]], ["D:\\Win\\System32\\taskkill.exe", ["/PID", "41", "/T", "/F"]]]);
    expect(Array.isArray(left)).toBe(true);
  });
  it("macOS ps rows carry the tag after the command (the environment is appended by ps -E)", () => {
    const text = "  200     1 Thu Nov 19 10:00:00 2026     /bin/sleep 5 PATH=/usr/bin GILB_BRIDGE_TURN=0123456789abcdef.fedcba9876543210 HOME=/h\n  201   200 Thu Nov 19 10:00:01 2026     /bin/ls\n";
    expect(B.parseMacPs(text)).toEqual([{ pid: 200, ppid: 1, start: "Thu Nov 19 10:00:00 2026", tag: "0123456789abcdef.fedcba9876543210" }, { pid: 201, ppid: 200, start: "Thu Nov 19 10:00:01 2026", tag: null }]);
  });
});

describe("QAAS2 G4/G5 (MED): a restart never re-raises full access", () => {
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

describe("QAAS2 MED-5: an old --full-access service entry is rewritten", () => {
  const plistText = (args) => B.buildPlist({ label: "com.gilb.claude-code-bridge", node: "/opt/node/bin/node", file: "/Users/p/b.mjs", args, pathEnv: "/usr/bin", logFile: "/tmp/l.log", workDir: "/tmp" });
  it("macOS: the flag leaves the plist (same text otherwise, atomic, idempotent) and the first value is saved once", () => {
    prep();
    const plist = path.join(home, "Library", "LaunchAgents", "com.gilb.claude-code-bridge.plist");
    fs.mkdirSync(path.dirname(plist), { recursive: true });
    const args = ["--port", "47821", "--claude", "/x/claude", "--state-dir", stateDir, "--workspace", "/Users/p/Work", "--full-access"];
    fs.writeFileSync(plist, plistText(args));
    const cli = parseCli(["--port", "47821", "--claude", "/x/claude", "--state-dir", stateDir, "--workspace", "/Users/p/Work", "--full-access"]);
    const line = B.migrateServiceFlag(cli, home, "darwin");
    expect(line).toContain("took --full-access out");
    expect(fs.readFileSync(plist, "utf8")).toBe(plistText(args.slice(0, -1)));
    expect(JSON.parse(fs.readFileSync(accessFile, "utf8")).mode).toBe("computer");
    expect(B.migrateServiceFlag(cli, home, "darwin")).toBe(""); // idempotent
    expect(fs.readdirSync(path.dirname(plist)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
  it("a Terminal start (no service entry) changes nothing and says nothing; a saved folder wins over the flag", () => {
    prep();
    expect(B.migrateServiceFlag(parseCli(["--full-access", "--state-dir", stateDir]), home, "darwin")).toBe("");
    B.writeAccessFile(accessFile, "folder");
    B.migrateServiceFlag(parseCli(["--full-access", "--state-dir", stateDir]), home, "darwin");
    expect(JSON.parse(fs.readFileSync(accessFile, "utf8")).mode).toBe("folder");
  });
});

describe("QAAS2 MED-6: three refusals in a row lock asking for a day, persisted", () => {
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

describe("QAAS2 LOW-7: access-limits.json is read like access.json and fails closed", () => {
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

describe("QAAS2 LOW-8: the page is shown plainly, local pages say so", () => {
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
