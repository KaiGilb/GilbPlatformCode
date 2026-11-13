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
  });
  const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
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
    if (initMode === "nofield") delete init.apiKeySource;
    if (initMode === "null") init.apiKeySource = null;
    out(init);
  }
  let text = `echo: ${prompt.split("\n").slice(-1)[0]}`;
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
  if (prompt.includes("WAITFOREVER")) {
    setInterval(() => {}, 1000);
    return;
  }
  if (prompt.includes("CODEWRITE")) {
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
  out({ type: "assistant", message: { content: [{ type: "text", text }] } });
  out({ type: "result", subtype: "success", is_error: false, num_turns: 1, session_id: sessionId, result: text });
});
