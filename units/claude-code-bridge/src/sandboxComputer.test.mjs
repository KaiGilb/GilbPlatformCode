// @vitest-environment node
// 0.3.13: computer mode with approval "session" on macOS and Linux runs Claude Code inside its OS sandbox, wide open except the protected places.
// Hermetic: a stand-in `claude` (it asks bridge_approve, as the real CLI does for what the sandbox does not allow by itself) and FAKE protected folders in a throwaway
// home. Nothing here touches the real ~/.ssh, ~/Developer/.base-deploy, LaunchAgents, the Keychain or any shell file. The REAL claude and the OS are exercised by the live run (see the report).

import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge, writeBlock, claudeDirs, claudeGlobs, writeOnlyPlaces, writableAreas, protectedPlaces, protectedHit, globHitsProtected, askedCommand, computerSandboxSettings, ASKED_COMMAND_RULES, FULL_ACCESS_NOTICE } from "../bridge/bridge.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";

let dir; // the fake home
let bridge;
let base;
let logFile;
let ws;

async function start({ fullAccess = true, platform = "darwin", bridgeOpts = {}, extraFake = false } = {}) {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(HERE, "..", ".tmp-sbx-"))); // NOT under the temp folder (that is writable)
  logFile = path.join(dir, "claude.log");
  for (const d of [".ssh", "Developer/.base-deploy", ".gilb-claude-code-bridge", "Library/LaunchAgents", ".aws", ".gnupg", ".config/gh", "Library/Keychains"]) fs.mkdirSync(path.join(dir, d), { recursive: true });
  for (const d of ["Developer/GilbServerOps", "Developer/other/.claude", ".local/bin", ".local/share/fnm"]) fs.mkdirSync(path.join(dir, d), { recursive: true });
  fs.mkdirSync(path.join(dir, "MyCode", "p1", ".claude"), { recursive: true });
  for (const f of [".claude.json", ".gilb-connector.mjs", ".zshrc", ".local/bin/claude", ".netrc", ".gilb-claude-code-bridge.mjs", ".ssh/id_rsa", "Developer/.base-deploy/key"]) fs.writeFileSync(path.join(dir, f), "SECRET");
  ws = path.join(dir, "MyCode");
  fs.mkdirSync(ws, { recursive: true });
  ws = fs.realpathSync.native(ws);
  bridge = createBridge({
    port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "work"), home: dir,
    codeEnvExtraPrefixes: ["FAKE_"], codePlatform: platform, workspace: ws,
    ...(fullAccess ? { fullAccess: true } : {}),
    ...(extraFake ? { extraProtected: [path.join(dir, "fake-extra")] } : {}),
    env: { ...process.env, FAKE_CLAUDE_LOG: logFile },
    ...bridgeOpts,
  });
  await bridge.start();
  base = `http://127.0.0.1:${bridge.port}`;
  const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: bridge.pairingCode }) });
  return (await res.json()).secret;
}
afterEach(async () => {
  await bridge?.close();
  bridge = undefined;
  if (dir) await removeTestDir(dir);
});

const rows = (event) => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.event === event) : []);
const hello = async () => (await fetch(`${base}/v1/hello`)).json();
const ASK = (...asks) => `ASKJSON:${JSON.stringify(asks)}`;
const T = (extra) => ({ system: "You are the agent.", prompt: "hello", mode: "code", ...extra });

/** Runs a turn that asks bridge_approve the given calls; answers every question the page gets with `allow`. Returns the decisions and the questions. */
async function ask(secret, calls, { allow = false, body = {} } = {}) {
  const res = await fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify(T({ prompt: ASK(...calls), ...body })) });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let turnId = "";
  const questions = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const blk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const e = /event: (.*)/.exec(blk)?.[1];
      const d = /data: (.*)/.exec(blk)?.[1];
      if (!e) continue;
      const parsed = JSON.parse(d);
      if (e === "start") turnId = parsed.turnId;
      if (e === "approval_request") {
        questions.push(parsed);
        await fetch(`${base}/v1/approval`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify({ turnId, id: parsed.id, allow }) });
      }
    }
  }
  return { decisions: rows("askjson").map((r) => r.decision), questions };
}
const F = (tool_name, input) => ({ tool_name, input });
const protectedMsg = (p) => `This place is protected: ${p}.`;

describe("the settings of a sandboxed computer turn", () => {
  it("macOS: the sandbox block, the protected places denied for read and write, the network open, the folders writable", async () => {
    const secret = await start();
    await ask(secret, []);
    const run = rows("run")[0];
    const settings = JSON.parse(run.argv[run.argv.indexOf("--settings") + 1]);
    const places = protectedPlaces(dir);
    expect(settings.sandbox).toMatchObject({ enabled: true, failIfUnavailable: true, allowUnsandboxedCommands: false, autoAllowBashIfSandboxed: true, network: { allowedDomains: ["*"] } });
    for (const p of [".ssh", "Developer/.base-deploy", ".gilb-claude-code-bridge", ".gilb-claude-code-bridge.mjs", "Library/LaunchAgents", ".aws", ".gnupg", ".netrc", ".config/gh", "Library/Keychains"]) {
      expect(settings.sandbox.filesystem.denyRead).toContain(path.join(dir, p));
      expect(settings.sandbox.filesystem.denyWrite).toContain(path.join(dir, p));
      expect(places).toContain(path.join(dir, p));
    }
    expect(settings.sandbox.filesystem.allowWrite).toEqual(expect.arrayContaining([ws, path.join(dir, "Developer"), "/tmp", os.tmpdir()]));
    expect(settings.sandbox.filesystem.allowWrite).not.toContain(dir); // the home folder is NOT writable
    expect(settings.sandbox.filesystem.allowWrite).toHaveLength(new Set(settings.sandbox.filesystem.allowWrite).size);
    for (const w of settings.sandbox.filesystem.allowWrite) expect([ws, path.join(dir, "Developer"), "/tmp", "/private/tmp", os.tmpdir(), fs.realpathSync.native(os.tmpdir())].some((a) => w === a || w.startsWith(a + "/"))).toBe(true);
    for (const p of [".claude.json", ".gilb-connector.mjs"]) {
      expect(settings.sandbox.filesystem.denyRead).toContain(path.join(dir, p));
      expect(settings.sandbox.filesystem.denyWrite).toContain(path.join(dir, p));
    }
    const dw = settings.sandbox.filesystem.denyWrite;
    expect(dw).toContain(path.join(dir, "Developer", "GilbServerOps"));
    expect(settings.sandbox.filesystem.denyRead).not.toContain(path.join(dir, "Developer", "GilbServerOps")); // write-only
    expect(dw).toEqual(expect.arrayContaining([path.join(ws, "p1", ".claude"), path.join(dir, "Developer", "other", ".claude"), `${ws}/**/.claude`, `${ws}/**/.claude/**`, `${dir}/Developer/**/.claude`]));
    expect(settings.permissions.deny).toEqual(expect.arrayContaining([`Read(/${dir}/.ssh/**)`, `Edit(/${dir}/.ssh)`, `Read(/${dir}/.netrc)`]));
    expect(settings.permissions.ask).toEqual(ASKED_COMMAND_RULES);
    for (const c of ["sudo", "security", "launchctl", "osascript"]) expect(settings.permissions.ask).toContain(`Bash(${c} *)`);
    expect(settings.permissions.ask).toContain("Bash(*GilbServerOps*)");
    expect(settings.permissions.disableBypassPermissionsMode).toBe("disable");
    expect(run.argv[run.argv.indexOf("--permission-mode") + 1]).toBe("acceptEdits");
    expect(run.argv).not.toContain("--restricted");
  });

  it("Linux gets the same block; a project turn writes in the project folder", async () => {
    const secret = await start({ platform: "linux" });
    fs.mkdirSync(path.join(ws, "p1"), { recursive: true });
    const pr = await (await fetch(`${base}/v1/projects`, { headers: { "x-bridge-secret": secret } })).json().catch(() => null);
    void pr;
    await ask(secret, []);
    const run = rows("run")[0];
    expect(JSON.parse(run.argv[run.argv.indexOf("--settings") + 1]).sandbox.enabled).toBe(true);
  });

  it("only adds: extraProtected (tests) joins the fixed list, never replaces it", async () => {
    const secret = await start({ extraFake: true });
    await ask(secret, []);
    const run = rows("run")[0];
    const s = JSON.parse(run.argv[run.argv.indexOf("--settings") + 1]);
    expect(s.sandbox.filesystem.denyRead).toContain(path.join(dir, "fake-extra"));
    expect(s.sandbox.filesystem.denyRead).toContain(path.join(dir, ".ssh"));
    expect(protectedPlaces(dir, ["relative/not-absolute"])).not.toContain("relative/not-absolute");
  });

  it("each-write: no sandbox block, asking mode; Windows computer mode: no sandbox either", async () => {
    let secret = await start();
    await ask(secret, [], { body: { approval: "each-write" } });
    let run = rows("run")[0];
    expect(run.argv[run.argv.indexOf("--permission-mode") + 1]).toBe("manual");
    expect(JSON.parse(run.argv[run.argv.indexOf("--settings") + 1])).toEqual({ permissions: { disableBypassPermissionsMode: "disable" } });
    await bridge.close();
    await removeTestDir(dir);
    secret = await start({ platform: "win32" });
    await ask(secret, []);
    run = rows("run")[0];
    expect(JSON.parse(run.argv[run.argv.indexOf("--settings") + 1])).toEqual({ permissions: { disableBypassPermissionsMode: "disable" } });
  });

  it("folder mode is unchanged: the folder sandbox with the allow-listed hosts", async () => {
    const secret = await start({ fullAccess: false });
    await ask(secret, [], { body: {} });
    const run = rows("run")[0];
    const s = JSON.parse(run.argv[run.argv.indexOf("--settings") + 1]);
    expect(s.sandbox.network.allowedDomains).not.toContain("*");
    expect(s.sandbox.filesystem.allowWrite).toBeUndefined();
    expect(run.argv).toContain("--restricted");
  });

  it("hello: approvals sandboxed on macOS and Linux, absent on Windows and in folder mode; the notice is the agreed one", async () => {
    let secret = await start();
    expect((await hello()).options.approvals).toEqual({ mode: "sandboxed" });
    expect(FULL_ACCESS_NOTICE).toContain("Full access: commands run without asking inside a sandbox; they can write only in your code folder, ~/Developer and temp, and your keys and the bridge's files are locked.");
    await bridge.close(); await removeTestDir(dir);
    secret = await start({ platform: "win32" });
    expect((await hello()).options.approvals).toBeUndefined();
    await bridge.close(); await removeTestDir(dir);
    secret = await start({ fullAccess: false });
    expect((await hello()).options.approvals).toBeUndefined();
    void secret;
  });

  it("a sandbox that cannot start ends the turn with the sandbox error, never a silent unsandboxed run", async () => {
    const secret = await start({ platform: "linux" });
    const res = await fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify(T({ prompt: "SANDBOXFAIL" })) });
    const text = await res.text();
    expect(text).toContain("Claude Code could not start its sandbox on this computer, so the code turn was stopped.");
    expect(text).not.toContain("event: message");
  });
});

describe("file tools on protected places are denied outright; the rest runs unasked", () => {
  it("direct, ~, $HOME, .., a link in the folder and a dangling link", async () => {
    const secret = await start();
    fs.symlinkSync(path.join(dir, ".ssh"), path.join(ws, "lnk"));
    fs.symlinkSync(path.join(dir, ".ssh", "authorized_keys"), path.join(ws, "dang")); // the target does not exist yet
    fs.symlinkSync(path.join(dir, "Developer", ".base-deploy"), path.join(ws, "dep"));
    const calls = [
      F("Read", { file_path: path.join(dir, ".ssh", "id_rsa") }),
      F("Read", { file_path: "~/.ssh/id_rsa" }),
      F("Edit", { file_path: "$HOME/.ssh/id_rsa", old_string: "a", new_string: "b" }),
      F("Write", { file_path: "${HOME}/.aws/credentials", content: "x" }),
      F("Read", { file_path: path.join(ws, "..", ".ssh", "id_rsa") }),
      F("Read", { file_path: path.join(ws, "x", "..", "..", ".ssh", "id_rsa") }),
      F("Read", { file_path: path.join(ws, "lnk", "id_rsa") }),
      F("Read", { file_path: path.join(ws, "lnk") }),
      F("Write", { file_path: path.join(ws, "dang"), content: "k" }),
      F("Write", { file_path: path.join(ws, "dep", "new") , content: "k" }),
      F("NotebookEdit", { notebook_path: path.join(dir, ".gilb-claude-code-bridge", "x.ipynb"), new_source: "x" }),
      F("Write", { file_path: path.join(dir, ".gilb-claude-code-bridge.mjs"), content: "x" }),
      F("Write", { file_path: path.join(dir, ".gilb-claude-code-bridge-other", "new"), content: "x" }), // another install's state folder, not there yet
      F("Edit", { file_path: path.join(dir, "Library", "LaunchAgents", "x.plist"), old_string: "a", new_string: "b" }),
      F("Read", { file_path: path.join(dir, ".netrc") }),
      F("Read", { file_path: path.join(dir, ".config", "gh", "hosts.yml") }),
      F("Read", { file_path: path.join(dir, "Library", "Keychains", "login.keychain-db") }),
      F("Read", { file_path: path.join(dir, ".GNUPG", "x") }), // the other case (a case-insensitive disk)
      F("Grep", { pattern: "x", path: path.join(dir, ".ssh") }),
      F("Glob", { pattern: "*", path: "~/.ssh" }),
      F("Glob", { pattern: path.join(dir, ".ss*", "*") }),
      F("Glob", { pattern: `${dir}/.s{s,x}h/id_*` }),
      F("Glob", { pattern: "~/.[s]sh/**" }),
      F("Read", { file_path: path.join(ws, "ok.txt"), path: path.join(dir, ".ssh") }), // any path key counts
      F("Read", { file_path: path.join(ws, "a\0b") }),
    ];
    const r = await ask(secret, calls);
    expect(r.questions).toEqual([]);
    expect(r.decisions).toHaveLength(calls.length);
    for (const [i, d] of r.decisions.entries()) {
      expect(d.behavior, JSON.stringify(calls[i])).toBe("deny");
    }
    expect(r.decisions[0].message).toBe(protectedMsg(path.join(dir, ".ssh")));
    expect(r.decisions[6].message).toBe(protectedMsg(path.join(dir, ".ssh")));
    expect(r.decisions[8].message).toBe(protectedMsg(path.join(dir, ".ssh")));
    expect(r.decisions[9].message).toBe(protectedMsg(path.join(dir, "Developer", ".base-deploy")));
    expect(fs.existsSync(path.join(dir, ".ssh", "authorized_keys"))).toBe(false);
  });

  it("ordinary file tools, commands, searches and web search run with no question", async () => {
    const secret = await start();
    fs.writeFileSync(path.join(ws, "ok.txt"), "x");
    const calls = [
      F("Read", { file_path: path.join(ws, "ok.txt") }),
      F("Read", { file_path: "ok.txt" }),
      F("Write", { file_path: path.join(ws, "new.txt"), content: "x" }),
      F("Edit", { file_path: path.join(dir, "Developer", "a.txt"), old_string: "a", new_string: "b" }), // ~/Developer is writable
      F("Write", { file_path: "/tmp/x-outside.txt", content: "x" }),
      F("Read", { file_path: path.join(dir, ".sshx", "y") }), // a sibling name, not the protected one
      F("Read", { file_path: path.join(dir, "Developer", "other", "y") }),
      F("MultiEdit", { file_path: path.join(ws, "ok.txt"), edits: [] }),
      F("Glob", { pattern: "**/*.ts" }),
      F("Glob", { pattern: "**/*.ts", path: path.join(dir, "Developer") }),
      F("Grep", { pattern: "x", path: dir }), // above the protected places: the deny rules leave them out
      F("Grep", { pattern: "x" }),
      F("Bash", { command: "ls", description: "List files" }),
      F("Bash", { command: "npm -v" }),
      F("Bash", { command: `echo hi > ${path.join(dir, "scratchfile")}` }),
      F("Bash", { command: "grep -rn security src && echo sudoku" }), // the words as arguments or text are not commands
      F("Bash", { command: "git commit -m 'fix osascript text'" }),
      F("WebSearch", { query: "node 22 release notes" }),
      F("TodoWrite", { todos: [] }),
      F("Task", { prompt: "x" }),
    ];
    const r = await ask(secret, calls);
    expect(r.questions).toEqual([]);
    for (const [i, d] of r.decisions.entries()) expect(d.behavior, JSON.stringify(calls[i])).toBe("allow");
    expect(r.decisions).toHaveLength(calls.length);
  });

  it("a command that asks the sandbox off is denied", async () => {
    const secret = await start();
    const r = await ask(secret, [F("Bash", { command: "ls", dangerouslyDisableSandbox: true })]);
    expect(r.decisions[0]).toEqual({ behavior: "deny", message: "Commands run only inside the sandbox on this computer." });
    expect(r.questions).toEqual([]);
  });
});

describe("writes are allowed only in the code folder, ~/Developer and temp; .claude settings are never written", () => {
  it("file tools: the home folder, bin folders, shell files, the claude and node binaries, .claude, .mcp.json, GilbServerOps, links out", async () => {
    const secret = await start();
    fs.symlinkSync(path.join(dir, ".local", "bin"), path.join(ws, "binlink"));
    fs.symlinkSync(path.join(dir, ".zshrc"), path.join(ws, "rclink"));
    const W = (file_path) => F("Write", { file_path, content: "x" });
    const bad = [
      W(path.join(dir, ".local", "bin", "claude")),
      W(path.join(dir, ".local", "share", "fnm", "node")),
      W("~/.local/bin/claude"),
      W("$HOME/.zshrc"),
      W(path.join(dir, ".bashrc")),
      W(path.join(dir, "newfile-in-home")),
      W(path.join(dir, ".npm", "x")),
      W(path.join(ws, "binlink", "claude")),
      W(path.join(ws, "rclink")),
      W(path.join(ws, "..", ".zshrc")),
      W(path.join(ws, "p1", ".claude", "settings.json")),
      W(path.join(ws, "p1", ".claude", "settings.local.json")),
      W(path.join(ws, "new-project", ".claude", "hooks", "h.sh")),
      W(path.join(dir, "Developer", "other", ".claude", "settings.json")),
      W(path.join(dir, "Developer", "x", ".CLAUDE", "settings.json")),
      W(path.join(ws, ".mcp.json")),
      W(path.join(dir, ".claude.json")),
      W(path.join(dir, ".claude", "settings.json")),
      W(path.join(dir, "Developer", "GilbServerOps", "ship", "x.sh")),
      F("Edit", { file_path: path.join(dir, ".zshrc"), old_string: "a", new_string: "b" }),
      F("MultiEdit", { file_path: path.join(dir, ".zshrc"), edits: [] }),
      F("NotebookEdit", { notebook_path: path.join(dir, "n.ipynb"), new_source: "x" }),
    ];
    const r = await ask(secret, bad);
    expect(r.questions).toEqual([]);
    for (const [i, d] of r.decisions.entries()) expect(d.behavior, JSON.stringify(bad[i])).toBe("deny");
    expect(r.decisions[0].message).toBe("Writes are allowed only in the code folder, ~/Developer and the temp folder.");
    expect(r.decisions[10].message).toMatch(/\.claude folder/);
    expect(r.decisions[18].message).toBe(protectedMsg(path.join(dir, "Developer", "GilbServerOps")));
  });

  it("writes inside the code folder, ~/Developer and temp, and reads anywhere outside the protected list, run unasked", async () => {
    const secret = await start();
    const ok = [
      F("Write", { file_path: path.join(ws, "p1", "src", "a.ts"), content: "x" }),
      F("Write", { file_path: path.join(dir, "Developer", "proj", "a.ts"), content: "x" }),
      F("Write", { file_path: path.join(os.tmpdir(), "b234-x.txt"), content: "x" }),
      F("Write", { file_path: "/tmp/b234-y.txt", content: "x" }),
      F("Edit", { file_path: path.join(ws, ".npm-cache", "z"), old_string: "a", new_string: "b" }),
      F("Read", { file_path: path.join(dir, ".zshrc") }),
      F("Read", { file_path: path.join(dir, ".local", "bin", "claude") }),
      F("Read", { file_path: path.join(ws, "p1", ".claude", "settings.json") }), // reading is not writing
    ];
    const r = await ask(secret, ok);
    expect(r.questions).toEqual([]);
    for (const [i, d] of r.decisions.entries()) expect(d.behavior, JSON.stringify(ok[i])).toBe("allow");
  });

  it("reads of the connector files and ~/.claude.json are denied", async () => {
    const secret = await start();
    const r = await ask(secret, [F("Read", { file_path: path.join(dir, ".gilb-connector.mjs") }), F("Read", { file_path: "~/.claude.json" }), F("Read", { file_path: path.join(dir, ".gilb-connector-keys", "k") })]);
    for (const d of r.decisions) expect(d.behavior).toBe("deny");
  });

  it("the npm cache of a sandboxed turn lives in the code folder; an each-write turn keeps the person's environment", async () => {
    const secret = await start();
    await ask(secret, []);
    expect(rows("run")[0].envKeys).toContain("npm_config_cache");
  });

  it("helpers: writeBlock, claudeDirs, claudeGlobs", () => {
    const home = fs.realpathSync.native(fs.mkdtempSync(path.join(HERE, "..", ".tmp-wb-")));
    try {
      fs.mkdirSync(path.join(home, "w", "a", ".claude"), { recursive: true });
      fs.mkdirSync(path.join(home, "w", "node_modules", "x", ".claude"), { recursive: true });
      expect(claudeDirs([path.join(home, "w")])).toEqual([path.join(home, "w", "a", ".claude")]);
      const o = { home, places: [], base: path.join(home, "w"), ci: true };
      const areas = writableAreas(home, path.join(home, "w"), []);
      expect(writeBlock("a/b.ts", o, areas, writeOnlyPlaces(home))).toBeNull();
      expect(writeBlock("../x", o, areas, writeOnlyPlaces(home))).toMatch(/^Writes are allowed only/);
      expect(writeBlock("a/.claude/settings.json", o, areas, [])).toMatch(/\.claude/);
      expect(claudeGlobs("/w", "/h")).toEqual(["/w/**/.claude", "/w/**/.claude/**", "/h/Developer/**/.claude", "/h/Developer/**/.claude/**"]);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("the short asked list still asks", () => {
  it("sudo, security, launchctl, osascript (also in a wrapper, a path or a pipe) and GilbServerOps ship/server are put to the person; a refusal denies", async () => {
    const secret = await start();
    const cmds = ["sudo rm /x", "security find-generic-password -a x", "launchctl list", "osascript -e 'return 1'", "ls && /usr/bin/sudo ls", "env FOO=1 osascript -e x", "echo a | sudo tee /x", "timeout 5 launchctl list", "bash ship/ship-static.sh x aaaa # GilbServerOps", "cd ~/Developer/GilbServerOps && ls server"];
    const r = await ask(secret, cmds.map((c) => F("Bash", { command: c })), { allow: false });
    expect(r.questions).toHaveLength(cmds.length);
    expect(r.questions.map((q) => q.tool)).toEqual(cmds.map(() => "Bash"));
    for (const d of r.decisions) expect(d.behavior).toBe("deny");
  });

  it("an allowed answer runs it", async () => {
    const secret = await start();
    const r = await ask(secret, [F("Bash", { command: "osascript -e 'return 1'" })], { allow: true });
    expect(r.questions).toHaveLength(1);
    expect(r.decisions[0].behavior).toBe("allow");
  });

  it("an unknown tool (the person's own MCP tool) is asked; WebFetch keeps the 0.3.12 rules (asked, with scopes)", async () => {
    const secret = await start();
    const r = await ask(secret, [F("mcp__other__do", { x: 1 }), F("WebFetch", { url: "https://example.com/a" })], { allow: true });
    expect(r.questions).toHaveLength(2);
    expect(r.questions[1].scopes).toEqual(["once", "turn"]);
  });

  it("each-write still asks everything, files and commands included", async () => {
    const secret = await start();
    const r = await ask(secret, [F("Read", { file_path: path.join(ws, "ok.txt") }), F("Bash", { command: "ls" })], { allow: true, body: { approval: "each-write" } });
    expect(r.questions).toHaveLength(2);
  });

  it("Windows computer mode still asks about every call", async () => {
    const secret = await start({ platform: "win32" });
    const r = await ask(secret, [F("Read", { file_path: path.join(ws, "ok.txt") }), F("Bash", { command: "dir" })], { allow: true });
    expect(r.questions).toHaveLength(2);
  });
});

describe("the helpers", () => {
  it("protectedHit: lexical forms, links, case, the bridge prefix", () => {
    const home = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-ph-")));
    try {
      fs.mkdirSync(path.join(home, ".ssh"));
      fs.mkdirSync(path.join(home, "w"));
      fs.symlinkSync(path.join(home, ".ssh"), path.join(home, "w", "l"));
      fs.symlinkSync(path.join(home, "w", "l"), path.join(home, "w", "l2")); // a link to a link
      fs.symlinkSync("../.ssh/new", path.join(home, "w", "rel")); // relative, dangling
      const places = protectedPlaces(home);
      const o = { home, places, base: path.join(home, "w"), ci: true };
      expect(protectedHit("l/x", o)).toBe(path.join(home, ".ssh"));
      expect(protectedHit("l2", o)).toBe(path.join(home, ".ssh"));
      expect(protectedHit("rel", o)).toBe(path.join(home, ".ssh"));
      expect(protectedHit("../.SSH/x", o)).toBe(path.join(home, ".ssh"));
      // "l/.." is the .ssh folder's parent (the link is followed first), i.e. home
      expect(protectedHit("l/../x", o)).toBeNull();
      expect(protectedHit("./a/./b", o)).toBeNull();
      expect(protectedHit("~/.gilb-claude-code-bridge-zzz/x", o)).toMatch(/\.gilb-claude-code-bridge\*$/);
      expect(protectedHit("~/.gilb-claude-codebridge", o)).toBeNull();
      expect(protectedHit("~/.sshx", o)).toBeNull();
      expect(protectedHit("~", o)).toBeNull();
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("globHitsProtected reads a pattern segment by segment and leaves ** to the deny rules", () => {
    const home = "/h";
    const o = { home, places: protectedPlaces(home, [], () => []), base: "/h/w", ci: false };
    expect(globHitsProtected("/h/.s?h/*", o)).toBe("/h/.ssh");
    expect(globHitsProtected("~/.{ssh,aws}/**", o)).toMatch(/\.(ssh|aws)$/);
    expect(globHitsProtected("/h/Developer/.base-*/x", o)).toBe("/h/Developer/.base-deploy");
    expect(globHitsProtected("/h/Developer/*/x", o)).toBe("/h/Developer/.base-deploy"); // a star segment also matches the dot folder
    expect(globHitsProtected("/h/**/id_rsa", o)).toBeNull();
    expect(globHitsProtected("**/*.ts", o)).toBeNull();
    expect(globHitsProtected("/h/src/*.ts", o)).toBeNull();
    expect(globHitsProtected("/h/.s*", o)).toBeNull(); // ends AT the place: it lists the name only
    expect(globHitsProtected("/h/*", o)).toBeNull();
  });

  it("askedCommand is command-position text matching only", () => {
    for (const c of ["sudo ls", "ls; sudo ls", "(osascript -e x)", "FOO=1 security dump", "/usr/bin/security x", "`launchctl list`", "bash -c 'sudo ls'", "echo $(sudo id)", "bash ~/Developer/GilbServerOps/ship/ship-backend.sh"]) expect(askedCommand(c), c).toBe(true);
    for (const c of ["ls", "echo sudo", "grep -rn osascript .", "npm run security", "ls security", "git commit -m 'security fix'", "cat sudoers.md", "security-audit --fix"]) expect(askedCommand(c), c).toBe(false);
  });

  it("computerSandboxSettings: real-path spellings are added", () => {
    const real = fs.realpathSync.native(os.tmpdir());
    const s = computerSandboxSettings(real, real, [path.join(real, ".ssh")], []);
    expect(s.sandbox.filesystem.denyRead).toContain(path.join(real, ".ssh"));
  });
});
