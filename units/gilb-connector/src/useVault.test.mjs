// @vitest-environment node
// gilbplatform_use_vault: the person names a vault, Claude Code's allow is the approval,
// and the connector keeps that vault for the rest of the process. The door is the local stand-in.
import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { aiNoGrant, aiNotBound, startConnector } from "../connector/gilb-connector.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FAKE_CLAUDE = join(HERE, "fake-claude.mjs");
const FAKE_COMPUTER = join(HERE, "fake-computer.mjs");
const CLIENT_ID = "agent-client-use-vault";
const TURN = "turn-use-vault-c8";
const HOP_A = "0123456789abcdef01234567";
const PERSON = "https://id.example.test/base/p/abc";
const AI_VAULT = "https://ai.example.test/base";
const NS = "https://testcarwashcouponapp.example.test/base";
const OTHER = "https://other.example.test/base";
const ALREADY = "https://already.example.test/base";
const SHOP_A = "https://shop.example.test/base";
const SHOP_B = "https://shop.other.test/base";
const USE_VAULT = "gilbplatform_use_vault";
const USE_VAULT_DESCRIPTION =
  "Select a vault the person named, for this session. Claude Code asks the person to allow it; their yes is what selects it. Pass the vault as the person said it: its name (for example testcarwashcouponapp), its host, or its address.";
const INSTRUCTIONS_FIRST =
  "When the person names a vault to work in, call gilbplatform_use_vault with the name they used before any other tool on that vault.";
const INSTRUCTIONS_SECOND =
  "Do not choose 'don't ask again' for gilbplatform_use_vault: every vault switch stays the person's decision.";
const AUTO_SELECT_SENTENCE =
  "If this AI can reach exactly one vault besides its own, that vault is selected automatically.";
const AUTO_VAULTS_NOTE = "(selected automatically: the only vault this AI can reach)";
const ONLY = "https://only.example.test/base";

const PLATFORM_TOOLS = [
  { name: "list_vaults", description: "List.", inputSchema: { type: "object", properties: {} } },
  { name: "read_record", description: "Read.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
];

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
  const dir = mkdtempSync(join(tmpdir(), "gilb-use-vault-"));
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
    const rec = { method: req.method, url: req.url ?? "", body };
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

function aiEnv(home, extra = {}) {
  return { PATH: process.env.PATH, HOME: home, GILB_HOME: home, GILB_CONNECTOR_HOME: home, ...extra };
}

function meEnv(extra = {}) {
  const home = scratch();
  return { PATH: process.env.PATH, HOME: home, GILB_HOME: home, GILB_CONNECTOR_COMPUTER_MODULE: FAKE_COMPUTER, ...extra };
}

/** The same door the other connector tests stand in: register, token, first-use, context, tool. */
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
      return {
        body: {
          system: `STANDING-KAI That person is identified as: ${state.principal}. Tools follow.`,
          tools: PLATFORM_TOOLS,
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

function vaultList(ids) {
  // The list_vaults answer the other fake door uses: { vaults: [namespace, ...] }.
  return { body: { result: JSON.stringify({ vaults: ids }) } };
}

function toolPosts(requests) {
  return requests.filter((rec) => rec.url.endsWith("/tool"));
}

async function boundBox(vaultIds, opts = {}) {
  const home = scratch();
  const state = {
    principal: AI_VAULT,
    onTool: (rec) => {
      if (rec.body.name === "list_vaults") return vaultList(vaultIds);
      return { body: { result: "tool-ok" } };
    },
  };
  const { handler } = door(state);
  const platform = await listen(handler);
  const box = connect({ origin: platform.origin, env: aiEnv(home), ...opts });
  return { platform, box };
}

function using(namespace, selected) {
  return `Using vault ${namespace} for this session. Selected vaults: ${selected.join(", ")}.`;
}

describe("gilbplatform_use_vault", () => {
  it("u1 a name selects that vault, and the next platform call sends it", async () => {
    const { platform, box } = await boundBox([NS, OTHER]);
    const listed = await box.request("tools/list", {});
    const contextsBefore = platform.requests.filter((rec) => rec.url.endsWith("/context")).length;
    expect(contextsBefore).toBe(1);

    const call = await box.request("tools/call", { name: USE_VAULT, arguments: { vault: "testcarwashcouponapp" } });
    expect(call.result.isError).toBe(false);
    expect(toolText(call)).toBe(using(NS, [NS]));

    const quoted = await box.request("tools/call", { name: USE_VAULT, arguments: { vault: '"TestCarWashCouponApp"' } });
    expect(quoted.result.isError).toBe(false);
    expect(toolText(quoted)).toBe(using(NS, [NS]));

    const listPosts = toolPosts(platform.requests).filter((rec) => rec.body.name === "list_vaults");
    expect(listPosts.length).toBeGreaterThan(0);
    expect(listPosts[0].body).toMatchObject({
      name: "list_vaults",
      arguments: "{}",
      turnId: TURN,
      agent: "Kai-Zen",
      userText: "Work with the person in Claude Code.",
    });
    expect(listPosts[0].body.contentVaultIds).toBeUndefined();

    const next = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(next.result.isError).toBe(false);
    const read = toolPosts(platform.requests).find((rec) => rec.body.name === "read_record");
    expect(read.body.contentVaultIds).toContain(NS);
    expect(read.body.turnId).toBe(TURN);

    const again = await box.request("tools/list", {});
    expect(again.result.tools.map((tool) => tool.name)).toContain(USE_VAULT);
    const contexts = platform.requests.filter((rec) => rec.url.endsWith("/context"));
    expect(contexts.length).toBe(contextsBefore + 1);
    expect(contexts[contexts.length - 1].body.contentVaultIds).toContain(NS);
  });

  it("u2 an address, a /vault path, and a host resolve to the same namespace", async () => {
    const { box } = await boundBox([NS, OTHER]);
    const forms = [
      "https://testcarwashcouponapp.example.test/vault/e/abc",
      "https://testcarwashcouponapp.example.test/vault",
      "https://testcarwashcouponapp.example.test/vault/",
      "https://testcarwashcouponapp.example.test/base",
      "https://testcarwashcouponapp.example.test/base/",
      "https://testcarwashcouponapp.example.test/base/e/abc",
      "https://TestCarWashCouponApp.Example.Test/vault",
      "testcarwashcouponapp.example.test",
    ];
    for (const form of forms) {
      const call = await box.request("tools/call", { name: USE_VAULT, arguments: { vault: form } });
      expect(toolText(call), form).toBe(using(NS, [NS]));
      expect(call.result.isError).toBe(false);
    }
  });

  it("u3 no match names the reachable vaults and changes nothing", async () => {
    const { platform, box } = await boundBox([NS, OTHER], { vaults: [ALREADY] });
    const call = await box.request("tools/call", { name: USE_VAULT, arguments: { vault: "missing" } });
    expect(call.result.isError).toBe(false);
    expect(toolText(call)).toBe(`No vault this AI can reach is called missing. It can reach: ${NS}, ${OTHER}.`);
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(who)).toContain(`vaults: ${ALREADY}`);
    expect(toolText(who)).not.toContain(NS);
    const next = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(toolText(next)).toBe("tool-ok");
    const read = toolPosts(platform.requests).find((rec) => rec.body.name === "read_record");
    expect(read.body.contentVaultIds).toEqual([ALREADY]);
  });

  it("u3 an empty list_vaults answer is the no-grant wording, and nothing is selected", async () => {
    const { platform, box } = await boundBox([]);
    const call = await box.request("tools/call", { name: USE_VAULT, arguments: { vault: "testcarwashcouponapp" } });
    expect(call.result.isError).toBe(true);
    expect(toolText(call)).toBe(aiNoGrant(undefined, AI_VAULT));
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(who)).toContain("vaults: none");
    const next = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(toolText(next)).toBe("tool-ok");
    const read = toolPosts(platform.requests).find((rec) => rec.body.name === "read_record");
    expect(read.body.contentVaultIds).toBeUndefined();
  });

  it("u4 two matches names both and changes nothing", async () => {
    const { platform, box } = await boundBox([SHOP_A, SHOP_B], { vaults: [ALREADY] });
    const call = await box.request("tools/call", { name: USE_VAULT, arguments: { vault: "shop" } });
    expect(call.result.isError).toBe(false);
    expect(toolText(call)).toBe(`More than one vault matches shop: ${SHOP_A}, ${SHOP_B}. Say which one.`);
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(who)).toContain(`vaults: ${ALREADY}`);
    expect(toolText(who)).not.toContain(SHOP_A);
    const next = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(toolText(next)).toBe("tool-ok");
    const read = toolPosts(platform.requests).find((rec) => rec.body.name === "read_record");
    expect(read.body.contentVaultIds).toEqual([ALREADY]);
  });

  it("u5 a hop started after use_vault receives the vault in --vault", async () => {
    const dir = scratch();
    const logFile = join(dir, "claude.log");
    const state = {
      onTool: (rec) => {
        if (rec.body.name === "list_vaults") return vaultList([NS, OTHER]);
        if (rec.body.name === "run_named_role" && !rec.body.hop) {
          return {
            body: {
              hop: {
                id: HOP_A,
                system: "You are Jackfruit.",
                task: "Do the records.",
                tools: [{ name: "list_records", description: "List", inputSchema: { type: "object", properties: {} } }],
                role: "Jackfruit",
                answer: { role: "Jackfruit", summary: "handed" },
              },
            },
          };
        }
        if (rec.body.hop && rec.body.name === "list_records") return { body: { result: "two records" } };
        if (rec.body.name === "hop_done") return { body: { result: "closed" } };
        return { status: 404, body: { error: "unexpected tool" } };
      },
    };
    const platform = await listen(async (rec) => {
      if (rec.url.endsWith("/tool")) return state.onTool(rec);
      return { status: 404, body: { error: "no such door" } };
    });
    const box = connect({
      origin: platform.origin,
      as: "me",
      vaults: [ALREADY],
      env: meEnv({ FAKE_CLAUDE_LOG: logFile }),
      claudeBin: FAKE_CLAUDE,
    });
    const selected = await box.request("tools/call", { name: USE_VAULT, arguments: { vault: "testcarwashcouponapp" } });
    expect(toolText(selected)).toBe(using(NS, [ALREADY, NS]));
    const hop = await box.request("tools/call", { name: "run_named_role", arguments: { role: "Jackfruit" } });
    expect(hop.result.isError).toBe(false);
    const log = readFileSync(logFile, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    const mcp = JSON.parse(log[0].argv[log[0].argv.indexOf("--mcp-config") + 1]);
    const args = mcp.mcpServers.GilbPlatform.args;
    const passed = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--vault") passed.push(args[i + 1]);
    }
    expect(passed).toEqual([ALREADY, NS]);
    const child = toolPosts(platform.requests).find((rec) => rec.body.name === "list_records");
    expect(child.body.contentVaultIds).toEqual([ALREADY, NS]);
  }, 15000);

  it("u6 whoami lists the selected vaults", async () => {
    const { box } = await boundBox([NS, OTHER]);
    const before = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(before.result.isError).toBe(false);
    expect(toolText(before)).toBe(`connector: 0.6.0\nmode: ai\nclient id: ${CLIENT_ID}\nprincipal: ${AI_VAULT}\nstate: bound\nvaults: none`);
    const call = await box.request("tools/call", { name: USE_VAULT, arguments: { vault: "testcarwashcouponapp" } });
    expect(toolText(call)).toBe(using(NS, [NS]));
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(who)).toBe(`connector: 0.6.0\nmode: ai\nclient id: ${CLIENT_ID}\nprincipal: ${AI_VAULT}\nstate: bound\nvaults: ${NS}`);
  });

  it("u7 not bound answers the not-bound sentence and selects nothing", async () => {
    const home = scratch();
    const state = { principal: PERSON, onTool: () => ({ body: { result: "should-not-run" } }) };
    const { handler } = door(state);
    const platform = await listen(handler);
    const box = connect({ origin: platform.origin, env: aiEnv(home) });
    const call = await box.request("tools/call", { name: USE_VAULT, arguments: { vault: "testcarwashcouponapp" } });
    expect(call.result.isError).toBe(true);
    expect(toolText(call)).toBe(aiNotBound(CLIENT_ID));
    expect(toolPosts(platform.requests)).toHaveLength(0);
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(who)).toContain("state: not bound");
    expect(toolText(who)).toContain("vaults: none");
    expect(toolText(who)).not.toContain(NS);
  });

  it("tools/list includes gilbplatform_use_vault with the exact description", async () => {
    const { box } = await boundBox([NS]);
    const init = await box.request("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
    expect(init.result.instructions).toContain(INSTRUCTIONS_FIRST);
    expect(init.result.instructions).toContain(INSTRUCTIONS_SECOND);
    expect(init.result.instructions).toContain(AUTO_SELECT_SENTENCE);
    const listed = await box.request("tools/list", {});
    const tool = listed.result.tools.find((item) => item.name === USE_VAULT);
    expect(tool).toBeTruthy();
    expect(tool.description).toBe(USE_VAULT_DESCRIPTION);
    expect(tool.inputSchema.required).toEqual(["vault"]);
    expect(tool.inputSchema.properties.vault.type).toBe("string");
  });

  it("a1 the only work vault is selected before the first tool call", async () => {
    const { platform, box } = await boundBox([AI_VAULT, ONLY]);
    const call = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(call.result.isError).toBe(false);
    expect(toolText(call)).toBe("tool-ok");
    const posts = toolPosts(platform.requests);
    expect(posts.map((rec) => rec.body.name)).toEqual(["list_vaults", "read_record"]);
    expect(posts[0].body.contentVaultIds).toBeUndefined();
    expect(posts[1].body.contentVaultIds).toEqual([ONLY]);
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(who)).toBe(
      `connector: 0.6.0\nmode: ai\nclient id: ${CLIENT_ID}\nprincipal: ${AI_VAULT}\nstate: bound\nvaults: ${ONLY} ${AUTO_VAULTS_NOTE}`,
    );
    const listed = await box.request("tools/list", {});
    expect(listed.result.tools.map((tool) => tool.name)).toContain("read_record");
    const contexts = platform.requests.filter((rec) => rec.url.endsWith("/context"));
    expect(contexts.length).toBeGreaterThanOrEqual(2);
    expect(contexts[contexts.length - 1].body.contentVaultIds).toEqual([ONLY]);
  });

  it("a2 two work vaults selects nothing", async () => {
    const { platform, box } = await boundBox([AI_VAULT, NS, OTHER]);
    const call = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(call.result.isError).toBe(false);
    expect(toolText(call)).toBe("tool-ok");
    const posts = toolPosts(platform.requests);
    expect(posts.map((rec) => rec.body.name)).toEqual(["list_vaults", "read_record"]);
    expect(posts[0].body.contentVaultIds).toBeUndefined();
    expect(posts[1].body.contentVaultIds).toBeUndefined();
    const again = await box.request("tools/call", { name: "read_record", arguments: { id: "2" } });
    expect(toolText(again)).toBe("tool-ok");
    const later = toolPosts(platform.requests);
    expect(later.filter((rec) => rec.body.name === "list_vaults")).toHaveLength(1);
    expect(later[later.length - 1].body.contentVaultIds).toBeUndefined();
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(who)).toBe(`connector: 0.6.0\nmode: ai\nclient id: ${CLIENT_ID}\nprincipal: ${AI_VAULT}\nstate: bound\nvaults: none`);
    expect(toolText(who)).not.toContain("selected automatically");
  });

  it("a3 only the AI's own vault selects nothing", async () => {
    const { platform, box } = await boundBox([AI_VAULT]);
    const call = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(call.result.isError).toBe(false);
    expect(toolText(call)).toBe("tool-ok");
    const posts = toolPosts(platform.requests);
    expect(posts.map((rec) => rec.body.name)).toEqual(["list_vaults", "read_record"]);
    expect(posts[1].body.contentVaultIds).toBeUndefined();
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(who)).toContain("vaults: none");
    expect(toolText(who)).not.toContain("selected automatically");
  });

  it("a4 --vault is kept and list_vaults is not called to auto-select", async () => {
    const { platform, box } = await boundBox([AI_VAULT, ONLY], { vaults: [ALREADY] });
    const call = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(call.result.isError).toBe(false);
    expect(toolText(call)).toBe("tool-ok");
    const posts = toolPosts(platform.requests);
    expect(posts.map((rec) => rec.body.name)).toEqual(["read_record"]);
    expect(posts[0].body.contentVaultIds).toEqual([ALREADY]);
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(who)).toContain(`vaults: ${ALREADY}`);
    expect(toolText(who)).not.toContain("selected automatically");
    expect(toolText(who)).not.toContain(ONLY);
  });

  it("a5 a vault picked with gilbplatform_use_vault is not replaced", async () => {
    const ids = [AI_VAULT, OTHER, NS];
    const { platform, box } = await boundBox(ids);
    const selected = await box.request("tools/call", { name: USE_VAULT, arguments: { vault: "testcarwashcouponapp" } });
    expect(selected.result.isError).toBe(false);
    expect(toolText(selected)).toBe(using(NS, [NS]));
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(who)).toBe(`connector: 0.6.0\nmode: ai\nclient id: ${CLIENT_ID}\nprincipal: ${AI_VAULT}\nstate: bound\nvaults: ${NS}`);
    expect(toolText(who)).not.toContain("selected automatically");
    const listsAfterPick = toolPosts(platform.requests).filter((rec) => rec.body.name === "list_vaults").length;
    ids.splice(0, ids.length, AI_VAULT, ONLY);
    const call = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(toolText(call)).toBe("tool-ok");
    const posts = toolPosts(platform.requests);
    const read = posts.find((rec) => rec.body.name === "read_record");
    expect(read.body.contentVaultIds).toEqual([NS]);
    expect(posts.filter((rec) => rec.body.name === "list_vaults")).toHaveLength(listsAfterPick);
  });

  it("a6 not bound does not auto-select", async () => {
    const home = scratch();
    const state = {
      principal: PERSON,
      onTool: (rec) => {
        if (rec.body.name === "list_vaults") return vaultList([AI_VAULT, ONLY]);
        return { body: { result: "should-not-run" } };
      },
    };
    const { handler } = door(state);
    const platform = await listen(handler);
    const box = connect({ origin: platform.origin, env: aiEnv(home) });
    const call = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(call.result.isError).toBe(true);
    expect(toolText(call)).toBe(aiNotBound(CLIENT_ID));
    expect(toolPosts(platform.requests)).toHaveLength(0);
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(who)).toContain("state: not bound");
    expect(toolText(who)).toContain("vaults: none");
    expect(toolText(who)).not.toContain("selected automatically");
    expect(toolText(who)).not.toContain(ONLY);
  });

  it("a7 --as me does not auto-select", async () => {
    const { platform, box } = await boundBox([ONLY], { as: "me", env: meEnv() });
    const call = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(call.result.isError).toBe(false);
    expect(toolText(call)).toBe("tool-ok");
    const posts = toolPosts(platform.requests);
    expect(posts.map((rec) => rec.body.name)).toEqual(["read_record"]);
    expect(posts[0].body.contentVaultIds).toBeUndefined();
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(who)).not.toContain("selected automatically");
    expect(toolText(who)).toContain("vaults: none");
  });

  it("a8 after not bound becomes bound, the only vault is selected on the next tool call", async () => {
    const home = scratch();
    const state = {
      principal: PERSON,
      onTool: (rec) => {
        if (rec.body.name === "list_vaults") return vaultList([AI_VAULT, ONLY]);
        return { body: { result: "tool-ok" } };
      },
    };
    const { handler } = door(state);
    const platform = await listen(handler);
    const box = connect({ origin: platform.origin, env: aiEnv(home) });
    const early = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(early.result.isError).toBe(true);
    expect(toolText(early)).toBe(aiNotBound(CLIENT_ID));
    expect(toolPosts(platform.requests)).toHaveLength(0);

    state.principal = AI_VAULT;
    const call = await box.request("tools/call", { name: "read_record", arguments: { id: "2" } });
    expect(call.result.isError).toBe(false);
    expect(toolText(call)).toBe("tool-ok");
    const posts = toolPosts(platform.requests);
    expect(posts.map((rec) => rec.body.name)).toEqual(["list_vaults", "read_record"]);
    expect(posts[0].body.contentVaultIds).toBeUndefined();
    expect(posts[1].body.contentVaultIds).toEqual([ONLY]);
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(who)).toContain(`vaults: ${ONLY} ${AUTO_VAULTS_NOTE}`);
  });
});
