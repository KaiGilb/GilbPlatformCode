// @vitest-environment node
/**
 * Either engine can start the bridge (Chat.CodexConnect.EitherEngine).
 * The Codex stand-in is fake-codex.mjs, copied from the app-server measurement on Kai's Mac,
 * Codex CLI 0.167.2, 2026-11-24, probe folder /Users/kaigilb/Developer/_tmp/codex-probe/runs/2026-11-24T222311.994Z.
 * Account shapes (chatgpt, apiKey, none) and the unknown-flag stderr line are that measurement.
 * A version off the 0.167 line is this bridge's own rule, not a second measurement.
 */
import { afterEach, describe, expect, test, vi } from "vitest";

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CODEX_NOT_INSTALLED,
  DEFAULT_LABEL,
  checkCodexReady,
  createBridge,
  decideStart,
  parseCli,
  serviceInstall,
} from "../bridge/bridge.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_CLAUDE = path.join(HERE, "fake-claude.mjs");
const FAKE_CODEX = path.join(HERE, "fake-codex.mjs");
const APP = "http://localhost:5197";
const NOT_FOUND = "Claude Code (`claude`) was not found. Install it and run `claude auth login`, then run --install again.";
const CLAUDE_BILLING = "Billing: Claude subscription (checked at every start; never an API key)";
const CODEX_BILLING = "Billing: ChatGPT subscription, plan plus";
const APIKEY = "Codex is signed in with an API key. This bridge runs Codex only on your ChatGPT sign-in. Run `codex logout`, then `codex login` and choose Sign in with ChatGPT.";
const NONE = "Codex is not signed in. Run `codex login` and choose Sign in with ChatGPT.";
const TOO_OLD = "Your Codex is too old for this bridge. Update it with `npm install -g @openai/codex`.";
const UNKNOWN_HELLO = "This bridge does not support your Codex version yet. Update the bridge.";
const CLAUDE_REASON = "You are logged in with an API key. Remove it and sign in with a subscription.";
const CODEX_REASON = "Codex is not signed in. Run `codex login` and choose Sign in with ChatGPT.";

const HOME_W = "C:\\Users\\Anna Maria";
const NODE_W = "C:\\Program Files\\nodejs\\node.exe";
const FILE_W = "C:\\Users\\Anna Maria\\.gilb-claude-code-bridge.mjs";
const CLAUDE_W = "C:\\Users\\Anna Maria\\.local\\bin\\claude.exe";
const CODEX_W = "C:\\Tools\\codex.exe";
const LOCAL_W = `${HOME_W}\\AppData\\Local\\gilb-claude-code-bridge`;
const STATE_W = `${HOME_W}\\.gilb-claude-code-bridge`;
const WSCRIPT = "C:\\Windows\\System32\\wscript.exe";
const REG = "C:\\Windows\\System32\\reg.exe";
const NOW = 1_800_000_000_000;

let dirs = [];

afterEach(async () => {
  for (const d of dirs) await removeTestDir(d);
  dirs = [];
});

function keep(dir) {
  dirs.push(dir);
  return dir;
}

const claudeOk = { ok: true, info: { email: "a@b.c", subscriptionType: "max" } };
const claudeNo = { ok: false, reason: CLAUDE_REASON };
const codexOk = { ok: true, info: { version: "0.167.2", plan: "plus" } };
const codexMissing = { ok: false, installed: false, reason: CODEX_NOT_INSTALLED };
const codexBad = { ok: false, installed: true, reason: CODEX_REASON };

describe("decideStart", () => {
  test("starts when both engines are ready and names both billing lines", () => {
    // Spec: Chat.CodexConnect.EitherEngine — either engine is enough, and each ready engine has a billing line.
    const out = decideStart(claudeOk, codexOk);
    expect(out).toEqual({
      start: true,
      claudeReady: true,
      codexReady: true,
      billingLines: ["Claude subscription (a@b.c), plan max", "ChatGPT subscription, plan plus"],
    });
  });

  test("starts when only Claude is ready and Codex is installed but not ready", () => {
    // Spec: Chat.CodexConnect.EitherEngine — one ready engine starts the bridge.
    const out = decideStart(claudeOk, codexBad);
    expect(out).toEqual({
      start: true,
      claudeReady: true,
      codexReady: false,
      billingLines: ["Claude subscription (a@b.c), plan max"],
    });
  });

  test("starts when only Claude is ready and Codex is not installed", () => {
    // Spec: Chat.CodexConnect.EitherEngine — a missing Codex does not block a ready Claude Code.
    const out = decideStart(claudeOk, codexMissing);
    expect(out).toEqual({
      start: true,
      claudeReady: true,
      codexReady: false,
      billingLines: ["Claude subscription (a@b.c), plan max"],
    });
  });

  test("starts when only Codex is ready, and the billing line has no e-mail address", () => {
    // Spec: Chat.CodexConnect.EitherEngine — Codex billing is the plan, never an e-mail address.
    const out = decideStart(claudeNo, codexOk);
    expect(out).toEqual({
      start: true,
      claudeReady: false,
      codexReady: true,
      billingLines: ["ChatGPT subscription, plan plus"],
    });
    expect(JSON.stringify(out)).not.toMatch(/@|email/i);
  });

  test("a ready Codex with no plan is billed as unknown", () => {
    // Spec: Chat.CodexConnect.EitherEngine — the plan text is present even when Codex names none.
    const out = decideStart({ ok: true, info: { subscriptionType: "max" } }, { ok: true, info: { version: "0.167.2", plan: null } });
    expect(out).toMatchObject({ start: true, billingLines: ["Claude subscription, plan max", "ChatGPT subscription, plan unknown"] });
  });

  test("when neither is ready and Codex is not installed, the message is the Claude reason alone", () => {
    // Spec: Chat.CodexConnect.EitherEngine — no Codex on the computer keeps today's Claude sentence, byte for byte.
    const out = decideStart(claudeNo, codexMissing);
    expect(out).toEqual({ start: false, message: CLAUDE_REASON });
  });

  test("when neither is ready and Codex is installed, the message names both reasons", () => {
    // Spec: Chat.CodexConnect.EitherEngine — both reasons, Claude first, then Codex.
    const out = decideStart(claudeNo, codexBad);
    expect(out).toEqual({ start: false, message: `Claude Code: ${CLAUDE_REASON}\nCodex: ${CODEX_REASON}` });
  });
});

describe("checkCodexReady", () => {
  async function probe(env, bin = FAKE_CODEX) {
    const dir = keep(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-either-codex-")));
    const log = path.join(dir, "codex.log");
    const result = await checkCodexReady(bin, {
      PATH: process.env.PATH,
      FAKE_CODEX_LOG: log,
      CODEX_HOME: path.join(dir, "codex-home"),
      ...env,
    }, { codexKeepEnv: ["FAKE_CODEX_LOG", "FAKE_CODEX_ACCOUNT", "FAKE_CODEX_VERSION", "FAKE_CODEX_UNKNOWN_FLAG"] });
    return { dir, log, result };
  }

  test("a ChatGPT sign-in is ready, with the version and the plan, and no e-mail address", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — the start check returns version and plan, never the account e-mail.
    const { result } = await probe();
    expect(result).toEqual({ ok: true, info: { version: "0.167.2", plan: "plus" } });
    expect(JSON.stringify(result)).not.toMatch(/@|email/i);
  });

  test("an API-key sign-in is not ready", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — Codex runs only on a ChatGPT sign-in.
    const { result } = await probe({ FAKE_CODEX_ACCOUNT: "apiKey" });
    expect(result).toEqual({ ok: false, installed: true, reason: APIKEY });
  });

  test("no sign-in is not ready", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — a signed-out Codex is installed and not ready.
    const { result } = await probe({ FAKE_CODEX_ACCOUNT: "none" });
    expect(result).toEqual({ ok: false, installed: true, reason: NONE });
  });

  test("a version older than this bridge knows is not ready", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — the same too-old sentence hello uses.
    const { result } = await probe({ FAKE_CODEX_VERSION: "0.100.0" });
    expect(result).toEqual({ ok: false, installed: true, reason: TOO_OLD });
  });

  test("an unknown-flag exit is not ready, and the binary counts as installed", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — the probe's unknown-flag sentence, shared with hello.
    const { result } = await probe({ FAKE_CODEX_UNKNOWN_FLAG: "1" });
    expect(result).toEqual({ ok: false, installed: true, reason: UNKNOWN_HELLO });
  });

  test("a missing binary is not installed and nothing is started", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — no file, no process, the not-installed sentence.
    const dir = keep(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-either-missing-")));
    const log = path.join(dir, "codex.log");
    const missing = path.join(dir, "no-such-codex");
    const result = await checkCodexReady(missing, { FAKE_CODEX_LOG: log, CODEX_HOME: path.join(dir, "codex-home") });
    expect(result).toEqual({ ok: false, installed: false, reason: CODEX_NOT_INSTALLED });
    expect(fs.existsSync(log)).toBe(false);
  });
});

describe("claudeNotReady", () => {
  const REASON = "Claude Code is not signed in. Run claude auth login.";
  let bridge;
  let base;
  let secret;
  let claudeLog;

  async function start() {
    const dir = keep(fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-either-"))));
    claudeLog = path.join(dir, "claude.log");
    const codexLog = path.join(dir, "codex.log");
    bridge = createBridge({
      port: 0,
      claudeBin: FAKE_CLAUDE,
      codexBin: FAKE_CODEX,
      claudeNotReady: REASON,
      platformOpts: { codexKeepEnv: ["FAKE_CODEX_LOG"] },
      allowedOrigins: [APP],
      workDir: path.join(dir, "work"),
      home: dir,
      env: {
        PATH: process.env.PATH,
        FAKE_CLAUDE_LOG: claudeLog,
        FAKE_CODEX_LOG: codexLog,
        CODEX_HOME: path.join(dir, "codex-home"),
      },
    });
    await bridge.start();
    base = `http://127.0.0.1:${bridge.port}`;
    const res = await fetch(`${base}/v1/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: bridge.pairingCode }),
    });
    secret = (await res.json()).secret;
  }

  afterEach(async () => {
    await bridge?.close();
    bridge = undefined;
  });

  async function turn(extra) {
    const res = await fetch(`${base}/v1/turn`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bridge-secret": secret },
      body: JSON.stringify({ system: "You are the agent.", prompt: "hello", ...extra }),
    });
    const events = [];
    if (res.status === 200) {
      for (const blk of (await res.text()).split("\n\n")) {
        const e = /event: (.*)/.exec(blk)?.[1];
        const d = /data: (.*)/.exec(blk)?.[1];
        if (e && d) events.push([e, JSON.parse(d)]);
      }
    }
    return { status: res.status, events, error: events.find((e) => e[0] === "error")?.[1], message: events.find((e) => e[0] === "message")?.[1] };
  }

  function claudeBoots() {
    if (!claudeLog || !fs.existsSync(claudeLog)) return [];
    return fs.readFileSync(claudeLog, "utf8").trim().split("\n").filter(Boolean).flatMap((l) => {
      try {
        const row = JSON.parse(l);
        return row.event === "boot" ? [row] : [];
      } catch {
        return [];
      }
    });
  }

  test("hello says Claude is not ready, a Claude turn ends with that text, and the stand-in never starts", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — a not-ready Claude is reported, and no claude child is started.
    await start();
    const hello = await (await fetch(`${base}/v1/hello`, { headers: { "x-bridge-secret": secret } })).json();
    expect(hello.engines[0]).toMatchObject({ id: "claude", ready: false, reason: REASON });
    const claude = await turn({ engine: "claude" });
    expect(claude.status).toBe(200);
    expect(claude.events.map((e) => e[0])).toEqual(expect.arrayContaining(["start", "error"]));
    expect(claude.error).toEqual({ message: REASON });
    expect(claudeBoots()).toEqual([]);
  });

  test("a Codex turn still runs while Claude is not ready", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — the other engine is unchanged.
    await start();
    const codex = await turn({ engine: "codex" });
    expect(codex.status).toBe(200);
    expect(codex.message?.content).toBe("hello");
    expect(claudeBoots()).toEqual([]);
  });
});

describe("serviceInstall either engine", () => {
  function darwinDeps(home, extra = {}) {
    return {
      launchctl: async () => ({ code: 0, out: "" }),
      uid: 501,
      home,
      nodePath: "/opt/node/bin/node",
      file: "/Users/p/.gilb-claude-code-bridge.mjs",
      env: { PATH: "/usr/bin" },
      platform: "darwin",
      sleep: async () => {},
      check: async () => ({ ok: true, info: { subscriptionType: "max" } }),
      ...extra,
    };
  }

  function plistOf(home) {
    return fs.readFileSync(path.join(home, "Library", "LaunchAgents", `${DEFAULT_LABEL}.plist`), "utf8");
  }

  /** A pretend Windows disk. wscript writes the supervisor record install waits for, so the wait does not run out. */
  function winWorld(patch = {}) {
    const files = new Map();
    const reg = new Map();
    const live = new Set();
    const ports = new Set();
    const sups = new Map();
    const lower = (p) => p.toLowerCase();
    const sfs = {
      mkdirp: () => {},
      write: (p, d) => void files.set(lower(p), d),
      read: (p) => {
        if (!files.has(lower(p))) throw new Error("ENOENT");
        return files.get(lower(p));
      },
      exists: (p) => files.has(lower(p)),
      rm: (p) => void files.delete(lower(p)),
      list: (p) => [...files.keys()].filter((k) => k.startsWith(`${lower(p)}\\`) && !k.slice(p.length + 1).includes("\\")).map((k) => k.slice(p.length + 1)),
    };
    const exec = async (file, args) => {
      if (file === REG && args[0] === "add") {
        reg.set(args[3], args[args.indexOf("/d") + 1]);
        return { code: 0, out: "" };
      }
      if (file === WSCRIPT) {
        const launcher = args[args.length - 1];
        const text = Buffer.from(files.get(lower(launcher))).subarray(2).toString("utf16le").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        const port = Number(/--port (\d+)/.exec(text)[1]);
        const st = /--state-dir "([^"]+)"/.exec(text)?.[1] ?? STATE_W;
        live.add(4242);
        live.add(4343);
        ports.add(port);
        sups.set(lower(st), { port });
        files.set(lower(`${st}\\supervisor.json`), JSON.stringify({ pid: 4242, instance: "inst-1", label: DEFAULT_LABEL, at: "t", beat: NOW, child: 4343 }));
        files.set(lower(`${st}\\status.json`), JSON.stringify({ ok: true, port, at: "t", billing: "Claude subscription, plan max", pid: 4343 }));
        return { code: 0, out: "" };
      }
      return { code: 0, out: "" };
    };
    const sleep = async () => {
      for (const [st, r] of sups) {
        if (files.has(`${st}\\supervisor.stop`)) {
          live.delete(4242);
          live.delete(4343);
          ports.delete(r.port);
        }
      }
    };
    const deps = {
      launchctl: async () => { throw new Error("launchctl must not run on Windows"); },
      uid: 0,
      now: () => NOW,
      home: HOME_W,
      nodePath: NODE_W,
      file: FILE_W,
      env: { SystemRoot: "C:\\Windows", LOCALAPPDATA: `${HOME_W}\\AppData\\Local`, PATH: "C:\\Windows" },
      platform: "win32",
      sfs,
      exec,
      alive: (pid) => live.has(pid),
      sleep,
      hello: async (port) => (ports.has(port) ? { bridge: "gilb-claude-code-bridge", build: "0.4.0" } : null),
      files: { exists: (p) => p.toLowerCase() === CLAUDE_W.toLowerCase(), read: () => "" },
      check: async () => ({ ok: true, info: { subscriptionType: "max" } }),
    };
    if (patch.env) deps.env = { ...deps.env, ...patch.env };
    const { env: _env, ...rest } = patch;
    Object.assign(deps, rest);
    return { files, deps };
  }

  function winLauncher(w) {
    const raw = w.files.get(`${LOCAL_W}\\start-${DEFAULT_LABEL}.js`.toLowerCase());
    return Buffer.from(raw).subarray(2).toString("utf16le");
  }

  const codexReady = {
    checkCodex: async () => ({ ok: true, info: { version: "0.167.2", plan: "plus" } }),
    resolveCodex: () => CODEX_W,
  };
  const codexAbsent = {
    checkCodex: async () => ({ ok: false, installed: false, reason: CODEX_NOT_INSTALLED }),
    resolveCodex: () => null,
  };
  const codexNotReady = {
    checkCodex: async () => ({ ok: false, installed: true, reason: CODEX_REASON }),
    resolveCodex: () => CODEX_W,
  };

  test("darwin: Claude ready and Codex ready records both paths and both billing lines", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — a passing Claude install also records Codex and its billing line.
    const home = keep(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-either-svc-")));
    const out = await serviceInstall(parseCli(["--install", "--claude", FAKE_CLAUDE]), darwinDeps(home, { ...codexReady, resolveCodex: () => FAKE_CODEX }));
    expect(out.ok).toBe(true);
    const plist = plistOf(home);
    expect(plist).toContain(`<string>${FAKE_CLAUDE}</string>`);
    expect(plist).toContain("<string>--codex</string>");
    expect(plist).toContain(`<string>${FAKE_CODEX}</string>`);
    expect(out.message).toContain(CLAUDE_BILLING);
    expect(out.message).toContain(CODEX_BILLING);
  });

  test("darwin: Claude missing and Codex ready installs, records Codex, and names Claude in one sentence", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — Codex alone is enough to install, and --claude is recorded only when Claude was found.
    const home = keep(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-either-svc-")));
    const out = await serviceInstall(parseCli(["--install", "--claude", "no-such-claude-bin"]), darwinDeps(home, { ...codexReady, resolveCodex: () => FAKE_CODEX }));
    expect(out.ok).toBe(true);
    const plist = plistOf(home);
    expect(plist).toContain("<string>--codex</string>");
    expect(plist).toContain(`<string>${FAKE_CODEX}</string>`);
    expect(plist).not.toContain("--claude");
    expect(out.message).toContain(CODEX_BILLING);
    expect(out.message).not.toContain(CLAUDE_BILLING);
    expect(out.message).toContain("Claude Code is not ready on this computer: Claude Code (`claude`) was not found.");
  });

  test("darwin: a Claude check that fails still records --claude when the binary was found and Codex is ready", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — --claude is kept when Claude resolved, and the install line uses the first sentence.
    const home = keep(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-either-svc-")));
    const out = await serviceInstall(parseCli(["--install", "--claude", FAKE_CLAUDE]), darwinDeps(home, {
      check: async () => ({ ok: false, reason: CLAUDE_REASON }),
      ...codexReady,
      resolveCodex: () => FAKE_CODEX,
    }));
    expect(out.ok).toBe(true);
    const plist = plistOf(home);
    expect(plist).toContain(`<string>${FAKE_CLAUDE}</string>`);
    expect(plist).toContain("<string>--codex</string>");
    expect(out.message).toContain("Claude Code is not ready on this computer: You are logged in with an API key.");
    expect(out.message).toContain(CODEX_BILLING);
    expect(out.message).not.toContain(CLAUDE_BILLING);
  });

  describe("firstSentence", () => {
    async function installLine(reason) {
      const home = keep(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-either-svc-")));
      const out = await serviceInstall(parseCli(["--install", "--claude", FAKE_CLAUDE]), darwinDeps(home, {
        check: async () => ({ ok: false, reason }),
        ...codexReady,
        resolveCodex: () => FAKE_CODEX,
      }));
      return out.message.split("\n").find((l) => l.includes("Claude Code is not ready"));
    }

    test("keeps a dotted path and stops at the sentence end", async () => {
      // Spec: tester round 2 N3 — the first sentence ends at . ? or ! followed by white space or the end of the text, never at a dot inside a path, a file name or a version number
      // arrange
      const reason = "Claude Code was found as /Users/a.b/bin/claude.cmd, which the bridge cannot start safely. Install it again.";
      // act
      const line = await installLine(reason);
      // assert
      expect(line).toContain("/Users/a.b/bin/claude.cmd, which the bridge cannot start safely");
      expect(line).not.toContain("Install it again");
      expect(line).toBe("  Claude Code is not ready on this computer: Claude Code was found as /Users/a.b/bin/claude.cmd, which the bridge cannot start safely.");
    });

    test("keeps the dots in a version number and keeps the sentence's end mark", async () => {
      // Spec: tester round 2 N3 — the first sentence ends at . ? or ! followed by white space or the end of the text, never at a dot inside a path, a file name or a version number
      // arrange
      const reason = "Codex 0.4.0 is too old. Update it.";
      // act
      const line = await installLine(reason);
      // assert
      expect(line).toBe("  Claude Code is not ready on this computer: Codex 0.4.0 is too old.");
    });

    test("ends a sentence at a question mark followed by white space", async () => {
      // Spec: tester round 2 N3 — the first sentence ends at . ? or ! followed by white space or the end of the text, never at a dot inside a path, a file name or a version number
      // arrange
      const reason = "Is the binary there? Install it again.";
      // act
      const line = await installLine(reason);
      // assert
      expect(line).toBe("  Claude Code is not ready on this computer: Is the binary there?");
    });

    test("ends a sentence at an exclamation mark followed by white space", async () => {
      // Spec: tester round 2 N3 — the first sentence ends at . ? or ! followed by white space or the end of the text, never at a dot inside a path, a file name or a version number
      // arrange
      const reason = "The start failed! Try again.";
      // act
      const line = await installLine(reason);
      // assert
      expect(line).toBe("  Claude Code is not ready on this computer: The start failed!");
    });

    test("ends a sentence at a question mark or an exclamation mark at the end of the text", async () => {
      // Spec: tester round 2 N3 — the first sentence ends at . ? or ! followed by white space or the end of the text, never at a dot inside a path, a file name or a version number
      // arrange
      const question = "Is the binary there?";
      const exclaim = "The start failed!";
      // act
      const questionLine = await installLine(question);
      const exclaimLine = await installLine(exclaim);
      // assert
      expect(questionLine).toBe("  Claude Code is not ready on this computer: Is the binary there?");
      expect(exclaimLine).toBe("  Claude Code is not ready on this computer: The start failed!");
    });

    test("returns a reason with no sentence end whole", async () => {
      // Spec: tester round 2 N3 — the first sentence ends at . ? or ! followed by white space or the end of the text, never at a dot inside a path, a file name or a version number
      // arrange
      const reason = "Claude Code was found as /Users/a.b/bin/claude 0.4.0";
      // act
      const line = await installLine(reason);
      // assert
      expect(line).toBe("  Claude Code is not ready on this computer: Claude Code was found as /Users/a.b/bin/claude 0.4.0");
    });
  });

  test("darwin: Claude missing and Codex not installed is today's sentence, byte for byte", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — no Codex leaves the not-found refusal unchanged.
    const home = keep(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-either-svc-")));
    const out = await serviceInstall(parseCli(["--install", "--claude", "no-such-claude-bin"]), darwinDeps(home, codexAbsent));
    expect(out).toEqual({ ok: false, message: NOT_FOUND });
  });

  test("darwin: a failed Claude check and no Codex is today's Not installed line, byte for byte", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — the login refusal keeps its prefix when Codex is not installed.
    const home = keep(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-either-svc-")));
    const out = await serviceInstall(parseCli(["--install", "--claude", FAKE_CLAUDE]), darwinDeps(home, {
      check: async () => ({ ok: false, reason: CLAUDE_REASON }),
      ...codexAbsent,
    }));
    expect(out).toEqual({ ok: false, message: `Not installed.\n${CLAUDE_REASON}` });
  });

  test("darwin: neither engine ready names both reasons", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — installed Codex that is not ready is named next to Claude.
    const home = keep(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-either-svc-")));
    const out = await serviceInstall(parseCli(["--install", "--claude", FAKE_CLAUDE]), darwinDeps(home, {
      check: async () => ({ ok: false, reason: CLAUDE_REASON }),
      ...codexNotReady,
    }));
    expect(out).toEqual({ ok: false, message: `Not installed.\nClaude Code: ${CLAUDE_REASON}\nCodex: ${CODEX_REASON}` });
    expect(fs.existsSync(path.join(home, "Library", "LaunchAgents"))).toBe(false);
  });

  test("darwin: a Claude-ready install records a resolved Codex even when its check fails, with no ChatGPT billing line", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — finding the binary and passing the check are separate.
    const home = keep(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-either-svc-")));
    const out = await serviceInstall(parseCli(["--install", "--claude", FAKE_CLAUDE]), darwinDeps(home, {
      ...codexNotReady,
      resolveCodex: () => FAKE_CODEX,
    }));
    expect(out.ok).toBe(true);
    expect(plistOf(home)).toContain(`<string>${FAKE_CODEX}</string>`);
    expect(out.message).toContain(CLAUDE_BILLING);
    expect(out.message).not.toContain("ChatGPT subscription");
  });

  test("darwin: injecting only the Claude check never runs a codex marker on PATH", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — a stubbed Claude check must not look up or start Codex.
    const home = keep(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-either-svc-")));
    const bin = path.join(home, "bin");
    const stamp = path.join(home, "codex-stamp");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "codex"), `#!/bin/sh\necho ran >> '${stamp}'\n`, { mode: 0o755 });
    fs.chmodSync(path.join(bin, "codex"), 0o755);
    const out = await serviceInstall(parseCli(["--install", "--claude", FAKE_CLAUDE]), darwinDeps(home, {
      check: async () => ({ ok: true, info: { subscriptionType: "max" } }),
      env: { PATH: bin },
    }));
    expect(out.ok).toBe(true);
    expect(fs.existsSync(stamp)).toBe(false);
    const plist = plistOf(home);
    expect(plist).not.toContain("--codex");
    expect(plist).not.toContain(bin);
  });

  test("win32: Claude ready and Codex ready records both paths and both billing lines", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — the Windows launcher records both engines.
    const w = winWorld(codexReady);
    const out = await serviceInstall(parseCli(["--install", "--claude", CLAUDE_W]), w.deps);
    expect(out.ok).toBe(true);
    const js = winLauncher(w);
    expect(js).toContain("--claude");
    expect(js).toContain(JSON.stringify(CLAUDE_W).slice(1, -1));
    expect(js).toContain("--codex");
    expect(js).toContain(JSON.stringify(CODEX_W).slice(1, -1));
    expect(out.message).toContain(CLAUDE_BILLING);
    expect(out.message).toContain(CODEX_BILLING);
  });

  test("win32: Claude missing and Codex ready installs and records Codex only", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — no Claude binary, a ready Codex, and the one-sentence Claude line.
    const w = winWorld({ ...codexReady, files: { exists: () => false, read: () => "" } });
    const out = await serviceInstall(parseCli(["--install", "--claude", "no-such-claude-bin"]), w.deps);
    expect(out.ok).toBe(true);
    const js = winLauncher(w);
    expect(js).toContain("--codex");
    expect(js).toContain(JSON.stringify(CODEX_W).slice(1, -1));
    expect(js).not.toContain("--claude");
    expect(out.message).toContain(CODEX_BILLING);
    expect(out.message).not.toContain(CLAUDE_BILLING);
    expect(out.message).toContain("Claude Code is not ready on this computer: Claude Code (`claude`) was not found.");
  });

  test("win32: Claude missing and Codex not installed is today's sentence, byte for byte", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — the Windows not-found refusal matches the macOS one.
    const w = winWorld({ ...codexAbsent, files: { exists: () => false, read: () => "" } });
    const out = await serviceInstall(parseCli(["--install", "--claude", "no-such-claude-bin"]), w.deps);
    expect(out).toEqual({ ok: false, message: NOT_FOUND });
  });

  test("win32: neither engine ready names both reasons", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — the two-line refusal is the same on Windows.
    const w = winWorld({
      check: async () => ({ ok: false, reason: CLAUDE_REASON }),
      ...codexNotReady,
    });
    const out = await serviceInstall(parseCli(["--install", "--claude", CLAUDE_W]), w.deps);
    expect(out).toEqual({ ok: false, message: `Not installed.\nClaude Code: ${CLAUDE_REASON}\nCodex: ${CODEX_REASON}` });
  });

  test("win32: injecting only the Claude check never runs a codex marker on PATH", async () => {
    // Spec: Chat.CodexConnect.EitherEngine — the Windows install must not look up or start Codex when only the Claude check is stubbed.
    const home = keep(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-either-marker-")));
    const stamp = path.join(home, "codex-stamp");
    const script = `#!/bin/sh\necho ran >> '${stamp}'\n`;
    fs.writeFileSync(path.join(home, "codex"), script, { mode: 0o755 });
    fs.writeFileSync(path.join(home, "codex.exe"), script, { mode: 0o755 });
    fs.chmodSync(path.join(home, "codex"), 0o755);
    fs.chmodSync(path.join(home, "codex.exe"), 0o755);
    const w = winWorld({ env: { PATH: home } });
    const out = await serviceInstall(parseCli(["--install", "--claude", CLAUDE_W]), w.deps);
    expect(out.ok).toBe(true);
    expect(fs.existsSync(stamp)).toBe(false);
    expect(winLauncher(w)).not.toContain("--codex");
    expect(winLauncher(w)).not.toContain(home);
  });
});
