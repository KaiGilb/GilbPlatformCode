#!/usr/bin/env node
/**
 * Codex app-server probe for Chat.CodexConnect, Part 0a.
 *
 * Starts `codex app-server` over stdio, runs the checks named in the brief and
 * the round-2 correction, and writes a verdict for each one. It never reads
 * the Codex home folder. The only files it writes are under `--out`.
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
  ["P3S", "The person's skills and plugins"],
  ["P4", "A chat turn has no local tools"],
  ["P5", "The bridge's own MCP server reaches Codex"],
  ["P6", "Instructions and model"],
  ["P7", "Token use"],
  ["P8", "What the bridge can verify before a chat turn"],
];
// ThreadStartParams from the generated protocol read on 2026-11-24. None of
// these names is a skills or plugins switch. `config` is only the table the
// other switches write into.
const THREAD_START_PARAMS = [
  "model", "modelProvider", "serviceTier", "cwd", "approvalPolicy", "approvalsReviewer",
  "sandbox", "config", "serviceName", "baseInstructions", "developerInstructions",
  "personality", "ephemeral", "sessionStartSource", "threadSource",
];
const SWITCH_WAYS = new Set(["d", "e", "g", "h"]);
const SKILL_PLUGIN = /skill|plugin|marketplace/i;
const SUPPRESS_NAME = /skip|omit|disable|suppress|without/i;

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
 * Key paths of a JSON value, with no leaf value copied.
 * A config value can be a command, a token or a url, so the transcript stores the path only.
 * @param {unknown} value
 * @param {string} [prefix]
 * @param {number} [depth]
 * @returns {string[]}
 */
function configKeyPaths(value, prefix = "", depth = 0) {
  if (depth > 40) return prefix ? [prefix] : [];
  if (value === null || typeof value !== "object") return prefix ? [prefix] : [];
  if (Array.isArray(value)) {
    if (value.length === 0) return prefix ? [prefix] : [];
    const paths = [];
    value.forEach((item, index) => {
      paths.push(...configKeyPaths(item, `${prefix}[${index}]`, depth + 1));
    });
    return paths;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return prefix ? [prefix] : [];
  const paths = [];
  for (const key of keys) {
    const next = prefix ? `${prefix}.${key}` : key;
    paths.push(...configKeyPaths(value[key], next, depth + 1));
  }
  return paths;
}

function loggedIncoming(msg, method) {
  // The config/read answer is the one place a secret would otherwise land in the transcript.
  if (method !== "config/read" || !msg || typeof msg !== "object") return msg;
  if (Object.prototype.hasOwnProperty.call(msg, "result")) {
    return { id: msg.id, result: { keyPaths: configKeyPaths(msg.result) } };
  }
  if (msg.error) return { id: msg.id, error: { code: msg.error.code ?? null, message: msg.error.message ?? "error" } };
  return msg;
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
  const methodsById = new Map();
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
    const isReply = msg && msg.id !== undefined && msg.id !== null && (Object.prototype.hasOwnProperty.call(msg, "result") || Object.prototype.hasOwnProperty.call(msg, "error")) && msg.method === undefined;
    const method = isReply ? methodsById.get(msg.id) : undefined;
    if (isReply) methodsById.delete(msg.id);
    writeJsonl(opts.logFile, { ms, dir: "s2c", child: opts.childIndex, msg: loggedIncoming(msg, method) });
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
    methodsById.set(id, method);
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

function featureArgs(way) {
  // e drops the built-in apps server. g and h add the other stable feature flags
  // from the brief. codex_apps is not disabled with an mcp_servers override:
  // round 1 showed that override has no transport and the app-server exits.
  const names = [];
  if (way === "e" || way === "g" || way === "h") names.push("apps");
  if (way === "g" || way === "h") names.push("plugins");
  if (way === "h") names.push("hooks", "memories", "goals", "multi_agent", "browser_use", "computer_use");
  const args = [];
  for (const name of names) args.push("--disable", name);
  return args;
}

function asList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function mergeConfig(base, extra) {
  const out = { ...(base ?? {}) };
  if (!extra || typeof extra !== "object") return out;
  for (const [key, value] of Object.entries(extra)) {
    const current = out[key];
    if (value && typeof value === "object" && !Array.isArray(value) && current && typeof current === "object" && !Array.isArray(current)) {
      out[key] = mergeConfig(current, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Builds the CLI args and thread config for one P3 way.
 * Ways d, e, g and h switch off only names from the person's mcp_servers table.
 * codex_apps is never one of those names.
 * When a probe url is added on the config route, it shares that one mcp_servers object
 * with the switch-offs. An empty table on the CLI route would drop the url, so way b
 * omits it there.
 * @param {string} way
 * @param {string[]} configuredNames
 * @param {{ shellOff?: boolean, via?: "config"|"cli"|null, url?: string, timeout?: boolean, featureOff?: string|string[], featureOn?: string|string[], configOverlay?: object }} [extra]
 */
function isolation(way, configuredNames, extra = {}) {
  const args = [...featureArgs(way)];
  const notes = [];
  const switches = {};
  for (const name of configuredNames ?? []) {
    if (!name || name === "codex_apps") continue;
    if (extra.url && name === "gilb") {
      notes.push("configured name gilb was not disabled");
      continue;
    }
    switches[name] = { enabled: false };
  }
  let config = null;
  if (SWITCH_WAYS.has(way)) config = { mcp_servers: { ...switches } };
  const cliUrl = Boolean(extra.url && extra.via === "cli");
  if (way === "b" && !cliUrl) config = { mcp_servers: {} };
  if (way === "c" && !cliUrl) args.push("-c", "mcp_servers={}");
  if (way === "b" && cliUrl) notes.push("empty thread table omitted so it does not drop the CLI url");
  if (way === "c" && cliUrl) notes.push("empty CLI table replaced by the gilb url");
  if (extra.shellOff) args.push("--disable", "shell_tool");
  for (const name of asList(extra.featureOff)) args.push("--disable", name);
  for (const name of asList(extra.featureOn)) args.push("--enable", name);
  if (extra.url && extra.via === "config") {
    const mcp = { ...(config?.mcp_servers ?? {}) };
    const gilb = { url: extra.url };
    if (extra.timeout) gilb.tool_timeout_sec = 2000;
    mcp.gilb = gilb;
    config = { ...(config ?? {}), mcp_servers: mcp };
    if (way === "b") notes.push("thread config lists only gilb");
  } else if (cliUrl) {
    args.push("-c", `mcp_servers.gilb.url=${tomlString(extra.url)}`);
    if (extra.timeout) args.push("-c", "mcp_servers.gilb.tool_timeout_sec=2000");
  }
  if (extra.configOverlay) config = mergeConfig(config, extra.configOverlay);
  return { args, config, quoted: [], notes };
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

function pluginFacts(result) {
  if (!result || result.error) return { count: null, installed: null, bytes: null, shape: null, error: result?.error ?? "no result" };
  let bytes = null;
  try {
    bytes = Buffer.byteLength(JSON.stringify(result));
  } catch {
    bytes = null;
  }
  if (!Array.isArray(result.marketplaces)) {
    return { count: null, installed: null, bytes, shape: Object.keys(result).slice(0, 12), error: "no marketplaces" };
  }
  let count = 0;
  let installed = 0;
  let sawInstalled = false;
  for (const row of result.marketplaces) {
    const plugins = Array.isArray(row?.plugins) ? row.plugins : [];
    count += plugins.length;
    for (const plugin of plugins) {
      if (plugin && typeof plugin.installed === "boolean") {
        sawInstalled = true;
        if (plugin.installed) installed += 1;
      }
    }
  }
  return {
    count,
    installed: sawInstalled ? installed : count,
    bytes,
    shape: "marketplaces",
    sawInstalled,
    error: null,
  };
}

function namesFromConfig(result) {
  const config = result?.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  if (!Object.prototype.hasOwnProperty.call(config, "mcp_servers")) return null;
  const table = config.mcp_servers;
  if (!table || typeof table !== "object" || Array.isArray(table)) return null;
  return Object.keys(table).filter((name) => name && name !== "codex_apps");
}

async function readPersonConfig(session, cwd, signal) {
  const result = await callOrError(session, "config/read", { cwd, includeLayers: false }, signal);
  if (result.error) return { error: result.error, keyPaths: null, names: null };
  return { error: null, keyPaths: configKeyPaths(result).sort(), names: namesFromConfig(result) };
}

function applyPersonConfig(ctx, read) {
  if (read.keyPaths) ctx.configKeyPaths = read.keyPaths;
  if (read.error) ctx.configReadError = read.error;
  if (read.names) {
    ctx.configuredNames = read.names;
    ctx.configNameSource = "config/read";
    ctx.configNamesReady = true;
  }
}

function fallbackPersonNames(ctx, listed) {
  if (ctx.configNamesReady) return;
  const names = [];
  for (const row of listed ?? []) {
    if (row?.name && row.name !== "codex_apps" && !names.includes(row.name)) names.push(row.name);
  }
  ctx.configuredNames = names;
  ctx.configNameSource = "baseline-minus-codex_apps";
  ctx.configNamesReady = true;
}

function summarizeListed(entry, opts = {}) {
  const tools = entry?.tools && typeof entry.tools === "object" && !Array.isArray(entry.tools) ? entry.tools : null;
  const toolNames = tools ? Object.keys(tools).sort() : [];
  const out = {};
  for (const [key, value] of Object.entries(entry ?? {})) {
    if (key === "tools") {
      out.toolCount = toolNames.length;
      out.toolNames = toolNames;
      if (opts.keepTools) out.tools = tools;
      continue;
    }
    out[key] = value;
  }
  if (!Object.prototype.hasOwnProperty.call(out, "toolCount")) {
    out.toolCount = null;
    out.toolNames = [];
  }
  return out;
}

function trackStartup(session, onEvent) {
  const lastByName = new Map();
  let events = 0;
  let lastAt = Date.now();
  const off = session.onNotification((msg) => {
    if (msg.method !== "mcpServer/startupStatus/updated") return;
    events += 1;
    lastAt = Date.now();
    const name = msg.params?.name ?? null;
    const status = msg.params?.status ?? null;
    lastByName.set(name ?? "", { name, status });
    onEvent?.({ name, status, at: lastAt });
  });
  return {
    off,
    async wait(signal) {
      const waitStarted = Date.now();
      lastAt = waitStarted;
      let capped = false;
      while (Date.now() - lastAt < QUIET_MS) {
        if (Date.now() - waitStarted > QUIET_CAP_MS) {
          capped = true;
          break;
        }
        await sleep(200, signal);
      }
      return { notified: [...lastByName.values()], events, capped };
    },
  };
}

async function listMcpServers(session, threadId, signal) {
  const rows = [];
  let cursor = null;
  do {
    const params = { threadId, limit: 50, detail: "toolsAndAuthOnly" };
    if (cursor) params.cursor = cursor;
    const page = await callOrError(session, "mcpServerStatus/list", params, signal);
    if (page.error) return { error: page.error, rows };
    rows.push(...(page.data ?? []));
    cursor = page.nextCursor ?? null;
  } while (cursor);
  return { error: null, rows };
}

function threadSurface(result) {
  const thread = result?.thread && typeof result.thread === "object" ? result.thread : {};
  const wanted = /sandbox|permission|approval|^cwd$|^model$/i;
  const fields = {};
  const collect = (obj, prefix) => {
    if (!obj || typeof obj !== "object") return;
    for (const [key, value] of Object.entries(obj)) {
      if (!wanted.test(key)) continue;
      fields[prefix ? `${prefix}.${key}` : key] = value;
    }
  };
  collect(result, "result");
  collect(thread, "thread");
  return {
    cwd: thread.cwd ?? null,
    model: thread.model ?? null,
    sandbox: thread.sandbox ?? null,
    approvalPolicy: thread.approvalPolicy ?? null,
    fields,
    threadFieldNames: Object.keys(thread),
  };
}

function sameNames(left, right) {
  const a = [...(left ?? [])].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((name, index) => name === b[index]);
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
  const specs = [
    ["a", "baseline"],
    ["b", "thread config mcp_servers empty"],
    ["c", "CLI mcp_servers empty"],
    ["d", "thread config enabled false for each configured server"],
    ["e", "as d, plus --disable apps"],
    ["g", "as e, plus --disable plugins"],
    ["h", "as g, plus the other stable features"],
    ["f", "CODEX_HOME empty"],
  ];
  let child = 0;
  for (const [id, label] of specs) {
    if (signal.aborted) throw new Error("aborted");
    // Names come from way a's config/read, which has finished before d runs.
    const built = id === "f" ? { args: [], config: null, quoted: [] } : isolation(id, ctx.configuredNames ?? []);
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
    const row = {
      id, label, argv: built.args, threadConfig: built.config, quoted: built.quoted,
      accountType: null, planType: null, servers: [], listed: [], notified: [], startupEvents: 0,
      skills: null, hooks: null, plugins: null, pluginEntries: null, pluginAnswerBytes: null,
      errors: {}, quietCapped: false,
    };
    try {
      await handshake(session, ctx, signal);
      const account = await accountRead(session, signal);
      row.accountType = account.type;
      row.planType = account.planType;
      // Way f points at an empty home. Its config is not the person's.
      if (id !== "f" && !ctx.configNamesReady) {
        const read = await readPersonConfig(session, cwd, signal);
        applyPersonConfig(ctx, read);
        if (read.error) row.errors.config = read.error;
      }
      const startup = trackStartup(session);
      const thread = await session.request("thread/start", threadParams(cwd, { config: built.config }), 60_000, signal);
      const threadId = thread?.thread?.id;
      const quiet = await startup.wait(signal);
      startup.off();
      row.notified = quiet.notified;
      row.startupEvents = quiet.events;
      row.quietCapped = quiet.capped;
      const listed = await listMcpServers(session, threadId, signal);
      if (listed.error) row.errors.mcp = listed.error;
      row.listed = listed.rows.map((entry) => summarizeListed(entry));
      const skills = await callOrError(session, "skills/list", { cwds: [cwd], forceReload: true }, signal);
      const hooks = await callOrError(session, "hooks/list", { threadId }, signal);
      const plugins = await callOrError(session, "plugin/installed", { cwds: [cwd] }, signal);
      const skillCount = countNested(skills, "skills");
      const hookCount = countNested(hooks, "hooks");
      const pluginCount = pluginFacts(plugins);
      row.skills = skillCount.count;
      row.hooks = hookCount.count;
      row.plugins = pluginCount.installed;
      row.pluginEntries = pluginCount.count;
      row.pluginAnswerBytes = pluginCount.bytes;
      if (skillCount.error) row.errors.skills = skillCount.error;
      if (hookCount.error) row.errors.hooks = hookCount.error;
      if (pluginCount.error) row.errors.plugins = pluginCount.error;
      const names = new Set();
      for (const item of row.notified) if (item.name) names.add(item.name);
      for (const item of row.listed) if (item.name) names.add(item.name);
      row.servers = [...names];
    } catch (e) {
      if (e instanceof HarnessError || signal.aborted) throw e;
      row.errors.run = e.message;
    } finally {
      // A failed list must not freeze an empty name list. A later way can still read config.
      if (id === "a" && !row.errors.run && !row.errors.mcp) fallbackPersonNames(ctx, row.listed);
      await session.close();
      if (!ctx.keep) {
        removeDir(cwd);
        if (home) removeDir(home);
      }
    }
    ways.push(row);
  }
  ctx.baselineNames = ctx.configuredNames ?? [];
  const order = ["d", "e", "g", "h"];
  const readable = (row) => Boolean(row) && !row.errors.run && !row.errors.mcp && row.accountType && row.listed.every((server) => typeof server.toolCount === "number");
  const toolsOf = (row) => row.listed.filter((server) => server.toolCount > 0);
  const pool = order.map((id) => ways.find((row) => row.id === id)).filter(readable);
  const winner = pool.find((row) => row.accountType === "chatgpt" && toolsOf(row).length === 0 && row.notified.length === 0) ?? null;
  ctx.p3Way = winner?.id ?? null;
  const chatgpt = pool.filter((row) => row.accountType === "chatgpt");
  let best = null;
  for (const row of chatgpt) {
    const score = toolsOf(row).length * 1000 + row.notified.length;
    if (!best || score < best.score) best = { row, score };
  }
  const f = ways.find((row) => row.id === "f");
  let status = "DISPROVED";
  let evidence;
  if (winner) {
    status = "PROVED";
    evidence = `Way ${winner.id} (${winner.label}) had account type chatgpt, every listed server had 0 tools, and no server sent a startup notification`;
  } else if (pool.length === 0) {
    status = "UNKNOWN";
    evidence = "Ways d, e, g and h did not return a readable server list";
  } else if (!best) {
    evidence = "Ways d, e, g and h did not return account type chatgpt";
  } else if (toolsOf(best.row).length > 0) {
    const which = toolsOf(best.row).map((server) => `${server.name} (${server.toolCount})`).join(" and ");
    evidence = `Way ${best.row.id} still has tools on ${which}`;
  } else if (best.row.notified.length > 0) {
    const which = best.row.notified.map((item) => item.name ?? "unnamed").join(", ");
    evidence = `Way ${best.row.id} listed no tools but startup notifications still arrived for ${which}`;
  } else {
    evidence = `Way ${best.row.id} did not meet the proved rule`;
  }
  return verdict("P3", name, status, evidence, started, {
    ways,
    provedWay: winner?.id ?? null,
    bestWay: best?.row.id ?? null,
    configuredNames: ctx.configuredNames ?? [],
    configNameSource: ctx.configNameSource,
    configReadError: ctx.configReadError,
    configKeyPaths: ctx.configKeyPaths ?? [],
    codexHomeStillChatgpt: f ? f.accountType === "chatgpt" : null,
  });
}

async function requirePersonServers(ctx, logId, signal) {
  if (ctx.configNamesReady) return;
  const cwd = emptyDir(ctx.runDir, `${logId}-config`);
  const session = openCodex({ bin: ctx.bin, args: [], logFile: ctx.log(logId), cwd, childIndex: 0, signal });
  try {
    await handshake(session, ctx, signal);
    const read = await readPersonConfig(session, cwd, signal);
    applyPersonConfig(ctx, read);
    if (!ctx.configNamesReady) {
      const startup = trackStartup(session);
      const thread = await session.request("thread/start", threadParams(cwd), 60_000, signal);
      await startup.wait(signal);
      startup.off();
      const listed = await listMcpServers(session, thread?.thread?.id, signal);
      fallbackPersonNames(ctx, listed.rows);
    }
  } finally {
    await session.close();
    if (!ctx.keep) removeDir(cwd);
  }
}

async function checkP4(ctx, signal) {
  const started = Date.now();
  const name = "A chat turn has no local tools";
  await requirePersonServers(ctx, "P4", signal);
  const way = ctx.p3Way ?? "h";
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
  const built = isolation(way, ctx.configuredNames ?? [], { shellOff });
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
  await requirePersonServers(ctx, "P5", signal);
  const way = ctx.p3Way ?? "h";
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
    const gilbRun = winner ?? chosen;
    return verdict("P5", name, proved ? "PROVED" : "DISPROVED", evidence, started, {
      way: winner ? (winner.via === "config" ? "i" : "ii") : null,
      p3Way: way,
      gilbUrl: mcp.url,
      gilb: { fieldNames: gilbRun?.gilbFieldNames ?? [], entry: gilbRun?.gilb ?? null, listError: gilbRun?.listError ?? null },
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
    const why = clip(run.turn?.text ?? "", 140);
    return why ? `way ${label} got no probe_echo tool call (${why})` : `way ${label} got no probe_echo tool call`;
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
    threadConfig: run.config ?? null,
    error: run.error ?? null,
    text: clip(run.turn?.text ?? "", 400),
    itemTypes: run.turn?.itemTypes ?? [],
    mcp: mcpReported(run.turn?.items ?? []),
    serverRequests: run.turn?.serverRequests ?? [],
    gilbFieldNames: run.gilbFieldNames ?? [],
    gilb: run.gilb ?? null,
    listError: run.listError ?? null,
  };
}

async function p5Turn1(ctx, opts) {
  const built = isolation(opts.way, ctx.configuredNames ?? [], { shellOff: true, via: opts.via, url: opts.url, timeout: opts.timeout });
  const cwd = emptyDir(ctx.runDir, opts.folder);
  const session = openCodex({ bin: ctx.bin, args: built.args, logFile: ctx.log("P5"), cwd, childIndex: opts.childIndex, signal: opts.signal });
  // P5 accepts an MCP approval when Codex asks. P4 declines, and that is a different check.
  session.decider = (msg) => decideServerRequest(msg, "accept");
  try {
    await handshake(session, ctx, opts.signal);
    const startup = trackStartup(session);
    const thread = await session.request("thread/start", threadParams(cwd, { config: built.config, approvalPolicy: opts.approval }), 60_000, opts.signal);
    if (!thread?.thread?.id) throw new Error("thread/start returned no thread id");
    await startup.wait(opts.signal);
    startup.off();
    const listed = await listMcpServers(session, thread.thread.id, opts.signal);
    const gilbRaw = (listed.rows ?? []).find((row) => row?.name === "gilb") ?? null;
    const turn = await runTurn(session, {
      threadId: thread.thread.id,
      approvalPolicy: opts.approval,
      input: userInput(opts.prompt),
    }, opts.prompt.includes("probe_slow") ? SLOW_WAIT_MS : 150_000, opts.signal);
    return {
      via: opts.via,
      approval: opts.approval,
      argv: built.args,
      config: built.config,
      notes: built.notes,
      turn,
      session,
      threadId: thread.thread.id,
      cwd,
      timeout: opts.timeout,
      way: opts.way,
      gilb: gilbRaw ? summarizeListed(gilbRaw, { keepTools: true }) : null,
      gilbFieldNames: gilbRaw ? Object.keys(gilbRaw) : [],
      listError: listed.error,
    };
  } catch (e) {
    await session.close();
    if (!ctx.keep) removeDir(cwd);
    if (e instanceof HarnessError || opts.signal?.aborted) throw e;
    return { via: opts.via, approval: opts.approval, argv: built.args, config: built.config, error: e.message, turn: null };
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
      way: chosen.way ?? ctx.p3Way ?? "h",
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

function parseFeatureLines(text) {
  const rows = [];
  for (const line of String(text).split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(\S+)\s+(.+?)\s+(true|false)\s*$/i);
    if (!match) continue;
    rows.push({ name: match[1], stage: match[2].trim(), state: /^true$/i.test(match[3]) ? "true" : "false" });
  }
  return rows;
}

function featureList(bin) {
  const spec = launchOf(bin, ["features", "list"]);
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    let child;
    try {
      child = spawn(spec.cmd, spec.args, { stdio: ["ignore", "pipe", "pipe"], detached: true });
    } catch (e) {
      resolve({ ok: false, features: [], error: e.message });
      return;
    }
    child.stdout?.on("data", (buf) => {
      if (out.length < 200_000) out += buf.toString("utf8");
    });
    child.stderr?.on("data", (buf) => {
      if (err.length < 2000) err += buf.toString("utf8");
    });
    const timer = setTimeout(() => signalGroup(child, "SIGKILL"), 30_000);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, features: [], error: e.message });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      const features = parseFeatureLines(out);
      resolve({ ok: code === 0 && features.length > 0, features, code, error: code === 0 ? null : redactText(err.trim()).slice(0, 200) });
    });
  });
}

async function listExperimental(session, threadId, signal) {
  const rows = [];
  let cursor = null;
  do {
    const params = { limit: 100 };
    if (cursor) params.cursor = cursor;
    if (threadId) params.threadId = threadId;
    const page = await callOrError(session, "experimentalFeature/list", params, signal);
    if (page.error) return { error: page.error, rows };
    for (const item of page.data ?? []) {
      if (!item?.name) continue;
      rows.push({ name: item.name, enabled: typeof item.enabled === "boolean" ? item.enabled : null, stage: item.stage ?? null });
    }
    cursor = page.nextCursor ?? null;
  } while (cursor);
  return { error: null, rows };
}

function overlayFromPath(path, value) {
  const parts = String(path).split(".").filter(Boolean);
  if (parts.length === 0) return null;
  let node = value;
  for (let i = parts.length - 1; i >= 0; i -= 1) node = { [parts[i]]: node };
  return node;
}

function skillPluginCandidates(features, experimental, keyPaths) {
  const candidates = [];
  const seen = new Set();
  const pushFeature = (name, action, alreadyInH) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    candidates.push({ id: `${action} ${name}`, kind: "feature", action, name, alreadyInH });
  };
  for (const feature of features) {
    if (!SKILL_PLUGIN.test(feature.name) || feature.stage === "removed") continue;
    if (feature.name === "plugins") pushFeature(feature.name, "disable", true);
    else if (feature.state === "true") pushFeature(feature.name, "disable", false);
    else if (SUPPRESS_NAME.test(feature.name)) pushFeature(feature.name, "enable", false);
  }
  for (const feature of experimental) {
    if (!SKILL_PLUGIN.test(feature.name) || feature.stage === "removed" || seen.has(feature.name)) continue;
    if (feature.enabled === true) pushFeature(feature.name, "disable", false);
    else if (feature.enabled === false && SUPPRESS_NAME.test(feature.name)) pushFeature(feature.name, "enable", false);
  }
  const roots = new Map();
  for (const path of keyPaths ?? []) {
    // origins and layers describe where a value came from. They are not switches.
    const parts = path.split(".");
    if (parts[0] !== "config") continue;
    const body = parts.slice(1);
    if (body[0] === "features" || body.length === 0) continue;
    const index = body.findIndex((segment) => SKILL_PLUGIN.test(segment));
    if (index < 0) continue;
    const root = body.slice(0, index + 1).join(".");
    const prev = roots.get(root);
    roots.set(root, { segment: body[index], hasChildren: Boolean(prev?.hasChildren) || body.length > index + 1 });
  }
  for (const [root, info] of roots) {
    // On 2026-11-24 a boolean false was rejected: skills and plugins are structs
    // and marketplaces is a map. A table is the shape the server will load.
    const value = info.segment === "marketplaces" && !info.hasChildren ? {} : { enabled: false };
    const overlay = overlayFromPath(root, value);
    if (!overlay) continue;
    const shown = info.segment === "marketplaces" && !info.hasChildren ? "{}" : "{enabled:false}";
    candidates.push({ id: `config ${root}=${shown}`, kind: "config", path: root, overlay, alreadyInH: false });
  }
  const rank = (candidate) => {
    if (candidate.alreadyInH) return 9;
    if (candidate.action === "enable") return 0;
    if (candidate.kind === "config") return 2;
    return 1;
  };
  candidates.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  return candidates;
}

async function measureSkills(ctx, built, folder, childIndex, signal) {
  const cwd = emptyDir(ctx.runDir, folder);
  const session = openCodex({ bin: ctx.bin, args: built.args, logFile: ctx.log("P3S"), cwd, childIndex, signal });
  try {
    await handshake(session, ctx, signal);
    const thread = await session.request("thread/start", threadParams(cwd, { config: built.config }), 60_000, signal);
    const skills = await callOrError(session, "skills/list", { cwds: [cwd], forceReload: true }, signal);
    const plugins = await callOrError(session, "plugin/installed", { cwds: [cwd] }, signal);
    const skillCount = countNested(skills, "skills");
    const pluginCount = pluginFacts(plugins);
    const readable = skillCount.count !== null && pluginCount.installed !== null && !skillCount.error && !pluginCount.error;
    return {
      skills: skillCount.count,
      plugins: pluginCount.installed,
      pluginEntries: pluginCount.count,
      pluginAnswerBytes: pluginCount.bytes,
      pluginShape: pluginCount.shape,
      readable,
      cleared: readable && skillCount.count === 0 && pluginCount.installed === 0,
      errors: {
        ...(skillCount.error ? { skills: skillCount.error } : {}),
        ...(pluginCount.error ? { plugins: pluginCount.error } : {}),
      },
    };
  } catch (e) {
    if (e instanceof HarnessError || signal.aborted) throw e;
    return { skills: null, plugins: null, readable: false, cleared: false, errors: { run: e.message } };
  } finally {
    await session.close();
    if (!ctx.keep) removeDir(cwd);
  }
}

async function checkP3S(ctx, signal) {
  const started = Date.now();
  const name = "The person's skills and plugins";
  await requirePersonServers(ctx, "P3S", signal);
  const listed = await featureList(ctx.bin);
  writeJsonl(ctx.log("P3S"), {
    ms: Date.now() - started,
    dir: "features",
    ok: listed.ok,
    error: listed.error ?? null,
    features: (listed.features ?? []).map((feature) => ({ name: feature.name, state: feature.state })),
  });
  writeJsonl(ctx.log("P3S"), {
    ms: Date.now() - started,
    dir: "thread-start-params",
    params: THREAD_START_PARAMS,
    skillRelated: THREAD_START_PARAMS.filter((param) => SKILL_PLUGIN.test(param)),
  });
  let child = 0;
  const cwd = emptyDir(ctx.runDir, "p3s-look");
  const lookBuilt = isolation("h", ctx.configuredNames ?? []);
  const look = openCodex({ bin: ctx.bin, args: lookBuilt.args, logFile: ctx.log("P3S"), cwd, childIndex: ++child, signal });
  let experimental = [];
  let experimentalError = null;
  let keyPaths = ctx.configKeyPaths ?? [];
  try {
    await handshake(look, ctx, signal);
    const read = await readPersonConfig(look, cwd, signal);
    if (read.keyPaths) keyPaths = read.keyPaths;
    if (!ctx.configNamesReady) applyPersonConfig(ctx, read);
    const thread = await look.request("thread/start", threadParams(cwd, { config: lookBuilt.config }), 60_000, signal);
    const found = await listExperimental(look, thread?.thread?.id, signal);
    experimental = found.rows;
    experimentalError = found.error;
  } catch (e) {
    if (e instanceof HarnessError || signal.aborted) throw e;
    experimentalError = e.message;
  } finally {
    await look.close();
    if (!ctx.keep) removeDir(cwd);
  }
  const candidates = skillPluginCandidates(listed.features ?? [], experimental, keyPaths);
  const tried = [];
  const base = await measureSkills(ctx, lookBuilt, "p3s-h", ++child, signal);
  tried.push({ id: "h", kind: "way", skills: base.skills, plugins: base.plugins, pluginAnswerBytes: base.pluginAnswerBytes, readable: base.readable, cleared: base.cleared, errors: base.errors });
  let winner = base.cleared ? "h" : null;
  for (const candidate of candidates) {
    if (signal.aborted) throw new Error("aborted");
    if (winner) break;
    if (candidate.alreadyInH) {
      tried.push({ id: candidate.id, kind: candidate.kind, alreadyInH: true, skills: base.skills, plugins: base.plugins, pluginAnswerBytes: base.pluginAnswerBytes, readable: base.readable, cleared: base.cleared });
      continue;
    }
    const extra = { configOverlay: candidate.overlay };
    if (candidate.action === "disable") extra.featureOff = candidate.name;
    if (candidate.action === "enable") extra.featureOn = candidate.name;
    const built = isolation("h", ctx.configuredNames ?? [], extra);
    writeJsonl(ctx.log("P3S"), { ms: Date.now() - started, dir: "candidate", id: candidate.id, argv: built.args, threadConfig: built.config });
    const measured = await measureSkills(ctx, built, `p3s-${child}`, ++child, signal);
    tried.push({
      id: candidate.id,
      kind: candidate.kind,
      skills: measured.skills,
      plugins: measured.plugins,
      pluginAnswerBytes: measured.pluginAnswerBytes,
      readable: measured.readable,
      cleared: measured.cleared,
      errors: measured.errors,
    });
    if (measured.cleared) winner = candidate.id;
  }
  let skillsSeenByModel = null;
  const modelDir = emptyDir(ctx.runDir, "p3s-model");
  const modelBuilt = isolation("h", ctx.configuredNames ?? [], { shellOff: true });
  const model = openCodex({ bin: ctx.bin, args: modelBuilt.args, logFile: ctx.log("P3S"), cwd: modelDir, childIndex: ++child, signal });
  try {
    await handshake(model, ctx, signal);
    const thread = await model.request("thread/start", threadParams(modelDir, { config: modelBuilt.config }), 60_000, signal);
    const turn = await runTurn(model, {
      threadId: thread.thread.id,
      input: userInput("List the names of every skill you have been told about, one per line. If none, say NONE."),
    }, 90_000, signal);
    skillsSeenByModel = turn.text;
  } catch (e) {
    if (e instanceof HarnessError || signal.aborted) throw e;
    skillsSeenByModel = `error: ${e.message}`;
  } finally {
    await model.close();
    if (!ctx.keep) removeDir(modelDir);
  }
  const readable = tried.filter((row) => row.readable);
  let status = "DISPROVED";
  let evidence;
  if (winner) {
    status = "PROVED";
    evidence = winner === "h"
      ? "Way h listed 0 skills and no installed plugin"
      : `Candidate ${winner} on top of way h listed 0 skills and no installed plugin`;
  } else if (readable.length === 0) {
    status = "UNKNOWN";
    evidence = "skills/list and plugin/installed could not be read for way h or any candidate";
  } else {
    const bits = tried.map((row) => `${row.id} (${row.readable ? `${row.skills} skills, ${row.plugins} installed plugins` : "unreadable"})`);
    evidence = `Every candidate still showed skills or installed plugins: ${bits.join("; ")}`;
  }
  return verdict("P3S", name, status, evidence, started, {
    features: (listed.features ?? []).map((feature) => ({ name: feature.name, state: feature.state })),
    featuresError: listed.error ?? null,
    experimental: experimental.map((feature) => ({ name: feature.name, enabled: feature.enabled })),
    experimentalError,
    threadStartParams: THREAD_START_PARAMS,
    threadStartSkillParams: THREAD_START_PARAMS.filter((param) => SKILL_PLUGIN.test(param)),
    configKeyPaths: keyPaths,
    candidates: tried,
    provedCandidate: winner,
    skillsSeenByModel,
  });
}

async function checkP8(ctx, signal) {
  const started = Date.now();
  const name = "What the bridge can verify before a chat turn";
  await requirePersonServers(ctx, "P8", signal);
  const way = ctx.p3Way ?? "h";
  const mcp = await startProbeMcpServer({ log: (obj) => writeJsonl(ctx.log("P8"), { ms: Date.now() - started, ...obj }) });
  const built = isolation(way, ctx.configuredNames ?? [], { shellOff: true, via: "config", url: mcp.url });
  const cwd = emptyDir(ctx.runDir, "p8");
  const session = openCodex({ bin: ctx.bin, args: built.args, logFile: ctx.log("P8"), cwd, childIndex: 1, signal });
  let gilbReadyAt = null;
  try {
    await handshake(session, ctx, signal);
    const t0 = Date.now();
    const startup = trackStartup(session, (event) => {
      if (event.name === "gilb" && event.status === "ready" && gilbReadyAt === null) gilbReadyAt = event.at;
    });
    const thread = await session.request("thread/start", threadParams(cwd, { config: built.config }), 60_000, signal);
    if (!thread?.thread?.id) throw new Error("thread/start returned no thread id");
    await startup.wait(signal);
    startup.off();
    const listed = await listMcpServers(session, thread.thread.id, signal);
    const servers = listed.rows.map((entry) => summarizeListed(entry));
    const gilbReadyMs = gilbReadyAt === null ? null : gilbReadyAt - t0;
    const surface = threadSurface(thread);
    const withTools = servers.filter((server) => typeof server.toolCount === "number" && server.toolCount > 0);
    const gilb = servers.find((server) => server.name === "gilb") ?? null;
    const exact = Boolean(gilb) && sameNames(gilb.toolNames, ["probe_echo", "probe_slow"]);
    const onlyGilb = withTools.length === 1 && withTools[0].name === "gilb";
    const readable = !listed.error && servers.every((server) => typeof server.toolCount === "number");
    let status = "DISPROVED";
    let evidence;
    if (!readable) {
      status = "UNKNOWN";
      evidence = `mcpServerStatus/list could not be read (${listed.error ?? "a server had no tool count"})`;
    } else if (onlyGilb && exact) {
      status = "PROVED";
      evidence = gilbReadyMs === null
        ? "The only server with tools was gilb and its tools were probe_echo and probe_slow"
        : `The only server with tools was gilb and its tools were probe_echo and probe_slow (gilb ready in ${gilbReadyMs} ms)`;
    } else if (!gilb) {
      const which = withTools.map((server) => `${server.name} (${server.toolCount})`).join(" and ") || "none";
      evidence = `gilb was not listed. Servers with tools: ${which}`;
    } else if (!onlyGilb) {
      const which = withTools.map((server) => `${server.name} (${server.toolCount})`).join(" and ");
      evidence = `Servers with tools were ${which}`;
    } else {
      evidence = `gilb tools were ${(gilb.toolNames ?? []).join(", ") || "none"}`;
    }
    return verdict("P8", name, status, evidence, started, {
      way,
      argv: built.args,
      threadConfig: built.config,
      gilbUrl: mcp.url,
      gilbReadyMs,
      servers: servers.map((server) => ({ name: server.name, toolCount: server.toolCount, toolNames: server.toolNames })),
      thread: surface,
      listError: listed.error,
    });
  } finally {
    await session.close();
    await mcp.close();
    if (!ctx.keep) removeDir(cwd);
  }
}

const RUNNERS = {
  P1: checkP1,
  P2: checkP2,
  P3: checkP3,
  P3S: checkP3S,
  P4: checkP4,
  P5: checkP5,
  P6: checkP6,
  P7: checkP7,
  P8: checkP8,
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
    configuredNames: [],
    configKeyPaths: [],
    configNameSource: null,
    configNamesReady: false,
    configReadError: null,
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
