#!/usr/bin/env node
/**
 * Codex app-server probe for Chat.CodexConnect, Part 0a.
 *
 * Starts `codex app-server` over stdio, runs the checks named in the brief, and
 * writes a verdict for each one. It never reads the Codex home folder. The only
 * files it writes are under `--out`.
 *
 * Usage: node scripts/codex-probe.mjs --out <folder> [--codex <path>] [--only P1,P5] [--keep]
 *
 * Exit 0 when every selected check reached a verdict.
 * Exit 1 when `codex --version` did not run, or the first handshake failed.
 * Exit 2 when the arguments are wrong.
 *
 * The P5 HTTP server follows Kai-Zen's description of the bridge's per-turn MCP
 * server, given on 2026-11-24 in the brief for this probe. That description is
 * the measurement. It is not copied from a comment in the bridge.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// --- Constants ---
// 180s is the brief's limit for a check. P5 also waits on a tool that is allowed
// 240s, and it does that twice (with the long timeout, and again without it), so
// the P5 cap is the 180s check budget plus two 240s tool waits.
const CHECK_MS = 180_000;
const P5_MS = 180_000 + 240_000 + 240_000;
const SLOW_TOOL_MS = 75_000;
const SLOW_WAIT_MS = 240_000;
const QUIET_MS = 10_000;
const QUIET_CAP_MS = 30_000;
const KILL_MS = 3_000;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PROBE_KEY = "probe-not-a-key";
const CHECKS = [
  ["P1", "Account"],
  ["P2", "Version and timings"],
  ["P3", "The person's own settings"],
  ["P4", "A chat turn has no local tools"],
  ["P5", "The bridge's own MCP server reaches Codex"],
  ["P6", "Instructions and model"],
  ["P7", "Token use"],
];

/**
 * Parses the probe's command line.
 * @param {string[]} argv Arguments after the node binary and the script path.
 * @returns {{ out: string, codex: string, only: string[] | null, keep: boolean }}
 */
export function parseArgs(argv) {
  const out = { out: "", codex: "codex", only: null, keep: false };
  const known = new Set(["--out", "--codex", "--only", "--keep"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!known.has(a)) throw new Error(`Unknown argument ${a}`);
    if (a === "--keep") {
      if (out.keep) throw new Error("Repeated --keep");
      out.keep = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${a} needs a value`);
    i += 1;
    if (a === "--out") {
      if (out.out) throw new Error("Repeated --out");
      out.out = value;
    } else if (a === "--codex") {
      if (out.codex !== "codex") throw new Error("Repeated --codex");
      out.codex = value;
    } else if (a === "--only") {
      if (out.only) throw new Error("Repeated --only");
      const ids = value.split(",").map((s) => s.trim()).filter(Boolean);
      const allowed = new Set(CHECKS.map(([id]) => id));
      if (ids.length === 0 || ids.some((id) => !allowed.has(id))) throw new Error(`Bad --only value ${value}`);
      out.only = ids;
    }
  }
  if (!out.out) throw new Error("--out is required");
  return out;
}

/**
 * Replaces e-mail addresses and the probe's own key literal.
 * The account answer contains an address, and the brief forbids writing one.
 * The key literal is an environment value this process sets, so it is not written either.
 * @param {string} text
 * @returns {string}
 */
export function redactText(text) {
  return String(text).replaceAll(PROBE_KEY, "<redacted>").replace(EMAIL, "<email>");
}

/**
 * Redacts every string inside a JSON-shaped value.
 * @param {unknown} value
 * @returns {unknown}
 */
export function redactValue(value) {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[redactText(k)] = redactValue(v);
    return out;
  }
  return value;
}

function say(line) {
  console.log(redactText(line));
}

function sentence(text) {
  const flat = redactText(String(text).replace(/\s+/g, " ").trim());
  if (!flat) return "No evidence was recorded.";
  return /[.!?]$/.test(flat) ? flat : `${flat}.`;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    }, { once: true });
  });
}

function launchOf(bin, args) {
  // A .js path is the package entry, so node has to start it. Anything else is the binary.
  if (/\.(?:mjs|js)$/i.test(bin)) return { cmd: process.execPath, args: [bin, ...args] };
  return { cmd: bin, args };
}

function signalGroup(child, sig) {
  // A new process group lets the probe stop Codex and the helpers it spawned
  // without signalling this process. Killing only the parent leaves those helpers up.
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, sig);
      return;
    } catch {
      /* the child may already have left the group */
    }
  }
  try {
    child.kill(sig);
  } catch {
    /* already gone */
  }
}

function killChild(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    child.once("exit", finish);
    signalGroup(child, "SIGTERM");
    setTimeout(() => {
      signalGroup(child, "SIGKILL");
      finish();
    }, KILL_MS);
  });
}

function emptyDir(parent, name) {
  const dir = path.join(parent, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the verdict is already decided; a leftover folder is not a verdict */
  }
}

function writeJsonl(file, obj) {
  fs.appendFileSync(file, `${redactText(JSON.stringify(redactValue(obj)))}\n`);
}

/**
 * One app-server child and its JSON-RPC log.
 * @param {object} opts
 * @param {string} opts.bin
 * @param {string[]} opts.args Arguments after `app-server`.
 * @param {string} opts.logFile
 * @param {string} opts.cwd
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {number} opts.childIndex
 * @param {AbortSignal} opts.signal
 */
function openCodex(opts) {
  const spec = launchOf(opts.bin, ["app-server", ...opts.args]);
  const started = Date.now();
  writeJsonl(opts.logFile, { ms: 0, dir: "spawn", child: opts.childIndex, argv: spec.args });
  const child = spawn(spec.cmd, spec.args, {
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
  });
  const pending = new Map();
  const listeners = new Set();
  const serverRequests = [];
  let buffer = "";
  let stderrLines = 0;
  const stderrTail = [];
  let closed = false;
  let decider = (msg) => decideServerRequest(msg, "decline");

  const failPending = (err) => {
    for (const [, item] of pending) {
      clearTimeout(item.timer);
      item.reject(err);
    }
    pending.clear();
  };

  const onLine = (line) => {
    const ms = Date.now() - started;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      writeJsonl(opts.logFile, { ms, dir: "s2c", child: opts.childIndex, raw: line.slice(0, 500) });
      return;
    }
    writeJsonl(opts.logFile, { ms, dir: "s2c", child: opts.childIndex, msg });
    const isReply = msg && msg.id !== undefined && msg.id !== null && (Object.prototype.hasOwnProperty.call(msg, "result") || Object.prototype.hasOwnProperty.call(msg, "error")) && msg.method === undefined;
    const isAsk = msg && msg.method && msg.id !== undefined && msg.id !== null && !isReply;
    if (isAsk) {
      let answer;
      try {
        answer = decider(msg);
      } catch (e) {
        answer = { error: { code: -32000, message: String(e?.message ?? e) } };
      }
      serverRequests.push({ method: msg.method, params: msg.params ?? null, answer });
      const out = answer?.error ? { id: msg.id, error: answer.error } : { id: msg.id, result: answer?.result ?? {} };
      send(out);
      return;
    }
    if (msg && msg.id !== undefined && msg.id !== null && pending.has(msg.id)) {
      const item = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(item.timer);
      if (msg.error) item.reject(Object.assign(new Error(msg.error.message || "request failed"), { rpc: msg.error }));
      else item.resolve(msg.result);
      return;
    }
    if (msg?.method) {
      for (const fn of listeners) fn(msg);
    }
  };

  child.stdout.on("data", (buf) => {
    buffer += buf.toString("utf8");
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i).replace(/\r$/, "");
      buffer = buffer.slice(i + 1);
      if (line.trim()) onLine(line);
    }
  });
  child.stderr.on("data", (buf) => {
    for (const line of buf.toString("utf8").split(/\n/)) {
      if (!line.trim()) continue;
      stderrLines += 1;
      const text = line.slice(0, 500);
      stderrTail.push(text);
      if (stderrTail.length > 8) stderrTail.shift();
      // Stderr is not the protocol. A short tail is enough to explain a dead child.
      if (stderrLines <= 40) writeJsonl(opts.logFile, { ms: Date.now() - started, dir: "stderr", child: opts.childIndex, text });
    }
  });
  child.on("error", (err) => failPending(err));
  child.on("exit", (code, sig) => {
    // Stderr can still be flushing when exit fires. Read it on the next turn so the log line quotes the same text.
    setImmediate(() => {
      const why = stderrTail.join(" ").replace(/\s+/g, " ").trim();
      writeJsonl(opts.logFile, { ms: Date.now() - started, dir: "exit", child: opts.childIndex, code, signal: sig, stderr: why });
      if (!closed) failPending(new Error(why ? `app-server exited code ${code} signal ${sig}: ${why}` : `app-server exited code ${code} signal ${sig}`));
    });
  });

  function send(msg) {
    writeJsonl(opts.logFile, { ms: Date.now() - started, dir: "c2s", child: opts.childIndex, msg });
    child.stdin.write(`${JSON.stringify(msg)}\n`);
  }

  function request(method, params, timeoutMs, signal) {
    const id = (request.nextId = (request.nextId ?? 0) + 1);
    send({ method, id, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      const onAbort = () => {
        clearTimeout(timer);
        pending.delete(id);
        reject(new Error("aborted"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      pending.set(id, {
        resolve: (v) => {
          signal?.removeEventListener("abort", onAbort);
          resolve(v);
        },
        reject: (e) => {
          signal?.removeEventListener("abort", onAbort);
          reject(e);
        },
        timer,
      });
    });
  }

  return {
    started,
    serverRequests,
    get decider() {
      return decider;
    },
    set decider(fn) {
      decider = fn;
    },
    request,
    notify(method, params) {
      const msg = { method };
      if (params !== undefined) msg.params = params;
      send(msg);
    },
    onNotification(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async close() {
      if (closed) return;
      closed = true;
      failPending(new Error("session closed"));
      try {
        child.stdin.end();
      } catch {
        /* already closed */
      }
      await killChild(child);
    },
  };
}

class HarnessError extends Error {}

async function handshake(session, ctx, signal) {
  let result;
  try {
    // The generated InitializeParams for this CLI require the field. Null means
    // the probe opts into neither experimental API nor attestation requests.
    result = await session.request("initialize", {
      clientInfo: { name: "gilb-codex-probe", title: "Gilb Codex probe", version: "0" },
      capabilities: null,
    }, 30_000, signal);
  } catch (e) {
    if (!ctx.handshakeOk) throw new HarnessError(e.message);
    throw e;
  }
  // Generated ClientNotification is a unit variant, so there is no params object.
  session.notify("initialized");
  ctx.handshakeOk = true;
  if (!ctx.platform) ctx.platform = result?.platformOs || result?.platformFamily || process.platform;
  return { result, ms: Date.now() - session.started };
}

function decideServerRequest(msg, policy) {
  const method = msg.method;
  const params = msg.params ?? {};
  const accept = policy === "accept";
  if (method === "item/commandExecution/requestApproval" || method === "item/fileChange/requestApproval") {
    return { result: { decision: accept ? pickAccept(params) : "decline" } };
  }
  if (method === "applyPatchApproval" || method === "execCommandApproval") {
    // These two still use the older decision names from the generated ReviewDecision type.
    if (!accept) return { result: { decision: { denied: { rejection: "probe declines" } } } };
    return { result: { decision: "approved" } };
  }
  if (method === "item/permissions/requestApproval") {
    if (!accept) return { result: { permissions: {}, scope: "turn" } };
    return { result: { permissions: params.permissions ?? {}, scope: "turn" } };
  }
  if (method === "mcpServer/elicitation/request") {
    return { result: { action: accept ? "accept" : "decline", content: null, _meta: null } };
  }
  if (method === "item/tool/requestUserInput") {
    const answers = {};
    for (const q of params.questions ?? []) answers[q.id] = { answers: [] };
    return { result: { answers } };
  }
  if (method === "item/tool/call") {
    return { result: { contentItems: [{ type: "inputText", text: "probe does not run this tool" }], success: false } };
  }
  // Refresh and attestation need secrets from the Codex home. The probe must not read that folder.
  if (method === "account/chatgptAuthTokens/refresh" || method === "attestation/generate") {
    return { error: { code: -32000, message: "probe does not hold auth tokens" } };
  }
  return { error: { code: -32601, message: `unhandled server request ${method}` } };
}

function pickAccept(params) {
  // The 2026-11-24 lead included availableDecisions. This CLI's generated type
  // often omits it and uses "accept" as the one-time yes.
  const offered = Array.isArray(params.availableDecisions) ? params.availableDecisions : null;
  const prefer = ["accept", "approved", "acceptForSession", "approved_for_session"];
  if (offered) {
    for (const want of prefer) if (offered.includes(want)) return want;
  }
  return "accept";
}

function isApproval(method) {
  return /approval|elicitation/i.test(method ?? "");
}

function accountFacts(result) {
  const account = result?.account ?? null;
  return {
    type: account?.type ?? null,
    planType: account?.type === "chatgpt" ? account.planType ?? null : null,
    requiresOpenaiAuth: result?.requiresOpenaiAuth ?? null,
  };
}

async function accountRead(session, signal) {
  return accountFacts(await session.request("account/read", { refreshToken: false }, 30_000, signal));
}

function threadParams(cwd, extra = {}) {
  return {
    cwd,
    approvalPolicy: extra.approvalPolicy ?? "never",
    sandbox: "read-only",
    ephemeral: true,
    ...(extra.config ? { config: extra.config } : {}),
    ...(extra.developerInstructions !== undefined ? { developerInstructions: extra.developerInstructions } : {}),
    ...(extra.baseInstructions !== undefined ? { baseInstructions: extra.baseInstructions } : {}),
  };
}

function userInput(text) {
  return [{ type: "text", text, text_elements: [] }];
}

function watchTurn(session, turnRef) {
  const state = {
    firstDeltaAt: null,
    completed: null,
    completedAt: null,
    itemTypes: [],
    usage: null,
    texts: [],
  };
  const off = session.onNotification((msg) => {
    // A second turn on the same thread must not consume the first turn's late events.
    const id = msg.params?.turnId ?? msg.params?.turn?.id ?? null;
    if (turnRef.id && id && id !== turnRef.id) return;
    if (msg.method === "item/agentMessage/delta" && state.firstDeltaAt === null) state.firstDeltaAt = Date.now();
    if (msg.method === "item/started" || msg.method === "item/completed") {
      const type = msg.params?.item?.type;
      if (typeof type === "string") state.itemTypes.push(type);
      if (msg.method === "item/completed" && type === "agentMessage" && typeof msg.params.item.text === "string") {
        state.texts.push({ phase: msg.params.item.phase ?? null, text: msg.params.item.text });
      }
    }
    if (msg.method === "thread/tokenUsage/updated") state.usage = msg.params?.tokenUsage ?? null;
    if (msg.method === "turn/completed" && state.completed === null) {
      state.completed = msg.params?.turn ?? null;
      state.completedAt = Date.now();
    }
  });
  return { state, off };
}

async function runTurn(session, params, waitMs, signal) {
  const turnRef = { id: null };
  const watch = watchTurn(session, turnRef);
  const mark = session.serverRequests.length;
  const sent = Date.now();
  try {
    const started = await session.request("turn/start", params, 60_000, signal);
    const turnId = started?.turn?.id ?? null;
    turnRef.id = turnId;
    const deadline = Date.now() + waitMs;
    while (!watch.state.completed) {
      if (signal?.aborted) throw new Error("aborted");
      if (Date.now() > deadline) throw new Error(`turn did not complete within ${waitMs} ms`);
      await sleep(100, signal);
    }
    // The usage notice can arrive a moment after turn/completed. P7 needs that object.
    const usageUntil = Date.now() + 1000;
    while (!watch.state.usage && Date.now() < usageUntil) await sleep(50, signal);
    const text = finalText(watch.state);
    return {
      turnId,
      status: watch.state.completed?.status ?? null,
      error: watch.state.completed?.error ?? null,
      text,
      itemTypes: [...new Set(watch.state.itemTypes)],
      items: watch.state.completed?.items ?? [],
      firstDeltaMs: watch.state.firstDeltaAt === null ? null : watch.state.firstDeltaAt - sent,
      completedMs: watch.state.completedAt === null ? null : watch.state.completedAt - sent,
      usage: watch.state.usage,
      serverRequests: session.serverRequests.slice(mark).map(publicRequest),
    };
  } finally {
    watch.off();
  }
}

function finalText(state) {
  const fromTurn = (state.completed?.items ?? []).filter((it) => it?.type === "agentMessage" && typeof it.text === "string");
  const pool = fromTurn.length > 0 ? fromTurn.map((it) => ({ phase: it.phase ?? null, text: it.text })) : state.texts;
  const final = [...pool].reverse().find((it) => it.phase === "final_answer");
  return (final ?? pool[pool.length - 1])?.text ?? "";
}

function publicRequest(req) {
  return { method: req.method, params: req.params, answer: req.answer };
}

function mcpReported(items) {
  return (items ?? []).filter((it) => it?.type === "mcpToolCall").map((it) => ({
    type: it.type,
    server: it.server ?? null,
    tool: it.tool ?? null,
    status: it.status ?? null,
  }));
}

function serverOffFlag(name) {
  // A bare TOML key cannot hold a dot or a space. Those names are quoted, and so is any other name that is not bare.
  const bare = /^[A-Za-z0-9_-]+$/.test(name);
  const segment = bare ? name : `"${String(name).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return { text: `mcp_servers.${segment}.enabled=false`, quoted: !bare };
}

function featureArgs(way) {
  const names = ["apps", "plugins"];
  if (way === "e") names.push("hooks", "memories", "goals", "multi_agent", "browser_use", "computer_use");
  const args = [];
  for (const name of names) args.push("--disable", name);
  return args;
}

/**
 * Builds the CLI args and thread config for one P3 way.
 * An empty mcp_servers table cannot sit next to the probe's own server, so when
 * a url is added the empty table is replaced by that one server, on the same route.
 * @param {"a"|"b"|"c"|"d"|"e"} way
 * @param {string[]} baselineNames
 * @param {{ shellOff?: boolean, via?: "config"|"cli"|null, url?: string, timeout?: boolean }} [extra]
 */
function isolation(way, baselineNames, extra = {}) {
  const args = [];
  const quoted = [];
  const notes = [];
  let config = null;
  // A baseline server named gilb would be turned off by the same flag that must leave the probe server on.
  const names = extra.url ? baselineNames.filter((n) => n !== "gilb") : baselineNames;
  if (extra.url && baselineNames.includes("gilb")) notes.push("baseline name gilb was not disabled");
  if (way === "d" || way === "e") {
    for (const name of names) {
      const flag = serverOffFlag(name);
      args.push("-c", flag.text);
      if (flag.quoted) quoted.push(flag.text);
    }
    args.push(...featureArgs(way));
  }
  if (extra.shellOff) args.push("--disable", "shell_tool");
  const gilb = extra.url ? { url: extra.url } : null;
  if (gilb && extra.timeout) gilb.tool_timeout_sec = 2000;
  if (extra.via === "config" && gilb) {
    // Way b's empty table and this server share one route: the thread config owns mcp_servers.
    config = { mcp_servers: { gilb } };
    if (way === "b") notes.push("thread config lists only gilb");
    if (way === "c") {
      args.push("-c", "mcp_servers={}");
      notes.push("CLI empty table and thread config gilb are both sent");
    }
  } else if (extra.via === "cli" && gilb) {
    // An empty table on either route deletes the url this branch is setting.
    if (way === "b") notes.push("empty thread table omitted so it does not drop the CLI url");
    if (way === "c") notes.push("empty CLI table replaced by the gilb url");
    args.push("-c", `mcp_servers.gilb.url=${tomlString(extra.url)}`);
    if (extra.timeout) args.push("-c", "mcp_servers.gilb.tool_timeout_sec=2000");
  } else {
    if (way === "b") config = { mcp_servers: {} };
    if (way === "c") args.push("-c", "mcp_servers={}");
  }
  return { args, config, quoted, notes, skippedBaseline: extra.url ? baselineNames.filter((n) => n === "gilb") : [] };
}

function tomlString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function countNested(result, key) {
  if (!result || result.error) return { count: null, error: result?.error ?? "no result" };
  const data = result.data;
  if (!Array.isArray(data)) return { count: null, error: "no data array" };
  if (data.length === 0) return { count: 0 };
  if (data.every((row) => row && Array.isArray(row[key]))) {
    return { count: data.reduce((n, row) => n + row[key].length, 0) };
  }
  return { count: data.length };
}

function countPlugins(result) {
  if (!result || result.error) return { count: null, error: result?.error ?? "no result" };
  if (!Array.isArray(result.marketplaces)) return { count: null, error: "no marketplaces" };
  return { count: result.marketplaces.reduce((n, row) => n + (Array.isArray(row?.plugins) ? row.plugins.length : 0), 0) };
}

async function callOrError(session, method, params, signal) {
  try {
    return await session.request(method, params, 30_000, signal);
  } catch (e) {
    return { error: e.message };
  }
}

function endsWithToken(text, token) {
  return typeof text === "string" && new RegExp(`${token}\\s*$`).test(text);
}

function longInstructions() {
  const head = "End every reply with the token ZEBRA-7.\n";
  let text = head;
  const line = "filler\n";
  while (text.length + line.length <= 60_000) text += line;
  if (text.length < 60_000) text += "x".repeat(60_000 - text.length);
  return text;
}

function clip(text, max = 2000) {
  const s = typeof text === "string" ? text : "";
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function verdict(id, name, v, evidence, started, details) {
  return { id, name, verdict: v, evidence: sentence(evidence), ms: Date.now() - started, details: redactValue(details) };
}

async function codexVersion(bin) {
  const spec = launchOf(bin, ["--version"]);
  return new Promise((resolve) => {
    let out = "";
    let child;
    try {
      child = spawn(spec.cmd, spec.args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      resolve({ ok: false, text: "", error: e.message });
      return;
    }
    const take = (buf) => {
      if (out.length < 2000) out += buf.toString("utf8");
    };
    child.stdout?.on("data", take);
    child.stderr?.on("data", take);
    const timer = setTimeout(() => signalGroup(child, "SIGKILL"), 30_000);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, text: "", error: e.message });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      const text = redactText(out.trim());
      resolve({ ok: code === 0 && text.length > 0, text, code });
    });
  });
}

async function checkP1(ctx, signal) {
  const started = Date.now();
  const name = "Account";
  let child = 0;
  const open = (env) => openCodex({
    bin: ctx.bin,
    args: [],
    logFile: ctx.log("P1"),
    cwd: ctx.runDir,
    env,
    childIndex: ++child,
    signal,
  });
  let first;
  let second;
  const a = open(process.env);
  try {
    await handshake(a, ctx, signal);
    first = await accountRead(a, signal);
  } finally {
    await a.close();
  }
  const b = open({ ...process.env, OPENAI_API_KEY: PROBE_KEY, CODEX_API_KEY: PROBE_KEY });
  try {
    await handshake(b, ctx, signal);
    second = await accountRead(b, signal);
  } catch (e) {
    if (e instanceof HarnessError || signal.aborted) throw e;
    second = { error: e.message, type: null, planType: null };
  } finally {
    await b.close();
  }
  const still = second.type === "chatgpt";
  const proved = first.type === "chatgpt";
  const evidence = proved
    ? `Account type is chatgpt (planType ${first.planType}), and a second server with the probe API key variables set ${still ? "still reported chatgpt" : `reported ${second.type ?? second.error ?? "no type"}`}`
    : `Account type is ${first.type ?? "missing"}, so it is not chatgpt`;
  return verdict("P1", name, proved ? "PROVED" : "DISPROVED", evidence, started, {
    type: first.type,
    planType: first.planType,
    withKeyEnv: second.error ? { stillChatgpt: false, error: second.error, type: second.type ?? null } : { stillChatgpt: still, type: second.type, planType: second.planType },
  });
}

async function checkP2(ctx, signal) {
  const started = Date.now();
  const name = "Version and timings";
  writeJsonl(ctx.log("P2"), { ms: 0, dir: "version", text: ctx.codexVersion });
  const cwd = emptyDir(ctx.runDir, "p2");
  const session = openCodex({ bin: ctx.bin, args: [], logFile: ctx.log("P2"), cwd, childIndex: 1, signal });
  try {
    const hs = await handshake(session, ctx, signal);
    const t0 = Date.now();
    const thread = await session.request("thread/start", threadParams(cwd), 60_000, signal);
    const threadStartMs = Date.now() - t0;
    const turn = await runTurn(session, { threadId: thread.thread.id, input: userInput("Reply with the single word OK.") }, 120_000, signal);
    if (turn.usage) ctx.p2Usage = turn.usage;
    const proved = turn.text.includes("OK");
    return verdict("P2", name, proved ? "PROVED" : "DISPROVED", proved
      ? `The final answer contained OK (initialize ${hs.ms} ms, thread/start ${threadStartMs} ms, first delta ${turn.firstDeltaMs} ms, turn completed ${turn.completedMs} ms)`
      : `The final answer did not contain OK (status ${turn.status})`, started, {
      version: ctx.codexVersion,
      initMs: hs.ms,
      threadStartMs,
      firstDeltaMs: turn.firstDeltaMs,
      turnCompletedMs: turn.completedMs,
      finalText: clip(turn.text, 300),
      userAgent: hs.result?.userAgent ?? null,
    });
  } finally {
    await session.close();
    if (!ctx.keep) removeDir(cwd);
  }
}

async function checkP3(ctx, signal) {
  const started = Date.now();
  const name = "The person's own settings";
  const ways = [];
  let baselineNames = [];
  const specs = [
    ["a", "baseline"],
    ["b", "thread config mcp_servers empty"],
    ["c", "CLI mcp_servers empty"],
    ["d", "disable each baseline server, apps and plugins"],
    ["e", "as d, plus the other stable features"],
    ["f", "CODEX_HOME empty"],
  ];
  let child = 0;
  for (const [id, label] of specs) {
    if (signal.aborted) throw new Error("aborted");
    const built = id === "f" ? { args: [], config: null, quoted: [] } : isolation(id, id === "d" || id === "e" ? baselineNames : []);
    const home = id === "f" ? emptyDir(ctx.runDir, "p3-f-home") : null;
    const cwd = emptyDir(ctx.runDir, `p3-${id}`);
    const env = id === "f" ? { ...process.env, CODEX_HOME: home } : process.env;
    const session = openCodex({
      bin: ctx.bin,
      args: built.args,
      logFile: ctx.log("P3"),
      cwd,
      env,
      childIndex: ++child,
      signal,
    });
    const row = { id, label, argv: built.args, threadConfig: built.config, quoted: built.quoted, accountType: null, planType: null, servers: [], listed: [], notified: [], skills: null, hooks: null, plugins: null, errors: {}, quietCapped: false };
    try {
      await handshake(session, ctx, signal);
      const account = await accountRead(session, signal);
      row.accountType = account.type;
      row.planType = account.planType;
      const notified = [];
      let last = 0;
      const off = session.onNotification((msg) => {
        if (msg.method !== "mcpServer/startupStatus/updated") return;
        last = Date.now();
        notified.push({ name: msg.params?.name ?? null, status: msg.params?.status ?? null, error: msg.params?.error ?? null });
      });
      const thread = await session.request("thread/start", threadParams(cwd, { config: built.config }), 60_000, signal);
      const threadId = thread?.thread?.id;
      const waitStarted = Date.now();
      last = waitStarted;
      while (Date.now() - last < QUIET_MS) {
        if (Date.now() - waitStarted > QUIET_CAP_MS) {
          row.quietCapped = true;
          break;
        }
        await sleep(200, signal);
      }
      const listed = await callOrError(session, "mcpServerStatus/list", { threadId, limit: 50, detail: "toolsAndAuthOnly" }, signal);
      if (listed.error) row.errors.mcp = listed.error;
      else {
        let cursor = listed.nextCursor ?? null;
        const rows = [...(listed.data ?? [])];
        while (cursor) {
          const page = await callOrError(session, "mcpServerStatus/list", { threadId, cursor, limit: 50, detail: "toolsAndAuthOnly" }, signal);
          if (page.error) {
            row.errors.mcp = page.error;
            break;
          }
          rows.push(...(page.data ?? []));
          cursor = page.nextCursor ?? null;
        }
        row.listed = rows.map((r) => ({ name: r?.name ?? null, runtimeStatus: r?.runtimeStatus ?? null }));
      }
      const skills = await callOrError(session, "skills/list", { cwds: [cwd], forceReload: true }, signal);
      const hooks = await callOrError(session, "hooks/list", { threadId }, signal);
      const plugins = await callOrError(session, "plugin/installed", { cwds: [cwd] }, signal);
      off();
      row.notified = notified;
      const skillCount = countNested(skills, "skills");
      const hookCount = countNested(hooks, "hooks");
      const pluginCount = countPlugins(plugins);
      row.skills = skillCount.count;
      row.hooks = hookCount.count;
      row.plugins = pluginCount.count;
      if (skillCount.error) row.errors.skills = skillCount.error;
      if (hookCount.error) row.errors.hooks = hookCount.error;
      if (pluginCount.error) row.errors.plugins = pluginCount.error;
      const names = new Set();
      for (const item of notified) if (item.name) names.add(item.name);
      for (const item of row.listed) if (item.name) names.add(item.name);
      row.servers = [...names];
      if (id === "a") baselineNames = row.servers;
    } catch (e) {
      if (e instanceof HarnessError || signal.aborted) throw e;
      row.errors.run = e.message;
    } finally {
      await session.close();
      if (!ctx.keep) {
        removeDir(cwd);
        if (home) removeDir(home);
      }
    }
    ways.push(row);
  }
  ctx.baselineNames = baselineNames;
  const order = ["b", "c", "d", "e"];
  const winner = order.map((id) => ways.find((row) => row.id === id)).find((row) => row && row.accountType === "chatgpt" && !row.errors.mcp && !row.errors.run && row.servers.length === 0);
  ctx.p3Way = winner?.id ?? null;
  const f = ways.find((row) => row.id === "f");
  const proved = Boolean(winner);
  const evidence = proved
    ? `Way ${winner.id} (${winner.label}) showed no MCP server and account/read still returned chatgpt`
    : `None of ways b, c, d or e showed no MCP server while account/read still returned chatgpt`;
  return verdict("P3", name, proved ? "PROVED" : "DISPROVED", evidence, started, {
    ways,
    smallest: winner?.id ?? null,
    baselineNames,
    codexHomeStillChatgpt: f ? f.accountType === "chatgpt" : null,
  });
}

async function checkP4(ctx, signal) {
  const started = Date.now();
  const name = "A chat turn has no local tools";
  const way = ctx.p3Way ?? "e";
  const prompt = "Do these two things. 1. Run the shell command `echo PROBE-P4 > p4.txt`. 2. Then list every tool or function you can call, by its exact name, one per line. If you cannot run commands, say CANNOT.";
  // The shell-on repeat is still required when the shell-off server dies, so its result is recorded either way.
  const off = await oneShellTurn(ctx, way, true, prompt, "p4-off", 1, signal).catch((e) => {
    if (e instanceof HarnessError || signal.aborted) throw e;
    return { error: e.message, itemTypes: [], serverRequests: [], text: "", fileExists: false };
  });
  const on = await oneShellTurn(ctx, way, false, prompt, "p4-on", 2, signal).catch((e) => {
    if (e instanceof HarnessError || signal.aborted) throw e;
    return { error: e.message, itemTypes: [], serverRequests: [], text: "", fileExists: false };
  });
  if (off.error) {
    return verdict("P4", name, "UNKNOWN", `The shell_tool-off server did not stay up: ${off.error}`, started, {
      way,
      itemTypes: [],
      toolListText: "",
      serverRequests: [],
      p4FileExists: false,
      withShell: on.error ? { error: on.error } : { itemTypes: on.itemTypes, fileExists: on.fileExists, serverRequests: on.serverRequests, text: clip(on.text, 500) },
    });
  }
  const noCommand = !off.itemTypes.includes("commandExecution") && !off.itemTypes.includes("fileChange");
  const noApproval = !off.serverRequests.some((req) => isApproval(req.method));
  const noFile = !off.fileExists;
  const proved = noCommand && noApproval && noFile;
  const missed = [
    noCommand ? null : "a commandExecution or fileChange item started",
    noApproval ? null : "an approval request arrived",
    noFile ? null : "p4.txt was created",
  ].filter(Boolean);
  const evidence = proved
    ? `With way ${way} and shell_tool disabled, no commandExecution or fileChange item started, no approval request arrived, and p4.txt was not created`
    : `With way ${way} and shell_tool disabled, ${missed.join(", ")}`;
  return verdict("P4", name, proved ? "PROVED" : "DISPROVED", evidence, started, {
    way,
    itemTypes: off.itemTypes,
    toolListText: clip(off.text),
    serverRequests: off.serverRequests,
    p4FileExists: off.fileExists,
    withShell: on.error ? { error: on.error } : { itemTypes: on.itemTypes, fileExists: on.fileExists, serverRequests: on.serverRequests, text: clip(on.text, 500) },
  });
}

async function oneShellTurn(ctx, way, shellOff, prompt, folder, childIndex, signal) {
  const built = isolation(way, ctx.baselineNames ?? [], { shellOff });
  const cwd = emptyDir(ctx.runDir, folder);
  const session = openCodex({ bin: ctx.bin, args: built.args, logFile: ctx.log("P4"), cwd, childIndex, signal });
  try {
    await handshake(session, ctx, signal);
    const thread = await session.request("thread/start", threadParams(cwd, { config: built.config }), 60_000, signal);
    const turn = await runTurn(session, { threadId: thread.thread.id, input: userInput(prompt) }, 120_000, signal);
    return { ...turn, fileExists: fs.existsSync(path.join(cwd, "p4.txt")) };
  } finally {
    await session.close();
    if (!ctx.keep) removeDir(cwd);
  }
}

/**
 * Stands up the probe's HTTP MCP server.
 * Measurement: Kai-Zen's description of the bridge's per-turn MCP server, 2026-11-24.
 * @param {{ log: (obj: object) => void }} opts
 * @returns {Promise<{ url: string, records: object[], close: () => Promise<void> }>}
 */
export function startProbeMcpServer(opts) {
  const id = crypto.randomBytes(8).toString("hex");
  const token = crypto.randomBytes(24).toString("hex");
  const route = `/mcp/${id}/${token}`;
  const records = [];
  const log = opts.log ?? (() => {});

  const record = (req, extra) => {
    const row = {
      httpMethod: req.method ?? null,
      path: req.url ?? null,
      headerNames: Object.keys(req.headers),
      accept: headerValue(req.headers.accept),
      contentType: headerValue(req.headers["content-type"]),
      mcpSessionId: headerValue(req.headers["mcp-session-id"]),
      ...extra,
    };
    records.push(row);
    log({ dir: "mcp", ...row });
    return row;
  };

  const server = http.createServer(async (req, res) => {
    try {
    let pathname = req.url ?? "";
    try {
      pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    } catch {
      pathname = req.url ?? "";
    }
    const pathOk = pathname === route || pathname === `${route}/`;
    if (!pathOk) {
      record(req, { status: 404 });
      return json(res, 404, { error: "not found" });
    }
    // A browser sends Origin. The measured server refuses that before it looks at the method.
    if (req.headers.origin !== undefined) {
      record(req, { status: 403 });
      return json(res, 403, { error: "no browsers here" });
    }
    if (req.method !== "POST") {
      record(req, { status: 405 });
      res.writeHead(405, { allow: "POST" });
      res.end();
      return;
    }
    let body;
    try {
      body = await readJson(req);
    } catch (e) {
      record(req, { status: e.status ?? 400, error: e.message });
      return json(res, e.status ?? 400, { error: e.message });
    }
    const batch = Array.isArray(body);
    const msgs = batch ? body : [body];
    const tools = msgs.filter((m) => m?.method === "tools/call").map((m) => m?.params?.name ?? null);
    const row = record(req, { status: null, rpcMethods: msgs.map((m) => m?.method ?? null), tools });
    const replies = [];
    for (const msg of msgs) {
      if (!msg || typeof msg !== "object") {
        replies.push({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "invalid request" } });
        continue;
      }
      if (msg.id === undefined || msg.id === null) continue;
      replies.push(await mcpResult(msg, req, res));
    }
    if (replies.length === 0) {
      row.status = 202;
      res.writeHead(202);
      res.end();
      return;
    }
    row.status = 200;
    return json(res, 200, batch ? replies : replies[0]);
  } catch (e) {
    if (!res.headersSent) json(res, 500, { error: "probe error" });
    else {
      try {
        res.end();
      } catch {
        /* the client already left */
      }
    }
    log({ dir: "mcp", error: String(e?.message ?? e) });
  }
  });
  // probe_slow holds the socket for 75s. The default timeouts would cut that short of the brief.
  server.requestTimeout = 0;
  server.headersTimeout = 120_000;
  server.setTimeout(0);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({
        url: `http://127.0.0.1:${port}${route}`,
        records,
        close() {
          server.closeAllConnections?.();
          return new Promise((done) => server.close(() => done()));
        },
      });
    });
  });
}

function headerValue(value) {
  if (value === undefined) return null;
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  res.end(text);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(Object.assign(new Error("too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) {
        reject(Object.assign(new Error("empty"), { status: 400 }));
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(Object.assign(new Error("not json"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

async function mcpResult(msg, req, res) {
  const ok = (result) => ({ jsonrpc: "2.0", id: msg.id, result });
  const bad = (code, message) => ({ jsonrpc: "2.0", id: msg.id, error: { code, message } });
  if (msg.method === "initialize") {
    return ok({
      protocolVersion: msg.params?.protocolVersion ?? "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "gilb", version: "1" },
    });
  }
  if (msg.method === "ping") return ok({});
  if (msg.method === "tools/list") {
    const schema = { type: "object", properties: { text: { type: "string" } }, required: ["text"] };
    return ok({
      tools: [
        { name: "probe_echo", description: "Return ECHO: plus the text.", inputSchema: schema },
        { name: "probe_slow", description: "Return ECHO: plus the text after 75 seconds.", inputSchema: schema },
      ],
    });
  }
  if (msg.method === "tools/call") {
    const name = msg.params?.name;
    const args = parseToolArgs(msg.params?.arguments);
    if (typeof args?.text !== "string") return bad(-32602, "text must be a string");
    if (name === "probe_slow") {
      // 75s is the brief's delay. Stop early when the client has already gone.
      const timer = sleep(SLOW_TOOL_MS);
      const gone = new Promise((resolve) => req.on("close", () => resolve("gone")));
      const which = await Promise.race([timer.then(() => "waited"), gone]);
      if (which === "gone" || res.writableEnded) return ok({ content: [{ type: "text", text: "cancelled" }] });
    }
    if (name !== "probe_echo" && name !== "probe_slow") return bad(-32602, `unknown tool ${name}`);
    return ok({ content: [{ type: "text", text: `ECHO:${args.text}` }] });
  }
  return bad(-32601, `method not found: ${msg.method}`);
}

function parseToolArgs(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value ?? null;
}

async function checkP5(ctx, signal) {
  const started = Date.now();
  const name = "The bridge's own MCP server reaches Codex";
  const way = ctx.p3Way ?? "e";
  const prompt = "Call the tool probe_echo with text hello-p5 and reply with exactly what it returned.";
  const mcp = await startProbeMcpServer({ log: (obj) => writeJsonl(ctx.log("P5"), { ms: Date.now() - started, ...obj }) });
  let child = 0;
  const runs = [];
  try {
    let winner = null;
    for (const via of ["config", "cli"]) {
      if (signal.aborted) throw new Error("aborted");
      const mark = mcp.records.length;
      const run = await p5Turn1(ctx, { way, via, url: mcp.url, timeout: true, approval: "never", folder: `p5-${via}`, childIndex: ++child, signal, prompt });
      run.tools = toolsSince(mcp, mark);
      run.hit = run.tools.includes("probe_echo");
      run.textOk = Boolean(run.turn?.text?.includes("ECHO:hello-p5"));
      runs.push(run);
      if (run.hit && run.textOk) {
        winner = run;
        break;
      }
      // A failed route must not leave its app-server running into the next route.
      await closeRun(ctx, run);
    }
    const chosen = winner ?? runs.find((run) => run.hit) ?? runs[0];
    const asked = (chosen?.turn?.serverRequests ?? []).filter((req) => isApproval(req.method));
    const policyRuns = [];
    if (asked.length > 0 && chosen?.via) {
      for (const approval of ["untrusted", "on-request"]) {
        const again = await p5Turn1(ctx, { way, via: chosen.via, url: mcp.url, timeout: true, approval, folder: `p5-${chosen.via}-${approval}`, childIndex: ++child, signal, prompt });
        policyRuns.push({
          approval,
          asked: again.turn?.serverRequests?.some((req) => isApproval(req.method)) ?? null,
          error: again.error ?? null,
          decision: asked.map((req) => req.answer),
        });
        await closeRun(ctx, again);
      }
    }
    const slow = chosen?.session && chosen.threadId
      ? await p5Slow(ctx, chosen, mcp, true, "p5-slow", ++child, signal, "same-thread")
      : await p5Slow(ctx, { ...chosen, session: null, threadId: null }, mcp, true, "p5-slow", ++child, signal, "new-server");
    const slowDefault = await p5Slow(ctx, { ...chosen, session: null, threadId: null }, mcp, false, "p5-slow-default", ++child, signal, "new-server");
    const proved = Boolean(winner);
    const evidence = proved
      ? `Way ${winner.via === "config" ? "i" : "ii"} got a tools/call for probe_echo and the final answer contained ECHO:hello-p5`
      : p5Miss(runs);
    return verdict("P5", name, proved ? "PROVED" : "DISPROVED", evidence, started, {
      way: winner ? (winner.via === "config" ? "i" : "ii") : null,
      p3Way: way,
      item: mcpReported(chosen?.turn?.items ?? []),
      serverRequests: chosen?.turn?.serverRequests ?? [],
      headers: mcp.records.map(headerView),
      approvalRepeats: policyRuns,
      runs: runs.map(runView),
      slow: slow.view,
      slowDefault: slowDefault.view,
    });
  } finally {
    for (const run of runs) if (run.session) await run.session.close();
    await mcp.close();
  }
}

function p5Miss(runs) {
  const bits = runs.filter((run) => run.approval === "never").map((run) => {
    const label = run.via === "config" ? "i" : "ii";
    if (run.error) return `way ${label} stopped before a tool call (${clip(run.error, 120)})`;
    if (run.hit) return `way ${label} got the tool call but the answer did not contain ECHO:hello-p5`;
    return `way ${label} got no probe_echo tool call`;
  });
  return bits.join("; ") || "No way was tried";
}

function toolsSince(mcp, mark) {
  const names = [];
  for (const row of mcp.records.slice(mark)) for (const tool of row.tools ?? []) if (tool) names.push(tool);
  return names;
}

async function closeRun(ctx, run) {
  if (!run) return;
  if (run.session) await run.session.close();
  run.session = null;
  if (!ctx.keep && run.cwd) removeDir(run.cwd);
  run.cwd = null;
}

function headerView(row) {
  return {
    httpMethod: row.httpMethod,
    path: row.path,
    headerNames: row.headerNames,
    accept: row.accept,
    contentType: row.contentType,
    mcpSessionId: row.mcpSessionId,
    rpcMethods: row.rpcMethods ?? null,
    tools: row.tools ?? null,
    status: row.status ?? null,
  };
}

function runView(run) {
  return {
    via: run.via,
    approval: run.approval,
    argv: run.argv,
    error: run.error ?? null,
    text: clip(run.turn?.text ?? "", 400),
    itemTypes: run.turn?.itemTypes ?? [],
    mcp: mcpReported(run.turn?.items ?? []),
    serverRequests: run.turn?.serverRequests ?? [],
  };
}

async function p5Turn1(ctx, opts) {
  const built = isolation(opts.way, ctx.baselineNames ?? [], { shellOff: true, via: opts.via, url: opts.url, timeout: opts.timeout });
  const cwd = emptyDir(ctx.runDir, opts.folder);
  const session = openCodex({ bin: ctx.bin, args: built.args, logFile: ctx.log("P5"), cwd, childIndex: opts.childIndex, signal: opts.signal });
  // P5 accepts an MCP approval when Codex asks. P4 declines, and that is a different check.
  session.decider = (msg) => decideServerRequest(msg, "accept");
  try {
    await handshake(session, ctx, opts.signal);
    const thread = await session.request("thread/start", threadParams(cwd, { config: built.config, approvalPolicy: opts.approval }), 60_000, opts.signal);
    if (!thread?.thread?.id) throw new Error("thread/start returned no thread id");
    const turn = await runTurn(session, {
      threadId: thread.thread.id,
      approvalPolicy: opts.approval,
      input: userInput(opts.prompt),
    }, opts.prompt.includes("probe_slow") ? SLOW_WAIT_MS : 150_000, opts.signal);
    return { via: opts.via, approval: opts.approval, argv: built.args, config: built.config, notes: built.notes, turn, session, threadId: thread.thread.id, cwd, timeout: opts.timeout, way: opts.way };
  } catch (e) {
    await session.close();
    if (!ctx.keep) removeDir(cwd);
    if (e instanceof HarnessError || opts.signal?.aborted) throw e;
    return { via: opts.via, approval: opts.approval, argv: built.args, error: e.message, turn: null };
  }
}

async function p5Slow(ctx, chosen, mcp, withTimeout, folder, childIndex, signal, mode) {
  const prompt = "Call the tool probe_slow with text slow-p5 and reply with exactly what it returned.";
  if (!chosen || chosen.error || !chosen.via) {
    return { view: { skipped: true, reason: chosen?.error ?? "no turn 1" } };
  }
  const mark = mcp.records.length;
  try {
    if (mode === "same-thread" && chosen.session && chosen.threadId) {
      const turn = await runTurn(chosen.session, { threadId: chosen.threadId, input: userInput(prompt) }, SLOW_WAIT_MS, signal);
      await closeRun(ctx, chosen);
      return { view: { sameThread: true, toolSeen: toolsSince(mcp, mark).includes("probe_slow"), text: clip(turn.text, 300), contains: turn.text.includes("ECHO:slow-p5"), status: turn.status, ms: turn.completedMs } };
    }
    const run = await p5Turn1(ctx, {
      way: chosen.way ?? ctx.p3Way ?? "e",
      via: chosen.via,
      url: mcp.url,
      timeout: withTimeout,
      approval: "never",
      folder,
      childIndex,
      signal,
      prompt,
    });
    await closeRun(ctx, run);
    return { view: { sameThread: false, toolSeen: toolsSince(mcp, mark).includes("probe_slow"), text: clip(run.turn?.text ?? "", 300), contains: Boolean(run.turn?.text?.includes("ECHO:slow-p5")), status: run.turn?.status ?? null, error: run.error ?? null, ms: run.turn?.completedMs ?? null } };
  } catch (e) {
    if (e instanceof HarnessError || signal?.aborted) throw e;
    await closeRun(ctx, chosen);
    return { view: { error: e.message } };
  }
}

async function checkP6(ctx, signal) {
  const started = Date.now();
  const name = "Instructions and model";
  const cwd = emptyDir(ctx.runDir, "p6");
  const session = openCodex({ bin: ctx.bin, args: [], logFile: ctx.log("P6"), cwd, childIndex: 1, signal });
  try {
    await handshake(session, ctx, signal);
    const models = await listModels(session, signal);
    const second = models[1]?.id ?? null;
    const short = await instructTurn(session, cwd, { developerInstructions: "End every reply with the token ZEBRA-7." }, "Say hello.", signal);
    const longText = longInstructions();
    const long = await instructTurn(session, cwd, { developerInstructions: longText }, "Say hello.", signal);
    let modelTurn = null;
    if (second) {
      const thread = await session.request("thread/start", threadParams(cwd), 60_000, signal);
      modelTurn = await runTurn(session, { threadId: thread.thread.id, input: userInput("Say hello."), model: second, effort: "low" }, 120_000, signal);
      const read = await callOrError(session, "thread/read", { threadId: thread.thread.id }, signal);
      modelTurn.reportedModel = read?.thread?.model ?? null;
      modelTurn.requestedModel = second;
    }
    const base = await instructTurn(session, cwd, { baseInstructions: "You are a test assistant. End every reply with the token YAK-9." }, "Say hello.", signal);
    const one = endsWithToken(short.text, "ZEBRA-7");
    const two = long.status === "completed" && endsWithToken(long.text, "ZEBRA-7");
    const three = Boolean(second) && modelTurn?.status === "completed";
    const proved = one && two && three;
    const evidence = `Short instructions ${one ? "ended with ZEBRA-7" : "did not end with ZEBRA-7"}, the 60000-character instructions ${two ? "ended with ZEBRA-7" : "did not end with ZEBRA-7"}, and the second-model turn ${three ? "completed" : "did not complete"}`;
    return verdict("P6", name, proved ? "PROVED" : "DISPROVED", evidence, started, {
      short: { ended: one, text: clip(short.text, 300), status: short.status },
      long: { chars: longText.length, ended: two, status: long.status, error: long.error ?? null, tail: clip(long.text.slice(-80), 80) },
      model: second ? { requested: second, reported: modelTurn?.reportedModel ?? null, completed: modelTurn?.status === "completed", status: modelTurn?.status ?? null, ids: models.slice(0, 4).map((m) => m.id) } : { requested: null, modelCount: models.length },
      base: { text: clip(base.text, 300), endedWithYak: endsWithToken(base.text, "YAK-9"), status: base.status },
    });
  } finally {
    await session.close();
    if (!ctx.keep) removeDir(cwd);
  }
}

async function instructTurn(session, cwd, instructions, prompt, signal) {
  const thread = await session.request("thread/start", threadParams(cwd, instructions), 60_000, signal);
  return runTurn(session, { threadId: thread.thread.id, input: userInput(prompt) }, 120_000, signal);
}

async function listModels(session, signal) {
  const models = [];
  let cursor = null;
  do {
    const page = await session.request("model/list", { cursor, limit: 50 }, 30_000, signal);
    models.push(...(page?.data ?? []));
    cursor = page?.nextCursor ?? null;
  } while (cursor && models.length < 2);
  return models;
}

async function checkP7(ctx, signal) {
  const started = Date.now();
  const name = "Token use";
  let usage = ctx.p2Usage ?? null;
  let source = usage ? "P2" : null;
  if (usage) writeJsonl(ctx.log("P7"), { ms: 0, dir: "from-p2", msg: { method: "thread/tokenUsage/updated", params: { tokenUsage: usage } } });
  if (!usage) {
    const cwd = emptyDir(ctx.runDir, "p7");
    const session = openCodex({ bin: ctx.bin, args: [], logFile: ctx.log("P7"), cwd, childIndex: 1, signal });
    try {
      await handshake(session, ctx, signal);
      const thread = await session.request("thread/start", threadParams(cwd), 60_000, signal);
      const turn = await runTurn(session, { threadId: thread.thread.id, input: userInput("Reply with the single word OK.") }, 120_000, signal);
      usage = turn.usage;
      source = "own turn";
    } finally {
      await session.close();
      if (!ctx.keep) removeDir(cwd);
    }
  }
  const window = usage?.modelContextWindow;
  const input = usage?.last?.inputTokens;
  const proved = typeof window === "number" && window > 0 && typeof input === "number";
  const evidence = proved
    ? `thread/tokenUsage/updated from ${source} had modelContextWindow ${window} and last.inputTokens ${input}`
    : `No token-use object with a positive modelContextWindow and a numeric last.inputTokens was seen (${source ?? "none"})`;
  return verdict("P7", name, proved ? "PROVED" : "DISPROVED", evidence, started, { source, tokenUsage: usage ?? null });
}

const RUNNERS = {
  P1: checkP1,
  P2: checkP2,
  P3: checkP3,
  P4: checkP4,
  P5: checkP5,
  P6: checkP6,
  P7: checkP7,
};

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(redactText(e.message));
    console.error("Usage: node scripts/codex-probe.mjs --out <folder> [--codex <path>] [--only P1,P5] [--keep]");
    process.exit(2);
  }
  const stamp = new Date().toISOString().replace(/:/g, "");
  const runDir = path.join(path.resolve(args.out), stamp);
  fs.mkdirSync(runDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const ctx = {
    bin: args.codex,
    keep: args.keep,
    runDir,
    codexVersion: "",
    platform: "",
    handshakeOk: false,
    p2Usage: null,
    p3Way: null,
    baselineNames: [],
    log(id) {
      return path.join(runDir, `${id}.jsonl`);
    },
  };
  const version = await codexVersion(args.codex);
  ctx.codexVersion = version.text;
  if (!version.ok) {
    say("codex --version did not run.");
    writeResult(ctx, startedAt, []);
    process.exit(1);
  }
  const selected = CHECKS.filter(([id]) => !args.only || args.only.includes(id));
  const results = [];
  for (const [id, name] of selected) {
    const limit = id === "P5" ? P5_MS : CHECK_MS;
    const ac = new AbortController();
    const begun = Date.now();
    const timer = setTimeout(() => ac.abort(), limit);
    try {
      const result = await RUNNERS[id](ctx, ac.signal);
      results.push(result);
      say(`${result.id} ${result.name}: ${result.verdict} — ${result.evidence}`);
    } catch (e) {
      const failed = e instanceof HarnessError;
      results.push(verdict(id, name, "UNKNOWN", e.message, begun, { error: e.message }));
      say(`${id} ${name}: UNKNOWN — ${sentence(e.message)}`);
      if (failed) {
        clearTimeout(timer);
        finish(ctx, startedAt, results);
        process.exit(1);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  finish(ctx, startedAt, results);
  process.exit(0);
}

function finish(ctx, startedAt, results) {
  say("");
  for (const result of results) say(`${result.id} ${result.name}: ${result.verdict} — ${result.evidence}`);
  writeResult(ctx, startedAt, results);
}

function writeResult(ctx, startedAt, checks) {
  const body = {
    codexVersion: ctx.codexVersion,
    platform: ctx.platform || process.platform,
    startedAt,
    checks,
  };
  fs.writeFileSync(path.join(ctx.runDir, "result.json"), `${JSON.stringify(redactValue(body), null, 2)}\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(redactText(e?.message || String(e)));
    process.exit(1);
  });
}
