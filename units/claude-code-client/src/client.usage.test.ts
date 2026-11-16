// Client 0.3.7: the reply carries `usage` from the bridge's message when it is well-formed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClaudeCodeClient, type TurnUsage } from "./client";

const PLATFORM = "https://platform.example.test";
const BRIDGE = "http://127.0.0.1:47821";
const PRINCIPAL = "https://pelleparafin.example.test/base";
const CONTEXT = { system: "You are the agent.", tools: [] as unknown[] };
const BASE_MSG = { role: "assistant", content: "Done.", model: "fake-model", sessionId: "11111111-2222-4333-8444-555555555555" };
const GOOD: TurnUsage = {
  model: "fake-model",
  contextWindow: 1000000,
  inputTokens: 1200,
  outputTokens: 340,
  cacheReadInputTokens: 50000,
  cacheCreationInputTokens: 2000,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function sse(events: [string, unknown][]): Response {
  const text = events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
  return new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function replyFor(message: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === `${PLATFORM}/base/ai/claude-code/context`) return json(200, CONTEXT);
    if (url === `${BRIDGE}/v1/turn`) return sse([["start", { ok: true, turnId: "t1" }], ["message", message]]);
    throw new Error(`unexpected ${url}`);
  });
  const client = createClaudeCodeClient({
    principal: PRINCIPAL,
    platformOrigin: PLATFORM,
    bridgeUrl: BRIDGE,
    getAuthHeaders: async () => ({ authorization: "DPoP tok" }),
  });
  client.save("s3cret");
  return client.sendTurn([{ role: "user", content: "hi" }], { thread: "T" });
}

describe("turn usage", () => {
  it("passes a well-formed usage through, and no other field of it", async () => {
    const reply = await replyFor({ ...BASE_MSG, usage: { ...GOOD, costUSD: 1.25, serverToolUse: { webSearchRequests: 1 } } });
    expect(reply).toEqual({ role: "assistant", content: "Done.", model: "fake-model", payer: "person-claude-code", usage: GOOD });
    expect(JSON.stringify(reply)).not.toMatch(/costUSD|serverToolUse|input_tokens/);
  });

  it("drops invalid counts and keeps the valid ones", async () => {
    const reply = await replyFor({
      ...BASE_MSG,
      usage: {
        model: "fake-model",
        contextWindow: 1000000,
        inputTokens: "1200",
        outputTokens: -5,
        cacheReadInputTokens: 1_000_000_001,
        cacheCreationInputTokens: 2000,
        costUSD: 9,
      },
    });
    expect(reply.usage).toEqual({ model: "fake-model", contextWindow: 1000000, cacheCreationInputTokens: 2000 });
    expect(reply.usage).not.toHaveProperty("inputTokens");
    expect(reply.usage).not.toHaveProperty("outputTokens");
    expect(reply.usage).not.toHaveProperty("cacheReadInputTokens");
  });

  it("keeps a count of 0 and of 1e9, and drops one that is not a whole number", async () => {
    const reply = await replyFor({ ...BASE_MSG, usage: { model: "m", contextWindow: 1_000_000_000, inputTokens: 0, outputTokens: 1.5 } });
    expect(reply.usage).toEqual({ model: "m", contextWindow: 1_000_000_000, inputTokens: 0 });
  });

  it("leaves usage off when the context window or the model is not valid, and when usage is absent", async () => {
    const bad = [
      { model: "fake-model", contextWindow: "1000000", inputTokens: 1 },
      { model: "fake-model", contextWindow: -1, inputTokens: 1 },
      { model: "fake-model", contextWindow: 1_000_000_001, inputTokens: 1 },
      { model: "fake-model", contextWindow: 1.5, inputTokens: 1 },
      { model: "fake-model", inputTokens: 1200 },
      { contextWindow: 1000000, inputTokens: 1 },
      { model: 5, contextWindow: 1000000 },
      null,
      "x",
      [],
    ];
    for (const usage of bad) {
      const reply = await replyFor({ ...BASE_MSG, usage: usage as never });
      expect(reply, JSON.stringify(usage)).not.toHaveProperty("usage");
      expect(reply.content, JSON.stringify(usage)).toBe("Done.");
    }
    const absent = await replyFor(BASE_MSG);
    expect(absent).toEqual({ role: "assistant", content: "Done.", model: "fake-model", payer: "person-claude-code" });
    expect(absent).not.toHaveProperty("usage");
  });
});
