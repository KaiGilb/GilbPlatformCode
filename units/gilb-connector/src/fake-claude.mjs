#!/usr/bin/env node
// A stand-in for the `claude` CLI, for the connector's hermetic tests.
//   claude -p ... (prompt on stdin) -> stream-json on stdout
// When --mcp-config names a stdio server, this speaks JSON-RPC to it and calls its first tool.
// A prompt that contains WAITFOREVER stays running until SIGTERM (a hand-off that does not finish).
import { spawn } from "node:child_process";
import fs from "node:fs";

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const logPath = process.env.FAKE_CLAUDE_LOG;
const log = (row) => logPath && fs.appendFileSync(logPath, JSON.stringify(row) + "\n");

process.on("SIGTERM", () => {
  log({ event: "sigterm" });
  process.exit(143);
});

let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => {
  prompt += d;
});
process.stdin.on("end", () => {
  void run().catch((err) => {
    process.stdout.write(JSON.stringify({ type: "result", subtype: "error", is_error: true, num_turns: 1, result: String(err && err.message ? err.message : err) }) + "\n");
  });
});

async function run() {
  log({
    event: "run",
    argv,
    prompt,
    system: arg("--system-prompt"),
    hasApiKey: Object.prototype.hasOwnProperty.call(process.env, "ANTHROPIC_API_KEY"),
    mcpToolTimeout: process.env.MCP_TOOL_TIMEOUT ?? null,
    idleTimeout: process.env.CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT ?? null,
  });
  const out = (row) => process.stdout.write(JSON.stringify(row) + "\n");
  const sessionId = arg("--session-id") ?? arg("--resume") ?? "";
  const apiKeySource = process.env.FAKE_API_KEY_SOURCE ?? "none";
  out({
    type: "system",
    subtype: "init",
    session_id: sessionId,
    model: "fake-model",
    apiKeySource,
    tools: [],
    mcp_servers: [{ name: "gilb", status: "connected" }],
  });
  // A run that must not finish (or that is not the person's subscription) stays up until the parent stops it.
  // It does not start the hop connector, so nothing is left behind when this process exits.
  if (prompt.includes("WAITFOREVER") || apiKeySource !== "none") {
    setInterval(() => {}, 1000);
    return;
  }
  let text = `echo: ${prompt.split("\n").slice(-1)[0] ?? ""}`;
  const mcp = JSON.parse(arg("--mcp-config") ?? "{}");
  const server = mcp.mcpServers && mcp.mcpServers.gilb;
  if (server && server.command) {
    text = await callFirstTool(server);
  }
  out({ type: "result", subtype: "success", is_error: false, num_turns: 1, session_id: sessionId, result: text });
}

function callFirstTool(server) {
  return new Promise((resolve, reject) => {
    const child = spawn(server.command, server.args ?? [], {
      env: server.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr = (stderr + d).slice(-2000);
      process.stderr.write(d);
    });
    let buf = "";
    const pending = new Map();
    child.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id !== undefined && pending.has(String(msg.id))) {
          const done = pending.get(String(msg.id));
          pending.delete(String(msg.id));
          done(msg);
        }
      }
    });
    const fail = (err) => {
      child.kill("SIGTERM");
      reject(err);
    };
    child.on("error", (err) => fail(err));
    child.on("close", (code) => {
      if (pending.size > 0) fail(new Error(`hop connector stopped (${code ?? "signal"}). ${stderr.trim()}`));
    });
    const rpc = (method, params, id) =>
      new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error(`hop connector did not answer ${method}`)), 8000);
        pending.set(String(id), (msg) => {
          clearTimeout(timer);
          if (msg.error) rej(new Error(msg.error.message || "hop connector error"));
          else res(msg);
        });
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      });
    void (async () => {
      try {
        await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "fake", version: "0" } }, 1);
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
        const list = await rpc("tools/list", {}, 2);
        const tool = list.result.tools[0];
        if (!tool) throw new Error("hop connector listed no tools");
        const call = await rpc("tools/call", { name: tool.name, arguments: { q: "x" } }, 3);
        const text = call.result.content[0].text;
        child.stdin.end();
        await new Promise((res) => child.on("close", res));
        resolve(text);
      } catch (err) {
        fail(err);
      }
    })();
  });
}
