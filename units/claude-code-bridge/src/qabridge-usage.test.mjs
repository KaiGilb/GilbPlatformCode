// @vitest-environment node
// QA (hostile) for bridge 0.3.11: last-step context. Uses a COPY of the fake CLI (qabridge-fake.mjs) with QALINES= / QAAFTER= markers.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBridge } from "../bridge/bridge.mjs";
import { removeTestDir } from "./testTeardown.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(HERE, "qabridge-fake.mjs");
const APP = "http://localhost:5197";
const GOOD = { model: "fake-model", contextWindow: 1000000, inputTokens: 1200, outputTokens: 340, cacheReadInputTokens: 50000, cacheCreationInputTokens: 2000 };
let dir, bridge, base;
async function start(env = {}) {
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "qabridge-")));
  const ws = path.join(dir, "MyCode");
  fs.mkdirSync(ws);
  bridge = createBridge({ port: 0, claudeBin: FAKE, allowedOrigins: [APP], workDir: path.join(dir, "work"), home: dir, workspace: ws, codePlatform: "darwin", codeEnvExtraPrefixes: ["FAKE_"], env: { ...process.env, ...env } });
  await bridge.start();
  base = `http://127.0.0.1:${bridge.port}`;
  const res = await fetch(`${base}/v1/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: bridge.pairingCode }) });
  return (await res.json()).secret;
}
afterEach(async () => { await bridge?.close(); bridge = undefined; if (dir) await removeTestDir(dir); });
async function turn(secret, body) {
  const res = await fetch(`${base}/v1/turn`, { method: "POST", headers: { "content-type": "application/json", "x-bridge-secret": secret }, body: JSON.stringify({ system: "You are the agent.", tools: [], ...body }) });
  const events = [];
  const text = await res.text();
  for (const blk of text.split("\n\n")) {
    const ev = /event: (.*)/.exec(blk)?.[1]; const data = /data: (.*)/.exec(blk)?.[1];
    if (ev) events.push([ev, JSON.parse(data)]);
  }
  return { status: res.status, events };
}
const msg = (r) => r.events.find((e) => e[0] === "message")[1];
const asst = (usage, extra = {}, content = [{ type: "text", text: "x" }]) => ({ type: "assistant", message: { model: "fake-model", content, usage }, ...extra });
const P = (lines, t = "go") => `${t} QALINES=${JSON.stringify(lines)}\nQAEND`;
const A = (lines, t = "go") => `${t} QAAFTER=${JSON.stringify(lines)}\nQAEND`;
const STEP1 = { input_tokens: 15, output_tokens: 5, cache_read_input_tokens: 50000, cache_creation_input_tokens: 600 };

describe("qabridge: wrong context number", () => {
  it("baseline: one good step is used", async () => {
    const s = await start();
    expect(msg(await turn(s, { prompt: P([asst(STEP1)]) })).usage).toMatchObject({ inputTokens: 15, cacheReadInputTokens: 50000, cacheCreationInputTokens: 600 });
  });
  it("a trailing assistant line with usage {} must not wipe the earlier step's counts", async () => {
    const s = await start();
    const m = msg(await turn(s, { prompt: P([asst(STEP1), asst({})]) }));
    expect(m.usage.cacheReadInputTokens).toBe(50000);
  });
  it("a final step with only output_tokens must not wipe the context counts", async () => {
    const s = await start();
    const m = msg(await turn(s, { prompt: P([asst(STEP1), asst({ output_tokens: 7 })]) }));
    expect(m.usage.cacheReadInputTokens).toBe(50000);
  });
  it("last step missing a count: the missing counts are 0 for that step (not mixed with the summed modelUsage)", async () => {
    const s = await start();
    const m = msg(await turn(s, { prompt: P([asst({ input_tokens: 5, output_tokens: 1 })]) }));
    expect(m.usage).toMatchObject({ inputTokens: 5, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 });
  });
  it("init x[1m] with steps saying x: the last step is used", async () => {
    const s = await start({ FAKE_INITMODEL: "x[1m]" });
    const m = msg(await turn(s, { prompt: P([{ type: "assistant", message: { model: "X", content: [{ type: "text", text: "x" }], usage: { ...STEP1, cache_creation_input_tokens: 700 } } }]) }));
    expect(m.usage.cacheCreationInputTokens).toBe(700);
  });
  it("a different model after stripping [1m] is still ignored", async () => {
    const s = await start({ FAKE_INITMODEL: "x[1m]" });
    const m = msg(await turn(s, { prompt: P([{ type: "assistant", message: { model: "y", content: [{ type: "text", text: "x" }], usage: STEP1 } }]) }));
    expect(m.usage.cacheCreationInputTokens).toBe(2000);
  });
  it("trailing {} and output-only lines keep the previous good step", async () => {
    const s = await start();
    const m = msg(await turn(s, { prompt: P([asst(STEP1), asst({}), asst({ output_tokens: 9 })]) }));
    expect(m.usage).toMatchObject({ inputTokens: 15, cacheReadInputTokens: 50000, cacheCreationInputTokens: 600 });
  });
  it("init model with a [1m] suffix while assistant lines say the bare id: last step still used (not the sum)", async () => {
    const s = await start({ FAKE_INITMODEL: "fake-model[1m]" });
    const m = msg(await turn(s, { prompt: P([asst(STEP1)]) }));
    expect(m.usage.cacheCreationInputTokens).toBe(600);
  });
  it("a top-level step by another model (haiku helper) after the main step is ignored", async () => {
    const s = await start();
    const other = { type: "assistant", message: { model: "haiku", content: [], usage: { input_tokens: 1, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 } } };
    expect(msg(await turn(s, { prompt: P([asst(STEP1), other]) })).usage).toMatchObject({ cacheReadInputTokens: 50000 });
  });
  it("a <synthetic> zero-usage assistant line is ignored", async () => {
    const s = await start();
    const syn = { type: "assistant", message: { model: "<synthetic>", content: [], usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } };
    expect(msg(await turn(s, { prompt: P([asst(STEP1), syn]) })).usage).toMatchObject({ cacheReadInputTokens: 50000 });
  });
  it("usage as an array / string / null on the last line leaves the earlier step standing", async () => {
    const s = await start();
    for (const bad of [[], "x", null, 5]) {
      expect(msg(await turn(s, { prompt: P([asst(STEP1), asst(bad)]) })).usage, JSON.stringify(bad)).toMatchObject({ cacheReadInputTokens: 50000 });
    }
  });
  it("bad counts never produce NaN / negative / fractional", async () => {
    const s = await start();
    const m = msg(await turn(s, { prompt: P([asst({ input_tokens: 1.5, cache_read_input_tokens: -3, cache_creation_input_tokens: 2e12 })]) }));
    for (const v of Object.values(m.usage)) if (typeof v === "number") { expect(Number.isInteger(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); }
  });
  it("stale step does not leak: turn 1 has steps, turn 2 has none -> fallback to modelUsage; same bridge", async () => {
    const s = await start();
    msg(await turn(s, { prompt: P([asst(STEP1)]) }));
    expect(msg(await turn(s, { prompt: "plain" })).usage).toEqual(GOOD);
  });
  it("resumed session (same sessionId, second turn) uses its own last step", async () => {
    const s = await start();
    const r1 = await turn(s, { prompt: P([asst(STEP1)]) });
    const sid = r1.events.find((e) => e[1] && e[1].sessionId)?.[1].sessionId;
    const r2 = await turn(s, { prompt: P([asst({ ...STEP1, cache_read_input_tokens: 60000 })]), ...(sid ? { sessionId: sid } : {}) });
    expect(msg(r2).usage.cacheReadInputTokens).toBe(60000);
  });
});

describe("qabridge: interleaving", () => {
  it("result first, then a later assistant line: the later line is not used", async () => {
    const s = await start();
    const m = msg(await turn(s, { prompt: A([asst({ input_tokens: 1, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 })]) }));
    expect(m.usage).toEqual(GOOD);
  });
  it("text and tool_use assistant lines interleaved with user lines: last wins", async () => {
    const s = await start();
    const u = { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "a", content: "ok" }] } };
    const m = msg(await turn(s, { prompt: P([asst(STEP1, {}, [{ type: "tool_use", id: "a", name: "Read", input: {} }]), u, asst({ ...STEP1, cache_read_input_tokens: 70000 }), u, asst({ ...STEP1, cache_read_input_tokens: 80000 })]) }));
    expect(m.usage.cacheReadInputTokens).toBe(80000);
  });
});

describe("qabridge: code events unchanged", () => {
  it("assistant lines with usage still drive tool steps and files", async () => {
    const s = await start();
    const file = "hello.txt";
    const r = await turn(s, { mode: "code", prompt: P([asst(STEP1, {}, [{ type: "tool_use", id: "t1", name: "Write", input: { file_path: "x" } }])], "CODEWRITE") });
    const names = r.events.map((e) => e[0]);
    const plain = await turn(s, { mode: "code", prompt: "CODEWRITE" });
    expect(names.filter((n) => n !== "message")).toEqual(expect.arrayContaining(plain.events.map((e) => e[0]).filter((n) => n !== "message").slice(0, 1)));
    expect(plain.events.map((e) => e[0])).toContain("files_changed");
    expect(names).toContain("files_changed");
    void file;
  });
});
