// @vitest-environment node
// 0.6.3 (EESpeed R10 C1): a connect-phase timeout is a never-arrived write and is retried; write_plan_card carries one
// idempotency key per call; a write with no answer gives an unknown-outcome handle that gilbplatform_call_status can follow up.
import { afterEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startConnector } from "../connector/gilb-connector.mjs";

const TURN = "turn-call-status-r10c1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const closers = [];
const dirs = [];
const opened = [];

afterEach(async () => {
  vi.restoreAllMocks();
  const boxes = opened.splice(0);
  for (const box of boxes) box.session.close();
  await Promise.race([
    Promise.all(boxes.map((box) => box.session.done)),
    new Promise((_, reject) => setTimeout(() => reject(new Error("session did not stop")), 8000)),
  ]);
  for (const box of boxes) {
    box.input.destroy();
    box.output.destroy();
  }
  for (const close of closers.splice(0)) await close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const TOOLS = ["list_vaults", "make_thing", "write_plan_card", "write_plan_table"].map((name) => ({ name, description: name, inputSchema: { type: "object", properties: {} } }));

function listen() {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const url = req.url ?? "";
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = { raw };
    }
    requests.push({ url, body });
    if (url.endsWith("/base/client/register")) return send(200, { clientId: "agent-call-status", created: true, confersAuthority: false });
    if (url.endsWith("/base/oauth/token")) return send(200, { access_token: `atk-${requests.length}`, token_type: "DPoP", expires_in: 300, scope: "base.write" });
    if (url.endsWith("/base/e/first-use")) return send(404, { error: "not_found" });
    if (url.endsWith("/context")) return send(200, { system: "STANDING That person is identified as: https://example.test/base. Tools follow.", tools: TOOLS });
    if (url.endsWith("/tool")) return send(200, { result: "tool-ok" });
    return send(404, { error: "no such door" });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      closers.push(() => new Promise((done) => server.close(() => done())));
      resolve({ origin: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`, requests });
    });
  });
}

/**
 * Wraps fetch: the next calls to the tool door whose tool is `name` reject with `failures` (each an error `cause`), then the
 * real fetch answers. Returns the bodies the connector tried to send, failed or not.
 */
function scriptFetch(name, failures) {
  const real = globalThis.fetch;
  const tries = [];
  const queue = [...failures];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (String(url).endsWith("/tool") && init?.body && JSON.parse(String(init.body)).name === name) {
      tries.push(JSON.parse(String(init.body)));
      if (queue.length > 0) throw Object.assign(new TypeError("fetch failed"), { cause: queue.shift() });
    }
    return real(url, init);
  });
  return tries;
}

function connect(origin) {
  const home = mkdtempSync(join(tmpdir(), "gilb-callstatus-"));
  dirs.push(home);
  const input = new PassThrough();
  const output = new PassThrough();
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
    as: "ai",
    origin,
    profile: "default",
    retryDelaysMs: [5, 5, 5],
    env: { PATH: process.env.PATH, HOME: home, GILB_HOME: home, GILB_CONNECTOR_HOME: home },
  });
  opened.push({ session, input, output });
  let nextId = 1;
  const call = (name, args = {}) => {
    const id = nextId++;
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no answer for ${name}`)), 8000);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
    input.write(JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }) + "\n");
    return result;
  };
  return { call };
}

const text = (msg) => msg.result.content[0].text;
const quiet = () => vi.spyOn(process.stderr, "write").mockImplementation(() => true);
const err = (code, syscall, extra = {}) => Object.assign(new Error(code), { code, ...(syscall ? { syscall } : {}), ...extra });
const toolPosts = (platform, name) => platform.requests.filter((r) => r.url.endsWith("/tool") && r.body.name === name);

describe("never arrived: connect-phase failures are retried", () => {
  const CODES = ["ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH"];

  for (const code of CODES) {
    it(`${code} on connect: the write is tried again and then runs once`, async () => {
      quiet();
      const platform = await listen();
      const tries = scriptFetch("make_thing", [err(code, "connect"), err(code, "connect")]);
      const out = await connect(platform.origin).call("make_thing");
      expect(out.result.isError).toBe(false);
      expect(text(out)).toBe("tool-ok");
      expect(tries).toHaveLength(3);
      expect(toolPosts(platform, "make_thing")).toHaveLength(1);
    });

    it(`${code} when not on connect (read or write phase): one try, outcome unknown`, async () => {
      quiet();
      const platform = await listen();
      const tries = scriptFetch("make_thing", [err(code, "read")]);
      const out = await connect(platform.origin).call("make_thing");
      expect(out.result.isError).toBe(true);
      expect(JSON.parse(text(out)).outcome).toBe("unknown");
      expect(tries).toHaveLength(1);
      expect(toolPosts(platform, "make_thing")).toHaveLength(0);
    });

    it(`${code} with no syscall at all is an unknown outcome too`, async () => {
      quiet();
      const platform = await listen();
      const tries = scriptFetch("make_thing", [err(code)]);
      const out = await connect(platform.origin).call("make_thing");
      expect(JSON.parse(text(out)).outcome).toBe("unknown");
      expect(tries).toHaveLength(1);
    });
  }

  it("UND_ERR_CONNECT_TIMEOUT is a connect failure", async () => {
    quiet();
    const platform = await listen();
    const tries = scriptFetch("make_thing", [err("UND_ERR_CONNECT_TIMEOUT")]);
    const out = await connect(platform.origin).call("make_thing");
    expect(out.result.isError).toBe(false);
    expect(tries).toHaveLength(2);
  });

  it("a nested AggregateError whose every entry is a connect failure is tried again", async () => {
    quiet();
    const platform = await listen();
    const nested = new AggregateError([err("ETIMEDOUT", "connect"), err("ENETUNREACH", "connect")], "all failed");
    const tries = scriptFetch("make_thing", [{ cause: nested, message: "wrapped" }]);
    const out = await connect(platform.origin).call("make_thing");
    expect(out.result.isError).toBe(false);
    expect(tries).toHaveLength(2);
  });

  it("an AggregateError with a read-phase entry is an unknown outcome and is not sent again", async () => {
    quiet();
    const platform = await listen();
    const mixed = new AggregateError([err("ETIMEDOUT", "connect"), err("ETIMEDOUT", "read")], "mixed");
    const tries = scriptFetch("make_thing", [mixed]);
    const out = await connect(platform.origin).call("make_thing");
    expect(JSON.parse(text(out)).outcome).toBe("unknown");
    expect(tries).toHaveLength(1);
  });

  it("a connect failure two causes deep is found", async () => {
    quiet();
    const platform = await listen();
    const tries = scriptFetch("make_thing", [{ message: "outer", cause: err("ETIMEDOUT", "connect") }]);
    const out = await connect(platform.origin).call("make_thing");
    expect(out.result.isError).toBe(false);
    expect(tries).toHaveLength(2);
  });
});

describe("idempotency key on write_plan_card", () => {
  const card = { card: { tag: "Goal.X" } };
  const keyOf = (body) => JSON.parse(body.arguments).idempotencyKey;

  it("a retried write sends the identical key on every try", async () => {
    quiet();
    const platform = await listen();
    const tries = scriptFetch("write_plan_card", [err("ETIMEDOUT", "connect"), err("ENETUNREACH", "connect")]);
    const out = await connect(platform.origin).call("write_plan_card", card);
    expect(out.result.isError).toBe(false);
    expect(tries).toHaveLength(3);
    const keys = tries.map(keyOf);
    expect(keys[0]).toMatch(UUID);
    expect(new Set(keys).size).toBe(1);
    expect(keyOf(toolPosts(platform, "write_plan_card")[0].body)).toBe(keys[0]);
  });

  it("two separate calls send different keys", async () => {
    quiet();
    const platform = await listen();
    const box = connect(platform.origin);
    await box.call("write_plan_card", card);
    await box.call("write_plan_card", card);
    const [a, b] = toolPosts(platform, "write_plan_card").map((r) => keyOf(r.body));
    expect(a).toMatch(UUID);
    expect(b).toMatch(UUID);
    expect(a).not.toBe(b);
  });

  it("a key the caller sent is kept; check mode and write_plan_table get none", async () => {
    quiet();
    const platform = await listen();
    const box = connect(platform.origin);
    await box.call("write_plan_card", { ...card, idempotencyKey: "mine-1" });
    await box.call("write_plan_card", { ...card, mode: "check" });
    await box.call("write_plan_table", { table: { tag: "T" } });
    const cards = toolPosts(platform, "write_plan_card");
    expect(keyOf(cards[0].body)).toBe("mine-1");
    expect(keyOf(cards[1].body)).toBeUndefined();
    expect(keyOf(toolPosts(platform, "write_plan_table")[0].body)).toBeUndefined();
  });
});

describe("unknown outcome and gilbplatform_call_status", () => {
  const card = { card: { tag: "Goal.Y" } };

  it("a keyed write with no answer returns the handle, then call_status sends it again with the same key", async () => {
    quiet();
    const platform = await listen();
    const tries = scriptFetch("write_plan_card", [err("ECONNRESET", "read")]);
    const box = connect(platform.origin);
    const first = await box.call("write_plan_card", card);
    expect(first.result.isError).toBe(true);
    const handle = JSON.parse(text(first));
    expect(handle.outcome).toBe("unknown");
    expect(handle.tool).toBe("write_plan_card");
    expect(handle.callId).toMatch(UUID);
    expect(Number.isNaN(Date.parse(handle.sentAt))).toBe(false);
    expect(handle.idempotencyKey).toBe(JSON.parse(tries[0].arguments).idempotencyKey);
    expect(handle.next).toContain("gilbplatform_call_status");
    expect(text(first)).not.toMatch(/atk-/);
    expect(tries).toHaveLength(1);

    const status = await box.call("gilbplatform_call_status", { callId: handle.callId });
    expect(status.result.isError).toBe(false);
    expect(text(status)).toBe("tool-ok");
    expect(tries).toHaveLength(2);
    expect(JSON.parse(tries[1].arguments).idempotencyKey).toBe(handle.idempotencyKey);

    // Asked again, it gives the same answer and sends nothing.
    const again = await box.call("gilbplatform_call_status", { callId: handle.callId });
    expect(text(again)).toBe("tool-ok");
    expect(tries).toHaveLength(2);
  });

  it("call_status that still gets no answer returns the unknown handle again, same callId and key", async () => {
    quiet();
    const platform = await listen();
    scriptFetch("write_plan_card", [err("ECONNRESET", "read"), err("ECONNRESET", "read")]);
    const box = connect(platform.origin);
    const first = JSON.parse(text(await box.call("write_plan_card", card)));
    const second = JSON.parse(text(await box.call("gilbplatform_call_status", { callId: first.callId })));
    expect(second.outcome).toBe("unknown");
    expect(second.callId).toBe(first.callId);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  it("an unkeyed write: no key in the handle, call_status sends nothing and says to read back, and shows no secrets", async () => {
    quiet();
    const platform = await listen();
    const tries = scriptFetch("make_thing", [err("ECONNRESET", "read")]);
    const box = connect(platform.origin);
    const first = JSON.parse(text(await box.call("make_thing", { name: "x", apiToken: "SECRET-VALUE" })));
    expect(first.outcome).toBe("unknown");
    expect(first.idempotencyKey).toBeUndefined();
    const status = await box.call("gilbplatform_call_status", { callId: first.callId });
    expect(status.result.isError).toBe(false);
    const known = JSON.parse(text(status));
    expect(known.outcome).toBe("unknown");
    expect(known.args).toEqual({ name: "x", apiToken: "(hidden)" });
    expect(known.next).toContain("Read the record back");
    expect(text(status)).not.toContain("SECRET-VALUE");
    expect(text(status)).not.toMatch(/atk-/);
    expect(tries).toHaveLength(1);
  });

  it("an unknown callId is refused with a plain sentence", async () => {
    quiet();
    const platform = await listen();
    const out = await connect(platform.origin).call("gilbplatform_call_status", { callId: "nope" });
    expect(out.result.isError).toBe(true);
    expect(JSON.parse(text(out)).next).toContain("Read the record back");
  });

  it("a 502 on a keyed write is also an unknown handle", async () => {
    quiet();
    const platform = await listen();
    const real = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).endsWith("/tool") && JSON.parse(String(init.body)).name === "write_plan_card") return new Response("{}", { status: 502 });
      return real(url, init);
    });
    const out = JSON.parse(text(await connect(platform.origin).call("write_plan_card", card)));
    expect(out.outcome).toBe("unknown");
    expect(out.idempotencyKey).toMatch(UUID);
    expect(out.error).toContain("HTTP 502");
  });

  it("the tool is listed with a plain description", async () => {
    quiet();
    const platform = await listen();
    const input = new PassThrough();
    const output = new PassThrough();
    const home = mkdtempSync(join(tmpdir(), "gilb-callstatus-list-"));
    dirs.push(home);
    const session = startConnector({ input, output, turnId: TURN, as: "ai", origin: platform.origin, profile: "default", env: { PATH: process.env.PATH, HOME: home, GILB_HOME: home, GILB_CONNECTOR_HOME: home } });
    opened.push({ session, input, output });
    const got = new Promise((resolve) => {
      let buf = "";
      output.setEncoding("utf8");
      output.on("data", (c) => {
        buf += c;
        for (const line of buf.split("\n")) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.id === 1) resolve(msg);
          } catch {
            // partial line
          }
        }
      });
    });
    input.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) + "\n");
    const tool = (await got).result.tools.find((t) => t.name === "gilbplatform_call_status");
    expect(tool.description).toContain("callId");
    expect(tool.inputSchema.required).toEqual(["callId"]);
  });
});
