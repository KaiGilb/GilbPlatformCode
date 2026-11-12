// @vitest-environment node
// A hand-off run by the Codex CLI (--hop-cli codex), with a fake `codex`. Hermetic: the real binary is never run.
import { afterEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
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
const DOCTOR_FAILED = "Could not run codex doctor, so the hand-off was stopped.";
const FEATURES_UNKNOWN = "This Codex version's feature list is not one the connector knows, so the hand-off was stopped.";
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
function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
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
    expect(prompt.startsWith("Do the records.\n\nTime limit. You have up to 2 minutes")).toBe(true);
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
    expect(JSON.parse(text(res)).reason).toBe(DOCTOR_FAILED);
    expect(execs(logFile)).toHaveLength(0);
  }, 20000);

  it("c4b a doctor that prints something that is not JSON is the doctor-failed sentence, and exec never runs", async () => {
    const { res, logFile } = await handOff("go", { env: { FAKE_CODEX_DOCTOR_FAIL: "garbage" } });
    expect(JSON.parse(text(res)).reason).toBe(DOCTOR_FAILED);
    expect(execs(logFile)).toHaveLength(0);
  }, 20000);

  it("c4c a stored API key passes only when absent, false or the string false (any case, trimmed)", async () => {
    for (const [keyMode, booleans] of [["1", "0"], ["1", "1"], ["yes", "0"], ["yes", "1"], ["null", "0"], ["null", "1"], ["number", "0"]]) {
      const refused = await handOff("go", { env: { FAKE_CODEX_STORED_API_KEY: keyMode, FAKE_CODEX_DOCTOR_BOOLEANS: booleans } });
      expect(JSON.parse(text(refused.res)).reason, `${keyMode}/${booleans}`).toBe(NOT_CHATGPT);
      expect(execs(refused.logFile), `${keyMode}/${booleans}`).toHaveLength(0);
    }
    // The real shape (strings) is the default; booleans are the other form.
    for (const [keyMode, booleans] of [["0", "0"], ["0", "1"], ["absent", "0"], ["padded", "0"]]) {
      const ok = await handOff("go", { env: { FAKE_CODEX_STORED_API_KEY: keyMode, FAKE_CODEX_DOCTOR_BOOLEANS: booleans } });
      expect(ok.res.result.isError, `${keyMode}/${booleans}`).toBe(false);
    }
  }, 120000);

  it("c5 a feature list that cannot be read stops the hand-off", async () => {
    const { res, logFile } = await handOff("go", { env: { FAKE_CODEX_FEATURES_FAIL: "1" } });
    expect(res.result.isError).toBe(true);
    expect(JSON.parse(text(res)).reason).toBe(NO_FEATURES);
    expect(execs(logFile)).toHaveLength(0);
  }, 20000);

  it("c5b feature lists in ANSI, bullets, indent, CRLF and header-plus-blank-line shapes give the same disables", async () => {
    for (const format of ["plain", "ansi", "bullets", "indent", "crlf", "header"]) {
      const { res, logFile } = await handOff("go", { env: { FAKE_CODEX_FEATURES_FORMAT: format } });
      expect(res.result.isError, format).toBe(false);
      const { argv } = execs(logFile)[0];
      expect(argv.filter((a, i) => argv[i - 1] === "--disable"), format).toEqual(["shell_tool", "apps", "goals"]);
    }
  }, 120000);

  it("c5c an empty feature list, and one without shell_tool, are refused and exec never runs", async () => {
    for (const format of ["empty", "noshell"]) {
      const { res, logFile } = await handOff("go", { env: { FAKE_CODEX_FEATURES_FORMAT: format } });
      expect(res.result.isError, format).toBe(true);
      expect(JSON.parse(text(res)).reason, format).toBe(FEATURES_UNKNOWN);
      expect(execs(logFile), format).toHaveLength(0);
    }
  }, 60000);

  it("c5d a refused feature list is not cached: the next hand-off in the same session reads it again", async () => {
    stderrLines();
    const logFile = join(scratch(), "codex.log");
    const platform = await hopDoor("go");
    const env = meEnv({ FAKE_CODEX_LOG: logFile, FAKE_CODEX_FEATURES_FORMAT: "empty" });
    const box = connect({ origin: platform.origin, env });
    const first = await callTool(box, "run_named_role", { role: "Agent.Outcome", task: "a" });
    expect(JSON.parse(text(first)).reason).toBe(FEATURES_UNKNOWN);
    env.FAKE_CODEX_FEATURES_FORMAT = "plain";
    const second = await callTool(box, "run_named_role", { role: "Agent.Outcome", task: "a" });
    expect(second.result.isError).toBe(false);
    expect(readLog(logFile).filter((row) => row.event === "features").length).toBe(2);
  }, 30000);

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
    const pid = execs(logFile)[0].pid;
    if (process.platform !== "win32") {
      while (!readLog(logFile).some((row) => row.event === "sigterm") && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
      expect(readLog(logFile).some((row) => row.event === "sigterm")).toBe(true);
    } else {
      // Windows ends a process without letting it log SIGTERM: the proof is that the fake is gone.
      while (processAlive(pid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
      expect(processAlive(pid)).toBe(false);
    }
  }, 20000);

  it("c11c a folder that cannot be removed does not fail a successful hand-off, and one stderr line says so", async () => {
    const failing = (dir) => {
      throw Object.assign(new Error("busy"), { code: "EBUSY" });
    };
    const { res, lines } = await handOff("go", { removeDir: failing });
    expect(res.result.isError).toBe(false);
    expect(JSON.parse(text(res)).content).toBe("tool-ok");
    expect(lines.join("")).toMatch(/gilb-connector: could not remove the hand-off folder .*gilb-hop-.*: EBUSY\n/);
  }, 20000);

  it("c11d a folder that cannot be removed does not stop the timeout answer, and the session still stops", async () => {
    const removed = [];
    const failing = (dir) => {
      removed.push(dir);
      throw Object.assign(new Error("busy"), { code: "EBUSY" });
    };
    const { res, lines, logFile } = await handOff("WAITFOREVER", { hopMaxMs: 400, removeDir: failing });
    expect(res.result.isError).toBe(true);
    expect(JSON.parse(text(res)).error).toBe("the hand-off ran out of time");
    // Tried at the timeout, and once more when the killed child closed.
    const deadline = Date.now() + 5000;
    while (removed.length < 2 && Date.now() < deadline) await sleep(50);
    expect(removed.length).toBe(2);
    while (!lines.join("").includes("could not remove the hand-off folder") && Date.now() < deadline) await sleep(50);
    expect(lines.join("")).toContain("EBUSY");
    expect(processAlive(execs(logFile)[0].pid)).toBe(false);
  }, 20000);

  it("c11e a folder that is removable on the second try (after the child closes) is removed and nothing is reported", async () => {
    let calls = 0;
    let real;
    const flaky = (dir) => {
      calls += 1;
      real = dir;
      if (calls === 1) throw Object.assign(new Error("busy"), { code: "EBUSY" });
      rmSync(dir, { recursive: true, force: true });
    };
    const { res, lines } = await handOff("WAITFOREVER", { hopMaxMs: 400, removeDir: flaky });
    expect(JSON.parse(text(res)).error).toBe("the hand-off ran out of time");
    const deadline = Date.now() + 5000;
    while (existsSync(real ?? "") && Date.now() < deadline) await sleep(50);
    expect(existsSync(real)).toBe(false);
    expect(lines.join("")).not.toContain("could not remove");
  }, 20000);

  it("c11f a refused hand-off (prepare fails) with an unremovable folder still answers with its reason", async () => {
    const failing = () => {
      throw Object.assign(new Error("busy"), { code: "EPERM" });
    };
    const { res, lines } = await handOff("go", { env: { FAKE_CODEX_AUTH_MODE: "apikey" }, removeDir: failing });
    expect(JSON.parse(text(res)).reason).toBe(NOT_CHATGPT);
    expect(lines.join("")).toContain("EPERM");
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

  it("c14b2 every CODEX_ variable but CODEX_HOME is removed", () => {
    const out = codexChildEnv({ PATH: "/bin", CODEX_HOME: "/h", CODEX_ACCESS_TOKEN: "t", CODEX_FOO: "x", codex_lower: "y", KEEP: "1" });
    expect(out.CODEX_HOME).toBe("/h");
    expect(out.CODEX_ACCESS_TOKEN).toBeUndefined();
    expect(out.CODEX_FOO).toBeUndefined();
    expect(out.codex_lower).toBeUndefined();
    expect(out.KEEP).toBe("1");
  });

  it("c14b3 the deny-list names the five extra features", () => {
    for (const name of ["shell_snapshot", "unified_exec_tty", "browser_use_full_cdp_access", "plugin_sharing", "plugin_discovery_prefetch"]) {
      expect(CODEX_DISABLE_FEATURES).toContain(name);
    }
    expect(CODEX_DISABLE_FEATURES).not.toContain("daemon_auto_start");
    expect(CODEX_DISABLE_FEATURES).not.toContain("guardian_approval");
  });

  it("c14c codexExecArgs and codexSpawnCommand", () => {
    const args = codexExecArgs({ dir: "/d", instructionsPath: "/d/instructions.md", nestedArgs: ["a.mjs", "--x"], disable: ["apps"], model: "m1", nodePath: "/n/node" });
    expect(args.slice(-5)).toEqual(["--disable", "apps", "-m", "m1", "-"]);
    expect(args).toContain('mcp_servers.GilbPlatform.args=["a.mjs", "--x"]');
    expect(args).toContain('mcp_servers.GilbPlatform.command="/n/node"');
    for (const platform of ["darwin", "linux"]) expect(codexSpawnCommand("codex", { platform })).toEqual({ command: "codex", prefixArgs: [] });
  });
});
