// @vitest-environment node
// codex doctor's auth check, flat and nested shapes, through a fake `codex`. Hermetic: the real binary is never run.
import { afterEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  codexStoredAuthMode,
  startConnector,
} from "../connector/gilb-connector.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FAKE_CLAUDE = join(HERE, "fake-claude.mjs");
const FAKE_CODEX = join(HERE, "fake-codex.mjs");
const FAKE_COMPUTER = join(HERE, "fake-computer.mjs");
const TURN = "turn-codex-hop-f1";
const HOP_A = "0123456789abcdef01234567";
const SYSTEM = "You are Agent.Outcome. Say \"hi\" \\ and keep the secret-system-text out of argv.";
const NOT_CHATGPT = "Codex is not signed in with ChatGPT, so the hand-off was stopped. Run: codex login and choose Sign in with ChatGPT.";
const NO_FEATURES = "Could not read Codex's feature list, so the hand-off was stopped.";

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
  const dir = mkdtempSync(join(tmpdir(), "gilb-codex-"));
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
  const session = startConnector({ input, output, turnId: TURN, claudeBin: FAKE_CLAUDE, codexBin: FAKE_CODEX, hopCli: "codex", as: "me", env: meEnv(), ...opts });
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

function meEnv(extra = {}) {
  const home = scratch();
  return { PATH: process.env.PATH, HOME: home, GILB_HOME: home, GILB_CONNECTOR_COMPUTER_MODULE: FAKE_COMPUTER, ...extra };
}

const text = (msg) => msg.result.content[0].text;
const callTool = (box, name, args) => box.request("tools/call", { name, arguments: args });
const readLog = (file) =>
  existsSync(file)
    ? readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line))
    : [];
const execs = (file) => readLog(file).filter((row) => row.event === "exec");

function stderrLines() {
  const lines = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  return lines;
}

const hopOf = (task) => ({
  id: HOP_A,
  system: SYSTEM,
  task,
  tools: [{ name: "list_records", description: "List", inputSchema: { type: "object", properties: {} } }],
  role: "Agent.Outcome",
  answer: { role: "Agent.Outcome", summary: "s" },
});

async function hopDoor(task) {
  return listen((rec) => {
    if (!rec.url.endsWith("/tool")) return { status: 404, body: { error: "no such door" } };
    if (rec.body.name === "run_named_role") return { body: { hop: hopOf(task) } };
    if (rec.body.name === "hop_done") return { body: { result: JSON.stringify({ closed: true }) } };
    return { body: { result: "tool-ok" } };
  });
}

/** One hand-off through the fake codex. Returns the tool answer, the fake's log file and the stderr lines. */
async function handOff(task, { env = {}, ...opts } = {}) {
  const lines = stderrLines();
  const logFile = join(scratch(), "codex.log");
  const platform = await hopDoor(task);
  const box = connect({ origin: platform.origin, env: meEnv({ FAKE_CODEX_LOG: logFile, ...env }), ...opts });
  const res = await callTool(box, "run_named_role", { role: "Agent.Outcome", task: "a" });
  return { res, logFile, lines, platform };
}

const REAL_FLAT = {
  schemaVersion: 1,
  generatedAt: "2026-11-12T00:00:00Z",
  overallStatus: "ok",
  codexVersion: "0.167.2",
  checks: {
    "app_server.status": { id: "app_server.status", category: "app_server", status: "ok", details: {} },
    "auth.credentials": {
      id: "auth.credentials",
      category: "auth",
      status: "ok",
      summary: "auth is configured",
      details: {
        "auth file": "/x/auth.json",
        "auth storage mode": "File",
        "stored API key": false,
        "stored ChatGPT tokens": true,
        "stored agent identity": false,
        "stored auth mode": "chatgpt",
      },
      remediation: null,
      durationMs: 0,
    },
  },
};
const NESTED = { checks: { auth: { credentials: { details: { "stored auth mode": "chatgpt" } } } } };

describe("codexStoredAuthMode", () => {
  it("d1 reads the real flat auth.credentials check", () => {
    expect(codexStoredAuthMode(REAL_FLAT)).toBe("chatgpt");
  });
  it("d2 reads the nested shape", () => {
    expect(codexStoredAuthMode(NESTED)).toBe("chatgpt");
  });
  it("d3 prefers the flat entry over the nested one", () => {
    const both = { checks: { ...NESTED.checks, "auth.credentials": { details: { "stored auth mode": "apikey" } } } };
    expect(codexStoredAuthMode(both)).toBe("apikey");
  });
  it("d4 missing pieces give undefined", () => {
    const cases = [
      {},
      { checks: {} },
      { checks: { "auth.credentials": {} } },
      { checks: { "auth.credentials": { details: {} } } },
      { checks: { "auth.credentials": { details: { "stored auth mode": 3 } } } },
      { checks: { auth: {} } },
      { checks: { auth: { credentials: {} } } },
    ];
    for (const v of cases) expect(codexStoredAuthMode(v)).toBeUndefined();
  });
  it("d5 non-object input gives undefined", () => {
    for (const v of [undefined, null, 5, "chatgpt", [], true, { checks: "x" }, { checks: [] }]) expect(codexStoredAuthMode(v)).toBeUndefined();
  });
});

describe("a hand-off by the doctor's shape", () => {
  it("d6 flat chatgpt runs", async () => {
    const { res, logFile } = await handOff("go");
    expect(res.result.isError).toBe(false);
    expect(execs(logFile)).toHaveLength(1);
  }, 20000);
  it("d7 nested chatgpt runs", async () => {
    const { res, logFile } = await handOff("go", { env: { FAKE_CODEX_DOCTOR_SHAPE: "nested" } });
    expect(res.result.isError).toBe(false);
    expect(execs(logFile)).toHaveLength(1);
  }, 20000);
  it("d8 flat apikey is refused", async () => {
    const { res, logFile } = await handOff("go", { env: { FAKE_CODEX_AUTH_MODE: "apikey" } });
    expect(JSON.parse(text(res)).reason).toBe(NOT_CHATGPT);
    expect(execs(logFile)).toHaveLength(0);
  }, 20000);
  it("d9 flat chatgpt with a stored API key is refused", async () => {
    const { res, logFile } = await handOff("go", { env: { FAKE_CODEX_STORED_API_KEY: "1" } });
    expect(res.result.isError).toBe(true);
    expect(JSON.parse(text(res)).reason).toBe(NOT_CHATGPT);
    expect(execs(logFile)).toHaveLength(0);
  }, 20000);
});
