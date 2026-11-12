// @vitest-environment node
// A hand-off run by the Codex CLI (--hop-cli codex), with a fake `codex`. Hermetic: the real binary is never run.
import { afterEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CODEX_DISABLE_FEATURES,
  MCP_TOOL_TIMEOUT_MS,
  codexChildEnv,
  codexExecArgs,
  codexSpawnCommand,
  parseCli,
  startConnector,
  tomlString,
  tomlStringArray,
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

describe("a hand-off run by Codex", () => {
  it("c1 success: the final message is the answer, the hop tool ran, and argv has every flag in order", async () => {
    const { res, logFile } = await handOff("Do the records.", { hopMaxMs: 2 * 60 * 1000 });
    expect(res.result.isError).toBe(false);
    expect(JSON.parse(text(res)).content).toBe("tool-ok");
    const rows = execs(logFile);
    expect(rows).toHaveLength(1);
    const { argv, prompt, instructions } = rows[0];
    expect(argv.slice(0, 6)).toEqual(["exec", "--json", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "--strict-config"]);
    expect(argv[6]).toBe("-C");
    const dir = argv[7];
    expect(argv.slice(8, 10)).toEqual(["-s", "read-only"]);
    const cvals = argv.filter((a, i) => argv[i - 1] === "-c");
    const nested = JSON.parse(cvals[1].slice("mcp_servers.GilbPlatform.args=".length));
    expect(nested).toContain("--hop");
    expect(nested).not.toContain("--hop-cli");
    expect(cvals).toEqual([
      `mcp_servers.GilbPlatform.command=${JSON.stringify(process.execPath)}`,
      cvals[1],
      'mcp_servers.GilbPlatform.default_tools_approval_mode="approve"',
      "mcp_servers.GilbPlatform.startup_timeout_sec=90",
      `mcp_servers.GilbPlatform.tool_timeout_sec=${Math.ceil(MCP_TOOL_TIMEOUT_MS / 1000)}`,
      `model_instructions_file=${JSON.stringify(join(dir, "instructions.md"))}`,
      'web_search="disabled"',
    ]);
    // Every -c is one argv element, directly after its flag; --disable follows; the prompt flag is last.
    expect(argv.indexOf("--disable")).toBeGreaterThan(argv.lastIndexOf("-c"));
    expect(argv[argv.length - 1]).toBe("-");
    expect(argv).not.toContain("-m");
    for (const bad of ["--dangerously-bypass-approvals-and-sandbox", "--yolo", "danger-full-access", "--full-auto", "--enable"]) {
      expect(argv, bad).not.toContain(bad);
    }
    expect(prompt.startsWith("Do the records.\n\nTime limit: this hand-off is stopped after 2 minutes")).toBe(true);
    expect(instructions).toBe(SYSTEM);
    expect(argv.join("\n")).not.toContain("secret-system-text");
  }, 20000);

  it("c2 OpenAI and Codex keys on the connector never reach exec", async () => {
    const { res, logFile } = await handOff("go", { env: { CODEX_API_KEY: "k1", OPENAI_API_KEY: "k2", OPENAI_BASE_URL: "http://x.test" } });
    expect(res.result.isError).toBe(false);
    const row = execs(logFile)[0];
    expect(row.hasCodexApiKey).toBe(false);
    expect(row.hasOpenaiApiKey).toBe(false);
    expect(row.openaiVars).toEqual([]);
  }, 20000);

  it("c3 a doctor that says apikey stops the hand-off before exec", async () => {
    const { res, logFile } = await handOff("go", { env: { FAKE_CODEX_AUTH_MODE: "apikey" } });
    expect(res.result.isError).toBe(true);
    expect(JSON.parse(text(res)).reason).toBe(NOT_CHATGPT);
    expect(execs(logFile)).toHaveLength(0);
  }, 20000);

  it("c4 a doctor that fails stops the hand-off (fail closed)", async () => {
    const { res, logFile } = await handOff("go", { env: { FAKE_CODEX_DOCTOR_FAIL: "1" } });
    expect(JSON.parse(text(res)).reason).toBe(NOT_CHATGPT);
    expect(execs(logFile)).toHaveLength(0);
  }, 20000);

  it("c5 a feature list that cannot be read stops the hand-off", async () => {
    const { res, logFile } = await handOff("go", { env: { FAKE_CODEX_FEATURES_FAIL: "1" } });
    expect(res.result.isError).toBe(true);
    expect(JSON.parse(text(res)).reason).toBe(NO_FEATURES);
    expect(execs(logFile)).toHaveLength(0);
  }, 20000);

  it("c6 --disable is exactly the deny-list names the fake lists", async () => {
    const { logFile } = await handOff("go");
    const { argv } = execs(logFile)[0];
    const disabled = argv.filter((a, i) => argv[i - 1] === "--disable");
    expect(disabled).toEqual(["shell_tool", "apps", "goals"]);
    expect(disabled).not.toContain("code_mode_host");
    expect(disabled).not.toContain("memories");
    expect(CODEX_DISABLE_FEATURES).not.toContain("code_mode_host");
  }, 20000);

  it("c7 --hop-model gives -m, and no model gives none", async () => {
    const withModel = await handOff("go", { hopModel: "gpt-x" });
    const a = execs(withModel.logFile)[0].argv;
    expect(a[a.indexOf("-m") + 1]).toBe("gpt-x");
    expect(a[a.length - 1]).toBe("-");
    expect(a.indexOf("-m")).toBe(a.length - 3);
    const without = await handOff("go");
    expect(execs(without.logFile)[0].argv).not.toContain("-m");
  }, 30000);

  it("c8 a failed turn is a failed hand-off with Codex's message", async () => {
    const { res } = await handOff("FAILTURN");
    expect(res.result.isError).toBe(true);
    expect(JSON.parse(text(res)).reason).toContain("Codex: fake failure");
  }, 20000);

  it("c9 a turn with no final message is a stopped hand-off", async () => {
    const { res } = await handOff("NOFINAL");
    expect(res.result.isError).toBe(true);
    expect(JSON.parse(text(res)).reason).toContain("Codex stopped without an answer");
  }, 20000);

  it("c10 a top-level error line (a retry notice) does not fail the run", async () => {
    const { res } = await handOff("TOPERROR");
    expect(res.result.isError).toBe(false);
    expect(JSON.parse(text(res)).content).toBe("tool-ok");
  }, 20000);

  it("c11 a run that never ends is stopped at the limit and gets SIGTERM", async () => {
    const { res, logFile } = await handOff("WAITFOREVER", { hopMaxMs: 400 });
    expect(res.result.isError).toBe(true);
    expect(JSON.parse(text(res)).error).toBe("the hand-off ran out of time");
    const deadline = Date.now() + 5000;
    while (!readLog(logFile).some((row) => row.event === "sigterm") && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    expect(readLog(logFile).some((row) => row.event === "sigterm")).toBe(true);
  }, 20000);

  it("c11b a timed-out run reports the tool call it streamed", async () => {
    const { res } = await handOff("WAITAFTERTOOL", { hopMaxMs: 3000 });
    const answer = JSON.parse(text(res));
    expect(answer.error).toBe("the hand-off ran out of time");
    expect(answer.done_before_stop).toEqual(["list_records"]);
    expect(answer.last_words).toBeUndefined();
  }, 20000);

  it("c12 a version off the tested 0.167 line prints a warning; 0.167.2 does not", async () => {
    const newer = await handOff("go", { env: { FAKE_CODEX_VERSION: "0.170.1" } });
    expect(newer.lines.join("")).toContain("gilb-connector: this hand-off runs on Codex 0.170.1.");
    expect(newer.lines.join("")).toContain("gilb-connector: Codex 0.170.1 is newer or older than the tested 0.167; hand-offs may behave differently.");
    const same = await handOff("go");
    expect(same.lines.join("")).toContain("gilb-connector: this hand-off runs on Codex 0.167.2.");
    expect(same.lines.join("")).not.toContain("newer or older");
  }, 30000);

  it("c13 --hop-cli: bogus is refused, and the default runs Claude, not Codex", async () => {
    expect(() => parseCli(["--hop-cli", "bogus"], {})).toThrow("--hop-cli must be claude or codex.");
    expect(() => parseCli([], { GILB_CONNECTOR_HOP_CLI: "gemini" })).toThrow("--hop-cli must be claude or codex.");
    expect(parseCli([], {}).hopCli).toBe("claude");
    expect(parseCli(["--hop-cli", "codex", "--codex", "/x/codex"], {})).toMatchObject({ hopCli: "codex", codexBin: "/x/codex" });
    expect(parseCli([], { GILB_CONNECTOR_HOP_CLI: "codex", GILB_CONNECTOR_CODEX: "/y/codex" })).toMatchObject({ hopCli: "codex", codexBin: "/y/codex" });
    expect(parseCli([], {}).codexBin).toBe("codex");

    stderrLines();
    const claudeLog = join(scratch(), "claude.log");
    const codexLog = join(scratch(), "codex.log");
    const platform = await hopDoor("Do it.");
    const box = connect({ origin: platform.origin, hopCli: "claude", env: meEnv({ FAKE_CLAUDE_LOG: claudeLog, FAKE_CODEX_LOG: codexLog }) });
    const res = await callTool(box, "run_named_role", { role: "Agent.Outcome", task: "a" });
    expect(res.result.isError).toBe(false);
    expect(readLog(claudeLog).filter((row) => row.event === "run")).toHaveLength(1);
    expect(readLog(codexLog)).toHaveLength(0);
  }, 20000);
});

describe("Codex helpers", () => {
  it("c14a tomlString round-trips through JSON.parse and escapes U+007F as six characters", () => {
    const value = 'C:\\Users\\"Zoë"\nline é \u007f end';
    const encoded = tomlString(value);
    expect(encoded).toContain("\\u007F");
    expect(encoded).not.toContain("\u007f");
    expect(JSON.parse(encoded)).toBe(value);
    expect(tomlString("\u007f")).toBe('"\\u007F"');
    expect(tomlStringArray(["a", 'b"c'])).toBe('["a", "b\\"c"]');
    expect(tomlStringArray([])).toBe("[]");
  });

  it("c14b codexChildEnv removes API keys and the OPENAI, AZURE_OPENAI and CODEX_API families, and keeps CODEX_HOME", () => {
    const out = codexChildEnv({
      PATH: "/bin",
      CODEX_HOME: "/h",
      CODEX_API_KEY: "a",
      CODEX_API_BASE: "b",
      OPENAI_API_KEY: "c",
      OPENAI_BASE_URL: "d",
      OPENAI_ORG_ID: "e",
      AZURE_OPENAI_ENDPOINT: "f",
      ANTHROPIC_API_KEY: "g",
      KEEP_ME: "1",
    });
    expect(Object.keys(out).sort()).toEqual(["CODEX_HOME", "KEEP_ME", "MCP_TOOL_TIMEOUT", "CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT", "PATH"].sort());
  });

  it("c14c codexExecArgs and codexSpawnCommand", () => {
    const args = codexExecArgs({ dir: "/d", instructionsPath: "/d/instructions.md", nestedArgs: ["a.mjs", "--x"], disable: ["apps"], model: "m1", nodePath: "/n/node" });
    expect(args.slice(-5)).toEqual(["--disable", "apps", "-m", "m1", "-"]);
    expect(args).toContain('mcp_servers.GilbPlatform.args=["a.mjs", "--x"]');
    expect(args).toContain('mcp_servers.GilbPlatform.command="/n/node"');
    for (const platform of ["darwin", "linux", "win32"]) expect(codexSpawnCommand("codex", platform)).toEqual({ command: "codex", prefixArgs: [] });
  });
});
