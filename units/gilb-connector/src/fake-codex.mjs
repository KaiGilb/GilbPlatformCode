#!/usr/bin/env node
// A stand-in for the `codex` CLI, for the connector's hermetic tests.
//   codex doctor --json   -> a doctor report (auth mode and version from the environment)
//   codex features list   -> a few feature lines
//   codex exec ... -      -> JSONL events; the prompt is read from stdin
// When exec is given an MCP server (-c mcp_servers.GilbPlatform.command / .args), this speaks JSON-RPC to it
// and calls its first tool, like fake-claude does.
// Prompt words: WAITFOREVER (stay up until SIGTERM), WAITAFTERTOOL (hang after the tool call), FAILTURN, NOFINAL, TOPERROR.
import { spawn } from "node:child_process";
import fs from "node:fs";

const argv = process.argv.slice(2);
const logPath = process.env.FAKE_CODEX_LOG;
const log = (row) => logPath && fs.appendFileSync(logPath, JSON.stringify(row) + "\n");
const out = (row) => process.stdout.write(JSON.stringify(row) + "\n");

if (argv[0] === "doctor") {
  log({ event: "doctor", argv });
  if (process.env.FAKE_CODEX_DOCTOR_FAIL === "1") process.exit(1);
  if (process.env.FAKE_CODEX_DOCTOR_FAIL === "garbage") {
    process.stdout.write("this is not json\n");
    process.exit(0);
  }
  // Real Codex 0.167.2 reports every details value as a string. FAKE_CODEX_DOCTOR_BOOLEANS=1 emits real booleans instead.
  // FAKE_CODEX_STORED_API_KEY: "1" true, "yes" the string yes, "null" null, "number" 1, "absent" no field; anything else false.
  const keyMode = process.env.FAKE_CODEX_STORED_API_KEY;
  const flag = (value) => (process.env.FAKE_CODEX_DOCTOR_BOOLEANS === "1" ? value : String(value));
  const keyValue = keyMode === "1" ? flag(true) : keyMode === "yes" ? "yes" : keyMode === "null" ? null : keyMode === "number" ? 1 : keyMode === "padded" ? " FALSE " : flag(false);
  const details = {
    "auth file": "/fake/auth.json",
    "auth storage mode": "File",
    ...(keyMode === "absent" ? {} : { "stored API key": keyValue }),
    "stored ChatGPT tokens": flag(true),
    "stored agent identity": flag(false),
    "stored auth mode": process.env.FAKE_CODEX_AUTH_MODE ?? "chatgpt",
  };
  const entry = (id, category, summary, d) => ({ id, category, status: "ok", summary, details: d, remediation: null, durationMs: 0 });
  const checks =
    process.env.FAKE_CODEX_DOCTOR_SHAPE === "nested"
      ? { auth: { credentials: { details } } }
      : {
          "auth.credentials": entry("auth.credentials", "auth", "auth is configured", details),
          "app_server.status": entry("app_server.status", "app_server", "app server is reachable", {}),
          "config.load": entry("config.load", "config", "config loaded", {}),
        };
  out({ schemaVersion: 1, generatedAt: "2026-11-12T00:00:00Z", overallStatus: "ok", codexVersion: process.env.FAKE_CODEX_VERSION ?? "0.167.2", checks });
  process.exit(0);
} else if (argv[0] === "features") {
  log({ event: "features", argv });
  if (process.env.FAKE_CODEX_FEATURES_FAIL === "1") process.exit(1);
  const rows = [
    ["shell_tool", "stable", "true"],
    ["apps", "stable", "true"],
    ["goals", "experimental", "false"],
    ["code_mode_host", "stable", "true"],
    ["fast_mode", "stable", "true"],
  ];
  const delay = Number(process.env.FAKE_CODEX_FEATURES_DELAY_MS ?? 0);
  setTimeout(() => {
    const format = process.env.FAKE_CODEX_FEATURES_FORMAT ?? "plain";
    const kept = format === "noshell" ? rows.filter((r) => r[0] !== "shell_tool") : rows;
    const line = ([name, stage, on]) => `${name.padEnd(24)}${stage.padEnd(16)}${on}`;
    let body = kept.map(line).join("\n") + "\n";
    if (format === "ansi") body = kept.map((r) => `\x1b[1m${r[0]}\x1b[0m`.padEnd(30) + `${r[1].padEnd(16)}${r[2]}`).join("\n") + "\n";
    if (format === "bullets") body = kept.map((r, i) => `${["* ", "- ", "\u2022 "][i % 3]}${line(r)}`).join("\n") + "\n";
    if (format === "indent") body = kept.map((r) => `    ${line(r)}`).join("\n") + "\n";
    if (format === "crlf") body = kept.map(line).join("\r\n") + "\r\n";
    if (format === "header") body = `Features\n\n${kept.map(line).join("\n")}\n\n`;
    if (format === "empty") body = "";
    process.stdout.write(body);
    process.exit(0);
  }, delay > 0 ? delay : 0);
} else if (argv[0] === "exec") {
  runExec();
} else {
  process.stderr.write("fake-codex: unknown command\n");
  process.exit(2);
}

function configValue(prefix) {
  const hit = argv.find((a, i) => argv[i - 1] === "-c" && a.startsWith(prefix));
  return hit === undefined ? undefined : JSON.parse(hit.slice(prefix.length));
}

function runExec() {
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
      out({ type: "turn.failed", error: { message: String(err && err.message ? err.message : err) } });
      process.exit(1);
    });
  });

  async function run() {
    const instructionsPath = configValue("model_instructions_file=");
    const command = configValue("mcp_servers.GilbPlatform.command=");
    const args = configValue("mcp_servers.GilbPlatform.args=");
    log({
      event: "exec",
      pid: process.pid,
      argv,
      prompt,
      instructions: instructionsPath !== undefined ? fs.readFileSync(instructionsPath, "utf8") : null,
      codexVars: Object.keys(process.env).filter((k) => k.startsWith("CODEX_") && !k.startsWith("CODEX_HOME")),
      hasCodexApiKey: "CODEX_API_KEY" in process.env,
      hasOpenaiApiKey: "OPENAI_API_KEY" in process.env,
      openaiVars: Object.keys(process.env).filter((k) => k.startsWith("OPENAI_")),
    });
    out({ type: "thread.started", thread_id: "fake-thread" });
    out({ type: "turn.started" });
    if (prompt.includes("WAITFOREVER")) {
      setInterval(() => {}, 1000);
      return;
    }
    if (prompt.includes("FAILTURN")) {
      out({ type: "turn.failed", error: { message: "fake failure" } });
      process.exit(1);
    }
    if (prompt.includes("TOPERROR")) out({ type: "error", message: "Reconnecting... 1/5" });
    if (prompt.includes("NOFINAL")) {
      out({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } });
      return;
    }
    let text = `echo: ${prompt.split("\n").slice(-1)[0] ?? ""}`;
    if (command !== undefined) {
      text = await callFirstTool({ command, args: args ?? [] });
    }
    // The tool ran, and the run then hangs: the parent's limit has a streamed call to report.
    if (prompt.includes("WAITAFTERTOOL")) {
      setInterval(() => {}, 1000);
      return;
    }
    out({ type: "item.completed", item: { id: "item_commentary", type: "agent_message", text: "I'll do that." } });
    out({ type: "item.completed", item: { id: "item_final", type: "agent_message", text } });
    out({ type: "turn.completed", usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5 } });
  }
}

function callFirstTool(server) {
  return new Promise((resolve, reject) => {
    const child = spawn(server.command, server.args, { env: process.env, stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr = (stderr + d).slice(-2000);
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
        const argumentsIn = { q: "x" };
        const item = { id: "item_tool", type: "mcp_tool_call", server: "GilbPlatform", tool: tool.name, arguments: argumentsIn };
        out({ type: "item.started", item: { ...item, status: "in_progress" } });
        const call = await rpc("tools/call", { name: tool.name, arguments: argumentsIn }, 3);
        const text = call.result.content[0].text;
        out({ type: "item.completed", item: { ...item, status: "completed", result: { content: [{ type: "text", text }] } } });
        child.stdin.end();
        await new Promise((res) => child.on("close", res));
        resolve(text);
      } catch (err) {
        fail(err);
      }
    })();
  });
}
