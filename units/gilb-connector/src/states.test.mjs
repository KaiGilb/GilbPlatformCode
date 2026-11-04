// @vitest-environment node
// The three AI states, and a Bind that shows up on the next call. The door is a local stand-in.
import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { startConnector } from "../connector/gilb-connector.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FAKE_CLAUDE = join(HERE, "fake-claude.mjs");
const CLIENT_ID = "agent-client-states";
const TURN = "turn-states-1104";
const HOP_A = "0123456789abcdef01234567";
const PERSON = "https://id.example.test/base/p/abc";
const AI_VAULT = "https://ai.example.test/base";
const VAULT_V = "https://v.example.test/base";

const PLATFORM_TOOLS = [
  { name: "list_vaults", description: "List.", inputSchema: { type: "object", properties: {} } },
  { name: "read_record", description: "Read.", inputSchema: { type: "object", properties: { id: { type: "string" } } } },
];

function aiNotBound(clientId) {
  return [
    "This AI is not bound to an AI vault yet.",
    "Agent client id:",
    clientId,
    "In GilbApp: open your vault › Connect AI. Name and mint an AI vault, paste the client id above into Agent client id, and press Bind AI.",
  ].join("\n");
}

function aiNoGrant(vault, principal) {
  const host = new URL(principal).host;
  if (!vault) {
    return `This AI acts as ${principal}. It has no Read or Write on any vault yet. In GilbApp, open the vault it should work in › Grant Access, and grant the AI vault ${host} Read and Write.`;
  }
  return `This AI acts as ${principal}. It has no Read or Write on ${vault} yet. In GilbApp, open that vault › Grant Access, and grant the AI vault ${host} Read and Write.`;
}

const closers = [];
const dirs = [];
const opened = [];

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
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "gilb-states-"));
  dirs.push(dir);
  return dir;
}

function listen(handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    const type = String(req.headers["content-type"] ?? "");
    let body = {};
    if (type.includes("application/x-www-form-urlencoded")) body = Object.fromEntries(new URLSearchParams(raw));
    else {
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = { raw };
      }
    }
    const rec = {
      method: req.method,
      url: req.url ?? "",
      body,
      authorization: typeof req.headers.authorization === "string" ? req.headers.authorization : "",
    };
    requests.push(rec);
    try {
      const reply = (await handler(rec, requests)) ?? { status: 404, body: { error: "no such door" } };
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
    claudeBin: FAKE_CLAUDE,
    as: "ai",
    ...opts,
  });
  opened.push({ session, input, output });
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
  return { session, request, lines };
}

function toolText(msg) {
  return msg.result.content[0].text;
}

function door(state) {
  const handler = async (rec) => {
    if (rec.url.endsWith("/base/client/register")) {
      return { status: 200, body: { clientId: CLIENT_ID, created: true, confersAuthority: false } };
    }
    if (rec.url.endsWith("/base/oauth/token")) {
      const access = `atk-${randomBytes(8).toString("hex")}`;
      return { status: 200, body: { access_token: access, token_type: "DPoP", expires_in: 300, scope: rec.body.scope } };
    }
    if (rec.url.endsWith("/base/e/first-use")) return { status: 404, body: { error: "not_found" } };
    if (rec.url.endsWith("/context")) {
      const principal = state.principal;
      return {
        body: {
          system: `STANDING-KAI That person is identified as: ${principal}. Tools follow.`,
          tools: state.tools ?? PLATFORM_TOOLS,
        },
      };
    }
    if (rec.url.endsWith("/tool")) {
      if (state.onTool) return state.onTool(rec);
      return { body: { result: "tool-ok" } };
    }
    return { status: 404, body: { error: "no such door" } };
  };
  return { handler };
}

function aiEnv(home, extra = {}) {
  return { PATH: process.env.PATH, HOME: home, GILB_HOME: home, GILB_CONNECTOR_HOME: home, ...extra };
}

function tokenPosts(requests) {
  return requests.filter((rec) => rec.url.endsWith("/base/oauth/token"));
}

describe("AI states", () => {
  it("s1 tools/list is the platform tools plus the gilbplatform tools, and the server is GilbPlatform", async () => {
    const home = scratch();
    const state = { principal: AI_VAULT };
    const { handler } = door(state);
    const platform = await listen(handler);
    const box = connect({ origin: platform.origin, env: aiEnv(home) });
    const init = await box.request("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
    expect(init.result.serverInfo.name).toBe("GilbPlatform");
    const listed = await box.request("tools/list", {});
    const names = listed.result.tools.map((tool) => tool.name);
    expect(names).toEqual(["list_vaults", "read_record", "gilbplatform_whoami", "gilbplatform_agent", "gilbplatform_task", "gilbplatform_use_vault"]);
    expect(names.some((name) => name.startsWith("gilb_"))).toBe(false);
  });

  it("s2 an unbound person principal answers aiNotBound, with the client id alone on a line", async () => {
    const home = scratch();
    const state = { principal: PERSON };
    const { handler } = door(state);
    const platform = await listen(handler);
    const box = connect({ origin: platform.origin, env: aiEnv(home) });
    const call = await box.request("tools/call", { name: "list_vaults", arguments: {} });
    expect(call.result.isError).toBe(true);
    const text = toolText(call);
    expect(text).toBe(aiNotBound(CLIENT_ID));
    const idLines = text.split("\n").filter((line) => line.includes(CLIENT_ID));
    expect(idLines).toEqual([CLIENT_ID]);
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(who.result.isError).toBe(false);
    expect(toolText(who)).toBe(
      `mode: ai\nclient id: ${CLIENT_ID}\nprincipal: ${PERSON}\nstate: not bound\nvaults: none\n\n${aiNotBound(CLIENT_ID)}`,
    );
  });

  it("s3 a bind is visible on the next call, which fetches a new token", async () => {
    const home = scratch();
    const state = { principal: PERSON };
    const { handler } = door(state);
    const platform = await listen(handler);
    const box = connect({ origin: platform.origin, env: aiEnv(home) });
    const first = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(first)).toContain("state: not bound");
    const mintedBefore = tokenPosts(platform.requests).length;
    expect(mintedBefore).toBeGreaterThan(0);

    state.principal = AI_VAULT;
    const second = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(second.result.isError).toBe(false);
    expect(toolText(second)).toContain("principal: " + AI_VAULT);
    expect(toolText(second)).toContain("state: bound");
    expect(toolText(second)).not.toContain("state: not bound");
    const mintedAfter = tokenPosts(platform.requests).length;
    expect(mintedAfter).toBeGreaterThan(mintedBefore);
    const contexts = platform.requests.filter((rec) => rec.url.endsWith("/context"));
    expect(contexts.length).toBeGreaterThanOrEqual(2);
    expect(contexts[contexts.length - 1].authorization).not.toBe(contexts[0].authorization);

    const call = await box.request("tools/call", { name: "list_vaults", arguments: {} });
    expect(call.result.isError).toBe(false);
    expect(toolText(call)).toBe("tool-ok");
    expect(toolText(call)).not.toBe(aiNotBound(CLIENT_ID));
    expect(platform.requests.some((rec) => rec.url.endsWith("/tool") && rec.body.name === "list_vaults")).toBe(true);
  });

  it("s4 bound with no reach answers aiNoGrant, and the next call tries again", async () => {
    const home = scratch();
    const state = { principal: AI_VAULT, granted: false };
    const { handler } = door(state);
    state.onTool = () => {
      if (!state.granted) {
        return {
          status: 200,
          body: {
            result: JSON.stringify({
              error: `vault target denied: the principal holds no read reach on vault ${VAULT_V}`,
            }),
          },
        };
      }
      return { body: { result: "granted-ok" } };
    };
    const platform = await listen(handler);
    const box = connect({ origin: platform.origin, env: aiEnv(home) });
    const denied = await box.request("tools/call", { name: "list_vaults", arguments: {} });
    expect(denied.result.isError).toBe(true);
    expect(toolText(denied)).toBe(aiNoGrant(VAULT_V, AI_VAULT));

    state.granted = true;
    const allowed = await box.request("tools/call", { name: "list_vaults", arguments: {} });
    expect(allowed.result.isError).toBe(false);
    expect(toolText(allowed)).toBe("granted-ok");
    expect(platform.requests.filter((rec) => rec.url.endsWith("/tool"))).toHaveLength(2);
  });

  it("s5 the hop names the server GilbPlatform and allows mcp__GilbPlatform", async () => {
    const home = scratch();
    const logFile = join(home, "claude.log");
    const state = { principal: AI_VAULT };
    const { handler } = door(state);
    state.onTool = (rec) => {
      if (rec.body.name === "run_named_role" && !rec.body.hop) {
        return {
          body: {
            hop: {
              id: HOP_A,
              system: "You are Jackfruit.",
              task: "Do the records.",
              tools: [{ name: "list_records", description: "List", inputSchema: { type: "object", properties: {} } }],
              role: "Agent.Jackfruit",
              answer: { summary: "handed" },
            },
          },
        };
      }
      if (rec.body.hop && rec.body.name === "list_records") return { body: { result: "two records" } };
      if (rec.body.name === "hop_done") return { body: { result: "closed" } };
      return { status: 404, body: { error: "unexpected tool" } };
    };
    const platform = await listen(handler);
    const box = connect({ origin: platform.origin, env: aiEnv(home, { FAKE_CLAUDE_LOG: logFile }) });
    const call = await box.request("tools/call", { name: "run_named_role", arguments: {} });
    expect(call.result.isError).toBe(false);
    const log = readFileSync(logFile, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    const argv = log[0].argv;
    const mcp = JSON.parse(argv[argv.indexOf("--mcp-config") + 1]);
    expect(Object.keys(mcp.mcpServers)).toEqual(["GilbPlatform"]);
    expect(mcp.mcpServers.gilb).toBeUndefined();
    const allowed = argv[argv.indexOf("--allowedTools") + 1];
    expect(allowed).toBe("mcp__GilbPlatform");
    expect(allowed).not.toBe("mcp__gilb");
  }, 15000);
});
