// @vitest-environment node
// Windows Always On: --install / --uninstall / --status and the supervisor (--supervise). The Windows parts run on any
// platform with a pretend Windows (in-memory files, recorded reg.exe/wscript.exe calls, a fake clock). The last block starts the
// REAL built bridge under the REAL supervisor and kills it, on whatever platform the tests run on.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXIT_PORT_IN_USE, SUPERVISOR_DELAYS_MS, SUPERVISOR_STABLE_MS, DEFAULT_LABEL, WIN_RUN_KEY,
  parseCli, runSupervisor, serviceInstall, serviceStatus, serviceUninstall, superviseLoop, winCommandLine, winQuoteArg,
} from "../bridge/bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = path.join(HERE, "..", "bridge", "bridge.mjs");
const FAKE = path.join(HERE, "fake-claude.mjs");
const W = path.win32;

const HOME = "C:\\Users\\Anna Maria";
const NODE = "C:\\Program Files\\nodejs\\node.exe";
const FILE = "C:\\Users\\Anna Maria\\.gilb-claude-code-bridge.mjs";
const CLAUDE = "C:\\Users\\Anna Maria\\.local\\bin\\claude.exe";
const LOCAL = `${HOME}\\AppData\\Local\\gilb-claude-code-bridge`;
const STATE = `${HOME}\\.gilb-claude-code-bridge`;
const WSCRIPT = "C:\\Windows\\System32\\wscript.exe";
const REG = "C:\\Windows\\System32\\reg.exe";

/** A pretend disk, a pretend registry value, a pretend supervisor that appears when wscript.exe is run. */
function world({ startWorks = true, foreignBridge = false, regFails = false, stubborn = false, state = STATE } = {}) {
  const files = new Map();
  const calls = [];
  const reg = new Map();
  let aliveSup = false;
  const lower = (p) => p.toLowerCase();
  const sfs = {
    mkdirp: () => {},
    write: (p, d) => void files.set(lower(p), d),
    read: (p) => {
      if (!files.has(lower(p))) throw new Error("ENOENT");
      return files.get(lower(p));
    },
    exists: (p) => files.has(lower(p)),
    rm: (p) => void files.delete(lower(p)),
    rmdirIfEmpty: (p) => {
      if (![...files.keys()].some((k) => k.startsWith(`${lower(p)}\\`))) files.set(`${lower(p)}#removed`, true);
    },
  };
  const exec = async (file, args) => {
    calls.push([file, ...args]);
    if (file === REG && args[0] === "add") {
      if (regFails) return { code: 1, out: "ERROR: Access is denied." };
      reg.set(args[3], args[args.indexOf("/d") + 1]);
      return { code: 0, out: "" };
    }
    if (file === REG && args[0] === "query") return reg.has(args[3]) ? { code: 0, out: "" } : { code: 1, out: "ERROR: not found" };
    if (file === REG && args[0] === "delete") {
      reg.delete(args[3]);
      return { code: 0, out: "" };
    }
    if (file === WSCRIPT) {
      if (!startWorks) return { code: 1, out: "Windows Script Host access is disabled on this machine." };
      if (!foreignBridge) {
        files.set(lower(`${state}\\supervisor.json`), JSON.stringify({ pid: 4242 }));
        files.set(lower(`${state}\\status.json`), JSON.stringify({ ok: true, port: 47821, at: "t", billing: "Claude subscription, plan max", pid: 4343 }));
        aliveSup = true;
      }
      return { code: 0, out: "" };
    }
    throw new Error(`unexpected program ${file}`);
  };
  const alive = (pid) => (pid === 4242 ? aliveSup : pid === 4343 ? aliveSup : false);
  // The supervisor ends when the stop marker is there (unless it is stubborn).
  const sleep = async () => {
    if (!stubborn && files.has(lower(`${state}\\supervisor.stop`))) aliveSup = false;
  };
  const hello = async () => (aliveSup || foreignBridge ? { bridge: "gilb-claude-code-bridge", build: "0.1.8" } : null);
  const deps = {
    launchctl: async () => {
      throw new Error("launchctl must not run on Windows");
    },
    uid: 0, home: HOME, nodePath: NODE, file: FILE, env: { SystemRoot: "C:\\Windows", LOCALAPPDATA: `${HOME}\\AppData\\Local` },
    platform: "win32", sfs, exec, alive, sleep, hello,
    files: { exists: (p) => lower(p) === lower(CLAUDE), read: () => "" },
    check: async () => ({ ok: true, info: { subscriptionType: "max" } }),
  };
  return { files, calls, reg, deps, sfs, setAlive: (v) => (aliveSup = v) };
}
const install = (w, args = []) => serviceInstall(parseCli(["--install", "--claude", CLAUDE, ...args]), w.deps);
const decode = (buf) => Buffer.from(buf).subarray(2).toString("utf16le"); // after the byte order mark

describe("quoting for the Windows command line", () => {
  it("leaves plain words alone and wraps spaces and quotes the way the C runtime reads them back", () => {
    expect(winQuoteArg("--port")).toBe("--port");
    expect(winQuoteArg("C:\\Users\\Anna Maria\\a.mjs")).toBe('"C:\\Users\\Anna Maria\\a.mjs"');
    expect(winQuoteArg('say "hi"')).toBe('"say \\"hi\\""');
    expect(winQuoteArg("C:\\dir with space\\")).toBe('"C:\\dir with space\\\\"');
    expect(winQuoteArg("")).toBe('""');
    expect(winCommandLine(["a b", "c"])).toBe('"a b" c');
  });
});

describe("--install on Windows", () => {
  it("writes exactly: one Run value, one launcher file and the log (nothing else), with a user name that has a space", async () => {
    const w = world();
    const out = await install(w, ["--allow-origin", "https://app.example.test"]);
    expect(out.ok).toBe(true);
    expect([...w.files.keys()].sort()).toEqual([
      `${LOCAL}\\start-com.gilb.claude-code-bridge.js`, `${LOCAL}\\bridge.log`, `${STATE}\\status.json`, `${STATE}\\supervisor.json`,
    ].map((p) => p.toLowerCase()).sort());
    expect(w.files.get(`${LOCAL}\\bridge.log`.toLowerCase())).toBe("");
    // The Run value: wscript, hidden batch mode, JScript engine forced, the launcher quoted.
    const value = w.reg.get(DEFAULT_LABEL);
    expect(value).toBe(`${WSCRIPT} //B //Nologo //E:JScript "${LOCAL}\\start-com.gilb.claude-code-bridge.js"`);
    expect(value.length).toBeLessThan(260);
    const addCall = w.calls.find((c) => c[1] === "add");
    expect(addCall).toEqual([REG, "add", WIN_RUN_KEY, "/v", DEFAULT_LABEL, "/t", "REG_SZ", "/d", value, "/f"]);
    expect(WIN_RUN_KEY.startsWith("HKCU\\")).toBe(true); // this user only: no machine-wide key
    // The launcher: UTF-16 with a byte order mark, runs the supervisor hidden (style 0, no wait), every path quoted.
    const raw = Buffer.from(w.files.get(`${LOCAL}\\start-com.gilb.claude-code-bridge.js`.toLowerCase()));
    expect([raw[0], raw[1]]).toEqual([0xff, 0xfe]);
    const js = decode(raw);
    const cmd = `"${NODE}" "${FILE}" --supervise --port 47821 --claude "${CLAUDE}" --state-dir "${STATE}" --allow-origin https://app.example.test --label ${DEFAULT_LABEL}`;
    expect(js).toContain(`sh.Run(${JSON.stringify(cmd)}, 0, false);`);
    expect(js).toContain(`sh.CurrentDirectory = ${JSON.stringify(STATE)};`);
    expect(js).toContain('new ActiveXObject("WScript.Shell")');
    // It started it right away, the way login does.
    expect(w.calls.filter((c) => c[0] === WSCRIPT)).toEqual([[WSCRIPT, "//B", "//Nologo", "//E:JScript", `${LOCAL}\\start-com.gilb.claude-code-bridge.js`]]);
  });
  it("tells the person the truth, with commands that work in PowerShell, and the one-bridge hint", async () => {
    const out = await install(world());
    expect(out.message).toContain("It starts when you log in and restarts if it stops.");
    expect(out.message).toContain(`Log:     ${LOCAL}\\bridge.log`);
    expect(out.message).toContain('node "$HOME\\.gilb-claude-code-bridge.mjs" --code');
    expect(out.message).toContain('node "$HOME\\.gilb-claude-code-bridge.mjs" --status');
    expect(out.message).toContain('node "$HOME\\.gilb-claude-code-bridge.mjs" --uninstall');
    expect(out.message).toContain("close that window: only one can hold port 47821");
    expect(out.message).not.toMatch(/launchctl|Terminal|bash/);
  });
  it("a label and a state folder show up in the commands, quoted for PowerShell", async () => {
    const w = world({ state: "C:\\Users\\Anna Maria\\it's state" });
    const out = await install(w, ["--label", "my.bridge", "--state-dir", "C:\\Users\\Anna Maria\\it's state"]);
    expect(out.ok).toBe(true);
    expect(out.message).toContain("--label my.bridge --state-dir 'C:\\Users\\Anna Maria\\it''s state'");
    expect(w.files.has(`${LOCAL}\\my.bridge.log`.toLowerCase())).toBe(true);
    expect(w.files.has(`${LOCAL}\\start-my.bridge.js`.toLowerCase())).toBe(true);
    expect(w.reg.has("my.bridge")).toBe(true);
  });
  it("refuses, writing nothing, on a % in a path, a label that makes the Run value too long, a bad origin, a failed login check", async () => {
    let w = world();
    expect((await serviceInstall(parseCli(["--install", "--claude", CLAUDE]), { ...w.deps, home: "C:\\Users\\50%", file: "C:\\Users\\50%\\b.mjs" })).message).toMatch(/% sign/);
    expect(w.reg.size).toBe(0);
    w = world();
    const long = `l${"a".repeat(150)}`;
    expect((await install(w, ["--label", long])).message).toMatch(/Run entry/);
    expect(w.reg.size).toBe(0);
    expect(w.files.size).toBe(0);
    w = world();
    expect((await install(w, ["--allow-origin", "*"])).ok).toBe(false);
    expect(w.files.size + w.reg.size).toBe(0);
    w = world();
    const no = await serviceInstall(parseCli(["--install", "--claude", CLAUDE]), { ...w.deps, check: async () => ({ ok: false, reason: "Log in with a subscription" }) });
    expect(no.message).toBe("Not installed.\nLog in with a subscription");
    expect(w.files.size + w.reg.size).toBe(0);
  });
  it("a refused registry write (policy) is reported, and the launcher it wrote is taken away again", async () => {
    const w = world({ regFails: true });
    const out = await install(w);
    expect(out.ok).toBe(false);
    expect(out.message).toContain("Access is denied");
    expect(w.files.has(`${LOCAL}\\start-com.gilb.claude-code-bridge.js`.toLowerCase())).toBe(false);
  });
  it("Windows Script Host switched off: says so instead of claiming success", async () => {
    const out = await install(world({ startWorks: false }));
    expect(out.ok).toBe(false);
    expect(out.message).toContain("Windows Script Host did not start the bridge");
  });
  it("another bridge already holds the port: not success, and the hint names what to close", async () => {
    const out = await install(world({ foreignBridge: true }));
    expect(out.ok).toBe(false);
    expect(out.message).toContain("another bridge already holds port 47821");
    expect(out.message).toContain("Close that bridge");
  });
  it("installing again first stops the running supervisor with the stop marker (no force kill), then starts the new one", async () => {
    const w = world();
    await install(w);
    const out = await install(w);
    expect(out.ok).toBe(true);
    expect(w.calls.some((c) => /taskkill/i.test(c[0]))).toBe(false);
    expect(w.calls.filter((c) => c[0] === WSCRIPT).length).toBe(2);
    expect(w.files.has(`${STATE}\\supervisor.stop`.toLowerCase())).toBe(false); // cleaned up, so the new supervisor is not told to stop
  });
});

describe("--uninstall on Windows", () => {
  it("removes the Run value, the launcher, the log and the supervisor files, and stops the running bridge", async () => {
    const w = world();
    await install(w);
    const out = await serviceUninstall(parseCli(["--uninstall"]), w.deps);
    expect(out.ok).toBe(true);
    expect(out.message).toContain("no longer starts at login");
    expect(out.message).toContain("has been stopped");
    expect(w.reg.size).toBe(0);
    expect([...w.files.keys()].filter((k) => !k.endsWith("#removed"))).toEqual([`${STATE}\\status.json`.toLowerCase()]); // the bridge's own state stays (pairings)
    expect(w.files.has(`${LOCAL}#removed`.toLowerCase())).toBe(true); // the empty folder is removed
    expect(w.calls.some((c) => /taskkill/i.test(c[0]))).toBe(false);
  });
  it("the second time says it was not installed", async () => {
    const w = world();
    await install(w);
    await serviceUninstall(parseCli(["--uninstall"]), w.deps);
    expect((await serviceUninstall(parseCli(["--uninstall"]), w.deps)).message).toBe(`${DEFAULT_LABEL} was not installed.`);
  });
  it("a supervisor that does not stop in 20 seconds is reported with what to do; no other process is killed", async () => {
    const w = world({ stubborn: true });
    await install(w).catch(() => {});
    w.setAlive(true);
    w.files.set(`${STATE}\\supervisor.json`.toLowerCase(), JSON.stringify({ pid: 4242 }));
    const out = await serviceUninstall(parseCli(["--uninstall"]), w.deps);
    expect(out.ok).toBe(false);
    expect(out.message).toContain("Task Manager");
    expect(w.calls.some((c) => /taskkill/i.test(c[0]))).toBe(false);
  });
});

describe("--status on Windows", () => {
  it("says installed, running (supervisor and bridge pid), the build from /v1/hello, and the log", async () => {
    const w = world();
    await install(w);
    const out = await serviceStatus(parseCli(["--status"]), w.deps);
    expect(out.ok).toBe(true);
    expect(out.message).toContain(`Installed:  yes (start-up entry ${DEFAULT_LABEL})`);
    expect(out.message).toContain("Running:    yes (supervisor pid 4242, bridge pid 4343)");
    expect(out.message).toContain("Answering:  yes, http://127.0.0.1:47821 (build 0.1.8)");
    expect(out.message).toContain("Billing:    Claude subscription, plan max");
    expect(out.message).toContain(`Log:        ${LOCAL}\\bridge.log`);
  });
  it("says no / no / no before an install, and a damaged install when the launcher is gone", async () => {
    const w = world();
    const none = await serviceStatus(parseCli(["--status"]), w.deps);
    expect(none.message).toContain("Installed:  no");
    expect(none.message).toContain("Running:    no");
    expect(none.message).toContain("Answering:  no (port 47821)");
    await install(w);
    w.files.delete(`${LOCAL}\\start-com.gilb.claude-code-bridge.js`.toLowerCase());
    expect((await serviceStatus(parseCli(["--status"]), w.deps)).message).toContain("damaged");
  });
});

describe("the supervisor loop (fake child, fake clock)", () => {
  /** Children that end by themselves after `lives[i]` ms of fake time with exit code `codes[i]`. */
  function rig({ lives, codes = [], stopAfterSpawns = Infinity }) {
    let clock = 0;
    let spawns = 0;
    const log = [];
    const sleeps = [];
    const killed = [];
    let stopNow;
    const stop = new Promise((r) => (stopNow = r));
    const spawnChild = () => {
      const i = spawns++;
      if (spawns > stopAfterSpawns) stopNow();
      const born = clock;
      let end;
      const exited = new Promise((r) => (end = r));
      if (i < lives.length) queueMicrotask(() => { clock = born + lives[i]; end({ code: codes[i] ?? 1, signal: null }); });
      return { pid: 100 + i, exited, kill: async () => void killed.push(100 + i) };
    };
    return {
      opts: { spawnChild, now: () => clock, sleep: async (ms) => { sleeps.push(ms); clock += ms; }, stop, log: (l) => log.push(l) },
      sleeps, log, killed, spawns: () => spawns, stopNow, advance: (ms) => (clock += ms),
    };
  }
  it("waits 1 s, 2 s, 5 s, then 30 s for every further stop", async () => {
    const r = rig({ lives: [100, 100, 100, 100, 100], stopAfterSpawns: 5 });
    expect(SUPERVISOR_DELAYS_MS).toEqual([1000, 2000, 5000, 30000]);
    await superviseLoop(r.opts);
    expect(r.sleeps).toEqual([1000, 2000, 5000, 30000, 30000]);
    expect(r.spawns()).toBe(6);
  });
  it("a bridge that stayed up 5 minutes starts the waits over at 1 s", async () => {
    const r = rig({ lives: [100, 100, 100, SUPERVISOR_STABLE_MS + 1, 100], stopAfterSpawns: 5 });
    await superviseLoop(r.opts);
    expect(r.sleeps).toEqual([1000, 2000, 5000, 1000, 2000]);
  });
  it("one that ran just under 5 minutes does not reset", async () => {
    const r = rig({ lives: [100, SUPERVISOR_STABLE_MS - 1, 100], stopAfterSpawns: 3 });
    await superviseLoop(r.opts);
    expect(r.sleeps).toEqual([1000, 2000, 5000]);
  });
  it("a bridge that found the port taken ends the loop: no second bridge, no looping, and it says so in the log", async () => {
    const r = rig({ lives: [100], codes: [EXIT_PORT_IN_USE] });
    expect(await superviseLoop(r.opts)).toBe("port-in-use");
    expect(r.spawns()).toBe(1);
    expect(r.sleeps).toEqual([]);
    expect(r.log.join("\n")).toMatch(/another bridge is running\. Not starting a second one/);
  });
  it("a stop request during a run ends that bridge and does not start another", async () => {
    const r = rig({ lives: [] });
    const done = superviseLoop(r.opts);
    await Promise.resolve();
    r.stopNow();
    expect(await done).toBe("stopped");
    expect(r.killed).toEqual([100]);
    expect(r.spawns()).toBe(1);
  });
  it("a stop request during a wait ends the loop at once", async () => {
    let clock = 0;
    let stopNow;
    const stop = new Promise((r) => (stopNow = r));
    const log = [];
    const res = await superviseLoop({
      spawnChild: () => ({ pid: 1, exited: Promise.resolve({ code: 1, signal: null }), kill: async () => {} }),
      now: () => clock,
      sleep: () => { stopNow(); return new Promise(() => {}); }, // the wait would never end by itself
      stop, log: (l) => log.push(l),
    });
    expect(res).toBe("stopped");
  });
});

describe("the supervisor process (real files, fake child)", () => {
  let dir;
  beforeEach(() => void (dir = fs.mkdtempSync(path.join(os.tmpdir(), "sup-"))));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const io = (extra = {}) => ({ home: dir, env: { LOCALAPPDATA: path.join(dir, "local") }, platform: process.platform, pollMs: 20, ...extra });
  const cli = () => parseCli(["--supervise", "--state-dir", path.join(dir, "state"), "--port", "0", "--claude", FAKE]);

  it("writes supervisor.json while it runs and removes it when it ends; the stop marker ends it and the bridge", async () => {
    const killed = [];
    const run = runSupervisor(cli(), io({ spawnChild: () => ({ pid: 7, exited: new Promise(() => {}), kill: async () => void killed.push(7) }) }));
    const sup = path.join(dir, "state", "supervisor.json");
    for (let i = 0; i < 100 && !fs.existsSync(sup); i++) await new Promise((r) => setTimeout(r, 20));
    expect(JSON.parse(fs.readFileSync(sup, "utf8")).pid).toBe(process.pid);
    fs.writeFileSync(path.join(dir, "state", "supervisor.stop"), "x");
    expect(await run).toBe("stopped");
    expect(killed).toEqual([7]);
    expect(fs.existsSync(sup)).toBe(false);
  });
  it("a second supervisor next to a live one does nothing; a leftover file from a dead process is replaced", async () => {
    const state = path.join(dir, "state");
    fs.mkdirSync(state, { recursive: true });
    fs.writeFileSync(path.join(state, "supervisor.json"), JSON.stringify({ pid: 999999 }));
    let spawned = 0;
    const child = () => { spawned++; return { pid: 1, exited: Promise.resolve({ code: EXIT_PORT_IN_USE, signal: null }), kill: async () => {} }; };
    expect(await runSupervisor(cli(), io({ alive: (p) => p === 999999, spawnChild: child }))).toBe("already-running");
    expect(spawned).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(state, "supervisor.json"), "utf8")).pid).toBe(999999); // the live one's file is untouched
    expect(await runSupervisor(cli(), io({ alive: () => false, spawnChild: child }))).toBe("port-in-use");
    expect(spawned).toBe(1);
    expect(fs.existsSync(path.join(state, "supervisor.json"))).toBe(false);
    const log = fs.readFileSync(path.join(dir, "local", "gilb-claude-code-bridge", "bridge.log"), "utf8");
    expect(log).toMatch(/another supervisor \(pid 999999\) is already running/);
    expect(log).toMatch(/Not starting a second one/);
  });
});

describe("the real bridge under the real supervisor", () => {
  let dir;
  let stopRun;
  beforeEach(() => void (dir = fs.mkdtempSync(path.join(os.tmpdir(), "sup-real-"))));
  afterEach(async () => {
    if (stopRun) await stopRun();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const until = async (fn, ms, what) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const v = await fn();
      if (v) return v;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`timed out waiting for ${what}`);
  };

  it("restarts the bridge after it is killed", async () => {
    const state = path.join(dir, "state");
    const env = { ...process.env, LOCALAPPDATA: path.join(dir, "local"), HOME: dir };
    const c = parseCli(["--supervise", "--state-dir", state, "--port", "0", "--claude", FAKE]);
    const run = runSupervisor(c, { home: dir, env, file: BRIDGE, pollMs: 50 });
    stopRun = async () => {
      fs.writeFileSync(path.join(state, "supervisor.stop"), "x");
      await run;
    };
    const readStatus = () => {
      try {
        return JSON.parse(fs.readFileSync(path.join(state, "status.json"), "utf8"));
      } catch {
        return null;
      }
    };
    const first = await until(() => readStatus()?.ok && readStatus(), 20000, "the first bridge");
    const hello = async (port) => (await fetch(`http://127.0.0.1:${port}/v1/hello`)).json();
    expect((await hello(first.port)).bridge).toBe("gilb-claude-code-bridge");
    process.kill(first.pid, "SIGKILL"); // on Windows this ends the process hard, like taskkill /F
    const second = await until(() => {
      const s = readStatus();
      return s?.ok && s.pid !== first.pid && s;
    }, 15000, "a new bridge after the kill");
    expect((await hello(second.port)).bridge).toBe("gilb-claude-code-bridge");
    expect(fs.readFileSync(path.join(dir, "local", "gilb-claude-code-bridge", "bridge.log"), "utf8")).toMatch(/bridge stopped .* starting it again in 1 s/);
  }, 60000);
});
