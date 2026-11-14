// Bridge 0.3.5: the person's model and effort, and delegateCoding, on sendTurn; the bridge's `options` from hello.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClaudeCodeClient, MODEL_ALIASES, EFFORTS } from "./client";

const PLATFORM = "https://platform.example.test";
const CONTEXT_URL = `${PLATFORM}/base/ai/claude-code/context`;
const BRIDGE = "http://127.0.0.1:47821";
const PRINCIPAL = "https://pelleparafin.example.test/base";
const getAuthHeaders = vi.fn(async () => ({ authorization: "DPoP tok", dpop: "p" }));
let client = createClaudeCodeClient({ principal: PRINCIPAL, platformOrigin: PLATFORM, bridgeUrl: BRIDGE, getAuthHeaders });
let fetchMock: ReturnType<typeof vi.fn>;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sse = (events: [string, unknown][]) =>
  new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });

beforeEach(() => {
  client = createClaudeCodeClient({ principal: PRINCIPAL, platformOrigin: PLATFORM, bridgeUrl: BRIDGE, getAuthHeaders });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  client.save("s3cret");
});
afterEach(() => vi.unstubAllGlobals());

const bridge = (message: Record<string, unknown> = {}) => {
  const calls: { url: string; init: RequestInit }[] = [];
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url === CONTEXT_URL) return json(200, { system: "S", tools: [] });
    if (url === `${BRIDGE}/v1/turn`) return sse([["start", { ok: true, turnId: "t1" }], ["message", { role: "assistant", content: "done", model: "m", ...message }]]);
    throw new Error(`unexpected ${url}`);
  });
  return calls;
};
const body = (calls: { url: string; init: RequestInit }[]) => JSON.parse(String(calls.find((c) => c.url === `${BRIDGE}/v1/turn`)!.init.body)) as Record<string, unknown>;
const U = [{ role: "user" as const, content: "hi" }];

describe("model, effort and delegateCoding on sendTurn", () => {
  it("are passed through to the turn body (delegateCoding only on a code turn)", async () => {
    let calls = bridge();
    await client.sendTurn(U, { thread: "T", model: "opus", effort: "high" });
    expect(body(calls)).toMatchObject({ model: "opus", effort: "high" });
    expect(body(calls)).not.toHaveProperty("delegateCoding");
    calls = bridge();
    await client.sendTurn(U, { thread: "T", mode: "code", model: "claude-sonnet-4.5", effort: "max", delegateCoding: true });
    expect(body(calls)).toMatchObject({ mode: "code", model: "claude-sonnet-4.5", effort: "max", delegateCoding: true });
    calls = bridge();
    await client.sendTurn(U, { thread: "T", mode: "code", delegateCoding: false });
    expect(body(calls)).toMatchObject({ delegateCoding: false });
    calls = bridge();
    await client.sendTurn(U, { thread: "T" });
    for (const k of ["model", "effort", "delegateCoding"]) expect(body(calls)).not.toHaveProperty(k);
  });

  it("every alias and effort is accepted", async () => {
    for (const model of MODEL_ALIASES) for (const effort of EFFORTS) {
      const calls = bridge();
      await client.sendTurn(U, { thread: "T", model, effort });
      expect(body(calls)).toMatchObject({ model, effort });
    }
  });

  it("a wrong value throws before any network call", async () => {
    const bad: [Record<string, unknown>, string][] = [
      [{ model: "gpt-5" }, "That model is not allowed."],
      [{ model: "--x" }, "That model is not allowed."],
      [{ model: "Opus" }, "That model is not allowed."],
      [{ model: "" }, "That model is not allowed."],
      [{ model: null }, "That model is not allowed."],
      [{ effort: "extreme" }, "That effort is not allowed."],
      [{ effort: "" }, "That effort is not allowed."],
      [{ delegateCoding: true }, "delegateCoding is only for code turns."],
      [{ mode: "chat", delegateCoding: true }, "delegateCoding is only for code turns."],
      [{ mode: "code", delegateCoding: "yes" }, "delegateCoding must be true or false."],
    ];
    for (const [extra, message] of bad) {
      await expect(client.sendTurn(U, { thread: "T", ...extra } as never), JSON.stringify(extra)).rejects.toMatchObject({ status: 400, message });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the reply carries effort and delegateCoding as the bridge says it used them", async () => {
    bridge({ effort: "low", delegateCoding: true, mode: "code" });
    expect(await client.sendTurn(U, { thread: "T", mode: "code" })).toMatchObject({ effort: "low", delegateCoding: true });
    bridge({});
    const plain = await client.sendTurn(U, { thread: "T" });
    expect(plain).not.toHaveProperty("effort");
    expect(plain).not.toHaveProperty("delegateCoding");
    bridge({ effort: "bogus", delegateCoding: "x" });
    const odd = await client.sendTurn(U, { thread: "T" });
    expect(odd).not.toHaveProperty("effort");
    expect(odd).not.toHaveProperty("delegateCoding");
  });

  it("a hand-off's nested turn does not carry them (the bridge gives it the parent's)", async () => {
    const bodies: Record<string, unknown>[] = [];
    let turns = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === CONTEXT_URL) return json(200, { system: "S", tools: [] });
      if (url === `${BRIDGE}/v1/turn`) {
        bodies.push(JSON.parse(String(init.body)));
        turns += 1;
        if (turns === 1) return sse([["start", { ok: true, turnId: "t1" }], ["tool_request", { id: "c1", name: "run_named_role", arguments: "{}" }], ["message", { role: "assistant", content: "done", model: "m" }]]);
        return sse([["start", { ok: true, turnId: "t2" }], ["message", { role: "assistant", content: "nested", model: "m" }]]);
      }
      if (url === `${PLATFORM}/base/ai/claude-code/tool`) return json(200, { hop: { id: "h1", via: "x", role: "R", task: "do it", system: "S", tools: [], answer: { role: "R" } } });
      if (url === `${BRIDGE}/v1/tool-result`) return json(200, { ok: true });
      return json(200, {});
    });
    await client.sendTurn(U, { thread: "T", model: "opus", effort: "high" });
    expect(bodies[0]).toMatchObject({ model: "opus", effort: "high" });
    expect(bodies).toHaveLength(2);
    for (const k of ["model", "effort", "delegateCoding"]) expect(bodies[1]).not.toHaveProperty(k);
  });
});

describe("bridgeInfo options", () => {
  it("exposes options when the bridge sends them, and leaves the key out when it does not", async () => {
    const options = { models: ["opus", "sonnet", "haiku", "fable"], efforts: ["low", "medium", "high", "xhigh", "max"], delegateCoding: true };
    fetchMock.mockResolvedValueOnce(json(200, { bridge: "gilb-claude-code-bridge", build: "0.3.5", codeTurns: true, workspace: true, codeMode: "full", access: "folder", options }));
    expect(await client.bridgeInfo()).toEqual({ reachable: true, build: "0.3.5", codeTurns: true, workspace: true, codeMode: "full", access: "folder", options });
    fetchMock.mockResolvedValueOnce(json(200, { bridge: "gilb-claude-code-bridge", build: "0.3.4" }));
    expect(await client.bridgeInfo()).not.toHaveProperty("options");
    fetchMock.mockResolvedValueOnce(json(200, { bridge: "gilb-claude-code-bridge", options: { models: "opus" } }));
    expect(await client.bridgeInfo()).not.toHaveProperty("options");
    fetchMock.mockResolvedValueOnce(json(200, { bridge: "gilb-claude-code-bridge", options: { models: ["opus", 3], efforts: ["low"] } }));
    expect(await client.bridgeInfo()).toMatchObject({ options: { models: ["opus"], efforts: ["low"], delegateCoding: false } });
  });
});
