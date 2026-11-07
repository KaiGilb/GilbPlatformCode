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
function listen(plan) {
  const requests = [];
  const writes = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    const url = req.url ?? "";
    requests.push(url);
    if (url.endsWith("/tool") && raw.includes("make_thing")) writes.push(url);
    // A forced status on the tool door is for the write only; the list_vaults read goes through.
    const skip = url.endsWith("/tool") && !raw.includes("make_thing");
    const forced = skip ? undefined : (plan[url] ?? []).shift();
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
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
      resolve({ origin: `http://127.0.0.1:${port}`, requests, writes });
    });
  });
}

function connect(origin) {
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
    retryDelaysMs: [5, 5, 5],
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
  return { call };
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
