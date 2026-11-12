// @vitest-environment node
// The hand-off clock: the parent passes --hop-deadline, the nested connector adds one clock line to every tool answer.
// Also resources/list and resources/templates/list answer empty lists. Hermetic: fake claude and fake codex only.
import { afterEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCli, startConnector } from "../connector/gilb-connector.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FAKE_CLAUDE = join(HERE, "fake-claude.mjs");
const FAKE_CODEX = join(HERE, "fake-codex.mjs");
const FAKE_COMPUTER = join(HERE, "fake-computer.mjs");
const HOP_A = "0123456789abcdef01234567";
const TURN = "turn-hop-clock-f1";
const MIN = 60 * 1000;

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

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "gilb-clock-"));
  dirs.push(dir);
  return dir;
}

function listen(handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let body = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      body = {};
    }
    const rec = { url: req.url ?? "", body };
    requests.push(rec);
    const reply = (await handler(rec, requests)) ?? { status: 404, body: { error: "no such door" } };
    res.writeHead(reply.status ?? 200, { "content-type": "application/json" });
    res.end(JSON.stringify(reply.body ?? {}));
  });
  server.requestTimeout = 0;
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      closers.push(() => new Promise((done) => server.close(() => done())));
      resolve({ origin: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`, requests });
    });
  });
}

function meEnv(extra = {}) {
  const home = scratch();
  return { PATH: process.env.PATH, HOME: home, GILB_HOME: home, GILB_CONNECTOR_COMPUTER_MODULE: FAKE_COMPUTER, ...extra };
}

function connect(opts) {
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
  const session = startConnector({ input, output, turnId: TURN, claudeBin: FAKE_CLAUDE, codexBin: FAKE_CODEX, as: "me", env: meEnv(), ...opts });
  opened.push({ session, input, output });
  let nextId = 1;
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => reject(new Error(`no answer for ${method} #${id}`)), 8000);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      input.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  return { session, request };
}

const readLog = (file) =>
  existsSync(file)
    ? readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line))
    : [];

const TOOLS = [{ name: "list_records", description: "List", inputSchema: { type: "object", properties: {} } }];
const hopOf = (role) => ({ id: HOP_A, system: `You are ${role}.`, task: "Do it.", tools: TOOLS, role, answer: { role, summary: "s" } });

function hopDoor(role) {
  return listen((rec) => {
    if (!rec.url.endsWith("/tool")) return { status: 404, body: { error: "no such door" } };
    if (rec.body.name === "run_named_role") return { body: { hop: hopOf(role) } };
    if (rec.body.name === "hop_done") return { body: { result: JSON.stringify({ closed: true }) } };
    return { body: { result: "tool-ok" } };
  });
}

/** The args the fake CLI was given for the nested connector, for either runner. */
async function nestedArgs(cli, role) {
  const log = join(scratch(), `${cli}.log`);
  const platform = await hopDoor(role);
  const envKey = cli === "codex" ? "FAKE_CODEX_LOG" : "FAKE_CLAUDE_LOG";
  const box = connect({ origin: platform.origin, hopCli: cli, env: meEnv({ [envKey]: log }) });
  const before = Date.now();
  const res = await box.request("tools/call", { name: "run_named_role", arguments: { role, task: "a" } });
  expect(res.result.isError).toBe(false);
  const rows = readLog(log).filter((row) => row.event === (cli === "codex" ? "exec" : "run"));
  expect(rows).toHaveLength(1);
  let args;
  if (cli === "codex") {
    const cvals = rows[0].argv.filter((a, i) => rows[0].argv[i - 1] === "-c");
    args = JSON.parse(cvals.find((c) => c.startsWith("mcp_servers.GilbPlatform.args=")).slice("mcp_servers.GilbPlatform.args=".length));
  } else {
    args = JSON.parse(rows[0].argv[rows[0].argv.indexOf("--mcp-config") + 1]).mcpServers.GilbPlatform.args;
  }
  return { args, before, after: Date.now() };
}

/** A nested (hop mode) connector in this process, as the hand-off's CLI would start it. */
async function hopConnector(extra) {
  const platform = await listen((rec) => (rec.url.endsWith("/tool") ? { body: { result: "tool-ok" } } : { status: 404, body: {} }));
  return connect({ origin: platform.origin, hopId: HOP_A, hopTools: TOOLS, ...extra });
}

const call = (box, name = "list_records") => box.request("tools/call", { name, arguments: {} });
const clockItems = (res) => res.result.content.filter((item) => item.text.startsWith("Hand-off clock:"));

describe("the parent passes --hop-deadline", () => {
  for (const cli of ["claude", "codex"]) {
    it(`a normal hop through ${cli} gets one, as an integer ms time about hopMax from now`, async () => {
      const { args, before, after } = await nestedArgs(cli, "Jackfruit");
      expect(args.filter((a) => a === "--hop-deadline")).toHaveLength(1);
      const value = args[args.indexOf("--hop-deadline") + 1];
      expect(value).toMatch(/^[0-9]+$/);
      expect(Number(value)).toBeGreaterThanOrEqual(before + 15 * MIN);
      expect(Number(value)).toBeLessThanOrEqual(after + 15 * MIN);
      expect(parseCli(args.slice(1), {}).hopDeadline).toBe(Number(value));
    }, 20000);

    it(`a Concept hop through ${cli} gets none`, async () => {
      const { args } = await nestedArgs(cli, "Agent.Concept");
      expect(args).toContain("--hop");
      expect(args).not.toContain("--hop-deadline");
    }, 20000);
  }
});

describe("the nested connector's clock", () => {
  it("adds exactly one clock item after the existing items, to a success and to an error", async () => {
    const box = await hopConnector({ hopDeadline: Date.now() + 10 * MIN });
    const ok = await call(box);
    expect(ok.result.isError).toBe(false);
    expect(ok.result.content).toHaveLength(2);
    expect(ok.result.content[0].text).toBe("tool-ok");
    expect(ok.result.content[1]).toEqual({ type: "text", text: "Hand-off clock: 0 of 10 minutes used, 10 left." });
    const bad = await call(box, "not_a_hop_tool");
    expect(bad.result.isError).toBe(true);
    expect(clockItems(bad)).toHaveLength(1);
    expect(bad.result.content.at(-1).text).toBe("Hand-off clock: 0 of 10 minutes used, 10 left.");
  }, 20000);

  it("adds nothing without the flag", async () => {
    const box = await hopConnector({});
    const ok = await call(box);
    expect(ok.result.content).toEqual([{ type: "text", text: "tool-ok" }]);
    const bad = await call(box, "not_a_hop_tool");
    expect(clockItems(bad)).toHaveLength(0);
  }, 20000);

  it("says to finish now when 3 minutes or fewer are left, and counts down to 0", async () => {
    const box = await hopConnector({ hopDeadline: Date.now() + 2 * MIN });
    const res = await call(box);
    expect(res.result.content.at(-1).text).toBe("Hand-off clock: 2 minutes left. Finish now: stop starting new writes and answer with what you did and what remains.");
    const late = await hopConnector({ hopDeadline: Date.now() - 1000 });
    expect((await call(late)).result.content.at(-1).text).toBe("Hand-off clock: 0 minutes left. Finish now: stop starting new writes and answer with what you did and what remains.");
    const edge = await hopConnector({ hopDeadline: Date.now() + 4 * MIN });
    expect((await call(edge)).result.content.at(-1).text).toBe("Hand-off clock: 0 of 4 minutes used, 4 left.");
  }, 20000);

  it("is not added outside hop mode", async () => {
    const platform = await listen((rec) => (rec.url.endsWith("/tool") ? { body: { result: "tool-ok" } } : { status: 404, body: {} }));
    const box = connect({ origin: platform.origin, hopDeadline: Date.now() + 10 * MIN });
    const res = await call(box, "list_vaults");
    expect(clockItems(res)).toHaveLength(0);
  }, 20000);
});

describe("--hop-deadline", () => {
  it("must be a positive whole number of milliseconds", () => {
    for (const bad of ["abc", "0", "1.5", "12x", ""]) {
      expect(() => parseCli(["--hop-deadline", bad], {}), bad).toThrow("--hop-deadline must be a time in milliseconds.");
    }
    expect(() => parseCli([], { GILB_CONNECTOR_HOP_DEADLINE: "abc" })).toThrow("--hop-deadline must be a time in milliseconds.");
    expect(parseCli(["--hop-deadline", "1800000000000"], {}).hopDeadline).toBe(1800000000000);
    expect(parseCli([], { GILB_CONNECTOR_HOP_DEADLINE: "42" }).hopDeadline).toBe(42);
    expect(parseCli([], {}).hopDeadline).toBeUndefined();
  });
});

describe("the time-limit paragraph", () => {
  it("keeps the old first sentence and adds the trust-only-the-clock sentences", async () => {
    const logFile = join(scratch(), "claude.log");
    const platform = await hopDoor("Jackfruit");
    const box = connect({ origin: platform.origin, env: meEnv({ FAKE_CLAUDE_LOG: logFile }) });
    expect((await box.request("tools/call", { name: "run_named_role", arguments: { role: "Jackfruit", task: "a" } })).result.isError).toBe(false);
    const prompt = readLog(logFile).find((row) => row.event === "run").prompt;
    expect(prompt).toContain("Time limit: this hand-off is stopped after 15 minutes, and whatever is unfinished then is lost to the caller.");
    expect(prompt).toContain("so the caller can hand over the rest. Every tool answer ends with a line \"Hand-off clock: …\"");
    expect(prompt).toContain("Trust only that clock.");
    expect(prompt.endsWith("never say the time limit stopped you unless the clock said so.")).toBe(true);
  }, 20000);
});

describe("resources", () => {
  it("resources/list and resources/templates/list answer empty lists, in normal and hop mode", async () => {
    const normal = connect({ origin: "http://127.0.0.1:9" });
    const hop = await hopConnector({});
    for (const box of [normal, hop]) {
      const list = await box.request("resources/list", {});
      expect(list.error).toBeUndefined();
      expect(list.result).toEqual({ resources: [] });
      const templates = await box.request("resources/templates/list", {});
      expect(templates.error).toBeUndefined();
      expect(templates.result).toEqual({ resourceTemplates: [] });
    }
  }, 20000);
});
