// @vitest-environment node
// Bridge 0.3.19: the access switch. POST /v1/access, access.json, the per-turn snapshot, the dialog commands, the command-line precedence.
// The dialog is ALWAYS injected (or its command runner is): no real window opens in this file. The real macOS dialog was run by hand once.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as B from "../bridge/bridge.mjs";
import { removeTestDir } from "./testTeardown.mjs";

// A namespace import: on a bridge without these exports the tests fail one by one instead of the whole file failing to load.
const { createBridge, parseCli } = B;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";

let dir;
let home;
let stateDir;
let accessFile;
let logFile;
let base;
const bridges = [];
const clock = { t: Date.parse("2026-11-19T10:00:00Z") };
const open = [];

function prep() {
  if (dir) return;
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-access-")));
  home = path.join(dir, "home");
  stateDir = path.join(home, ".gilb-claude-code-bridge");
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  accessFile = path.join(stateDir, "access.json");
  logFile = path.join(dir, "claude.log");
}
const ws = () => {
  prep();
  const p = path.join(home, "Work");
  fs.mkdirSync(path.join(p, "alpha"), { recursive: true });
  return fs.realpathSync.native(p);
};
async function startBridge(opts = {}) {
  prep();
  const b = createBridge({
    port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "work"), home, stateDir,
    codeEnvExtraPrefixes: ["FAKE_"], codePlatform: "darwin", now: () => clock.t,
    env: { ...process.env, FAKE_CLAUDE_LOG: logFile },
    ...opts,
  });
  bridges.push(b);
  await b.start();
  base = `http://127.0.0.1:${b.port}`;
  const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: b.pairingCode }) });
  return { bridge: b, secret: (await res.json()).secret };
}
afterEach(async () => {
  for (const t of open.splice(0)) t.ctl.abort();
  for (const b of bridges.splice(0)) await b.close();
  if (dir) await removeTestDir(dir);
  dir = undefined;
  clock.t = Date.parse("2026-11-19T10:00:00Z");
});

const accessReq = async (secret, body, headers = {}) => {
  const res = await fetch(`${base}/v1/access`, { method: "POST", headers: { "content-type": "application/json", ...(secret ? { "x-bridge-secret": secret } : {}), ...headers }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const hello = async () => (await fetch(`${base}/v1/hello`)).json();
const saved = () => JSON.parse(fs.readFileSync(accessFile, "utf8"));
const rows = (event) => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.event === event) : []);
const until = async (fn, ms = 15000) => {
  for (let i = 0; i < ms / 25; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("timed out waiting");
};
/** Opens a code turn in the background (events collected); `prompt` WAITFOREVER keeps the stand-in claude running. */
async function codeTurn(secret, extra = {}) {
  const ctl = new AbortController();
  const res = await fetch(`${base}/v1/turn`, {
    method: "POST", signal: ctl.signal,
    headers: { "content-type": "application/json", "x-bridge-secret": secret },
    body: JSON.stringify({ system: "You are the agent.", prompt: "WAITFOREVER", mode: "code", ...extra }),
  });
  const t = { status: res.status, events: [], turnId: "", ctl, json: null, ended: false };
  open.push(t);
  if (res.status !== 200) {
    t.json = await res.json().catch(() => null);
    return t;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  t.done = (async () => {
    let buf = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const blk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /event: (.*)/.exec(blk)?.[1];
          const data = /data: (.*)/.exec(blk)?.[1];
          if (!ev) continue;
          const parsed = JSON.parse(data);
          t.events.push([ev, parsed]);
          if (ev === "start") t.turnId = parsed.turnId;
        }
      }
    } catch { /* hung up */ }
    t.ended = true;
  })();
  await until(() => t.turnId);
  return t;
}
const dialogReturning = (v) => vi.fn(async () => v);

describe("POST /v1/access: the guard", () => {
  it("unpaired is 401, a wrong origin is 403, a bad mode is 400; the dialog never opens", async () => {
    const dialog = dialogReturning("allow");
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialog });
    expect((await accessReq(null, { mode: "computer" })).status).toBe(401);
    expect((await accessReq(secret, { mode: "computer" }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await accessReq(secret, { mode: "everything" })).status).toBe(400);
    expect((await accessReq(secret, {})).status).toBe(400);
    expect(dialog).not.toHaveBeenCalled();
    expect((await hello()).access).toBe("folder");
  });
});

describe("folder: immediate", () => {
  it("writes access.json (0600), says changed false when already folder, and cancels a running computer-mode code turn", async () => {
    const { secret } = await startBridge({ workspace: ws(), fullAccess: true, accessDialog: dialogReturning("cancel") });
    expect((await hello()).access).toBe("computer");
    const t = await codeTurn(secret);
    await until(() => rows("run").length === 1);
    expect(rows("run")[0].argv).not.toContain("--restricted"); // a computer-mode run
    const r = await accessReq(secret, { mode: "folder" });
    expect(r).toEqual({ status: 200, json: { access: "folder", changed: true, cancelled: 1 } });
    expect(saved()).toMatchObject({ version: 1, mode: "folder" });
    if (process.platform !== "win32") expect(fs.statSync(accessFile).mode & 0o777).toBe(0o600);
    expect((await hello()).access).toBe("folder");
    await until(() => t.ended);
    expect(t.events.find((e) => e[0] === "error")[1]).toEqual({ message: "The turn was cancelled." });
    expect(t.events.map((e) => e[0])).not.toContain("message");
    expect(await accessReq(secret, { mode: "folder" })).toEqual({ status: 200, json: { access: "folder", changed: false, cancelled: 0 } });
  });

  it("a folder-mode code turn is not cancelled by a switch to folder", async () => {
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialogReturning("allow") });
    const t = await codeTurn(secret);
    expect((await accessReq(secret, { mode: "folder" })).json.cancelled).toBe(0);
    await new Promise((r) => setTimeout(r, 150));
    expect(t.ended).toBe(false);
  });
});

describe("computer: only the person's Allow", () => {
  it("Allow: 200, the file says computer, hello says so, and the next code turn runs in computer mode", async () => {
    const dialog = dialogReturning("allow");
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialog });
    const r = await accessReq(secret, { mode: "computer", text: "EVIL TEXT", title: "EVIL", script: "do shell script" });
    expect(r).toEqual({ status: 200, json: { access: "computer", changed: true } });
    expect(dialog).toHaveBeenCalledTimes(1);
    expect(dialog.mock.calls[0]).toEqual([]); // nothing from the request reaches the dialog
    expect(saved()).toMatchObject({ version: 1, mode: "computer" });
    expect(await hello()).toMatchObject({ access: "computer", accessSource: "file", accessChangeable: true });
    const res = await fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify({ system: "s", prompt: "hello", mode: "code" }) });
    expect(await res.text()).toContain('"access":"computer"');
    // already on: no second dialog
    expect(await accessReq(secret, { mode: "computer" })).toEqual({ status: 200, json: { access: "computer", changed: false } });
    expect(dialog).toHaveBeenCalledTimes(1);
  });

  it("Cancel and timeout: 403 AccessDenied, nothing changes, no file written", async () => {
    for (const answer of ["cancel", "timeout", "yes", undefined, true]) {
      const { secret } = await startBridge({ workspace: ws(), accessDialog: dialogReturning(answer) });
      const r = await accessReq(secret, { mode: "computer" });
      expect(r.status, String(answer)).toBe(403);
      expect(r.json.code).toBe("AccessDenied");
      expect((await hello()).access).toBe("folder");
      expect(fs.existsSync(accessFile)).toBe(false);
      await bridges.pop().close();
    }
  });

  it("a dialog that cannot open: 501, state unchanged; never allowed on an error", async () => {
    const { secret } = await startBridge({ workspace: ws(), accessDialog: vi.fn(async () => { throw new Error("no display"); }) });
    const r = await accessReq(secret, { mode: "computer" });
    expect(r.status).toBe(501);
    expect(r.json.code).toBe("AccessDialogUnavailable");
    expect((await hello()).access).toBe("folder");
    expect(fs.existsSync(accessFile)).toBe(false);
    // and the next try is not held back by a cooldown: an error is not a "no"
    expect((await accessReq(secret, { mode: "computer" })).status).toBe(501);
  });

  it("Linux without zenity: 501 and no dialog", async () => {
    const { secret } = await startBridge({ workspace: ws(), platformOpts: { platform: "linux" }, which: () => false });
    expect((await accessReq(secret, { mode: "computer" })).status).toBe(501);
  });

  it("409 while a code turn runs", async () => {
    const dialog = dialogReturning("allow");
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialog });
    await codeTurn(secret);
    const r = await accessReq(secret, { mode: "computer" });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("TurnRunning");
    expect(dialog).not.toHaveBeenCalled();
  });

  it("409 while the dialog is open (a second request, and the folder chooser), and a NEW code turn is refused; then it works again", async () => {
    let answer;
    const dialog = vi.fn(() => new Promise((r) => { answer = r; }));
    const chooser = vi.fn(async () => null);
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialog, chooseFolder: chooser });
    const first = accessReq(secret, { mode: "computer" });
    await until(() => dialog.mock.calls.length === 1);
    const second = await accessReq(secret, { mode: "computer" });
    expect(second.status).toBe(409);
    expect(second.json.code).toBe("AccessDialogOpen");
    const turn = await codeTurn(secret);
    expect(turn.status).toBe(409);
    expect(turn.json.code).toBe("AccessDialogOpen");
    const choose = await fetch(`${base}/v1/workspace/choose`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: "{}" });
    expect(choose.status).toBe(409);
    expect(chooser).not.toHaveBeenCalled();
    expect(rows("run")).toEqual([]);
    answer("allow");
    expect((await first).status).toBe(200);
    const after = await codeTurn(secret, { prompt: "hello" });
    expect(after.status).toBe(200);
  });

  it("409 while the bridge updates", async () => {
    const dialog = dialogReturning("allow");
    prep();
    let release;
    const hold = new Promise((r) => { release = r; });
    const file = path.join(dir, "bridge.mjs");
    const updateDeps = {
      origin: "https://app.example.test", keys: [{ id: "k", key: crypto.generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("base64") }],
      file, stateDir,
      fetch: async () => { await hold; throw new Error("stop"); },
      fs: {
        writeFileExclusive: async () => {}, readFile: async () => new Uint8Array(), copyFile: async () => {}, rename: async () => {}, unlink: async () => {}, writeFile: async () => {},
        realpath: async (p) => p, lstat: async () => ({ isFile: () => true, isSymbolicLink: () => false }), stat: async () => ({ uid: process.getuid?.() ?? 0, mode: 0o40755 }),
      },
      selfTest: async () => ({ code: 0, stdout: "" }),
    };
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialog, updateDeps });
    const upd = fetch(`${base}/v1/update`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: "{}" });
    await until(async () => (await (await fetch(`${base}/v1/hello`, { headers: { "x-bridge-secret": secret } })).json()).update?.busy === true);
    for (const mode of ["computer", "folder"]) {
      const r = await accessReq(secret, { mode });
      expect(r.status, mode).toBe(409);
      expect(r.json.code).toBe("UpdateRunning");
    }
    expect(dialog).not.toHaveBeenCalled();
    release();
    await (await upd).text();
  });

  it("a folder switch while the window is open wins: a late Allow does not raise the mode", async () => {
    let answer;
    const dialog = vi.fn(() => new Promise((r) => { answer = r; }));
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialog });
    const pending = accessReq(secret, { mode: "computer" });
    await until(() => dialog.mock.calls.length === 1);
    expect((await accessReq(secret, { mode: "folder" })).status).toBe(200);
    answer("allow");
    const r = await pending;
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("AccessChanged");
    expect((await hello()).access).toBe("folder");
    expect(saved().mode).toBe("folder");
  });

  it("a file that cannot be written never turns it on", async () => {
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialogReturning("allow") });
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.writeFileSync(stateDir, "not a folder"); // access.json cannot be made under a file
    const r = await accessReq(secret, { mode: "computer" });
    expect(r.status).toBe(500);
    expect((await hello()).access).toBe("folder");
  });
});

describe("cooldown and the hourly limit", () => {
  it("after a Cancel another ON is refused for 30 s (429), then the dialog opens again", async () => {
    const dialog = dialogReturning("cancel");
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialog });
    expect((await accessReq(secret, { mode: "computer" })).status).toBe(403);
    const r = await accessReq(secret, { mode: "computer" });
    expect(r.status).toBe(429);
    expect(r.json.code).toBe("AccessCooldown");
    expect(dialog).toHaveBeenCalledTimes(1);
    clock.t += 29_000;
    expect((await accessReq(secret, { mode: "computer" })).status).toBe(429);
    clock.t += 2_000;
    expect((await accessReq(secret, { mode: "computer" })).status).toBe(403);
    expect(dialog).toHaveBeenCalledTimes(2);
  });

  it("at most 5 ON requests per hour per pairing; the 6th is 429; an hour later it works", async () => {
    const dialog = dialogReturning("cancel");
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialog });
    for (let i = 0; i < 5; i++) {
      expect((await accessReq(secret, { mode: "computer" })).status, `request ${i + 1}`).toBe(403);
      clock.t += 31_000;
    }
    const r = await accessReq(secret, { mode: "computer" });
    expect(r.status).toBe(429);
    expect(r.json.code).toBe("AccessTooMany");
    expect(dialog).toHaveBeenCalledTimes(5);
    clock.t += 3_600_000;
    expect((await accessReq(secret, { mode: "computer" })).status).toBe(403);
    expect(dialog).toHaveBeenCalledTimes(6);
  });

  it("the hourly count is per pairing: another paired page still reaches the dialog", async () => {
    const dialog = dialogReturning("cancel");
    const { bridge, secret } = await startBridge({ workspace: ws(), accessDialog: dialog });
    for (let i = 0; i < 5; i++) {
      await accessReq(secret, { mode: "computer" });
      clock.t += 31_000;
    }
    expect((await accessReq(secret, { mode: "computer" })).status).toBe(429);
    const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: bridge.pairingCode }) });
    const other = (await res.json()).secret;
    expect((await accessReq(other, { mode: "computer" })).status).toBe(403);
  });
});

describe("the per-turn snapshot", () => {
  it("a turn keeps the mode it started with; a switch to folder cancels it, and the next turn gets the folder-mode run", async () => {
    const { secret } = await startBridge({ workspace: ws(), fullAccess: true, accessDialog: dialogReturning("cancel") });
    const t = await codeTurn(secret);
    await until(() => rows("run").length === 1);
    await accessReq(secret, { mode: "folder" });
    await until(() => t.ended);
    const next = await codeTurn(secret, { prompt: "hello" });
    await next.done;
    const runs = rows("run");
    expect(runs).toHaveLength(2);
    expect(runs[0].argv).not.toContain("--restricted"); // started in computer mode: stays so to its end
    expect(runs[1].argv).toContain("--restricted"); // started after the switch: folder mode
    expect(next.events.find((e) => e[0] === "message")[1].access).toBeUndefined();
  });

  it("a turn that is already running when ON is answered cannot exist (409): the snapshot of a new turn is the answered mode", async () => {
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialogReturning("allow") });
    const before = await codeTurn(secret, { prompt: "hello" });
    await before.done;
    await accessReq(secret, { mode: "computer" });
    const after = await codeTurn(secret, { prompt: "hello" });
    await after.done;
    const runs = rows("run");
    expect(runs[0].argv).toContain("--restricted");
    expect(runs[1].argv).not.toContain("--restricted");
    expect(before.events.find((e) => e[0] === "message")[1].access).toBeUndefined();
    expect(after.events.find((e) => e[0] === "message")[1].access).toBe("computer");
  });
});

describe("access.json is read strictly", () => {
  const uid = process.getuid?.();
  const put = (text, mode = 0o600) => {
    prep();
    fs.rmSync(accessFile, { force: true });
    fs.writeFileSync(accessFile, text, { mode });
    fs.chmodSync(accessFile, mode);
  };
  const good = JSON.stringify({ version: 1, mode: "computer", at: "2026-11-19T10:00:00Z" });
  it("exactly version 1 and mode computer gives computer; nothing else does", () => {
    put(good);
    expect(B.readAccessFile(accessFile, process.platform, uid)).toEqual({ exists: true, mode: "computer" });
    for (const bad of ["", "not json", "[]", "null", "5", '{"version":1}', '{"version":2,"mode":"computer"}', '{"version":"1","mode":"computer"}', '{"version":1,"mode":"Computer"}', '{"version":1,"mode":"computer "}', '{"version":1,"mode":"full"}', '{"mode":"computer"}', '{"version":1,"mode":["computer"]}']) {
      put(bad);
      expect(B.readAccessFile(accessFile, process.platform, uid), bad).toEqual({ exists: true, mode: "folder" });
    }
  });
  it("a folder value, a missing file, and a file over 4 KB", () => {
    put(JSON.stringify({ version: 1, mode: "folder" }));
    expect(B.readAccessFile(accessFile, process.platform, uid)).toEqual({ exists: true, mode: "folder" });
    fs.rmSync(accessFile);
    expect(B.readAccessFile(accessFile, process.platform, uid)).toEqual({ exists: false, mode: "folder" });
    put(JSON.stringify({ version: 1, mode: "computer", pad: "x".repeat(5000) }));
    expect(B.readAccessFile(accessFile, process.platform, uid)).toEqual({ exists: true, mode: "folder" });
  });
  it("a link, a folder, and a bridge started on them", async () => {
    prep();
    const real = path.join(dir, "real.json");
    fs.writeFileSync(real, good, { mode: 0o600 });
    fs.rmSync(accessFile, { force: true });
    fs.symlinkSync(real, accessFile);
    expect(B.readAccessFile(accessFile, process.platform, uid)).toEqual({ exists: true, mode: "folder" });
    await startBridge({ workspace: ws(), fullAccess: true });
    expect(await hello()).toMatchObject({ access: "folder", accessSource: "file" }); // an existing (bad) file also beats --full-access
    fs.rmSync(accessFile);
    fs.mkdirSync(accessFile);
    expect(B.readAccessFile(accessFile, process.platform, uid)).toEqual({ exists: true, mode: "folder" });
  });
  it.skipIf(process.platform === "win32")("group or other writable, or another owner: folder (macOS, Linux)", () => {
    put(good, 0o666);
    expect(B.readAccessFile(accessFile, "darwin", uid)).toEqual({ exists: true, mode: "folder" });
    put(good, 0o620);
    expect(B.readAccessFile(accessFile, "linux", uid)).toEqual({ exists: true, mode: "folder" });
    put(good, 0o644); // readable by others is fine; only writable is a danger
    expect(B.readAccessFile(accessFile, "darwin", uid)).toEqual({ exists: true, mode: "computer" });
    put(good, 0o600);
    expect(B.readAccessFile(accessFile, "darwin", uid + 1)).toEqual({ exists: true, mode: "folder" });
  });
  it("Windows has no POSIX owner or mode to check: a plain file in a Windows-style state folder reads", () => {
    put(good, 0o666);
    expect(B.readAccessFile(accessFile, "win32", 0)).toEqual({ exists: true, mode: "computer" });
  });
});

describe("precedence: the file, --full-access, --access", () => {
  it("--full-access seeds the first value (source flag) and writes the file", async () => {
    await startBridge({ workspace: ws(), fullAccess: true });
    expect(await hello()).toMatchObject({ access: "computer", accessSource: "flag" });
    expect(saved()).toMatchObject({ version: 1, mode: "computer" });
  });
  it("the file wins once it exists: folder beats --full-access, computer needs no flag", async () => {
    prep();
    B.writeAccessFile(accessFile, "folder");
    await startBridge({ workspace: ws(), fullAccess: true });
    expect(await hello()).toMatchObject({ access: "folder", accessSource: "file" });
    await bridges.pop().close();
    B.writeAccessFile(accessFile, "computer");
    await startBridge({ workspace: ws() });
    expect(await hello()).toMatchObject({ access: "computer", accessSource: "file" });
  });
  it("neither: folder, source default", async () => {
    await startBridge({});
    expect(await hello()).toMatchObject({ access: "folder", accessSource: "default", accessChangeable: true });
  });
  it("--access folder always wins (even over a saved computer and --full-access); --access computer is refused and changes nothing", async () => {
    prep();
    B.writeAccessFile(accessFile, "computer");
    expect(B.applyAccessFlag(stateDir, "computer").ok).toBe(false);
    expect(B.applyAccessFlag(stateDir, "computer").message).toContain("--access computer is refused");
    expect(saved().mode).toBe("computer");
    expect(B.applyAccessFlag(stateDir, "everything").ok).toBe(false);
    expect(parseCli(["--access", "folder", "--full-access"])).toMatchObject({ access: "folder", fullAccess: true });
    expect(parseCli(["--access=computer"]).access).toBe("computer");
    expect(parseCli(["--install"]).access).toBeUndefined();
    expect(B.applyAccessFlag(stateDir, "folder")).toEqual({ ok: true, message: "" });
    expect(saved().mode).toBe("folder");
    await startBridge({ workspace: ws(), fullAccess: true });
    expect(await hello()).toMatchObject({ access: "folder", accessSource: "file" });
  });
  it("--uninstall forgets the saved mode and --unpair-all (no bridge running) sets folder", async () => {
    prep();
    B.writeAccessFile(accessFile, "computer");
    const cli = parseCli(["--uninstall", "--state-dir", stateDir]);
    const out = await B.serviceUninstall(cli, { platform: "darwin", home, uid: 501, launchctl: async () => ({ code: 0, out: "" }) });
    expect(out.ok).toBe(true);
    expect(B.readAccessFile(accessFile, process.platform)).toEqual({ exists: false, mode: "folder" });
    B.writeAccessFile(accessFile, "computer");
    const un = await B.unpairAll(parseCli(["--unpair-all", "--state-dir", stateDir]), { platform: "darwin", home });
    expect(un.ok).toBe(true);
    expect(saved().mode).toBe("folder");
  });
  it("--unpair-all on a running bridge also puts it back to folder", async () => {
    const token = crypto.randomBytes(8).toString("hex");
    const { secret } = await startBridge({ workspace: ws(), fullAccess: true, controlToken: token });
    const r = await fetch(`${base}/control/unpair-all`, { method: "POST", headers: { "x-bridge-control": token } });
    expect(r.status).toBe(200);
    expect((await hello()).access).toBe("folder");
    expect(saved().mode).toBe("folder");
    expect((await accessReq(secret, { mode: "folder" })).status).toBe(401); // the pairing is gone too
  });
  it("--install keeps the saved mode (does not carry --access); the notice names the way off", async () => {
    prep();
    const cli = parseCli(["--install", "--state-dir", stateDir, "--workspace", ws(), "--access", "folder", "--full-access"]);
    expect(B.accessFlagProblem("computer")).toContain("refused");
    const bad = await B.serviceInstall(parseCli(["--install", "--access", "computer"]), { platform: "darwin", home, uid: 501, nodePath: process.execPath, file: path.join(dir, "bridge.mjs"), launchctl: async () => ({ code: 0, out: "" }) });
    expect(bad.ok).toBe(false);
    expect(cli.access).toBe("folder");
    expect(B.FULL_ACCESS_NOTICE).toContain("access switch in GilbApp");
    expect(B.FULL_ACCESS_NOTICE).toContain("--access folder");
    expect(B.FULL_ACCESS_NOTICE).toContain("keeps the mode saved on this computer");
    expect(B.FULL_ACCESS_NOTICE_WINDOWS).toContain("--access folder");
  });
});

describe("hello", () => {
  it("reports access, accessChangeable and accessSource always, also without a code folder", async () => {
    await startBridge({});
    expect(await hello()).toMatchObject({ workspace: false, codeMode: null, access: "folder", accessChangeable: true, accessSource: "default" });
  });
  it("Windows folder mode is files-only, computer mode is full", async () => {
    const dialog = dialogReturning("allow");
    const { secret } = await startBridge({ workspace: ws(), codePlatform: "win32", accessDialog: dialog });
    expect(await hello()).toMatchObject({ codeMode: "files-only", access: "folder" });
    await accessReq(secret, { mode: "computer" });
    expect(await hello()).toMatchObject({ codeMode: "full", access: "computer" });
    expect((await hello()).options.approvals).toBeUndefined(); // no sandbox on Windows
  });
});

describe("survives a restart", () => {
  it("Allow, close, start again with no flag: still computer; lower, start with --full-access: folder", async () => {
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialogReturning("allow") });
    await accessReq(secret, { mode: "computer" });
    await bridges.pop().close();
    const second = await startBridge({ workspace: ws() });
    expect(await hello()).toMatchObject({ access: "computer", accessSource: "file" });
    await accessReq(second.secret, { mode: "folder" });
    await bridges.pop().close();
    await startBridge({ workspace: ws(), fullAccess: true });
    expect(await hello()).toMatchObject({ access: "folder", accessSource: "file" });
  });
});

describe("the dialog commands", () => {
  const MAC_EXPECT = [
    "Let the AI use this Mac like Claude Code in your Terminal?",
    "",
    "It can read most files on this Mac.",
    "It can run commands without asking you first.",
    "It can use the internet.",
    "It can change files only in your code folder, ~/Developer and temp.",
    "Locked, never read or changed: your keys (~/.ssh, ~/.base-deploy, ~/.aws), your logins (~/.config, ~/.npmrc, git and Docker logins, browser profiles) and the bridge's own files.",
    "sudo, security, launchctl, osascript and server ship commands still ask you first.",
    "",
    "Folder mode is safer. You can switch back in GilbApp at any time.",
  ].join("\n");
  const WIN_EXPECT = [
    "Let the AI use this PC like Claude Code in your terminal?",
    "",
    "It can read and change anything your Windows user can.",
    "It can run commands and use the internet and your logins.",
    "Windows has no safety box for this,",
    "so the AI asks you in the chat before every single action.",
    "",
    "Folder mode is safer: it can only edit files in your code folder.",
    "You can switch back in GilbApp at any time.",
  ].join("\n");
  const runner = (code, stdout = "", extra = {}) => {
    const calls = [];
    const fn = async (file, args, o) => { calls.push({ file, args, o }); return { code, stdout, stderr: "", killed: false, spawnError: false, ...extra }; };
    fn.calls = calls;
    return fn;
  };

  it("macOS: the approved text is passed as an argument, never inside the script; the title and buttons are constants", async () => {
    expect(B.ACCESS_DIALOG_TEXT.darwin).toBe(MAC_EXPECT);
    const run = runner(0, "button returned:Allow full access, gave up:false\n");
    expect(await B.systemAccessDialog("darwin", {}, run)).toBe("allow");
    const { file, args } = run.calls[0];
    expect(file).toBe("osascript");
    expect(args.slice(0, 2)).toEqual(["-e", "on run argv"]);
    expect(args.at(-2)).toBe(MAC_EXPECT);
    expect(args.at(-1)).toBe("GilbApp: full access for Claude Code");
    const script = args.slice(0, -2).join("\n");
    expect(script).toContain('buttons {"Cancel", "Allow full access"} default button "Cancel" cancel button "Cancel" with icon caution giving up after 120');
    expect(script).not.toContain("Mac");
    expect(script).not.toContain("GilbApp");
  });

  it("macOS: only the exact success line allows; gave up is a timeout, Cancel (-128) is a cancel", async () => {
    const out = (stdout, code = 0, stderr = "") => B.systemAccessDialog("darwin", {}, runner(code, stdout, { stderr }));
    expect(await out("button returned:Allow full access, gave up:false")).toBe("allow");
    expect(await out("button returned:Allow full access, gave up:false\n")).toBe("allow");
    expect(await out("button returned:Allow full access, gave up:true")).not.toBe("allow");
    expect(await out("button returned:Allow full access, gave up:true")).toBe("timeout");
    expect(await out("button returned:, gave up:true")).toBe("timeout");
    expect(await out("button returned:Cancel, gave up:false")).toBe("cancel");
    expect(await out("Allow")).not.toBe("allow");
    expect(await out("button returned:Allow full access, gave up:false extra")).not.toBe("allow");
    expect(await out("xbutton returned:Allow full access, gave up:false")).not.toBe("allow");
    expect(await out("button returned:Allow full access, gave up:false\nbutton returned:Allow full access, gave up:false")).not.toBe("allow");
    expect(await out("button returned:Allow full access, gave up:false", 1)).not.toBe("allow"); // an error exit never allows
    expect(await out("", 1, "execution error: User canceled. (-128)")).toBe("cancel");
    await expect(out("", 2, "boom")).rejects.toThrow();
    await expect(B.systemAccessDialog("darwin", {}, runner(null, "", { spawnError: true }))).rejects.toThrow();
    expect(await B.systemAccessDialog("darwin", {}, runner(null, "", { killed: true }))).toBe("timeout");
  });

  it("Windows: a form with Cancel as the default, a 120 s timer, the approved text; only the exact token allows", async () => {
    expect(B.ACCESS_DIALOG_TEXT.win32).toBe(WIN_EXPECT);
    const run = runner(0, B.ACCESS_WINDOWS_ALLOW_OUT);
    expect(await B.systemAccessDialog("win32", {}, run)).toBe("allow");
    const { file, args } = run.calls[0];
    expect(file).toBe("powershell.exe");
    expect(args.slice(0, 3)).toEqual(["-NoProfile", "-NonInteractive", "-Command"]);
    const script = args[3];
    expect(script).toContain("$f.TopMost = $true");
    expect(script).toContain("$f.AcceptButton = $c; $f.CancelButton = $c");
    expect(script).toContain("$t.Interval = 120000");
    expect(script).toContain("'Allow full access'");
    expect(script).toContain("'GilbApp: full access for Claude Code'");
    for (const line of WIN_EXPECT.split("\n").filter(Boolean)) expect(script).toContain(`'${line}'`);
    const out = (stdout, code = 0) => B.systemAccessDialog("win32", {}, runner(code, stdout));
    expect(await out("")).toBe("cancel");
    expect(await out("GILB-ACCESS-ALLOWED\n")).toBe("allow");
    expect(await out("GILB-ACCESS-ALLOWED!")).not.toBe("allow");
    expect(await out("xGILB-ACCESS-ALLOWED")).not.toBe("allow");
    expect(await out("Allow full access")).not.toBe("allow");
    await expect(out("GILB-ACCESS-ALLOWED", 1)).rejects.toThrow();
  });

  it("Linux: zenity --question with the labels, a 120 s timeout and no markup; exit 0 allows, 1 cancels, 5 is a timeout, a missing zenity rejects", async () => {
    const run = runner(0);
    expect(await B.systemAccessDialog("linux", {}, run)).toBe("allow");
    const { file, args } = run.calls[0];
    expect(file).toBe("zenity");
    expect(args).toEqual(expect.arrayContaining(["--question", "--no-markup", "--title=GilbApp: full access for Claude Code", "--ok-label=Allow full access", "--cancel-label=Cancel", "--timeout=120", "--width=520"]));
    expect(args.find((a) => a.startsWith("--text=")).slice(7)).toBe(B.ACCESS_DIALOG_TEXT.linux);
    expect(await B.systemAccessDialog("linux", {}, runner(1))).toBe("cancel");
    expect(await B.systemAccessDialog("linux", {}, runner(5))).toBe("timeout");
    await expect(B.systemAccessDialog("linux", {}, runner(null, "", { spawnError: true }))).rejects.toThrow();
    await expect(B.systemAccessDialog("linux", {}, runner(255))).rejects.toThrow();
  });
});
