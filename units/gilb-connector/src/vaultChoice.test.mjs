// @vitest-environment node
// The person's vault choice survives a reconnect (/mcp) in the same chat, and only then. The door is the local stand-in.
import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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

function using(namespace, selected) {
  return `Using vault ${namespace} for this session. Selected vaults: ${selected.join(", ")}.`;
}

const PARENT = { pid: 4242, started: "Thu Nov 12 09:00:00 2026" };
const CHOICE = (home) => join(home, "default", "vault-choice.json");

/** One connector process under a chat. Several boxes over one home stand for /mcp reconnects. */
async function chat(state, home, opts = {}) {
  const { handler } = door(state);
  const platform = await listen(handler);
  const box = connect({ origin: platform.origin, env: aiEnv(home), parent: PARENT, ...opts });
  return { platform, box };
}

function stateFor(listed) {
  return {
    principal: AI_VAULT,
    listed,
    onTool(rec) {
      if (rec.body.name === "list_vaults") return vaultList(this.listed);
      return { body: { result: "tool-ok" } };
    },
  };
}

const whoami = async (box) => toolText(await box.request("tools/call", { name: "gilbplatform_whoami", arguments: {} }));
const pick = (box, vault) => box.request("tools/call", { name: USE_VAULT, arguments: { vault } });
const RESTORED = (v) => `(restored from your earlier choice in this chat: ${v})`;

describe("a vault choice survives a reconnect in the same chat", () => {
  it("the person's choice is written 0600 under the profile directory", async () => {
    const home = scratch();
    const { box } = await chat(stateFor([AI_VAULT, NS, OTHER]), home);
    expect(toolText(await pick(box, "testcarwashcouponapp"))).toBe(using(NS, [NS]));
    expect(existsSync(CHOICE(home))).toBe(true);
    expect(statSync(CHOICE(home)).mode & 0o777).toBe(0o600);
    const saved = JSON.parse(readFileSync(CHOICE(home), "utf8"));
    expect(saved).toMatchObject({ client: CLIENT_ID, ppid: PARENT.pid, started: PARENT.started, vaults: [NS] });
  });

  it("same parent: the next connector process has the vault back, and whoami says so", async () => {
    const home = scratch();
    const state = stateFor([AI_VAULT, NS, OTHER]);
    const first = await chat(state, home);
    await pick(first.box, "testcarwashcouponapp");
    const second = await chat(state, home);
    const who = await whoami(second.box);
    expect(who).toContain(`vaults: ${NS} ${RESTORED(NS)}`);
    const call = await second.box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(call.result.isError).toBe(false);
    const reads = toolPosts(second.platform.requests).filter((rec) => rec.body.name === "read_record");
    expect(reads[0].body.contentVaultIds).toEqual([NS]);
  });

  it("a different parent (a new chat) restores nothing", async () => {
    const home = scratch();
    const state = stateFor([AI_VAULT, NS, OTHER]);
    const first = await chat(state, home);
    await pick(first.box, "testcarwashcouponapp");
    for (const parent of [{ ...PARENT, pid: 4243 }, { ...PARENT, started: "Thu Nov 12 10:00:00 2026" }, null]) {
      const next = await chat(state, home, { parent });
      expect(await whoami(next.box)).toContain("vaults: none");
    }
  });

  it("older than 12 hours: not restored", async () => {
    const home = scratch();
    const state = stateFor([AI_VAULT, NS, OTHER]);
    const first = await chat(state, home);
    await pick(first.box, "testcarwashcouponapp");
    const saved = JSON.parse(readFileSync(CHOICE(home), "utf8"));
    const early = saved.savedAt + 11 * 60 * 60 * 1000;
    const second = await chat(state, home, { nowMs: () => early });
    expect(await whoami(second.box)).toContain(`vaults: ${NS} ${RESTORED(NS)}`);
    const later = saved.savedAt + 12 * 60 * 60 * 1000 + 1000;
    const third = await chat(state, home, { nowMs: () => later });
    expect(await whoami(third.box)).toContain("vaults: none");
  });

  it("a vault no longer listed is not restored, and the file is cleared", async () => {
    const home = scratch();
    const state = stateFor([AI_VAULT, NS, OTHER]);
    const first = await chat(state, home);
    await pick(first.box, "testcarwashcouponapp");
    state.listed = [AI_VAULT, OTHER];
    const second = await chat(state, home);
    expect(await whoami(second.box)).toContain("vaults: none");
    expect(existsSync(CHOICE(home))).toBe(false);
  });

  it("an automatic selection is never written, so never comes back", async () => {
    const home = scratch();
    const state = stateFor([AI_VAULT, ONLY]);
    const first = await chat(state, home);
    const call = await first.box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    expect(call.result.isError).toBe(false);
    expect(await whoami(first.box)).toContain(AUTO_VAULTS_NOTE);
    expect(existsSync(CHOICE(home))).toBe(false);
    state.listed = [AI_VAULT, ONLY, NS];
    const second = await chat(state, home);
    expect(await whoami(second.box)).toContain("vaults: none");
  });

  it("a person's choice after an automatic one is remembered; --vault alone is not", async () => {
    const home = scratch();
    const state = stateFor([AI_VAULT, ONLY]);
    const first = await chat(state, home);
    await first.box.request("tools/call", { name: "read_record", arguments: { id: "1" } });
    await pick(first.box, "only");
    expect(JSON.parse(readFileSync(CHOICE(home), "utf8")).vaults).toEqual([ONLY]);
    const home2 = scratch();
    await chat(state, home2, { vaults: [NS] });
    expect(existsSync(CHOICE(home2))).toBe(false);
  });
});
