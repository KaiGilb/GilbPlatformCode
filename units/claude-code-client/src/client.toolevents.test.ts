// Client 0.3.3: the `tool_start` and `tool` events carry the call's args, answer, callId and (for a hand-off) role,
// to the page's onEvent only. Nothing new goes to the bridge.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClaudeCodeClient, TOOL_ANSWER_EVENT_CAP, type ClaudeCodeStreamEvent } from "./client";

const PLATFORM = "https://platform.example.test";
const CONTEXT_URL = `${PLATFORM}/base/ai/claude-code/context`;
const TOOL_URL = `${PLATFORM}/base/ai/claude-code/tool`;
const BRIDGE = "http://127.0.0.1:47821";
const CONTEXT = { system: "You are the agent.", tools: [] };

let fetchMock: ReturnType<typeof vi.fn>;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sse = (events: [string, unknown][]) =>
  new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
const ANSWER: [string, unknown] = ["message", { role: "assistant", content: "done", model: "m" }];
const MSGS = [{ role: "user" as const, content: "hi" }];

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

function mkClient() {
  const c = createClaudeCodeClient({ principal: "p", platformOrigin: PLATFORM, bridgeUrl: BRIDGE, getAuthHeaders: () => ({}) });
  c.save("s3cret");
  return c;
}

/** Runs one own-turn tool call whose platform answer text is `platformResult`. Returns the events and every bridge-bound request body. */
async function ownTurn(platformResult: string, argsText = '{"a":1,"b":[2]}') {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === CONTEXT_URL) return json(200, CONTEXT);
    if (url === `${BRIDGE}/v1/turn`) return sse([["start", { ok: true, turnId: "t1" }], ["tool_request", { id: "c1", name: "read_record", arguments: argsText }], ANSWER]);
    if (url === TOOL_URL) return json(200, { result: platformResult });
    return json(200, { ok: true });
  });
  const events: ClaudeCodeStreamEvent[] = [];
  await mkClient().sendTurn(MSGS, { thread: "T", onEvent: (e) => events.push(e) });
  return events;
}
const bridgeBodies = () =>
  fetchMock.mock.calls.filter(([u]) => String(u).startsWith(BRIDGE)).map(([u, init]) => [String(u), String((init as RequestInit | undefined)?.body ?? "")]);

describe("tool events carry args and answer (0.3.3)", () => {
  it("own turn: tool_start has args and callId; tool has args, answer, callId; no hop, no role", async () => {
    const events = await ownTurn(JSON.stringify({ id: "r1", title: "T" }));
    const start = events.find((e) => e.event === "tool_start")!;
    const end = events.find((e) => e.event === "tool")!;
    expect(start).toEqual({ event: "tool_start", data: { name: "read_record", at: expect.any(String), callId: "c1", args: { a: 1, b: [2] } } });
    expect(end).toEqual({ event: "tool", data: { name: "read_record", ok: true, callId: "c1", args: { a: 1, b: [2] }, answer: { id: "r1", title: "T" } } });
    expect(end).not.toHaveProperty("hop");
  });

  it("a non-JSON answer is passed as its text; non-JSON args as their text", async () => {
    const events = await ownTurn("plain words", "not json");
    const end = events.find((e) => e.event === "tool")!;
    expect((end.data as { answer: unknown }).answer).toBe("plain words");
    expect((end.data as { args: unknown }).args).toBe("not json");
  });

  it("an answer over 256 KB is dropped: answer undefined, answerTruncated true; at the cap it is kept", async () => {
    const big = await ownTurn(JSON.stringify({ x: "y".repeat(TOOL_ANSWER_EVENT_CAP) }));
    const bigEnd = big.find((e) => e.event === "tool")!.data as Record<string, unknown>;
    expect(bigEnd.answer).toBeUndefined();
    expect(bigEnd.answerTruncated).toBe(true);
    expect(bigEnd.ok).toBe(true);
    fetchMock.mockReset();
    const exact = "z".repeat(TOOL_ANSWER_EVENT_CAP);
    const ok = await ownTurn(exact);
    const okEnd = ok.find((e) => e.event === "tool")!.data as Record<string, unknown>;
    expect(okEnd.answer).toBe(exact);
    expect(okEnd).not.toHaveProperty("answerTruncated");
  });

  it("a hand-off's nested calls carry hop: true, the role, args, answer and their own callId; the asking call is an own-turn call", async () => {
    let turns = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === CONTEXT_URL) return json(200, CONTEXT);
      if (url === `${BRIDGE}/v1/turn`) {
        turns += 1;
        if (turns === 1) return sse([["start", { ok: true, turnId: "t1" }], ["tool_request", { id: "c1", name: "run_named_role", arguments: '{"role":"R"}' }], ANSWER]);
        return sse([["start", { ok: true, turnId: "t2" }], ["tool_request", { id: "n1", name: "read_record", arguments: '{"id":"x"}' }], ["message", { role: "assistant", content: "nested", model: "m" }]]);
      }
      if (url === TOOL_URL) {
        const b = JSON.parse(String(init.body)) as { hop?: unknown };
        if (!b.hop) return json(200, { hop: { id: "h1", via: "x", role: "Agent.R", task: "do it", system: "S", tools: [], answer: { role: "R" } } });
        return json(200, { result: JSON.stringify({ rec: 7 }) });
      }
      return json(200, { ok: true });
    });
    const events: ClaudeCodeStreamEvent[] = [];
    await mkClient().sendTurn(MSGS, { thread: "T", onEvent: (e) => events.push(e) });
    const hopStart = events.find((e) => e.event === "tool_start" && (e as { hop?: boolean }).hop)!;
    const hopEnd = events.find((e) => e.event === "tool" && (e as { hop?: boolean }).hop)!;
    expect(hopStart).toEqual({ event: "tool_start", data: { name: "read_record", at: expect.any(String), callId: "n1", args: { id: "x" }, role: "Agent.R" }, hop: true });
    expect(hopEnd).toEqual({ event: "tool", data: { name: "read_record", ok: true, callId: "n1", args: { id: "x" }, answer: { rec: 7 }, role: "Agent.R" }, hop: true });
    const own = events.find((e) => e.event === "tool" && !(e as { hop?: boolean }).hop)!;
    expect((own.data as { callId: string; args: unknown; answer: unknown })).toMatchObject({ callId: "c1", args: { role: "R" }, answer: { role: "R", content: "nested" } });
    expect(own.data).not.toHaveProperty("role");
  });

  it("nothing new goes to the bridge: the tool-result body is only { id, result } as before", async () => {
    await ownTurn(JSON.stringify({ id: "r1" }));
    const posts = bridgeBodies().filter(([u]) => (u ?? "").endsWith("/v1/tool-result"));
    expect(posts).toHaveLength(1);
    const body = JSON.parse(posts[0]![1] ?? "") as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["id", "isError", "result", "turnId"]);
    expect(body.result).toBe(JSON.stringify({ id: "r1" }));
    for (const [, b] of bridgeBodies()) expect(b).not.toContain("answerTruncated");
    // The platform request is unchanged too: name and arguments text as the bridge sent them.
    const platformCall = fetchMock.mock.calls.find(([u]) => u === TOOL_URL)!;
    expect(JSON.parse(String((platformCall[1] as RequestInit).body))).toMatchObject({ name: "read_record", arguments: '{"a":1,"b":[2]}' });
  });
});
