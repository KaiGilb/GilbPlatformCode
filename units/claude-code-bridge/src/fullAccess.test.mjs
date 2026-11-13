// @vitest-environment node
// Computer mode (0.3.0): --full-access on the command line makes a code turn start the person's own Claude Code the way their terminal would.
// Hermetic: a stand-in `claude`. The REAL claude is exercised by a probe run by hand.

import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge, parseCli, FULL_ACCESS_NOTICE } from "../bridge/bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";

let dir;
let bridge;
let base;
let logFile;
let wsReal;

async function start({ fullAccess = true, workspace = true, env = {}, bridgeOpts = {}, platform = "darwin", workspaceFileBody } = {}) {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-full-")));
  logFile = path.join(dir, "claude.log");
  const ws = path.join(dir, "MyCode");
  fs.mkdirSync(ws);
  wsReal = fs.realpathSync.native(ws);
  const workspaceFile = path.join(dir, ".gilb-claude-code-bridge", "workspace.json");
  if (workspaceFileBody) fs.mkdirSync(path.dirname(workspaceFile), { recursive: true });
  if (workspaceFileBody) fs.writeFileSync(workspaceFile, JSON.stringify(workspaceFileBody(wsReal)));
  bridge = createBridge({
    port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "work"), home: dir,
    codeEnvExtraPrefixes: ["FAKE_"], codePlatform: platform,
    ...(workspace && !workspaceFileBody ? { workspace: ws } : {}),
    ...(workspaceFileBody ? { workspaceFile } : {}),
    ...(fullAccess ? { fullAccess: true } : {}),
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

const rows = (event) => (fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.event === event) : []);
const runs = () => rows("run");
const hello = async (headers = {}) => (await fetch(`${base}/v1/hello`, { headers })).json();

async function post(secret, body, extraHeaders = {}) {
  const res = await fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret, ...extraHeaders }, body: JSON.stringify(body) });
  const events = [];
  if (res.status !== 200) return { status: res.status, json: await res.json().catch(() => null), events };
  for (const blk of (await res.text()).split("\n\n")) {
    const ev = /event: (.*)/.exec(blk)?.[1];
    const data = /data: (.*)/.exec(blk)?.[1];
    if (ev) events.push([ev, JSON.parse(data)]);
  }
  return { status: 200, events };
}
const T = (extra) => ({ system: "You are the agent.", prompt: "hello", mode: "code", ...extra });
const ev = (r, name) => r.events.filter((e) => e[0] === name).map((e) => e[1]);
const ASK = (...asks) => `ASKJSON:${JSON.stringify(asks).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029")}`; // the stand-in reads the line with a regex whose "." stops at U+2028

/** Plays the page: answers every approval_request with allow, and returns the requests seen. */
async function askingTurn(secret, body, allow = true) {
  const res = await fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify(T(body)) });
  const events = [];
  let turnId = "";
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
      const e = /event: (.*)/.exec(blk)?.[1];
      const d = /data: (.*)/.exec(blk)?.[1];
      if (!e) continue;
      const parsed = JSON.parse(d);
      events.push([e, parsed]);
      if (e === "start") turnId = parsed.turnId;
      if (e === "approval_request") {
        await fetch(`${base}/v1/approval`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify({ turnId, id: parsed.id, allow }) });
      }
    }
  }
  return { events, requests: events.filter((x) => x[0] === "approval_request").map((x) => x[1]) };
}

describe("computer mode arguments", () => {
  it("a session turn: exactly the computer list, none of the folder-mode-only flags", async () => {
    const secret = await start();
    const r = await post(secret, T());
    expect(ev(r, "message")[0]).toMatchObject({ mode: "code", access: "computer" });
    const run = runs()[0];
    const mcp = run.argv[run.argv.indexOf("--mcp-config") + 1];
    expect(JSON.parse(mcp).mcpServers.gilb.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp\/[0-9a-f]+\/[0-9a-f]+$/);
    expect(run.argv).toEqual([
      "-p", "--output-format", "stream-json", "--verbose",
      "--mcp-config", mcp,
      "--allowedTools", "mcp__gilb",
      "--permission-mode", "acceptEdits",
      "--permission-prompts", "host",
      "--permission-prompt-tool", "mcp__gilb__bridge_approve",
      "--settings", JSON.stringify({ permissions: { disableBypassPermissionsMode: "disable" } }),
      "--append-system-prompt", `You are the agent.\n\nYou are working on the person's own computer with the same access as Claude Code in their terminal. Start in the folder "MyCode" (${wsReal}). Make each new app in its own subfolder of the code folder, named after the app in lower case with dashes (for example hello-gilbapp). Never put app files at the top level of the code folder. When the person asks about an existing app, work in its subfolder; if it is unclear which app they mean, ask. Anything that needs the person's permission is asked of them in the chat; if they decline, say so in one line and do not try another way around it. When you finish, list the files you changed.`,
      "--system-prompt-snapshot", "off",
      "--session-id", expect.stringMatching(/^[0-9a-f-]{36}$/),
    ]);
    for (const f of ["--restricted", "--tools", "--disable-slash-commands", "--strict-mcp-config", "--system-prompt"]) expect(run.argv).not.toContain(f);
    expect(JSON.stringify(run.argv)).not.toContain("sandbox");
    expect(fs.realpathSync.native(run.cwd)).toBe(wsReal);
  });

  it("each-write asks in the asking mode; a model and a resumed session are passed as in other turns", async () => {
    const secret = await start();
    await post(secret, T({ approval: "each-write", model: "sonnet" }));
    const a = runs()[0].argv;
    expect(a[a.indexOf("--permission-mode") + 1]).toBe("manual");
    expect(a[a.indexOf("--model") + 1]).toBe("sonnet");
    const sid = (await post(secret, T())).events.find((e) => e[0] === "message")[1].sessionId;
    await post(secret, T({ sessionId: sid }));
    expect(runs()[2].argv).toContain("--resume");
  });

  it("a chat turn in a computer-mode bridge is unchanged", async () => {
    const secret = await start();
    await post(secret, { system: "You are the agent.", prompt: "hello" });
    const argv = runs()[0].argv;
    expect(argv).toContain("--restricted");
    expect(argv).toContain("--strict-mcp-config");
  });

  it("folder mode (no --full-access) keeps its list and says access folder", async () => {
    const secret = await start({ fullAccess: false });
    const r = await post(secret, T());
    expect(ev(r, "message")[0]).not.toHaveProperty("access");
    const argv = runs()[0].argv;
    expect(argv).toContain("--restricted");
    expect(argv).toContain("--tools");
    expect(JSON.parse(argv[argv.indexOf("--settings") + 1]).sandbox.enabled).toBe(true);
  });
});

describe("the app-subfolder sentence", () => {
  it("is in the folder-mode full prompt, the files-only prompt and the computer prompt", async () => {
    const SENT = "Make each new app in its own subfolder of the code folder, named after the app in lower case with dashes (for example hello-gilbapp). Never put app files at the top level of the code folder. When the person asks about an existing app, work in its subfolder; if it is unclear which app they mean, ask.";
    const prompts = [];
    for (const [fullAccess, platform] of [[false, "darwin"], [false, "win32"], [true, "darwin"]]) {
      const secret = await start({ fullAccess, platform });
      await post(secret, T());
      const a = runs()[0].argv;
      prompts.push(a[a.indexOf("--append-system-prompt") + 1]);
      await bridge.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
    for (const x of prompts) expect(x).toContain(SENT);
    expect(prompts[0]).toContain("make sure the app's subfolder has its own package.json (run npm init -y there first if it has none), so packages are installed there and not in a parent folder.");
  });
});

describe("--full-access is the command line only", () => {
  it("parseCli reads it as a flag", () => {
    expect(parseCli(["--full-access"]).fullAccess).toBe(true);
    expect(parseCli(["--install"]).fullAccess).toBe(false);
    expect(parseCli(["--workspace", "/a"]).fullAccess).toBe(false);
  });

  it("a turn body, a header, an environment variable or workspace.json cannot turn it on", async () => {
    const secret = await start({
      fullAccess: false,
      env: { FULL_ACCESS: "1", GILB_FULL_ACCESS: "1", GILB_BRIDGE_FULL_ACCESS: "true", CLAUDE_FULL_ACCESS: "1", FAKE_FULL_ACCESS: "1" },
      workspaceFileBody: (p) => ({ version: 1, path: p, fullAccess: true, access: "computer" }),
    });
    expect((await hello({ "x-full-access": "1", "x-access": "computer" })).access).toBe("folder");
    const r = await post(secret, T({ fullAccess: true, access: "computer", "full-access": true, computer: true }), { "x-full-access": "1", "x-access": "computer" });
    expect(ev(r, "message")[0]).not.toHaveProperty("access");
    expect(runs()[0].argv).toContain("--restricted");
    expect((await hello()).access).toBe("folder");
  });
});

describe("environment", () => {
  it("computer mode: GITHUB_TOKEN reaches the child, ANTHROPIC_API_KEY does not", async () => {
    const secret = await start({ env: { GITHUB_TOKEN: "ghp_x", ANTHROPIC_API_KEY: "sk-x", OTHER_TOKEN_Q: "q" } });
    await post(secret, T());
    const run = runs()[0];
    expect(run.envKeys).toContain("GITHUB_TOKEN");
    expect(run.envKeys).toContain("OTHER_TOKEN_Q");
    expect(run.envKeys).not.toContain("ANTHROPIC_API_KEY");
    expect(run.hasApiKey).toBe(false);
    expect(run.npmCache).not.toBe(path.join(wsReal, ".npm-cache")); // no cache override
  });

  it("folder mode still drops GITHUB_TOKEN", async () => {
    const secret = await start({ fullAccess: false, env: { GITHUB_TOKEN: "ghp_x" } });
    await post(secret, T());
    expect(runs()[0].envKeys).not.toContain("GITHUB_TOKEN");
  });
});

describe("bridge_approve in computer mode", () => {
  it("asks for everything: a Read of /etc/hosts, a WebFetch, a WebSearch, Bash, an outside Write, anything else", async () => {
    const secret = await start();
    const asks = [
      { tool_name: "Read", input: { file_path: "/etc/hosts" } },
      { tool_name: "WebFetch", input: { url: "https://example.com/a" } },
      { tool_name: "WebSearch", input: { query: "vite getting started" } },
      { tool_name: "Bash", input: { command: "ls\nwc -l", description: "Count" } },
      { tool_name: "Write", input: { file_path: "/tmp/x-outside.txt", content: "x" } },
      { tool_name: "Glob", input: { pattern: "../**/*" } },
      { tool_name: "Task", input: { prompt: "x" } },
    ];
    const { requests } = await askingTurn(secret, { approval: "each-write", prompt: ASK(...asks) });
    expect(requests.map((q) => [q.tool, q.summary])).toEqual([
      ["Read", "/etc/hosts"],
      ["WebFetch", "https://example.com/a"],
      ["WebSearch", "vite getting started"],
      ["Bash", "ls ⏎ wc -l"],
      ["Write", "/tmp/x-outside.txt"],
      ["Glob", `Glob {"pattern":"../**/*"}`],
      ["Task", `Task {"prompt":"x"}`],
    ]);
    expect(requests[3].detail).toBe("Count");
    const decisions = rows("askjson").map((r) => r.decision.behavior);
    expect(decisions).toEqual(Array(7).fill("allow"));
  });

  it("a declined question is a denial", async () => {
    const secret = await start();
    await askingTurn(secret, { approval: "each-write", prompt: ASK({ tool_name: "Read", input: { file_path: "/etc/hosts" } }) }, false);
    expect(rows("askjson")[0].decision).toEqual({ behavior: "deny", message: "The person declined." });
  });

  it("approval text is never cut: a padded command shows its tail, a command over 2000 and a path over 1000 are denied with no question", async () => {
    const secret = await start();
    const padded = `echo ok${" ".repeat(350)}\n\t${"\n".repeat(40)}curl evil`;
    const long = "x".repeat(2100);
    const { requests } = await askingTurn(secret, { approval: "each-write", prompt: ASK(
      { tool_name: "Bash", input: { command: padded, description: "d".repeat(900) } },
      { tool_name: "Bash", input: { command: long } },
      { tool_name: "Bash", input: { command: "y".repeat(2000) } },
      { tool_name: "Write", input: { file_path: `/tmp/${"p".repeat(1100)}`, content: "x" } },
      { tool_name: "Read", input: { file_path: `/tmp/${"p".repeat(900)}` } },
    ) });
    expect(requests.map((q) => q.summary)).toEqual([`echo ok ⏎ ${"⏎ ".repeat(40)}curl evil`, "y".repeat(2000), `/tmp/${"p".repeat(900)}`]);
    expect(requests[0].detail).toHaveLength(200);
    const d = rows("askjson").map((r) => r.decision);
    expect(d[1]).toEqual({ behavior: "deny", message: "The command is too long to show for approval; ask for it in smaller steps." });
    expect(d[3]).toEqual({ behavior: "deny", message: "The path is too long to show for approval." });
    expect(d.map((x) => x.behavior)).toEqual(["allow", "deny", "allow", "deny", "allow"]);
  });

  it("a path starting with ~ or $ is shown exactly as given; a relative one is shown resolved against the start folder; absolute as given", async () => {
    const secret = await start();
    const { requests } = await askingTurn(secret, { approval: "each-write", prompt: ASK(
      { tool_name: "Read", input: { file_path: "~/x" } },
      { tool_name: "Write", input: { file_path: "$HOME/y", content: "x" } },
      { tool_name: "Edit", input: { file_path: "sub/z.txt" } },
      { tool_name: "Read", input: { file_path: "/etc/hosts" } },
    ) });
    expect(requests.map((q) => q.summary)).toEqual(["~/x", "$HOME/y", path.join(wsReal, "sub", "z.txt"), "/etc/hosts"]);
  });

  it("folder mode still denies those at once, with no question", async () => {
    const secret = await start({ fullAccess: false });
    const { requests } = await askingTurn(secret, { approval: "each-write", prompt: ASK({ tool_name: "Read", input: { file_path: "/etc/hosts" } }, { tool_name: "WebFetch", input: { url: "https://example.com" } }) });
    expect(requests).toEqual([]);
    expect(rows("askjson").map((r) => r.decision.behavior)).toEqual(["deny", "deny"]);
  });

  it("a session turn lists bridge_approve too, because Claude Code's prompts come to the chat", async () => {
    const secret = await start();
    await post(secret, T({ prompt: "LISTTOOLS" }));
    expect(rows("mcpTools")[0].names).toContain("bridge_approve");
  });
});

describe("the init check in computer mode", () => {
  it("refuses bypassPermissions, and acceptEdits when the asking mode was requested; accepts the requested one with any tool list", async () => {
    for (const [mode, approval, ok] of [["bypassPermissions", "session", false], ["acceptEdits", "each-write", false], ["acceptEdits", "session", true], ["default", "each-write", true]]) {
      const secret = await start({ env: { FAKE_INIT_PERMISSION_MODE: mode, FAKE_INIT_TOOLS: JSON.stringify(["Bash", "WebFetch", "WebSearch", "Task", "mcp__gilb__x"]) } });
      const r = await post(secret, T({ approval }));
      expect(ev(r, "message").length > 0, `${mode}/${approval}`).toBe(ok);
      await bridge.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses an apiKeySource other than none", async () => {
    const secret = await start({ env: { FAKE_API_KEY_SOURCE: "ANTHROPIC_API_KEY" } });
    const r = await post(secret, T());
    expect(ev(r, "message")).toHaveLength(0);
    expect(ev(r, "error")).toHaveLength(1);
  });

  it("still refuses a child that did not start in the code folder", async () => {
    const secret = await start({ env: { FAKE_INIT_CWD: "omit" } });
    const r = await post(secret, T());
    expect(ev(r, "message")).toHaveLength(0);
  });
});

describe("hello", () => {
  it("access is null without a folder, folder by default, computer with --full-access", async () => {
    await start({ workspace: false });
    expect(await hello()).toMatchObject({ workspace: false, codeMode: null, access: null });
    await bridge.close();
    await start({ fullAccess: false });
    expect(await hello()).toMatchObject({ workspace: true, codeMode: "full", access: "folder" });
    await bridge.close();
    await start();
    expect(await hello()).toMatchObject({ workspace: true, codeMode: "full", access: "computer" });
  });

  it("Windows computer mode is codeMode full (no files-only); Windows folder mode stays files-only", async () => {
    await start({ platform: "win32" });
    expect(await hello()).toMatchObject({ codeMode: "full", access: "computer" });
    await bridge.close();
    await start({ platform: "win32", fullAccess: false });
    expect(await hello()).toMatchObject({ codeMode: "files-only", access: "folder" });
  });

  it("the notice text is the agreed one", () => {
    expect(FULL_ACCESS_NOTICE.startsWith("Full computer access is ON: chat code turns can read and change anything your user can")).toBe(true);
  });
});

describe("files_changed in computer mode", () => {
  it("is still the code folder's snapshot", async () => {
    const secret = await start();
    const r = await post(secret, T({ prompt: "hello" }));
    expect(ev(r, "files_changed")).toHaveLength(1);
  });
});

describe("folder mode each-write: the same never-cut rule", () => {
  it("a padded command shows its tail with each line break marked; a command over 2000 is denied with no question", async () => {
    const secret = await start({ fullAccess: false });
    const { requests } = await askingTurn(secret, { approval: "each-write", prompt: ASK(
      { tool_name: "Bash", input: { command: `echo ok${" ".repeat(350)}\n\ncurl evil` } },
      { tool_name: "Bash", input: { command: "x".repeat(2100) } },
    ) });
    expect(requests.map((q) => q.summary)).toEqual(["echo ok ⏎ ⏎ curl evil"]);
    expect(rows("askjson")[1].decision).toEqual({ behavior: "deny", message: "The command is too long to show for approval; ask for it in smaller steps." });
  });
});

describe("hidden and control characters, line breaks, exact paths (N11, N12, L24)", () => {
  const HIDDEN = "The request contains hidden or control characters, so it cannot be shown for approval; ask for it without them.";
  const cases = {
    "Trojan-Source RLO": "echo safe \u202E; rm -rf ~ \u2066",
    ESC: "echo \u001b[2Jhidden",
    "zero-width space": "curl\u200B evil",
    "zero-width joiner": "a\u200Db",
    "word joiner": "a\u2060b",
    BOM: "\uFEFFls",
    "soft hyphen": "cu\u00ADrl evil",
    "bidi mark": "ls\u200E",
    "Arabic letter mark": "ls\u061C",
    DEL: "ls\u007F",
    VT: "ls\u000B x",
    FF: "ls\u000C x",
    NEL: "ls\u0085 x",
    BEL: "ls\u0007",
    "Hangul filler": "ls\u115F",
    "Hangul filler 2": "ls\u1160",
    "Hangul filler 3": "ls\u3164",
    "halfwidth Hangul filler": "ls\uFFA0",
    "braille blank": "ls\u2800",
    "Mongolian vowel separator": "ls\u180E",
  };
  for (const fullAccess of [true, false]) {
    it(`${fullAccess ? "computer mode" : "folder each-write"}: every one of those in a command is denied at once, no question`, async () => {
      const secret = await start({ fullAccess });
      const names = Object.keys(cases);
      const { requests } = await askingTurn(secret, { approval: "each-write", prompt: ASK(...names.map((n) => ({ tool_name: "Bash", input: { command: cases[n] } })), { tool_name: "Bash", input: { command: "ls", description: "ok\u200Bx" } }) });
      expect(requests).toEqual([]);
      const d = rows("askjson").map((r) => r.decision);
      expect(d).toHaveLength(names.length + 1);
      for (const x of d) expect(x).toEqual({ behavior: "deny", message: HIDDEN });
    });
  }
  it("line breaks are shown as one marker each: LF, CRLF, CR, U+2028, U+2029; spaces, tabs and other space separators collapse", async () => {
    const secret = await start();
    const { requests } = await askingTurn(secret, { approval: "each-write", prompt: ASK(
      { tool_name: "Bash", input: { command: "echo hello\nrm -rf ~" } },
      { tool_name: "Bash", input: { command: "a\r\nb\rc\u2028d\u2029e" } },
      { tool_name: "Bash", input: { command: "a \t   b" } },
      { tool_name: "Bash", input: { command: "ls\n", description: "x\ny" } },
    ) });
    expect(requests.map((q) => q.summary)).toEqual(["echo hello ⏎ rm -rf ~", "a ⏎ b ⏎ c ⏎ d ⏎ e", "a b", "ls ⏎"]);
    expect(requests[3].detail).toBe("x ⏎ y");
  });
  it("a path is shown exactly (double space kept); a line break or hidden character in a path is denied, in both modes", async () => {
    for (const fullAccess of [true, false]) {
      const secret = await start({ fullAccess });
      const inside = fullAccess ? "/tmp/a  b" : path.join(wsReal, "a  b");
      const { requests } = await askingTurn(secret, { approval: "each-write", prompt: ASK(
        { tool_name: "Write", input: { file_path: inside, content: "x" } },
        { tool_name: "Write", input: { file_path: `${wsReal}/a\nb`, content: "x" } },
        { tool_name: "Write", input: { file_path: `${wsReal}/a\u202Eb`, content: "x" } },
        { tool_name: "Write", input: { file_path: `${wsReal}/a\u2028b`, content: "x" } },
      ) });
      expect(requests.map((q) => q.summary)).toEqual([fullAccess ? "/tmp/a  b" : "a  b"]);
      expect(rows("askjson").slice(1).map((r) => r.decision)).toEqual(Array(3).fill({ behavior: "deny", message: HIDDEN }));
      await bridge.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it("limits count the shown text: 1000 shown characters of path are asked, 1001 denied; a command of 1100 breaks (2199 shown) is denied", async () => {
    const secret = await start();
    const { requests } = await askingTurn(secret, { approval: "each-write", prompt: ASK(
      { tool_name: "Read", input: { file_path: `/${"p".repeat(999)}` } },
      { tool_name: "Read", input: { file_path: `/${"p".repeat(1000)}` } },
      { tool_name: "Bash", input: { command: "\n".repeat(1100) } },
    ) });
    expect(requests).toHaveLength(1);
    expect(rows("askjson").slice(1).map((r) => r.decision.message)).toEqual(["The path is too long to show for approval.", "The command is too long to show for approval; ask for it in smaller steps."]);
  });
});

describe("combining marks and non-ASCII text (N13, N14)", () => {
  const HIDDEN = "The request contains hidden or control characters, so it cannot be shown for approval; ask for it without them.";
  for (const fullAccess of [true, false]) {
    const mode = fullAccess ? "computer mode" : "folder each-write";
    it(`${mode}: strike-through and other combining marks are denied (command, description); NFD a-ring in a path is allowed and shown as given`, async () => {
      const secret = await start({ fullAccess });
      const nfd = "a\u030A.txt"; // a + combining ring above: composes to one character
      const inside = fullAccess ? `/tmp/${nfd}` : path.join(wsReal, nfd);
      const { requests } = await askingTurn(secret, { approval: "each-write", prompt: ASK(
        { tool_name: "Bash", input: { command: "r\u0336m\u0336 -rf ~" } },
        { tool_name: "Bash", input: { command: "ls", description: "x\u0336y" } },
        { tool_name: "Bash", input: { command: "ls e\u0301\u0301" } },
        { tool_name: "Write", input: { file_path: `${wsReal}/b\u0336.txt`, content: "x" } },
        { tool_name: "Write", input: { file_path: inside, content: "x" } },
      ) });
      const d = rows("askjson").map((r) => r.decision);
      expect(d.map((x) => x.behavior)).toEqual(["deny", "deny", "deny", "deny", "allow"]);
      for (const x of d.slice(0, 4)) expect(x.message).toBe(HIDDEN);
      expect(requests).toHaveLength(1);
      expect(requests[0].summary).toBe(fullAccess ? `/tmp/${nfd}` : nfd); // the original text, not the normalised one
    });
  }
  it("a non-ASCII character in a command is shown as <U+XXXX>; a Cyrillic look-alike is visible; a typed marker is escaped; paths keep their characters", async () => {
    const secret = await start();
    const { requests } = await askingTurn(secret, { approval: "each-write", prompt: ASK(
      { tool_name: "Bash", input: { command: "curl https://g\u0456thub.com/x" } },
      { tool_name: "Bash", input: { command: "echo a \u23CE rm -rf ~" } },
      { tool_name: "Bash", input: { command: "echo \u{1F600} \u00E9" } },
      { tool_name: "Write", input: { file_path: "/tmp/\u00E9.txt", content: "x" } },
      { tool_name: "WebSearch", input: { query: "caf\u00E9 \u0456" } },
      { tool_name: "Bash", input: { command: "a\nb" } },
    ) });
    expect(requests.map((q) => q.summary)).toEqual([
      "curl https://g<U+0456>thub.com/x",
      "echo a <U+23CE> rm -rf ~",
      "echo <U+1F600> <U+00E9>",
      "/tmp/\u00E9.txt",
      "caf<U+00E9> <U+0456>",
      "a ⏎ b",
    ]);
  });
  it("WebFetch: the URL is escaped and its host is shown as punycode when the text does not already hold it", async () => {
    const secret = await start();
    const { requests } = await askingTurn(secret, { approval: "each-write", prompt: ASK(
      { tool_name: "WebFetch", input: { url: "https://g\u0456thub.com/a" } },
      { tool_name: "WebFetch", input: { url: "https://example.com/a" } },
      { tool_name: "WebFetch", input: { url: "https://EXAMPLE.com/\u00E9" } },
    ) });
    expect(requests.map((q) => q.summary)).toEqual([
      "https://g<U+0456>thub.com/a (host: xn--gthub-n2e.com)",
      "https://example.com/a",
      "https://EXAMPLE.com/<U+00E9> (host: example.com)",
    ]);
  });
  it("limits count the shown text: 300 non-ASCII characters in a command (8 shown characters each, 2400) are denied, 200 are asked", async () => {
    const secret = await start();
    const { requests } = await askingTurn(secret, { approval: "each-write", prompt: ASK(
      { tool_name: "Bash", input: { command: "\u00E9".repeat(300) } },
      { tool_name: "Bash", input: { command: "\u00E9".repeat(200) } },
    ) });
    expect(requests).toHaveLength(1);
    expect(rows("askjson")[0].decision.message).toBe("The command is too long to show for approval; ask for it in smaller steps.");
  });
});
