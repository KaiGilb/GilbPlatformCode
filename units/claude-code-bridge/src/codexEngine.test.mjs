// @vitest-environment node
/**
 * Codex chat turns on claude-code-bridge 0.4.0.
 * The stand-in copies the app-server measurement on Kai's Mac, Codex CLI 0.167.2, 2026-11-24,
 * probe run folder /Users/kaigilb/Developer/_tmp/codex-probe/runs/2026-11-24T222311.994Z.
 * Anything the live app-server was not measured to do is marked as a guess in fake-codex.mjs.
 */
import { afterEach, describe, expect, it, test, vi } from "vitest";

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createBridge,
  parseCli,
  childEnv,
  codexChildEnv,
  resolveCodexLaunch,
  resolveCodexBin,
  codexVersionOf,
  codexVersionAtLeast,
  CODEX_CHAT_FLAGS,
  CODEX_CHAT_CONFIG,
  CODEX_CHAT_SENTENCE,
  CODEX_BUILTIN_MCP_TOOLS,
  CODEX_EFFORTS,
  CODEX_SUPPORTED_LINE,
  CODEX_NOT_INSTALLED,
  CODEX_FIXED_LOOKUP_DIRS,
  codexBinOption,
} from "../bridge/bridge.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_CLAUDE = path.join(HERE, "fake-claude.mjs");
const FAKE_CODEX = path.join(HERE, "fake-codex.mjs");
const BUILT = path.join(HERE, "../bridge/bridge.mjs");
const APP = "http://localhost:5197";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
const GUARD = "The bridge stopped this turn: Codex tried to use a tool this chat does not allow.";
const LIMITS = "The bridge stopped this turn: Codex did not start with only this chat's tools.";
const APIKEY = "Codex is signed in with an API key. This bridge runs Codex only on your ChatGPT sign-in. Run `codex logout`, then `codex login` and choose Sign in with ChatGPT.";
const NONE = "Codex is not signed in. Run `codex login` and choose Sign in with ChatGPT.";
const OTHER = "Codex is signed in with another kind of account. This bridge runs Codex only on your ChatGPT sign-in.";
const GARBAGE = "The bridge stopped this turn: Codex did not confirm your ChatGPT sign-in. Send your message again. If this keeps happening, run `codex login`.";
const UNKNOWN_TURN = "Could not start Codex: this bridge does not know your Codex version yet. Update the bridge.";
const UNKNOWN_HELLO = "This bridge does not support your Codex version yet. Update the bridge.";
const TOO_OLD = "Your Codex is too old for this bridge. Update it with `npm install -g @openai/codex`.";

let dir;
let bridge;
let base;
let secret;
let codexLog;
let claudeLog;
let lines;
let open = [];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => {
  for (let i = 0; i < ms / 25; i++) {
    const v = await fn();
    if (v) return v;
    await delay(25);
  }
  throw new Error("timed out waiting");
};
const rows = () => {
  if (!codexLog || !fs.existsSync(codexLog)) return [];
  return fs.readFileSync(codexLog, "utf8").trim().split("\n").filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
};
const rpcs = (method) => rows().filter((r) => r.event === "rpc" && r.method === method);
const claudeRuns = () => {
  if (!claudeLog || !fs.existsSync(claudeLog)) return [];
  return fs.readFileSync(claudeLog, "utf8").trim().split("\n").filter(Boolean).flatMap((l) => {
    try {
      const row = JSON.parse(l);
      return row.event === "run" ? [row] : [];
    } catch { return []; }
  });
};

async function startBridge(extra = {}) {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-codex-")));
  codexLog = path.join(dir, "codex.log");
  claudeLog = path.join(dir, "claude.log");
  lines = [];
  fs.mkdirSync(path.join(dir, "codex-home"));
  bridge = createBridge({
    port: 0,
    claudeBin: FAKE_CLAUDE,
    codexBin: extra.codexBin ?? FAKE_CODEX,
    allowedOrigins: [APP],
    workDir: path.join(dir, "work"),
    home: dir,
    log: (l) => lines.push(String(l)),
    ...(extra.now ? { now: extra.now } : {}),
    ...(extra.opts ?? {}),
    env: {
      ...process.env,
      FAKE_CODEX_LOG: codexLog,
      FAKE_CLAUDE_LOG: claudeLog,
      CODEX_HOME: path.join(dir, "codex-home"),
      OPENAI_API_KEY: "sk-test",
      openai_api_key: "sk-lower",
      CODEX_API_KEY: "codex-key",
      CODEX_ACCESS_TOKEN: "codex-token",
      AZURE_OPENAI_API_KEY: "azure-key",
      ...(extra.env ?? {}),
    },
  });
  await bridge.start();
  base = `http://127.0.0.1:${bridge.port}`;
  const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: bridge.pairingCode }) });
  secret = (await res.json()).secret;
}

afterEach(async () => {
  for (const t of open) t.close();
  open = [];
  await bridge?.close();
  bridge = undefined;
  if (dir) await removeTestDir(dir);
  dir = undefined;
});

async function turn(sec, extra) {
  const res = await fetch(`${base}/v1/turn`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-bridge-secret": sec },
    body: JSON.stringify({ system: "You are the agent.", prompt: "hello", ...extra }),
  });
  if (res.status !== 200) return { status: res.status, json: await res.json().catch(() => null), events: [] };
  const events = [];
  for (const blk of (await res.text()).split("\n\n")) {
    const e = /event: (.*)/.exec(blk)?.[1];
    const d = /data: (.*)/.exec(blk)?.[1];
    if (e && d) events.push([e, JSON.parse(d)]);
  }
  return { status: 200, events, message: events.find((e) => e[0] === "message")?.[1], error: events.find((e) => e[0] === "error")?.[1] };
}

/** A turn left open, so a cancel or a hand-off can use it. Answers a tool call when `answer` is set. */
async function openTurn(sec, extra, answer) {
  const ctl = new AbortController();
  const res = await fetch(`${base}/v1/turn`, {
    method: "POST",
    signal: ctl.signal,
    headers: { "content-type": "application/json", "x-bridge-secret": sec },
    body: JSON.stringify({ system: "You are the agent.", prompt: "hello", ...extra }),
  });
  const t = { status: res.status, events: [], turnId: "", json: null, close: () => ctl.abort() };
  open.push(t);
  if (res.status !== 200) {
    t.json = await res.json().catch(() => null);
    return t;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  t.done = (async () => {
    let buf = "";
    try {
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
          if (!ev || !data) continue;
          const parsed = JSON.parse(data);
          t.events.push([ev, parsed]);
          if (ev === "start") t.turnId = parsed.turnId;
          if (ev === "tool_request" && answer !== undefined) {
            await fetch(`${base}/v1/tool-result`, {
              method: "POST",
              headers: { "content-type": "application/json", "x-bridge-secret": sec },
              body: JSON.stringify({ turnId: t.turnId, id: parsed.id, result: answer, isError: false }),
            });
          }
        }
      }
    } catch { /* hung up */ }
  })();
  return t;
}

const api = async (sec, route, body = {}) => {
  const res = await fetch(`${base}${route}`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": sec }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const pairedHello = async () => (await fetch(`${base}/v1/hello`, { headers: { "x-bridge-secret": secret } })).json();
const waitCodex = async () => {
  const body = await until(async () => {
    const h = await pairedHello();
    const codex = h.engines?.find((e) => e.id === "codex");
    return codex && !codex.checking ? h : null;
  });
  return body.engines.find((e) => e.id === "codex");
};

describe("codexChildEnv", () => {
  it("drops secret-like names and does not add the Claude tool timeouts", () => {
    // Spec: Chat.CodexConnect round 3 R5 — the Codex child is the plain environment minus billing and secret-like names.
    // Proves: OpenAI names, TOKEN, SECRET, PASSWORD, PASSWD, CREDENTIAL, API_KEY and a trailing _KEY are removed.
    // Proves: CODEX_HOME, PATH, HOME, proxy names, SSH_AUTH_SOCK and locale names stay, and the Claude tool timeouts are not added.
    const out = codexChildEnv({
      PATH: "/bin",
      HOME: "/home/person",
      CODEX_HOME: "/home/person/.codex",
      LANG: "en_US.UTF-8",
      LC_ALL: "en_US.UTF-8",
      HTTP_PROXY: "http://proxy.example",
      http_proxy: "http://proxy.example",
      HTTPS_PROXY: "http://proxy.example",
      NO_PROXY: "localhost",
      ALL_PROXY: "http://proxy.example",
      SSH_AUTH_SOCK: "/tmp/ssh",
      OPENAI_API_KEY: "sk",
      openai_api_key: "sk2",
      OPENAI_BASE_URL: "https://example.invalid",
      CODEX_API_KEY: "k",
      CODEX_ACCESS_TOKEN: "t",
      AZURE_OPENAI_API_KEY: "a",
      codex_api_key: "k2",
      CODEX_CONNECTORS_TOKEN: "c",
      GITHUB_TOKEN: "g",
      AWS_SECRET_ACCESS_KEY: "s",
      OPENROUTER_API_KEY: "o",
      MY_PASSWORD: "p",
      DB_PASSWD: "p2",
      USER_CREDENTIAL: "c2",
      SOME_KEY: "k2",
      KEEP_ME: "yes",
      ANTHROPIC_API_KEY: "anth",
    });
    expect(out.CODEX_HOME).toBe("/home/person/.codex");
    expect(out.KEEP_ME).toBe("yes");
    expect(out.PATH).toBe("/bin");
    expect(out.HOME).toBe("/home/person");
    expect(out.LANG).toBe("en_US.UTF-8");
    expect(out.LC_ALL).toBe("en_US.UTF-8");
    expect(out.HTTP_PROXY).toBe("http://proxy.example");
    expect(out.http_proxy).toBe("http://proxy.example");
    expect(out.HTTPS_PROXY).toBe("http://proxy.example");
    expect(out.NO_PROXY).toBe("localhost");
    expect(out.ALL_PROXY).toBe("http://proxy.example");
    expect(out.SSH_AUTH_SOCK).toBe("/tmp/ssh");
    expect(out.MCP_TOOL_TIMEOUT).toBeUndefined();
    expect(out.CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT).toBeUndefined();
    const bad = Object.keys(out).filter((k) => /TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|API_KEY/i.test(k) || k.toUpperCase().endsWith("_KEY") || k.toUpperCase().startsWith("OPENAI_") || k.toUpperCase() === "ANTHROPIC_API_KEY");
    expect(bad).toEqual([]);
  });

  test("removes a secret-like name that starts with LC_ and keeps the known locale names", () => {
    // Spec: fix order R5 — every token, secret, password and key name is taken out of the Codex child's environment (tester round 2, N1)
    // arrange
    const input = {
      LC_API_KEY: "x",
      LC_GITHUB_TOKEN: "x",
      lc_secret: "x",
      LC_OPENAI_API_KEY: "x",
      LC_ALL: "C",
      LC_CTYPE: "UTF-8",
      LANG: "en_US.UTF-8",
      LANGUAGE: "en",
      PATH: "/bin",
    };
    // act
    const out = codexChildEnv(input);
    // assert
    expect(out).toEqual({
      LC_ALL: "C",
      LC_CTYPE: "UTF-8",
      LANG: "en_US.UTF-8",
      LANGUAGE: "en",
      PATH: "/bin",
    });
    // Measured at 7fa3ca50 against bridge/bridge.mjs: childEnv keeps these names and adds the two Claude timeouts.
    expect(childEnv(input)).toEqual({
      LC_API_KEY: "x",
      LC_GITHUB_TOKEN: "x",
      lc_secret: "x",
      LC_OPENAI_API_KEY: "x",
      LC_ALL: "C",
      LC_CTYPE: "UTF-8",
      LANG: "en_US.UTF-8",
      LANGUAGE: "en",
      PATH: "/bin",
      MCP_TOOL_TIMEOUT: "1860000",
      CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT: "1860000",
    });
  });
});

describe("Codex version and launch", () => {
  it("reads an exact three-number version and compares two versions", () => {
    // Spec: H-5 HK1-05 — the supported range is the one constant, and the compare helper still orders three-number versions
    expect(CODEX_SUPPORTED_LINE).toBe("0.167");
    expect(codexVersionOf("gilb-bridge/0.167.2 (fake)")).toBe("0.167.2");
    expect(codexVersionOf("no version here")).toBe(null);
    expect(codexVersionAtLeast("0.167.2", "0.167.0")).toBe(true);
    expect(codexVersionAtLeast("0.167.0", "0.167.0")).toBe(true);
    expect(codexVersionAtLeast("0.100.0", "0.167.0")).toBe(false);
  });

  it("starts a .mjs Codex with this node, and a missing binary has the install sentence", () => {
    // Proves: npm's codex script is started as node plus the file, and a name that is not there uses the not-installed sentence.
    const launch = resolveCodexLaunch(FAKE_CODEX, process.env, { home: os.homedir(), platform: "darwin" });
    expect(launch.ok).toBe(true);
    if (launch.ok) {
      expect(launch.command).toBe(process.execPath);
      expect(launch.prefix).toEqual([fs.realpathSync(FAKE_CODEX)]);
    }
    const missingHome = fs.mkdtempSync(path.join(os.tmpdir(), "codex-home-"));
    const missingFixed = [path.join(missingHome, "fixed-opt"), path.join(missingHome, "fixed-usr")];
    for (const folder of missingFixed) fs.mkdirSync(folder);
    const missing = resolveCodexLaunch("codex-not-a-real-binary-name-xyz", { PATH: "" }, { home: missingHome, platform: "darwin", fixedDirs: missingFixed });
    expect(missing).toEqual({ ok: false, reason: CODEX_NOT_INSTALLED });
  });
});

describe("the command line", () => {
  it("parses --codex like --claude, and --help names it", () => {
    // Proves: --codex PATH is a known flag, and a misspelled flag is still refused.
    // Proves: the option handed to createBridge is the name "codex" when the flag is absent.
    expect(parseCli(["--codex", "/opt/codex", "--claude", "claude"]).codex).toBe("/opt/codex");
    expect(codexBinOption(parseCli([])).codexBin).toBe("codex");
    expect(codexBinOption(parseCli(["--codex", "/opt/codex"])).codexBin).toBe("/opt/codex");
    const help = spawnSync(process.execPath, [BUILT, "--help"], { encoding: "utf8", timeout: 15000 });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("--codex");
    const known = spawnSync(process.execPath, [BUILT, "--codex", "/no/such", "--allow-origin", "*", "--claude", FAKE_CLAUDE, "--port", "0"], { encoding: "utf8", timeout: 15000 });
    expect(String(known.stderr)).not.toMatch(/Unknown option/);
    expect(String(known.stderr)).toMatch(/not an origin/);
  });
});

describe("the chat flag list", () => {
  it("disables the twenty measured names and leaves code_mode_host on", () => {
    // Proves: CODEX_CHAT_FLAGS is --disable before each of the twenty names, in the measured order, and code_mode_host is not one of them.
    const names = [];
    for (let i = 0; i < CODEX_CHAT_FLAGS.length; i += 2) {
      expect(CODEX_CHAT_FLAGS[i]).toBe("--disable");
      names.push(CODEX_CHAT_FLAGS[i + 1]);
    }
    expect(names).toEqual([
      "apps", "shell_tool", "plugins", "unified_exec", "unified_exec_tty", "view_image", "image_generation",
      "multi_agent", "goals", "sleep_tool", "tool_suggest", "skill_search", "hooks", "memories",
      "browser_use", "browser_use_external", "computer_use", "in_app_browser", "workspace_dependencies", "worktrees",
    ]);
    expect(names).not.toContain("code_mode_host");
    expect(CODEX_BUILTIN_MCP_TOOLS).toEqual(["list_mcp_resources", "list_mcp_resource_templates", "read_mcp_resource"]);
  });
});

describe("a Codex chat turn", () => {
  it("a turn with no engine and a turn with engine claude both run the Claude stand-in, with today's message shape", async () => {
    // Proves: absent engine and engine claude stay on Claude Code, and the final message has no engine field.
    await startBridge();
    const plain = await turn(secret, {});
    const named = await turn(secret, { engine: "claude" });
    expect(plain.status).toBe(200);
    expect(named.status).toBe(200);
    const shape = {
      role: "assistant",
      content: "echo: hello",
      model: "fake-model",
      payer: "person-claude-code",
      sessionId: expect.stringMatching(UUID_RE),
      usage: { model: "fake-model", contextWindow: 1000000, inputTokens: 1200, outputTokens: 340, cacheReadInputTokens: 50000, cacheCreationInputTokens: 2000 },
    };
    expect(plain.message).toEqual(shape);
    expect(named.message).toEqual(shape);
    expect(plain.message).not.toHaveProperty("engine");
    expect(named.message).not.toHaveProperty("engine");
    const drop = (m) => { const c = { ...m }; delete c.sessionId; return c; };
    expect(drop(plain.message)).toEqual(drop(named.message));
    expect(claudeRuns().length).toBe(2);
    expect(rpcs("thread/start")).toHaveLength(0);
  });

  it("engine codex runs the Codex stand-in and reports payer, engine, the thread id and the uncached usage", async () => {
    // Proves: a Codex turn's message is person-codex, the session id is the thread id, and cached input is not counted twice.
    await startBridge();
    await waitCodex();
    const r = await turn(secret, { engine: "codex", effort: "ultra", tools: [{ name: "probe_echo", description: "d", inputSchema: { type: "object", properties: {} } }] });
    expect(r.status).toBe(200);
    expect(r.error).toBeUndefined();
    expect(r.message).toEqual({
      role: "assistant",
      content: "hello",
      model: "gpt-fake-a",
      effort: "ultra",
      payer: "person-codex",
      engine: "codex",
      sessionId: expect.stringMatching(UUID_RE),
      usage: { model: "gpt-fake-a", contextWindow: 475000, inputTokens: 2500, cacheReadInputTokens: 13696, cacheCreationInputTokens: 0, outputTokens: 12 },
    });
    const status = r.events.find((e) => e[0] === "status")?.[1];
    expect(status).toMatchObject({ engine: "codex", account: "chatgpt", model: "gpt-fake-a" });
    expect(status.tools).toEqual(["probe_echo"]);
    expect(status.mcpServers).toEqual(expect.arrayContaining([{ name: "gilb", tools: 1 }, { name: "PersonServer", tools: 0 }]));
    const boots = rows().filter((row) => row.event === "boot");
    expect(boots.length).toBeGreaterThan(0);
    for (const b of boots) {
      expect(b.argv).toEqual(["app-server", ...CODEX_CHAT_FLAGS]);
      expect(b.envNames).toContain("CODEX_HOME");
      expect(b.envNames.filter((n) => n.toUpperCase().startsWith("OPENAI_") || ["CODEX_API_KEY", "CODEX_ACCESS_TOKEN", "AZURE_OPENAI_API_KEY"].includes(n.toUpperCase()))).toEqual([]);
    }
    const started = rpcs("thread/start");
    expect(started).toHaveLength(1);
    const p = started[0].params;
    expect(p.approvalPolicy).toBe("never");
    expect(p.sandbox).toBe("read-only");
    expect(p.ephemeral).toBe(false);
    expect(p.developerInstructions).toBe(`You are the agent.\n\n${CODEX_CHAT_SENTENCE}`);
    expect(p.config.web_search).toBe(CODEX_CHAT_CONFIG.web_search);
    expect(p.config.mcp_servers.PersonServer).toEqual({ enabled: false });
    expect(p.config.mcp_servers.gilb.url).toContain(`/mcp/`);
    expect(p.config.mcp_servers.gilb.default_tools_approval_mode).toBe("approve");
    expect(p.config.mcp_servers.gilb.tool_timeout_sec).toBe(2000);
    expect(p.effort).toBeUndefined();
    expect(rpcs("turn/start")[0].params.effort).toBe("ultra");
  });

  it("an unknown engine is 400 and each Codex refusal uses its sentence", async () => {
    // Proves: point 2 refusals, in order, and an engine the bridge does not know.
    await startBridge();
    await waitCodex();
    expect((await turn(secret, { engine: "gpt" })).json).toEqual({ error: "That engine is not known." });
    expect((await turn(secret, { engine: "codex", mode: "code" })).json).toEqual({ error: "Codex cannot run code turns on this bridge yet.", code: "EngineNoCodeTurns" });
    const pictures = await turn(secret, { engine: "codex", images: [{ mediaType: "image/png", data: PNG }] });
    expect(pictures.json).toEqual({ error: "Codex cannot take pictures on this bridge yet." });
    const badPicture = await turn(secret, { engine: "codex", images: [{ mediaType: "image/png", data: "@@@@" }] });
    expect(badPicture.json.error).not.toBe("Codex cannot take pictures on this bridge yet.");
    expect((await turn(secret, { engine: "codex", delegateCoding: true })).json).toEqual({ error: "delegateCoding is only for Claude Code." });
    expect((await turn(secret, { engine: "codex", delegateCoding: "yes" })).json).toEqual({ error: "Bad request." });
    expect((await turn(secret, { engine: "codex", model: "claude-opus-5-5" })).json).toEqual({ error: "That model is not allowed." });
    expect((await turn(secret, { engine: "codex", model: "gpt-not-in-list" })).json).toEqual({ error: "That model is not allowed." });
    expect((await turn(secret, { engine: "codex", effort: "extreme" })).json).toEqual({ error: "That effort is not allowed." });
    expect((await turn(secret, { engine: "claude", effort: "ultra" })).json).toEqual({ error: "That effort is not allowed." });
    expect((await turn(secret, { engine: "claude", model: "claude-opus-5-5" })).status).toBe(200);
    expect(rpcs("thread/start")).toHaveLength(0);
    const allowed = await turn(secret, { engine: "codex", model: "gpt-fake-b", delegateCoding: false });
    expect(allowed.status).toBe(200);
    expect(allowed.message.model).toBe("gpt-fake-b");
  });

  it("a person's server that still lists tools stops the turn", async () => {
    // Proves: the check before the turn refuses a server other than gilb that still has tools. FAKE_CODEX_FORCE_TOOLS is a test switch, not a measured Codex behaviour.
    await startBridge({ env: { FAKE_CODEX_FORCE_TOOLS: "1" } });
    const r = await turn(secret, { engine: "codex" });
    expect(r.error).toEqual({ message: LIMITS });
    expect(lines.some((l) => l.includes("PersonServer"))).toBe(true);
    expect(rpcs("turn/start")).toHaveLength(0);
  });

  it("a relayed tool call is answered and comes back in the message", async () => {
    // Proves: CALLTOOL reaches the page as tool_request and the posted result is the answer.
    await startBridge();
    const live = await openTurn(secret, { engine: "codex", prompt: "CALLTOOL", tools: [{ name: "probe_echo", description: "d", inputSchema: { type: "object", properties: {} } }] }, "ECHO:hi");
    await until(() => live.events.some((e) => e[0] === "message" || e[0] === "error"));
    const req = live.events.find((e) => e[0] === "tool_request")?.[1];
    expect(req.name).toBe("probe_echo");
    expect(live.events.find((e) => e[0] === "message")?.[1].content).toBe("ECHO:hi");
  });

  it("a shell item, a foreign tool and a child shell stop the turn; a sub-agent's answer does not", async () => {
    // Proves: the item guard watches every thread, and a sub-agent's own final answer is not this turn's answer.
    // Proves: an mcpToolCall on server codex is allowed for list_mcp_resources and stopped for any other tool. FOREIGNMCP is still stopped.
    await startBridge();
    expect((await turn(secret, { engine: "codex", prompt: "SHELLITEM" })).error).toEqual({ message: GUARD });
    expect((await turn(secret, { engine: "codex", prompt: "FOREIGNMCP" })).error).toEqual({ message: GUARD });
    const resources = await turn(secret, { engine: "codex", prompt: "RESOURCES" });
    expect(resources.error).toBeUndefined();
    expect(resources.message.content).toBe("RESOURCES");
    expect((await turn(secret, { engine: "codex", prompt: "CODEXOTHER" })).error).toEqual({ message: GUARD });
    expect((await turn(secret, { engine: "codex", prompt: "CHILDSHELL" })).error).toEqual({ message: GUARD });
    expect(lines.some((l) => l.includes("commandExecution"))).toBe(true);
    const sub = await turn(secret, { engine: "codex", prompt: "SUBAGENT please" });
    expect(sub.error).toBeUndefined();
    expect(sub.message.content).toBe("SUBAGENT please");
    expect(sub.message.content).not.toBe("CHILD-ANSWER");
  });

  it("a foreign server starting during the turn stops it with the tools sentence", async () => {
    // Proves: mcpServer startupStatus for a server other than gilb stops the turn, even after the start check passed.
    await startBridge();
    expect((await turn(secret, { engine: "codex", prompt: "FOREIGNSTART" })).error).toEqual({ message: LIMITS });
  });

  it("an approval request is declined", async () => {
    // Proves: item/commandExecution/requestApproval is answered decline and that answer is what the stand-in reports.
    await startBridge();
    const r = await turn(secret, { engine: "codex", prompt: "ASKAPPROVAL" });
    expect(r.message.content).toBe("approval:decline");
  });

  it("limit, failure, an early exit, a bad line and a message with no phase use their texts", async () => {
    // Proves: turn/completed failed, a child that exits, a non-JSON line, and an agentMessage with no phase.
    await startBridge();
    expect((await turn(secret, { engine: "codex", prompt: "LIMIT" })).error).toEqual({ message: "Your ChatGPT plan has reached its Codex limit. Try again later." });
    expect((await turn(secret, { engine: "codex", prompt: "FAILTURN" })).error).toEqual({ message: "Codex: the model broke badly" });
    const died = await turn(secret, { engine: "codex", prompt: "DIEEARLY" });
    expect(died.error.message.startsWith("Codex stopped without an answer.")).toBe(true);
    expect(died.error.message).toContain("early-one");
    expect(died.error.message).toContain("early-two");
    const bad = await turn(secret, { engine: "codex", prompt: "BADLINE hello" });
    expect(bad.error).toBeUndefined();
    expect(bad.message.content).toBe("BADLINE hello");
    expect((await turn(secret, { engine: "codex", prompt: "NOPHASE" })).message.content).toBe("no-phase-text");
  });

  it("a resume sends the stored thread id, and a thread that cannot be resumed is retried once with the history", async () => {
    // Proves: thread/resume carries the session id, and a resume error starts one new thread with the history text.
    await startBridge();
    const first = await turn(secret, { engine: "codex", prompt: "first-turn" });
    const id = first.message.sessionId;
    const again = await turn(secret, { engine: "codex", prompt: "second-turn", sessionId: id });
    expect(again.message.sessionId).toBe(id);
    expect(again.message.content).toBe("second-turn");
    expect(rpcs("thread/resume").map((r) => r.params.threadId)).toEqual([id]);
    const lost = "00000000-0000-4000-8000-000000000001";
    const retried = await turn(secret, { engine: "codex", prompt: "again", sessionId: lost, history: "Person: one" });
    expect(retried.message.content).toContain("Earlier in this conversation:");
    expect(retried.message.content).toContain("Person: one");
    expect(retried.message.sessionId).not.toBe(lost);
    const resumes = rpcs("thread/resume").map((r) => r.params.threadId);
    expect(resumes).toContain(lost);
    expect(rpcs("thread/start").length).toBe(2);
  });

  it("a hand-off under a Codex turn runs Codex, and one that names claude is 400", async () => {
    // Proves: the hand-off keeps the parent's engine, and naming the other engine is refused.
    await startBridge();
    const parent = await openTurn(secret, { engine: "codex", prompt: "WAITFOREVER" });
    await until(() => parent.turnId && rpcs("turn/start").some((r) => r.params.input?.[0]?.text === "WAITFOREVER"));
    const child = await turn(secret, { parentTurnId: parent.turnId, prompt: "handoff-plain" });
    expect(child.message).toMatchObject({ content: "handoff-plain", payer: "person-codex", engine: "codex" });
    expect(child.message).not.toHaveProperty("usage");
    const named = await turn(secret, { parentTurnId: parent.turnId, engine: "claude", prompt: "nope" });
    expect(named.status).toBe(400);
    expect(named.json).toEqual({ error: "A hand-off runs on its turn's engine." });
    expect(rpcs("turn/start").map((r) => r.params.input[0].text)).toEqual(["WAITFOREVER", "handoff-plain"]);
    parent.close();
  });

  it("cancelling a turn that waits ends the child and says the turn was cancelled", async () => {
    // Proves: POST /v1/turn/cancel stops the Codex child and the stream says the turn was cancelled.
    // Spec: Chat.CodexConnect B-W1 — a Windows stop asks taskkill for this child's pid, and an undefined pid fails the test (meter: the execFile seam records /PID)
    await startBridge();
    const live = await openTurn(secret, { engine: "codex", prompt: "WAITFOREVER" });
    await until(() => live.turnId && rpcs("turn/start").length === 1);
    expect((await api(secret, "/v1/turn/cancel", { turnId: live.turnId })).json).toEqual({ cancelled: true });
    await until(() => live.events.some((e) => e[0] === "error"));
    expect(live.events.find((e) => e[0] === "error")[1]).toEqual({ message: "The turn was cancelled." });
    const pid = rpcs("turn/start").at(-1)?.pid;
    if (process.platform === "win32") {
      // A real Windows machine. This Mac does not run this branch. Part 5 owns that machine.
      expect(typeof pid).toBe("number");
      await until(() => !alive(pid));
      return;
    }
    await until(() => rows().some((r) => r.event === "sigterm"));
    // This Mac forces the Windows stop. The lookup rewrites the stand-in's path, and Node cannot import that path.
    // The lookup is answered with the real stand-in. A starter runs it, so the stop still has this child's pid.
    // taskkill is the seam. It is not a real Windows program.
    const firstDir = dir;
    await bridge.close();
    bridge = undefined;
    await removeTestDir(firstDir);
    const kills = [];
    const execFile = (file, args, _opts, cb) => {
      kills.push({ file, args: [...args] });
      const asked = Number(args?.[1]);
      if (Number.isInteger(asked)) {
        try { process.kill(asked, "SIGKILL"); } catch { /* already gone */ }
      }
      if (typeof cb === "function") cb(null);
    };
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-win-cancel-"));
    const starter = path.join(scratch, "starter.sh");
    fs.writeFileSync(starter, `#!/bin/sh\nshift\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE_CODEX)} "$@"\n`, { mode: 0o755 });
    fs.chmodSync(starter, 0o755);
    const winPath = path.win32.resolve(FAKE_CODEX);
    const origStat = fs.statSync;
    const origAccess = fs.accessSync;
    fs.statSync = function (p, ...args) {
      return origStat.call(fs, p === winPath ? FAKE_CODEX : p, ...args);
    };
    fs.accessSync = function (p, ...args) {
      return origAccess.call(fs, p === winPath ? FAKE_CODEX : p, ...args);
    };
    try {
      await startBridge({ opts: { platformOpts: { platform: "win32", execFile, nodePath: starter } } });
      const liveWin = await openTurn(secret, { engine: "codex", prompt: "WAITFOREVER" });
      await until(() => liveWin.turnId && rpcs("turn/start").length === 1);
      expect((await api(secret, "/v1/turn/cancel", { turnId: liveWin.turnId })).json).toEqual({ cancelled: true });
      const winPid = rpcs("turn/start").at(-1)?.pid;
      // An undefined pid is a failed stop: taskkill was not asked for this child.
      expect(typeof winPid).toBe("number");
      const askedForThisPid = () => kills.some((k) => String(k.file).endsWith(`${path.win32.sep}taskkill.exe`) && k.args[0] === "/PID" && k.args[1] === String(winPid) && k.args.includes("/T") && k.args.includes("/F"));
      try {
        await until(askedForThisPid);
      } catch (err) {
        throw new Error(`no taskkill /PID ${String(winPid)}; seam saw ${JSON.stringify(kills)} (${err instanceof Error ? err.message : String(err)})`);
      }
      await until(() => liveWin.events.some((e) => e[0] === "error"));
      expect(liveWin.events.find((e) => e[0] === "error")[1]).toEqual({ message: "The turn was cancelled." });
    } finally {
      fs.statSync = origStat;
      fs.accessSync = origAccess;
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });
});

describe("a bridge that was not given a Codex binary", () => {
  it("never starts Codex, says it is not installed, and a Codex turn ends with that sentence", async () => {
    // Proves: createBridge without codexBin does not spawn Codex, even when an executable named codex is on PATH.
    dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-codex-")));
    const binDir = path.join(dir, "bin");
    const marker = path.join(dir, "codex-spawned");
    fs.mkdirSync(binDir);
    fs.writeFileSync(path.join(binDir, "codex"), `#!/bin/sh\nprintf '%s\\n' spawned >> ${JSON.stringify(marker)}\n`, { mode: 0o755 });
    fs.chmodSync(path.join(binDir, "codex"), 0o755);
    lines = [];
    bridge = createBridge({
      port: 0,
      claudeBin: FAKE_CLAUDE,
      allowedOrigins: [APP],
      workDir: path.join(dir, "work"),
      home: dir,
      log: (l) => lines.push(String(l)),
      env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}` },
    });
    await bridge.start();
    base = `http://127.0.0.1:${bridge.port}`;
    const paired = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: bridge.pairingCode }) });
    secret = (await paired.json()).secret;
    const hello = async () => (await fetch(`${base}/v1/hello`, { headers: { "x-bridge-secret": secret } })).json();
    const codexOf = (body) => body.engines.find((e) => e.id === "codex");
    const want = {
      id: "codex", name: "Codex", installed: false, version: null, supported: false, account: "unknown", ready: false,
      billing: "chatgpt-subscription", models: [], efforts: [...CODEX_EFFORTS], codeTurns: false, images: false, delegateCoding: false,
      reason: CODEX_NOT_INSTALLED,
    };
    expect(codexOf(await hello())).toEqual(want);
    expect(codexOf(await hello())).toEqual(want);
    const r = await turn(secret, { engine: "codex", prompt: "do-not-spawn" });
    expect(r.error).toEqual({ message: CODEX_NOT_INSTALLED });
    await delay(500);
    expect(fs.existsSync(marker)).toBe(false);
  });
});

describe("hello engines", () => {
  it("an unpaired hello has no engines, and a paired hello lists both once Codex is ready", async () => {
    // Proves: engines is paired-only, and the ready Codex row carries the stand-in's two models.
    await startBridge();
    const unpaired = await (await fetch(`${base}/v1/hello`)).json();
    expect(unpaired).not.toHaveProperty("engines");
    expect(unpaired.build).toBe("0.4.0");
    const codex = await waitCodex();
    expect(codex).toMatchObject({
      id: "codex", name: "Codex", installed: true, version: "0.167.2", supported: true, account: "chatgpt", ready: true,
      billing: "chatgpt-subscription", codeTurns: false, images: false, delegateCoding: false,
      efforts: ["low", "medium", "high", "xhigh", "max", "ultra"],
    });
    expect(codex.models).toEqual([
      { id: "gpt-fake-a", label: "Fake A", default: true, efforts: ["low", "high"] },
      { id: "gpt-fake-b", label: "Fake B", default: false, efforts: ["medium"] },
    ]);
    expect(codex).not.toHaveProperty("reason");
    const hello = await pairedHello();
    expect(hello.engines[0]).toMatchObject({ id: "claude", name: "Claude Code", ready: true, billing: "claude-subscription", codeTurns: true, images: true, delegateCoding: true });
    expect(hello.engines[0].models).toEqual([
      { id: "opus", label: "opus" }, { id: "sonnet", label: "sonnet" }, { id: "haiku", label: "haiku" }, { id: "fable", label: "fable" },
    ]);
  });

  it("a paired hello refreshes a Codex result older than 30 seconds without waiting", async () => {
    // Proves: the cache is reused inside 30 seconds worth of the bridge clock, and a paired hello past that starts a probe and still answers at once.
    let clock = 0;
    await startBridge({ now: () => clock });
    await waitCodex();
    clock = 31000;
    const body = await pairedHello();
    expect(body.engines.find((e) => e.id === "codex").checking).toBe(true);
  });

  it("hello says why Codex is not ready for an API key, no sign-in, an old version, a missing binary and an unknown flag", async () => {
    // Proves: the fixed reason sentences, and an unknown --disable flag is reported as a version this bridge does not support yet.
    const cases = [
      { env: { FAKE_CODEX_ACCOUNT: "apiKey" }, account: "apiKey", installed: true, supported: true, reason: APIKEY },
      { env: { FAKE_CODEX_ACCOUNT: "none" }, account: "none", installed: true, supported: true, reason: NONE },
      { env: { FAKE_CODEX_VERSION: "0.100.0" }, account: "chatgpt", installed: true, supported: false, version: "0.100.0", reason: TOO_OLD },
      { codexBin: path.join(os.tmpdir(), "no-such-codex-binary"), account: "unknown", installed: false, supported: false, reason: CODEX_NOT_INSTALLED },
      { env: { FAKE_CODEX_UNKNOWN_FLAG: "1" }, account: "unknown", installed: true, supported: false, reason: UNKNOWN_HELLO },
    ];
    for (const c of cases) {
      await bridge?.close();
      bridge = undefined;
      if (dir) await removeTestDir(dir);
      await startBridge({ env: c.env, codexBin: c.codexBin });
      const codex = await waitCodex();
      expect(codex.ready, c.reason).toBe(false);
      expect(codex.installed).toBe(c.installed);
      expect(codex.supported).toBe(c.supported);
      expect(codex.account).toBe(c.account);
      expect(codex.reason).toBe(c.reason);
      if (c.version) expect(codex.version).toBe(c.version);
    }
  });
});

describe("an account that is not ChatGPT", () => {
  it("refuses apiKey, none, other and garbage with their sentences and does not start a turn", async () => {
    // Proves: each account refusal is the fixed sentence, is not retried, and never sends turn/start.
    const cases = [
      ["apiKey", APIKEY],
      ["none", NONE],
      ["other", OTHER],
      ["garbage", GARBAGE],
    ];
    for (const [kind, sentence] of cases) {
      await bridge?.close();
      bridge = undefined;
      if (dir) await removeTestDir(dir);
      await startBridge({ env: { FAKE_CODEX_ACCOUNT: kind } });
      const r = await turn(secret, { engine: "codex", prompt: "should-not-run" });
      await until(() => rpcs("model/list").length >= 1);
      expect(r.error, kind).toEqual({ message: sentence });
      expect(rpcs("turn/start")).toHaveLength(0);
      expect(rpcs("thread/start")).toHaveLength(0);
      const turnPids = new Set(rpcs("account/read").filter((row) => !rpcs("model/list").some((m) => m.pid === row.pid)).map((row) => row.pid));
      expect([...turnPids], kind).toHaveLength(1);
    }
  });

  it("an unknown feature flag on a turn says to update the bridge", async () => {
    // Proves: a child that exits before the handshake with "Unknown feature flag" uses the version sentence and does not start a thread.
    await startBridge({ env: { FAKE_CODEX_UNKNOWN_FLAG: "1" } });
    const r = await turn(secret, { engine: "codex" });
    expect(r.error).toEqual({ message: UNKNOWN_TURN });
    expect(rpcs("thread/start")).toHaveLength(0);
  });
});

const IDLE = "Codex stopped answering, so the bridge stopped this turn.";
const UNREAD_TURN = "The bridge stopped this turn: it could not read your Codex version. Update Codex with `npm install -g @openai/codex`.";
const UNREAD_HELLO = "The bridge could not read your Codex version. Update Codex with `npm install -g @openai/codex`.";
const LINE_TURN = "The bridge stopped this turn: Codex sent more than it will read.";
const LINE_HELLO = "Could not start Codex: it sent more than the bridge will read.";
const PROVIDER = "The bridge stopped this turn: your Codex is set to use another model provider. This bridge runs Codex only on your ChatGPT sign-in.";
const NO_ANSWER = "Codex gave no answer.";
const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};
/** The turn, or a stand-in result when the stream is still open after `ms`. */
async function turnWithin(extra, ms = 2500) {
  return Promise.race([
    turn(secret, extra),
    delay(ms).then(() => ({ status: 0, events: [], error: { message: "still open" }, message: undefined })),
  ]);
}
function turnPid() {
  const listed = new Set(rpcs("model/list").map((row) => row.pid));
  const row = [...rpcs("initialize")].reverse().find((item) => !listed.has(item.pid));
  return row ? row.pid : undefined;
}

describe("round 3 Codex turn limits", () => {
  it("an old Codex is not driven past the handshake", async () => {
    // Spec: Chat.CodexConnect round 3 F1 — a version below the supported line never gets account/read, a thread, or turn/start.
    await startBridge({ env: { FAKE_CODEX_VERSION: "0.100.0" } });
    const r = await turn(secret, { engine: "codex", prompt: "should not run" });
    expect(r.error).toEqual({ message: TOO_OLD });
    // The background check also speaks initialize. Wait until it has listed models, so the turn's pid is the one that did not.
    await until(() => rpcs("model/list").length >= 1);
    const pid = turnPid();
    expect(pid).toBeTruthy();
    expect(rpcs("account/read").filter((row) => row.pid === pid)).toHaveLength(0);
    expect(rpcs("thread/start").filter((row) => row.pid === pid)).toHaveLength(0);
    expect(rpcs("turn/start").filter((row) => row.pid === pid)).toHaveLength(0);
  });

  it("a Codex that does not give a version is not driven", async () => {
    // Spec: Chat.CodexConnect round 3 F1 — no x.y.z in the userAgent stops the turn before account/read.
    await startBridge({ env: { FAKE_CODEX_NO_VERSION: "1" } });
    const r = await turn(secret, { engine: "codex", prompt: "should not run" });
    expect(r.error).toEqual({ message: UNREAD_TURN });
    await until(() => rpcs("model/list").length >= 1);
    const pid = turnPid();
    expect(rpcs("account/read").filter((row) => row.pid === pid)).toHaveLength(0);
    expect(rpcs("thread/start")).toHaveLength(0);
  });

  it("a userAgent with no version has the version sentence in hello", async () => {
    // Spec: Chat.CodexConnect round 3 F8 — installed, not supported, and not the timeout sentence.
    await startBridge({ env: { FAKE_CODEX_NO_VERSION: "1" } });
    const codex = await waitCodex();
    expect(codex.installed).toBe(true);
    expect(codex.supported).toBe(false);
    expect(codex.ready).toBe(false);
    expect(codex.reason).toBe(UNREAD_HELLO);
  });

  it("a silent turn ends at the idle limit and the child is stopped", async () => {
    // Spec: Chat.CodexConnect round 3 F2 — no line after turn/start ends the turn, and the child is gone.
    await startBridge({ opts: { codexIdleMs: 400, codexTurnMaxMs: 20000 } });
    const r = await turnWithin({ engine: "codex", prompt: "SILENT" }, 3000);
    expect(r.error).toEqual({ message: IDLE });
    const pid = rpcs("turn/start").at(-1)?.pid;
    expect(pid).toBeTruthy();
    await until(() => !alive(pid), 2000);
  });

  it("lines keep the idle clock back, and the overall limit still ends the turn", async () => {
    // Spec: Chat.CodexConnect round 3 F2 — the 24 hour cap is a real stop, and output from the child resets the idle clock.
    await startBridge({ opts: { codexIdleMs: 400, codexTurnMaxMs: 1200 } });
    const pending = turn(secret, { engine: "codex", prompt: "TICK" });
    await until(() => rpcs("turn/start").length >= 1);
    const atStart = Date.now();
    const r = await Promise.race([
      pending,
      delay(3000).then(() => ({ error: { message: "still open" }, message: undefined })),
    ]);
    const after = Date.now() - atStart;
    expect(r.error).toEqual({ message: IDLE });
    expect(after).toBeGreaterThan(700);
    expect(after).toBeLessThan(2500);
    const pid = rpcs("turn/start").at(-1).pid;
    await until(() => !alive(pid), 2000);
  });

  it("a pending tool call does not hold the idle clock", async () => {
    // Spec: Chat.CodexConnect round 3 F2 — a relayed tool call does not reset or suspend the idle clock.
    await startBridge({ opts: { codexIdleMs: 700, codexTurnMaxMs: 20000 } });
    const live = await openTurn(secret, { engine: "codex", prompt: "CALLTOOL", tools: [{ name: "probe_echo", description: "d", inputSchema: { type: "object", properties: {} } }] });
    await until(() => live.events.some((e) => e[0] === "tool_request"));
    const saw = await until(() => live.events.some((e) => e[0] === "error"), 3000).then(() => true).catch(() => false);
    expect(saw).toBe(true);
    expect(live.events.find((e) => e[0] === "error")[1]).toEqual({ message: IDLE });
  });

  it("a Codex child that ignores SIGTERM is killed", async () => {
    // Spec: Chat.CodexConnect round 3 F3 — SIGTERM, then SIGKILL after the grace. FAKE_CODEX_IGNORE_TERM is a guess.
    // Spec: Chat.CodexConnect B-S1 — the grace is the production one, so a late sigterm row is still written (meter: the sigterm row, then the child is gone)
    let pid;
    try {
      // A shorter grace kills the stand-in before a late row is written. The production grace does not.
      await startBridge({ env: { FAKE_CODEX_IGNORE_TERM: "1" } });
      const r = await turn(secret, { engine: "codex", prompt: "SHELLITEM" });
      expect(r.error).toEqual({ message: GUARD });
      pid = rpcs("turn/start").at(-1)?.pid;
      if (process.platform === "win32") {
        // Windows ends this child with taskkill /F, so the stand-in cannot receive SIGTERM and cannot write the row. The kill below is what this platform can show.
      } else {
        // The bridge sends SIGTERM before this error comes back. The stand-in writes the sigterm row
        // in its signal handler, and that write is not ordered against this read.
        const hasSigterm = () => rows().some((row) => row.event === "sigterm" && row.pid === pid);
        const deadline = Date.now() + 3000;
        while (!hasSigterm() && Date.now() < deadline) await delay(20);
        if (!hasSigterm()) {
          const held = rows().map((row) => `${row.event ?? "?"}${row.pid !== undefined ? ":" + row.pid : ""}`).join(", ") || "(empty)";
          throw new Error(`missing sigterm row for pid ${pid}; log held: ${held}`);
        }
        expect(hasSigterm()).toBe(true);
      }
      let dead = false;
      // SIGKILL follows the production grace, 3 seconds after SIGTERM. The row can land up to a second after that signal.
      try { await until(() => !alive(pid), 4500); dead = true; } catch { dead = false; }
      expect(dead).toBe(true);
    } finally {
      if (pid) { try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ } }
    }
  });

  it("close waits until a Codex child that ignores SIGTERM is gone", async () => {
    // Spec: Chat.CodexConnect round 3 F3 — bridge.close returns only after the Codex child is gone.
    let pid;
    try {
      await startBridge({ env: { FAKE_CODEX_IGNORE_TERM: "1" }, opts: { killGraceMs: 200 } });
      const live = await openTurn(secret, { engine: "codex", prompt: "WAITFOREVER" });
      await until(() => live.turnId && rpcs("turn/start").length >= 1);
      pid = rpcs("turn/start").at(-1).pid;
      expect(alive(pid)).toBe(true);
      await bridge.close();
      bridge = undefined;
      expect(alive(pid)).toBe(false);
    } finally {
      if (pid) { try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ } }
    }
  });

  it("a long answer outside ASCII is not cut at a chunk edge", async () => {
    // Spec: Chat.CodexConnect round 3 F4 — stdout is decoded before lines are split. The small writes are a guess.
    await startBridge();
    const text = "å€😀漢".repeat(8000);
    const r = await turn(secret, { engine: "codex", prompt: "WIDE" });
    expect(r.error).toBeUndefined();
    expect(r.message.content).toBe(text);
    expect(r.message.content.includes("\uFFFD")).toBe(false);
  });
});

describe("round 3 Codex tool and item guards", () => {
  it("a second gilb row and a row whose tools are not an object are refused", async () => {
    // Spec: Chat.CodexConnect round 3 F6 — server names are unique, exactly one gilb, and tools is a plain object.
    await startBridge({ env: { FAKE_CODEX_DOUBLE_GILB: "1" } });
    const doubled = await turn(secret, { engine: "codex", tools: [{ name: "probe_echo", description: "d", inputSchema: { type: "object", properties: {} } }] });
    expect(doubled.error).toEqual({ message: LIMITS });
    expect(rpcs("turn/start")).toHaveLength(0);
    await bridge.close();
    bridge = undefined;
    if (dir) await removeTestDir(dir);
    await startBridge({ env: { FAKE_CODEX_STATUS: "omit-tools" } });
    const omitted = await turn(secret, { engine: "codex" });
    expect(omitted.error).toEqual({ message: LIMITS });
    expect(rpcs("turn/start")).toHaveLength(0);
    await bridge.close();
    bridge = undefined;
    if (dir) await removeTestDir(dir);
    await startBridge({ env: { FAKE_CODEX_STATUS: "no-name" } });
    const unnamed = await turn(secret, { engine: "codex" });
    expect(unnamed.error).toEqual({ message: LIMITS });
    await bridge.close();
    bridge = undefined;
    if (dir) await removeTestDir(dir);
    await startBridge({ env: { FAKE_CODEX_STATUS: "tools-array" } });
    const arrayTools = await turn(secret, { engine: "codex" });
    expect(arrayTools.error).toEqual({ message: LIMITS });
  });

  it("a stop item is caught on every item notification once the thread exists", async () => {
    // Spec: Chat.CodexConnect round 3 F7 — item/completed, item/updated, and an item while turn/start is unanswered.
    // CommandExecution is not a Codex 0.167.2 item type, so it does not stop the turn.
    await startBridge();
    expect((await turnWithin({ engine: "codex", prompt: "COMPLETEDSHELL" })).error).toEqual({ message: GUARD });
    expect((await turnWithin({ engine: "codex", prompt: "UPDATEDSHELL" })).error).toEqual({ message: GUARD });
    expect((await turnWithin({ engine: "codex", prompt: "EARLYSHELL" }, 3000)).error).toEqual({ message: GUARD });
    const kept = await turn(secret, { engine: "codex", prompt: "CASESHELL" });
    expect(kept.error).toBeUndefined();
    expect(kept.message.content).toBe("case-kept");
  });

  it("the thread pins model_provider openai and refuses another provider", async () => {
    // Spec: Chat.CodexConnect round 3 R1 — model_provider openai in the thread config, and modelProvider openai on the answer.
    await startBridge();
    const ok = await turn(secret, { engine: "codex", prompt: "pin-provider" });
    expect(ok.error).toBeUndefined();
    expect(rpcs("thread/start")[0].params.config.model_provider).toBe("openai");
    await bridge.close();
    bridge = undefined;
    if (dir) await removeTestDir(dir);
    await startBridge({ env: { FAKE_CODEX_MODEL_PROVIDER: "other" } });
    const bad = await turn(secret, { engine: "codex", prompt: "other-provider" });
    expect(bad.error).toEqual({ message: PROVIDER });
    expect(rpcs("turn/start")).toHaveLength(0);
  });

  it("a resumed turn is retried only when thread/resume was refused", async () => {
    // Spec: Chat.CodexConnect round 3 R3 — a failed resumed turn is final. A refused thread/resume is still retried once.
    await startBridge();
    const first = await turn(secret, { engine: "codex", prompt: "first-body", tools: [{ name: "probe_echo", description: "d", inputSchema: { type: "object", properties: {} } }] });
    const id = first.message.sessionId;
    const failed = await turn(secret, { engine: "codex", prompt: "FAILTURN", sessionId: id });
    expect(failed.error).toEqual({ message: "Codex: the model broke badly" });
    expect(rpcs("turn/start")).toHaveLength(2);
    const live = await openTurn(secret, {
      engine: "codex",
      prompt: "TOOLTHENFAIL",
      sessionId: id,
      tools: [{ name: "probe_echo", description: "d", inputSchema: { type: "object", properties: {} } }],
    }, "ECHO:hi");
    await until(() => live.events.some((e) => e[0] === "error"));
    expect(live.events.filter((e) => e[0] === "tool_request")).toHaveLength(1);
    expect(live.events.find((e) => e[0] === "error")[1]).toEqual({ message: "Codex: the model broke badly" });
    const lost = "00000000-0000-4000-8000-000000000099";
    const retried = await turn(secret, { engine: "codex", prompt: "fresh-after-refuse", sessionId: lost, history: "Person: earlier" });
    expect(retried.message.content).toContain("Earlier in this conversation:");
    expect(retried.message.sessionId).not.toBe(lost);
  });

  it("a turn with no agentMessage is an error, and a huge line stops the turn", async () => {
    // Spec: Chat.CodexConnect round 3 R7 — no agentMessage is "Codex gave no answer.", and a line over 16 MiB stops the turn.
    await startBridge();
    const empty = await turn(secret, { engine: "codex", prompt: "NOANSWER" });
    expect(empty.error).toEqual({ message: NO_ANSWER });
    expect(empty.message).toBeUndefined();
    const huge = await turn(secret, { engine: "codex", prompt: "BIGLINE" });
    expect(huge.error).toEqual({ message: LINE_TURN });
    expect(huge.message).toBeUndefined();
  });

  it("a background check that is sent a huge line is not ready", async () => {
    // Spec: Chat.CodexConnect round 3 R7 — the hello probe's reason when Codex sends a line the bridge will not read.
    await startBridge({ env: { FAKE_CODEX_BIG_LINE: "1" } });
    const body = await until(async () => {
      const hello = await pairedHello();
      const codex = hello.engines?.find((e) => e.id === "codex");
      return codex && !codex.checking ? hello : null;
    }, 20000);
    const codex = body.engines.find((e) => e.id === "codex");
    expect(codex.installed).toBe(true);
    expect(codex.ready).toBe(false);
    expect(codex.reason).toBe(LINE_HELLO);
  });
});

describe("finding the Codex binary", () => {
  const place = (folder) => {
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, "codex");
    fs.writeFileSync(file, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    fs.chmodSync(file, 0o755);
    return file;
  };
  /** Stand-ins for the fixed system folders. They live under the test's temp dir. */
  const ownFixedDirs = (root) => {
    const dirs = [path.join(root, "fixed-opt"), path.join(root, "fixed-usr")];
    for (const folder of dirs) fs.mkdirSync(folder, { recursive: true });
    return dirs;
  };

  it("the default fixed folders are today's list, in today's order", () => {
    // Spec: Chat.CodexConnect B-F1 — production searches today's fixed folders, in today's order, when no list is given (meter: the exported list)
    expect([...CODEX_FIXED_LOOKUP_DIRS]).toEqual(["/opt/homebrew/bin", "/usr/local/bin"]);
  });

  it("finds Codex on PATH, beside node, under the newer fnm, and under nvm", (ctx) => {
    // Spec: Chat.CodexConnect round 3 F9 — the lookup order, newest version first, and a directory is not a binary. The fixed folders are this test's own.
    if (process.platform === "win32") {
      ctx.skip("skipped on Windows: this case asks the darwin lookup, and a Windows temp path contains ':' which that lookup splits as PATH. The placed file is also a POSIX shell script.");
    }
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "codex-lookup-"));
    try {
      const fixed = ownFixedDirs(home);
      const nodeDir = path.join(home, "node-bin");
      fs.mkdirSync(nodeDir);
      const execPath = path.join(nodeDir, "node");
      fs.writeFileSync(execPath, "", { mode: 0o755 });
      const pathDir = path.join(home, "path-bin");
      const onPath = place(pathDir);
      expect(resolveCodexBin("codex", { PATH: pathDir }, home, "darwin", execPath, fixed)).toBe(onPath);
      fs.rmSync(onPath);
      const beside = place(nodeDir);
      expect(resolveCodexBin("codex", { PATH: "" }, home, "darwin", execPath, fixed)).toBe(beside);
      fs.rmSync(beside);
      const older = place(path.join(home, ".local/share/fnm/node-versions/v22.9.0/installation/bin"));
      const newer = place(path.join(home, ".local/share/fnm/node-versions/v22.23.0/installation/bin"));
      expect(resolveCodexBin("codex", { PATH: "" }, home, "darwin", execPath, fixed)).toBe(newer);
      expect(resolveCodexBin("codex", { PATH: "" }, home, "darwin", execPath, fixed)).not.toBe(older);
      fs.rmSync(older);
      fs.rmSync(newer);
      const nvm = place(path.join(home, ".nvm/versions/node/v18.20.0/bin"));
      expect(resolveCodexBin("codex", { PATH: "" }, home, "darwin", execPath, fixed)).toBe(nvm);
      fs.rmSync(nvm);
      const inFixed = place(fixed[0]);
      expect(resolveCodexBin("codex", { PATH: "" }, home, "darwin", execPath, fixed)).toBe(inFixed);
      fs.rmSync(inFixed);
      fs.mkdirSync(path.join(pathDir, "codex"), { mode: 0o755 });
      expect(resolveCodexBin("codex", { PATH: pathDir }, home, "darwin", execPath, fixed)).toBe(null);
      expect(resolveCodexBin("codex", { PATH: "" }, home, "darwin", execPath, fixed)).toBe(null);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("a Codex installed after a failed lookup is found on the next turn and the next check", async (ctx) => {
    // Spec: Chat.CodexConnect round 3 R6 — a miss is not remembered. The next turn and the next background check look again.
    if (process.platform === "win32") {
      ctx.skip("skipped on Windows: this case asks the darwin lookup with PATH set to a temp folder, and a Windows temp path contains ':' which that lookup splits as PATH. The placed file is a POSIX script named codex.");
    }
    dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-codex-")));
    const binDir = path.join(dir, "bin");
    const nodeDir = path.join(dir, "no-node");
    const fixed = ownFixedDirs(dir);
    fs.mkdirSync(binDir);
    fs.mkdirSync(nodeDir);
    fs.symlinkSync(process.execPath, path.join(binDir, "node"));
    codexLog = path.join(dir, "codex.log");
    let clock = 0;
    lines = [];
    bridge = createBridge({
      port: 0,
      claudeBin: FAKE_CLAUDE,
      codexBin: "codex",
      allowedOrigins: [APP],
      workDir: path.join(dir, "work"),
      home: dir,
      now: () => clock,
      platformOpts: { platform: "darwin", nodePath: path.join(nodeDir, "node"), fixedDirs: fixed },
      log: (l) => lines.push(String(l)),
      env: {
        PATH: binDir,
        HOME: dir,
        FAKE_CODEX_LOG: codexLog,
        CODEX_HOME: path.join(dir, "codex-home"),
      },
    });
    await bridge.start();
    base = `http://127.0.0.1:${bridge.port}`;
    const paired = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: bridge.pairingCode }) });
    secret = (await paired.json()).secret;
    const missed = await waitCodex();
    expect(missed.installed).toBe(false);
    expect(missed.reason).toBe(CODEX_NOT_INSTALLED);
    fs.copyFileSync(FAKE_CODEX, path.join(binDir, "codex"));
    fs.chmodSync(path.join(binDir, "codex"), 0o755);
    const r = await turn(secret, { engine: "codex", prompt: "found-later" });
    expect(r.error).toBeUndefined();
    expect(r.message.content).toBe("found-later");
    clock = 31000;
    const again = await pairedHello();
    expect(again.engines.find((e) => e.id === "codex").checking).toBe(true);
    const ready = await waitCodex();
    expect(ready.installed).toBe(true);
    expect(ready.ready).toBe(true);
    expect(ready.version).toBe("0.167.2");
  });

  it("the README lists the Codex lookup and does not compare it with claude", () => {
    // Spec: Chat.CodexConnect round 3 F5 — the sentence matches the lookup, and it does not mention how claude is found.
    const text = fs.readFileSync(path.join(HERE, "../README.md"), "utf8");
    expect(text).not.toContain("the way it finds `claude`");
    expect(text).toContain("~/.local/share/fnm/aliases/default/bin");
    expect(text).toContain("~/.local/share/fnm/node-versions/*/installation/bin");
    expect(text).toContain("~/.nvm/versions/node/*/bin");
    expect(text).toContain("~/.volta/bin");
    expect(text).toContain("~/.asdf/shims");
    expect(text).toContain("~/.local/share/mise/shims");
    expect(text).toContain("~/.npm-global/bin");
    expect(text).toContain("~/.bun/bin");
    expect(text).toContain("~/Library/pnpm");
    expect(text).toContain("~/.local/bin");
    expect(text).toContain("/opt/homebrew/bin");
    expect(text).toContain("/usr/local/bin");
    expect(text).toContain("%LOCALAPPDATA%\\pnpm");
  });
});

// Spec: H-5 HK1-05 — the version token is exactly three numbers, and only the 0.167 line is driven.
const HK1_05_REAL_UA = "gilb-codex-probe/0.167.2 (Mac OS 26.5.1; arm64) Apple_Terminal/470.2 (gilb-codex-probe; 0)";
const HK1_05_CASES = [
  { id: "0.167.0", env: { FAKE_CODEX_VERSION: "0.167.0" }, kind: "pass", version: "0.167.0" },
  { id: "0.167.2", env: { FAKE_CODEX_VERSION: "0.167.2" }, kind: "pass", version: "0.167.2" },
  { id: "0.168.0", env: { FAKE_CODEX_VERSION: "0.168.0" }, kind: "newer", version: "0.168.0" },
  { id: "1.0.0", env: { FAKE_CODEX_VERSION: "1.0.0" }, kind: "newer", version: "1.0.0" },
  { id: "0.166.9", env: { FAKE_CODEX_VERSION: "0.166.9" }, kind: "older", version: "0.166.9" },
  { id: "0.167.2-beta", env: { FAKE_CODEX_VERSION: "0.167.2-beta" }, kind: "unread" },
  { id: "v0.167.2", env: { FAKE_CODEX_VERSION: "v0.167.2" }, kind: "unread" },
  { id: "0.167", env: { FAKE_CODEX_VERSION: "0.167" }, kind: "unread" },
  { id: "0.167.2.1", env: { FAKE_CODEX_VERSION: "0.167.2.1" }, kind: "unread" },
  { id: "0.1", env: { FAKE_CODEX_VERSION: "0.1" }, kind: "unread" },
  { id: "999", env: { FAKE_CODEX_VERSION: "999" }, kind: "unread" },
  { id: "0.167.2-hk1", env: { FAKE_CODEX_VERSION: "0.167.2-hk1" }, kind: "unread" },
  { id: "0.0167.3", env: { FAKE_CODEX_VERSION: "0.0167.3" }, kind: "unread" },
  { id: "empty", env: { FAKE_CODEX_USER_AGENT: "" }, kind: "unread" },
  { id: "no-version-text", env: { FAKE_CODEX_USER_AGENT: "no version here" }, kind: "unread" },
];

describe("HK1-05 strict Codex version", () => {
  it("takes only an exact three-number token after the slash", () => {
    // Spec: H-5 HK1-05 — the measured userAgent shape passes, and a suffix, a prefix, a fourth number, an empty string or text with no version does not
    const parsed = (ua) => codexVersionOf(ua);
    const misses = [];
    const check = (ua, want) => {
      const got = parsed(ua);
      if (got !== want) misses.push(`${JSON.stringify(ua)} => ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    };
    check(HK1_05_REAL_UA, "0.167.2");
    check("gilb-bridge/0.167.0 (fake)", "0.167.0");
    check("gilb-bridge/0.167.2 (fake)", "0.167.2");
    check("gilb-bridge/0.168.0 (fake)", "0.168.0");
    check("gilb-bridge/1.0.0 (fake)", "1.0.0");
    check("gilb-bridge/0.166.9 (fake)", "0.166.9");
    check("gilb-bridge/0.167.2-beta (fake)", null);
    check("gilb-bridge/0.167.2-hk1 (fake)", null);
    check("gilb-bridge/v0.167.2 (fake)", null);
    check("gilb-bridge/0.167 (fake)", null);
    check("gilb-bridge/0.167.2.1 (fake)", null);
    check("gilb-bridge/0.1 (fake)", null);
    check("gilb-bridge/999 (fake)", null);
    check("", null);
    check("no version here", null);
    check("codex-cli 0.167.2", null);
    check("gilb-bridge/0.0167.3 (fake)", null);
    check("gilb-bridge/00.167.2 (fake)", null);
    check("gilb-bridge/0.167.02 (fake)", null);
    expect(misses).toEqual([]);
  });

  it("the README names the 0.167 line and the newer-version sentence", () => {
    // Spec: H-5 HK1-05 — the supported range and the newer-version sentence are in the README
    const text = fs.readFileSync(path.join(HERE, "../README.md"), "utf8");
    expect(text).toContain("0.167.x");
    expect(text).toContain("This bridge does not support your Codex version yet. Update the bridge.");
  });

  it.each(HK1_05_CASES)("HK1-05 $id is $kind", async (row) => {
    // Spec: H-5 HK1-05 — 0.167.0 and 0.167.2 are driven; a newer line gets the not-supported sentence; an older line stays too old; any other shape is not read
    await startBridge({ env: row.env });
    const r = await turn(secret, { engine: "codex", prompt: "hk1-05" });
    if (row.kind === "pass") {
      expect(r.error).toBeUndefined();
      expect(r.message.content).toBe("hk1-05");
    } else if (row.kind === "newer") {
      expect(r.error).toEqual({ message: UNKNOWN_HELLO });
      expect(rpcs("turn/start")).toHaveLength(0);
    } else if (row.kind === "older") {
      expect(r.error).toEqual({ message: TOO_OLD });
      expect(rpcs("turn/start")).toHaveLength(0);
    } else {
      expect(r.error).toEqual({ message: UNREAD_TURN });
      expect(rpcs("turn/start")).toHaveLength(0);
    }
    const codex = await waitCodex();
    if (row.kind === "pass") {
      expect(codex.ready).toBe(true);
      expect(codex.supported).toBe(true);
      expect(codex.version).toBe(row.version);
    } else if (row.kind === "newer") {
      expect(codex.ready).toBe(false);
      expect(codex.supported).toBe(false);
      expect(codex.version).toBe(row.version);
      expect(codex.reason).toBe(UNKNOWN_HELLO);
    } else if (row.kind === "older") {
      expect(codex.ready).toBe(false);
      expect(codex.supported).toBe(false);
      expect(codex.version).toBe(row.version);
      expect(codex.reason).toBe(TOO_OLD);
    } else {
      expect(codex.ready).toBe(false);
      expect(codex.supported).toBe(false);
      expect(codex.version).toBeNull();
      expect(codex.reason).toBe(UNREAD_HELLO);
    }
  });
});
