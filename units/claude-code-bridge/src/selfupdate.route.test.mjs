// @vitest-environment node
// SU-3: POST /v1/update, hello.update, --selftest, --rollback, supervised detection. Hermetic: no real network, no real bridge file replaced.
import { afterEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BRIDGE_BUILD, buildPlist, createBridge, isSupervised, updateSignedText } from "../bridge/bridge.mjs";
import { removeTestDir } from "./testTeardown.mjs";

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const BUILT = path.join(HERE, "..", "bridge", "bridge.mjs");
const APP = "http://localhost:5197";
const ORIGIN = "https://host.example.test";
// Native paths on every OS (path.resolve gives "C:\\..." on Windows, and the bridge compares it with the real path).
const FILE = path.resolve(os.tmpdir(), "su-fake-home", "bridge.mjs");

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const KEYS = [{ id: "bu1", key: publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("base64") }];
const NEW = new TextEncoder().encode('export const BRIDGE_BUILD = "0.4.3";\n// next\n');
const OLD = new TextEncoder().encode("old");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
function signed(version = "0.4.3") {
  const f = { version, sha256: sha(NEW), size: NEW.length, signedAt: new Date().toISOString() };
  return { format: 1, ...f, keyId: "bu1", signature: crypto.sign(null, Buffer.from(updateSignedText({ origin: ORIGIN, ...f }), "utf8"), privateKey).toString("base64") };
}

/** Fake update dependencies that record every call. */
function fakes(over = {}) {
  const calls = [];
  const files = new Map([[FILE, OLD]]);
  const d = {
    origin: ORIGIN, keys: KEYS, file: FILE, stateDir: path.join(path.dirname(FILE), "state"),
    fetch: async (url) => {
      calls.push(["fetch", url]);
      if (over.hold) await over.hold;
      const bytes = url.endsWith(".json") ? new TextEncoder().encode(JSON.stringify(over.manifest ?? signed())) : NEW;
      return { status: 200, finalUrl: url, bytes };
    },
    fs: {
      writeFileExclusive: async (p, b) => { calls.push(["write", p]); files.set(p, b); },
      readFile: async (p) => files.get(p),
      copyFile: async (s, t) => { calls.push(["copy", s, t]); files.set(t, files.get(s)); },
      rename: async (s, t) => { calls.push(["rename", s, t]); files.set(t, files.get(s)); files.delete(s); },
      unlink: async (p) => { calls.push(["unlink", p]); files.delete(p); },
      writeFile: async (p, t) => { calls.push(["writeFile", p]); files.set(p, t); },
      realpath: async (p) => p,
      lstat: async () => ({ isFile: () => true, isSymbolicLink: () => false }),
      stat: async () => ({ uid: process.getuid?.() ?? 0, mode: 0o40755 }),
    },
    selfTest: async () => ({ code: 0, stdout: "build 0.4.3\n" }),
    ...over.deps,
  };
  return { d, calls, files };
}

let dir;
let bridge;
let base;
/** Stand-in logs kept outside the test folder; the teardown reads their pids so it waits for the stand-ins before removing the folder (Windows holds a running child's folder). */
let extraLogs = [];
async function start(opts = {}) {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-su3-")));
  const env = { ...process.env, ...opts.env };
  if (opts.env === undefined) delete env.GILB_BRIDGE_SUPERVISED;
  bridge = createBridge({ port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "work"), home: dir, codeEnvExtraPrefixes: ["FAKE_"], codePlatform: "darwin", ...opts, env });
  await bridge.start();
  base = `http://127.0.0.1:${bridge.port}`;
  const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: bridge.pairingCode }) });
  return (await res.json()).secret;
}
afterEach(async () => {
  await bridge?.close();
  bridge = undefined;
  if (dir) await removeTestDir(dir, extraLogs);
  dir = undefined;
  extraLogs = [];
});
const post = async (secret, body = {}, headers = {}) => {
  const res = await fetch(`${base}/v1/update`, { method: "POST", headers: { "content-type": "application/json", ...(secret ? { "x-bridge-secret": secret } : {}), ...headers }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const until = async (fn, ms = 10000) => {
  for (let i = 0; i < ms / 20; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("timed out waiting");
};
const hello = async (secret) => (await (await fetch(`${base}/v1/hello`, { headers: secret ? { "x-bridge-secret": secret } : {} })).json()).update;

describe("POST /v1/update", () => {
  it("U1 no secret is 401; a wrong origin is 403", async () => {
    await start();
    expect((await post(null)).status).toBe(401);
    expect((await post("x".repeat(64), {}, { origin: "https://other.example" })).status).toBe(403);
  });

  it("U2 a running turn is 409 TurnRunning, and nothing is fetched", async () => {
    const { d, calls } = fakes();
    const secret = await start({ updateDeps: d, env: { FAKE_CLAUDE_LOG: "/dev/null" } });
    const ctl = new AbortController();
    const t = await fetch(`${base}/v1/turn`, { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify({ system: "s", tools: [{ name: "list_vaults", description: "d", inputSchema: { type: "object", properties: {} } }], prompt: "WAITFOREVER" }) });
    expect(t.status).toBe(200);
    await until(async () => (await (await fetch(`${base}/v1/turns`, { method: "POST", headers: { "x-bridge-secret": secret } })).json()).turns.length > 0);
    const r = await post(secret);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("TurnRunning");
    expect(calls).toEqual([]);
    ctl.abort();
  });

  it("U3 success while supervised: restart automatic, and exit(75) comes only after the client has the answer", async () => {
    const order = [];
    const { d, files } = fakes();
    const secret = await start({ updateDeps: d, env: { GILB_BRIDGE_SUPERVISED: "1" }, exit: (c) => order.push(["exit", c]) });
    const r = await post(secret);
    order.push(["received"]);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ updated: true, from: BRIDGE_BUILD, to: "0.4.3", restart: "automatic" });
    expect(files.get(FILE)).toBe(NEW);
    await until(() => order.some((o) => o[0] === "exit"));
    expect(order).toEqual([["received"], ["exit", 75]]);
  });

  it("U4 success while not supervised: restart manual, exit not called", async () => {
    const exit = vi.fn();
    const { d } = fakes();
    const secret = await start({ updateDeps: d, exit, label: "com.test.not-this-one", env: {} });
    const r = await post(secret);
    expect(r.json).toEqual({ updated: true, from: BRIDGE_BUILD, to: "0.4.3", restart: "manual" });
    await new Promise((x) => setTimeout(x, 400));
    expect(exit).not.toHaveBeenCalled();
  });

  it("U5 every failure code maps to its HTTP status", async () => {
    const table = { UpdateRunning: 409, UpdateCannotWrite: 409, UpdateOff: 501, UpdateNetwork: 502, UpdateBad: 502, UpdateSignature: 422, UpdateMismatch: 422, UpdateTooOld: 422, UpdateSelfTest: 422, UpdateDisk: 500 };
    let code = "";
    const secret = await start({ updateRun: async () => ({ updated: false, code, message: `msg ${code}` }) });
    for (const [c, status] of Object.entries(table)) {
      code = c;
      const r = await post(secret);
      expect([c, r.status]).toEqual([c, status]);
      expect(r.json).toEqual({ error: `msg ${c}`, code: c });
    }
  });

  it("U5b already newest is 200 { updated:false, reason:current }", async () => {
    const { d } = fakes({ manifest: signed("0.3.16") });
    const secret = await start({ updateDeps: d });
    expect(await post(secret)).toEqual({ status: 200, json: { updated: false, reason: "current" } });
  });

  it("U6 check:true answers { current, latest, available } and writes no file", async () => {
    const a = fakes();
    let secret = await start({ updateDeps: a.d });
    expect(await post(secret, { check: true })).toEqual({ status: 200, json: { current: BRIDGE_BUILD, latest: "0.4.3", available: true } });
    expect(a.calls.map((c) => c[0])).toEqual(["fetch"]);
    await bridge.close();
    const b = fakes({ manifest: signed("0.3.16") });
    secret = await start({ updateDeps: b.d });
    expect(await post(secret, { check: true })).toEqual({ status: 200, json: { current: BRIDGE_BUILD, latest: "0.3.16", available: false } });
    expect(b.calls.map((c) => c[0])).toEqual(["fetch"]);
  });
});

describe("hello.update", () => {
  it("U7 supported follows origin and keys; busy is true while an update hangs", async () => {
    let secret = await start();
    expect((await hello(secret)).supported).toBe(false);
    await bridge.close();
    let release;
    const hold = new Promise((r) => { release = r; });
    const { d } = fakes({ hold });
    secret = await start({ updateDeps: d });
    const h = await hello(secret);
    expect(h).toEqual({ supported: true, supervised: false, canWrite: true, busy: false });
    const pending = post(secret);
    await until(async () => (await hello(secret)).busy === true);
    release();
    await pending;
    expect((await hello(secret)).busy).toBe(false);
  });

  it("U7b empty keys or a non-https origin is not supported", async () => {
    const { d } = fakes({ deps: { keys: [] } });
    let secret = await start({ updateDeps: d });
    expect((await hello(secret)).supported).toBe(false);
    await bridge.close();
    const e = fakes({ deps: { origin: "http://x.example.test" } });
    secret = await start({ updateDeps: e.d });
    expect((await hello(secret)).supported).toBe(false);
  });

  it("L1 hello.canWrite is false for a symlinked run path and for a folder others can write; true for a good one", async () => {
    const mk = (fsOver) => { const f = fakes(); return { ...f.d, fs: { ...f.d.fs, ...fsOver } }; };
    let secret = await start({ updateDeps: mk({ lstat: async () => ({ isFile: () => false, isSymbolicLink: () => true }) }) });
    expect((await hello(secret)).canWrite).toBe(false);
    await bridge.close();
    secret = await start({ updateDeps: mk({ stat: async () => ({ uid: process.getuid?.() ?? 0, mode: 0o40775 }) }) });
    expect((await hello(secret)).canWrite).toBe(process.platform === "win32");
    await bridge.close();
    secret = await start({ updateDeps: mk({}) });
    expect((await hello(secret)).canWrite).toBe(true);
  });

  it("L7c an unpaired hello (no secret, or a wrong one) has no update field; the rest is unchanged", async () => {
    const { d } = fakes();
    await start({ updateDeps: d });
    for (const headers of [{}, { "x-bridge-secret": "0".repeat(64) }]) {
      const body = await (await fetch(`${base}/v1/hello`, { headers })).json();
      expect("update" in body).toBe(false);
      expect(body.bridge).toBe("gilb-claude-code-bridge");
      expect(body.build).toBe(BRIDGE_BUILD);
    }
  });
});

describe("isSupervised", () => {
  const L = "com.gilb.claude-code-bridge";
  const f = (o = {}) => ({ label: L, supervisorJson: null, now: 1_000_000, pid: 42, ...o });
  const sup = (o) => JSON.stringify({ pid: 7, instance: "i", beat: 1_000_000 - 2000, child: 42, ...o });
  it("S1 table", () => {
    expect(isSupervised({ XPC_SERVICE_NAME: L }, f())).toBe(true);
    expect(isSupervised({ XPC_SERVICE_NAME: "0" }, f())).toBe(false);
    expect(isSupervised({ GILB_BRIDGE_SUPERVISED: "1" }, f())).toBe(true);
    expect(isSupervised({ GILB_BRIDGE_SUPERVISED: "0" }, f())).toBe(false);
    expect(isSupervised({}, f())).toBe(false);
    expect(isSupervised({}, f({ supervisorJson: sup() }))).toBe(true);
    expect(isSupervised({}, f({ supervisorJson: sup({ beat: 1_000_000 - 30_000 }) }))).toBe(false); // stale
    expect(isSupervised({}, f({ supervisorJson: sup({ child: 43 }) }))).toBe(false); // another pid
    expect(isSupervised({}, f({ supervisorJson: "{nope" }))).toBe(false);
    expect(isSupervised({ XPC_SERVICE_NAME: "com.other" }, f({ label: "com.other.x" }))).toBe(false);
  });
});

describe("command line", () => {
  it("C1 --selftest prints the build and exits 0 without binding the port", async () => {
    const free = await new Promise((resolve) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });
    const r = spawnSync(process.execPath, [BUILT, "--selftest", "--port", String(free), "--state-dir", "/nonexistent/should-not-be-read"], { encoding: "utf8", timeout: 15000 });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(`build ${BRIDGE_BUILD}`);
    expect(BRIDGE_BUILD).toBe("0.4.2");
    await new Promise((resolve, reject) => { const s = net.createServer().once("error", reject).listen(free, "127.0.0.1", () => s.close(() => resolve())); });
  });

  it("C2 --rollback puts .prev back with and refuses without it", () => {
    dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-rb-")));
    const file = path.join(dir, "bridge.mjs");
    fs.copyFileSync(BUILT, file);
    const none = spawnSync(process.execPath, [file, "--rollback"], { encoding: "utf8", timeout: 15000 });
    expect(none.status).toBe(1);
    expect(none.stderr).toContain("No previous bridge to roll back to.");
    expect(fs.readFileSync(file, "utf8")).toBe(fs.readFileSync(BUILT, "utf8"));
    fs.writeFileSync(file + ".prev", "// the previous bridge\n");
    const ok = spawnSync(process.execPath, [file, "--rollback"], { encoding: "utf8", timeout: 15000 });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("Rolled back to the previous bridge. Restart it:");
    expect(fs.readFileSync(file, "utf8")).toBe("// the previous bridge\n");
    expect(fs.readdirSync(dir).filter((n) => n.includes("rollback"))).toEqual([]);
  });

  it("C3 --help lists both", () => {
    const r = spawnSync(process.execPath, [BUILT, "--help"], { encoding: "utf8", timeout: 15000 });
    expect(r.stdout).toContain("--selftest");
    expect(r.stdout).toContain("--rollback");
  });
});

describe("service files", () => {
  it("P1 the LaunchAgent plist sets GILB_BRIDGE_SUPERVISED", () => {
    const text = buildPlist({ label: "com.x", node: "/n", file: "/f.mjs", pathEnv: "/bin", logFile: "/l", workDir: "/w" });
    expect(text).toContain("<key>GILB_BRIDGE_SUPERVISED</key>\n    <string>1</string>");
  });
});

describe("SU-5a: no turn during an update, and a clean exit", () => {
  const TOOLS = [{ name: "list_vaults", description: "d", inputSchema: { type: "object", properties: {} } }];
  const startTurn = async (secret, prompt = "WAITFOREVER") => {
    const ctl = new AbortController();
    const res = await fetch(`${base}/v1/turn`, { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify({ system: "s", tools: TOOLS, prompt }) });
    return { res, ctl };
  };
  const turnCount = async (secret) => (await (await fetch(`${base}/v1/turns`, { method: "POST", headers: { "x-bridge-secret": secret } })).json()).turns.length;
  const logRows = (file, event) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.event === event) : []);

  it("M1a a turn is refused (409 UpdateRunning) while an update runs, and no claude child is started", async () => {
    let release;
    const hold = new Promise((r) => { release = r; });
    const { d } = fakes({ hold });
    const logFile = path.join(os.tmpdir(), `su5a-m1a-${process.pid}.log`);
    fs.rmSync(logFile, { force: true });
    extraLogs.push(logFile);
    const secret = await start({ updateDeps: d, env: { FAKE_CLAUDE_LOG: logFile } });
    const pending = post(secret);
    await until(async () => (await hello(secret)).busy === true);
    const t = await startTurn(secret, "hello");
    expect(t.res.status).toBe(409);
    expect(await t.res.json()).toEqual({ error: "The bridge is updating. Send your message again in a minute.", code: "UpdateRunning" });
    expect(logRows(logFile, "run")).toEqual([]);
    release();
    await pending;
    fs.rmSync(logFile, { force: true });
  });

  it("M1b a turn that exists when the update finishes defers the restart until it ends; then exit 75", async () => {
    const exits = [];
    const logFile = path.join(os.tmpdir(), `su5a-m1b-${process.pid}.log`);
    fs.rmSync(logFile, { force: true });
    extraLogs.push(logFile);
    let turn;
    const secret = await start({
      env: { GILB_BRIDGE_SUPERVISED: "1", FAKE_CLAUDE_LOG: logFile },
      updateRestart: { pollMs: 20, capMs: 20000 },
      exit: (c) => exits.push([c, bridge.server.listening]),
      // the defended race: a turn exists although the route refuses new ones (the hook does not set the update flag)
      updateRun: async () => {
        turn = await startTurn(secret);
        await until(async () => (await turnCount(secret)) > 0);
        await until(() => logRows(logFile, "run").length > 0); // the child has started and can log its SIGTERM
        return { updated: true, from: BRIDGE_BUILD, to: "0.3.22" };
      },
    });
    const r = await post(secret);
    expect(r.json).toEqual({ updated: true, from: BRIDGE_BUILD, to: "0.3.22", restart: "automatic" });
    await new Promise((x) => setTimeout(x, 700));
    expect(exits).toEqual([]); // still waiting: the turn runs
    expect(await turnCount(secret)).toBe(1);
    turn.ctl.abort(); // the turn ends
    await until(() => exits.length > 0);
    expect(exits).toEqual([[75, false]]);
  });

  // Spec: the restart's close() waits for chat children. The page hangs up, the turn leaves the table, and the restart goes on to close() and exit(75); the
  // chat child (a stand-in that exits 800 ms after its first SIGTERM) must be gone when exit is called, or a new bridge.mjs could be put in place under it.
  it("M1b the restart waits for the chat child to exit before exit 75", async () => {
    const exits = [];
    const alivePid = (pid) => {
      if (process.platform !== "win32") { try { process.kill(pid, 0); return true; } catch { return false; } }
      return execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH"], { encoding: "utf8" }).includes(` ${pid} `);
    };
    const logFile = path.join(os.tmpdir(), `su5a-m1c-${process.pid}.log`);
    fs.rmSync(logFile, { force: true });
    extraLogs.push(logFile);
    let turn;
    let pid = 0;
    let aliveAtExit = null;
    const secret = await start({
      env: { GILB_BRIDGE_SUPERVISED: "1", FAKE_CLAUDE_LOG: logFile },
      updateRestart: { pollMs: 20, capMs: 20000 },
      exit: (c) => { aliveAtExit = alivePid(pid); exits.push([c, bridge.server.listening]); },
      updateRun: async () => {
        turn = await startTurn(secret, "SLOWEXIT800 WAITFOREVER");
        await until(async () => (await turnCount(secret)) > 0);
        await until(() => logRows(logFile, "run").length > 0);
        pid = logRows(logFile, "run")[0].pid;
        return { updated: true, from: BRIDGE_BUILD, to: "0.3.22" };
      },
    });
    expect((await post(secret)).json).toEqual({ updated: true, from: BRIDGE_BUILD, to: "0.3.22", restart: "automatic" });
    await new Promise((x) => setTimeout(x, 300));
    expect(exits).toEqual([]);
    turn.ctl.abort();
    await until(() => exits.length > 0);
    expect(exits).toEqual([[75, false]]);
    expect(aliveAtExit).toBe(false); // the chat child had exited when exit(75) was called
  });

  // Spec: the same at the restart, for a chat child that ignores SIGTERM (stand-in IGNORETERMFOREVER): exit(75) is called with it gone (SIGKILL after killGraceMs).
  it("M1b the restart ends a chat child that ignores SIGTERM before exit 75", async () => {
    const exits = [];
    const alivePid = (pid) => {
      if (process.platform !== "win32") { try { process.kill(pid, 0); return true; } catch { return false; } }
      return execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH"], { encoding: "utf8" }).includes(` ${pid} `);
    };
    const logFile = path.join(os.tmpdir(), `su5a-m1d-${process.pid}.log`);
    fs.rmSync(logFile, { force: true });
    extraLogs.push(logFile);
    let turn;
    let pid = 0;
    let aliveAtExit = null;
    const secret = await start({
      env: { GILB_BRIDGE_SUPERVISED: "1", FAKE_CLAUDE_LOG: logFile },
      killGraceMs: 300,
      updateRestart: { pollMs: 20, capMs: 20000 },
      exit: (c) => { aliveAtExit = alivePid(pid); exits.push([c, bridge.server.listening]); },
      updateRun: async () => {
        turn = await startTurn(secret, "IGNORETERMFOREVER WAITFOREVER");
        await until(async () => (await turnCount(secret)) > 0);
        await until(() => logRows(logFile, "run").length > 0);
        pid = logRows(logFile, "run")[0].pid;
        return { updated: true, from: BRIDGE_BUILD, to: "0.3.22" };
      },
    });
    try {
      expect((await post(secret)).json).toEqual({ updated: true, from: BRIDGE_BUILD, to: "0.3.22", restart: "automatic" });
      await new Promise((x) => setTimeout(x, 300));
      turn.ctl.abort();
      await until(() => exits.length > 0);
      expect(exits).toEqual([[75, false]]);
      expect(aliveAtExit).toBe(false);
    } finally {
      try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
    }
  });

  it("M1b after the cap the running turn is stopped (its child gets SIGTERM), then exit 75", async () => {
    const exits = [];
    const closeErrors = [];
    const logFile = path.join(os.tmpdir(), `su5a-cap-${process.pid}.log`);
    fs.rmSync(logFile, { force: true });
    extraLogs.push(logFile);
    const secret = await start({
      env: { GILB_BRIDGE_SUPERVISED: "1", FAKE_CLAUDE_LOG: logFile },
      updateRestart: { pollMs: 20, capMs: 500 },
      log: (l) => { if (/close failed/.test(l)) closeErrors.push(l); },
      exit: (c) => exits.push([c, bridge.server.listening]),
      updateRun: async () => {
        const st = await startTurn(secret);
        if (st.res.status !== 200) throw new Error("turn refused: " + st.res.status + " " + (await st.res.text()));
        await until(async () => (await turnCount(secret)) > 0);
        await until(() => logRows(logFile, "run").length > 0); // the child has started and can log its SIGTERM
        return { updated: true, from: BRIDGE_BUILD, to: "0.3.22" };
      },
    });
    await post(secret);
    await until(() => exits.length > 0, 15000);
    expect(exits).toEqual([[75, false]]);
    // The child was told to stop. Off Windows the stand-in logs the SIGTERM; Windows ends the tree with taskkill /F (nothing to catch), so there its process is gone.
    if (process.platform === "win32") {
      const pid = logRows(logFile, "run")[0].pid;
      await until(() => { try { process.kill(pid, 0); return false; } catch { return true; } }, 5000);
    } else {
      await until(() => logRows(logFile, "sigterm").length > 0, 5000);
    }
    expect(logRows(logFile, "run")).toHaveLength(1); // and no second child was started
    expect(closeErrors).toEqual([]); // close() did not throw (a throw would be logged as "restart: close failed: ...")
  });

  it("M1c the listener is closed through the bridge's close() before exit(75)", async () => {
    const exits = [];
    const { d } = fakes();
    const secret = await start({ updateDeps: d, env: { GILB_BRIDGE_SUPERVISED: "1" }, exit: (c) => exits.push([c, bridge.server.listening]) });
    const r = await post(secret);
    expect(r.json.restart).toBe("automatic");
    await until(() => exits.length > 0);
    expect(exits).toEqual([[75, false]]);
  });

  it("M1a also holds between the answer and the exit: a turn sent then is refused", async () => {
    const { d } = fakes();
    const secret = await start({ updateDeps: d, env: { GILB_BRIDGE_SUPERVISED: "1" }, updateRestart: { pollMs: 20 }, exit: () => {} });
    await post(secret);
    const t = await startTurn(secret, "hello").catch((e) => ({ err: e }));
    if (t.res) expect(t.res.status).toBe(409);
  });
});
