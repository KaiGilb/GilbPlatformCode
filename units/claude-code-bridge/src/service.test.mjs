// @vitest-environment node
// The always-on service: argument handling, the LaunchAgent plist, install/uninstall/status/--code. launchctl is a
// stand-in here (no real launchd in unit tests); the real cycle is the manual run noted in README.md.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlist, createBridge, fetchCode, parseCli, resolveBin, serviceInstall, serviceStatus, serviceUninstall, DEFAULT_LABEL } from "../bridge/bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";

let home;
let calls;
let loaded = true; // what `launchctl print` says; bootout unloads
const launchctl = async (args) => {
  calls.push(args);
  if (args[0] === "bootout") loaded = false;
  if (args[0] === "bootstrap") loaded = true;
  if (args[0] === "print") return loaded ? { code: 0, out: "state = running\n\tpid = 4242" } : { code: 113, out: "" };
  return { code: 0, out: "" };
};
const deps = (extra = {}) => ({
  launchctl,
  uid: 501,
  home,
  nodePath: "/opt/node/bin/node",
  file: "/Users/p/.gilb-claude-code-bridge.mjs",
  env: { PATH: "/usr/bin" },
  platform: "darwin",
  sleep: async () => {},
  check: async () => ({ ok: true, info: { subscriptionType: "max" } }),
  ...extra,
});
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-svc-"));
  calls = [];
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

describe("argument handling", () => {
  it("no flag runs the bridge, as before; each service flag is its own mode", () => {
    expect(parseCli([]).mode).toBe("run");
    expect(parseCli(["--port", "5000", "--claude", "/x/claude"])).toMatchObject({ mode: "run", port: 5000, claude: "/x/claude", label: DEFAULT_LABEL });
    for (const m of ["install", "uninstall", "status", "code"]) expect(parseCli([`--${m}`]).mode).toBe(m);
    expect(parseCli(["-h"]).mode).toBe("help");
  });
  it("two modes at once are both reported so the CLI can refuse", () => {
    expect(parseCli(["--install", "--uninstall"]).modes).toEqual(["--install", "--uninstall"]);
  });
  it("label and state dir can be set (the test cycle uses them)", () => {
    expect(parseCli(["--install", "--label", "com.gilb.claude-code-bridge.test", "--state-dir", "/tmp/s"])).toMatchObject({ label: "com.gilb.claude-code-bridge.test", stateDir: "/tmp/s" });
  });
});

describe("plist", () => {
  it("has the label, absolute paths, RunAtLoad, KeepAlive, the PATH and the log, and escapes XML", () => {
    const x = buildPlist({ label: "com.gilb.claude-code-bridge", node: "/opt/node/bin/node", file: "/Users/p/a&b.mjs", args: ["--port", "47821"], pathEnv: "/a:/b", logFile: "/Users/p/Library/Logs/g.log", workDir: "/w" });
    expect(x).toContain("<string>com.gilb.claude-code-bridge</string>");
    expect(x).toContain("<string>/opt/node/bin/node</string>");
    expect(x).toContain("<string>/Users/p/a&amp;b.mjs</string>");
    expect(x).toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/);
    expect(x).toMatch(/<key>KeepAlive<\/key>\s*<true\/>/);
    expect(x).toContain("<key>PATH</key>\n    <string>/a:/b</string>");
    expect(x).toMatch(/<key>StandardOutPath<\/key>\s*<string>\/Users\/p\/Library\/Logs\/g.log<\/string>/);
    expect(x).not.toMatch(/ANTHROPIC|API_KEY/);
  });
});

describe("--install, --uninstall", () => {
  it("writes the plist with node, file and claude recorded as absolute paths, then boots it out and in", async () => {
    const out = await serviceInstall({ ...parseCli(["--install", "--claude", FAKE]) }, deps());
    expect(out.ok).toBe(true);
    const plist = path.join(home, "Library", "LaunchAgents", "com.gilb.claude-code-bridge.plist");
    const x = fs.readFileSync(plist, "utf8");
    expect(x).toContain("<string>/opt/node/bin/node</string>");
    expect(x).toContain("<string>/Users/p/.gilb-claude-code-bridge.mjs</string>");
    expect(x).toContain(`<string>${FAKE}</string>`);
    expect(x).toContain(path.dirname(FAKE)); // claude's folder is on the PATH it gets
    expect(x).toContain("/opt/node/bin");
    expect(x).toContain(path.join(home, "Library", "Logs", "gilb-claude-code-bridge.log"));
    expect(calls.filter((c) => c[0] !== "print")).toEqual([
      ["bootout", "gui/501/com.gilb.claude-code-bridge"],
      ["bootstrap", "gui/501", plist],
    ]);
    expect(out.message).toMatch(/--code/);
    expect(fs.statSync(path.join(home, ".gilb-claude-code-bridge")).mode & 0o077).toBe(0);
  });

  it("installing again rewrites and restarts (bootout then bootstrap)", async () => {
    await serviceInstall(parseCli(["--install", "--claude", FAKE]), deps());
    calls = [];
    await serviceInstall(parseCli(["--install", "--claude", FAKE]), deps({ file: "/Users/p/new.mjs" }));
    expect(calls.map((c) => c[0]).filter((c) => c !== "print")).toEqual(["bootout", "bootstrap"]);
    expect(fs.readFileSync(path.join(home, "Library", "LaunchAgents", "com.gilb.claude-code-bridge.plist"), "utf8")).toContain("/Users/p/new.mjs");
  });

  it("--install persists every --allow-origin in the LaunchAgent, checked and canonical", async () => {
    const out = await serviceInstall(parseCli(["--install", "--claude", FAKE, "--allow-origin", "https://app.example.com/", "--allow-origin", "http://localhost:3000"]), deps());
    expect(out.ok).toBe(true);
    const x = fs.readFileSync(path.join(home, "Library", "LaunchAgents", "com.gilb.claude-code-bridge.plist"), "utf8");
    expect(x).toMatch(/<string>--allow-origin<\/string>\s*<string>https:\/\/app\.example\.com<\/string>\s*<string>--allow-origin<\/string>\s*<string>http:\/\/localhost:3000<\/string>/);
  });

  it("--install refuses a wildcard or plain-http origin and writes nothing", async () => {
    for (const bad of ["*", "http://app.example.com", "https://*.example.com"]) {
      const out = await serviceInstall(parseCli(["--install", "--claude", FAKE, "--allow-origin", bad]), deps());
      expect(out.ok, bad).toBe(false);
      expect(out.message).toMatch(/origin|https/);
    }
    expect(fs.existsSync(path.join(home, "Library", "LaunchAgents"))).toBe(false);
    expect(calls).toEqual([]);
  });

  it("refuses, and writes nothing, when the subscription check fails: never falls back to an API key", async () => {
    const out = await serviceInstall(parseCli(["--install", "--claude", FAKE]), deps({ check: async () => ({ ok: false, reason: "You are logged in with an API key." }) }));
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/API key/);
    expect(fs.existsSync(path.join(home, "Library", "LaunchAgents"))).toBe(false);
    expect(calls).toEqual([]);
  });

  it("refuses a label that could write outside LaunchAgents and a port that is not a port; the log is private", async () => {
    for (const label of ["../../escape", "a/b", "", ".hidden", "x y"]) {
      const out = await serviceInstall({ ...parseCli(["--install", "--claude", FAKE]), label }, deps());
      expect(out.ok, label).toBe(false);
    }
    expect((await serviceInstall(parseCli(["--install", "--claude", FAKE, "--port", "abc"]), deps())).message).toMatch(/--port/);
    expect((await serviceInstall(parseCli(["--install", "--claude", FAKE, "--port", "70000"]), deps())).ok).toBe(false);
    expect(fs.existsSync(path.join(home, "escape.plist"))).toBe(false);
    await serviceInstall(parseCli(["--install", "--claude", FAKE]), deps());
    expect(fs.statSync(path.join(home, "Library", "Logs", "gilb-claude-code-bridge.log")).mode & 0o077).toBe(0);
  });

  it("refuses when claude cannot be found, and off macOS", async () => {
    expect((await serviceInstall(parseCli(["--install", "--claude", "no-such-claude-bin"]), deps())).message).toMatch(/not found/);
    expect((await serviceInstall(parseCli(["--install", "--claude", FAKE]), deps({ platform: "linux" }))).message).toMatch(/macOS only/);
  });

  it("waits until the old copy is unloaded before bootstrapping, and retries a bootstrap that races it", async () => {
    let printsLeft = 3; // still loaded for three looks after bootout
    let bootstraps = 0;
    const lc = async (a) => {
      if (a[0] === "print") return printsLeft-- > 0 ? { code: 0, out: "" } : { code: 113, out: "" };
      if (a[0] === "bootstrap") return ++bootstraps < 3 ? { code: 5, out: "Input/output error" } : { code: 0, out: "" };
      return { code: 0, out: "" };
    };
    const out = await serviceInstall(parseCli(["--install", "--claude", FAKE]), deps({ launchctl: lc }));
    expect(out.ok).toBe(true);
    expect(printsLeft).toBeLessThan(0);
    expect(bootstraps).toBe(3);
  });

  it("a launchctl failure is reported in plain words", async () => {
    const out = await serviceInstall(parseCli(["--install", "--claude", FAKE]), deps({ launchctl: async (a) => (a[0] === "bootstrap" ? { code: 5, out: "Bootstrap failed: 5" } : { code: 0, out: "" }) }));
    expect(out).toMatchObject({ ok: false });
    expect(out.message).toMatch(/Bootstrap failed/);
  });

  it("--uninstall boots out and removes the plist; a second time says it was not installed", async () => {
    await serviceInstall(parseCli(["--install", "--claude", FAKE]), deps());
    calls = [];
    const out = await serviceUninstall(parseCli(["--uninstall"]), deps());
    expect(out.message).toMatch(/Removed/);
    expect(calls).toEqual([["bootout", "gui/501/com.gilb.claude-code-bridge"]]);
    expect(fs.existsSync(path.join(home, "Library", "LaunchAgents", "com.gilb.claude-code-bridge.plist"))).toBe(false);
    const again = await serviceUninstall(parseCli(["--uninstall"]), deps({ launchctl: async () => ({ code: 113, out: "" }) }));
    expect(again.message).toMatch(/not installed/);
  });

  it("resolveBin: an explicit path is kept, a name is found on PATH, a missing one is null", () => {
    expect(resolveBin(FAKE)).toBe(FAKE);
    expect(resolveBin("fake-claude.mjs", { PATH: HERE }, home)).toBe(FAKE);
    expect(resolveBin("definitely-not-here", { PATH: HERE }, home)).toBeNull();
  });
});

describe("--code and --status over 127.0.0.1", () => {
  let bridge;
  const TOKEN = "t".repeat(64);
  const stateDir = () => path.join(home, ".gilb-claude-code-bridge");
  async function up(extra = {}) {
    bridge = createBridge({ port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(home, "work"), controlToken: TOKEN, ...extra });
    await bridge.start();
    fs.mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(stateDir(), "control-token"), TOKEN, { mode: 0o600 });
    fs.writeFileSync(path.join(stateDir(), "status.json"), JSON.stringify({ ok: true, port: bridge.port, billing: "Claude subscription, plan max", at: "now" }));
  }
  afterEach(async () => {
    await bridge?.close();
    bridge = undefined;
  });
  const get = (p, headers = {}, method = "GET") => fetch(`http://127.0.0.1:${bridge.port}${p}`, { method, headers });

  it("--code prints the current pairing code, read from the running bridge", async () => {
    await up();
    const out = await fetchCode(parseCli(["--code"]), deps());
    expect(out.ok).toBe(true);
    expect(out.message).toContain(`Pairing code: ${bridge.pairingCode}`);
  });

  it("the control door needs the token: none, wrong and another length are 401", async () => {
    await up();
    expect((await get("/control/code")).status).toBe(401);
    expect((await get("/control/code", { "x-bridge-control": "x".repeat(64) })).status).toBe(401);
    expect((await get("/control/code", { "x-bridge-control": "short" })).status).toBe(401);
    const ok = await get("/control/code", { "x-bridge-control": TOKEN });
    expect(ok.status).toBe(200);
    expect((await ok.json()).code).toBe(bridge.pairingCode);
  });

  it("a browser origin never gets it, even with the token, and no CORS header is ever set on the path", async () => {
    await up();
    for (const origin of [APP, "https://app.example.test", "https://evil.example"]) {
      const r = await get("/control/code", { "x-bridge-control": TOKEN, origin });
      expect(r.status).toBe(403);
      expect(r.headers.get("access-control-allow-origin")).toBeNull();
      expect(await r.text()).not.toContain(bridge.pairingCode);
    }
    const pre = await get("/control/code", { origin: APP, "access-control-request-method": "GET" }, "OPTIONS");
    expect(pre.status).toBe(403);
    expect(pre.headers.get("access-control-allow-origin")).toBeNull();
    expect((await get("/control/code", { "x-bridge-control": TOKEN }, "POST")).status).toBe(403);
  });

  it("a bridge started without a control token has no such door", async () => {
    await up({ controlToken: undefined });
    expect((await get("/control/code", { "x-bridge-control": TOKEN })).status).toBe(403);
  });

  it("--code says so when no bridge was ever started, or a stale token is refused", async () => {
    expect((await fetchCode(parseCli(["--code"]), deps())).message).toMatch(/No bridge has been started/);
    await up();
    fs.writeFileSync(path.join(stateDir(), "control-token"), "u".repeat(64));
    const out = await fetchCode(parseCli(["--code"]), deps());
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/401/);
  });

  it("--status shows installed, running, the billing line, the answer and the log path", async () => {
    await serviceInstall(parseCli(["--install", "--claude", FAKE]), deps());
    await up();
    const out = await serviceStatus(parseCli(["--status"]), deps());
    expect(out.message).toMatch(/Installed:\s+yes/);
    expect(out.message).toMatch(/running \(pid 4242\)/);
    expect(out.message).toContain("Billing:    Claude subscription, plan max");
    expect(out.message).toContain(`Answering:  yes, http://127.0.0.1:${bridge.port}`);
    expect(out.message).toContain("gilb-claude-code-bridge.log");
  });

  it("--status shows a failed start and that nothing runs, with the reason", async () => {
    fs.mkdirSync(stateDir(), { recursive: true });
    fs.writeFileSync(path.join(stateDir(), "status.json"), JSON.stringify({ ok: false, reason: "not logged in with a subscription", at: "t0", port: 59999 }));
    const out = await serviceStatus(parseCli(["--status"]), deps());
    expect(out.message).toMatch(/FAILED at t0: not logged in/);
    expect(out.message).toMatch(/Answering:\s+no/);
    expect(out.message).toMatch(/never an API key/);
  });
});
