#!/usr/bin/env node
/**
 * A stand-in for `codex app-server`, for the bridge's hermetic tests.
 * Copied from the measurement on Kai's Mac, Codex CLI 0.167.2, 2026-11-24,
 * probe run folder /Users/kaigilb/Developer/_tmp/codex-probe/runs/2026-11-24T222311.994Z.
 * It speaks JSON-RPC over stdio, one JSON object per line, with no "jsonrpc" field.
 * Started as `node fake-codex.mjs app-server …`.
 *
 * Guess (not measured): the values of platformFamily and platformOs on initialize are "fake".
 * The field names were measured. Guess: a sandbox string other than "read-only" is reported back as its own type name.
 * Guess: the initialize body this process POSTs to the gilb MCP url uses the same shape the Claude stand-in uses.
 * The order (initialize, notifications/initialized, tools/list) was measured. Guess: a tool call's arguments are { text: "hi" }.
 * FAKE_CODEX_FORCE_TOOLS is a test switch, not something Codex does.
 *
 * The switches below are guesses. The real Codex CLI 0.167.2 was not measured to do any of them
 * (probe run 2026-11-24, and the 2026-11-25 chat turns). They exist so a test can force a shape:
 * FAKE_CODEX_NO_VERSION (userAgent with no x.y.z), FAKE_CODEX_USER_AGENT (the initialize userAgent, even when empty),
 * FAKE_CODEX_IGNORE_TERM (SIGTERM is logged and ignored),
 * FAKE_CODEX_WIDE_REPEATS plus FAKE_CODEX_CHUNK (a long answer outside ASCII, written in small stdout pieces),
 * FAKE_CODEX_DOUBLE_GILB (two rows named gilb), FAKE_CODEX_STATUS (omit-tools, tools-array, no-name),
 * FAKE_CODEX_MODEL_PROVIDER (thread answer modelProvider other than openai),
 * FAKE_CODEX_BIG_LINE (one stdout line longer than 16 MiB).
 * Prompt words, also guesses: SILENT (nothing after turn/start), TICK (a status line on a timer, no item),
 * EARLYSHELL (a commandExecution item before the turn/start answer), COMPLETEDSHELL (that item only as
 * item/completed), UPDATEDSHELL (only as item/updated), NOANSWER (turn/completed with no agentMessage),
 * WIDE (the long answer), BIGLINE (the long line, then an answer the bridge must not show),
 * TOOLTHENFAIL (one tool call, then a failed turn), ITEMS:<base64 JSON array of notifications> (written as given, then an answer), ACCTUPDATE (an account/updated notice with authMode FAKE_CODEX_ACCT_MODE, then an answer).
 */
import fs from "node:fs";
import readline from "node:readline";
import crypto from "node:crypto";

const argv = process.argv.slice(2);
const logPath = process.env.FAKE_CODEX_LOG;
const log = (o) => logPath && fs.appendFileSync(logPath, JSON.stringify({ pid: process.pid, ...o }) + "\n");

// First line, before a stop or an unknown-flag exit: teardown waits on this pid, and tests read argv and env names.
log({ event: "boot", argv, cwd: process.cwd(), envNames: Object.keys(process.env).sort() });
// Guess: a child that stays up after SIGTERM. The real Codex was not measured to ignore it.
process.on("SIGTERM", () => {
  log({ event: "sigterm" });
  if (process.env.FAKE_CODEX_IGNORE_TERM === "1") return;
  process.exit(143);
});

// Measured: an unknown --disable name makes the app-server exit at once with this stderr line.
if (process.env.FAKE_CODEX_UNKNOWN_FLAG === "1") {
  fs.writeSync(2, "Error: Unknown feature flag: not-a-real-flag\n");
  process.exit(1);
}

const pending = new Map();
let nextId = 1;
let thread = null;

const write = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
const respond = (id, result) => write({ id, result });
const respondError = (id, code, message) => write({ id, error: { code, message } });

/** A request this process sends. The bridge's answer arrives later on stdin. */
function request(method, params) {
  const id = nextId++;
  write({ method, id, params });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error("timed out"));
    }, 20000);
    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
  });
}

/**
 * Reads the gilb tool names the way the measured client does: initialize, then the initialized notification, then tools/list.
 * @param {string} url The turn's MCP url from the thread config.
 * @returns {Promise<string[]>} Tool names, or none when the url cannot be read.
 */
async function readGilbTools(url) {
  if (!url) return [];
  const post = async (body) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return null; }
  };
  await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "fake-codex", version: "0" } } });
  await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  const list = await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const tools = Array.isArray(list?.result?.tools) ? list.result.tools : [];
  return tools.map((t) => t?.name).filter((n) => typeof n === "string");
}

function serverNames() {
  return String(process.env.FAKE_CODEX_SERVERS ?? "PersonServer").split(",").map((s) => s.trim()).filter(Boolean);
}

function accountResult() {
  const kind = process.env.FAKE_CODEX_ACCOUNT || "chatgpt";
  // Placeholder account fields. The shape was measured. The address is the same stand-in the Claude fake uses, not a person.
  if (kind === "apiKey") return { account: { type: "apiKey" }, requiresOpenaiAuth: false };
  if (kind === "none") return { account: null, requiresOpenaiAuth: true };
  if (kind === "other") return { account: { type: "amazonBedrock" }, requiresOpenaiAuth: false };
  if (kind === "garbage") return { weird: true };
  return { account: { type: "chatgpt", email: "p@example.com", planType: "plus", workspaceName: "Work" }, requiresOpenaiAuth: false };
}

function threadResult(id, params) {
  const model = typeof params.model === "string" && params.model ? params.model : "gpt-fake-a";
  // Measured: a request sandbox of "read-only" comes back as type "readOnly". Any other string was not measured.
  const sandbox = params.sandbox === "read-only" ? { type: "readOnly", networkAccess: false } : { type: String(params.sandbox), networkAccess: false };
  // Measured 2026-11-24: the thread answer carries modelProvider "openai". Any other value is a test switch.
  const modelProvider = process.env.FAKE_CODEX_MODEL_PROVIDER || "openai";
  return {
    thread: { id, cwd: params.cwd, model, modelProvider },
    model,
    modelProvider,
    cwd: params.cwd,
    approvalPolicy: params.approvalPolicy,
    sandbox,
  };
}

function statusList() {
  // Guess: these list shapes were not in the measured mcpServerStatus/list (one row per name, tools an object).
  const mode = process.env.FAKE_CODEX_STATUS || "";
  if (mode === "omit-tools") return { data: [{ name: "gilb" }, { name: "PersonServer", tools: {} }] };
  if (mode === "tools-array") return { data: [{ name: "gilb", tools: ["probe_echo"] }, { name: "PersonServer", tools: {} }] };
  if (mode === "no-name") return { data: [{ tools: { a: { name: "a" } } }, { name: "gilb", tools: {} }] };
  const config = thread?.config?.mcp_servers ?? {};
  const force = process.env.FAKE_CODEX_FORCE_TOOLS === "1";
  const data = serverNames().filter((name) => name !== "gilb").map((name) => {
    const off = config[name]?.enabled === false;
    // A server the thread config did not switch off still has tools, so the bridge's check can fail. FORCE_TOOLS is the test switch for a server that was switched off.
    const tools = !off || force ? { t1: { name: "t1" }, t2: { name: "t2" }, t3: { name: "t3" } } : {};
    return { name, runtimeStatus: off && !force ? "disabled" : "ready", tools };
  });
  const gilbTools = {};
  for (const name of thread?.gilbTools ?? []) gilbTools[name] = { name };
  data.push({ name: "gilb", runtimeStatus: "ready", tools: gilbTools });
  // Guess: a second row with the same name. The measured list had one row per name.
  if (process.env.FAKE_CODEX_DOUBLE_GILB === "1") data.push({ name: "gilb", runtimeStatus: "ready", tools: { shell: { name: "shell" } } });
  return { data };
}

const note = (method, params) => write({ method, params });

const usageNote = (threadId) => note("thread/tokenUsage/updated", {
  threadId,
  // Measured counts: input 16196 of which 13696 were cached, window 475000. outputTokens 12 is a stand-in count.
  tokenUsage: { last: { totalTokens: 16208, inputTokens: 16196, cachedInputTokens: 13696, cacheWriteInputTokens: 0, outputTokens: 12, reasoningOutputTokens: 0 }, modelContextWindow: 475000 },
});

function finishTurn(threadId, turnId, text, phase) {
  const item = { type: "agentMessage", text };
  if (phase) item.phase = phase;
  note("item/completed", { threadId, turnId, item });
  usageNote(threadId);
  note("turn/completed", { threadId, turn: { id: turnId, status: "completed", error: null } });
}

/**
 * Writes one stdout buffer in pieces, with a short pause so the bridge reads them apart.
 * Guess: the real app-server was not measured to split a character across writes. The pause is a test technique.
 */
async function writeChunks(buf) {
  const size = Math.max(1, Number(process.env.FAKE_CODEX_CHUNK || 4096));
  for (let i = 0; i < buf.length; i += size) {
    fs.writeSync(1, buf.subarray(i, Math.min(buf.length, i + size)));
    await new Promise((r) => setTimeout(r, 8));
  }
}

/**
 * Writes every byte. A child's stdout is non-blocking, so one writeSync of a full buffer throws EAGAIN
 * once the pipe is full and would never deliver a line long enough for the bridge to refuse.
 * Guess: the real app-server was not measured to send a line this long.
 * @param {number} fd The file descriptor.
 * @param {Buffer} buf The bytes to write.
 */
function writeAllSync(fd, buf) {
  let off = 0;
  const pause = new Int32Array(new SharedArrayBuffer(4));
  while (off < buf.length) {
    try {
      const n = fs.writeSync(fd, buf, off, buf.length - off);
      if (n > 0) off += n;
    } catch (e) {
      if (e?.code === "EPIPE") return; // the bridge closed the pipe after it had read enough
      if (e?.code !== "EAGAIN") throw e;
      Atomics.wait(pause, 0, 0, 2);
    }
  }
}

/** One stdout line of ASCII, longer than 16 MiB. Guess: the real app-server was not measured to send one. */
function writeBigLine() {
  const chunk = Buffer.alloc(1024 * 1024, 0x61);
  for (let i = 0; i < 17; i++) writeAllSync(1, chunk);
  writeAllSync(1, Buffer.from("\n"));
}

async function runScenario(prompt, threadId, turnId) {
  // Guess: nothing after the turn/start answer. SILENT is the same wait as WAITFOREVER.
  if (prompt.includes("WAITFOREVER") || prompt.includes("SILENT")) return;
  if (prompt.includes("TICK")) {
    // Guess: a notification with no item, on a timer, so a test can tell an idle clock from an overall clock.
    const timer = setInterval(() => {
      try { note("thread/status/changed", { threadId, status: "idle" }); } catch { /* the pipe is already closed */ }
    }, 40);
    timer.unref();
    return;
  }
  if (prompt.includes("WIDE")) {
    const unit = "å€😀漢";
    const repeats = Math.max(1, Number(process.env.FAKE_CODEX_WIDE_REPEATS || 8000));
    const text = unit.repeat(repeats);
    const line = JSON.stringify({ method: "item/completed", params: { threadId, turnId, item: { type: "agentMessage", text, phase: "final_answer" } } }) + "\n";
    await writeChunks(Buffer.from(line, "utf8"));
    const rest = JSON.stringify({ method: "thread/tokenUsage/updated", params: { threadId, tokenUsage: { last: { totalTokens: 16208, inputTokens: 16196, cachedInputTokens: 13696, cacheWriteInputTokens: 0, outputTokens: 12, reasoningOutputTokens: 0 }, modelContextWindow: 475000 } } }) + "\n"
      + JSON.stringify({ method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed", error: null } } }) + "\n";
    process.stdout.write(rest);
    return;
  }
  if (prompt.includes("BIGLINE")) {
    writeBigLine();
    finishTurn(threadId, turnId, "should-not-arrive", "final_answer");
    return;
  }
  if (prompt.includes("NOANSWER")) {
    usageNote(threadId);
    note("turn/completed", { threadId, turn: { id: turnId, status: "completed", error: null } });
    return;
  }
  if (prompt.includes("COMPLETEDSHELL")) {
    note("item/completed", { threadId, turnId, item: { type: "commandExecution" } });
    return;
  }
  if (prompt.includes("UPDATEDSHELL")) {
    note("item/updated", { threadId, turnId, item: { type: "commandExecution" } });
    return;
  }
  const itemsMatch = /ITEMS:([A-Za-z0-9+/=]+)/.exec(prompt);
  if (itemsMatch) {
    // Guess: the notices are whatever the test sends, as base64 JSON, one array of whole notifications. $T is this thread's id.
    // The pause lets a bridge that does not stop on them answer, so the test can see that.
    for (const n of JSON.parse(Buffer.from(itemsMatch[1], "base64").toString())) process.stdout.write(JSON.stringify(n).replaceAll("$T", threadId) + "\n");
    await new Promise((r) => setTimeout(r, 300));
    finishTurn(threadId, turnId, "items-done", "final_answer");
    return;
  }
  if (prompt.includes("ACCTUPDATE")) {
    // Guess: the notice shape is the hacker's stand-in (authMode and planType). FAKE_CODEX_ACCT_MODE is the authMode sent; "none" sends null, "missing" sends no authMode.
    const mode = process.env.FAKE_CODEX_ACCT_MODE ?? "apikey";
    const params = { planType: null };
    if (mode === "none") params.authMode = null;
    else if (mode !== "missing") params.authMode = mode;
    note("account/updated", params);
    // A pause, so a bridge that ignores the notice still answers and the test sees it.
    await new Promise((r) => setTimeout(r, 300));
    finishTurn(threadId, turnId, "acct-kept-going", "final_answer");
    return;
  }
  if (prompt.includes("CASESHELL")) {
    // Guess: this type string is not in Codex 0.167.2 ThreadItem.ts. Since H-2 the guard is an allow list, so it stops the turn.
    note("item/started", { threadId, turnId, item: { type: "CommandExecution" } });
    finishTurn(threadId, turnId, "case-kept", "final_answer");
    return;
  }
  if (prompt.includes("SUBAGENT")) {
    // Measured: collabAgentToolCall still starts with every disable flag on. A second thread's answer must not become this turn's answer.
    note("item/started", { threadId, turnId, item: { type: "collabAgentToolCall" } });
    const child = crypto.randomUUID();
    note("item/completed", { threadId: child, turnId: "child-turn", item: { type: "agentMessage", phase: "final_answer", text: "CHILD-ANSWER" } });
    note("turn/completed", { threadId: child, turn: { id: "child-turn", status: "completed", error: null } });
    finishTurn(threadId, turnId, prompt, "final_answer");
    return;
  }
  if (prompt.includes("CHILDSHELL")) {
    note("item/started", { threadId: crypto.randomUUID(), turnId: "child-turn", item: { type: "commandExecution" } });
    return;
  }
  if (prompt.includes("FOREIGNSTART")) {
    note("mcpServer/startupStatus/updated", { threadId, name: "PersonServer", status: "starting" });
    return;
  }
  if (prompt.includes("SHELLITEM")) {
    note("item/started", { threadId, turnId, item: { type: "commandExecution" } });
    return;
  }
  if (prompt.includes("FOREIGNMCP")) {
    note("item/started", { threadId, turnId, item: { type: "mcpToolCall", server: "other", tool: "x", status: "inProgress" } });
    return;
  }
  if (prompt.includes("RESOURCES")) {
    // Measured 2026-11-25: Codex calls its own resource list as mcpToolCall on server "codex". Then the turn's own answer.
    note("item/started", { threadId, turnId, item: { type: "mcpToolCall", server: "codex", tool: "list_mcp_resources", status: "inProgress" } });
    finishTurn(threadId, turnId, prompt, "final_answer");
    return;
  }
  if (prompt.includes("CODEXOTHER")) {
    note("item/started", { threadId, turnId, item: { type: "mcpToolCall", server: "codex", tool: "something_else", status: "inProgress" } });
    return;
  }
  if (prompt.includes("ASKAPPROVAL")) {
    let decision = "error";
    try {
      const result = await request("item/commandExecution/requestApproval", { threadId, turnId });
      decision = result?.decision ?? "missing";
    } catch {
      decision = "error";
    }
    finishTurn(threadId, turnId, `approval:${decision}`, "final_answer");
    return;
  }
  if (prompt.includes("LIMIT")) {
    note("turn/completed", { threadId, turn: { id: turnId, status: "failed", error: { message: "limit", codexErrorInfo: "usageLimitExceeded" } } });
    return;
  }
  if (prompt.includes("FAILTURN")) {
    note("turn/completed", { threadId, turn: { id: turnId, status: "failed", error: { message: "the model broke badly" } } });
    return;
  }
  if (prompt.includes("DIEEARLY")) {
    fs.writeSync(2, "early-one\nearly-two\n");
    process.exit(1);
  }
  if (prompt.includes("BADLINE")) process.stdout.write("this is not json\n");
  if (prompt.includes("NOPHASE")) {
    finishTurn(threadId, turnId, "no-phase-text");
    return;
  }
  if (prompt.includes("CALLTOOL") || prompt.includes("TOOLTHENFAIL")) {
    const name = thread?.gilbTools?.[0];
    const url = thread?.gilbUrl;
    note("item/started", { threadId, turnId, item: { type: "mcpToolCall", server: "gilb", tool: name ?? "", status: "inProgress" } });
    let text = "no tool";
    if (name && url) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: { text: "hi" } } }),
      });
      const body = await res.json();
      text = body?.result?.content?.[0]?.text ?? "no text";
    }
    note("item/completed", { threadId, turnId, item: { type: "mcpToolCall", server: "gilb", tool: name ?? "", status: "completed" } });
    // Guess: a tool call followed by a failed turn. Measured turns that call a tool then complete do not fail.
    if (prompt.includes("TOOLTHENFAIL")) {
      note("turn/completed", { threadId, turn: { id: turnId, status: "failed", error: { message: "the model broke badly" } } });
      return;
    }
    finishTurn(threadId, turnId, text, "final_answer");
    return;
  }
  finishTurn(threadId, turnId, prompt, "final_answer");
}

async function onRequest(id, method, params) {
  log({ event: "rpc", method, id, params });
  if (method === "initialize") {
    // Guess: one line the bridge should refuse to hold. Written here so the reader is already attached.
    if (process.env.FAKE_CODEX_BIG_LINE === "1") {
      writeBigLine();
      return;
    }
    // Guess: a userAgent with no x.y.z. The measured userAgent carried the CLI version.
    // FAKE_CODEX_USER_AGENT is the whole string, including an empty one, so a test can send a shape the wrapper would hide.
    const version = process.env.FAKE_CODEX_NO_VERSION === "1" ? "" : (process.env.FAKE_CODEX_VERSION || "0.167.2");
    const userAgent = process.env.FAKE_CODEX_USER_AGENT !== undefined
      ? process.env.FAKE_CODEX_USER_AGENT
      : (version ? `gilb-bridge/${version} (fake)` : "gilb-bridge (fake)");
    respond(id, { userAgent, codexHome: process.env.CODEX_HOME ?? "", platformFamily: "fake", platformOs: "fake" });
    return;
  }
  if (method === "account/read") {
    respond(id, accountResult());
    return;
  }
  if (method === "model/list") {
    respond(id, {
      data: [
        { id: "gpt-fake-a", displayName: "Fake A", isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "high" }] },
        { id: "gpt-fake-b", displayName: "Fake B", isDefault: false, supportedReasoningEfforts: [{ reasoningEffort: "medium" }] },
      ],
    });
    return;
  }
  if (method === "config/read") {
    const mcp_servers = {};
    for (const name of serverNames()) mcp_servers[name] = { command: "fake" };
    respond(id, { config: { mcp_servers } });
    return;
  }
  if (method === "thread/resume" && String(params.threadId ?? "").startsWith("00000000")) {
    respondError(id, 1, "no such thread");
    return;
  }
  if (method === "thread/start" || method === "thread/resume") {
    const tid = method === "thread/resume" ? String(params.threadId) : crypto.randomUUID();
    const gilbUrl = params.config?.mcp_servers?.gilb?.url ?? "";
    let gilbTools = [];
    try { gilbTools = await readGilbTools(gilbUrl); } catch { gilbTools = []; }
    thread = { id: tid, config: params.config ?? {}, gilbTools, gilbUrl };
    respond(id, threadResult(tid, params));
    // The bridge waits for gilb to be ready only when the turn has tools. An empty list would wait until the timeout.
    if (gilbTools.length > 0) note("mcpServer/startupStatus/updated", { threadId: tid, name: "gilb", status: "ready" });
    return;
  }
  if (method === "mcpServerStatus/list") {
    respond(id, statusList());
    return;
  }
  if (method === "turn/start") {
    const prompt = params.input?.[0]?.text ?? "";
    const threadId = String(params.threadId ?? thread?.id ?? "");
    const turnId = crypto.randomUUID();
    // Guess: a stop item that arrives while turn/start is still unanswered. The answer is delayed so a bridge that misses it waits out its start timeout.
    if (prompt.includes("EARLYSHELL")) {
      note("item/started", { threadId, turnId, item: { type: "commandExecution" } });
      await new Promise((r) => setTimeout(r, 30000));
    }
    respond(id, { turn: { id: turnId, status: "inProgress" } });
    await runScenario(prompt, threadId, turnId);
    return;
  }
  respondError(id, -32601, "not implemented");
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg && msg.id !== undefined && msg.method === undefined) {
    const waiter = pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id);
    if (msg.error !== undefined) waiter.reject(new Error(msg.error?.message ?? "error"));
    else waiter.resolve(msg.result);
    return;
  }
  if (msg && typeof msg.method === "string" && msg.id !== undefined) void onRequest(msg.id, msg.method, msg.params ?? {});
});
