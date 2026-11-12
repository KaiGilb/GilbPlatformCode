// @vitest-environment node
// Codex on Windows: finding codex.exe, stopping the whole process tree, and a real hand-off through the fake on every OS.
// Runs on macOS and on Windows CI. Hermetic: the real codex is never run.
import { afterEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { codexSpawnCommand, killHopProcess, startConnector } from "../connector/gilb-connector.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FAKE_CLAUDE = join(HERE, "fake-claude.mjs");
const FAKE_CODEX = join(HERE, "fake-codex.mjs");
const FAKE_COMPUTER = join(HERE, "fake-computer.mjs");
const NOT_FOUND = "Could not find Codex. Install it with npm install -g @openai/codex, or pass --codex with the full path to codex.exe.";

describe("codexSpawnCommand", () => {
  const NPM = "C:\\Users\\u\\AppData\\Roaming\\npm";
  const NESTED_X64 = `${NPM}\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe`;
  const HOISTED_X64 = `${NPM}\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe`;
  const MAIN_X64 = `${NPM}\\node_modules\\@openai\\codex\\vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe`;
  const NESTED_ARM = `${NPM}\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-arm64\\vendor\\aarch64-pc-windows-msvc\\bin\\codex.exe`;
  const LAUNCHER = `${NPM}\\node_modules\\@openai\\codex\\bin\\codex.js`;
  const win = (files, extra = {}) => ({
    platform: "win32",
    arch: "x64",
    env: { PATH: `C:\\Windows;${NPM}` },
    exists: (p) => files.includes(p),
    ...extra,
  });

  it("a script path runs through node on every platform", () => {
    const want = { command: process.execPath, prefixArgs: ["/x/fake-codex.mjs"] };
    expect(codexSpawnCommand("/x/fake-codex.mjs", { platform: "darwin" })).toEqual(want);
    expect(codexSpawnCommand("/x/fake-codex.mjs", { platform: "win32", exists: () => false })).toEqual(want);
    expect(codexSpawnCommand("C:\\x\\fake.cjs", { platform: "win32" })).toEqual({ command: process.execPath, prefixArgs: ["C:\\x\\fake.cjs"] });
  });

  it("off Windows a plain name is unchanged", () => {
    expect(codexSpawnCommand("codex", { platform: "darwin" })).toEqual({ command: "codex", prefixArgs: [] });
    expect(codexSpawnCommand("/usr/local/bin/codex", { platform: "linux" })).toEqual({ command: "/usr/local/bin/codex", prefixArgs: [] });
  });

  it("a full .exe path on Windows is used as it is", () => {
    expect(codexSpawnCommand("C:\\tools\\codex.exe", win([]))).toEqual({ command: "C:\\tools\\codex.exe", prefixArgs: [] });
    expect(codexSpawnCommand("C:\\tools\\CODEX.EXE", win([]))).toEqual({ command: "C:\\tools\\CODEX.EXE", prefixArgs: [] });
  });

  it("PATH search finds codex.cmd and resolves the nested x64 exe", () => {
    expect(codexSpawnCommand("codex", win([`${NPM}\\codex.cmd`, NESTED_X64, HOISTED_X64]))).toEqual({ command: NESTED_X64, prefixArgs: [] });
  });

  it("the hoisted exe is used when only that exists", () => {
    expect(codexSpawnCommand("codex", win([`${NPM}\\codex.cmd`, HOISTED_X64]))).toEqual({ command: HOISTED_X64, prefixArgs: [] });
  });

  it("the main package vendor folder is the last exe fallback", () => {
    expect(codexSpawnCommand("codex", win([`${NPM}\\codex.ps1`, MAIN_X64]))).toEqual({ command: MAIN_X64, prefixArgs: [] });
  });

  it("arm64 uses the aarch64 triple", () => {
    expect(codexSpawnCommand("codex", win([`${NPM}\\codex.cmd`, NESTED_ARM], { arch: "arm64" }))).toEqual({ command: NESTED_ARM, prefixArgs: [] });
    expect(() => codexSpawnCommand("codex", win([`${NPM}\\codex.cmd`, NESTED_X64], { arch: "ia32" }))).toThrow(NOT_FOUND);
  });

  it("with no exe but a launcher codex.js, it runs through node", () => {
    expect(codexSpawnCommand("codex", win([`${NPM}\\codex`, LAUNCHER]))).toEqual({ command: process.execPath, prefixArgs: [LAUNCHER] });
  });

  it("nothing found is the exact error", () => {
    expect(() => codexSpawnCommand("codex", win([]))).toThrow(new Error(NOT_FOUND));
    expect(() => codexSpawnCommand("codex", win([`${NPM}\\codex.cmd`]))).toThrow(NOT_FOUND);
  });

  it("env.Path with a capital P works", () => {
    expect(codexSpawnCommand("codex", win([`${NPM}\\codex.cmd`, NESTED_X64], { env: { Path: `C:\\Windows;${NPM}` } }))).toEqual({ command: NESTED_X64, prefixArgs: [] });
  });

  it("a PATH folder with codex.exe directly wins over an earlier shim folder's later entries", () => {
    const direct = "C:\\bin\\codex.exe";
    const out = codexSpawnCommand("codex", win([direct, `${NPM}\\codex.cmd`, NESTED_X64], { env: { PATH: `C:\\bin;${NPM}` } }));
    expect(out).toEqual({ command: direct, prefixArgs: [] });
  });

  it("an empty PATH falls through to Path", () => {
    expect(codexSpawnCommand("codex", win([NESTED_X64, `${NPM}\\codex.cmd`], { env: { PATH: "", Path: `C:\\Windows;${NPM}` } }))).toEqual({ command: NESTED_X64, prefixArgs: [] });
  });

  it("quoted PATH entries are unquoted", () => {
    expect(codexSpawnCommand("codex", win([NESTED_X64, `${NPM}\\codex.cmd`], { env: { PATH: `"C:\\Windows";"${NPM}"` } }))).toEqual({ command: NESTED_X64, prefixArgs: [] });
  });

  it("a folder named codex is skipped and the search continues; the default check wants a real file", () => {
    const first = "C:\\a";
    const files = [`${NPM}\\codex.cmd`, NESTED_X64];
    // `C:\\a\\codex` is a directory: isFile says no for it, yes for the files.
    const isFile = (p) => files.includes(p);
    expect(codexSpawnCommand("codex", { platform: "win32", arch: "x64", env: { PATH: `${first};${NPM}` }, isFile, exists: () => true })).toEqual({ command: NESTED_X64, prefixArgs: [] });
    // With the default check, nothing under a made-up Windows path is a file.
    expect(() => codexSpawnCommand("codex", { platform: "win32", arch: "x64", env: { PATH: "Z:\\no\\such" } })).toThrow(NOT_FOUND);
  });

  it("a path with a separator uses its own folder as the shim folder", () => {
    expect(codexSpawnCommand(`${NPM}\\codex`, win([`${NPM}\\codex.cmd`, NESTED_X64]))).toEqual({ command: NESTED_X64, prefixArgs: [] });
  });
});

describe("killHopProcess", () => {
  const fakeChild = () => ({ pid: 4242, kill: vi.fn() });

  it("on win32 it runs taskkill for the tree and also kills the child", () => {
    const child = fakeChild();
    const handlers = {};
    const spawnFn = vi.fn(() => ({ on: (name, fn) => (handlers[name] = fn) }));
    killHopProcess(child, { platform: "win32", spawnFn });
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(spawnFn).toHaveBeenCalledWith("taskkill", ["/pid", "4242", "/T", "/F"], { stdio: "ignore", windowsHide: true });
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(() => handlers.error(new Error("no taskkill"))).not.toThrow();
  });

  it("elsewhere it is exactly SIGTERM", () => {
    const child = fakeChild();
    const spawnFn = vi.fn();
    killHopProcess(child, { platform: "darwin", spawnFn });
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(spawnFn).not.toHaveBeenCalled();
  });
});

// ---- A real hand-off through the fake (macOS and Windows) ----

const TURN = "turn-codex-win-g1";
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
  const dir = mkdtempSync(join(tmpdir(), "gilb-codex-win-"));
  dirs.push(dir);
  return dir;
}

function listen(handler) {
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let body = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      body = {};
    }
    const reply = (await handler({ url: req.url ?? "", body })) ?? { status: 404, body: { error: "no such door" } };
    res.writeHead(reply.status ?? 200, { "content-type": "application/json" });
    res.end(JSON.stringify(reply.body ?? {}));
  });
  server.requestTimeout = 0;
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      closers.push(() => new Promise((done) => server.close(() => done())));
      resolve({ origin: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}` });
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
      const timer = setTimeout(() => reject(new Error(`no answer for ${method} #${id}`)), 15000);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      input.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  const cancel = (requestId) => input.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId } }) + "\n");
  return { session, request, cancel };
}

function meEnv(extra = {}) {
  const home = scratch();
  return { PATH: process.env.PATH, Path: process.env.Path, HOME: home, USERPROFILE: home, GILB_HOME: home, GILB_CONNECTOR_COMPUTER_MODULE: FAKE_COMPUTER, ...extra };
}

const text = (msg) => msg.result.content[0].text;
const readLog = (file) =>
  existsSync(file)
    ? readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line))
    : [];

let hopCounter = 0;
const hopOf = (task) => ({
  id: (0x0123456789abcdef01234567n + BigInt(++hopCounter)).toString(16).padStart(24, "0"),
  system: "You are Agent.Outcome. Path test: C:\\Users\\x\\y \"quoted\".",
  task,
  tools: [{ name: "list_records", description: "List", inputSchema: { type: "object", properties: {} } }],
  role: "Agent.Outcome",
  answer: { role: "Agent.Outcome", summary: "s" },
});

function door(task) {
  return listen((rec) => {
    if (!rec.url.endsWith("/tool")) return { status: 404, body: { error: "no such door" } };
    if (rec.body.name === "run_named_role") return { body: { hop: hopOf(task) } };
    if (rec.body.name === "hop_done") return { body: { result: JSON.stringify({ closed: true }) } };
    return { body: { result: "tool-ok" } };
  });
}

const call = (box, task = "a") => box.request("tools/call", { name: "run_named_role", arguments: { role: "Agent.Outcome", task } });

describe("a real Codex hand-off through the fake", () => {
  it("g1 succeeds: node starts the fake, stdin reaches it, the instructions path survives a TOML -c value, the hop tool ran", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const logFile = join(scratch(), "codex.log");
    const platform = await door("Do the records.");
    const box = connect({ origin: platform.origin, env: meEnv({ FAKE_CODEX_LOG: logFile }), hopMaxMs: 2 * 60 * 1000 });
    const res = await call(box);
    expect(res.result.isError).toBe(false);
    expect(JSON.parse(text(res)).content).toBe("tool-ok");
    const row = readLog(logFile).find((r) => r.event === "exec");
    expect(row.prompt.startsWith("Do the records.")).toBe(true);
    expect(row.instructions).toContain("Path test: C:\\Users\\x\\y");
    const cvalue = row.argv.find((a) => a.startsWith("model_instructions_file="));
    expect(typeof JSON.parse(cvalue.slice("model_instructions_file=".length))).toBe("string");
  }, 30000);

  it("g2 a run that never ends is stopped at the limit with the timeout answer", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const platform = await door("WAITFOREVER");
    const box = connect({ origin: platform.origin, env: meEnv(), hopMaxMs: 1500 });
    const res = await call(box);
    expect(res.result.isError).toBe(true);
    expect(JSON.parse(text(res)).error).toBe("the hand-off ran out of time");
  }, 30000);

  it("g2b a folder that cannot be removed does not stop a successful hand-off or the session", async () => {
    const lines = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
    const platform = await door("go");
    const box = connect({
      origin: platform.origin,
      env: meEnv(),
      hopMaxMs: 2 * 60 * 1000,
      removeDir: () => {
        throw Object.assign(new Error("busy"), { code: "EBUSY" });
      },
    });
    const res = await call(box);
    expect(res.result.isError).toBe(false);
    expect(lines.join("")).toContain("could not remove the hand-off folder");
  }, 30000);

  it("g3 a hand-off cancelled while the shared feature list runs does not fail the next one", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const logFile = join(scratch(), "codex.log");
    const platform = await door("go");
    const box = connect({ origin: platform.origin, env: meEnv({ FAKE_CODEX_LOG: logFile, FAKE_CODEX_FEATURES_DELAY_MS: "2500" }), hopMaxMs: 2 * 60 * 1000 });
    void call(box).catch(() => undefined); // request id 1, cancelled below
    const second = call(box);
    const deadline = Date.now() + 10000;
    while (!readLog(logFile).some((r) => r.event === "features") && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
    expect(readLog(logFile).some((r) => r.event === "features")).toBe(true);
    box.cancel(1);
    const res = await second;
    expect(res.result.isError).toBe(false);
    expect(JSON.parse(text(res)).content).toBe("tool-ok");
    expect(readLog(logFile).filter((r) => r.event === "features")).toHaveLength(1);
  }, 30000);
});
