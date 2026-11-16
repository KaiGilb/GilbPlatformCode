// @vitest-environment node
// Bridge 0.3.7: the person's turn passes a small usage summary from Claude Code's result. A hand-off's message is unchanged.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge } from "../bridge/bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "fake-claude.mjs");
const APP = "http://localhost:5197";

const GOOD = {
  model: "fake-model",
  contextWindow: 1000000,
  inputTokens: 1200,
  outputTokens: 340,
  cacheReadInputTokens: 50000,
  cacheCreationInputTokens: 2000,
};
// Fields the CLI result carries that the page must never see.
const LEAK = /total_cost_usd|input_tokens|duration_ms|costUSD|cache_read_input_tokens/;

let dir;
let bridge;
let base;

async function start() {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-usage-")));
  const ws = path.join(dir, "MyCode");
  fs.mkdirSync(ws);
  bridge = createBridge({
    port: 0,
    claudeBin: FAKE,
    allowedOrigins: [APP],
    workDir: path.join(dir, "work"),
    home: dir,
    workspace: ws,
    codePlatform: "darwin",
    codeEnvExtraPrefixes: ["FAKE_"],
    env: { ...process.env },
  });
  await bridge.start();
  base = `http://127.0.0.1:${bridge.port}`;
  const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: bridge.pairingCode }) });
  return (await res.json()).secret;
}
afterEach(async () => {
  await bridge?.close();
  bridge = undefined;
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

async function turn(secret, body, onTool) {
  const res = await fetch(`${base}/v1/turn`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-bridge-secret": secret },
    body: JSON.stringify({ system: "You are the agent.", tools: [{ name: "list_vaults", description: "d", inputSchema: { type: "object", properties: {} } }], ...body }),
  });
  if (res.status !== 200) return { status: res.status, events: [] };
  const events = [];
  let turnId = "";
  const dec = new TextDecoder();
  const reader = res.body.getReader();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const blk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = /event: (.*)/.exec(blk)?.[1];
      const data = /data: (.*)/.exec(blk)?.[1];
      if (!ev) continue;
      const parsed = JSON.parse(data);
      events.push([ev, parsed]);
      if (ev === "start") turnId = parsed.turnId;
      if (ev === "tool_request" && onTool) {
        const r = await onTool(parsed, turnId);
        await fetch(`${base}/v1/tool-result`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-bridge-secret": secret },
          body: JSON.stringify({ turnId, id: parsed.id, ...r }),
        });
      }
    }
  }
  return { status: 200, events };
}
const msg = (r) => r.events.find((e) => e[0] === "message")[1];

describe("turn usage", () => {
  it("a chat turn and a code turn report the five counts and the model", async () => {
    const secret = await start();
    const chat = msg(await turn(secret, { prompt: "hello" }));
    expect(chat).toMatchObject({ role: "assistant", content: "echo: hello", model: "fake-model", payer: "person-claude-code", usage: GOOD });
    expect(chat).not.toHaveProperty("mode");
    expect(Object.keys(chat.usage).sort()).toEqual(["cacheCreationInputTokens", "cacheReadInputTokens", "contextWindow", "inputTokens", "model", "outputTokens"]);
    expect(JSON.stringify(chat)).not.toMatch(LEAK);

    const code = msg(await turn(secret, { prompt: "hello", mode: "code" }));
    expect(code).toMatchObject({ role: "assistant", content: "echo: hello", model: "fake-model", mode: "code", payer: "person-claude-code", usage: GOOD });
    expect(Object.keys(code.usage).sort()).toEqual(Object.keys(chat.usage).sort());
    expect(JSON.stringify(code)).not.toMatch(LEAK);
  });

  it("drops invalid counts, and leaves usage out when the window is bad, no model matches, or modelUsage is absent", async () => {
    const secret = await start();
    const dropped = msg(await turn(secret, { prompt: "BADUSAGEFIELDS" }));
    expect(dropped.usage).toEqual({ model: "fake-model", contextWindow: 1000000, cacheCreationInputTokens: 2000 });
    expect(dropped.usage).not.toHaveProperty("inputTokens");
    expect(dropped.usage).not.toHaveProperty("outputTokens");
    expect(dropped.usage).not.toHaveProperty("cacheReadInputTokens");
    expect(JSON.stringify(dropped)).not.toMatch(LEAK);

    for (const prompt of ["BADUSAGENOW", "BADUSAGE", "NOUSAGE"]) {
      const m = msg(await turn(secret, { prompt }));
      expect(m, prompt).not.toHaveProperty("usage");
      expect(m.content, prompt).toMatch(/^echo: /);
      expect(JSON.stringify(m), prompt).not.toMatch(LEAK);
    }
  });

  it("uses the only modelUsage entry when the reported model is absent, and the reported model when several are present", async () => {
    const secret = await start();
    const one = msg(await turn(secret, { prompt: "USAGEONE" }));
    expect(one.model).toBe("fake-model");
    expect(one.usage).toEqual({ ...GOOD, model: "other-model" });

    const two = msg(await turn(secret, { prompt: "USAGETWO" }));
    expect(two.usage).toEqual(GOOD);
  });

  it("a hand-off's message does not carry usage", async () => {
    const secret = await start();
    let nested;
    const parent = await turn(secret, { prompt: "CALLTOOL please" }, async (_req, turnId) => {
      nested = await turn(secret, {
        parentTurnId: turnId,
        system: "You are Agent.Outcome.",
        tools: [{ name: "read_record", description: "d", inputSchema: { type: "object", properties: {} } }],
        prompt: "the task",
      });
      return { result: "{}", isError: false };
    });
    expect(msg(parent).usage).toEqual(GOOD);
    expect(msg(nested)).not.toHaveProperty("usage");
    expect(msg(nested).content).toBe("echo: the task");
    expect(JSON.stringify(msg(nested))).not.toMatch(LEAK);
  });

  it("hello reports build 0.3.8", async () => {
    await start();
    const hello = await (await fetch(`${base}/v1/hello`)).json();
    expect(hello.build).toBe("0.3.9");
  });
});
