// @vitest-environment node
// A platform that is restarting: sign-in and reads are tried again for a while, the message names the real cause,
// a real 401 still says "could not sign in", and a write that may have run is never sent twice.
import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startConnector } from "../connector/gilb-connector.mjs";

const TURN = "turn-restart-1107";
const UNKNOWN = (tool, what) => `${tool} got no answer from GilbPlatform (${what}) and may or may not have run. It was not sent again. Read it back before sending it again.`;
const DOWN = (n) => `GilbPlatform is restarting or out of reach just now (HTTP ${n}). Try again in a minute.`;
const closers = [];
const dirs = [];
const opened = [];
const restores = [];

afterEach(async () => {
  for (const restore of restores.splice(0)) restore();
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

function captureStderr() {
  const chunks = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, encoding, cb) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    const done = typeof encoding === "function" ? encoding : cb;
    if (typeof done === "function") done();
    return true;
  };
  restores.push(() => {
    process.stderr.write = orig;
  });
  return { text: () => chunks.join("") };
}

/** `plan[path]` is a list of statuses to answer first (for example [503, 503]); after that the normal answer. */
function listen(plan, toolPlan = {}) {
  const requests = [];
  const toolCalls = [];
  const writes = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const url = req.url ?? "";
    requests.push(url);
    if (url.endsWith("/tool") && raw.includes("make_thing")) writes.push(url);
    if (url.endsWith("/tool")) {
      const name = JSON.parse(raw).name;
      toolCalls.push(name);
      const next = (toolPlan[name] ?? []).shift();
      if (next === "reset") return req.socket.destroy();
      if (typeof next === "number") return send(next, { error: "down" });
    }
    // A forced status on the tool door is for the write only; the list_vaults read goes through.
    const skip = url.endsWith("/tool") && !raw.includes("make_thing");
    const forced = skip ? undefined : (plan[url] ?? []).shift();
    if (forced !== undefined) return send(forced, forced === 401 ? { error: "invalid_client" } : { error: "down" });
    if (url.endsWith("/base/client/register")) return send(200, { clientId: "agent-restart", created: true, confersAuthority: false });
    if (url.endsWith("/base/oauth/token")) return send(200, { access_token: `atk-${requests.length}`, token_type: "DPoP", expires_in: 300, scope: "base.write" });
    if (url.endsWith("/base/e/first-use")) return send(404, { error: "not_found" });
    if (url.endsWith("/context")) {
      return send(200, {
        system: "STANDING That person is identified as: https://example.test/base. Tools follow.",
        tools: [
          { name: "list_vaults", description: "List.", inputSchema: { type: "object", properties: {} } },
          { name: "make_thing", description: "Write.", inputSchema: { type: "object", properties: {} } },
          { name: "read_record", description: "Read.", inputSchema: { type: "object", properties: {} } },
          { name: "list_records", description: "Read.", inputSchema: { type: "object", properties: {} } },
        ],
      });
    }
    if (url.endsWith("/tool")) return send(200, { result: "tool-ok" });
    return send(404, { error: "no such door" });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      closers.push(() => new Promise((done) => server.close(() => done())));
      resolve({ origin: `http://127.0.0.1:${port}`, requests, writes, toolCalls, close: () => new Promise((done) => { server.close(() => done()); server.closeAllConnections?.(); }) });
    });
  });
}

function connect(origin, retryDelaysMs = [5, 5, 5], extra = {}) {
  const home = mkdtempSync(join(tmpdir(), "gilb-restart-"));
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
    retryDelaysMs,
    ...extra,
    env: { PATH: process.env.PATH, HOME: home, GILB_HOME: home, GILB_CONNECTOR_HOME: home },
  });
  opened.push({ session, input, output });
  let nextId = 1;
  const call = (name) => {
    const id = nextId++;
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no answer for ${name}`)), 8000);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
    input.write(JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: {} } }) + "\n");
    return result;
  };
  const cancel = (requestId) => input.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId } }) + "\n");
  return { call, cancel, nextId: () => nextId };
}

const text = (msg) => msg.result.content[0].text;
const count = (requests, tail) => requests.filter((url) => url.endsWith(tail)).length;

describe("a platform that is restarting", () => {
  it("tries the sign-in again after a 503 and then works, with a line on stderr", async () => {
    const stderr = captureStderr();
    const platform = await listen({ "/base/oauth/token": [503, 502] });
    const box = connect(platform.origin);
    const out = await box.call("list_vaults");
    expect(out.result.isError).toBe(false);
    expect(text(out)).toContain("tool-ok");
    expect(count(platform.requests, "/base/oauth/token")).toBeGreaterThanOrEqual(3);
    expect(stderr.text()).toContain("GilbPlatform is restarting or out of reach; trying again");
  });

  it("names the real cause when the platform stays down, and opens again on the next call", async () => {
    const stderr = captureStderr();
    const platform = await listen({ "/base/oauth/token": [503, 503, 503, 503] });
    const box = connect(platform.origin);
    const out = await box.call("list_vaults");
    expect(out.result.isError).toBe(true);
    expect(text(out)).toBe(DOWN(503));
    expect(text(out)).not.toContain("could not sign in");
    expect(stderr.text()).not.toContain("could not sign in");
    const later = await box.call("list_vaults");
    expect(later.result.isError).toBe(false);
    expect(text(later)).toContain("tool-ok");
  });

  it("says could not sign in for a real 401 at the token door, and does not retry it", async () => {
    captureStderr();
    const platform = await listen({ "/base/oauth/token": [401, 401, 401, 401, 401] });
    const box = connect(platform.origin);
    const out = await box.call("list_vaults");
    expect(out.result.isError).toBe(true);
    expect(text(out)).toContain("This AI could not sign in to GilbPlatform.");
    expect(count(platform.requests, "/base/oauth/token")).toBe(1);
  });

  it("tries a read again after a 503, but never sends a write twice", async () => {
    captureStderr();
    const platform = await listen({ "/base/ai/claude-code/context": [503, 503] });
    const box = connect(platform.origin);
    const read = await box.call("list_vaults");
    expect(read.result.isError).toBe(false);
    expect(count(platform.requests, "/context")).toBe(3);
    const toolPlan = { "/base/ai/claude-code/tool": [503, 503, 503] };
    const second = await listen(toolPlan);
    const other = connect(second.origin);
    const write = await other.call("make_thing");
    expect(write.result.isError).toBe(true);
    expect(second.writes).toHaveLength(1);
  });
});

describe("reads ride out a restart; writes never resend", () => {
  const hit = (platform, name) => platform.toolCalls.filter((n) => n === name).length;

  it("a read that gets a reset, then a 502, then a 200 is sent three times and succeeds", async () => {
    captureStderr();
    const platform = await listen({}, { read_record: ["reset", 502] });
    const out = await connect(platform.origin).call("read_record");
    expect(out.result.isError).toBe(false);
    expect(text(out)).toContain("tool-ok");
    expect(hit(platform, "read_record")).toBe(3);
  });

  it("a read that stays down answers with the restart sentence after the whole delay list", async () => {
    captureStderr();
    const platform = await listen({}, { list_records: [502, 502, 502, 502, 502, 502] });
    const out = await connect(platform.origin, [5, 5, 5]).call("list_records");
    expect(out.result.isError).toBe(true);
    expect(JSON.parse(text(out)).error ?? text(out)).toBe(DOWN(502));
    expect(hit(platform, "list_records")).toBe(4);
  });

  it("a read that stays unanswered also ends in the restart sentence, with the cause", async () => {
    captureStderr();
    const platform = await listen({}, { read_record: ["reset", "reset", "reset", "reset"] });
    const out = await connect(platform.origin, [5, 5, 5]).call("read_record");
    expect(out.result.isError).toBe(true);
    expect(text(out)).toContain("GilbPlatform is restarting or out of reach just now (");
    expect(text(out)).not.toContain("may or may not have run");
    expect(hit(platform, "read_record")).toBe(4);
  });

  it("a write with no answer is sent once and says to read it back, naming the tool", async () => {
    captureStderr();
    const platform = await listen({}, { make_thing: ["reset", "reset"] });
    const out = await connect(platform.origin).call("make_thing");
    expect(out.result.isError).toBe(true);
    expect(text(out)).toContain("make_thing");
    expect(text(out)).toContain("may or may not have run");
    expect(text(out)).toContain("Read it back before sending it again");
    expect(hit(platform, "make_thing")).toBe(1);
  });

  it("a write answered 502 is sent once and says to read it back", async () => {
    captureStderr();
    const platform = await listen({}, { make_thing: [502, 502] });
    const out = await connect(platform.origin).call("make_thing");
    expect(out.result.isError).toBe(true);
    expect(JSON.parse(text(out)).error).toBe(UNKNOWN("make_thing", "HTTP 502"));
    expect(hit(platform, "make_thing")).toBe(1);
  });

  it("a write whose connection is refused is still tried again and ends in the restart sentence", async () => {
    captureStderr();
    const platform = await listen({});
    const box = connect(platform.origin, [5, 5, 5]);
    expect((await box.call("list_vaults")).result.isError).toBe(false);
    await platform.close();
    await new Promise((r) => setTimeout(r, 100));
    const out = await box.call("make_thing");
    expect(out.result.isError).toBe(true);
    expect(text(out)).toContain("ECONNREFUSED");
    expect(text(out)).not.toContain("may or may not have run");
  });

  it("a 401 on a read is not retried as a restart", async () => {
    captureStderr();
    const platform = await listen({}, { read_record: [401, 401, 401, 401] });
    const out = await connect(platform.origin, [5, 5, 5]).call("read_record");
    expect(out.result.isError).toBe(true);
    expect(hit(platform, "read_record")).toBeLessThanOrEqual(2);
  });

  it("the sets: reads are repeatable, writes are not", async () => {
    const { READ_ONLY_TOOLS } = await import("../connector/gilb-connector.mjs");
    expect([...READ_ONLY_TOOLS].sort()).toEqual(["list_projects", "list_records", "list_vaults", "read_record"]);
    expect(READ_ONLY_TOOLS.has("make_thing")).toBe(false);
  });

  const HOP = "0123456789abcdef01234567";
  const hopTools = ["read_record", "make_thing"].map((name) => ({ name, description: name, inputSchema: { type: "object", properties: {} } }));

  it("in a hand-off, a read rides out a reset and a 502, and a write is sent once", async () => {
    captureStderr();
    const platform = await listen({}, { read_record: ["reset", 502], make_thing: [502, 502] });
    const box = connect(platform.origin, [5, 5, 5], { hopId: HOP, hopTools });
    const read = await box.call("read_record");
    expect(read.result.isError).toBe(false);
    expect(hit(platform, "read_record")).toBe(3);
    const write = await box.call("make_thing");
    expect(write.result.isError).toBe(true);
    expect(JSON.parse(text(write)).error).toBe(UNKNOWN("make_thing", "HTTP 502"));
    expect(hit(platform, "make_thing")).toBe(1);
  });

  it("a cancel during the back-off stops the retries", async () => {
    captureStderr();
    const platform = await listen({}, { read_record: [502, 502, 502, 502, 502, 502] });
    const box = connect(platform.origin, [600, 600, 600]);
    expect((await box.call("list_vaults")).result.isError).toBe(false);
    const id = box.nextId();
    const pending = box.call("read_record").catch(() => null);
    await new Promise((r) => setTimeout(r, 150));
    box.cancel(id);
    await new Promise((r) => setTimeout(r, 1500));
    expect(hit(platform, "read_record")).toBe(1);
    void pending;
  });
});
