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
  LABEL_RE, fetchCode, unpairAll, liveSupervisor, parseCli, runSupervisor, serviceInstall, serviceStatus, serviceUninstall, superviseLoop, winCommandLine, winQuoteArg,
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
const NOW = 1_800_000_000_000;
const supRecord = (o = {}) => JSON.stringify({ pid: 4242, instance: "inst-1", label: DEFAULT_LABEL, at: "t", beat: NOW, child: 4343, ...o });
function world({ startWorks = true, foreignBridge = false, regFails = false, stubborn = false, state = STATE } = {}) {
  const files = new Map();
  const calls = [];
  const reg = new Map();
  const live = new Set(); // pids that are running
  const ports = new Set(); // ports a supervised bridge answers on
  const sups = new Map(); // state folder (lower case) -> { sup, child, port }
  let nextPid = 5000;
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
    list: (p) => [...files.keys()].filter((k) => k.startsWith(`${lower(p)}\\`) && !k.slice(p.length + 1).includes("\\")).map((k) => k.slice(p.length + 1)),
  };
  const exec = async (file, args) => {
    calls.push([file, ...args]);
    if (file === REG && args[0] === "add") {
      if (regFails) return { code: 1, out: "ERROR: Access is denied." };
      reg.set(args[3], args[args.indexOf("/d") + 1]);
      return { code: 0, out: "" };
    }
    if (file === REG && args[0] === "query") return reg.has(args[3]) ? { code: 0, out: `    ${args[3]}    REG_SZ    ${reg.get(args[3])}` } : { code: 1, out: "ERROR: not found" };
    if (file === REG && args[0] === "delete") {
      reg.delete(args[3]);
      return { code: 0, out: "" };
    }
    if (file === WSCRIPT) {
      if (!startWorks) return { code: 1, out: "Windows Script Host access is disabled on this machine." };
      if (!foreignBridge) {
        const launcher = args[args.length - 1];
        const label = /start-(.+)\.js$/.exec(launcher)[1];
        const text = decode(files.get(lower(launcher))).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        const port = Number(/--port (\d+)/.exec(text)[1]);
        const st = /--state-dir "([^"]+)"/.exec(text)?.[1] ?? state;
        const rec = label === DEFAULT_LABEL ? { sup: 4242, child: 4343 } : { sup: nextPid++, child: nextPid++ };
        sups.set(lower(st), { ...rec, port });
        live.add(rec.sup);
        live.add(rec.child);
        ports.add(port);
        files.set(lower(`${st}\\supervisor.json`), supRecord({ label, pid: rec.sup, child: rec.child }));
        files.set(lower(`${st}\\status.json`), JSON.stringify({ ok: true, port, at: "t", billing: "Claude subscription, plan max", pid: rec.child }));
      }
      return { code: 0, out: "" };
    }
    throw new Error(`unexpected program ${file}`);
  };
  const alive = (pid) => live.has(pid);
  // A supervisor ends when its stop marker is there (unless it is stubborn).
  const sleep = async () => {
    for (const [st, r] of sups) {
      if (!stubborn && files.has(`${st}\\supervisor.stop`)) {
        live.delete(r.sup);
        live.delete(r.child);
        ports.delete(r.port);
      }
    }
  };
  const hello = async (port) => (ports.has(port) || (foreignBridge && port === 47821) ? { bridge: "gilb-claude-code-bridge", build: "0.1.9" } : null);
  const deps = {
    launchctl: async () => {
      throw new Error("launchctl must not run on Windows");
    },
    uid: 0, now: () => NOW, home: HOME, nodePath: NODE, file: FILE, env: { SystemRoot: "C:\\Windows", LOCALAPPDATA: `${HOME}\\AppData\\Local` },
    platform: "win32", sfs, exec, alive, sleep, hello,
    files: { exists: (p) => lower(p) === lower(CLAUDE), read: () => "" },
    check: async () => ({ ok: true, info: { subscriptionType: "max" } }),
  };
  return { files, calls, reg, deps, sfs, live, ports, setAlive: (v) => (v ? (live.add(4242), live.add(4343)) : (live.delete(4242), live.delete(4343))) };
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
  it("carries --workspace into the launcher command, like --allow-origin", async () => {
    const w = world();
    const out = await install(w, ["--workspace", "C:\\Users\\Anna Maria\\MyCode"]);
    expect(out.ok).toBe(true);
    const js = decode(Buffer.from(w.files.get(`${LOCAL}\\start-com.gilb.claude-code-bridge.js`.toLowerCase())));
    const cmd = `"${NODE}" "${FILE}" --supervise --port 47821 --claude "${CLAUDE}" --state-dir "${STATE}" --workspace "C:\\Users\\Anna Maria\\MyCode" --label ${DEFAULT_LABEL}`;
    expect(js).toContain(`sh.Run(${JSON.stringify(cmd)}, 0, false);`);
  });

  it("writes exactly: one Run value, one launcher file and the log (nothing else), with a user name that has a space", async () => {
    const w = world();
    const out = await install(w, ["--allow-origin", "https://app.example.test"]);
    expect(out.ok).toBe(true);
    expect([...w.files.keys()].sort()).toEqual([
      `${LOCAL}\\start-com.gilb.claude-code-bridge.js`, `${LOCAL}\\bridge.log`, `${STATE}\\status.json`, `${STATE}\\supervisor.json`, `${STATE}\\service-owner.json`,
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
    const longHome = `C:\\Users\\${"x".repeat(120)}`;
    expect((await serviceInstall(parseCli(["--install", "--claude", CLAUDE, "--label", "l".repeat(64)]), { ...w.deps, home: longHome, env: { ...w.deps.env, LOCALAPPDATA: `${longHome}\\AppData\\Local` } })).message).toMatch(/Run entry/);
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
    w.files.set(`${STATE}\\supervisor.json`.toLowerCase(), supRecord());
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
    expect(out.message).toContain("Answering:  yes, http://127.0.0.1:47821 (build 0.1.9)");
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

describe("a stale supervisor.json never decides anything (M1)", () => {
  const SUPJSON = `${STATE}\\supervisor.json`.toLowerCase();
  it("install over a record that names a LIVE unrelated pid (a reused pid) starts, and does not tell the person to end anything", async () => {
    const w = world();
    w.live.add(777); // some other program that now has the old supervisor's pid
    w.files.set(SUPJSON, supRecord({ pid: 777, beat: NOW - 6 * 3600 * 1000 }));
    const out = await install(w);
    expect(out.ok).toBe(true);
    expect(out.message).not.toMatch(/Task Manager|did not stop/);
    expect(w.files.has(`${STATE}\\supervisor.stop`.toLowerCase())).toBe(false); // nobody was asked to stop
    expect(w.calls.filter((c) => c[0] === WSCRIPT).length).toBe(1);
    expect(JSON.parse(w.files.get(SUPJSON)).pid).toBe(4242); // replaced by the new supervisor
    expect(w.live.has(777)).toBe(true); // and the unrelated process was left alone
  });
  it("a bare {pid} (the old format) and garbage are stale too", async () => {
    for (const text of [JSON.stringify({ pid: 777 }), "not json", JSON.stringify({ pid: 777, instance: "x" }), "null"]) {
      const w = world();
      w.live.add(777);
      w.files.set(SUPJSON, text);
      expect((await install(w)).ok).toBe(true);
    }
  });
  it("--uninstall and --status treat it as not running", async () => {
    const w = world();
    w.live.add(777);
    w.files.set(SUPJSON, supRecord({ pid: 777, beat: NOW - 60000 }));
    expect((await serviceStatus(parseCli(["--status"]), w.deps)).message).toContain("Running:    no");
    const out = await serviceUninstall(parseCli(["--uninstall"]), w.deps);
    expect(out.message).not.toMatch(/Task Manager/);
    expect(w.files.has(SUPJSON)).toBe(false);
  });
  it("liveSupervisor: a young beat is live at once; an old beat is live only if it changes while we wait", async () => {
    const mk = (beat) => supRecord({ pid: 9, beat });
    let file = mk(NOW - 100);
    const read = () => file;
    const sleeps = [];
    expect((await liveSupervisor(read, "f", () => true, async (ms) => void sleeps.push(ms), () => NOW))?.pid).toBe(9);
    expect(sleeps).toEqual([]);
    file = mk(NOW - 60000);
    expect(await liveSupervisor(read, "f", () => true, async (ms) => void sleeps.push(ms), () => NOW)).toBeNull(); // never changes: stale
    expect(sleeps.length).toBe(1);
    expect((await liveSupervisor(read, "f", () => true, async () => void (file = mk(NOW - 500)), () => NOW))?.pid).toBe(9); // it beat while we waited (e.g. the computer had slept)
    expect(await liveSupervisor(read, "f", () => false, async () => {}, () => NOW)).toBeNull(); // dead pid
  });
  it("the supervisor replaces a record naming a live unrelated pid and starts; a beating one makes it end", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sup-stale-"));
    try {
      const state = path.join(dir, "state");
      fs.mkdirSync(state, { recursive: true });
      const sup = path.join(state, "supervisor.json");
      const cli = () => parseCli(["--supervise", "--state-dir", state, "--port", "0", "--claude", FAKE]);
      const io = (extra = {}) => ({ home: dir, env: { LOCALAPPDATA: path.join(dir, "local") }, platform: process.platform, pollMs: 20, alive: () => true, sleep: async () => {}, ...extra });
      let spawned = 0;
      const child = () => { spawned++; return { pid: 1, exited: Promise.resolve({ code: EXIT_PORT_IN_USE, signal: null }), kill: async () => {} }; };
      fs.writeFileSync(sup, JSON.stringify({ pid: process.pid + 1, instance: "old", label: DEFAULT_LABEL, beat: Date.now() - 3600_000 }));
      expect(await runSupervisor(cli(), io({ spawnChild: child }))).toBe("port-in-use"); // it ran: the old record did not stop it
      expect(spawned).toBe(1);
      fs.writeFileSync(sup, JSON.stringify({ pid: process.pid + 1, instance: "old", label: DEFAULT_LABEL, beat: Date.now() }));
      expect(await runSupervisor(cli(), io({ spawnChild: child }))).toBe("already-running");
      expect(spawned).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it("a running supervisor keeps beating (the beat time moves) and records its child", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sup-beat-"));
    try {
      const state = path.join(dir, "state");
      const c = parseCli(["--supervise", "--state-dir", state, "--port", "0", "--claude", FAKE]);
      const run = runSupervisor(c, { home: dir, env: { LOCALAPPDATA: path.join(dir, "local") }, platform: process.platform, pollMs: 20, beatMs: 20, spawnChild: () => ({ pid: 31337, exited: new Promise(() => {}), kill: async () => {} }) });
      const sup = path.join(state, "supervisor.json");
      const rec = () => { try { return JSON.parse(fs.readFileSync(sup, "utf8")); } catch { return null; } };
      for (let i = 0; i < 100 && !(rec()?.child === 31337); i++) await new Promise((r) => setTimeout(r, 20));
      const a = rec();
      expect(a).toMatchObject({ pid: process.pid, label: DEFAULT_LABEL, child: 31337 });
      expect(typeof a.instance).toBe("string");
      for (let i = 0; i < 100 && rec()?.beat === a.beat; i++) await new Promise((r) => setTimeout(r, 20));
      expect(rec().beat).toBeGreaterThan(a.beat);
      expect(rec().instance).toBe(a.instance);
      fs.writeFileSync(path.join(state, "supervisor.stop"), "x");
      expect(await run).toBe("stopped");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("a second --label is a separate install (M2)", () => {
  const A = `${HOME}\\.gilb-claude-code-bridge`;
  const B = `${HOME}\\.gilb-claude-code-bridge-b2`;
  it("each label has its own state folder, launcher, log, Run value and supervisor; installing the second leaves the first running", async () => {
    const w = world();
    expect((await install(w, ["--port", "47952"])).ok).toBe(true);
    const aSup = w.files.get(`${A}\\supervisor.json`.toLowerCase());
    expect((await install(w, ["--label", "b2", "--port", "47953"])).ok).toBe(true);
    expect(w.files.get(`${A}\\supervisor.json`.toLowerCase())).toBe(aSup); // untouched
    expect(w.files.has(`${A}\\supervisor.stop`.toLowerCase())).toBe(false);
    expect(w.live.has(4242)).toBe(true);
    expect(w.ports.has(47952) && w.ports.has(47953)).toBe(true);
    for (const f of [`${B}\\supervisor.json`, `${B}\\status.json`, `${B}\\service-owner.json`, `${LOCAL}\\start-b2.js`, `${LOCAL}\\b2.log`]) expect(w.files.has(f.toLowerCase())).toBe(true);
    expect([...w.reg.keys()].sort()).toEqual([DEFAULT_LABEL, "b2"].sort());
    const aStatus = (await serviceStatus(parseCli(["--status", "--port", "47952"]), w.deps)).message;
    const bStatus = (await serviceStatus(parseCli(["--status", "--label", "b2", "--port", "47953"]), w.deps)).message;
    expect(aStatus).toContain("Running:    yes (supervisor pid 4242, bridge pid 4343)");
    expect(bStatus).not.toContain("pid 4242");
    expect(bStatus).toMatch(/Running:    yes \(supervisor pid 50\d\d, bridge pid 50\d\d\)/);
    // Removing the second leaves the first.
    const out = await serviceUninstall(parseCli(["--uninstall", "--label", "b2"]), w.deps);
    expect(out.ok).toBe(true);
    expect(w.live.has(4242)).toBe(true);
    expect(w.reg.has(DEFAULT_LABEL)).toBe(true);
    expect(w.files.has(`${A}\\supervisor.json`.toLowerCase())).toBe(true);
    expect(w.files.has(`${LOCAL}\\start-com.gilb.claude-code-bridge.js`.toLowerCase())).toBe(true);
  });
  it("a second label on a port another install uses is refused with a plain message, and nothing is written for it", async () => {
    const w = world();
    await install(w);
    const before = new Set(w.files.keys());
    const out = await install(w, ["--label", "b2"]);
    expect(out.ok).toBe(false);
    expect(out.message).toContain(`Port 47821 is already used by the install "${DEFAULT_LABEL}"`);
    expect(out.message).toContain("--uninstall --label");
    expect([...w.files.keys()].sort()).toEqual([...before].sort());
    expect(w.reg.has("b2")).toBe(false);
    expect(w.live.has(4242)).toBe(true);
  });
  it("a second label on a state folder another label owns is refused", async () => {
    const w = world();
    await install(w, ["--port", "47952"]);
    const out = await install(w, ["--label", "b2", "--port", "47953", "--state-dir", STATE]);
    expect(out.ok).toBe(false);
    expect(out.message).toContain(`belongs to the install "${DEFAULT_LABEL}"`);
    expect(w.reg.has("b2")).toBe(false);
    expect(w.files.has(`${STATE}\\supervisor.stop`.toLowerCase())).toBe(false);
  });
  it("--status for a label never reports another label's supervisor as its own", async () => {
    const w = world();
    await install(w, ["--port", "47952"]);
    const out = await serviceStatus(parseCli(["--status", "--label", "other", "--state-dir", STATE, "--port", "47952"]), w.deps);
    expect(out.message).toContain("Installed:  no");
    expect(out.message).toContain("Running:    no");
    expect(out.message).not.toContain("pid 4242");
    expect(out.message).toContain("not this install's bridge");
  });
  it("--uninstall of a label whose state folder is another label's does not stop that one", async () => {
    const w = world();
    await install(w, ["--port", "47952"]);
    const out = await serviceUninstall(parseCli(["--uninstall", "--label", "other", "--state-dir", STATE]), w.deps);
    expect(w.live.has(4242)).toBe(true);
    expect(w.files.has(`${STATE}\\supervisor.stop`.toLowerCase())).toBe(false);
    expect(out.message).toBe("other was not installed.");
  });
});

describe("install confirms the answering bridge is its own (4a)", () => {
  it("something else answers the port while our supervisor is up and its child gave way: not success, says the port is taken", async () => {
    const w = world();
    const exec = w.deps.exec;
    w.deps.exec = async (file, args, o) => {
      const r = await exec(file, args, o);
      if (file === WSCRIPT) w.files.set(`${STATE}\\status.json`.toLowerCase(), JSON.stringify({ ok: true, port: 47821, at: "t", pid: 9999 })); // the bridge on the port is not our child
      return r;
    };
    const out = await install(w);
    expect(out.ok).toBe(false);
    expect(out.message).toContain("another bridge already holds port 47821");
    expect(out.message).toContain("Close that bridge");
  });
});

describe("--label is checked in every command, and --uninstall removes only what the bridge made (4c)", () => {
  const hostile = ["x\\..\\..\\victim", "..", "a b", "a/b", "", "a".repeat(65), "-x", 'x"y', "QaOtherApp\u0000", "a.", "a-", "a_"];
  it("the pattern, and the default label passes", () => {
    expect(LABEL_RE.test(DEFAULT_LABEL)).toBe(true);
    for (const ok of ["a", "a.b", "my.bridge", "com.gilb.claude-code-bridge", "A_b-1", "a".repeat(64)]) expect(LABEL_RE.test(ok)).toBe(true);
    for (const bad of hostile) expect(LABEL_RE.test(bad)).toBe(false);
  });
  it("install, uninstall and status refuse a hostile label and touch nothing", async () => {
    for (const label of hostile) {
      const w = world();
      w.files.set(`${HOME}\\AppData\\Local\\victim.log`.toLowerCase(), "keep");
      w.reg.set("QaOtherApp", "C:\\Other\\app.exe");
      for (const fn of [serviceInstall, serviceUninstall, serviceStatus, fetchCode, unpairAll]) {
        const out = await fn({ ...parseCli(["--install", "--claude", CLAUDE]), label }, w.deps);
        expect(out.ok).toBe(false);
        expect(out.message).toMatch(/--label may use letters/);
      }
      expect(w.calls).toEqual([]);
      expect(w.files.get(`${HOME}\\AppData\\Local\\victim.log`.toLowerCase())).toBe("keep");
      expect(w.reg.get("QaOtherApp")).toBe("C:\\Other\\app.exe");
    }
  });
  it("a Run value with the same name that this bridge did not write is left alone, and no file is removed", async () => {
    const w = world();
    w.reg.set("QaOtherApp", "C:\\Other\\app.exe --go");
    w.files.set(`${LOCAL}\\QaOtherApp.log`.toLowerCase(), "someone else's log");
    w.files.set(`${LOCAL}\\start-QaOtherApp.js`.toLowerCase(), "// not ours");
    const out = await serviceUninstall(parseCli(["--uninstall", "--label", "QaOtherApp"]), w.deps);
    expect(out.ok).toBe(false);
    expect(out.message).toContain("did not make it");
    expect(w.reg.get("QaOtherApp")).toBe("C:\\Other\\app.exe --go");
    expect(w.files.get(`${LOCAL}\\QaOtherApp.log`.toLowerCase())).toBe("someone else's log");
    expect(w.files.get(`${LOCAL}\\start-QaOtherApp.js`.toLowerCase())).toBe("// not ours");
    expect(w.calls.some((c) => c[1] === "delete")).toBe(false);
  });
  it("a launcher without the bridge's mark is not removed", async () => {
    const w = world();
    w.files.set(`${LOCAL}\\start-mine.js`.toLowerCase(), "var x = 1;");
    w.files.set(`${LOCAL}\\mine.log`.toLowerCase(), "log");
    const out = await serviceUninstall(parseCli(["--uninstall", "--label", "mine"]), w.deps);
    expect(out.message).toBe("mine was not installed.");
    expect(w.files.has(`${LOCAL}\\start-mine.js`.toLowerCase())).toBe(true);
    expect(w.files.has(`${LOCAL}\\mine.log`.toLowerCase())).toBe(true);
  });
  it("an origin with a quote mark is refused at install, nothing written", async () => {
    const w = world();
    const out = await install(w, ["--allow-origin", 'https://a"b.example.test']);
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/quote/);
    expect(w.files.size + w.reg.size).toBe(0);
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
    fs.writeFileSync(path.join(state, "supervisor.json"), JSON.stringify({ pid: 999999, instance: "other", label: DEFAULT_LABEL, beat: Date.now() }));
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
