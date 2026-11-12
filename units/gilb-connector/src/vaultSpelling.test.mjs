// @vitest-environment node
// /base and /vault are the platform's two spellings of one vault. The door is the local stand-in.
import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { aiNotBound, startConnector } from "../connector/gilb-connector.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FAKE_CLAUDE = join(HERE, "fake-claude.mjs");
const CLIENT_ID = "agent-client-vault-spelling";
const TURN = "turn-vault-spelling-d1";
const JOHN_VAULT = "https://johnsaihelper.example.test/vault";
const JOHN_BASE = "https://johnsaihelper.example.test/base";
const AI_BASE = "https://ai.example.test/base";
const HOST_A_VAULT = "https://hosta.example.test/vault";
const HOST_A_BASE = "https://hosta.example.test/base";
const HOST_B_VAULT = "https://hostb.example.test/vault";
const CHOSEN_VAULT = "https://chosen.example.test/vault";
const CHOSEN_BASE = "https://chosen.example.test/base";
const NEWONE_VAULT = "https://newone.example.test/vault";
const RECORD_PATH = "https://x.example.test/vault/e/abc";
const OTHER_PATH = "https://x.example.test/other";
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
  const dir = mkdtempSync(join(tmpdir(), "gilb-vault-spelling-"));
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

function aiEnv(home) {
  return { PATH: process.env.PATH, HOME: home, GILB_HOME: home, GILB_CONNECTOR_HOME: home };
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

function whoamiBound(principal, vaultsLine) {
  return `connector: 0.6.0\nmode: ai\nclient id: ${CLIENT_ID}\nprincipal: ${principal}\nstate: bound\nvaults: ${vaultsLine}`;
}

async function openBox(state) {
  const home = scratch();
  const { handler } = door(state);
  const platform = await listen(handler);
  const box = connect({ origin: platform.origin, env: aiEnv(home) });
  return { platform, box };
}

describe("vault namespace spelling", () => {
  it("v1 a /vault principal is bound, and a platform tool runs", async () => {
    const { platform, box } = await openBox({
      principal: JOHN_VAULT,
      onTool: () => ({ body: { result: "tool-ok" } }),
    });
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(who.result.isError).toBe(false);
    expect(toolText(who)).toBe(whoamiBound(JOHN_VAULT, "none"));
    expect(toolText(who)).not.toContain("This AI is not bound");

    const call = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(call.result.isError).toBe(false);
    expect(toolText(call)).toBe("tool-ok");
    expect(toolText(call)).not.toContain("This AI is not bound");
    const read = toolPosts(platform.requests).find((rec) => rec.body.name === "read_record");
    expect(read).toBeTruthy();
    expect(read.body.name).toBe("read_record");
  });

  it("v2 a /base principal is still bound", async () => {
    const { platform, box } = await openBox({
      principal: JOHN_BASE,
      onTool: () => ({ body: { result: "tool-ok" } }),
    });
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(who.result.isError).toBe(false);
    expect(toolText(who)).toBe(whoamiBound(JOHN_BASE, "none"));
    expect(toolText(who)).not.toContain("This AI is not bound");

    const call = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(call.result.isError).toBe(false);
    expect(toolText(call)).toBe("tool-ok");
    expect(toolText(call)).not.toContain("This AI is not bound");
    const read = toolPosts(platform.requests).find((rec) => rec.body.name === "read_record");
    expect(read).toBeTruthy();
  });

  it("v3 auto-select leaves out the AI's own vault when list_vaults spells it /base", async () => {
    const { platform, box } = await openBox({
      principal: HOST_A_VAULT,
      onTool: (rec) => {
        if (rec.body.name === "list_vaults") return vaultList([HOST_A_BASE, HOST_B_VAULT]);
        return { body: { result: "tool-ok" } };
      },
    });
    const call = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(call.result.isError).toBe(false);
    expect(toolText(call)).toBe("tool-ok");
    expect(toolText(call)).not.toContain("This AI is not bound");
    const posts = toolPosts(platform.requests);
    expect(posts.map((rec) => rec.body.name)).toEqual(["list_vaults", "read_record"]);
    expect(posts[1].body.contentVaultIds).toEqual([HOST_B_VAULT]);
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(who)).toBe(whoamiBound(HOST_A_VAULT, `${HOST_B_VAULT} ${AUTO_VAULTS_NOTE}`));
  });

  it("v4 a /vault list id is stored as given, and the /base spelling of that host is not added", async () => {
    let ids = [CHOSEN_VAULT];
    const { box } = await openBox({
      principal: AI_BASE,
      onTool: (rec) => {
        if (rec.body.name === "list_vaults") return vaultList(ids);
        return { body: { result: "tool-ok" } };
      },
    });
    const first = await box.request("tools/call", { name: "gilbplatform_use_vault", arguments: { vault: CHOSEN_VAULT } });
    expect(first.result.isError).toBe(false);
    expect(toolText(first)).toBe(`Using vault ${CHOSEN_VAULT} for this session. Selected vaults: ${CHOSEN_VAULT}.`);

    ids = [CHOSEN_BASE];
    const second = await box.request("tools/call", { name: "gilbplatform_use_vault", arguments: { vault: CHOSEN_BASE } });
    expect(second.result.isError).toBe(false);
    expect(toolText(second)).toBe(`Using vault ${CHOSEN_BASE} for this session. Selected vaults: ${CHOSEN_VAULT}.`);
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(who)).toBe(whoamiBound(AI_BASE, CHOSEN_VAULT));
    expect(toolText(who)).not.toContain(CHOSEN_BASE);
  });

  it("v5 create_vault with a /vault vaultId selects that id", async () => {
    const doorJson = JSON.stringify({ vaultId: NEWONE_VAULT, created: true });
    const { box } = await openBox({
      principal: AI_BASE,
      onTool: (rec) => {
        if (rec.body.name === "create_vault") return { body: { result: doorJson } };
        return { body: { result: "tool-ok" } };
      },
    });
    const call = await box.request("tools/call", { name: "create_vault", arguments: { name: "newone" } });
    expect(call.result.isError).toBe(false);
    expect(call.result.content).toHaveLength(2);
    expect(call.result.content[0]).toEqual({ type: "text", text: doorJson });
    expect(call.result.content[1]).toEqual({
      type: "text",
      text: `Selected for this session: ${NEWONE_VAULT}. Selected vaults: ${NEWONE_VAULT}.`,
    });
    const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
    expect(toolText(who)).toBe(whoamiBound(AI_BASE, NEWONE_VAULT));
  });

  it("v6 a record path and another path are still not a namespace", async () => {
    for (const principal of [RECORD_PATH, OTHER_PATH]) {
      const { platform, box } = await openBox({
        principal,
        onTool: () => ({ body: { result: "should-not-run" } }),
      });
      const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
      expect(toolText(who), principal).toContain("state: not bound");
      expect(toolText(who), principal).toContain(aiNotBound(CLIENT_ID));
      const call = await box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
      expect(call.result.isError, principal).toBe(true);
      expect(toolText(call), principal).toBe(aiNotBound(CLIENT_ID));
      expect(toolPosts(platform.requests), principal).toHaveLength(0);
    }

    for (const vaultId of [RECORD_PATH, OTHER_PATH]) {
      const doorJson = JSON.stringify({ vaultId, created: true });
      const { box } = await openBox({
        principal: AI_BASE,
        onTool: (rec) => {
          if (rec.body.name === "create_vault") return { body: { result: doorJson } };
          return { body: { result: "tool-ok" } };
        },
      });
      const call = await box.request("tools/call", { name: "create_vault", arguments: { name: "x" } });
      expect(call.result.content, vaultId).toHaveLength(1);
      expect(call.result.content[0], vaultId).toEqual({ type: "text", text: doorJson });
      const who = await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} });
      expect(toolText(who), vaultId).toContain("vaults: none");
      expect(toolText(who), vaultId).not.toContain("Selected");
    }
  });
});
