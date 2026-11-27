// @vitest-environment node
// Bridge 0.3.18: POST /v1/workspace/open opens the code folder (or one project) in Finder / Explorer. The opener is always injected here:
// no real window ever opens.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge, openFolderCommand } from "../bridge/bridge.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";

let dir, home, base, bridge, opened, logFile;
const bridges = [];

function prep() {
  if (dir) return;
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-open-")));
  home = path.join(dir, "home");
  fs.mkdirSync(path.join(home, ".gilb-claude-code-bridge"), { recursive: true });
  logFile = path.join(dir, "claude.log");
}
async function start(opts = {}) {
  prep();
  opened = [];
  bridge = createBridge({
    port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "work"), home,
    workspaceFile: path.join(home, ".gilb-claude-code-bridge", "workspace.json"),
    codeEnvExtraPrefixes: ["FAKE_"], codePlatform: "darwin",
    env: { ...process.env, FAKE_CLAUDE_LOG: logFile },
    openFolder: async (abs) => { opened.push(abs); },
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
  if (dir) await removeTestDir(dir);
  dir = undefined;
});
const mkWs = () => { prep(); const p = path.join(home, "Work"); fs.mkdirSync(p, { recursive: true }); return fs.realpathSync.native(p); };
const open = async (secret, body = {}, headers = {}) => {
  const res = await fetch(`${base}/v1/workspace/open`, { method: "POST", headers: { "content-type": "application/json", ...(secret ? { "x-bridge-secret": secret } : {}), ...headers }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const hello = async () => (await fetch(`${base}/v1/hello`)).json();

describe("POST /v1/workspace/open", () => {
  it("unpaired is 401 and a wrong origin is 403; nothing opens", async () => {
    const ws = mkWs();
    const secret = await start({ workspace: ws });
    expect((await open(null)).status).toBe(401);
    expect((await open(secret, {}, { origin: "https://evil.example" })).status).toBe(403);
    expect(opened).toEqual([]);
  });

  it("no project opens the code folder", async () => {
    const ws = mkWs();
    const secret = await start({ workspace: ws });
    expect(await open(secret)).toEqual({ status: 200, json: { opened: true } });
    expect(opened).toEqual([path.resolve(ws)]);
  });

  it("an existing subfolder opens <workspace>/<name>", async () => {
    const ws = mkWs();
    fs.mkdirSync(path.join(ws, "app1"));
    const secret = await start({ workspace: ws });
    expect(await open(secret, { project: "app1" })).toEqual({ status: 200, json: { opened: true } });
    expect(opened).toEqual([path.join(ws, "app1")]);
  });

  it("refuses .. , a/b, a\\b, a hidden name, a missing folder and a plain file", async () => {
    const ws = mkWs();
    fs.mkdirSync(path.join(ws, "a"));
    fs.mkdirSync(path.join(ws, "a", "b"));
    fs.mkdirSync(path.join(ws, ".hidden"));
    fs.writeFileSync(path.join(ws, "afile"), "x");
    const secret = await start({ workspace: ws });
    for (const project of ["..", "a/b", "a\\b", ".hidden", "../Work", "", 5, "bad\u0007name"]) {
      const r = await open(secret, { project });
      expect(r.status, JSON.stringify(project)).toBe(400);
      expect(typeof r.json.error).toBe("string");
    }
    expect((await open(secret, { project: "missing" })).status).toBe(404);
    expect((await open(secret, { project: "afile" })).status).toBe(404);
    expect(opened).toEqual([]);
  });

  // Creating a symlink on Windows needs admin or developer mode, so this one is skipped there.
  it.skipIf(process.platform === "win32")("refuses a subfolder that is a link to a place outside the code folder", async () => {
    const ws = mkWs();
    const outside = path.join(dir, "outside");
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(ws, "escape"), "dir");
    fs.mkdirSync(path.join(ws, "real"));
    fs.symlinkSync(path.join(ws, "real"), path.join(ws, "inner"), "dir");
    const secret = await start({ workspace: ws });
    const r = await open(secret, { project: "escape" });
    expect(r.status).toBe(400);
    expect(opened).toEqual([]);
    // a link that stays inside the code folder is fine, and the real place is what opens
    expect((await open(secret, { project: "inner" })).status).toBe(200);
    expect(opened).toEqual([path.join(ws, "real")]);
  });

  it("404 with the no-folder sentence when there is no code folder", async () => {
    const secret = await start();
    const r = await open(secret);
    expect(r).toEqual({ status: 404, json: { error: "This bridge has no code folder. Start it with --workspace <folder>." } });
    expect(opened).toEqual([]);
  });

  it("an opener that fails gives 500 with the plain sentence", async () => {
    const ws = mkWs();
    const secret = await start({ workspace: ws, openFolder: async () => { throw new Error("secret detail /x/y"); } });
    expect(await open(secret)).toEqual({ status: 500, json: { error: "The folder could not be opened." } });
  });

  it("a folder swapped under the bridge is noticed: 404 and nothing opens", async () => {
    const ws = mkWs();
    const secret = await start({ workspace: ws });
    // Rename the old folder away and KEEP it, then make a new one: both exist, so the new folder cannot get the old inode (rm + mkdir can, on ext4 and tmpfs).
    fs.renameSync(ws, `${ws}-old`);
    fs.mkdirSync(ws);
    const r = await open(secret);
    expect(r.status).toBe(404);
    expect(opened).toEqual([]);
  });

  it("at most 10 opens a minute for each pairing, then 429", async () => {
    const ws = mkWs();
    let t = 1_000_000;
    const secret = await start({ workspace: ws, now: () => t });
    for (let i = 0; i < 10; i++) expect((await open(secret)).status).toBe(200);
    const r = await open(secret);
    expect(r.status).toBe(429);
    expect(typeof r.json.error).toBe("string");
    expect(opened.length).toBe(10);
    t += 61_000;
    expect((await open(secret)).status).toBe(200);
  });

  it("works while a code turn runs", async () => {
    const ws = mkWs();
    const secret = await start({ workspace: ws });
    const running = fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify({ system: "s", prompt: "WAITFOREVER", mode: "code" }) }).then((r) => r.text()).catch(() => {});
    const __t0 = Date.now(); // Batch F diagnostic: removed before merge
    for (let i = 0; i < 100 && !(fs.existsSync(logFile) && fs.readFileSync(logFile, "utf8").includes('"run"')); i++) await new Promise((r) => setTimeout(r, 50));
    console.log(`Batch F diagnostic (removed before merge): openFolder wait for first run log: ${Date.now() - __t0} ms, ${Date.now() - __t0 >= 4900 ? "TIMED OUT" : "ok"}`);
    const __o = await open(secret);
    console.log(`Batch F diagnostic (removed before merge): openFolder open() answered at ${Date.now() - __t0} ms since the wait began`); // Batch F diagnostic: removed before merge
    expect(__o).toEqual({ status: 200, json: { opened: true } });
    expect(opened).toEqual([path.resolve(ws)]);
    bridge.server.closeAllConnections?.();
    await bridge.close();
    console.log(`Batch F diagnostic (removed before merge): openFolder bridge.close() done at ${Date.now() - __t0} ms since the wait began`); // Batch F diagnostic: removed before merge
    await running;
    console.log(`Batch F diagnostic (removed before merge): openFolder running settled at ${Date.now() - __t0} ms since the wait began`); // Batch F diagnostic: removed before merge
  });
});

describe("hello openFolder", () => {
  it("is true when the opener is available", async () => {
    await start();
    expect((await hello()).openFolder).toBe(true);
  });
  it("is absent on Linux without xdg-open", async () => {
    await start({ openFolder: undefined, platformOpts: { platform: "linux" }, which: () => false });
    expect("openFolder" in (await hello())).toBe(false);
  });
  it("is true on Linux with xdg-open", async () => {
    await start({ openFolder: undefined, platformOpts: { platform: "linux" }, which: (c) => c === "xdg-open" });
    expect((await hello()).openFolder).toBe(true);
  });
});

describe("the default opener command", () => {
  it("macOS reveals with open -R (never open <dir> or -a Finder, which launch a .app folder); the path is one argv element", () => {
    expect(openFolderCommand("darwin", "/Users/x/Work/Tool.app")).toEqual({ file: "open", args: ["-R", "/Users/x/Work/Tool.app"] });
  });
  it("Windows and Linux pass the folder as the only argument", () => {
    expect(openFolderCommand("win32", "C:\\Users\\x\\Work")).toEqual({ file: "explorer.exe", args: ["C:\\Users\\x\\Work"] });
    expect(openFolderCommand("linux", "/home/x/Work")).toEqual({ file: "xdg-open", args: ["/home/x/Work"] });
  });
});
