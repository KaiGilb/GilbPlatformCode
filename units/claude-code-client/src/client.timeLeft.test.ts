// Client 0.4.0: the bridge's `time_left` event (bridge 0.4.0) is mapped and passed on to onEvent. MOCK: stand-in bridge streams, no real bridge.
// Only the person's own turn passes it (a hand-off's nested turn drops it), in every mode; only a valid `value` goes on, and only `value`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClaudeCodeClient, isTimeValue, type ClaudeCodeStreamEvent, type TimeValue } from "./index";

const PLATFORM = "https://platform.example.test";
const CONTEXT_URL = `${PLATFORM}/base/ai/claude-code/context`;
const TOOL_URL = `${PLATFORM}/base/ai/claude-code/tool`;
const BRIDGE = "http://127.0.0.1:47821";
const CONTEXT = { system: "You are the agent.", tools: [] };
const ALL: TimeValue[] = ["1 min", "5 min", "10 min", "30 min", "1 hour", "3 hours", "5 hours +"];

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

/** One own turn whose bridge stream is `events` (then the answer). `log` records each time_left and the moment the turn's result came back. */
async function run(events: [string, unknown][], mode?: "code", withHandler = true) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === CONTEXT_URL) return json(200, CONTEXT);
    if (url === `${BRIDGE}/v1/turn`) return sse([["start", { ok: true, turnId: "t1" }], ...events, ANSWER]);
    return json(200, { ok: true });
  });
  const got: ClaudeCodeStreamEvent[] = [];
  const log: string[] = [];
  const reply = await mkClient().sendTurn(MSGS, {
    thread: "T",
    ...(mode ? { mode } : {}),
    ...(withHandler ? { onEvent: (e: ClaudeCodeStreamEvent) => { got.push(e); log.push(e.event); } } : {}),
  });
  log.push("result");
  return { got, log, reply, timeLeft: got.filter((e) => e.event === "time_left") };
}

describe("time_left: passed on", () => {
  it("a chat turn: onEvent gets exactly the event, before the turn's result", async () => {
    const r = await run([["time_left", { value: "30 min" }]]);
    expect(r.timeLeft).toEqual([{ event: "time_left", data: { value: "30 min" } }]);
    expect(r.log.indexOf("time_left")).toBeGreaterThan(-1);
    expect(r.log.indexOf("time_left")).toBeLessThan(r.log.indexOf("result"));
  });

  it("a code turn: the same (the event is not one of the code-only events)", async () => {
    const r = await run([["time_left", { value: "30 min" }]], "code");
    expect(r.timeLeft).toEqual([{ event: "time_left", data: { value: "30 min" } }]);
  });

  it.each(ALL)("the value %s is passed", async (v) => {
    expect(isTimeValue(v)).toBe(true);
    const r = await run([["time_left", { value: v }]]);
    expect(r.timeLeft).toEqual([{ event: "time_left", data: { value: v } }]);
  });

  it("two events give two calls in order (the client does not de-duplicate)", async () => {
    const r = await run([["time_left", { value: "5 min" }], ["time_left", { value: "5 min" }], ["time_left", { value: "1 hour" }]]);
    expect(r.timeLeft.map((e) => (e.data as { value: string }).value)).toEqual(["5 min", "5 min", "1 hour"]);
  });

  it("extra keys are ignored: only { value } is passed, so reply text cannot travel here", async () => {
    const r = await run([["time_left", { value: "5 min", text: "secret reply text", extra: 1 }]]);
    expect(r.timeLeft).toHaveLength(1);
    const e = r.timeLeft[0]!;
    expect(Object.keys(e)).toEqual(["event", "data"]);
    expect(Object.keys(e.data)).toEqual(["value"]);
    expect(JSON.stringify(r.got)).not.toContain("secret reply text");
  });
});

describe("time_left: changes nothing else", () => {
  it("the turn's result is the same with and without the event", async () => {
    const withEv = await run([["time_left", { value: "10 min" }]]);
    const without = await run([]);
    expect(withEv.reply).toEqual(without.reply);
    expect(withEv.reply.content).toBe("done");
  });

  it("a turn with no onEvent given does not throw", async () => {
    const r = await run([["time_left", { value: "10 min" }]], undefined, false);
    expect(r.reply.content).toBe("done");
  });

  it("the other events around it are unchanged (no extra heartbeat, no activity from it)", async () => {
    const r = await run([["time_left", { value: "10 min" }]]);
    expect(r.got.map((e) => e.event)).toEqual(["start", "time_left"]);
  });
});

describe("time_left: malformed is dropped", () => {
  const BAD: [string, unknown][] = [
    ["null data", null],
    ["a number", 5],
    ["a string", "5 min"],
    ["an empty object", {}],
    ["value a number", { value: 5 }],
    ["value toString", { value: "toString" }],
    ["value 5 MIN", { value: "5 MIN" }],
    ["value with a leading space", { value: " 5 min" }],
  ];
  it.each(BAD)("%s: no call, no throw, the turn completes", async (_name, data) => {
    for (const mode of [undefined, "code" as const]) {
      const r = await run([["time_left", data]], mode);
      expect(r.timeLeft).toEqual([]);
      expect(r.reply.content).toBe("done");
    }
  });
});

describe("time_left: a hand-off's nested turn", () => {
  it("is dropped there; the person's own turn still passes its own", async () => {
    let turns = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === CONTEXT_URL) return json(200, CONTEXT);
      if (url === `${BRIDGE}/v1/turn`) {
        turns += 1;
        if (turns === 1) return sse([["start", { ok: true, turnId: "t1" }], ["tool_request", { id: "c1", name: "run_named_role", arguments: '{"role":"R"}' }], ["time_left", { value: "5 min" }], ANSWER]);
        return sse([["start", { ok: true, turnId: "t2" }], ["time_left", { value: "1 min" }], ["time_left", { value: "3 hours" }], ["message", { role: "assistant", content: "nested", model: "m" }]]);
      }
      if (url === TOOL_URL) {
        const b = JSON.parse(String(init.body)) as { hop?: unknown };
        if (!b.hop) return json(200, { hop: { id: "h1", via: "x", role: "Agent.R", task: "do it", system: "S", tools: [], answer: { role: "R" } } });
        return json(200, { result: "{}" });
      }
      return json(200, { ok: true });
    });
    const got: ClaudeCodeStreamEvent[] = [];
    await mkClient().sendTurn(MSGS, { thread: "T", onEvent: (e) => got.push(e) });
    expect(turns).toBe(2); // the nested turn really ran
    expect(got.filter((e) => e.event === "time_left")).toEqual([{ event: "time_left", data: { value: "5 min" } }]);
    expect(got.some((e) => (e as { hop?: boolean }).hop === true && e.event === "time_left")).toBe(false);
  });
});
