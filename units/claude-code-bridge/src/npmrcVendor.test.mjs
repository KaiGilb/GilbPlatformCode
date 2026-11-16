// @vitest-environment node
// Written by Grok (grok-4.7), 2026-11-16. Folder-mode code turns tell Claude how to vendor one public GitHub folder in a plain command and never write .npmrc; files-only, computer and chat turns do not, and the sandbox settings stay the same.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge, GITHUB_ARCHIVE_SENTENCE, PLAIN_COMMANDS_SENTENCE, NPMRC_SENTENCE, PROJECT_NPMRC_TEXT } from "../bridge/bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";
const TRIPLE = `${GITHUB_ARCHIVE_SENTENCE} ${PLAIN_COMMANDS_SENTENCE} ${NPMRC_SENTENCE}`;
const PAIR = `${GITHUB_ARCHIVE_SENTENCE} ${NPMRC_SENTENCE}`;
const SENTENCES = [GITHUB_ARCHIVE_SENTENCE, PLAIN_COMMANDS_SENTENCE, NPMRC_SENTENCE];

let dir, bridge, base, logFile, secret;
async function start(access) {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "npmrc-vendor-")));
  logFile = path.join(dir, "claude.log");
  const ws = path.join(dir, "MyCode"); fs.mkdirSync(ws);
  bridge = createBridge({ port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "work"), home: dir,
    codeEnvExtraPrefixes: ["FAKE_"], codePlatform: access === "files-only" ? "win32" : "darwin", workspace: ws,
    ...(access === "computer" ? { fullAccess: true } : {}), log: () => {}, env: { ...process.env, FAKE_CLAUDE_LOG: logFile } });
  await bridge.start(); base = `http://127.0.0.1:${bridge.port}`;
  const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: bridge.pairingCode }) });
  secret = (await res.json()).secret;
}
afterEach(async () => { await bridge?.close(); bridge = undefined; if (dir) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
const runs = () => fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.event === "run");
const post = async (route, o) => { const r = await fetch(`${base}${route}`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify(o) }); return { status: r.status, text: await r.text() }; };
const sys = (argv) => { const i = argv.indexOf("--append-system-prompt"); return i < 0 ? "" : argv[i + 1]; };
const once = (s) => expect(s.split(TRIPLE).length - 1).toBe(1);
const none = (s) => { for (const sentence of SENTENCES) expect(s).not.toContain(sentence); };

describe("folder-mode vendor, plain commands and .npmrc sentences", () => {
  it("a folder-mode code turn with no project says them once, in order", async () => {
    await start("folder");
    const r = await post("/v1/turn", { system: "SYS", prompt: "hi", mode: "code" });
    expect(r.status).toBe(200);
    once(sys(runs()[0].argv));
  });

  it("a folder-mode code turn in a project says them once, in order", async () => {
    await start("folder");
    expect((await post("/v1/projects/create", { name: "proj" })).status).toBe(200);
    const r = await post("/v1/turn", { system: "SYS", prompt: "hi", mode: "code", project: "proj" });
    expect(r.status).toBe(200);
    once(sys(runs()[0].argv));
  });

  it("files-only mode names none of the three", async () => {
    await start("files-only");
    const r = await post("/v1/turn", { system: "SYS", prompt: "hi", mode: "code" });
    expect(r.status).toBe(200);
    none(sys(runs()[0].argv));
  });

  it("computer mode names none of the three", async () => {
    await start("computer");
    const r = await post("/v1/turn", { system: "SYS", prompt: "hi", mode: "code" });
    expect(r.status).toBe(200);
    none(sys(runs()[0].argv));
  });

  it("a chat turn's argv names none of the three", async () => {
    await start("folder");
    const r = await post("/v1/turn", { system: "SYS", prompt: "hi" });
    expect(r.status).toBe(200);
    none(JSON.stringify(runs()[0].argv));
  });

  it("the no-project folder-mode settings are the sandbox from before this change", async () => {
    await start("folder");
    const r = await post("/v1/turn", { system: "SYS", prompt: "hi", mode: "code" });
    expect(r.status).toBe(200);
    const argv = runs()[0].argv;
    const settings = JSON.parse(argv[argv.indexOf("--settings") + 1]);
    expect(settings.sandbox.network.allowedDomains).toEqual(["registry.npmjs.org", "registry.yarnpkg.com", "pypi.org", "files.pythonhosted.org", "codeload.github.com", "raw.githubusercontent.com"]);
    expect(settings.sandbox.filesystem.denyRead).toContain("~/.npmrc");
    expect(settings.permissions.disableBypassPermissionsMode).toBe("disable");
  });

  it("an each-write folder-mode code turn with no project says the archive and .npmrc sentences once, and not the plain-commands sentence", async () => {
    await start("folder");
    const r = await post("/v1/turn", { system: "SYS", prompt: "hi", mode: "code", approval: "each-write" });
    expect(r.status).toBe(200);
    const s = sys(runs()[0].argv);
    expect(s.split(PAIR).length - 1).toBe(1);
    expect(s).not.toContain(PLAIN_COMMANDS_SENTENCE);
  });

  it("an each-write folder-mode code turn in a project says the archive and .npmrc sentences once, and not the plain-commands sentence", async () => {
    await start("folder");
    expect((await post("/v1/projects/create", { name: "proj" })).status).toBe(200);
    const r = await post("/v1/turn", { system: "SYS", prompt: "hi", mode: "code", approval: "each-write", project: "proj" });
    expect(r.status).toBe(200);
    const s = sys(runs()[0].argv);
    expect(s.split(PAIR).length - 1).toBe(1);
    expect(s).not.toContain(PLAIN_COMMANDS_SENTENCE);
  });

  it("POST /v1/projects/create writes install-links=true, the project still lists, and a later code turn leaves the file unchanged", async () => {
    await start("folder");
    const r = await post("/v1/projects/create", { name: "p1" });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toEqual({ name: "p1", npmrc: true });
    const npmrcPath = path.join(dir, "MyCode", "p1", ".npmrc");
    const st = fs.lstatSync(npmrcPath);
    expect(st.isSymbolicLink()).toBe(false);
    expect(st.isFile()).toBe(true);
    expect(fs.readFileSync(npmrcPath, "utf8")).toBe(PROJECT_NPMRC_TEXT);
    if (process.platform !== "win32") expect(st.mode & 0o777).toBe(0o644);
    const list = await post("/v1/projects", {});
    expect(list.status).toBe(200);
    expect(JSON.parse(list.text).projects.map((p) => p.name)).toEqual(["p1"]);
    const before = fs.readFileSync(npmrcPath);
    const turn = await post("/v1/turn", { system: "SYS", prompt: "hi", mode: "code", project: "p1" });
    expect(turn.status).toBe(200);
    expect(fs.readFileSync(npmrcPath)).toEqual(before);
  });

  it("POST /v1/workspace/create does not write a .npmrc into the code folder", async () => {
    await start("folder");
    const r = await post("/v1/workspace/create", { name: "FreshCode" });
    expect(r.status).toBe(200);
    const folder = path.join(dir, "FreshCode");
    expect(fs.existsSync(folder)).toBe(true);
    expect(fs.existsSync(path.join(folder, ".npmrc"))).toBe(false);
  });

  it("the three sentences name the archive flags, install-links and plain commands, and name no host", () => {
    expect(GITHUB_ARCHIVE_SENTENCE).toContain("--strip-components=2");
    expect(GITHUB_ARCHIVE_SENTENCE).toContain("--strip-components");
    expect(GITHUB_ARCHIVE_SENTENCE).toContain("codeload.github.com");
    expect(NPMRC_SENTENCE).toContain("install-links=true");
    expect(NPMRC_SENTENCE).toContain("--install-links");
    expect(NPMRC_SENTENCE).toContain("ask the person");
    expect(PLAIN_COMMANDS_SENTENCE).toContain("rm -rf");
    expect(PLAIN_COMMANDS_SENTENCE).toContain("rm -r");
    expect(PLAIN_COMMANDS_SENTENCE).toContain("$VARIABLE");
    expect(PROJECT_NPMRC_TEXT).toBe("install-links=true\n");
    for (const sentence of [...SENTENCES, PROJECT_NPMRC_TEXT]) expect(sentence).not.toContain("gilb.com");
  });
});
