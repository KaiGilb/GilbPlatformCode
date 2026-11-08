// @vitest-environment node
// create_vault: the person's allow of that call selects the new vault for the session.
// The door is the same local stand-in useVault.test.mjs uses.
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
const FAKE_COMPUTER = join(HERE, "fake-computer.mjs");
const CLIENT_ID = "agent-client-created-vault";
const TURN = "turn-created-vault-b2";
const HOP_A = "0123456789abcdef01234567";
const AI_VAULT = "https://ai.example.test/base";
const NS = "https://testcarwashcouponapp.example.test/base";
const NS_OTHER_CASE = "https://TestCarWashCouponApp.example.test/base";
const OTHER = "https://other.example.test/base";
const ALREADY = "https://already.example.test/base";
const ONLY = "https://only.example.test/base";
const MADE = "https://made.example.test/base";
const USE_VAULT = "gilbplatform_use_vault";
const INSTRUCTIONS_SECOND =
  "Do not choose 'don't ask again' for gilbplatform_use_vault: every vault switch stays the person's decision.";
const SELECT_SENTENCE =
  "A vault you make with create_vault is selected for the session at once; one made inside a hand-off is selected when the hand-off ends.";
const AUTO_VAULTS_NOTE = "(selected automatically: the only vault this AI can reach)";

const PLATFORM_TOOLS = [
  { name: "list_vaults", description: "List.", inputSchema: { type: "object", properties: {} } },
  { name: "create_vault", description: "Create.", inputSchema: { type: "object", properties: { name: { type: "string" } } } },
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
  const dir = mkdtempSync(join(tmpdir(), "gilb-created-vault-"));
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
  return { body: { result: JSON.stringify({ vaults: ids }) } };
}

function toolPosts(requests) {
  return requests.filter((rec) => rec.url.endsWith("/tool"));
}

function made(fields = {}) {
  return JSON.stringify({
    vault: `${NS}/e/made`,
    vaultId: NS,
    name: "testcarwashcouponapp",
    parent: AI_VAULT,
    represents: null,
    created: true,
    ...fields,
  });
}

function selectedFor(namespace, selected) {
  return `Selected for this session: ${namespace}. Selected vaults: ${selected.join(", ")}.`;
}

async function boundBox(onTool, opts = {}) {
  const home = scratch();
  const state = { principal: AI_VAULT, onTool };
  const { handler } = door(state);
  const platform = await listen(handler);
  const box = connect({ origin: platform.origin, env: aiEnv(home), ...opts });
  return { platform, box };
}

describe("create_vault selects the vault", () => {
  it("s1 a created vault is selected, and the answer keeps the door JSON", async () => {
    const doorJson = made();
    const { platform, box } = await boundBox((rec) => {
      if (rec.body.name === "list_vaults") return vaultList([AI_VAULT, NS, OTHER]);
      if (rec.body.name === "create_vault") return { body: { result: doorJson } };
      return { body: { result: "tool-ok" } };
    });
    const call = await box.request("tools/call", { name: "create_vault", arguments: { name: "testcarwashcouponapp" } });
    expect(call.result.isError).toBe(false);
    expect(call.result.content).toHaveLength(2);
    expect(call.result.content[0]).toEqual({ type: "text", text: doorJson });
    expect(call.result.content[1]).toEqual({ type: "text", text: selectedFor(NS, [NS]) });

    const next = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(next.result.isError).toBe(false);
    expect(toolText(next)).toBe("tool-ok");
    const read = toolPosts(platform.requests).find((rec) => rec.body.name === "read_record");
    expect(read.body.contentVaultIds).toContain(NS);
  });

  it("s2 an already-held name (existing true) is selected the same way", async () => {
    const doorJson = made({
      created: false,
      existing: true,
      message: "That name is already held.",
    });
    const { platform, box } = await boundBox((rec) => {
      if (rec.body.name === "list_vaults") return vaultList([AI_VAULT, NS, OTHER]);
      if (rec.body.name === "create_vault") return { body: { result: doorJson } };
      return { body: { result: "tool-ok" } };
    });
    const call = await box.request("tools/call", { name: "create_vault", arguments: { name: "testcarwashcouponapp" } });
    expect(call.result.isError).toBe(false);
    expect(call.result.content).toHaveLength(2);
    expect(call.result.content[0]).toEqual({ type: "text", text: doorJson });
    expect(call.result.content[1]).toEqual({ type: "text", text: selectedFor(NS, [NS]) });
    const next = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(toolText(next)).toBe("tool-ok");
    const read = toolPosts(platform.requests).find((rec) => rec.body.name === "read_record");
    expect(read.body.contentVaultIds).toContain(NS);
  });

  it("s3 an error, created false, a non-namespace vaultId, or non-JSON selects nothing", async () => {
    const cases = [
      {
        label: "error",
        result: JSON.stringify({ error: "the name is refused", status: 409, created: true, vaultId: NS }),
        isError: true,
      },
      {
        label: "created false",
        result: made({ created: false }),
        isError: false,
      },
      {
        label: "no vaultId",
        result: JSON.stringify({
          vault: `${NS}/e/made`,
          name: "testcarwashcouponapp",
          parent: AI_VAULT,
          represents: null,
          created: true,
        }),
        isError: false,
      },
      {
        label: "vaultId not a namespace",
        result: made({ vaultId: `${NS}/e/made` }),
        isError: false,
      },
      {
        label: "non-json",
        result: "not json",
        isError: false,
      },
    ];
    for (const item of cases) {
      const { platform, box } = await boundBox((rec) => {
        if (rec.body.name === "list_vaults") return vaultList([AI_VAULT, NS, OTHER]);
        if (rec.body.name === "create_vault") return { body: { result: item.result } };
        return { body: { result: "tool-ok" } };
      });
      const call = await box.request("tools/call", { name: "create_vault", arguments: { name: "testcarwashcouponapp" } });
      expect(call.result.isError, item.label).toBe(item.isError);
      expect(call.result.content, item.label).toHaveLength(1);
      expect(call.result.content[0], item.label).toEqual({ type: "text", text: item.result });
      const next = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
      expect(toolText(next), item.label).toBe("tool-ok");
      const read = toolPosts(platform.requests).find((rec) => rec.body.name === "read_record");
      expect(read.body.contentVaultIds, item.label).toBeUndefined();
    }
  });

  it("s4 a vault already selected by use_vault is not duplicated, and the list keeps order", async () => {
    let creates = 0;
    const same = made();
    const otherCase = made({ vaultId: NS_OTHER_CASE });
    const { platform, box } = await boundBox(
      (rec) => {
        if (rec.body.name === "list_vaults") return vaultList([NS, OTHER]);
        if (rec.body.name === "create_vault") {
          creates += 1;
          return { body: { result: creates === 1 ? same : otherCase } };
        }
        return { body: { result: "tool-ok" } };
      },
      { vaults: [ALREADY] },
    );
    const picked = await box.request("tools/call", { name: USE_VAULT, arguments: { vault: "testcarwashcouponapp" } });
    expect(picked.result.isError).toBe(false);
    expect(toolText(picked)).toBe(`Using vault ${NS} for this session. Selected vaults: ${ALREADY}, ${NS}.`);

    const again = await box.request("tools/call", { name: "create_vault", arguments: { name: "testcarwashcouponapp" } });
    expect(again.result.isError).toBe(false);
    expect(again.result.content).toHaveLength(2);
    expect(again.result.content[0]).toEqual({ type: "text", text: same });
    expect(again.result.content[1]).toEqual({ type: "text", text: selectedFor(NS, [ALREADY, NS]) });

    const cased = await box.request("tools/call", { name: "create_vault", arguments: { name: "testcarwashcouponapp" } });
    expect(cased.result.isError).toBe(false);
    expect(cased.result.content[0]).toEqual({ type: "text", text: otherCase });
    expect(cased.result.content[1]).toEqual({ type: "text", text: selectedFor(NS_OTHER_CASE, [ALREADY, NS]) });

    const next = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(toolText(next)).toBe("tool-ok");
    const read = toolPosts(platform.requests).find((rec) => rec.body.name === "read_record");
    expect(read.body.contentVaultIds).toEqual([ALREADY, NS]);
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(who)).toContain(`vaults: ${ALREADY}, ${NS}`);
    expect(toolText(who)).not.toContain(NS_OTHER_CASE);
  });

  it("s5 after the only reachable vault is selected automatically, create_vault adds the new one", async () => {
    const doorJson = made({ vault: `${MADE}/e/made`, vaultId: MADE, name: "made" });
    const { platform, box } = await boundBox((rec) => {
      if (rec.body.name === "list_vaults") return vaultList([AI_VAULT, ONLY]);
      if (rec.body.name === "create_vault") return { body: { result: doorJson } };
      return { body: { result: "tool-ok" } };
    });
    const first = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(toolText(first)).toBe("tool-ok");
    const before = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(before)).toContain(`vaults: ${ONLY} ${AUTO_VAULTS_NOTE}`);

    const call = await box.request("tools/call", { name: "create_vault", arguments: { name: "made" } });
    expect(call.result.isError).toBe(false);
    expect(call.result.content).toHaveLength(2);
    expect(call.result.content[0]).toEqual({ type: "text", text: doorJson });
    expect(call.result.content[1]).toEqual({ type: "text", text: selectedFor(MADE, [ONLY, MADE]) });

    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(who)).toContain(`vaults: ${ONLY}, ${MADE}`);
    expect(toolText(who)).not.toContain("selected automatically");
    const next = await box.request("tools/call", { name: "read_record", arguments: { id: "2" } });
    expect(toolText(next)).toBe("tool-ok");
    const reads = toolPosts(platform.requests).filter((rec) => rec.body.name === "read_record");
    expect(reads[reads.length - 1].body.contentVaultIds).toEqual([ONLY, MADE]);
  });

  it("s6 a hop started after create_vault receives the new vault in --vault", async () => {
    const dir = scratch();
    const logFile = join(dir, "claude.log");
    const doorJson = made();
    const state = {
      onTool: (rec) => {
        if (rec.body.name === "create_vault" && !rec.body.hop) return { body: { result: doorJson } };
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
    const selected = await box.request("tools/call", { name: "create_vault", arguments: { name: "testcarwashcouponapp" } });
    expect(selected.result.isError).toBe(false);
    expect(selected.result.content).toHaveLength(2);
    expect(selected.result.content[0]).toEqual({ type: "text", text: doorJson });
    expect(selected.result.content[1]).toEqual({ type: "text", text: selectedFor(NS, [ALREADY, NS]) });
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

  it("s7 a create_vault inside a hop is selected when the hop ends", async () => {
    const firstJson = made();
    const secondJson = made({ vaultId: OTHER, vault: `${OTHER}/e/made`, name: "other" });
    let creates = 0;
    const platform = await listen(async (rec) => {
      if (!rec.url.endsWith("/tool")) return { status: 404, body: { error: "no such door" } };
      if (rec.body.name === "run_named_role" && !rec.body.hop) {
        return {
          body: {
            hop: {
              id: HOP_A,
              system: "You are Jackfruit.",
              task: "Make two vaults. EACHTOOL",
              tools: [
                { name: "create_vault", description: "Create.", inputSchema: { type: "object", properties: {} } },
                { name: "create_vault", description: "Create another.", inputSchema: { type: "object", properties: {} } },
              ],
              role: "Jackfruit",
              answer: { role: "Jackfruit", summary: "handed" },
            },
          },
        };
      }
      if (rec.body.hop && rec.body.name === "create_vault") {
        creates += 1;
        return { body: { result: creates === 1 ? firstJson : secondJson } };
      }
      if (rec.body.name === "hop_done") return { body: { result: JSON.stringify({ closed: true }) } };
      if (rec.body.name === "read_record") return { body: { result: "tool-ok" } };
      return { status: 404, body: { error: "unexpected tool" } };
    });
    const box = connect({ origin: platform.origin, as: "me", vaults: [ALREADY], env: meEnv(), claudeBin: FAKE_CLAUDE });
    const hop = await box.request("tools/call", { name: "run_named_role", arguments: { role: "Jackfruit" } });
    expect(hop.result.isError).toBe(false);
    const madePosts = toolPosts(platform.requests).filter((rec) => rec.body.name === "create_vault");
    expect(madePosts).toHaveLength(2);
    expect(madePosts[0].body.hop).toEqual({ id: HOP_A });
    expect(madePosts[0].body.contentVaultIds).toEqual([ALREADY]);
    expect(madePosts[1].body.contentVaultIds).toEqual([ALREADY]);
    const next = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(toolText(next)).toBe("tool-ok");
    const read = toolPosts(platform.requests).find((rec) => rec.body.name === "read_record");
    expect(read.body.hop).toBeUndefined();
    expect(read.body.contentVaultIds).toEqual([ALREADY, NS, OTHER]);
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(who).split("\n")[0]).toBe("connector: 0.5.11");
    expect(toolText(who)).toContain(`vaults: ${ALREADY}, ${NS}, ${OTHER}`);
  }, 15000);

  it("s8 a hop whose create_vault succeeded but the hop then fails selects nothing", async () => {
    const doorJson = made();
    const platform = await listen(async (rec) => {
      if (!rec.url.endsWith("/tool")) return { status: 404, body: { error: "no such door" } };
      if (rec.body.name === "run_named_role" && !rec.body.hop) {
        return {
          body: {
            hop: {
              id: HOP_A,
              system: "You are Jackfruit.",
              task: "Make it FAILAFTERTOOL",
              tools: [{ name: "create_vault", description: "Create.", inputSchema: { type: "object", properties: {} } }],
              role: "Jackfruit",
              answer: { role: "Jackfruit", summary: "handed" },
            },
          },
        };
      }
      if (rec.body.hop && rec.body.name === "create_vault") return { body: { result: doorJson } };
      if (rec.body.name === "hop_done") return { body: { result: JSON.stringify({ closed: true }) } };
      if (rec.body.name === "read_record") return { body: { result: "tool-ok" } };
      return { status: 404, body: { error: "unexpected tool" } };
    });
    const box = connect({ origin: platform.origin, as: "me", vaults: [ALREADY], env: meEnv(), claudeBin: FAKE_CLAUDE });
    const hop = await box.request("tools/call", { name: "run_named_role", arguments: { role: "Jackfruit" } });
    expect(hop.result.isError).toBe(true);
    const madePosts = toolPosts(platform.requests).filter((rec) => rec.body.name === "create_vault");
    expect(madePosts).toHaveLength(1);
    expect(madePosts[0].body.hop).toEqual({ id: HOP_A });
    const next = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(toolText(next)).toBe("tool-ok");
    const read = toolPosts(platform.requests).find((rec) => rec.body.name === "read_record");
    expect(read.body.contentVaultIds).toEqual([ALREADY]);
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(who)).toContain(`vaults: ${ALREADY}`);
    expect(toolText(who)).not.toContain(NS);
  }, 15000);

  it("s9 a create_vault in the main process is still selected at once", async () => {
    const doorJson = made();
    const { platform, box } = await boundBox((rec) => {
      if (rec.body.name === "list_vaults") return vaultList([AI_VAULT, NS, OTHER]);
      if (rec.body.name === "create_vault") return { body: { result: doorJson } };
      return { body: { result: "tool-ok" } };
    });
    const call = await box.request("tools/call", { name: "create_vault", arguments: { name: "testcarwashcouponapp" } });
    expect(call.result.isError).toBe(false);
    expect(call.result.content).toHaveLength(2);
    expect(call.result.content[0]).toEqual({ type: "text", text: doorJson });
    expect(call.result.content[1]).toEqual({ type: "text", text: selectedFor(NS, [NS]) });
    const next = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(toolText(next)).toBe("tool-ok");
    const read = toolPosts(platform.requests).find((rec) => rec.body.name === "read_record");
    expect(read.body.hop).toBeUndefined();
    expect(read.body.contentVaultIds).toContain(NS);
  });

  it("initialize says a vault made with create_vault is selected at once", async () => {
    const { box } = await boundBox(() => ({ body: { result: "tool-ok" } }));
    const init = await box.request("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
    const text = init.result.instructions;
    expect(text.indexOf(SELECT_SENTENCE)).toBeGreaterThan(text.indexOf(INSTRUCTIONS_SECOND));
    const mePlatform = await listen(async () => ({ status: 404, body: { error: "no such door" } }));
    const me = connect({ origin: mePlatform.origin, as: "me", env: meEnv() });
    const meInit = await me.request("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
    const meText = meInit.result.instructions;
    expect(meText.indexOf(SELECT_SENTENCE)).toBeGreaterThan(meText.indexOf(INSTRUCTIONS_SECOND));
    expect(meText).not.toContain("selected automatically");
  });
});
