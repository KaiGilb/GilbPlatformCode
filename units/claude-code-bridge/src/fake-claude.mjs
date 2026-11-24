#!/usr/bin/env node
// A stand-in for the `claude` CLI, for the bridge's hermetic tests. It speaks just enough of the real one:
//   claude auth status                 -> JSON from $FAKE_CLAUDE_AUTH
//   claude -p ... (prompt on stdin)    -> stream-json on stdout; records its argv and the env it was given
// If the prompt contains CALLTOOL it acts as an MCP client of the --mcp-config server, like the real CLI does.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const argv = process.argv.slice(2);
if (argv[0] === "auth" && argv[1] === "status") {
  process.stdout.write(process.env.FAKE_CLAUDE_AUTH ?? JSON.stringify({ loggedIn: true, authMethod: "claude.ai", subscriptionType: "max", email: "p@example.com" }));
  process.exit(0);
}

const logPath = process.env.FAKE_CLAUDE_LOG;
const log = (o) => logPath && fs.appendFileSync(logPath, JSON.stringify(o) + "\n");
const arg = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
// First thing, before anything can fail or be stopped: tells testTeardown.mjs this process exists, so a folder is not removed under a stand-in that has not logged "run" yet.
log({ event: "boot", pid: process.pid });
process.on("SIGTERM", () => {
  log({ event: "sigterm" });
  process.exit(143);
});

let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (prompt += d));
process.stdin.on("end", async () => {
  const sessionId = arg("--session-id") ?? arg("--resume");
  log({
    event: "run",
    argv,
    prompt,
    hasApiKey: process.env.ANTHROPIC_API_KEY !== undefined,
    hasBaseUrl: process.env.ANTHROPIC_BASE_URL !== undefined,
    hasAuthToken: process.env.ANTHROPIC_AUTH_TOKEN !== undefined,
    keepEnv: process.env.KEEP_ME,
    mcpToolTimeout: process.env.MCP_TOOL_TIMEOUT,
    pid: process.pid,
    envKeys: Object.keys(process.env),
    cwd: process.cwd(),
    npmCache: process.env.npm_config_cache,
    claudeSessionId: process.env.GILB_CLAUDE_SESSION_ID,
  });
  const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
  // IGNORETERM: a child that takes its time to stop (the first SIGTERM is logged, the exit comes 3 s later), so a test can act in between.
  if (prompt.includes("IGNORETERM")) {
    process.removeAllListeners("SIGTERM");
    process.on("SIGTERM", () => {
      log({ event: "sigterm-slow" });
      setTimeout(() => process.exit(143), 3000);
    });
  }
  if (arg("--resume") && arg("--resume").startsWith("00000000")) {
    out({ type: "result", subtype: "error_during_execution", is_error: true, num_turns: 0, session_id: sessionId, result: "" });
    return;
  }
  const mcp = JSON.parse(arg("--mcp-config") ?? "{}");
  const url = mcp.mcpServers?.gilb?.url;
  // FAKE_INIT: "omit" = no init event; "nofield" = init without apiKeySource; "null" = apiKeySource null; otherwise normal.
  if (prompt.includes("SANDBOXFAIL")) {
    // The real CLI with failIfUnavailable on a computer where the sandbox cannot start: a line on stderr, no init, a non-zero exit.
    process.stderr.write("Error: sandbox required but unavailable: bubblewrap (bwrap) is not installed\n");
    process.exit(1);
  }
  if (prompt.includes("ZEROTURNSANSWER")) {
    // no init, and a "no turn ran" result that nevertheless carries text: must not be shown
    out({ type: "result", subtype: "success", is_error: false, num_turns: 0, session_id: sessionId, result: "sneaky answer" });
    return;
  }
  if (prompt.includes("INITLATE")) {
    out({ type: "result", subtype: "success", is_error: false, num_turns: 1, session_id: sessionId, result: "answer before init" });
    out({ type: "system", subtype: "init", session_id: sessionId, tools: [], mcp_servers: [], model: "fake-model", apiKeySource: "none" });
    return;
  }
  // A second init in the same process: INITTWICE (both "none"), INITTWICEKEY (second is an API key),
  // INITTWICEKEYTOOL (second is an API key, then a Bash tool_use), INITTWICENOFIELD (second has no apiKeySource),
  // INITTWICECWD (second cwd is "/"), INITTWICEAT (second cwd is $FAKE_LATER_CWD, relative to the start folder), INITTWICEBEFORE (second init before any result).
  // INITGLUED: one line, an API-key init immediately followed by a "none" init. INITNONEWLINE: an API-key init with no trailing newline.
  // NOISELINE: one unreadable line that is not an init, then a normal result.
  const makeInit = () => {
    const init = {
      type: "system",
      subtype: "init",
      session_id: sessionId,
      tools: process.env.FAKE_INIT_TOOLS ? JSON.parse(process.env.FAKE_INIT_TOOLS) : ["mcp__gilb__list_vaults"],
      mcp_servers: [{ name: "gilb", status: "connected" }],
      model: "fake-model",
      apiKeySource: "none",
    };
    const pm = process.env.FAKE_INIT_PERMISSION_MODE ?? (arg("--permission-mode") === "manual" ? "default" : arg("--permission-mode")) ?? "acceptEdits";
    if (pm !== "omit") init.permissionMode = pm;
    if (process.env.FAKE_INIT_CWD !== "omit") init.cwd = process.env.FAKE_FIRST_CWD ? path.resolve(process.cwd(), process.env.FAKE_FIRST_CWD) : process.cwd();
    return init;
  };
  const answer = (text) => out({ type: "result", subtype: "success", is_error: false, num_turns: 1, session_id: sessionId, result: text });
  if (prompt.includes("INITGLUED")) {
    out(makeInit());
    answer("first answer");
    const bad = makeInit();
    bad.apiKeySource = "ANTHROPIC_API_KEY";
    process.stdout.write(JSON.stringify(bad) + JSON.stringify(makeInit()) + "\n");
    answer("LEAKED");
    return;
  }
  if (prompt.includes("INITNONEWLINE")) {
    out(makeInit());
    answer("ANSWER");
    const bad = makeInit();
    bad.apiKeySource = "ANTHROPIC_API_KEY";
    process.stdout.write(JSON.stringify(bad));
    return;
  }
  if (prompt.includes("NOISELINE")) {
    out(makeInit());
    process.stdout.write("not json at all\n");
    answer("fine");
    return;
  }
  const laterInit = prompt.includes("INITTWICEBEFORE") ? "before"
    : prompt.includes("INITTWICEKEYTOOL") ? "keytool"
    : prompt.includes("INITTWICEKEY") ? "key"
    : prompt.includes("INITTWICENOFIELD") ? "nofield"
    : prompt.includes("INITTWICECWD") ? "cwd"
    : prompt.includes("INITTWICEAT") ? "at"
    : prompt.includes("INITTWICE") ? "twice"
    : "";
  if (laterInit) {
    if (laterInit === "before") {
      out(makeInit());
      out(makeInit());
      answer("final answer");
      return;
    }
    out(makeInit());
    answer("first answer");
    const second = makeInit();
    if (laterInit === "key" || laterInit === "keytool") second.apiKeySource = "ANTHROPIC_API_KEY";
    if (laterInit === "nofield") delete second.apiKeySource;
    if (laterInit === "cwd") second.cwd = "/";
    // INITTWICEAT: the second init reports $FAKE_LATER_CWD (a path, or a name under the folder this child started in), like an agent that moved into a subfolder.
    if (laterInit === "at") second.cwd = path.resolve(process.cwd(), process.env.FAKE_LATER_CWD ?? "sub");
    if (laterInit === "keytool") {
      const tool = { type: "assistant", message: { content: [{ type: "tool_use", id: "tuLeak", name: "Bash", input: { command: "echo LEAKED_TOOL", description: "leaked tool" } }] } };
      const toolErr = { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "tuLeak", is_error: true, content: "leaked error" }] } };
      process.stdout.write(JSON.stringify(second) + "\n" + JSON.stringify(tool) + "\n" + JSON.stringify(toolErr) + "\n");
    } else {
      out(second);
    }
    answer("final answer");
    return;
  }
  const initMode = prompt.includes("INITOMIT") ? "omit" : prompt.includes("INITNOFIELD") ? "nofield" : (process.env.FAKE_INIT ?? "");
  if (initMode !== "omit") {
    const init = {
      type: "system",
      subtype: "init",
      session_id: sessionId,
      tools: process.env.FAKE_INIT_TOOLS ? JSON.parse(process.env.FAKE_INIT_TOOLS) : ["mcp__gilb__list_vaults"],
      mcp_servers: [{ name: "gilb", status: "connected" }],
      model: "fake-model",
      apiKeySource: prompt.includes("APIKEYSOURCE") ? "ANTHROPIC_API_KEY" : (process.env.FAKE_API_KEY_SOURCE ?? "none"),
    };
    const pm = process.env.FAKE_INIT_PERMISSION_MODE ?? (arg("--permission-mode") === "manual" ? "default" : arg("--permission-mode")) ?? "acceptEdits";
    if (pm !== "omit") init.permissionMode = pm;
    if (process.env.FAKE_INIT_CWD !== "omit") init.cwd = process.env.FAKE_FIRST_CWD ? path.resolve(process.cwd(), process.env.FAKE_FIRST_CWD) : process.cwd(); // the real CLI's init carries its own getcwd()
    if (initMode === "nofield") delete init.apiKeySource;
    if (initMode === "null") init.apiKeySource = null;
    out(init);
  }
  let text = `echo: ${prompt.split("\n").slice(-1)[0]}`;
  // ENVKEYS: answer with the names of the environment this process was given (a code turn's child gets no FAKE_CLAUDE_LOG, so it cannot log them).
  if (prompt.includes("ENVKEYS")) text = `envkeys:${JSON.stringify(Object.keys(process.env))}`;
  if (prompt.includes("CALLTOOL") && url) {
    const rpc = async (method, params, id) =>
      (await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) })).json();
    await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "fake", version: "0" } }, 1);
    await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
    const list = await rpc("tools/list", {}, 2);
    const call = await rpc("tools/call", { name: list.result.tools[0].name, arguments: { q: "x" } }, 3);
    text = `tool said: ${call.result.content[0].text}`;
  }
  // ASKWRITE / ASKOUT / ASKBASH: act as Claude Code with --permission-prompt-tool: ask the MCP tool bridge_approve and report its answer.
  // LISTTOOLS: log the tool names the per-turn MCP server lists.
  const ask = prompt.includes("ASKWRITE") ? { tool_name: "Write", input: { file_path: path.join(process.cwd(), "a.txt"), content: "x" } }
    : prompt.includes("ASKOUT") ? { tool_name: "Write", input: { file_path: "/tmp/x-outside.txt", content: "x" } }
    : prompt.includes("ASKWEB") ? { tool_name: "WebFetch", input: { url: "https://example.com" } }
    : prompt.includes("ASKTASK") ? { tool_name: "Task", input: { prompt: "x" } }
    : prompt.includes("ASKBASH") ? { tool_name: "Bash", input: { command: "ls", description: "List files" } }
    : null;
  if ((ask || prompt.includes("LISTTOOLS")) && url) {
    const rpc = async (method, params, id) =>
      (await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) })).json();
    await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "fake", version: "0" } }, 1);
    const list = await rpc("tools/list", {}, 2);
    log({ event: "mcpTools", names: list.result.tools.map((t) => t.name) });
    if (ask) {
      const r = await rpc("tools/call", { name: "bridge_approve", arguments: { ...ask, tool_use_id: "tuA" } }, 3);
      const decision = JSON.parse(r.result.content[0].text);
      log({ event: "approve", decision, hasStructured: r.result.structuredContent !== undefined });
      text = `decision: ${decision.behavior}`;
    }
  }
  // ASKJSON:<json array of {tool_name,input}>: ask bridge_approve for each, in order, and log each decision.
  const askJson = /ASKJSON:(.*)/.exec(prompt);
  if (askJson && url) {
    const rpc = async (method, params, id) =>
      (await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) })).json();
    await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "fake", version: "0" } }, 1);
    let n = 10;
    for (const ask of JSON.parse(askJson[1])) {
      const r = await rpc("tools/call", { name: "bridge_approve", arguments: ask }, n++);
      log({ event: "askjson", tool: ask.tool_name, decision: JSON.parse(r.result.content[0].text) });
    }
  }
  if (prompt.includes("SPAWNCHILD")) {
    // Like the real CLI, which starts helpers (its MCP children): one grandchild that sleeps, so a test can see whether Stop took it too.
    const kid = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    log({ event: "child", pid: kid.pid });
  }
  // 0.3.19 (QAAS2): helpers that leave the process group, or the group of the bridge's tracking, on purpose.
  const KIDJS = "setInterval(() => {}, 1000)";
  const KIDJS_IGN = "process.on('SIGTERM',()=>{});setInterval(() => {}, 1000)";
  if (prompt.includes("ESC_SETSID")) { const k = spawn(process.execPath, ["-e", KIDJS], { stdio: "ignore", detached: true }); k.unref(); log({ event: "esc", kind: "setsid", pid: k.pid }); }
  if (prompt.includes("ESC_PERLSETSID")) { const k = spawn("/usr/bin/perl", ["-e", "use POSIX; POSIX::setsid(); sleep 600"], { stdio: "ignore" }); k.unref(); log({ event: "esc", kind: "perlsetsid", pid: k.pid }); }
  if (prompt.includes("ESC_SCRUBENV")) { const k = spawn(process.execPath, ["-e", KIDJS], { stdio: "ignore", detached: true, env: { PATH: process.env.PATH } }); k.unref(); log({ event: "esc", kind: "scrubenv", pid: k.pid }); }
  if (prompt.includes("GRP_IGNTERM")) { const k = spawn(process.execPath, ["-e", KIDJS_IGN], { stdio: "ignore" }); k.unref(); log({ event: "grp", kind: "ignterm", pid: k.pid }); }
  if (prompt.includes("GRP_PLAIN")) { const k = spawn(process.execPath, ["-e", KIDJS], { stdio: "ignore" }); k.unref(); log({ event: "grp", kind: "plain", pid: k.pid }); }
  if (prompt.includes("EXITNOW")) { await new Promise((r) => setTimeout(r, 300)); process.exit(0); }
  if (prompt.includes("WAITFOREVER")) {
    setInterval(() => {}, 1000);
    return;
  }
  if (prompt.includes("CODEWRITE")) {
    await new Promise((r) => setTimeout(r, 200)); // after init: a bridge that refused the init has killed this process by now
    const file = path.join(process.cwd(), "hello.txt");
    fs.writeFileSync(file, "hi");
    out({ type: "assistant", message: { content: [{ type: "tool_use", id: "tu1", name: "Write", input: { file_path: file } }] } });
    out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "tu1", content: "ok" }] } });
  }
  if (prompt.includes("CODEEMPTY")) {
    out({ type: "assistant", message: { content: [{ type: "tool_use", id: "tu3", name: "Bash", input: {} }, { type: "tool_use", id: "tu4", name: "Read", input: {} }] } });
  }
  if (prompt.includes("CODEERR")) {
    out({ type: "assistant", message: { content: [{ type: "tool_use", id: "tu2", name: "Bash", input: { command: "ls /" } }] } });
    out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "tu2", is_error: true, content: "permission denied" }] } });
  }
  if (prompt.includes("HOLDAFTER")) {
    // After the work above (a tool call, a CODEWRITE), stay running, so a test can look at a turn that is mid-way.
    setInterval(() => {}, 1000);
    return;
  }
  // MULTISTEP: six model calls (five tool steps, then the answer), each re-sending a growing context, as the real CLI does:
  // input 10, then cache reads 25000, 30000, ... and cache creation 100 more each step. The last call is the real context.
  // MULTISTEPBAD: the same, but the last call's counts are bad (a string, a negative, past 1e9) apart from one good count.
  // SUBAGENTSTEP: after the last call, a sub-agent line (parent_tool_use_id set) with huge counts; it must not count.
  const stepUsageOf = (n) => ({ input_tokens: 10 + n, output_tokens: 5, cache_read_input_tokens: 25000 + 5000 * n, cache_creation_input_tokens: 100 * (n + 1) });
  if (prompt.includes("MULTISTEP")) {
    for (let n = 0; n < 5; n++) {
      out({ type: "assistant", message: { model: "fake-model", content: [{ type: "tool_use", id: "ms" + n, name: "Read", input: {} }], usage: stepUsageOf(n) } });
      out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "ms" + n, content: "ok" }] } });
    }
    const last = prompt.includes("MULTISTEPBAD")
      ? { input_tokens: "10", output_tokens: 5, cache_read_input_tokens: -1, cache_creation_input_tokens: 600 }
      : stepUsageOf(5);
    out({ type: "assistant", message: { model: "fake-model", content: [{ type: "text", text }], usage: last } });
  } else out({ type: "assistant", message: { content: [{ type: "text", text }] } });
  if (prompt.includes("SUBAGENTSTEP")) {
    out({ type: "assistant", parent_tool_use_id: "ms0", message: { model: "fake-model", content: [{ type: "text", text: "sub" }], usage: { input_tokens: 777777, cache_read_input_tokens: 888888, cache_creation_input_tokens: 999999 } } });
  }
  // The model this process reports on its init line. modelUsage is keyed by that id, as the real CLI keys it.
  const modelReported = "fake-model";
  const goodCounts = { inputTokens: 1200, outputTokens: 340, cacheReadInputTokens: 50000, cacheCreationInputTokens: 2000, contextWindow: 1000000 };
  // BADUSAGE: a malformed modelUsage (strings, a negative, a number past 1e9, two models that are not the reported one).
  // BADUSAGEFIELDS: the reported model, with those bad counts plus one good count and a good context window.
  // BADUSAGENOW: the reported model, but the context window is not a count (a second, valid model must not be used instead).
  // USAGEONE: exactly one entry, under a different model id. USAGETWO: the reported model plus another. NOUSAGE: no modelUsage.
  let modelUsage;
  if (prompt.includes("NOUSAGE")) modelUsage = undefined;
  else if (prompt.includes("BADUSAGEFIELDS")) {
    modelUsage = { [modelReported]: { inputTokens: "1200", outputTokens: -5, cacheReadInputTokens: 1000000001, cacheCreationInputTokens: 2000, contextWindow: 1000000, costUSD: 1.25 } };
  } else if (prompt.includes("BADUSAGENOW")) {
    modelUsage = { [modelReported]: { ...goodCounts, contextWindow: "1000000", costUSD: 1.25 }, "other-model": { ...goodCounts } };
  } else if (prompt.includes("BADUSAGE")) {
    modelUsage = {
      "other-a": { inputTokens: "1200", outputTokens: -5, cacheReadInputTokens: 1000000001, cacheCreationInputTokens: 2000, contextWindow: 1000000, costUSD: 1.25 },
      "other-b": { inputTokens: 10, outputTokens: 20, cacheReadInputTokens: 30, cacheCreationInputTokens: 40, contextWindow: 500000 },
    };
  } else if (prompt.includes("USAGEONE")) modelUsage = { "other-model": { ...goodCounts } };
  else if (prompt.includes("USAGETWO")) modelUsage = { "other-model": { inputTokens: 1, outputTokens: 2, cacheReadInputTokens: 3, cacheCreationInputTokens: 4, contextWindow: 5 }, [modelReported]: { ...goodCounts, costUSD: 0.01 } };
  else modelUsage = { [modelReported]: { ...goodCounts, costUSD: 0.01 } };
  const result = { type: "result", subtype: "success", is_error: false, num_turns: 1, session_id: sessionId, result: text, usage: { input_tokens: 999, output_tokens: 1 }, total_cost_usd: 0.42, duration_ms: 17 };
  if (modelUsage) result.modelUsage = modelUsage;
  out(result);
});
