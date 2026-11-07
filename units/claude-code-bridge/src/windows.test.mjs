// @vitest-environment node
// Windows support, tested on every platform with a pretend Windows (an in-memory file list and a recorded taskkill).
// The same file runs on GitHub's windows-latest runner, where the last block uses the real thing.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkSubscriptionLogin, claudeMissing, commandPathForPerson, fetchCode, insideFolder, killChild, normalizeOrigin, parseCmdShim, parseCli, refusedLaunch, resolveBin, resolveClaudeLaunch,
} from "../bridge/bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// What npm's cmd-shim 8.0.0 wrote for a package whose bin file starts with `#!/usr/bin/env node`, and for a bin that is a
// program (no shebang). Generated with cmd-shim itself; CRLF line ends, as it writes them.
const NODE_SHIM = [
  "@ECHO off", "GOTO start", ":find_dp0", "SET dp0=%~dp0", "EXIT /b", ":start", "SETLOCAL", "CALL :find_dp0", "",
  'IF EXIST "%dp0%\\node.exe" (', '  SET "_prog=%dp0%\\node.exe"', ") ELSE (", '  SET "_prog=node"', "  SET PATHEXT=%PATHEXT:;.JS;=;%", ")", "",
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*', "",
].join("\r\n");
const EXE_SHIM = [
  "@ECHO off", "GOTO start", ":find_dp0", "SET dp0=%~dp0", "EXIT /b", ":start", "SETLOCAL", "CALL :find_dp0",
  '"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*', "",
].join("\r\n");

/** A pretend Windows disk: path (any case) -> text. */
const disk = (entries) => {
  const m = new Map(Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v]));
  return { exists: (p) => m.has(p.toLowerCase()), read: (p) => { if (!m.has(p.toLowerCase())) throw new Error("ENOENT"); return m.get(p.toLowerCase()); } };
};
const HOME = "C:\\Users\\Kai";
const win = (files, extra = {}) => ({ platform: "win32", home: HOME, nodePath: "C:\\Program Files\\nodejs\\node.exe", files: disk(files), ...extra });

describe("resolveBin on Windows", () => {
  it("finds claude.exe in the folder Anthropic's installer uses, with no PATH at all", () => {
    const f = disk({ [`${HOME}\\.local\\bin\\claude.exe`]: "" });
    expect(resolveBin("claude", {}, HOME, "win32", f)).toBe(`${HOME}\\.local\\bin\\claude.exe`);
  });
  it("finds the npm claude.cmd in %APPDATA%\\npm, and never the extensionless script or the .ps1", () => {
    const f = disk({ [`${HOME}\\AppData\\Roaming\\npm\\claude`]: "#!/bin/sh", [`${HOME}\\AppData\\Roaming\\npm\\claude.ps1`]: "", [`${HOME}\\AppData\\Roaming\\npm\\claude.cmd`]: NODE_SHIM });
    expect(resolveBin("claude", { APPDATA: `${HOME}\\AppData\\Roaming` }, HOME, "win32", f)).toBe(`${HOME}\\AppData\\Roaming\\npm\\claude.cmd`);
    expect(resolveBin("claude", {}, HOME, "win32", f)).toBe(`${HOME}\\AppData\\Roaming\\npm\\claude.cmd`); // APPDATA unset: the usual place
  });
  it("splits PATH on ';', reads the variable under any case, strips quotes, and tries PATHEXT in its order", () => {
    const f = disk({ "D:\\tools\\claude.cmd": NODE_SHIM, "D:\\tools\\claude.EXE": "", "C:\\Program Files\\x\\other.bat": "" });
    expect(resolveBin("claude", { Path: 'C:\\nope;D:\\tools', PATHEXT: ".COM;.EXE;.BAT;.CMD" }, HOME, "win32", f)).toBe("D:\\tools\\claude.exe");
    expect(resolveBin("claude", { Path: "D:\\tools", pathext: ".CMD;.EXE" }, HOME, "win32", f)).toBe("D:\\tools\\claude.cmd");
    expect(resolveBin("other", { PATH: '"C:\\Program Files\\x"' }, HOME, "win32", f)).toBe("C:\\Program Files\\x\\other.bat");
  });
  it("ignores PATHEXT entries Node cannot start, and uses a default list when PATHEXT is missing", () => {
    const f = disk({ "D:\\t\\claude.vbs": "", "D:\\t\\claude.cmd": NODE_SHIM });
    expect(resolveBin("claude", { PATH: "D:\\t", PATHEXT: ".VBS;.JS" }, HOME, "win32", f)).toBe("D:\\t\\claude.cmd");
    expect(resolveBin("claude", { PATH: "D:\\t" }, HOME, "win32", f)).toBe("D:\\t\\claude.cmd");
  });
  it("a name that already has an extension is looked up as it is; an explicit path is kept, with an extension added if it lacks one", () => {
    const f = disk({ "D:\\t\\claude.exe": "", "E:\\x\\claude.cmd": NODE_SHIM });
    expect(resolveBin("claude.exe", { PATH: "D:\\t" }, HOME, "win32", f)).toBe("D:\\t\\claude.exe");
    expect(resolveBin("E:\\x\\claude", {}, HOME, "win32", f)).toBe("E:\\x\\claude.cmd");
    expect(resolveBin("E:\\x\\missing.exe", {}, HOME, "win32", f)).toBe("E:\\x\\missing.exe");
  });
  it("a missing name is null", () => {
    expect(resolveBin("claude", { PATH: "D:\\t" }, HOME, "win32", disk({}))).toBeNull();
  });
  it("is unchanged off Windows: ':' PATH, no extensions, the same folders", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rb-"));
    const f = path.join(dir, "thing");
    fs.writeFileSync(f, "#!/bin/sh\n", { mode: 0o755 });
    const nox = path.join(dir, "plain");
    fs.writeFileSync(nox, "x", { mode: 0o644 });
    if (process.platform !== "win32") {
      expect(resolveBin("thing", { PATH: `/nonexistent:${dir}` }, dir, "linux")).toBe(f);
      expect(resolveBin("plain", { PATH: dir }, dir, "darwin")).toBeNull(); // not executable
      expect(resolveBin("./a/b")).toBe(path.resolve("./a/b"));
      expect(resolveBin("thing", { PATH: "D:\\x;" + dir }, dir, "darwin")).toBeNull(); // ';' is not a separator here
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("the npm .cmd shim", () => {
  it("is read for the script it runs", () => {
    expect(parseCmdShim(NODE_SHIM)).toEqual({ kind: "node", target: "node_modules\\@anthropic-ai\\claude-code\\cli.js" });
  });
  it("is read for the program it runs", () => {
    expect(parseCmdShim(EXE_SHIM)).toEqual({ kind: "exe", target: "node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe" });
  });
  it("is refused when it is anything else: extra arguments, another program, another script type, %variables%, no shim at all", () => {
    expect(parseCmdShim(NODE_SHIM.replace('"%_prog%"  "', '"%_prog%" --flag "'))).toBeNull();
    expect(parseCmdShim(NODE_SHIM.replace('SET "_prog=node"', 'SET "_prog=python"'))).toBeNull();
    expect(parseCmdShim(NODE_SHIM.replace("cli.js", "cli.py"))).toBeNull();
    expect(parseCmdShim(EXE_SHIM.replace("claude.exe", "claude.ps1"))).toBeNull();
    expect(parseCmdShim(EXE_SHIM.replace("bin\\claude.exe", "%TEMP%\\evil.exe"))).toBeNull();
    expect(parseCmdShim('@echo off\r\ncalc.exe & "%dp0%\\x.exe" %*')).toBeNull();
    expect(parseCmdShim("@echo off\r\nECHO hi\r\n")).toBeNull();
  });
});

describe("how claude is started on Windows", () => {
  const NPM = `${HOME}\\AppData\\Roaming\\npm`;
  const PKG = `${NPM}\\node_modules\\@anthropic-ai\\claude-code`;
  it("a .exe is started directly", () => {
    const r = resolveClaudeLaunch("claude", {}, win({ [`${HOME}\\.local\\bin\\claude.exe`]: "" }));
    expect(r).toEqual({ ok: true, command: `${HOME}\\.local\\bin\\claude.exe`, prefix: [], shown: `${HOME}\\.local\\bin\\claude.exe` });
  });
  it("an npm .cmd that runs a script is started as node + that script, never as the .cmd", () => {
    const r = resolveClaudeLaunch("claude", { PATH: NPM }, win({ [`${NPM}\\claude.cmd`]: NODE_SHIM, [`${PKG}\\cli.js`]: "x" }));
    expect(r).toEqual({ ok: true, command: "C:\\Program Files\\nodejs\\node.exe", prefix: [`${PKG}\\cli.js`], shown: `${PKG}\\cli.js` });
  });
  it("an npm .cmd that runs a program is started as that program", () => {
    const r = resolveClaudeLaunch("claude", { PATH: NPM }, win({ [`${NPM}\\claude.cmd`]: EXE_SHIM, [`${PKG}\\bin\\claude.exe`]: "x" }));
    expect(r).toEqual({ ok: true, command: `${PKG}\\bin\\claude.exe`, prefix: [], shown: `${PKG}\\bin\\claude.exe` });
  });
  it("a .js file given with --claude is started with node", () => {
    const r = resolveClaudeLaunch("D:\\x\\fake.mjs", {}, win({ "D:\\x\\fake.mjs": "" }));
    expect(r).toMatchObject({ ok: true, command: "C:\\Program Files\\nodejs\\node.exe", prefix: ["D:\\x\\fake.mjs"] });
  });
  it("a .cmd it cannot read safely is refused with the plain message, and nothing is started", () => {
    const expected = (p) => `Claude Code was found as ${p}, which the bridge cannot start safely. Install Claude Code with Anthropic's Windows installer, then start the bridge again.`;
    expect(refusedLaunch("X")).toBe(expected("X"));
    const odd = resolveClaudeLaunch("claude", { PATH: NPM }, win({ [`${NPM}\\claude.cmd`]: "@echo off\r\ncalc.exe\r\n" }));
    expect(odd).toEqual({ ok: false, reason: expected(`${NPM}\\claude.cmd`) });
    const gone = resolveClaudeLaunch("claude", { PATH: NPM }, win({ [`${NPM}\\claude.cmd`]: NODE_SHIM })); // the script it names is not there
    expect(gone).toEqual({ ok: false, reason: expected(`${NPM}\\claude.cmd`) });
    const bat = resolveClaudeLaunch("D:\\x\\c.bat", {}, win({ "D:\\x\\c.bat": "@echo off\r\nstart evil\r\n" }));
    expect(bat.ok).toBe(false);
  });
  it("the login check reports the refusal and starts nothing", async () => {
    const calls = [];
    const r = await checkSubscriptionLogin("claude", { PATH: NPM }, win({ [`${NPM}\\claude.cmd`]: "@echo off\r\ncalc.exe\r\n" }, { execFile: (...a) => calls.push(a) }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/^Claude Code was found as .*claude\.cmd, which the bridge cannot start safely\./);
  });
  it("off Windows the name is passed through as it was", () => {
    expect(resolveClaudeLaunch("claude", {}, { platform: "darwin" })).toEqual({ ok: true, command: "claude", prefix: [], shown: "claude" });
    expect(resolveClaudeLaunch("/x/fake.mjs", {}, { platform: "linux" })).toMatchObject({ command: "/x/fake.mjs", prefix: [] });
  });
});

describe("stopping a child", () => {
  const fakeChild = (pid) => { const k = []; return { pid, kill: (s) => k.push(s ?? "default"), k }; };
  it("on Windows ends the whole tree with the system taskkill, by pid", async () => {
    const c = fakeChild(4242);
    const calls = [];
    await killChild(c, { SystemRoot: "C:\\Windows" }, { platform: "win32", execFile: (file, args, opts, cb) => { calls.push({ file, args, opts }); cb(null); } });
    expect(calls).toEqual([{ file: "C:\\Windows\\System32\\taskkill.exe", args: ["/PID", "4242", "/T", "/F"], opts: { windowsHide: true } }]);
    expect(c.k).toEqual([]);
  });
  it("on Windows falls back to kill() when taskkill cannot run", async () => {
    const c = fakeChild(7);
    await killChild(c, {}, { platform: "win32", execFile: (f, a, o, cb) => cb(new Error("ENOENT")) });
    expect(c.k).toEqual(["default"]);
    const d = fakeChild(8);
    await killChild(d, {}, { platform: "win32", execFile: () => { throw new Error("EINVAL"); } });
    expect(d.k).toEqual(["default"]);
  });
  it("off Windows sends SIGTERM and runs no taskkill", async () => {
    for (const platform of ["darwin", "linux"]) {
      const c = fakeChild(1);
      await killChild(c, {}, { platform, execFile: () => { throw new Error("must not run"); } });
      expect(c.k).toEqual(["SIGTERM"]);
    }
  });
  it("nothing to stop is fine", async () => {
    await killChild(null);
    await killChild(undefined);
  });
});

describe("what the person is told to type in PowerShell", () => {
  it("a file under the home folder is written with $HOME and double quotes", () => {
    expect(commandPathForPerson("C:\\Users\\Kai\\.gilb-claude-code-bridge.mjs", "C:\\Users\\Kai", "win32")).toBe('"$HOME\\.gilb-claude-code-bridge.mjs"');
    expect(commandPathForPerson("c:\\users\\kai\\sub dir\\b.mjs", "C:\\Users\\Kai", "win32")).toBe('"$HOME\\sub dir\\b.mjs"');
  });
  it("any other file is single-quoted, and a quote in it is doubled", () => {
    expect(commandPathForPerson("D:\\Kai's tools\\b.mjs", "C:\\Users\\Kai", "win32")).toBe("'D:\\Kai''s tools\\b.mjs'");
    expect(commandPathForPerson("C:\\Users\\Kai\\a$b\\b.mjs", "C:\\Users\\Kai", "win32")).toBe("'C:\\Users\\Kai\\a$b\\b.mjs'");
  });
  it("off Windows the path is printed as it is", () => {
    expect(commandPathForPerson("/Users/kai/.gilb-claude-code-bridge.mjs", "/Users/kai", "darwin")).toBe("/Users/kai/.gilb-claude-code-bridge.mjs");
  });
});

describe("the always-on commands on Windows", () => {
  const deps = { launchctl: async () => { throw new Error("must not run"); }, uid: 0, home: HOME, nodePath: "node", file: "f", env: {}, platform: "win32" };
  it("--code on Windows reads the same status and token files, and never tells the person to run --install or --status", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "code-"));
    const none = await fetchCode(parseCli(["--state-dir", dir]), { ...deps, home: dir });
    expect(none.ok).toBe(false);
    expect(none.message).toBe("No bridge has been started for this user yet (no control token). Run --install, or start the bridge in a PowerShell window.");
    fs.writeFileSync(path.join(dir, "control-token"), "tok");
    fs.writeFileSync(path.join(dir, "status.json"), JSON.stringify({ ok: true, port: 1 }));
    const down = await fetchCode(parseCli(["--state-dir", dir]), { ...deps, home: dir });
    expect(down.message).toBe("The bridge is not answering on port 1. Check that the bridge is still running in its PowerShell window.");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// On the real Windows runner only: the shim file the real cmd-shim wrote works with the real file system.
describe.skipIf(process.platform !== "win32")("on a real Windows disk", () => {
  it("an npm .cmd in a temp folder resolves to node + its script", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shim-"));
    const pkg = path.join(dir, "node_modules", "@anthropic-ai", "claude-code");
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(path.join(pkg, "cli.js"), "");
    fs.writeFileSync(path.join(dir, "claude.cmd"), NODE_SHIM);
    const r = resolveClaudeLaunch("claude", { PATH: dir, PATHEXT: ".COM;.EXE;.BAT;.CMD" });
    expect(r).toEqual({ ok: true, command: process.execPath, prefix: [path.join(pkg, "cli.js")], shown: path.join(pkg, "cli.js") });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("claude that is not installed on Windows is never looked up in the current folder (M3)", () => {
  const CWD = "C:\\Users\\Kai\\Downloads";
  it("nothing found: refused with the plain Windows message, never the bare name", () => {
    const r = resolveClaudeLaunch("claude", { PATH: "" }, win({}));
    expect(r).toEqual({ ok: false, reason: claudeMissing() });
    expect(claudeMissing()).toMatch(/Anthropic's Windows installer/);
    expect(claudeMissing()).not.toMatch(/brew|macOS|Terminal/);
  });
  it("a planted claude.exe / claude.cmd in the current folder, empty PATH, is not used", () => {
    for (const planted of ["claude.exe", "claude.cmd", "claude.bat", "claude.com"]) {
      const r = resolveClaudeLaunch("claude", { PATH: "" }, win({ [`${CWD}\\${planted}`]: "x", [`claude.exe`]: "x", [`.\\${planted}`]: "x" }));
      expect(r).toEqual({ ok: false, reason: claudeMissing() });
    }
  });
  it("a relative PATH entry (\".\", \"bin\") does not make the current folder a place to look", () => {
    const r = resolveClaudeLaunch("claude", { PATH: ".;bin;;" }, win({ "claude.exe": "x", "bin\\claude.exe": "x", ".\\claude.exe": "x" }));
    expect(r).toEqual({ ok: false, reason: claudeMissing() });
  });
  it("a --claude path that is not there is refused too (not passed on to be searched for)", () => {
    expect(resolveClaudeLaunch("D:\\nope\\claude.exe", {}, win({}))).toEqual({ ok: false, reason: claudeMissing() });
  });
  it("the login check reports it and starts nothing", async () => {
    const calls = [];
    const r = await checkSubscriptionLogin("claude", { PATH: "" }, win({ "claude.exe": "x" }, { execFile: (...a) => calls.push(a) }));
    expect(r).toEqual({ ok: false, reason: claudeMissing() });
    expect(calls).toEqual([]);
  });
});

describe("a .cmd shim's target must stay inside the shim's folder tree (4b)", () => {
  const NPM = `${HOME}\\AppData\\Roaming\\npm`;
  const shim = (target) => `@echo off\r\n"%dp0%\\${target}"   %*\r\n`;
  const nodeShim = (target) => ['@echo off', 'SET "_prog=node"', `"%_prog%"  "%dp0%\\${target}" %*`, ""].join("\r\n");
  it("inside: allowed, any letter case", () => {
    const r = resolveClaudeLaunch("claude", { PATH: NPM }, win({ [`${NPM}\\claude.cmd`]: shim("node_modules\\X\\claude.exe"), [`${NPM}\\NODE_MODULES\\x\\CLAUDE.EXE`]: "x" }));
    expect(r.ok).toBe(true);
  });
  it("outside through .., on another drive, or a UNC path: refused with the existing message", () => {
    const outside = [`${HOME}\\outside\\evil.exe`, "D:\\evil.exe", "\\\\host\\share\\evil.exe"];
    const cases = [
      [shim("..\\..\\..\\outside\\evil.exe"), outside[0]],
      [shim("..\\..\\..\\..\\outside\\evil.exe"), `C:\\Users\\outside\\evil.exe`],
      [shim("D:\\evil.exe"), outside[1]],
      [shim("\\\\host\\share\\evil.exe"), outside[2]],
      [shim("node_modules\\..\\..\\x.exe"), `${HOME}\\AppData\\Roaming\\x.exe`],
    ];
    for (const [text, target] of cases) {
      const r = resolveClaudeLaunch("claude", { PATH: NPM }, win({ [`${NPM}\\claude.cmd`]: text, [target]: "x" }));
      expect(r).toEqual({ ok: false, reason: refusedLaunch(`${NPM}\\claude.cmd`) });
    }
    const js = resolveClaudeLaunch("claude", { PATH: NPM }, win({ [`${NPM}\\claude.cmd`]: nodeShim("..\\..\\evil.js"), [`${HOME}\\AppData\\evil.js`]: "x" }));
    expect(js).toEqual({ ok: false, reason: refusedLaunch(`${NPM}\\claude.cmd`) });
  });
  it("insideFolder: a sibling folder with the same start is not inside", () => {
    const W = path.win32;
    expect(insideFolder(W, "C:\\a\\npm", "C:\\a\\npm-evil\\x.exe")).toBe(false);
    expect(insideFolder(W, "C:\\a\\npm", "C:\\a\\npm\\x.exe")).toBe(true);
    expect(insideFolder(W, "C:\\a\\npm", "C:\\A\\NPM\\sub\\x.exe")).toBe(true);
    expect(insideFolder(W, "C:\\a\\npm", "C:\\a\\npm")).toBe(false);
  });
});

describe("an origin with a quote mark is refused (4d)", () => {
  it("normalizeOrigin and --install both refuse it", () => {
    expect(() => normalizeOrigin('https://a"b.example.test')).toThrow(/quote/);
    expect(() => normalizeOrigin('https://app.example.test"')).toThrow(/quote/);
    expect(normalizeOrigin("https://app.example.test")).toBe("https://app.example.test");
  });
});
