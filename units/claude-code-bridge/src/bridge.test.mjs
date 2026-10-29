// @vitest-environment node
// The bridge, end to end over real HTTP on 127.0.0.1, with a stand-in `claude` (test/fake-claude.mjs).
// ⚠ The REAL claude CLI is exercised by the manual run in README.md, not here.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  BILLING_ENV_DENY,
  checkSubscriptionLogin,
  childEnv,
  createBridge,
  HOP_MAX_MS,
  MCP_TOOL_TIMEOUT_MS,
  loadAllowedOrigins,
  normalizeOrigin,
  parseCli,
  DEFAULT_ALLOWED_ORIGINS,
  newPairingCode,
} from "../bridge/bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";

let dir;
let logFile;
let bridge;
let base;

async function start(extra = {}) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-test-"));
  logFile = path.join(dir, "claude.log");
  bridge = createBridge({
    port: 0,
    claudeBin: FAKE,
    allowedOrigins: [APP, "https://app.example.test"],
    workDir: path.join(dir, "work"),
    env: { ...process.env, FAKE_CLAUDE_LOG: logFile, ANTHROPIC_API_KEY: "FAKE-api-key-not-for-the-child", ANTHROPIC_BASE_URL: "http://gateway.invalid", ANTHROPIC_AUTH_TOKEN: "tok", KEEP_ME: "yes", ...extra },
    ...(extra.bridgeOpts ?? {}),
  });
  await bridge.start();
  base = `http://127.0.0.1:${bridge.port}`;
}
beforeEach(() => start());
afterEach(async () => {
  await bridge.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const runs = () =>
  fs.existsSync(logFile)
    ? fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l))
    : [];

async function pair(origin) {
  const res = await fetch(`${base}/v1/pair`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
    body: JSON.stringify({ code: bridge.pairingCode }),
  });
  return { res, body: await res.json() };
}

/** Plays the app page: one turn, relaying every tool call to `onTool`. */
async function turn(secret, body, onTool = async () => ({ result: "{}", isError: false })) {
  const res = await fetch(`${base}/v1/turn`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-bridge-secret": secret },
    body: JSON.stringify({ system: "You are the GilbPlatform agent.", tools: [{ name: "list_vaults", description: "d", inputSchema: { type: "object", properties: {} } }], ...body }),
  });
  if (res.status !== 200) return { status: res.status, events: [] };
  const events = [];
  let turnId = "";
  const dec = new TextDecoder();
  const reader = res.body.getReader();
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
      if (ev === "tool_request") {
        const r = await onTool(parsed, turnId);
        await fetch(`${base}/v1/tool-result`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-bridge-secret": secret },
          body: JSON.stringify({ turnId, id: parsed.id, ...r }),
        });
      }
    }
  }
  return { status: 200, events };
}

const HOP_TOOLS = [{ name: "read_record", description: "d", inputSchema: { type: "object", properties: {} } }];
const hop = (secret, parentTurnId, extra = {}, onTool) =>
  turn(secret, { parentTurnId, system: "You are Agent.Outcome.", tools: HOP_TOOLS, prompt: "the task", ...extra }, onTool);

describe("billing: the subscription, never an API key", () => {
  it("childEnv removes every variable that would switch the CLI to an API key, gateway or cloud provider", () => {
    const all = Object.fromEntries(BILLING_ENV_DENY.map((k) => [k, "x"]));
    const out = childEnv({ ...all, PATH: "/bin", HOME: "/h" });
    for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"]) expect(out).not.toHaveProperty(k);
    expect(BILLING_ENV_DENY).toEqual(expect.arrayContaining(["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"]));
    expect(out).toMatchObject({ PATH: "/bin", HOME: "/h" });
  });

  it("the child that runs a turn never sees those variables; other variables pass", async () => {
    const { body } = await pair();
    const t = await turn(body.secret, { prompt: "hello" });
    expect(t.events.map((e) => e[0])).toContain("message");
    const run = runs().find((r) => r.event === "run");
    expect(run).toMatchObject({ hasApiKey: false, hasBaseUrl: false, hasAuthToken: false, keepEnv: "yes" });
  });

  it("childEnv removes whole families by prefix, in any letter case, and keeps proxies and other variables", () => {
    const bad = [
      "ANTHROPIC_FOUNDRY_API_KEY", "ANTHROPIC_BEDROCK_BASE_URL", "ANTHROPIC_VERTEX_PROJECT_ID", "ANTHROPIC_MODEL", "ANTHROPIC_API_KEY_HELPER",
      "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_MANTLE", "CLAUDE_CODE_USE_GATEWAY", "CLAUDE_CODE_USE_SOMETHING_NEW",
      "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_OAUTH_REFRESH_TOKEN", "CLAUDE_CODE_API_BASE_URL", "CLAUDE_CODE_GATEWAY_TOKEN",
      "CLAUDE_CODE_SESSION_ACCESS_TOKEN", "CLAUDE_API_KEY", "AWS_BEARER_TOKEN_BEDROCK", "AWS_BEARER_TOKEN_OTHER", "anthropic_api_key",
    ];
    const keep = { PATH: "/bin", HOME: "/h", HTTPS_PROXY: "http://p", CLAUDE_CONFIG_DIR: "/c", AWS_PROFILE: "x", XAI_API_KEY: "k" };
    const out = childEnv({ ...Object.fromEntries(bad.map((k) => [k, "x"])), ...keep });
    // MCP_TOOL_TIMEOUT is the one variable the bridge itself adds.
    expect(Object.keys(out).sort()).toEqual([...Object.keys(keep), "MCP_TOOL_TIMEOUT"].sort());
  });

  it("the child of a turn and of a hand-off gets none of the prefixed variables", async () => {
    await bridge.close();
    await start({ ANTHROPIC_FOUNDRY_API_KEY: "a", CLAUDE_CODE_OAUTH_TOKEN: "b", CLAUDE_CODE_USE_MANTLE: "1", AWS_BEARER_TOKEN_BEDROCK: "c" });
    const { body } = await pair();
    await turn(body.secret, { prompt: "CALLTOOL" }, async (req, turnId) => {
      await hop(body.secret, turnId, { prompt: "hi" });
      return { result: "{}", isError: false };
    });
    const rs = runs().filter((r) => r.event === "run");
    expect(rs.length).toBe(2);
    for (const r of rs) {
      expect(r.envKeys.filter((k) => /^(ANTHROPIC_|CLAUDE_CODE_OAUTH_|CLAUDE_CODE_USE_|AWS_BEARER_TOKEN_)/.test(k))).toEqual([]);
      expect(r.envKeys).toContain("KEEP_ME");
    }
  });

  it("start-up check: a subscription login passes", async () => {
    const r = await checkSubscriptionLogin(FAKE, { ...process.env });
    expect(r).toEqual({ ok: true, info: { email: "p@example.com", subscriptionType: "max" } });
  });

  it("start-up check: an API-key login is refused in plain words", async () => {
    const r = await checkSubscriptionLogin(FAKE, { ...process.env, FAKE_CLAUDE_AUTH: JSON.stringify({ loggedIn: true, authMethod: "api_key" }) });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not with a Claude subscription/);
    expect(r.reason).toMatch(/never on an API key/);
  });

  it("start-up check: not logged in, and no claude installed, are refused in plain words", async () => {
    const out = await checkSubscriptionLogin(FAKE, { ...process.env, FAKE_CLAUDE_AUTH: JSON.stringify({ loggedIn: false }) });
    expect(out).toMatchObject({ ok: false });
    expect(out.reason).toMatch(/not logged in/);
    const missing = await checkSubscriptionLogin("/nonexistent/claude", { ...process.env });
    expect(missing.ok).toBe(false);
    expect(missing.reason).toMatch(/not installed/);
  });

  it("a run whose CLI reports an API-key source is stopped and no answer is shown", async () => {
    await bridge.close();
    await start({ FAKE_API_KEY_SOURCE: "ANTHROPIC_API_KEY" });
    const { body } = await pair();
    const t = await turn(body.secret, { prompt: "hello" });
    const names = t.events.map((e) => e[0]);
    expect(names).toContain("error");
    expect(names).not.toContain("message");
    expect(JSON.stringify(t.events)).toMatch(/not your Claude subscription/);
  });
});

describe("billing guard fails closed on the init event", () => {
  const refused = (t) => {
    const names = t.events.map((e) => e[0]);
    expect(names).toContain("error");
    expect(names).not.toContain("message");
    expect(JSON.stringify(t.events)).toMatch(/did not confirm/);
  };
  it("an init event without apiKeySource is refused", async () => {
    const { body } = await pair();
    refused(await turn(body.secret, { prompt: "INITNOFIELD" }));
  });
  it("no init event at all is refused, even if an answer comes", async () => {
    const { body } = await pair();
    refused(await turn(body.secret, { prompt: "INITOMIT" }));
  });
  it("an init event that arrives after the answer proves nothing", async () => {
    const { body } = await pair();
    refused(await turn(body.secret, { prompt: "INITLATE" }));
  });
  it("a 'no turn ran' result that carries an answer, with no init, is refused", async () => {
    const { body } = await pair();
    refused(await turn(body.secret, { prompt: "ZEROTURNSANSWER" }));
  });
  it("apiKeySource null is refused", async () => {
    await bridge.close();
    await start({ FAKE_INIT: "null" });
    const { body } = await pair();
    refused(await turn(body.secret, { prompt: "hello" }));
  });
  for (const v of ["user", "project", "ANTHROPIC_API_KEY", "apiKeyHelper", "None", "", " none"]) {
    it(`apiKeySource ${JSON.stringify(v)} is refused`, async () => {
      await bridge.close();
      await start({ FAKE_API_KEY_SOURCE: v });
      const { body } = await pair();
      refused(await turn(body.secret, { prompt: "hello" }));
    });
  }
  it('apiKeySource "none" proceeds', async () => {
    const { body } = await pair();
    const t = await turn(body.secret, { prompt: "hello" });
    expect(t.events.map((e) => e[0])).toContain("message");
    expect(t.events.map((e) => e[0])).not.toContain("error");
  });
  it("a hand-off whose init event has no apiKeySource, or no init, is refused", async () => {
    const { body } = await pair();
    const hs = [];
    await turn(body.secret, { prompt: "CALLTOOL" }, async (req, turnId) => {
      hs.push(await hop(body.secret, turnId, { prompt: "INITNOFIELD" }));
      hs.push(await hop(body.secret, turnId, { prompt: "INITOMIT" }));
      return { result: "{}", isError: false };
    });
    expect(hs.length).toBe(2);
    for (const h of hs) {
      expect(h.events.find((e) => e[0] === "message")).toBeUndefined();
      expect(h.events.find((e) => e[0] === "error")[1].message).toMatch(/did not confirm/);
    }
  });
});

describe("who may talk to the bridge", () => {
  it("answers a Private-Network-Access preflight from an allowed origin", async () => {
    const res = await fetch(`${base}/v1/turn`, {
      method: "OPTIONS",
      headers: { origin: APP, "access-control-request-method": "POST", "access-control-request-headers": "content-type, x-bridge-secret", "access-control-request-private-network": "true" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(APP);
    expect(res.headers.get("access-control-allow-private-network")).toBe("true");
    expect(res.headers.get("access-control-allow-headers")).toMatch(/x-bridge-secret/);
    expect(res.headers.get("vary")).toBe("Origin");
  });

  it("refuses any other origin: 403 and not one CORS header", async () => {
    for (const origin of ["https://evil.example", "http://localhost:5198", "https://app.example.test.evil.example", "null"]) {
      const res = await fetch(`${base}/v1/hello`, { headers: { origin } });
      expect(res.status).toBe(403);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
      const pre = await fetch(`${base}/v1/pair`, { method: "OPTIONS", headers: { origin, "access-control-request-method": "POST" } });
      expect(pre.status).toBe(403);
      expect(pre.headers.get("access-control-allow-origin")).toBeNull();
    }
  });

  it("refuses a request whose Host is not this computer's loopback (DNS rebinding)", async () => {
    const res = await fetch(`${base}/v1/hello`, { headers: { host: "evil.example" } }).catch(() => null);
    // fetch may refuse to set Host; use a raw request instead.
    const http = await import("node:http");
    const status = await new Promise((resolve) => {
      const r = http.request({ host: "127.0.0.1", port: bridge.port, path: "/v1/hello", headers: { host: "evil.example" } }, (x) => resolve(x.statusCode));
      r.end();
    });
    void res;
    expect(status).toBe(403);
  });

  it("listens on 127.0.0.1 only", () => {
    const addr = bridge.server.address();
    expect(addr.address).toBe("127.0.0.1");
  });

  it("by default no origin is allowed (the host app names its own), and never a wildcard", () => {
    const allowed = loadAllowedOrigins();
    expect(allowed).toEqual([]);
    expect(allowed.some((o) => o.includes("*"))).toBe(false);
  });

  it("an origin that is not on the list gets no CORS header, no pairing and no secret", async () => {
    const res = await fetch(`${base}/v1/pair`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://other-app.example" },
      body: JSON.stringify({ code: bridge.pairingCode }),
    });
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    // and the code was not spent
    const ok = await pair(APP);
    expect(ok.res.status).toBe(200);
  });
});

describe("adding an app's origin", () => {
  const ENV = "GILB_BRIDGE_ALLOW_ORIGINS";
  afterEach(() => {
    delete process.env[ENV];
  });

  it("normalizeOrigin accepts https origins and loopback http, and returns the canonical origin", () => {
    expect(normalizeOrigin("https://app.example.com")).toBe("https://app.example.com");
    expect(normalizeOrigin("https://app.example.com/")).toBe("https://app.example.com");
    expect(normalizeOrigin("https://app.example.com:8443")).toBe("https://app.example.com:8443");
    expect(normalizeOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeOrigin("http://127.0.0.1:5173")).toBe("http://127.0.0.1:5173");
  });

  it("normalizeOrigin refuses wildcards, plain http for a real host, paths, credentials and junk", () => {
    for (const bad of ["*", "https://*.example.com", "http://app.example.com", "https://app.example.com/path", "https://app.example.com?x=1", "https://u:p@app.example.com", "https://app.example.com:443", "app.example.com", "", "null", "file:///x", "javascript:alert(1)", "https://"]) {
      expect(() => normalizeOrigin(bad), bad).toThrow();
    }
  });

  it("--allow-origin may be repeated and parseCli keeps all of them", () => {
    const cli = parseCli(["--allow-origin", "https://a.example", "--port", "47899", "--allow-origin", "https://b.example"]);
    expect(cli.allowOrigins).toEqual(["https://a.example", "https://b.example"]);
    expect(parseCli([]).allowOrigins).toEqual([]);
  });

  it("a missing value, a value that is the next flag, and the --allow-origin=X form are handed on, never skipped", () => {
    expect(parseCli(["--allow-origin"]).allowOrigins).toEqual([""]);
    expect(parseCli(["--allow-origin", "--install"]).allowOrigins).toEqual([""]);
    expect(parseCli(["--allow-origin=https://a.example"]).allowOrigins).toEqual(["https://a.example"]);
    for (const a of [[], ["*"], ["--install"]]) {
      expect(() => loadAllowedOrigins(parseCli(["--allow-origin", ...a.slice(0, 1)]).allowOrigins)).toThrow(/not an origin/);
    }
  });

  it("an added origin is allowed (the default list is empty), and an invalid one is refused loudly, never skipped", () => {
    expect(loadAllowedOrigins(["https://app.example.com"])).toEqual(["https://app.example.com"]);
    expect(() => loadAllowedOrigins(["*"])).toThrow(/not an origin/);
    process.env[ENV] = "https://env.example.com, https://env2.example.com";
    expect(loadAllowedOrigins()).toContain("https://env2.example.com");
    process.env[ENV] = "*";
    expect(() => loadAllowedOrigins()).toThrow();
  });

  it("a bridge started with an added origin answers it, and still refuses a different one", async () => {
    await bridge.close();
    fs.rmSync(dir, { recursive: true, force: true });
    await start({ bridgeOpts: { allowedOrigins: loadAllowedOrigins(["https://app.example.com"]) } });
    const { res } = await pair("https://app.example.com");
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
    const other = await fetch(`${base}/v1/hello`, { headers: { origin: "https://app2.example.com" } });
    expect(other.status).toBe(403);
  });
});

describe("the command line refuses a bad origin before anything starts", () => {
  it("--allow-origin '*' exits 2 with a sentence and starts no server", () => {
    let err;
    try {
      execFileSync(process.execPath, [path.join(HERE, "../bridge/bridge.mjs"), "--allow-origin", "*", "--claude", FAKE, "--port", "0"], { encoding: "utf8", stdio: "pipe", timeout: 10000 });
    } catch (e) {
      err = e;
    }
    expect(err?.status).toBe(2);
    expect(String(err?.stderr)).toMatch(/not an origin/);
  });
});

describe("the model the page may name", () => {
  it("a value that could be read as an option never reaches the child's argv", async () => {
    const { body } = await pair();
    await turn(body.secret, { prompt: "hi", model: "--dangerously-skip-permissions" });
    await turn(body.secret, { prompt: "hi", model: "-x" });
    await turn(body.secret, { prompt: "hi", model: "claude-opus-5-5" });
    const argvs = runs().filter((r) => r.event === "run").map((r) => r.argv);
    expect(argvs).toHaveLength(3);
    expect(argvs[0]).not.toContain("--model");
    expect(argvs[1]).not.toContain("--model");
    expect(argvs[2]).toContain("claude-opus-5-5");
  });
});

describe("unknown options", () => {
  it("a misspelled option exits 2 and names it, instead of starting without what was asked", () => {
    let err;
    try {
      execFileSync(process.execPath, [path.join(HERE, "../bridge/bridge.mjs"), "--allow-orgin", "https://a.example", "--claude", FAKE, "--port", "0"], { encoding: "utf8", stdio: "pipe", timeout: 10000 });
    } catch (e) {
      err = e;
    }
    expect(err?.status).toBe(2);
    expect(String(err?.stderr)).toMatch(/Unknown option: --allow-orgin/);
  });

  it("the explicit default port in an origin gets a plain message", () => {
    expect(() => normalizeOrigin("https://app.example.com:443")).toThrow(/Write it as https:\/\/app\.example\.com\b/);
  });
});

describe("single file", () => {
  it("the built-in default origins are empty", () => {
    expect([...DEFAULT_ALLOWED_ORIGINS]).toEqual([]);
  });

  it("a copy of bridge.mjs alone in an empty folder still loads and uses the default origins", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-single-"));
    const copy = path.join(dir, "bridge.mjs");
    fs.copyFileSync(path.join(HERE, "../bridge/bridge.mjs"), copy);
    const out = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", "const m = await import(process.env.BRIDGE_COPY); console.log(JSON.stringify(m.loadAllowedOrigins()));"],
      // The copy's path goes in an env var, not argv[1]: where tmpdir is not behind a symlink (Linux), argv[1] === the module's
      // own path makes the bridge run its main() on import.
      { cwd: os.tmpdir(), encoding: "utf8", env: { ...process.env, BRIDGE_COPY: copy } },
    );
    expect(JSON.parse(out.trim().split("\n").pop())).toEqual(DEFAULT_ALLOWED_ORIGINS);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("pairing", () => {
  it("a code looks like ABC-DEF without look-alike letters", () => {
    for (let i = 0; i < 50; i++) expect(newPairingCode()).toMatch(/^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/);
  });

  it("every /v1 route but hello and pair needs the secret", async () => {
    for (const [method, p] of [["POST", "/v1/turn"], ["POST", "/v1/tool-result"], ["POST", "/v1/check"]]) {
      const res = await fetch(`${base}${p}`, { method, headers: { "content-type": "application/json" }, body: "{}" });
      expect(res.status).toBe(401);
      const wrong = await fetch(`${base}${p}`, { method, headers: { "content-type": "application/json", "x-bridge-secret": "nope" }, body: "{}" });
      expect(wrong.status).toBe(401);
    }
  });

  it("the right code gives a secret that works; the code is single use", async () => {
    const code = bridge.pairingCode;
    const { res, body } = await pair(APP);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(APP);
    expect(body.secret).toMatch(/^[0-9a-f]{64}$/);
    const ok = await fetch(`${base}/v1/check`, { method: "POST", headers: { "x-bridge-secret": body.secret, origin: APP } });
    expect(ok.status).toBe(200);
    expect(bridge.pairingCode).not.toBe(code);
    const again = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
    expect(again.status).toBe(401);
  });

  it("the code is accepted in any case, with or without the dash", async () => {
    const compact = bridge.pairingCode.replace("-", "").toLowerCase();
    const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: compact }) });
    expect(res.status).toBe(200);
  });

  it("guessing burns the code: after 5 wrong tries the right one no longer works", async () => {
    const code = bridge.pairingCode;
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "AAA-AAA" }) });
      expect(res.status).toBe(401);
    }
    expect(bridge.pairingCode).not.toBe(code);
    const late = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
    expect(late.status).toBe(401);
  });

  it("unpair makes the secret useless", async () => {
    const { body } = await pair();
    await fetch(`${base}/v1/unpair`, { method: "POST", headers: { "x-bridge-secret": body.secret } });
    const res = await fetch(`${base}/v1/check`, { method: "POST", headers: { "x-bridge-secret": body.secret } });
    expect(res.status).toBe(401);
  });
});

describe("a turn", () => {
  it("runs the person's claude with Claude Code's own tools off, only the GilbPlatform tools allowed, and answers", async () => {
    const { body } = await pair();
    const t = await turn(body.secret, { prompt: "hello there" });
    const msg = t.events.find((e) => e[0] === "message")[1];
    expect(msg).toMatchObject({ role: "assistant", content: "echo: hello there", model: "fake-model", payer: "person-claude-code" });
    expect(msg.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    const status = t.events.find((e) => e[0] === "status")[1];
    expect(status).toMatchObject({ apiKeySource: "none", tools: ["mcp__gilb__list_vaults"] });

    const { argv, cwd } = runs().find((r) => r.event === "run");
    const after = (flag) => argv[argv.indexOf(flag) + 1];
    expect(argv).toContain("-p");
    expect(after("--output-format")).toBe("stream-json");
    expect(after("--tools")).toBe(""); // built-in tools: none
    expect(argv).toContain("--strict-mcp-config");
    expect(after("--allowedTools")).toBe("mcp__gilb");
    expect(after("--permission-mode")).toBe("dontAsk");
    expect(argv).toContain("--restricted");
    expect(after("--system-prompt")).toBe("You are the GilbPlatform agent.");
    expect(argv).toContain("--session-id");
    expect(argv).not.toContain("--model"); // Claude Code's own default
    expect(fs.realpathSync(cwd)).toBe(fs.realpathSync(path.join(dir, "work")));
    const mcp = JSON.parse(after("--mcp-config"));
    expect(mcp.mcpServers.gilb.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp\//);
    expect(argv.join(" ")).not.toMatch(/dangerously|bypassPermissions/);
  });

  it("passes a model only when the person set one", async () => {
    const { body } = await pair();
    await turn(body.secret, { prompt: "hi", model: "sonnet" });
    const { argv } = runs().find((r) => r.event === "run");
    expect(argv[argv.indexOf("--model") + 1]).toBe("sonnet");
  });

  it("relays a Claude Code tool call to the page over MCP and gives the page's answer back to Claude Code", async () => {
    const { body } = await pair();
    const seen = [];
    const t = await turn(body.secret, { prompt: "CALLTOOL please" }, async (req) => {
      seen.push(req);
      return { result: JSON.stringify({ vaults: ["https://a.example.test/base"] }), isError: false };
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ name: "list_vaults", arguments: '{"q":"x"}' });
    expect(t.events.find((e) => e[0] === "message")[1].content).toBe('tool said: {"vaults":["https://a.example.test/base"]}');
  });

  it("a second turn resumes the Claude Code session; a lost session starts a new one with the thread as text", async () => {
    const { body } = await pair();
    const first = await turn(body.secret, { prompt: "one" });
    const sid = first.events.find((e) => e[0] === "message")[1].sessionId;
    await turn(body.secret, { prompt: "two", sessionId: sid, history: "Person: one\n\nAgent: echo: one" });
    const resumed = runs().filter((r) => r.event === "run")[1];
    expect(resumed.argv[resumed.argv.indexOf("--resume") + 1]).toBe(sid);
    expect(resumed.prompt).toBe("two");

    const lost = await turn(body.secret, { prompt: "three", sessionId: "00000000-0000-4000-8000-000000000000", history: "Person: one" });
    const all = runs().filter((r) => r.event === "run");
    const retry = all[all.length - 1];
    expect(retry.argv).toContain("--session-id");
    expect(retry.prompt).toContain("Earlier in this conversation:\nPerson: one");
    expect(retry.prompt).toContain("three");
    expect(lost.events.map((e) => e[0])).toContain("message");
  });

  it("when the page goes away mid-turn, claude is stopped", async () => {
    const { body } = await pair();
    const ctl = new AbortController();
    const res = await fetch(`${base}/v1/turn`, {
      method: "POST",
      signal: ctl.signal,
      headers: { "content-type": "application/json", "x-bridge-secret": body.secret },
      body: JSON.stringify({ prompt: "WAITFOREVER", system: "s", tools: [] }),
    });
    const reader = res.body.getReader();
    await reader.read(); // start
    for (let i = 0; i < 50 && !runs().some((r) => r.event === "run"); i++) await new Promise((r) => setTimeout(r, 50));
    ctl.abort();
    for (let i = 0; i < 50 && !runs().some((r) => r.event === "sigterm"); i++) await new Promise((r) => setTimeout(r, 50));
    expect(runs().some((r) => r.event === "sigterm")).toBe(true);
  });
});

describe("the MCP door Claude Code uses", () => {
  it("is not reachable from a browser, and needs the turn's own token", async () => {
    const { body } = await pair();
    // Start a turn that stays open so a turn id + token exist.
    const res = await fetch(`${base}/v1/turn`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bridge-secret": body.secret },
      body: JSON.stringify({ prompt: "WAITFOREVER", system: "s", tools: [] }),
    });
    for (let i = 0; i < 50 && !runs().some((r) => r.event === "run"); i++) await new Promise((r) => setTimeout(r, 50));
    const url = JSON.parse(runs().find((r) => r.event === "run").argv.reduce((a, v, i, arr) => (arr[i - 1] === "--mcp-config" ? v : a), "")).mcpServers.gilb.url;
    const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: {} };
    const asBrowser = await fetch(url, { method: "POST", headers: { "content-type": "application/json", origin: APP }, body: JSON.stringify(init) });
    expect(asBrowser.status).toBe(403);
    const badToken = await fetch(url.replace(/[0-9a-f]{48}$/, "0".repeat(48)), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(init) });
    expect(badToken.status).toBe(404);
    const good = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(init) });
    expect(good.status).toBe(200);
    expect((await good.json()).result.serverInfo.name).toBe("gilb");
    await res.body.cancel();
  });
});

describe("a hand-off to another agent is a nested turn on the same bridge", () => {

  it("runs the hand-off as its own claude, with its own prompt and tool set, tools off, no session, no key; its answer goes back to the asking turn", async () => {
    const { body } = await pair();
    let nested;
    const t = await turn(body.secret, { prompt: "CALLTOOL please" }, async (req, turnId) => {
      nested = await hop(body.secret, turnId);
      const message = nested.events.find((e) => e[0] === "message");
      return { result: JSON.stringify({ role: "Agent.Outcome", content: message[1].content }), isError: false };
    });
    expect(nested.status).toBe(200);
    expect(nested.events.find((e) => e[0] === "message")[1]).toMatchObject({ content: "echo: the task", payer: "person-claude-code" });
    expect(t.events.find((e) => e[0] === "message")[1].content).toContain("Agent.Outcome");
    const rs = runs().filter((r) => r.event === "run");
    expect(rs).toHaveLength(2);
    const [parentRun, childRun] = rs;
    const a = (run, n) => run.argv[run.argv.indexOf(n) + 1];
    expect(a(childRun, "--system-prompt")).toBe("You are Agent.Outcome.");
    expect(a(parentRun, "--system-prompt")).toBe("You are the GilbPlatform agent.");
    expect(a(childRun, "--tools")).toBe("");
    expect(childRun.argv).toContain("--strict-mcp-config");
    expect(childRun.argv).toContain("--restricted");
    expect(childRun.argv).not.toContain("--resume");
    expect(a(childRun, "--mcp-config")).not.toBe(a(parentRun, "--mcp-config"));
    expect(childRun).toMatchObject({ hasApiKey: false, hasBaseUrl: false, hasAuthToken: false, keepEnv: "yes" });
  });

  it("a hand-off cannot hand off again, and the bridge says so", async () => {
    const { body } = await pair();
    let grand;
    await turn(body.secret, { prompt: "CALLTOOL" }, async (req, turnId) => {
      await hop(body.secret, turnId, { prompt: "CALLTOOL inner" }, async (req2, hopId) => {
        grand = await hop(body.secret, hopId);
        return { result: "{}", isError: false };
      });
      return { result: "{}", isError: false };
    });
    expect(grand.status).toBe(400);
    expect(runs().filter((r) => r.event === "run")).toHaveLength(2);
  });

  it("only one hand-off runs at a time for a turn", async () => {
    const { body } = await pair();
    let second;
    await turn(body.secret, { prompt: "CALLTOOL" }, async (req, turnId) => {
      await hop(body.secret, turnId, { prompt: "CALLTOOL first" }, async () => {
        second = await hop(body.secret, turnId);
        return { result: "{}", isError: false };
      });
      return { result: "{}", isError: false };
    });
    expect(second.status).toBe(429);
  });

  it("a hand-off for a turn that is not running is refused", async () => {
    const { body } = await pair();
    const r = await hop(body.secret, "deadbeefdeadbeef");
    expect(r.status).toBe(404);
  });

  it("the turn and its hand-offs share one budget of tool calls; past it the model is told and nothing is relayed", async () => {
    await bridge.close();
    await start({ bridgeOpts: { maxToolCalls: 2 } });
    const { body } = await pair();
    const relayed = [];
    let texts = [];
    await turn(body.secret, { prompt: "CALLTOOL" }, async (req, turnId) => {
      relayed.push("parent");
      for (const label of ["first", "second"]) {
        const h = await hop(body.secret, turnId, { prompt: `CALLTOOL ${label}` }, async () => {
          relayed.push(label);
          return { result: "{}", isError: false };
        });
        texts.push(h.events.find((e) => e[0] === "message")?.[1].content ?? "");
      }
      return { result: "{}", isError: false };
    });
    expect(relayed).toEqual(["parent", "first"]);
    expect(texts[1]).toMatch(/used all its tool rounds/);
  });

  it("a hand-off that runs too long is stopped by the bridge, and the asking turn goes on", async () => {
    await bridge.close();
    await start({ bridgeOpts: { hopMaxMs: 300 } });
    const { body } = await pair();
    let h;
    const t = await turn(body.secret, { prompt: "CALLTOOL" }, async (req, turnId) => {
      h = await hop(body.secret, turnId, { prompt: "WAITFOREVER" });
      return { result: "{}", isError: false };
    });
    expect(h.events.find((e) => e[0] === "error")[1].message).toMatch(/took too long/);
    expect(t.events.find((e) => e[0] === "message")).toBeTruthy();
    expect(runs().some((r) => r.event === "sigterm")).toBe(true);
  });

  it("a hand-off whose CLI reports an API-key source is stopped, as a turn is", async () => {
    const { body } = await pair();
    let h;
    await turn(body.secret, { prompt: "CALLTOOL" }, async (req, turnId) => {
      h = await hop(body.secret, turnId, { prompt: "APIKEYSOURCE" });
      return { result: "{}", isError: false };
    });
    expect(h.events.find((e) => e[0] === "message")).toBeUndefined();
    expect(h.events.find((e) => e[0] === "error")[1].message).toMatch(/API key/);
  });
});

describe("the Claude CLI waits as long as the bridge allows (MCP_TOOL_TIMEOUT)", () => {
  it("the constant is the hand-off limit plus a minute, in milliseconds", () => {
    expect(MCP_TOOL_TIMEOUT_MS).toBe(HOP_MAX_MS + 60000);
  });

  it("childEnv sets it when the person has none", () => {
    expect(childEnv({ PATH: "/bin" }).MCP_TOOL_TIMEOUT).toBe(String(HOP_MAX_MS + 60000));
  });

  it("childEnv keeps a larger value of the person's own, and raises a smaller one", () => {
    expect(childEnv({ MCP_TOOL_TIMEOUT: String(HOP_MAX_MS * 10) }).MCP_TOOL_TIMEOUT).toBe(String(HOP_MAX_MS * 10));
    expect(childEnv({ MCP_TOOL_TIMEOUT: "30000" }).MCP_TOOL_TIMEOUT).toBe(String(HOP_MAX_MS + 60000));
    expect(childEnv({ MCP_TOOL_TIMEOUT: "not a number" }).MCP_TOOL_TIMEOUT).toBe(String(HOP_MAX_MS + 60000));
  });

  it("the spawned claude gets it", async () => {
    const { body } = await pair();
    await turn(body.secret, { prompt: "hello" });
    expect(runs().find((r) => r.event === "run").mcpToolTimeout).toBe(String(HOP_MAX_MS + 60000));
  });

  it("a larger value in the person's environment reaches the spawned claude; a smaller one is raised", async () => {
    await bridge.close();
    await start({ MCP_TOOL_TIMEOUT: String(HOP_MAX_MS * 10) });
    let { body } = await pair();
    await turn(body.secret, { prompt: "hello" });
    expect(runs().find((r) => r.event === "run").mcpToolTimeout).toBe(String(HOP_MAX_MS * 10));
    await bridge.close();
    await start({ MCP_TOOL_TIMEOUT: "1000" });
    ({ body } = await pair());
    await turn(body.secret, { prompt: "hello" });
    expect(runs().find((r) => r.event === "run").mcpToolTimeout).toBe(String(HOP_MAX_MS + 60000));
  });
});

describe("an abandoned hand-off is stopped", () => {
  const PARENT_TOOLS = [
    { name: "list_vaults", description: "d", inputSchema: { type: "object", properties: {} } },
    { name: "run_named_role", description: "d", inputSchema: { type: "object", properties: {} } },
  ];
  const until = async (fn, what) => {
    for (let i = 0; i < 100; i++) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  /** Opens a parent turn that stays alive, collecting its stream events; returns its turn id and the MCP address of its claude. */
  async function openParent(secret) {
    const events = [];
    const res = await fetch(`${base}/v1/turn`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bridge-secret": secret },
      body: JSON.stringify({ system: "s", tools: PARENT_TOOLS, prompt: "WAITFOREVER" }),
    });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    void (async () => {
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read().catch(() => ({ done: true }));
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const blk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /event: (.*)/.exec(blk)?.[1];
          const data = /data: (.*)/.exec(blk)?.[1];
          if (ev && data) events.push([ev, JSON.parse(data)]);
        }
      }
    })();
    await until(() => events.some((e) => e[0] === "start") && runs().some((r) => r.event === "run"), "the parent turn to start");
    const turnId = events.find((e) => e[0] === "start")[1].turnId;
    const cfg = JSON.parse(runs().find((r) => r.event === "run").argv[runs().find((r) => r.event === "run").argv.indexOf("--mcp-config") + 1]);
    return { events, turnId, mcpUrl: cfg.mcpServers.gilb.url, close: () => reader.cancel().catch(() => undefined) };
  }
  const rpc = (url, msg) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", ...msg }) });

  it("notifications/cancelled for a pending run_named_role call stops the nested claude, frees the turn for the next hand-off, and tells the page", async () => {
    const { body } = await pair();
    const parent = await openParent(body.secret);
    const call = rpc(parent.mcpUrl, { id: 77, method: "tools/call", params: { name: "run_named_role", arguments: { role: "R", task: "t" } } });
    await until(() => parent.events.some((e) => e[0] === "tool_request"), "the tool request");
    const reqId = parent.events.find((e) => e[0] === "tool_request")[1].id;

    // The hand-off the page opened for it.
    const nested = hop(body.secret, parent.turnId, { prompt: "WAITFOREVER" });
    await until(() => runs().filter((r) => r.event === "run").length === 2, "the nested claude");
    // While it runs, a second one is refused.
    expect((await hop(body.secret, parent.turnId)).status).toBe(429);

    // The parent's claude abandons the call.
    expect((await rpc(parent.mcpUrl, { method: "notifications/cancelled", params: { requestId: 77, reason: "timed out" } })).status).toBe(202);

    await until(() => runs().some((r) => r.event === "sigterm"), "the nested claude to get SIGTERM");
    await until(() => parent.events.some((e) => e[0] === "tool_cancelled"), "tool_cancelled on the parent stream");
    expect(parent.events.find((e) => e[0] === "tool_cancelled")[1]).toEqual({ type: "tool_cancelled", id: reqId });
    await nested; // its stream ends
    // The turn is free: the next hand-off is accepted, not 429.
    const next = await hop(body.secret, parent.turnId, { prompt: "again" });
    expect(next.status).toBe(200);
    expect(next.events.find((e) => e[0] === "message")[1].content).toBe("echo: again");
    // The abandoned call itself was settled, so nothing waits on it.
    const settled = await call;
    expect(settled.status).toBe(200);
    await parent.close();
  });

  it("a cancel for a call that is not a hand-off leaves a running hand-off alone", async () => {
    const { body } = await pair();
    const parent = await openParent(body.secret);
    void rpc(parent.mcpUrl, { id: 5, method: "tools/call", params: { name: "list_vaults", arguments: {} } });
    await until(() => parent.events.some((e) => e[0] === "tool_request"), "the tool request");
    const nested = hop(body.secret, parent.turnId, { prompt: "WAITFOREVER" });
    await until(() => runs().filter((r) => r.event === "run").length === 2, "the nested claude");
    await rpc(parent.mcpUrl, { method: "notifications/cancelled", params: { requestId: 5 } });
    await until(() => parent.events.some((e) => e[0] === "tool_cancelled"), "tool_cancelled");
    expect(runs().some((r) => r.event === "sigterm")).toBe(false);
    expect((await hop(body.secret, parent.turnId)).status).toBe(429);
    await parent.close();
    void nested;
  });

  it("the parent's claude exiting while a hand-off call is pending stops the nested claude", async () => {
    const { body } = await pair();
    const parent = await openParent(body.secret);
    void rpc(parent.mcpUrl, { id: 9, method: "tools/call", params: { name: "run_named_role", arguments: {} } });
    await until(() => parent.events.some((e) => e[0] === "tool_request"), "the tool request");
    const nested = hop(body.secret, parent.turnId, { prompt: "WAITFOREVER" });
    await until(() => runs().filter((r) => r.event === "run").length === 2, "the nested claude");
    // Kill the PARENT claude only (the first run).
    process.kill(runs().find((r) => r.event === "run").pid, "SIGKILL");
    await until(() => runs().filter((r) => r.event === "sigterm").length >= 1, "the nested claude to get SIGTERM");
    const r = await nested;
    expect(r.status).toBe(200);
  });

  const postResult = (secret, turnId, id, extra = {}) =>
    fetch(`${base}/v1/tool-result`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bridge-secret": secret },
      body: JSON.stringify({ turnId, id, result: "{}", isError: false, ...extra }),
    });

  it("a result posted late for a cancelled call is ignored with 200, and the turn goes on", async () => {
    const { body } = await pair();
    const parent = await openParent(body.secret);
    const call = rpc(parent.mcpUrl, { id: 77, method: "tools/call", params: { name: "run_named_role", arguments: {} } });
    await until(() => parent.events.some((e) => e[0] === "tool_request"), "the tool request");
    const reqId = parent.events.find((e) => e[0] === "tool_request")[1].id;
    await rpc(parent.mcpUrl, { method: "notifications/cancelled", params: { requestId: 77 } });
    await until(() => parent.events.some((e) => e[0] === "tool_cancelled"), "tool_cancelled");
    await call;
    const late = await postResult(body.secret, parent.turnId, reqId);
    expect(late.status).toBe(200);
    expect(await late.json()).toEqual({ ignored: true, reason: "cancelled" });
    expect(parent.events.some((e) => e[0] === "error")).toBe(false);
    // The turn still works: a next call is relayed and answered.
    const next = rpc(parent.mcpUrl, { id: 78, method: "tools/call", params: { name: "list_vaults", arguments: {} } });
    await until(() => parent.events.filter((e) => e[0] === "tool_request").length === 2, "the next tool request");
    const nextId = parent.events.filter((e) => e[0] === "tool_request")[1][1].id;
    const ok = await postResult(body.secret, parent.turnId, nextId, { result: "fine" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    expect((await (await next).json()).result.content[0].text).toBe("fine");
    await parent.close();
  });

  it("a result for an id that never existed is still 404", async () => {
    const { body } = await pair();
    const parent = await openParent(body.secret);
    const r = await postResult(body.secret, parent.turnId, "deadbeefdeadbeef");
    expect(r.status).toBe(404);
    await parent.close();
  });
});
