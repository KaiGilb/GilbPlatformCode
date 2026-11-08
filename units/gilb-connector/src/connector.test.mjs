// @vitest-environment node
// The connector, in process, against a local stand-in for the platform door and a stand-in `claude`.
// Header values from the stand-in credential are not recorded and not printed.
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import http from "node:http";
import { PassThrough } from "node:stream";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONNECTOR_VERSION,
  DEFAULT_AGENT,
  DEFAULT_ORIGIN,
  DEFAULT_USER_TEXT,
  HAND_OFF_FAILED_NEXT,
  HOP_MAX_MS,
  MAX_HOPS_AT_ONCE,
  MCP_TOOL_TIMEOUT_MS,
  NOT_CONNECTED,
  childEnv,
  parseCli,
  startConnector,
} from "../connector/gilb-connector.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const MJS = fileURLToPath(new URL("../connector/gilb-connector.mjs", import.meta.url));
const FAKE_CLAUDE = join(HERE, "fake-claude.mjs");
const FAKE_COMPUTER = join(HERE, "fake-computer.mjs");
const TURN = "turn-test-1103";
const HOP_A = "0123456789abcdef01234567";
const HOP_B = "fedcba9876543210fedcba98";
const SENTENCE = "This computer is not connected to GilbPlatform yet. Run: gilb-computer add — approve it once in GilbApp — then restart Claude Code.";
const NEXT = "Do not call this hand-off again with the same Agent. Tell the person which Agent could not take the work, and why.";

const DOOR_TOOLS = [
  {
    name: "list_vaults",
    description: "List the person's vaults.",
    inputSchema: { type: "object", properties: { q: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "read_record",
    description: "Read one record.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
];

const EMPTY_HOME = mkdtempSync(join(tmpdir(), "gilb-connector-home-"));
const opened = [];
const closers = [];
const dirs = [];
const procs = [];

afterAll(() => {
  rmSync(EMPTY_HOME, { recursive: true, force: true });
});

afterEach(async () => {
  const boxes = opened.splice(0);
  for (const box of boxes) box.session.close();
  const stop = Promise.all(boxes.map((box) => box.session.done));
  const timed = new Promise((_, reject) => setTimeout(() => reject(new Error("session did not stop")), 8000));
  await Promise.race([stop, timed]);
  for (const box of boxes) {
    box.input.destroy();
    box.output.destroy();
  }
  for (const close of closers.splice(0)) await close();
  for (const proc of procs.splice(0)) {
    if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGTERM");
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function testEnv(extra = {}) {
  // HOME and GILB_HOME are a scratch directory. A hop child is a real process, and its own
  // environment is process.env, so an unset GILB_HOME would read this computer's profile.
  return {
    PATH: process.env.PATH,
    HOME: EMPTY_HOME,
    GILB_HOME: EMPTY_HOME,
    GILB_CONNECTOR_COMPUTER_MODULE: FAKE_COMPUTER,
    ...extra,
  };
}

function listen(handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }
    const rec = {
      method: req.method,
      url: req.url ?? "",
      body,
      hasAuth: Boolean(req.headers.authorization),
      hasDpop: Boolean(req.headers.dpop),
    };
    requests.push(rec);
    try {
      const reply = (await handler(rec)) ?? { status: 404, body: { error: "no such door" } };
      res.writeHead(reply.status ?? 200, { "content-type": "application/json" });
      res.end(JSON.stringify(reply.body ?? {}));
    } catch {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "the test platform failed" }));
    }
  });
  server.requestTimeout = 0;
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      const close = () => new Promise((done) => server.close(() => done()));
      closers.push(close);
      resolve({ origin: `http://127.0.0.1:${port}`, requests, close });
    });
  });
}

function connect(opts) {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines = [];
  const pending = new Map();
  let buf = "";
  output.setEncoding("utf8");
  output.on("data", (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      msg.at = Date.now();
      lines.push(msg);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });
  const session = startConnector({
    input,
    output,
    turnId: TURN,
    env: testEnv(),
    claudeBin: FAKE_CLAUDE,
    // These cases are the computer sign-in. The product default is the AI.
    as: "me",
    ...opts,
  });
  const box = { session, input, output };
  opened.push(box);
  let nextId = 1;
  function request(method, params, id = nextId++) {
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no answer for ${method} #${id}`)), 8000);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
    input.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return result;
  }
  return { session, request, lines, input };
}

function toolText(msg) {
  return msg.result.content[0].text;
}

function kaiContext(agent) {
  if (agent === "Jackfruit") {
    return {
      system: "STANDING-JACKFRUIT",
      tools: [{ name: "list_records", description: "Records.", inputSchema: { type: "object", properties: {} } }],
      standing: { outcome: "n" },
    };
  }
  return { system: "STANDING-KAI", tools: DOOR_TOOLS, standing: { textSent: false } };
}

async function waitFor(pred, ms = 5000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (pred()) return;
    await delay(20);
  }
  throw new Error("timed out");
}

function readLog(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

describe("childEnv", () => {
  it("strips ANTHROPIC_API_KEY and raises the MCP tool wait", () => {
    const out = childEnv({
      PATH: "/bin",
      KEEP_ME: "yes",
      ANTHROPIC_API_KEY: "not-a-real-key",
      anthropic_base_url: "http://gateway.invalid",
      MCP_TOOL_TIMEOUT: "30000",
    });
    expect(out).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(out).not.toHaveProperty("anthropic_base_url");
    expect(out.KEEP_ME).toBe("yes");
    expect(out.PATH).toBe("/bin");
    expect(out.MCP_TOOL_TIMEOUT).toBe(String(MCP_TOOL_TIMEOUT_MS));
    expect(out.CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT).toBe(String(MCP_TOOL_TIMEOUT_MS));
    expect(MCP_TOOL_TIMEOUT_MS).toBe(HOP_MAX_MS + 60_000);
  });

  it("keeps a person's own larger MCP wait", () => {
    const larger = String(HOP_MAX_MS * 10);
    expect(childEnv({ MCP_TOOL_TIMEOUT: larger }).MCP_TOOL_TIMEOUT).toBe(larger);
  });
});

describe("parseCli", () => {
  it("defaults the agent and the identity origin, and repeats --vault", () => {
    const cli = parseCli(["--vault", "http://vault.example/a", "--vault", "http://vault.example/b"], {});
    expect(cli.agent).toBe(DEFAULT_AGENT);
    expect(cli.agent).toBe("Kai-Zen");
    expect(cli.origin).toBe(DEFAULT_ORIGIN);
    expect(cli.origin).toBe("https://id.gilb.com");
    expect(cli.vaults).toEqual(["http://vault.example/a", "http://vault.example/b"]);
    expect(cli.claudeBin).toBe("claude");
    expect(cli.help).toBe(false);
  });

  it("rejects an unknown flag", () => {
    expect(() => parseCli(["--nope"], {})).toThrow(/Unknown option/);
  });
});

describe("constants", () => {
  it("uses the page client's hand-off sentence, a 15 minute hop, and four at once", () => {
    expect(NOT_CONNECTED).toBe(SENTENCE);
    expect(HAND_OFF_FAILED_NEXT).toBe(NEXT);
    expect(HOP_MAX_MS).toBe(15 * 60 * 1000);
    expect(MAX_HOPS_AT_ONCE).toBe(4);
    expect(DEFAULT_USER_TEXT).toBe("Work with the person in Claude Code.");
    expect(CONNECTOR_VERSION).toBe("0.5.11");
  });
});

describe("MCP", () => {
  it("initialize echoes the client's protocol and tools/list maps the door tools plus gilbplatform_*", async () => {
    const seen = [];
    const platform = await listen(async (rec) => {
      seen.push(rec);
      expect(rec.hasAuth).toBe(true);
      expect(rec.hasDpop).toBe(true);
      if (rec.url.endsWith("/context")) {
        expect(rec.body).toMatchObject({
          userText: DEFAULT_USER_TEXT,
          turnId: TURN,
          agent: "Kai-Zen",
          contentVaultIds: ["http://vault.example/v1"],
        });
        expect(rec.body.contentVaultIds).toEqual(["http://vault.example/v1"]);
        return { body: kaiContext(rec.body.agent) };
      }
      return { status: 404, body: { error: "no such door" } };
    });
    const { request } = connect({
      origin: platform.origin,
      vaults: ["http://vault.example/v1", "not-a-url"],
    });
    const init = await request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    });
    expect(init.result).toMatchObject({
      protocolVersion: "2024-11-05",
      capabilities: { tools: { listChanged: true }, prompts: {} },
      serverInfo: { name: "GilbPlatform", version: CONNECTOR_VERSION },
    });
    const listed = await request("tools/list", {});
    const tools = listed.result.tools;
    expect(tools.slice(0, 2)).toEqual(DOOR_TOOLS.map((tool) => ({ ...tool })));
    expect(tools.map((tool) => tool.name)).toEqual(["list_vaults", "read_record", "gilbplatform_agent", "gilbplatform_task", "gilbplatform_use_vault", "gilbplatform_upload_file"]);
    expect(tools[2].inputSchema.required).toEqual(["agent"]);
    expect(tools[3].inputSchema.required).toEqual(["text"]);
    expect(seen.filter((rec) => rec.url.endsWith("/context"))).toHaveLength(1);
    const again = await request("tools/list", {});
    expect(again.result.tools.map((tool) => tool.name)).toEqual(tools.map((tool) => tool.name));
    expect(seen.filter((rec) => rec.url.endsWith("/context"))).toHaveLength(1);
  });

  it("tools/call relays the name, the arguments, the turn and the agent", async () => {
    const seen = [];
    const platform = await listen(async (rec) => {
      seen.push(rec);
      if (rec.url.endsWith("/tool")) {
        return { body: { result: "vault-list" } };
      }
      return { status: 404, body: { error: "no such door" } };
    });
    const { request, lines } = connect({ origin: platform.origin, agent: "Kai-Zen" });
    const set = await request("tools/call", { name: "gilbplatform_task", arguments: { text: "Plan the release." } });
    expect(set.result.isError).toBe(false);
    expect(toolText(set)).toBe("The person's request is set.");
    const call = await request("tools/call", { name: "list_vaults", arguments: { q: "mine" } });
    expect(call.result.isError).toBe(false);
    expect(toolText(call)).toBe("vault-list");
    expect(seen).toHaveLength(1);
    expect(seen[0].hasAuth).toBe(true);
    expect(seen[0].hasDpop).toBe(true);
    expect(seen[0].body).toEqual({
      userText: "Plan the release.",
      turnId: TURN,
      agent: "Kai-Zen",
      name: "list_vaults",
      arguments: JSON.stringify({ q: "mine" }),
    });
    expect(lines.some((line) => line.method === "notifications/progress")).toBe(false);
  });

  it("an error result is isError, and a result that merely says error is not", async () => {
    let n = 0;
    const platform = await listen(async (rec) => {
      if (!rec.url.endsWith("/tool")) return { status: 404, body: { error: "no such door" } };
      n += 1;
      if (n === 1) return { body: { result: JSON.stringify({ error: "missing record" }) } };
      return { body: { result: "error: not a json object" } };
    });
    const { request } = connect({ origin: platform.origin });
    const bad = await request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(bad.result.isError).toBe(true);
    expect(toolText(bad)).toBe(JSON.stringify({ error: "missing record" }));
    const ok = await request("tools/call", { name: "read_record", arguments: { id: "2" } });
    expect(ok.result.isError).toBe(false);
    expect(toolText(ok)).toBe("error: not a json object");
  });

  it("gilbplatform_agent re-reads context, returns that standing, and emits tools/list_changed", async () => {
    const seen = [];
    const platform = await listen(async (rec) => {
      seen.push(rec);
      if (rec.url.endsWith("/context")) return { body: kaiContext(rec.body.agent) };
      return { status: 404, body: { error: "no such door" } };
    });
    const { request, lines } = connect({ origin: platform.origin });
    await request("tools/list", {});
    const switched = await request("tools/call", { name: "gilbplatform_agent", arguments: { agent: "Jackfruit" } });
    expect(switched.result.isError).toBe(false);
    expect(toolText(switched)).toBe("STANDING-JACKFRUIT");
    const notes = lines.filter((line) => line.method === "notifications/tools/list_changed");
    expect(notes).toHaveLength(1);
    expect(notes[0].jsonrpc).toBe("2.0");
    expect(notes[0].id).toBeUndefined();
    expect(notes[0].params).toEqual({});
    const noteAt = lines.indexOf(notes[0]);
    const resultAt = lines.findIndex((line) => line.id === switched.id);
    expect(noteAt).toBeGreaterThanOrEqual(0);
    expect(noteAt).toBeLessThan(resultAt);
    const contexts = seen.filter((rec) => rec.url.endsWith("/context"));
    expect(contexts.map((rec) => rec.body.agent)).toEqual(["Kai-Zen", "Jackfruit"]);
    const listed = await request("tools/list", {});
    expect(listed.result.tools.map((tool) => tool.name)).toEqual(["list_records", "gilbplatform_agent", "gilbplatform_task", "gilbplatform_use_vault", "gilbplatform_upload_file"]);
    expect(seen.filter((rec) => rec.url.endsWith("/context"))).toHaveLength(2);
  });

  it("a failed gilbplatform_agent does not switch and does not emit tools/list_changed", async () => {
    const seen = [];
    const platform = await listen(async (rec) => {
      seen.push(rec);
      if (rec.url.endsWith("/context") && rec.body.agent === "Jackfruit") {
        return { status: 500, body: { error: "no such agent here" } };
      }
      if (rec.url.endsWith("/context")) return { body: kaiContext("Kai-Zen") };
      if (rec.url.endsWith("/tool")) return { body: { result: "ok" } };
      return { status: 404, body: { error: "no such door" } };
    });
    const { request, lines } = connect({ origin: platform.origin });
    await request("tools/list", {});
    const failed = await request("tools/call", { name: "gilbplatform_agent", arguments: { agent: "Jackfruit" } });
    expect(failed.result.isError).toBe(true);
    expect(JSON.parse(toolText(failed)).error).toBe("no such agent here");
    expect(lines.some((line) => line.method === "notifications/tools/list_changed")).toBe(false);
    const call = await request("tools/call", { name: "list_vaults", arguments: {} });
    expect(call.result.isError).toBe(false);
    const tool = seen.find((rec) => rec.url.endsWith("/tool"));
    expect(tool.body.agent).toBe("Kai-Zen");
  });

  it("a name the platform refuses as not an agent (400 NotAPick) shows the person the platform's sentence, switches nothing, and the next tool call still sends the previous agent", async () => {
    // The unlisted name here is the dotted one on purpose: the platform has no `Agent.Jackfruit`, the agent is `Jackfruit` (Kai, 2026-11-05).
    const reason = "the agent asked for is not one of the picks the platform's agent list serves, so no standing was loaded for it. The agents are listed at GET /base/ai/agents.";
    const seen = [];
    const platform = await listen(async (rec) => {
      seen.push(rec);
      if (rec.url.endsWith("/context") && rec.body.agent === "Agent.Jackfruit") {
        return { status: 400, body: { error: "NotAPick", message: reason } };
      }
      if (rec.url.endsWith("/context")) return { body: kaiContext("Kai-Zen") };
      if (rec.url.endsWith("/tool")) return { body: { result: "ok" } };
      return { status: 404, body: { error: "no such door" } };
    });
    const { request, lines } = connect({ origin: platform.origin });
    await request("tools/list", {});
    const failed = await request("tools/call", { name: "gilbplatform_agent", arguments: { agent: "Agent.Jackfruit" } });
    expect(failed.result.isError).toBe(true);
    expect(JSON.parse(toolText(failed)).error).toBe(reason);
    expect(toolText(failed)).not.toMatch(/^\{"error":"The agent could not answer/);
    expect(lines.some((line) => line.method === "notifications/tools/list_changed")).toBe(false);
    const call = await request("tools/call", { name: "list_vaults", arguments: {} });
    expect(call.result.isError).toBe(false);
    expect(seen.find((rec) => rec.url.endsWith("/tool")).body.agent).toBe("Kai-Zen");
    // and the person can still switch to the real name
    const ok = await request("tools/call", { name: "gilbplatform_agent", arguments: { agent: "Jackfruit" } });
    expect(ok.result.isError).toBe(false);
  });

  it("prompts/get returns the system text", async () => {
    const seen = [];
    const platform = await listen(async (rec) => {
      seen.push(rec);
      if (rec.url.endsWith("/context")) return { body: kaiContext(rec.body.agent) };
      if (rec.url.endsWith("/tool")) return { body: { result: "ok" } };
      return { status: 404, body: { error: "no such door" } };
    });
    const { request } = connect({ origin: platform.origin });
    const listed = await request("prompts/list", {});
    expect(listed.result.prompts.map((prompt) => prompt.name)).toEqual(["agent"]);
    expect(listed.result.prompts[0].arguments[0].name).toBe("name");
    const current = await request("prompts/get", { name: "agent" });
    expect(current.result.messages).toEqual([{ role: "user", content: { type: "text", text: "STANDING-KAI" } }]);
    const named = await request("prompts/get", { name: "agent", arguments: { name: "Jackfruit" } });
    expect(named.result.description).toBe("Standing instructions for Jackfruit.");
    expect(named.result.messages[0].content.text).toBe("STANDING-JACKFRUIT");
    const call = await request("tools/call", { name: "list_vaults", arguments: {} });
    expect(toolText(call)).toBe("ok");
    const tool = seen.find((rec) => rec.url.endsWith("/tool"));
    expect(tool.body.agent).toBe("Kai-Zen");
  });

  it("sends progress notifications on the interval while a call is pending", async () => {
    const every = 40;
    const platform = await listen(async (rec) => {
      if (rec.url.endsWith("/tool")) {
        await delay(180);
        return { body: { result: "slow-ok" } };
      }
      return { status: 404, body: { error: "no such door" } };
    });
    const { request, lines } = connect({ origin: platform.origin, progressEveryMs: every });
    const call = await request("tools/call", {
      name: "read_record",
      arguments: { id: "1" },
      _meta: { progressToken: "p1" },
    });
    expect(call.result.isError).toBe(false);
    expect(toolText(call)).toBe("slow-ok");
    const resultAt = lines.findIndex((line) => line.id === call.id);
    const progress = lines.slice(0, resultAt).filter((line) => line.method === "notifications/progress");
    expect(progress.length).toBeGreaterThanOrEqual(2);
    expect(progress.map((line) => line.params)).toEqual(
      progress.map((_, index) => ({ progressToken: "p1", progress: index + 1, message: "still working" })),
    );
    expect(progress[1].at - progress[0].at).toBeGreaterThanOrEqual(every / 2);
    for (const line of progress) {
      expect(line.jsonrpc).toBe("2.0");
      expect(line.id).toBeUndefined();
    }
  });

  it("answers every tool with the exact sentence when this computer has no credential", async () => {
    const platform = await listen(async () => {
      throw new Error("the platform must not be called");
    });
    const { request } = connect({
      origin: platform.origin,
      env: { PATH: process.env.PATH },
      profile: undefined,
    });
    for (const name of ["gilbplatform_task", "gilbplatform_agent", "list_vaults"]) {
      const msg = await request("tools/call", { name, arguments: { text: "hi", agent: "Kai-Zen" } });
      expect(msg.result.isError).toBe(true);
      expect(toolText(msg)).toBe(SENTENCE);
    }
    const listed = await request("tools/list", {});
    expect(listed.result.tools.map((tool) => tool.name)).toEqual(["gilbplatform_agent", "gilbplatform_task", "gilbplatform_use_vault", "gilbplatform_upload_file"]);
  });

  it("answers with the same sentence when the computer module reports the computer is missing", async () => {
    const platform = await listen(async () => ({ body: { result: "should-not-run" } }));
    const { request } = connect({ origin: platform.origin, profile: "missing" });
    const msg = await request("tools/call", { name: "list_vaults", arguments: {} });
    expect(msg.result.isError).toBe(true);
    expect(toolText(msg)).toBe(SENTENCE);
  });
});

describe("hand-off", () => {
  it("runs the nested claude in hop mode, posts hop.id, closes with hop_done, and returns content", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gilb-connector-"));
    dirs.push(dir);
    const logFile = join(dir, "claude.log");
    const seen = [];
    const platform = await listen(async (rec) => {
      seen.push(rec);
      expect(rec.hasAuth).toBe(true);
      expect(rec.hasDpop).toBe(true);
      if (!rec.url.endsWith("/tool")) return { status: 404, body: { error: "no such door" } };
      if (rec.body.name === "run_named_role" && !rec.body.hop) {
        return {
          body: {
            hop: {
              id: HOP_A,
              system: "You are Jackfruit.",
              task: "Do the records.",
              tools: [{ name: "list_records", description: "List", inputSchema: { type: "object", properties: { q: { type: "string" } } } }],
              role: "Jackfruit",
              answer: { role: "Jackfruit", summary: "handed" },
            },
          },
        };
      }
      if (rec.body.hop && rec.body.hop.id === HOP_A && rec.body.name === "list_records") {
        return { body: { result: "two records" } };
      }
      if (rec.body.name === "hop_done") return { body: { result: "closed" } };
      return { status: 404, body: { error: "unexpected tool" } };
    });
    const { request } = connect({
      origin: platform.origin,
      vaults: ["http://vault.example/v1", "not-a-url"],
      env: testEnv({ FAKE_CLAUDE_LOG: logFile, ANTHROPIC_API_KEY: "not-a-real-key" }),
    });
    await request("tools/call", { name: "gilbplatform_task", arguments: { text: "Plan the release." } });
    const call = await request("tools/call", { name: "run_named_role", arguments: { role: "Jackfruit" } });
    expect(call.result.isError).toBe(false);
    expect(JSON.parse(toolText(call))).toEqual({ role: "Jackfruit", summary: "handed", content: "two records" });
    const posts = seen.filter((rec) => rec.url.endsWith("/tool"));
    expect(posts.map((rec) => rec.body.name)).toEqual(["run_named_role", "list_records", "hop_done"]);
    for (const rec of posts) {
      expect(rec.body.turnId).toBe(TURN);
      expect(rec.body.agent).toBe("Kai-Zen");
      expect(rec.body.userText).toBe("Plan the release.");
      expect(rec.body.contentVaultIds).toEqual(["http://vault.example/v1"]);
    }
    expect(posts[1].body.hop).toEqual({ id: HOP_A });
    expect(posts[1].body.arguments).toBe(JSON.stringify({ q: "x" }));
    expect(posts[2].body).toMatchObject({ name: "hop_done", arguments: "{}", hop: { id: HOP_A, done: true } });
    const log = readLog(logFile);
    expect(log).toHaveLength(1);
    expect(log[0].hasApiKey).toBe(false);
    expect(log[0].argv).toEqual(expect.arrayContaining(["-p", "--output-format", "stream-json"]));
    expect(log[0].system).toBe("You are Jackfruit.");
    expect(log[0].prompt).toBe("Do the records.");
    const mcp = JSON.parse(log[0].argv[log[0].argv.indexOf("--mcp-config") + 1]);
    expect(mcp.mcpServers.GilbPlatform.command).toBe(process.execPath);
    expect(mcp.mcpServers.GilbPlatform.args[0]).toBe(MJS);
    expect(mcp.mcpServers.GilbPlatform.args).toEqual(expect.arrayContaining(["--hop", HOP_A, "--turn", TURN, "--agent", "Kai-Zen", "--origin", platform.origin]));
    expect(JSON.stringify(mcp.mcpServers.GilbPlatform.args)).not.toMatch(/dpop|bearer|authorization/i);
    expect(log[0].mcpToolTimeout).toBe(String(MCP_TOOL_TIMEOUT_MS));
  }, 15000);

  it("closes an unexpected hand-off shape without hop_done and tells the model not to retry", async () => {
    const seen = [];
    const platform = await listen(async (rec) => {
      seen.push(rec);
      if (rec.url.endsWith("/tool") && rec.body.name === "run_named_role") {
        return { body: { hop: { id: HOP_A, system: "s", task: "t" } } };
      }
      return { body: { result: "closed" } };
    });
    const { request } = connect({ origin: platform.origin });
    const call = await request("tools/call", { name: "run_named_role", arguments: {} });
    expect(call.result.isError).toBe(true);
    expect(JSON.parse(toolText(call))).toEqual({
      error: "The hand-off returned an unexpected answer.",
      next: NEXT,
    });
    expect(seen.some((rec) => rec.body.name === "hop_done")).toBe(false);
  });

  it("a nested hand-off cannot hop, and a missing claude returns the hand-off failure", async () => {
    const seen = [];
    const platform = await listen(async (rec) => {
      seen.push(rec);
      if (rec.body.hop && !rec.body.hop.done && rec.body.name === "list_records") {
        return {
          body: {
            hop: {
              id: HOP_B,
              system: "nested",
              task: "again",
              tools: [],
              role: "Agent.Other",
              answer: {},
            },
          },
        };
      }
      if (rec.body.name === "hop_done") return { body: { result: "closed" } };
      if (rec.body.name === "run_named_role") {
        return {
          body: {
            hop: {
              id: HOP_A,
              system: "sys",
              task: "go",
              tools: [{ name: "list_records", description: "List", inputSchema: { type: "object" } }],
              role: "Jackfruit",
              answer: { summary: "x" },
            },
          },
        };
      }
      return { status: 404, body: { error: "unexpected" } };
    });
    const nested = connect({
      origin: platform.origin,
      hopId: HOP_A,
      hopTools: [{ name: "list_records", description: "List", inputSchema: { type: "object" } }],
      userText: "Plan the release.",
    });
    const init = await nested.request("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
    expect(init.result.capabilities).toEqual({ tools: {} });
    expect(init.result.serverInfo.name).toBe("GilbPlatform");
    const listed = await nested.request("tools/list", {});
    expect(listed.result.tools.map((tool) => tool.name)).toEqual(["list_records"]);
    const again = await nested.request("tools/call", { name: "list_records", arguments: { q: "x" } });
    expect(again.result.isError).toBe(true);
    expect(JSON.parse(toolText(again))).toEqual({
      error: "the Agent's run failed",
      role: "Agent.Other",
      reason: "A hand-off cannot hand off again.",
      next: NEXT,
    });
    expect(seen.filter((rec) => rec.body.name === "hop_done").map((rec) => rec.body.hop)).toEqual([{ id: HOP_B, done: true }]);

    const missing = connect({ origin: platform.origin, claudeBin: join(tmpdir(), "no-such-claude") });
    const failed = await missing.request("tools/call", { name: "run_named_role", arguments: {} });
    expect(failed.result.isError).toBe(true);
    const body = JSON.parse(toolText(failed));
    expect(body.error).toBe("the Agent's run failed");
    expect(body.role).toBe("Jackfruit");
    expect(body.reason).toMatch(/Could not start Claude Code/);
    expect(body.next).toBe(NEXT);
    expect(seen.some((rec) => rec.body.name === "hop_done" && rec.body.hop.id === HOP_A && rec.body.hop.done === true)).toBe(true);
  });

  it("stops a hand-off that is not the person's Claude subscription", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gilb-connector-"));
    dirs.push(dir);
    const seen = [];
    const platform = await listen(async (rec) => {
      seen.push(rec);
      if (rec.body.name === "run_named_role") {
        return {
          body: {
            hop: {
              id: HOP_A,
              system: "sys",
              task: "go",
              tools: [{ name: "list_records", description: "List", inputSchema: { type: "object" } }],
              role: "Jackfruit",
              answer: {},
            },
          },
        };
      }
      if (rec.body.name === "hop_done") return { body: { result: "closed" } };
      return { status: 404, body: { error: "unexpected" } };
    });
    const { request } = connect({
      origin: platform.origin,
      env: testEnv({ FAKE_CLAUDE_LOG: join(dir, "claude.log"), FAKE_API_KEY_SOURCE: "ANTHROPIC_API_KEY" }),
    });
    const call = await request("tools/call", { name: "run_named_role", arguments: {} });
    expect(call.result.isError).toBe(true);
    const body = JSON.parse(toolText(call));
    expect(body.next).toBe(NEXT);
    expect(body.reason).toMatch(/Claude subscription/);
    expect(seen.some((rec) => rec.body.name === "hop_done" && rec.body.hop.id === HOP_A)).toBe(true);
  }, 15000);

  it("refuses a fifth-style extra hand-off while one is still running", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gilb-connector-"));
    dirs.push(dir);
    const logFile = join(dir, "claude.log");
    const seen = [];
    let hops = 0;
    const platform = await listen(async (rec) => {
      seen.push(rec);
      if (rec.body.name === "run_named_role" && !rec.body.hop) {
        hops += 1;
        const id = hops === 1 ? HOP_A : HOP_B;
        return {
          body: {
            hop: {
              id,
              system: "sys",
              task: hops === 1 ? "WAITFOREVER" : "quick",
              tools: [{ name: "list_records", description: "List", inputSchema: { type: "object" } }],
              role: "Jackfruit",
              answer: {},
            },
          },
        };
      }
      if (rec.body.name === "hop_done") return { body: { result: "closed" } };
      return { status: 404, body: { error: "unexpected" } };
    });
    const { request, input } = connect({
      origin: platform.origin,
      maxHops: 1,
      env: testEnv({ FAKE_CLAUDE_LOG: logFile }),
    });
    input.write(JSON.stringify({
      jsonrpc: "2.0",
      id: 50,
      method: "tools/call",
      params: { name: "run_named_role", arguments: {} },
    }) + "\n");
    await waitFor(() => readLog(logFile).some((row) => String(row.prompt).includes("WAITFOREVER")));
    const second = await request("tools/call", { name: "run_named_role", arguments: {} }, 51);
    expect(second.result.isError).toBe(true);
    expect(JSON.parse(toolText(second))).toEqual({
      error: "the Agent's run failed",
      role: "Jackfruit",
      reason: "Too many hand-offs are running at once (1). Wait for one to finish.",
      next: "Wait for a hand-off that is already running to finish, then try again.",
    });
    const closed = seen.filter((rec) => rec.body.name === "hop_done").map((rec) => rec.body.hop.id);
    expect(closed).toEqual([HOP_B]);
    expect(MAX_HOPS_AT_ONCE).toBe(4);
  }, 15000);
});

const AI_CLIENT_ID = "agent-client-bind";
const UNBOUND_PRINCIPAL = "https://id.example.test/base/p/abc";
const BOUND_PRINCIPAL = "https://ai.example.test/base";
const LOCAL_AI_TOOLS = ["gilbplatform_whoami", "gilbplatform_agent", "gilbplatform_task", "gilbplatform_use_vault", "gilbplatform_upload_file"];
const PLATFORM_AND_LOCAL = [...DOOR_TOOLS.map((tool) => tool.name), ...LOCAL_AI_TOOLS];

function listChanged(lines) {
  return lines.filter((line) => line.method === "notifications/tools/list_changed");
}

function toolNames(msg) {
  return msg.result.tools.map((tool) => tool.name);
}

function aiHomeEnv() {
  const home = mkdtempSync(join(tmpdir(), "gilb-connector-ai-"));
  dirs.push(home);
  return testEnv({ HOME: home, GILB_HOME: home, GILB_CONNECTOR_HOME: home });
}

function standingFor(principal) {
  return `STANDING-KAI That person is identified as: ${principal}. Tools follow.`;
}

async function aiDoor(state) {
  return listen(async (rec) => {
    if (rec.url.endsWith("/base/client/register")) {
      return { status: 200, body: { clientId: AI_CLIENT_ID, created: true, confersAuthority: false } };
    }
    if (rec.url.endsWith("/base/oauth/token")) {
      return { status: 200, body: { access_token: "atk-bind-test", token_type: "DPoP", expires_in: 300, scope: "base.write" } };
    }
    if (rec.url.endsWith("/base/e/first-use")) return { status: 404, body: { error: "not_found" } };
    if (rec.url.endsWith("/context")) {
      return { body: { system: standingFor(state.principal), tools: DOOR_TOOLS } };
    }
    if (rec.url.endsWith("/tool")) return { body: { result: "tool-ok" } };
    return { status: 404, body: { error: "no such door" } };
  });
}

function connectAi(origin) {
  return connect({ origin, as: "ai", env: aiHomeEnv() });
}

describe("tools after a bind", () => {
  it("started not bound: tools/list is only the local tools, and whoami after the bind emits tools/list_changed once", async () => {
    const state = { principal: UNBOUND_PRINCIPAL };
    const platform = await aiDoor(state);
    const { request, lines } = connectAi(platform.origin);
    const first = await request("tools/list", {});
    expect(toolNames(first)).toEqual(LOCAL_AI_TOOLS);
    expect(listChanged(lines)).toHaveLength(0);

    state.principal = BOUND_PRINCIPAL;
    const who = await request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(who.result.isError).toBe(false);
    expect(toolText(who)).toContain("state: bound");
    const notes = listChanged(lines);
    expect(notes).toHaveLength(1);
    expect(notes[0].jsonrpc).toBe("2.0");
    expect(notes[0].id).toBeUndefined();
    expect(notes[0].params).toEqual({});

    const listed = await request("tools/list", {});
    expect(toolNames(listed)).toEqual(PLATFORM_AND_LOCAL);
    expect(listChanged(lines)).toHaveLength(1);
  });

  it("a second whoami, still bound, emits no second tools/list_changed", async () => {
    const state = { principal: UNBOUND_PRINCIPAL };
    const platform = await aiDoor(state);
    const { request, lines } = connectAi(platform.origin);
    await request("tools/list", {});
    state.principal = BOUND_PRINCIPAL;
    const first = await request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(first)).toContain("state: bound");
    const afterFirst = listChanged(lines).length;
    const second = await request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(second)).toContain("state: bound");
    expect(listChanged(lines)).toHaveLength(afterFirst);
  });

  it("started bound: whoami emits no tools/list_changed", async () => {
    const platform = await aiDoor({ principal: BOUND_PRINCIPAL });
    const { request, lines } = connectAi(platform.origin);
    const who = await request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(who.result.isError).toBe(false);
    expect(toolText(who)).toContain("state: bound");
    expect(listChanged(lines)).toHaveLength(0);
  });

  it("still not bound: whoami emits no tools/list_changed", async () => {
    const platform = await aiDoor({ principal: UNBOUND_PRINCIPAL });
    const { request, lines } = connectAi(platform.origin);
    const who = await request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(who.result.isError).toBe(false);
    expect(toolText(who)).toContain("state: not bound");
    expect(listChanged(lines)).toHaveLength(0);
  });

  it("the not-bound message says Client ID and has no Agent client id", async () => {
    const platform = await aiDoor({ principal: UNBOUND_PRINCIPAL });
    const { request } = connectAi(platform.origin);
    const listed = await request("tools/list", {});
    const whoami = listed.result.tools.find((tool) => tool.name === "gilbplatform_whoami");
    expect(whoami.description).toContain("Client ID");
    expect(whoami.description).not.toContain("Agent client id");
    const who = await request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    const text = toolText(who);
    expect(text).toContain("state: not bound");
    expect(text).toContain("Client ID");
    expect(text).not.toContain("Agent client id");
    expect(text).toContain(`\nClient ID:\n${AI_CLIENT_ID}\n`);
  });

  it("tools/list that discovers the bind returns the platform tools and emits tools/list_changed once", async () => {
    const state = { principal: UNBOUND_PRINCIPAL };
    const platform = await aiDoor(state);
    const { request, lines } = connectAi(platform.origin);
    const first = await request("tools/list", {});
    expect(toolNames(first)).toEqual(LOCAL_AI_TOOLS);
    expect(listChanged(lines)).toHaveLength(0);

    state.principal = BOUND_PRINCIPAL;
    const listed = await request("tools/list", {});
    expect(toolNames(listed)).toEqual(PLATFORM_AND_LOCAL);
    const notes = listChanged(lines);
    expect(notes).toHaveLength(1);
    expect(notes[0].jsonrpc).toBe("2.0");
    expect(notes[0].id).toBeUndefined();
    expect(notes[0].params).toEqual({});
  });
});

describe("stdout", () => {
  it("a spawned connector writes only JSON-RPC lines, and a missing module is the exact sentence", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gilb-connector-"));
    dirs.push(dir);
    const child = spawn(process.execPath, [MJS, "--as", "me", "--agent", "Kai-Zen"], {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        GILB_HOME: dir,
        GILB_CONNECTOR_COMPUTER_MODULE: join(dir, "missing-module.mjs"),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    procs.push(child);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "gilbplatform_task", arguments: { text: "hello" } } });
    send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_vaults", arguments: {} } });
    const done = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("connector did not exit")), 8000);
      child.on("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    await waitFor(() => {
      const lines = stdout.endsWith("\n") ? stdout.split("\n").slice(0, -1) : stdout.split("\n").slice(0, -1);
      return lines.some((line) => {
        try {
          return JSON.parse(line).id === 3;
        } catch {
          return false;
        }
      });
    });
    child.stdin.end();
    const code = await done;
    expect(code).toBe(0);
    const lines = stdout.split("\n").filter((line) => line.length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const line of lines) {
      const msg = JSON.parse(line);
      expect(msg.jsonrpc).toBe("2.0");
      expect(msg.method !== undefined || msg.result !== undefined || msg.error !== undefined).toBe(true);
    }
    expect(stdout).not.toMatch(/dpop|bearer |authorization/i);
    const byId = Object.fromEntries(lines.map((line) => JSON.parse(line)).filter((msg) => msg.id !== undefined).map((msg) => [msg.id, msg]));
    expect(byId[1].result.protocolVersion).toBe("2025-06-18");
    expect(byId[1].result.serverInfo).toEqual({ name: "GilbPlatform", version: "0.5.11" });
    expect(byId[2].result.isError).toBe(true);
    expect(byId[2].result.content[0].text).toBe(SENTENCE);
    expect(byId[3].result.isError).toBe(true);
    expect(byId[3].result.content[0].text).toBe(SENTENCE);
    expect(stderr).toBe(SENTENCE + "\n");
    expect(stderr).not.toMatch(/dpop|authorization|bearer |api[_-]?key|token|proof/i);
  }, 15000);
});
