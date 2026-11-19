// @vitest-environment node
// The structural guarantee: under a test runner no bridge code can start a real window or a real file manager. The three leaves that run a GUI
// program (open folder, folder dialog, access dialog) call guiAllowed() first, which throws "GUI refused under test" when VITEST or NODE_ENV=test
// is set. Nothing here injects a dialog, a chooser, an opener or a runner for the routes: the guard itself must be what answers.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as B from "../bridge/bridge.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";
let dir, bridge;
afterEach(async () => {
  await bridge?.close().catch(() => {});
  bridge = undefined;
  if (dir) await removeTestDir(dir);
  dir = undefined;
});
async function start() {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-gui-")));
  const home = path.join(dir, "home");
  const stateDir = path.join(home, ".gilb-claude-code-bridge");
  const ws = path.join(home, "Work");
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(ws, { recursive: true });
  // NO accessDialog, accessRun, chooseFolder or openFolder: the real functions are what would run.
  bridge = B.createBridge({ port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "work"), home, stateDir, workspace: fs.realpathSync.native(ws), codePlatform: "darwin", platformOpts: { platform: "darwin" } });
  await bridge.start();
  const base = `http://127.0.0.1:${bridge.port}`;
  const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json", origin: APP }, body: JSON.stringify({ code: bridge.pairingCode }) });
  const secret = (await res.json()).secret;
  const post = async (route, body = {}) => {
    const r = await fetch(`${base}${route}`, { method: "POST", headers: { "content-type": "application/json", origin: APP, "x-bridge-secret": secret }, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  return { post };
}

describe("GUI guard", () => {
  it("the test runner sets the variable the guard reads", () => {
    expect(Boolean(process.env.VITEST || process.env.NODE_ENV === "test")).toBe(true);
    expect(() => B.guiAllowed("x")).toThrow("GUI refused under test: x");
  });
  it("a child process the tests start inherits it (they spread process.env), so a runner or a spawned bridge is guarded too", () => {
    const out = spawnSync(process.execPath, ["-e", "process.stdout.write(String(Boolean(process.env.VITEST || process.env.NODE_ENV === 'test')))"], { env: { ...process.env } });
    expect(out.stdout.toString()).toBe("true");
    for (const f of ["qaas2.attack.test.mjs"]) expect(fs.readFileSync(path.join(HERE, f), "utf8")).toMatch(/env: \{ \.\.\.process\.env, \.\.\.extraEnv \}/);
    expect(fs.readFileSync(path.join(HERE, "qaas2.runner.mjs"), "utf8")).toContain("...process.env");
  });
  it("POST /v1/workspace/choose with the real dialog function: refused, no window", async () => {
    const { post } = await start();
    const r = await post("/v1/workspace/choose");
    expect(r.status).toBe(500);
    expect(r.json.error).toContain("GUI refused under test");
  });
  it("POST /v1/workspace/open with the real opener: the route's own 500, no file manager", async () => {
    const { post } = await start();
    const r = await post("/v1/workspace/open");
    expect(r).toEqual({ status: 500, json: { error: "The folder could not be opened." } });
  });
  it("POST /v1/access computer with the real dialog runner: a refusal (501), no window, nothing changed", async () => {
    const { post } = await start();
    const r = await post("/v1/access", { mode: "computer" });
    expect(r.status).toBe(501);
    expect(r.json.code).toBe("AccessDialogUnavailable");
    const hello = await (await fetch(`http://127.0.0.1:${bridge.port}/v1/hello`, { headers: { origin: APP } })).json();
    expect(hello.access === "folder" || hello.access === null).toBe(true);
  });
  it("systemAccessDialog with no runner of its own rejects (the real runner is reached, and refuses)", async () => {
    await expect(B.systemAccessDialog("darwin", {})).rejects.toThrow("GUI refused under test");
  });
  it("systemAccessDialog with a runner spy: the spy gets the command and nothing else runs", async () => {
    const calls = [];
    const r = await B.systemAccessDialog("darwin", {}, async (file, args) => { calls.push(file); return { code: 1, stdout: "", stderr: "User canceled (-128)", killed: false, spawnError: false }; }, { origin: APP });
    expect(r).toBe("cancel");
    expect(calls).toEqual(["/usr/bin/osascript"]);
  });
  it("static: in bridge.mjs each of the three execFile leaves has guiAllowed as its first statement", () => {
    const src = fs.readFileSync(path.join(HERE, "../bridge/bridge.mjs"), "utf8");
    const leaf = (header, guard) => {
      const i = src.indexOf(header);
      expect(i, header).toBeGreaterThan(-1);
      const body = src.slice(i + header.length, i + header.length + 400);
      const g = body.indexOf(guard);
      const x = body.indexOf("execFile(");
      expect(g, `${header}: guard present`).toBeGreaterThan(-1);
      expect(x, `${header}: execFile present`).toBeGreaterThan(-1);
      expect(g, `${header}: guard before execFile`).toBeLessThan(x);
      expect(body.slice(0, g).replace(/\s/g, ""), `${header}: guard is the first statement`).toMatch(/^\{?$/);
    };
    leaf("function systemOpenFolder(platform, abs) {", 'guiAllowed("open folder")');
    leaf("const realAccessRun = (file, args, o) => {", 'guiAllowed("access dialog")');
    const fd = src.indexOf("function systemFolderDialog(");
    const seg = src.slice(fd, fd + 900);
    expect(seg.indexOf('guiAllowed("folder dialog")')).toBeGreaterThan(-1);
    expect(seg.indexOf('guiAllowed("folder dialog")')).toBeLessThan(seg.indexOf("execFile("));
    expect((src.match(/\bexecFile\(/g) ?? []).length).toBeGreaterThan(0);
  });
});
