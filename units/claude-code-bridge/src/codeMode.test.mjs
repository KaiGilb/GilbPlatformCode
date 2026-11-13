// @vitest-environment node
// Code mode (0.2.0): a turn that may read, edit and run commands inside one folder the person chose.
// Hermetic: a stand-in `claude`. The REAL claude is exercised by scripts/code-mode-probe.mjs (run by hand, not by CI).

import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeTurnSettings, createBridge, parseCli, validateWorkspace, CODE_TOOLS } from "../bridge/bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";

let dir;
let bridge;
let base;
let logFile;
let wsReal;

async function start({ workspace = true, env = {}, bridgeOpts = {} } = {}) {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-code-")));
  logFile = path.join(dir, "claude.log");
  const ws = path.join(dir, "MyCode");
  fs.mkdirSync(ws);
  wsReal = fs.realpathSync.native(ws);
  bridge = createBridge({
    port: 0,
    claudeBin: FAKE,
    allowedOrigins: [APP],
    workDir: path.join(dir, "work"),
    home: dir, // the code folder must be inside the home folder: this temp folder plays it
    codePlatform: "darwin", // full mode is what these tests are about, on whatever platform CI runs (files-only is tested in chooseFolder.test.mjs)
    ...(workspace ? { workspace: ws } : {}),
    env: { ...process.env, FAKE_CLAUDE_LOG: logFile, ...env },
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
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

const logRows = (event) => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.event === event) : []);
const runs = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.event === "run") : []);

async function post(secret, body, route = "/v1/turn") {
  const res = await fetch(`${base}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(secret ? { "x-bridge-secret": secret } : {}) },
    body: JSON.stringify(body),
  });
  if (res.status !== 200 || route !== "/v1/turn") return { status: res.status, json: await res.json().catch(() => null), events: [] };
  const events = [];
  const text = await res.text();
  for (const blk of text.split("\n\n")) {
    const ev = /event: (.*)/.exec(blk)?.[1];
    const data = /data: (.*)/.exec(blk)?.[1];
    if (ev) events.push([ev, JSON.parse(data)]);
  }
  return { status: 200, events };
}
const T = (extra) => ({ system: "You are the agent.", prompt: "hello", ...extra });
const ev = (r, name) => r.events.filter((e) => e[0] === name).map((e) => e[1]);

/** Plays the page for an each-write turn: reads the stream as it comes, and answers each approval_request with decide(request). */
async function approvingTurn(secret, body, decide) {
  const res = await fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify(T(body)) });
  const events = [];
  let turnId = "";
  const answers = [];
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
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
      events.push([ev, parsed]);
      if (ev === "start") turnId = parsed.turnId;
      if (ev === "approval_request" && decide) {
        const allow = await decide(parsed, turnId);
        answers.push(await post(secret, { turnId, id: parsed.id, allow }, "/v1/approval"));
      }
    }
  }
  return { status: res.status, events, turnId, answers };
}

describe("claude arguments", () => {
  it("a chat turn gets exactly today's arguments", async () => {
    const secret = await start();
    const r = await post(secret, T());
    expect(ev(r, "message")[0]).not.toHaveProperty("mode");
    const run = runs()[0];
    const mcpArg = run.argv[run.argv.indexOf("--mcp-config") + 1];
    expect(JSON.parse(mcpArg).mcpServers.gilb.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp\/[0-9a-f]+\/[0-9a-f]+$/);
    expect(run.argv).toEqual([
      "-p", "--output-format", "stream-json", "--verbose",
      "--tools", "",
      "--strict-mcp-config", "--mcp-config", mcpArg,
      "--allowedTools", "mcp__gilb",
      "--permission-mode", "dontAsk",
      "--disable-slash-commands",
      "--restricted",
      "--system-prompt", "You are the agent.",
      "--system-prompt-snapshot", "off",
      "--session-id", expect.stringMatching(/^[0-9a-f-]{36}$/),
    ]);
    expect(fs.realpathSync.native(run.cwd)).toBe(fs.realpathSync.native(path.join(dir, "work")));
  });

  it("a code turn gets the code arguments, the workspace as its folder, and the settings inline", async () => {
    const secret = await start();
    const r = await post(secret, T({ mode: "code" }));
    expect(r.status).toBe(200);
    const run = runs()[0];
    const a = run.argv;
    const once = (flag) => expect(a.filter((x) => x === flag), flag).toHaveLength(1);
    for (const f of ["-p", "--output-format", "--verbose", "--tools", "--restricted", "--strict-mcp-config", "--mcp-config", "--allowedTools", "--permission-mode", "--permission-prompts", "--disable-slash-commands", "--settings", "--system-prompt", "--system-prompt-snapshot", "--session-id"]) once(f);
    const val = (f) => a[a.indexOf(f) + 1];
    expect(val("--tools")).toBe("Bash,Read,Edit,Write,Glob,Grep,NotebookEdit");
    expect(val("--tools")).toBe(CODE_TOOLS.join(","));
    expect(a).not.toContain("");
    expect(val("--allowedTools")).toBe("mcp__gilb");
    expect(val("--permission-mode")).toBe("acceptEdits");
    expect(val("--permission-prompts")).toBe("none");
    expect(val("--system-prompt")).toBe("You are the agent.");
    expect(val("--system-prompt-snapshot")).toBe("off");
    expect(fs.realpathSync.native(run.cwd)).toBe(wsReal);
    expect(JSON.parse(val("--settings"))).toEqual(codeTurnSettings(os.homedir(), "darwin"));
    expect(ev(r, "message")[0]).toMatchObject({ mode: "code" });
  });

  it("codeTurnSettings has the sandbox keys, appends the test-only folders and drops the macOS paths on Windows", () => {
    const s = codeTurnSettings("/Users/p", "darwin", ["/tmp/x"]);
    expect(s.sandbox).toMatchObject({ enabled: true, failIfUnavailable: true, allowUnsandboxedCommands: false, autoAllowBashIfSandboxed: true });
    expect(s.sandbox.network.allowedDomains).toEqual(["registry.npmjs.org", "registry.yarnpkg.com", "pypi.org", "files.pythonhosted.org"]);
    expect(s.sandbox.filesystem.denyRead).toEqual(expect.arrayContaining(["~/.ssh", "~/.aws", "~/.gnupg", "~/.config", "~/.claude", "~/.gilb-claude-code-bridge", "~/.npmrc", "~/.yarnrc", "~/.yarnrc.yml", "~/.pypirc", "~/.netrc", "~/.git-credentials", "~/.docker", "~/.kube", "~/.azure", "~/Library/Keychains", "/tmp/x"]));
    expect(s.permissions).toEqual({ deny: ["WebFetch", "WebSearch"], disableBypassPermissionsMode: "disable" });
    // Windows is files-only: no sandbox block at all, the permission rules stay.
    expect(codeTurnSettings("C:\\Users\\a", "win32")).toEqual({ permissions: { deny: ["WebFetch", "WebSearch"], disableBypassPermissionsMode: "disable" } });
  });
});

describe("the turn body", () => {
  it("409 without a workspace", async () => {
    const secret = await start({ workspace: false });
    const r = await post(secret, T({ mode: "code" }));
    expect(r.status).toBe(409);
    expect(r.json.error).toBe("This bridge has no code folder. Start it with --workspace <folder>.");
    expect(runs()).toHaveLength(0);
  });
  it("400 for a hand-off, a bad mode and a bad approval", async () => {
    const secret = await start();
    const a = await post(secret, T({ mode: "code", parentTurnId: "abcd" }));
    expect(a.status).toBe(400);
    expect(a.json.error).toBe("A hand-off cannot be a code turn.");
    expect((await post(secret, T({ mode: "root" }))).status).toBe(400);
    expect((await post(secret, T({ mode: 5 }))).status).toBe(400);
    const b = await post(secret, T({ mode: "code", approval: "never" }));
    expect(b.status).toBe(400);
    expect(b.json.error).toBe('approval must be "session" or "each-write"');
    expect((await post(secret, T({ mode: "code", approval: "session" }))).status).toBe(200);
    expect((await post(secret, T({ mode: "chat" }))).status).toBe(200);
    expect(runs()).toHaveLength(2);
  });
  it("429 for a second code turn at once, with the folder name; a chat turn still runs", async () => {
    const secret = await start();
    const first = post(secret, T({ mode: "code", prompt: "WAITFOREVER" }));
    for (let i = 0; i < 100 && runs().length === 0; i++) await new Promise((r) => setTimeout(r, 50));
    expect(runs()).toHaveLength(1);
    const second = await post(secret, T({ mode: "code" }));
    expect(second.status).toBe(429);
    expect(second.json.error).toBe("A code turn is already running in MyCode. Wait for it to finish.");
    // end the first one: closing the bridge stops it
    await bridge.close();
    bridge = undefined;
    await first.catch(() => {});
  });
});

describe("code turn events", () => {
  it("CODEWRITE: activity, files_changed before the message, message with mode code", async () => {
    const secret = await start();
    const r = await post(secret, T({ mode: "code", prompt: "CODEWRITE" }));
    expect(ev(r, "activity")).toEqual([{ tool: "Write", summary: "hello.txt" }]);
    const fc = ev(r, "files_changed")[0];
    expect(fc).toEqual({ added: ["hello.txt"], changed: [], removed: [], addedCount: 1, changedCount: 0, removedCount: 0, truncated: false });
    expect(ev(r, "message")[0]).toMatchObject({ mode: "code" });
    const names = r.events.map((e) => e[0]);
    expect(names.indexOf("files_changed")).toBeLessThan(names.indexOf("message"));
    expect(fs.readFileSync(path.join(wsReal, "hello.txt"), "utf8")).toBe("hi");
  });
  it("files_changed reports changed and removed files and skips .git and node_modules", async () => {
    const secret = await start();
    fs.writeFileSync(path.join(wsReal, "hello.txt"), "old content");
    fs.writeFileSync(path.join(wsReal, "gone.txt"), "x");
    fs.mkdirSync(path.join(wsReal, ".npm-cache"));
    fs.writeFileSync(path.join(wsReal, ".npm-cache", "c.txt"), "x");
    fs.mkdirSync(path.join(wsReal, "node_modules"));
    fs.writeFileSync(path.join(wsReal, "node_modules", "n.txt"), "x");
    const r = await post(secret, T({ mode: "code", prompt: "CODEWRITE" }));
    expect(ev(r, "files_changed")[0]).toMatchObject({ added: [], changed: ["hello.txt"], removed: [] });
  });
  it("CODEERR: activity for Bash and a tool_error", async () => {
    const secret = await start();
    const r = await post(secret, T({ mode: "code", prompt: "CODEERR" }));
    expect(ev(r, "activity")).toEqual([{ tool: "Bash", summary: "ls /" }]);
    expect(ev(r, "tool_error")).toEqual([{ tool: "Bash", summary: "ls /", text: "permission denied" }]);
  });
  it("a chat turn sends none of the new events", async () => {
    const secret = await start();
    const r = await post(secret, T({ prompt: "CODEWRITE" }));
    const names = r.events.map((e) => e[0]);
    for (const n of ["activity", "tool_error", "files_changed"]) expect(names).not.toContain(n);
  });
  it("an init that lists a tool the folder limits do not allow stops the turn", async () => {
    const secret = await start({ env: { FAKE_INIT_TOOLS: JSON.stringify(["Bash", "WebFetch"]) } });
    const r = await post(secret, T({ mode: "code" }));
    expect(ev(r, "message")).toHaveLength(0);
    expect(ev(r, "error")[0].message).toBe("The bridge stopped this code turn: Claude Code did not start with the folder limits.");
  });
  it("an init whose permission mode is not exactly acceptEdits stops the turn", async () => {
    const secret = await start({ env: { FAKE_INIT_PERMISSION_MODE: "bypassPermissions" } });
    const r = await post(secret, T({ mode: "code" }));
    expect(ev(r, "message")).toHaveLength(0);
    expect(ev(r, "error")[0].message).toBe("The bridge stopped this code turn: Claude Code did not start with the folder limits.");
  });
  it("an init with no permission mode stops the turn", async () => {
    const secret = await start({ env: { FAKE_INIT_PERMISSION_MODE: "omit" } });
    const r = await post(secret, T({ mode: "code" }));
    expect(ev(r, "message")).toHaveLength(0);
    expect(ev(r, "error")[0].message).toBe("The bridge stopped this code turn: Claude Code did not start with the folder limits.");
  });
  it("a code turn's child gets npm_config_cache inside the workspace; a chat turn's env is unchanged", async () => {
    const secret = await start();
    await post(secret, T({ mode: "code" }));
    await post(secret, T());
    const [code, chat] = runs();
    expect(code.npmCache).toBe(path.join(wsReal, ".npm-cache"));
    expect(chat.npmCache).toBe(process.env.npm_config_cache); // only what the person's own env had
    expect(chat.envKeys.some((k) => k.toLowerCase() === "npm_config_cache")).toBe(process.env.npm_config_cache !== undefined);
  });
  it("in full mode the code turn's npm cache is always the folder's, even when the person's own environment sets one (a CI runner does)", async () => {
    const secret = await start({ env: { npm_config_cache: path.join(os.tmpdir(), "somewhere-else") } });
    await post(secret, T({ mode: "code" }));
    expect(runs()[0].npmCache).toBe(path.join(wsReal, ".npm-cache"));
  });
  it("an init with the code tools passes", async () => {
    const secret = await start({ env: { FAKE_INIT_TOOLS: JSON.stringify([...CODE_TOOLS, "mcp__gilb__list_vaults"]) } });
    const r = await post(secret, T({ mode: "code" }));
    expect(ev(r, "message")).toHaveLength(1);
  });
});

describe("validateWorkspace", () => {
  const home = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "ws-home-")));
  const mk = (...p) => {
    const f = path.join(home, ...p);
    fs.mkdirSync(f, { recursive: true });
    return f;
  };
  const state = mk(".gilb-claude-code-bridge");
  const o = { home, platform: process.platform, stateDirs: [state] };
  const bad = (input, re, opts = o) => {
    const r = validateWorkspace(input, opts);
    expect(r.ok, input).toBe(false);
    expect(r.reason).toMatch(re);
  };

  it("accepts an ordinary folder and returns its name", () => {
    const f = mk("MyCode");
    expect(validateWorkspace(f, o)).toEqual({ ok: true, path: f, name: "MyCode" });
  });
  it("refuses a missing folder and a file, and never creates it", () => {
    const m = path.join(home, "nope");
    bad(m, /does not exist or is not a folder/);
    expect(fs.existsSync(m)).toBe(false);
    fs.writeFileSync(path.join(home, "afile"), "x");
    bad(path.join(home, "afile"), /does not exist or is not a folder/);
    bad("", /does not exist or is not a folder/);
  });
  it("refuses home, the root, and a parent of home", () => {
    bad(home, /home folder/);
    bad(path.parse(home).root, /root of the disk/);
    bad(path.dirname(home), /holds your home folder/);
  });
  it("refuses a folder inside .ssh, and a folder that contains .ssh", () => {
    bad(mk(".ssh", "x"), /holds secrets/);
    const holder = mk("Holder");
    mk("Holder", ".ssh");
    bad(holder, /contains a \.ssh folder/);
  });
  it("refuses a symlink to home and a bridge state folder", () => {
    const link = path.join(os.tmpdir(), `ws-link-${process.pid}`);
    fs.rmSync(link, { force: true });
    fs.symlinkSync(home, link);
    try {
      bad(link, /home folder/);
    } finally {
      fs.rmSync(link, { force: true });
    }
    bad(state, /holds secrets or the bridge's own files/);
    bad(mk(".gilb-claude-code-bridge", "work"), /holds secrets or the bridge's own files/);
  });
  it("Windows: refuses C:\\, the home folder, AppData, and compares case-insensitively", () => {
    const w = { home: "C:\\Users\\anna", platform: "win32", stateDirs: ["C:\\Users\\anna\\.gilb-claude-code-bridge"], realpath: (p) => p, stat: () => ({ isDirectory: () => true }), readdir: () => [] };
    bad("C:\\", /root of the disk/, w);
    bad("C:\\Users\\anna", /home folder/, w);
    bad("c:\\users\\ANNA", /home folder/, w);
    bad("C:\\Users\\anna\\AppData\\Roaming\\x", /holds secrets/, w);
    bad("c:\\USERS\\anna\\.GILB-claude-code-bridge-2\\..\\.gilb-claude-code-bridge", /holds secrets/, w);
    bad("C:\\Users", /holds your home folder/, w);
    expect(validateWorkspace("C:\\Users\\anna\\Code", w)).toEqual({ ok: true, path: "C:\\Users\\anna\\Code", name: "Code" });
    bad("C:\\Users\\anna\\Code", /contains a \.ssh folder/, { ...w, readdir: () => [".SSH"] });
  });
});

describe("discovery", () => {
  it("/v1/hello says codeTurns and whether there is a workspace, and never the path", async () => {
    await start();
    const h = await (await fetch(`${base}/v1/hello`)).json();
    expect(h).toMatchObject({ codeTurns: true, workspace: true });
    expect(JSON.stringify(h)).not.toContain("MyCode");
    await bridge.close();
    await start({ workspace: false });
    expect(await (await fetch(`${base}/v1/hello`)).json()).toMatchObject({ codeTurns: true, workspace: false });
  });
  it("/v1/workspace needs pairing and returns the name and path; 404 without a workspace", async () => {
    const secret = await start();
    expect((await post(null, {}, "/v1/workspace")).status).toBe(401);
    const r = await post(secret, {}, "/v1/workspace");
    expect(r.json).toEqual({ name: "MyCode", path: wsReal });
    await bridge.close();
    const s2 = await start({ workspace: false });
    const r2 = await post(s2, {}, "/v1/workspace");
    expect(r2.status).toBe(404);
    expect(r2.json.error).toBe("This bridge has no code folder. Start it with --workspace <folder>.");
  });
});

describe("--workspace on the command line", () => {
  it("is read, and a relative folder is taken from where the command was typed", () => {
    expect(parseCli(["--workspace", "/a/b"]).workspace).toBe("/a/b");
    expect(parseCli(["--workspace", "x"]).workspace).toBe(path.resolve(process.cwd(), "x"));
    expect(parseCli([]).workspace).toBeUndefined();
    expect(parseCli(["--workspace"]).workspace).toBe("");
  });
});

describe("approval: each-write", () => {
  const ASK_PROMPT = "You are working in the code folder \"MyCode\" on the person's own computer. Read, write and run commands only inside this folder. The network reaches only package registries. Before any npm, pnpm or yarn install, make sure this folder has its own package.json (run npm init -y first if it has none), so packages are installed here and not in a parent folder. When something is refused, say so in one line and do not try another way around it. When you finish, list the files you changed.";

  it("the argument lists of a session and an each-write code turn differ only in the asking places", async () => {
    const secret = await start();
    await post(secret, T({ mode: "code" }));
    await post(secret, T({ mode: "code", approval: "each-write" }));
    const [a, b] = runs().map((r) => r.argv);
    const val = (x, f) => x[x.indexOf(f) + 1];
    expect(val(a, "--permission-mode")).toBe("acceptEdits");
    expect(val(b, "--permission-mode")).toBe("manual");
    expect(val(a, "--permission-prompts")).toBe("none");
    expect(val(b, "--permission-prompts")).toBe("host");
    expect(val(b, "--permission-prompt-tool")).toBe("mcp__gilb__bridge_approve");
    expect(a).not.toContain("--permission-prompt-tool");
    expect(JSON.parse(val(b, "--settings"))).toEqual(codeTurnSettings(os.homedir(), "darwin", [], "each-write"));
    expect(JSON.parse(val(b, "--settings")).sandbox.autoAllowBashIfSandboxed).toBe(false);
    expect(JSON.parse(val(a, "--settings")).sandbox.autoAllowBashIfSandboxed).toBe(true);
    // everything else is identical once those places are taken out (the MCP url carries the turn's own id and token)
    const strip = (x) => {
      const o = [...x];
      for (const f of ["--permission-mode", "--permission-prompts", "--permission-prompt-tool", "--settings", "--mcp-config", "--session-id"]) {
        const i = o.indexOf(f);
        if (i >= 0) o.splice(i, 2);
      }
      return o;
    };
    expect(strip(b)).toEqual(strip(a));
    // settings differ in that one key only
    const sa = JSON.parse(val(a, "--settings"));
    const sb = JSON.parse(val(b, "--settings"));
    sb.sandbox.autoAllowBashIfSandboxed = true;
    expect(sb).toEqual(sa);
  });

  it("every code turn appends the folder's system prompt; a chat turn does not", async () => {
    const secret = await start();
    await post(secret, T({ mode: "code" }));
    await post(secret, T({ mode: "code", approval: "each-write" }));
    await post(secret, T());
    const [a, b, c] = runs().map((r) => r.argv);
    for (const x of [a, b]) {
      expect(x.filter((f) => f === "--append-system-prompt")).toHaveLength(1);
      expect(x[x.indexOf("--append-system-prompt") + 1]).toBe(ASK_PROMPT);
      expect(x[x.indexOf("--system-prompt") + 1]).toBe("You are the agent.");
    }
    expect(c).not.toContain("--append-system-prompt");
  });

  it("an each-write turn whose init reports acceptEdits (the asking mode did not take) is stopped", async () => {
    const secret = await start({ env: { FAKE_INIT_PERMISSION_MODE: "acceptEdits" } });
    const r = await post(secret, T({ mode: "code", approval: "each-write" }));
    expect(ev(r, "message")).toHaveLength(0);
    expect(ev(r, "error")[0].message).toMatch(/folder limits/);
  });

  it("an each-write turn passes only with the exact mode the real CLI reports ('default'); 'manual' or 'acceptEdits' stops it", async () => {
    for (const mode of ["manual", "acceptEdits", "bypassPermissions", "omit"]) {
      await bridge?.close();
      const secret = await start({ env: { FAKE_INIT_PERMISSION_MODE: mode } });
      const r = await post(secret, T({ mode: "code", approval: "each-write" }));
      expect(ev(r, "message"), mode).toHaveLength(0);
      expect(ev(r, "error")[0].message, mode).toMatch(/folder limits/);
    }
    await bridge.close();
    const secret = await start({ env: { FAKE_INIT_PERMISSION_MODE: "default" } });
    expect(ev(await post(secret, T({ mode: "code", approval: "each-write" })), "message")).toHaveLength(1);
  });

  it("400 for another approval value", async () => {
    const secret = await start();
    const r = await post(secret, T({ mode: "code", approval: "never" }));
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('approval must be "session" or "each-write"');
  });

  it("bridge_approve is listed only in an each-write code turn", async () => {
    const secret = await start();
    await post(secret, T({ mode: "code", prompt: "LISTTOOLS" }));
    await post(secret, T({ prompt: "LISTTOOLS" }));
    await post(secret, T({ mode: "code", approval: "each-write", prompt: "LISTTOOLS" }));
    const [sess, chat, each] = logRows("mcpTools").map((r) => r.names);
    expect(sess).not.toContain("bridge_approve");
    expect(chat).not.toContain("bridge_approve");
    expect(each).toEqual(["bridge_approve"]);
    expect(sess).toEqual([]);
  });

  it("a write inside the folder asks the person; allow reaches Claude Code as allow; no tool_request, nothing counted", async () => {
    const secret = await start({ bridgeOpts: { maxToolCalls: 1 } });
    const r = await approvingTurn(secret, { mode: "code", approval: "each-write", prompt: "ASKWRITE" }, async () => true);
    const req = r.events.filter((e) => e[0] === "approval_request").map((e) => e[1]);
    expect(req).toHaveLength(1);
    expect(req[0]).toMatchObject({ tool: "Write", summary: "a.txt" });
    expect(req[0].id).toMatch(/^[0-9a-f]{16}$/);
    expect(r.answers[0]).toMatchObject({ status: 200, json: { ok: true } });
    expect(r.events.filter((e) => e[0] === "approval_done").map((e) => e[1])).toEqual([{ id: req[0].id, allow: true }]);
    expect(logRows("approve")[0]).toEqual({ event: "approve", decision: { behavior: "allow", updatedInput: { file_path: path.join(wsReal, "a.txt"), content: "x" } }, hasStructured: false });
    const names = r.events.map((e) => e[0]);
    expect(names).not.toContain("tool_request");
    expect(names).not.toContain("budget_spent");
  });

  it("deny reaches Claude Code as a deny with 'The person declined.'", async () => {
    const secret = await start();
    const r = await approvingTurn(secret, { mode: "code", approval: "each-write", prompt: "ASKWRITE" }, async () => false);
    expect(logRows("approve")[0].decision).toEqual({ behavior: "deny", message: "The person declined." });
    expect(r.events.filter((e) => e[0] === "approval_done")[0][1].allow).toBe(false);
  });

  it("a Bash command asks with the command as the summary and the description as detail", async () => {
    const secret = await start();
    const r = await approvingTurn(secret, { mode: "code", approval: "each-write", prompt: "ASKBASH" }, async () => true);
    expect(r.events.find((e) => e[0] === "approval_request")[1]).toMatchObject({ tool: "Bash", summary: "ls", detail: "List files" });
  });

  it("a write outside the folder is denied at once, with no question", async () => {
    const secret = await start();
    const r = await approvingTurn(secret, { mode: "code", approval: "each-write", prompt: "ASKOUT" }, async () => true);
    expect(r.events.map((e) => e[0])).not.toContain("approval_request");
    expect(logRows("approve")[0].decision).toEqual({ behavior: "deny", message: "Outside the code folder." });
  });

  it("any other tool (WebFetch, Task) is denied at once with the not-allowed message, with no question", async () => {
    const secret = await start();
    for (const prompt of ["ASKWEB", "ASKTASK"]) {
      const r = await approvingTurn(secret, { mode: "code", approval: "each-write", prompt }, async () => true);
      expect(r.events.map((e) => e[0])).not.toContain("approval_request");
    }
    expect(logRows("approve").map((r) => r.decision)).toEqual([
      { behavior: "deny", message: "This tool is not allowed in a code turn." },
      { behavior: "deny", message: "This tool is not allowed in a code turn." },
    ]);
  });

  it("a write through a symlink that leaves the folder is denied at once", async () => {
    const secret = await start();
    fs.symlinkSync(os.tmpdir(), path.join(wsReal, "a.txt")); // the ASKWRITE target itself is a link to outside
    const r = await approvingTurn(secret, { mode: "code", approval: "each-write", prompt: "ASKWRITE" }, async () => true);
    expect(r.events.map((e) => e[0])).not.toContain("approval_request");
    expect(logRows("approve")[0].decision.message).toBe("Outside the code folder.");
  });

  it("no answer in time: denied with 'The person did not answer.'", async () => {
    const secret = await start({ bridgeOpts: { approvalWaitMs: 150 } });
    const r = await approvingTurn(secret, { mode: "code", approval: "each-write", prompt: "ASKWRITE" }, null);
    expect(r.events.some((e) => e[0] === "approval_request")).toBe(true);
    expect(logRows("approve")[0].decision).toEqual({ behavior: "deny", message: "The person did not answer." });
    expect(r.events.filter((e) => e[0] === "approval_done")[0][1].allow).toBe(false);
  });

  it("/v1/approval: 401 unpaired, 404 for an unknown turn or id, 400 for a non-boolean, 409 for a second answer", async () => {
    const secret = await start();
    expect((await post(null, { turnId: "x", id: "y", allow: true }, "/v1/approval")).status).toBe(401);
    expect((await post(secret, { turnId: "nope", id: "nope", allow: true }, "/v1/approval")).status).toBe(404);
    const seen = [];
    const r = await approvingTurn(secret, { mode: "code", approval: "each-write", prompt: "ASKWRITE" }, async (q, turnId) => {
      seen.push((await post(secret, { turnId, id: "0000000000000000", allow: true }, "/v1/approval")).status); // unknown id, live turn
      seen.push((await post(secret, { turnId, id: q.id, allow: "yes" }, "/v1/approval")).status); // not a boolean
      seen.push((await post(secret, { turnId, id: q.id, allow: true }, "/v1/approval")).status); // the answer
      seen.push((await post(secret, { turnId, id: q.id, allow: false }, "/v1/approval")).status); // a second one
      return true; // the helper's own answer is a third: also refused
    });
    expect(seen).toEqual([404, 400, 200, 409]);
    expect(r.answers[0].status).toBe(409);
    expect(logRows("approve")[0].decision.behavior).toBe("allow");
  });
});

describe("activity summary", () => {
  it("is the tool name when the input has no usable field, never empty", async () => {
    const secret = await start();
    const r = await post(secret, T({ mode: "code", prompt: "CODEEMPTY" }));
    expect(ev(r, "activity")).toEqual([{ tool: "Bash", summary: "Bash" }, { tool: "Read", summary: "Read" }]);
  });
});
