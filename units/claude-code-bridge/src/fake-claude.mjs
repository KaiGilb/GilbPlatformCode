#!/usr/bin/env node
// A stand-in for the `claude` CLI, for the bridge's hermetic tests. It speaks just enough of the real one:
//   claude auth status                 -> JSON from $FAKE_CLAUDE_AUTH
//   claude -p ... (prompt on stdin)    -> stream-json on stdout; records its argv and the env it was given
// If the prompt contains CALLTOOL it acts as an MCP client of the --mcp-config server, like the real CLI does.
import fs from "node:fs";

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
    envKeys: Object.keys(process.env),
    cwd: process.cwd(),
  });
  const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
  if (arg("--resume") && arg("--resume").startsWith("00000000")) {
    out({ type: "result", subtype: "error_during_execution", is_error: true, num_turns: 0, session_id: sessionId, result: "" });
    return;
  }
  const mcp = JSON.parse(arg("--mcp-config") ?? "{}");
  const url = mcp.mcpServers?.gilb?.url;
  // FAKE_INIT: "omit" = no init event; "nofield" = init without apiKeySource; "null" = apiKeySource null; otherwise normal.
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
      tools: ["mcp__gilb__list_vaults"],
      mcp_servers: [{ name: "gilb", status: "connected" }],
      model: "fake-model",
      apiKeySource: prompt.includes("APIKEYSOURCE") ? "ANTHROPIC_API_KEY" : (process.env.FAKE_API_KEY_SOURCE ?? "none"),
    };
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
  if (prompt.includes("WAITFOREVER")) {
    setInterval(() => {}, 1000);
    return;
  }
  out({ type: "assistant", message: { content: [{ type: "text", text }] } });
  out({ type: "result", subtype: "success", is_error: false, num_turns: 1, session_id: sessionId, result: text });
});
