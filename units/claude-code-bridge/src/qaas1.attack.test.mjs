// @vitest-environment node
// Hostile review QAAS1 of bridge 0.3.19 (the access switch), ported from the reviewer's 14 attack tests. They were written to PROVE each hole;
// here every one asserts the FIXED behavior (they fail on 0eb0c57 and pass after), plus a test for each fix. No real dialog is ever shown:
// the dialog is injected, or the program runner under it is (`accessRun`), or the command is only looked at.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 40000, hookTimeout: 30000 });
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, execFileSync } from "node:child_process";
import * as B from "../bridge/bridge.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const { createBridge, readAccessFile, parseCli, systemAccessDialog } = B;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";
const OTHER_APP = "https://other.example.test";

let dir, home, stateDir, accessFile, logFile, base, lastSecret;
const bridges = [];
const clock = { t: Date.parse("2026-11-19T10:00:00Z") };
const open = [];
const kids = [];

function prep() {
  if (dir) return;
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "qaas1-")));
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
    port: 0, claudeBin: FAKE, allowedOrigins: [APP, OTHER_APP], workDir: path.join(dir, "work"), home, stateDir,
    codeEnvExtraPrefixes: ["FAKE_"], codePlatform: "darwin", now: () => clock.t, killGraceMs: 400,
    env: { ...process.env, FAKE_CLAUDE_LOG: logFile },
    ...opts,
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
  for (const k of kids.splice(0)) { try { process.kill(k, "SIGKILL"); } catch { /* gone */ } }
  for (const b of bridges.splice(0)) await b.close().catch(() => {});
  try { fs.chmodSync(stateDir, 0o700); } catch { /* none */ }
  if (dir) await removeTestDir(dir);
  dir = undefined;
  clock.t = Date.parse("2026-11-19T10:00:00Z");
});
const accessReq = async (secret, body, headers = {}) => {
  const res = await fetch(`${base}/v1/access`, { method: "POST", headers: { "content-type": "application/json", origin: APP, ...(secret ? { "x-bridge-secret": secret } : {}), ...headers }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const helloFor = async (secret) => (await fetch(`${base}/v1/hello`, { headers: { origin: APP, ...(secret ? { "x-bridge-secret": secret } : {}) } })).json();
const rows = (event) => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.event === event) : []);
const until = async (fn, ms = 15000) => {
  for (let i = 0; i < ms / 25; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("timed out");
};
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function codeTurn(secret, extra = {}) {
  const ctl = new AbortController();
  const res = await fetch(`${base}/v1/turn`, { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", origin: APP, "x-bridge-secret": secret }, body: JSON.stringify({ system: "s", prompt: "WAITFOREVER", mode: "code", ...extra }) });
  const t = { status: res.status, turnId: "", ctl, json: null };
  open.push(t);
  if (res.status !== 200) { t.json = await res.json().catch(() => null); return t; }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  (async () => {
    let buf = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const m = /event: start\ndata: (.*)/.exec(buf);
        if (m) t.turnId = JSON.parse(m[1]).turnId;
      }
    } catch { /* hung up */ }
  })();
  await until(() => t.turnId);
  return t;
}
const plantOsascript = () => {
  prep();
  const evil = path.join(dir, "evilbin");
  fs.mkdirSync(evil, { recursive: true });
  fs.writeFileSync(path.join(evil, "osascript"), "#!/bin/sh\necho 'button returned:Allow full access, gave up:false'\n", { mode: 0o755 });
  return evil;
};
/** A stand-in for execFile that behaves like the real one about PATH (a bare name is looked up there) but NEVER runs a real system program: an absolute program is answered as "Cancel". */
const pathAwareRun = () => async (file, args, o) => {
  if (!path.isAbsolute(file)) {
    const hit = String(o.env.PATH ?? "").split(":").map((d) => path.join(d, file)).find((p) => fs.existsSync(p));
    if (hit && hit.startsWith(dir)) { // only a program planted in this test's own folder is ever run; a real system program is answered as Cancel, never started
      return new Promise((resolve) => execFile(hit, args, { env: o.env }, (err, stdout) => resolve({ code: err ? 1 : 0, stdout: String(stdout), stderr: "", killed: false, spawnError: false })));
    }
    return hit ? { code: 1, stdout: "", stderr: "execution error: User canceled. (-128)", killed: false, spawnError: false } : { code: null, stdout: "", stderr: "", killed: false, spawnError: true };
  }
  return { code: 1, stdout: "", stderr: "execution error: User canceled. (-128)", killed: false, spawnError: false };
};

describe("QAAS1 H1 (HIGH): the dialog program is run by absolute path with a minimal environment", () => {
  it("a fake osascript earlier on PATH can no longer answer: the program is /usr/bin/osascript and PATH is fixed", async () => {
    const evil = plantOsascript();
    const r = await systemAccessDialog("darwin", { PATH: `${evil}:/usr/bin:/bin`, HOME: home, DYLD_INSERT_LIBRARIES: "/tmp/x.dylib", NODE_OPTIONS: "--require /tmp/x.js" }, pathAwareRun(), { origin: APP });
    expect(r).toBe("cancel");
  });
  it("end to end: a bridge whose env PATH has the planted dir does not turn computer mode on", async () => {
    const evil = plantOsascript();
    const { secret } = await startBridge({ workspace: ws(), accessRun: pathAwareRun(), env: { ...process.env, PATH: `${evil}:${process.env.PATH}`, FAKE_CLAUDE_LOG: logFile } });
    const r = await accessReq(secret, { mode: "computer" });
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("AccessDenied");
    expect((await helloFor(secret)).access).toBe("folder");
  });
  it("every platform's program is absolute; the environment keeps only a short list and a fixed PATH", () => {
    expect(B.accessDialogCommand("darwin").file).toBe("/usr/bin/osascript");
    expect(B.accessDialogCommand("linux", {}, APP, "/usr/bin/zenity").file).toBe("/usr/bin/zenity");
    expect(B.accessDialogCommand("win32", { SystemRoot: "D:\\Win", PATH: "C:\\evil" }, APP).file).toBe("D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
    expect(B.folderDialogCommand("darwin", {}).file).toBe("/usr/bin/osascript");
    expect(B.folderDialogCommand("linux", {}, "/bin/zenity").file).toBe("/bin/zenity");
    expect(B.folderDialogCommand("linux", {}, null)).toBeNull();
    expect(B.folderDialogCommand("win32", { windir: "E:\\W" }).file).toBe("E:\\W\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
    const env = B.dialogEnv("darwin", { PATH: "/evil", HOME: "/h", DISPLAY: ":0", LD_PRELOAD: "x", DYLD_INSERT_LIBRARIES: "y", NODE_OPTIONS: "z", ANTHROPIC_API_KEY: "k" });
    expect(env).toEqual({ HOME: "/h", DISPLAY: ":0", PATH: "/usr/bin:/bin" });
    const w = B.dialogEnv("win32", { SystemRoot: "C:\\Windows", PATH: "C:\\evil", TEMP: "C:\\t", NODE_OPTIONS: "z" });
    expect(w.PATH).toBe("C:\\Windows\\System32;C:\\Windows");
    expect(w.NODE_OPTIONS).toBeUndefined();
  });
  it("zenity is looked up once in /usr/bin then /bin only; none means no dialog (501)", async () => {
    const seen = [];
    expect(B.resolveZenity((p) => { seen.push(p); return p === "/bin/zenity"; })).toBe("/bin/zenity");
    expect(seen).toEqual(["/usr/bin/zenity", "/bin/zenity"]);
    expect(B.resolveZenity(() => false)).toBeNull();
    const { secret } = await startBridge({ workspace: ws(), platformOpts: { platform: "linux" }, zenityPath: null });
    expect((await accessReq(secret, { mode: "computer" })).status).toBe(501);
  });
});

describe("QAAS1 H2 (HIGH): lowering to folder kills the whole process group", () => {
  it("a grandchild of the computer-mode claude is gone when POST folder answers (SIGTERM, then SIGKILL to the group)", async () => {
    const { secret } = await startBridge({ workspace: ws(), fullAccess: true });
    await codeTurn(secret, { prompt: "SPAWNCHILD WAITFOREVER" });
    const kid = (await until(() => rows("child")[0])).pid;
    kids.push(kid);
    expect(alive(kid)).toBe(true);
    const r = await accessReq(secret, { mode: "folder" });
    expect(r.json.cancelled).toBe(1);
    expect(alive(kid)).toBe(false); // already gone when the answer arrives
  });
  it("a claude that ignores SIGTERM is killed by SIGKILL after the grace, and the answer waits for it", async () => {
    const { secret } = await startBridge({ workspace: ws(), fullAccess: true });
    await codeTurn(secret, { prompt: "IGNORETERM WAITFOREVER" });
    const pid = (await until(() => rows("run").at(-1))).pid;
    kids.push(pid);
    const t0 = Date.now();
    await accessReq(secret, { mode: "folder" });
    expect(alive(pid)).toBe(false);
    expect(Date.now() - t0).toBeLessThan(2900); // SIGKILL came at the grace (400 ms here), not after the child's own 3 s
  });
  it("the existing Stop route kills the group too", async () => {
    const { secret } = await startBridge({ workspace: ws() });
    const t = await codeTurn(secret, { prompt: "SPAWNCHILD WAITFOREVER" });
    const kid = (await until(() => rows("child")[0])).pid;
    kids.push(kid);
    await fetch(`${base}/v1/turn/cancel`, { method: "POST", headers: { "content-type": "application/json", origin: APP, "x-bridge-secret": secret }, body: JSON.stringify({ turnId: t.turnId }) });
    await until(() => !alive(kid));
  });
});

describe("QAAS1 H3 (HIGH): ON is refused while any code child is still alive", () => {
  it("the page hangs up; the SIGTERM-ignoring claude lives on; ON is 409 and the dialog stays shut until it is gone", async () => {
    const dialog = vi.fn(async () => "cancel");
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialog });
    const t = await codeTurn(secret, { prompt: "IGNORETERM WAITFOREVER" });
    const pid = (await until(() => rows("run").at(-1))).pid;
    kids.push(pid);
    t.ctl.abort();
    await until(async () => (await fetch(`${base}/v1/turns`, { method: "POST", headers: { origin: APP, "x-bridge-secret": secret } }).then((r) => r.json())).turns.length === 0); // the table is empty
    expect(alive(pid)).toBe(true);
    const r = await accessReq(secret, { mode: "computer" });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("TurnRunning");
    expect(dialog).not.toHaveBeenCalled();
    await until(() => !alive(pid)); // SIGKILL after the grace
    await until(async () => (await accessReq(secret, { mode: "computer" })).status === 403);
    expect(dialog).toHaveBeenCalled();
  });
});

describe("QAAS1 H4 (MED): counters are global, escalate and survive a restart", () => {
  it("a restart keeps the cooldown", async () => {
    const dialog = vi.fn(async () => "cancel");
    let { secret, bridge } = await startBridge({ workspace: ws(), accessDialog: dialog });
    expect((await accessReq(secret, { mode: "computer" })).status).toBe(403);
    await bridge.close();
    bridges.pop();
    ({ secret } = await startBridge({ workspace: ws(), accessDialog: dialog }));
    const r = await accessReq(secret, { mode: "computer" });
    expect(r.status).toBe(429);
    expect(r.json.code).toBe("AccessCooldown");
    expect(dialog).toHaveBeenCalledTimes(1);
  });
  it("3 pairings x 5 do not give 15 windows: five in an hour in all", async () => {
    const dialog = vi.fn(async () => "cancel");
    const { bridge, secret: s1 } = await startBridge({ workspace: ws(), accessDialog: dialog });
    const secrets = [s1];
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json", origin: APP }, body: JSON.stringify({ code: bridge.pairingCode }) });
      secrets.push((await res.json()).secret);
    }
    fs.writeFileSync(path.join(stateDir, "access-limits.json"), JSON.stringify({ version: 1, stamps: [1, 2, 3, 4].map((m) => clock.t - m * 600_000), denials: 0, cooldownUntil: 0, lockedUntil: 0 }), { mode: 0o600 });
    expect((await accessReq(secrets[2], { mode: "computer" })).status).toBe(403); // the 5th
    clock.t += 31_000;
    for (const s of secrets) expect((await accessReq(s, { mode: "computer" })).json.code).toBe("AccessTooMany");
    expect(dialog).toHaveBeenCalledTimes(1);
  });
  it("a failed (501) dialog sets no cooldown and does not count", async () => {
    const dialog = vi.fn(async () => { throw new Error("x"); });
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialog });
    for (let i = 0; i < 8; i++) expect((await accessReq(secret, { mode: "computer" })).status).toBe(501);
  });
});

describe("QAAS1 MED-6: the window names the asking page", () => {
  it("the dialog is told the request's Origin, and a page not on the allowed list cannot ask", async () => {
    const dialog = vi.fn(async () => "cancel");
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialog });
    expect((await accessReq(secret, { mode: "computer" }, { origin: "https://evil.example" })).status).toBe(403); // not an allowed page
    expect(dialog).not.toHaveBeenCalled();
    // a pairing made without any Origin (a script, not a browser) has no page to name: refused
    const bare = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: bridges.at(-1).pairingCode }) });
    const bareSecret = (await bare.json()).secret;
    const noOrigin = await fetch(`${base}/v1/access`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": bareSecret }, body: JSON.stringify({ mode: "computer" }) });
    expect(noOrigin.status).toBe(403);
    expect((await noOrigin.json()).code).toBe("AccessOriginRequired");
    expect(dialog).not.toHaveBeenCalled();
    await accessReq(secret, { mode: "computer" });
    expect(dialog).toHaveBeenCalledWith(APP);
    clock.t += 700_000;
    const { bridge } = { bridge: bridges.at(-1) };
    const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json", origin: OTHER_APP }, body: JSON.stringify({ code: bridge.pairingCode }) });
    const second = (await res.json()).secret;
    await accessReq(second, { mode: "computer" }, { origin: OTHER_APP });
    expect(dialog).toHaveBeenLastCalledWith(OTHER_APP); // a second allowed page is named as itself
  });
  it("the text has ONE added line after the title line, on every platform, and the origin is only an argument", () => {
    for (const platform of ["darwin", "linux", "win32"]) {
      const base = B.ACCESS_DIALOG_TEXT[platform].split("\n");
      const withOrigin = B.accessDialogText(platform, APP).split("\n");
      expect(withOrigin).toHaveLength(base.length + 1);
      expect(withOrigin[0]).toBe(base[0]);
      expect(withOrigin[1]).toBe(`Asked by: ${APP} (local)`);
      expect(withOrigin.slice(2)).toEqual(base.slice(1));
    }
    expect(B.originFitForDialog(APP)).toBe(true);
    for (const bad of ["", 5, "javascript:alert(1)", "http://a\"b", "http://a b", "https://x.test/path", "https://x.test\nAllow", "http://x'; do shell script"]) expect(B.originFitForDialog(bad), String(bad)).toBe(false);
  });
});

describe("QAAS1 H5: access.json tamper", () => {
  const good = JSON.stringify({ version: 1, mode: "computer" });
  it("symlink, fifo, directory, group-writable, oversize, BOM, hardlink", () => {
    prep();
    const f = accessFile;
    const uid = process.getuid();
    fs.writeFileSync(f, good, { mode: 0o600 });
    expect(readAccessFile(f, "darwin", uid).mode).toBe("computer");
    fs.chmodSync(f, 0o664); expect(readAccessFile(f, "darwin", uid).mode).toBe("folder");
    fs.chmodSync(f, 0o602); expect(readAccessFile(f, "darwin", uid).mode).toBe("folder");
    fs.chmodSync(f, 0o600);
    fs.writeFileSync(f, "﻿" + good); expect(readAccessFile(f, "darwin", uid).mode).toBe("folder");
    fs.writeFileSync(f, good + " ".repeat(5000)); expect(readAccessFile(f, "darwin", uid).mode).toBe("folder");
    fs.rmSync(f); fs.mkdirSync(f); expect(readAccessFile(f, "darwin", uid).mode).toBe("folder"); fs.rmdirSync(f);
    execFileSync("mkfifo", [f]); expect(readAccessFile(f, "darwin", uid).mode).toBe("folder"); fs.rmSync(f);
    const real = path.join(dir, "real.json");
    fs.writeFileSync(real, good, { mode: 0o600 });
    fs.symlinkSync(real, f); expect(readAccessFile(f, "darwin", uid).mode).toBe("folder"); fs.rmSync(f);
    fs.linkSync(real, f);
    expect(readAccessFile(f, "darwin", uid)).toEqual({ exists: true, mode: "folder" }); // a second hard link
    fs.rmSync(real);
    expect(readAccessFile(f, "darwin", uid).mode).toBe("computer"); // the link count is back to 1
    expect(readAccessFile(f, "darwin", uid + 1).mode).toBe("folder");
  });
  it("Windows: the owner SID must be the current user", () => {
    prep();
    fs.writeFileSync(accessFile, good, { mode: 0o666 });
    expect(readAccessFile(accessFile, "win32", 0, () => true).mode).toBe("computer");
    expect(readAccessFile(accessFile, "win32", 0, () => false).mode).toBe("folder");
    expect(B.windowsOwnerIsMe(path.join(dir, "nothing-here"))).toBe(false); // the check failing (no PowerShell here) is a no
  });
});

describe("QAAS1 H6 (MED): lowering that cannot be saved", () => {
  it("both the write and the removal fail: 500, no code turn starts, hello says so; once saving works again it recovers", async () => {
    const { secret } = await startBridge({ workspace: ws(), fullAccess: true });
    expect(JSON.parse(fs.readFileSync(accessFile, "utf8")).mode).toBe("computer");
    fs.chmodSync(accessFile, 0o400); // not even an in-place rewrite
    fs.chmodSync(stateDir, 0o500);
    let r, turn, hello;
    try {
      r = await accessReq(secret, { mode: "folder" });
      turn = await codeTurn(secret, { prompt: "hello" });
      hello = await helloFor(secret);
    } finally { fs.chmodSync(stateDir, 0o700); fs.chmodSync(accessFile, 0o600); }
    expect(r.status).toBe(500);
    expect(r.json.code).toBe("AccessNotSaved");
    expect(hello).toMatchObject({ access: "folder", accessSaveFailed: true });
    expect(turn.status).toBe(409);
    expect(turn.json.code).toBe("AccessNotSaved");
    expect(rows("run")).toEqual([]);
    const again = await codeTurn(secret, { prompt: "hello" }); // saving works now: the turn path retries, and goes through
    expect(again.status).toBe(200);
    expect(JSON.parse(fs.readFileSync(accessFile, "utf8")).mode).toBe("folder");
    expect((await helloFor(secret)).accessSaveFailed).toBeUndefined();
  });
  it("the atomic write fails but an in-place rewrite works: 200 and the file says folder", async () => {
    const { secret, bridge } = await startBridge({ workspace: ws(), fullAccess: true });
    fs.mkdirSync(`${accessFile}.${process.pid}.tmp`); // the temp name is taken by a folder: the atomic write cannot happen
    const r = await accessReq(secret, { mode: "folder" });
    expect(r).toMatchObject({ status: 200, json: { access: "folder" } });
    expect(JSON.parse(fs.readFileSync(accessFile, "utf8")).mode).toBe("folder");
    await bridge.close();
    bridges.pop();
    fs.rmdirSync(`${accessFile}.${process.pid}.tmp`);
    await startBridge({ workspace: ws() });
    expect((await helloFor(lastSecret)).access).toBe("folder");
  });
});

describe("QAAS1 H7 / LOW-10: hello shows the access fields only to a paired caller", () => {
  it("unpaired keeps exactly what it had before 0.3.19; paired also gets accessChangeable and accessSource", async () => {
    const { secret } = await startBridge({ workspace: ws(), fullAccess: true });
    const open = await helloFor(null);
    expect(open.access).toBe("computer"); // as before 0.3.19: the mode when there is a code folder
    expect("accessChangeable" in open).toBe(false);
    expect("accessSource" in open).toBe(false);
    expect("accessSaveFailed" in open).toBe(false);
    expect(await helloFor(secret)).toMatchObject({ access: "computer", accessChangeable: true, accessSource: "flag" });
    await bridges.pop().close();
    fs.rmSync(accessFile);
    await startBridge({});
    expect((await helloFor(null)).access).toBeNull(); // no code folder, unpaired: null as before
    expect((await helloFor(lastSecret)).access).toBe("folder"); // paired: always reported
  });
});

describe("QAAS1 H8 / LOW-8: every --access value is checked", () => {
  it("a later computer or bogus value is refused even after a folder", () => {
    expect(parseCli(["--access=folder"]).access).toBe("folder");
    expect(parseCli(["--access", "computer"]).access).toBe("computer");
    expect(B.accessFlagProblem(parseCli(["--access", "folder", "--access", "computer"]).access)).toContain("refused");
    expect(B.accessFlagProblem(parseCli(["--access", "folder", "--access", "bogus"]).access)).not.toBe("");
    expect(B.accessFlagProblem(parseCli(["--access", "folder", "--access", "folder"]).access)).toBe("");
    for (const bad of ["COMPUTER", "folder ", ""]) expect(B.accessFlagProblem(bad)).not.toBe("");
  });
});

describe("QAAS1 H9 (MED): the service no longer carries --full-access", () => {
  const svc = () => ({
    launchctl: async () => ({ code: 0, out: "state = running\n\tpid = 1" }), uid: 501, home, nodePath: "/opt/node/bin/node", file: "/Users/p/.gilb-claude-code-bridge.mjs",
    env: { PATH: "/usr/bin" }, platform: "darwin", sleep: async () => {}, check: async () => ({ ok: true, info: { subscriptionType: "max" } }),
  });
  it("--install --full-access seeds access.json once and leaves the flag out of the LaunchAgent", async () => {
    prep();
    const cli = parseCli(["--install", "--claude", FAKE, "--workspace", ws(), "--full-access", "--state-dir", stateDir]);
    const out = await B.serviceInstall(cli, svc());
    expect(out.ok).toBe(true);
    const plist = fs.readFileSync(path.join(home, "Library", "LaunchAgents", "com.gilb.claude-code-bridge.plist"), "utf8");
    expect(plist).not.toContain("--full-access");
    expect(JSON.parse(fs.readFileSync(accessFile, "utf8"))).toMatchObject({ version: 1, mode: "computer" });
    expect(out.message).toContain("Full access");
  });
  it("an existing file is not overwritten by the flag; a missing file at start is folder (the plist has no flag to seed it)", async () => {
    prep();
    B.writeAccessFile(accessFile, "folder");
    await B.serviceInstall(parseCli(["--install", "--claude", FAKE, "--workspace", ws(), "--full-access", "--state-dir", stateDir]), svc());
    expect(JSON.parse(fs.readFileSync(accessFile, "utf8")).mode).toBe("folder");
    fs.rmSync(accessFile);
    await startBridge({ workspace: ws() }); // no flag (as the service starts it), no file
    expect((await helloFor(lastSecret))).toMatchObject({ access: "folder", accessSource: "file" }); // a setting was saved here before: a missing file is folder, never a seed
  });
  it("the supervisor and the Windows Run entry do not forward --full-access either (source)", () => {
    const src = fs.readFileSync(path.join(HERE, "../bridge/bridge.mjs"), "utf8");
    expect(src).not.toMatch(/push\("--full-access"\)/);
  });
});

describe("QAAS1 LOW-9: no update while the window is open", () => {
  it("POST /v1/update is 409 AccessDialogOpen while the access window is up", async () => {
    let answer;
    const dialog = vi.fn(() => new Promise((r) => { answer = r; }));
    const { secret } = await startBridge({ workspace: ws(), accessDialog: dialog });
    const pending = accessReq(secret, { mode: "computer" });
    await until(() => dialog.mock.calls.length === 1);
    const res = await fetch(`${base}/v1/update`, { method: "POST", headers: { "content-type": "application/json", origin: APP, "x-bridge-secret": secret }, body: "{}" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("AccessDialogOpen");
    answer("cancel");
    await pending;
  });
});

describe("QAAS1 MED-7: a custom --state-dir is protected and may not sit in the code folder or ~/Developer", () => {
  it("stateDirProblem refuses a state folder inside the code folder or ~/Developer, and accepts one outside", () => {
    prep();
    expect(B.stateDirProblem(path.join(home, "Work", "state"), path.join(home, "Work"), home)).toContain("inside the code folder");
    expect(B.stateDirProblem(path.join(home, "Developer", "x", "state"), path.join(home, "Work"), home)).toContain("~/Developer");
    expect(B.stateDirProblem(path.join(home, "Developer"), undefined, home)).toContain("~/Developer");
    expect(B.stateDirProblem(path.join(home, ".other-state"), path.join(home, "Work"), home)).toBe("");
    expect(B.stateDirProblem(path.join(home, "WorkShop"), path.join(home, "Work"), home)).toBe(""); // a sibling with the same prefix is not inside
  });
  it("--install refuses it too, and writes nothing", async () => {
    prep();
    const bad = path.join(ws(), "state");
    const out = await B.serviceInstall(parseCli(["--install", "--claude", FAKE, "--workspace", ws(), "--state-dir", bad]), {
      launchctl: async () => ({ code: 0, out: "" }), uid: 501, home, nodePath: "/opt/node/bin/node", file: "/Users/p/b.mjs", env: { PATH: "/usr/bin" }, platform: "darwin", sleep: async () => {}, check: async () => ({ ok: true, info: {} }),
    });
    expect(out.ok).toBe(false);
    expect(out.message).toContain("inside the code folder");
    expect(fs.existsSync(path.join(home, "Library", "LaunchAgents"))).toBe(false);
  });
  it("a folder-mode turn is told to read/edit nothing in the real state folder (custom name), and a computer-mode turn protects it", async () => {
    prep();
    const custom = path.join(dir, "elsewhere-state");
    fs.mkdirSync(custom, { mode: 0o700 });
    const real = fs.realpathSync.native(custom);
    const { secret } = await startBridge({ workspace: ws(), stateDir: custom });
    const t = await codeTurn(secret, { prompt: "hello" });
    await until(() => rows("run").length === 1);
    const settings = rows("run")[0].argv[rows("run")[0].argv.indexOf("--settings") + 1];
    const parsed = JSON.parse(settings);
    expect(parsed.sandbox.filesystem.denyRead).toContain(real);
    expect(parsed.permissions.deny).toEqual(expect.arrayContaining([`Read(/${real})`, `Edit(/${real}/**)`]));
    expect(t.status).toBe(200);
  });
});
