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
async function start(access, extra = {}) {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "npmrc-vendor-")));
  logFile = path.join(dir, "claude.log");
  const ws = path.join(dir, "MyCode"); fs.mkdirSync(ws);
  bridge = createBridge({ port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "work"), home: dir,
    codeEnvExtraPrefixes: ["FAKE_"], codePlatform: access === "files-only" ? "win32" : "darwin", workspace: ws,
    ...(access === "computer" ? { fullAccess: true } : {}), log: () => {}, env: { ...process.env, FAKE_CLAUDE_LOG: logFile }, ...extra });
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
    expect(NPMRC_SENTENCE).toContain("read this folder's .npmrc");
    expect(NPMRC_SENTENCE).toContain("tell the person to add it");
    expect(PLAIN_COMMANDS_SENTENCE).toContain("rm -rf");
    expect(PLAIN_COMMANDS_SENTENCE).toContain("rm -r");
    expect(PLAIN_COMMANDS_SENTENCE).toContain("$VARIABLE");
    expect(PROJECT_NPMRC_TEXT).toBe("install-links=true\n");
    for (const sentence of [...SENTENCES, PROJECT_NPMRC_TEXT]) expect(sentence).not.toContain("gilb.com");
  });

  it("a planted .npmrc file is left unchanged and the answer says it was not written", async () => {
    await start("folder", { beforeProjectNpmrc: (projectPath) => { fs.writeFileSync(path.join(projectPath, ".npmrc"), "ORIGINAL\n"); } });
    const r = await post("/v1/projects/create", { name: "kept" });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toEqual({ name: "kept", npmrc: false });
    expect(fs.readFileSync(path.join(dir, "MyCode", "kept", ".npmrc"), "utf8")).toBe("ORIGINAL\n");
  });

  it.skipIf(process.platform === "win32")("a planted .npmrc symlink is not followed and the outside file stays", async () => {
    await start("folder", { beforeProjectNpmrc: (projectPath) => {
      const outside = path.join(dir, "outside.txt");
      fs.writeFileSync(outside, "ORIGINAL\n");
      fs.symlinkSync(outside, path.join(projectPath, ".npmrc"));
    } });
    const r = await post("/v1/projects/create", { name: "linked" });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toEqual({ name: "linked", npmrc: false });
    const outside = path.join(dir, "outside.txt");
    expect(fs.readFileSync(outside, "utf8")).toBe("ORIGINAL\n");
    expect(fs.lstatSync(path.join(dir, "MyCode", "linked", ".npmrc")).isSymbolicLink()).toBe(true);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("a read-only project folder answers npmrc false and logs the refusal without the secret or the pairing code", async () => {
    const name = "readonly";
    const lines = [];
    const project = () => path.join(dir, "MyCode", name);
    await start("folder", {
      log: (line) => lines.push(line),
      beforeProjectNpmrc: (projectPath) => { fs.chmodSync(projectPath, 0o555); },
    });
    // Pairing logs the next code on purpose. These lines are what the create itself wrote.
    lines.length = 0;
    try {
      const r = await post("/v1/projects/create", { name });
      expect(r.status).toBe(200);
      expect(JSON.parse(r.text)).toEqual({ name, npmrc: false });
      expect(fs.existsSync(project())).toBe(true);
      expect(lines).toHaveLength(1);
      expect(lines[0].startsWith(`project ${name}: .npmrc not written: `)).toBe(true);
      expect(lines[0].endsWith("EACCES") || lines[0].endsWith("EPERM")).toBe(true);
      expect(lines.some((l) => l.includes(secret) || l.includes(bridge.pairingCode))).toBe(false);
    } finally {
      fs.chmodSync(project(), 0o755);
    }
  });

  it("the project .npmrc write stays exclusive, so a planted file or symlink cannot be overwritten", () => {
    const src = fs.readFileSync(path.join(HERE, "bridge.ts"), "utf8");
    const needle = 'PROJECT_NPMRC_TEXT, { flag: "wx", mode: 0o644 })';
    expect(src.split(needle).length - 1).toBe(1);
  });

  it("a session folder-mode turn's prompt contains the .npmrc sentence once, and the sentence says to read the line", async () => {
    await start("folder");
    const r = await post("/v1/turn", { system: "SYS", prompt: "hi", mode: "code" });
    expect(r.status).toBe(200);
    const s = sys(runs()[0].argv);
    expect(s.split(NPMRC_SENTENCE).length - 1).toBe(1);
    expect(NPMRC_SENTENCE).toContain("read this folder's .npmrc");
    expect(NPMRC_SENTENCE).toContain("tell the person to add it");
  });
});
