import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createClaudeCodeClient,
  SLIPPED_LEAD,
  slippedSuffix,
  type ClaudeCodeClientConfig,
  type ClaudeCodeStreamEvent,
  type SlippedMessage,
} from "./client";

const PLATFORM = "https://platform.example.test";
const AI_CLAUDE_CODE_CONTEXT_URL = `${PLATFORM}/base/ai/claude-code/context`;
const AI_CLAUDE_CODE_TOOL_URL = `${PLATFORM}/base/ai/claude-code/tool`;
const CLAUDE_CODE_BRIDGE_URL = "http://127.0.0.1:47821";
const PRINCIPAL = "https://pelleparafin.example.test/base";

const getAuthHeaders = vi.fn(async () => ({ authorization: "DPoP tok", dpop: "proof-1" }));

function mk(over: Partial<ClaudeCodeClientConfig> = {}) {
  return createClaudeCodeClient({
    principal: PRINCIPAL,
    platformOrigin: PLATFORM,
    bridgeUrl: CLAUDE_CODE_BRIDGE_URL,
    getAuthHeaders,
    ...over,
  });
}

const CONTEXT = {
  system: "You are the agent.",
  tools: [{ name: "list_vaults", description: "d", inputSchema: { type: "object", properties: {} } }],
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function sse(events: [string, unknown][]): Response {
  const text = events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
  return new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });
}

let client = mk();
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  client = mk();
  getAuthHeaders.mockClear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("slippedSuffix", () => {
  it("is a blank line, the lead, a blank line, and the texts joined by a blank line", () => {
    expect(SLIPPED_LEAD).toBe(
      "The person wrote this while you were working. Read it now and take it into account before your next step:",
    );
    const msgs: SlippedMessage[] = [
      { id: "a", text: "use blue" },
      { id: "b", text: "and green" },
    ];
    expect(slippedSuffix(msgs)).toBe("\n\n" + SLIPPED_LEAD + "\n\n" + "use blue\n\nand green");
  });
});

describe("slipping a message into a running turn", () => {
  const enc = new TextEncoder();

  function liveStream() {
    let ctl!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        ctl = c;
      },
    });
    return {
      res: () => new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
      emit: (event: string, data: unknown) => ctl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)),
      end: () => ctl.close(),
    };
  }
  const tick = async (n = 20) => {
    for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
  };

  interface Posted {
    id: string;
    turnId: string;
    result: string;
    isError: boolean;
    raw: string;
  }

  function rig(toolAnswer: (name: string, init: RequestInit) => Promise<Response>) {
    const live = liveStream();
    const results: Posted[] = [];
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (url === AI_CLAUDE_CODE_CONTEXT_URL) return json(200, CONTEXT);
      if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/turn`) return live.res();
      if (url === AI_CLAUDE_CODE_TOOL_URL) return toolAnswer(String(body.name), init);
      if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/tool-result`) {
        const parsed = JSON.parse(String(init.body)) as Omit<Posted, "raw">;
        results.push({ ...parsed, raw: String(init.body) });
        return json(200, { ok: true });
      }
      throw new Error(`unexpected ${url}`);
    });
    return { live, results };
  }

  it("puts the slip on the first top-level tool answer and not the next", async () => {
    client.save("s3cret");
    const queues: SlippedMessage[][] = [[{ id: "a", text: "use blue" }], []];
    const takeSlipped = vi.fn(() => queues.shift() ?? []);
    const events: ClaudeCodeStreamEvent[] = [];
    const r = rig(async (name) => json(200, { result: JSON.stringify({ ran: name }) }));
    const done = client.sendTurn([{ role: "user", content: "x" }], {
      thread: "J",
      takeSlipped,
      onEvent: (ev) => events.push(ev),
    });
    await tick();
    r.live.emit("start", { turnId: "t1" });
    r.live.emit("tool_request", { id: "c1", name: "paint", arguments: "{}" });
    await tick();
    const first = JSON.stringify({ ran: "paint" });
    const suffix = slippedSuffix([{ id: "a", text: "use blue" }]);
    expect(r.results[0]).toMatchObject({ turnId: "t1", id: "c1", result: first + suffix, isError: false });
    expect(r.results[0]!.raw).toBe(JSON.stringify({ turnId: "t1", id: "c1", result: first + suffix, isError: false }));

    r.live.emit("tool_request", { id: "c2", name: "list_vaults", arguments: "{}" });
    await tick();
    const second = JSON.stringify({ ran: "list_vaults" });
    expect(r.results[1]).toMatchObject({ turnId: "t1", id: "c2", result: second, isError: false });
    expect(r.results[1]!.result).not.toContain(SLIPPED_LEAD);
    expect(takeSlipped).toHaveBeenCalledTimes(2);
    expect(events.filter((e) => e.event === "slipped")).toEqual([{ event: "slipped", data: { ids: ["a"] } }]);
    expect(events.filter((e) => e.event === "tool")).toMatchObject([
      { event: "tool", data: { name: "paint", ok: true } },
      { event: "tool", data: { name: "list_vaults", ok: true } },
    ]);

    r.live.emit("message", { content: "done", model: "m" });
    r.live.end();
    expect((await done).content).toBe("done");
  });

  it("a hand-off's nested tool never calls takeSlipped and its answer has no suffix", async () => {
    client.save("s3cret");
    const HOP = {
      id: "0123456789abcdef01234567",
      via: "run_named_role",
      role: "Agent.Outcome",
      task: "write the thing",
      system: "You are the agent. HOP",
      tools: [{ name: "read_record", description: "d", inputSchema: { type: "object", properties: {} } }],
      answer: { role: "Agent.Outcome", procedures: ["Agent.Outcome"], standingOutcome: "loaded" },
    };
    const takeSlipped = vi.fn((): readonly SlippedMessage[] => [{ id: "a", text: "use blue" }]);
    const callsAtNested: number[] = [];
    const results: { id: string; result: string; isError: boolean }[] = [];
    let turns = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (url === AI_CLAUDE_CODE_CONTEXT_URL) return json(200, CONTEXT);
      if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/turn`) {
        turns += 1;
        if (turns === 1) {
          return sse([
            ["start", { ok: true, turnId: "t1" }],
            ["tool_request", { id: "c1", name: "run_named_role", arguments: "{}" }],
            ["message", { role: "assistant", content: "The Agent wrote it.", model: "m" }],
          ]);
        }
        return sse([
          ["start", { ok: true, turnId: "t2" }],
          ["tool_request", { id: "n1", name: "read_record", arguments: "{}" }],
          ["message", { role: "assistant", content: "Done: it is written.", model: "m" }],
        ]);
      }
      if (url === AI_CLAUDE_CODE_TOOL_URL) {
        if (body.name === "run_named_role") return json(200, { hop: HOP });
        return json(200, { result: JSON.stringify({ ran: body.name }) });
      }
      if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/tool-result`) {
        const parsed = JSON.parse(String(init.body)) as { id: string; result: string; isError: boolean };
        if (parsed.id === "n1") callsAtNested.push(takeSlipped.mock.calls.length);
        results.push(parsed);
        return json(200, { ok: true });
      }
      throw new Error(`unexpected ${url}`);
    });
    await client.sendTurn([{ role: "user", content: "have Outcome write it" }], { thread: "J", takeSlipped });
    expect(callsAtNested).toEqual([0]);
    const nested = results.find((r) => r.id === "n1")!;
    expect(nested).toMatchObject({ result: JSON.stringify({ ran: "read_record" }), isError: false });
    expect(nested.result).not.toContain(SLIPPED_LEAD);
    // The asking tool is top-level, so the slip rides on its answer, after the nested turn has posted.
    expect(takeSlipped).toHaveBeenCalledTimes(1);
    const asking = results.find((r) => r.id === "c1")!;
    expect(asking.isError).toBe(false);
    expect(asking.result.endsWith(slippedSuffix([{ id: "a", text: "use blue" }]))).toBe(true);
  });

  it("without takeSlipped every tool answer body is the platform result alone", async () => {
    client.save("s3cret");
    const events: ClaudeCodeStreamEvent[] = [];
    const r = rig(async (name) => json(200, { result: JSON.stringify({ ran: name }) }));
    const done = client.sendTurn([{ role: "user", content: "x" }], {
      thread: "J",
      onEvent: (ev) => events.push(ev),
    });
    await tick();
    r.live.emit("start", { turnId: "t1" });
    r.live.emit("tool_request", { id: "c1", name: "paint", arguments: "{}" });
    await tick();
    r.live.emit("tool_request", { id: "c2", name: "list_vaults", arguments: "{}" });
    await tick();
    const paint = JSON.stringify({ ran: "paint" });
    const listed = JSON.stringify({ ran: "list_vaults" });
    expect(r.results[0]!.raw).toBe(JSON.stringify({ turnId: "t1", id: "c1", result: paint, isError: false }));
    expect(r.results[1]!.raw).toBe(JSON.stringify({ turnId: "t1", id: "c2", result: listed, isError: false }));
    expect(events.some((e) => e.event === "slipped")).toBe(false);
    r.live.emit("message", { content: "done", model: "m" });
    r.live.end();
    await done;
  });

  it("an error tool answer still carries the slip and stays an error", async () => {
    client.save("s3cret");
    const takeSlipped = vi.fn(() => [{ id: "a", text: "use blue" }]);
    const events: ClaudeCodeStreamEvent[] = [];
    let posted: { turnId: string; id: string; result: string; isError: boolean } | undefined;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === AI_CLAUDE_CODE_CONTEXT_URL) return json(200, CONTEXT);
      if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/turn`) {
        return sse([
          ["start", { turnId: "t1" }],
          ["tool_request", { id: "c1", name: "create_record", arguments: "{}" }],
          ["message", { content: "I could not." }],
        ]);
      }
      if (url === AI_CLAUDE_CODE_TOOL_URL) return json(403, { error: "Forbidden", message: "No write grant." });
      if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/tool-result`) {
        posted = JSON.parse(String(init.body));
        return json(200, {});
      }
      throw new Error(`unexpected ${url}`);
    });
    const reply = await client.sendTurn([{ role: "user", content: "x" }], {
      thread: "J",
      takeSlipped,
      onEvent: (ev) => events.push(ev),
    });
    expect(reply.content).toBe("I could not.");
    const own = JSON.stringify({ error: "No write grant." });
    expect(posted).toEqual({
      turnId: "t1",
      id: "c1",
      result: own + slippedSuffix([{ id: "a", text: "use blue" }]),
      isError: true,
    });
    expect(events.filter((e) => e.event === "tool")).toMatchObject([{ event: "tool", data: { name: "create_record", ok: false } }]);
    expect(events.filter((e) => e.event === "slipped")).toEqual([{ event: "slipped", data: { ids: ["a"] } }]);
  });

  it("does not take a slip when the turn was left before the tool answer is posted", async () => {
    client.save("s3cret");
    const takeSlipped = vi.fn(() => [{ id: "a", text: "use blue" }]);
    const live = liveStream();
    const results: unknown[] = [];
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === AI_CLAUDE_CODE_CONTEXT_URL) return json(200, CONTEXT);
      if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/turn`) return live.res();
      if (url === AI_CLAUDE_CODE_TOOL_URL) {
        return new Promise<Response>((_resolve, reject) => {
          const abort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
          if (init.signal?.aborted) abort();
          else init.signal?.addEventListener("abort", abort, { once: true });
        });
      }
      if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/tool-result`) {
        results.push(JSON.parse(String(init.body)));
        return json(200, { ok: true });
      }
      throw new Error(`unexpected ${url}`);
    });
    const done = client.sendTurn([{ role: "user", content: "x" }], { thread: "J", takeSlipped });
    await tick();
    live.emit("start", { turnId: "t1" });
    live.emit("tool_request", { id: "c1", name: "list_vaults", arguments: "{}" });
    await tick();
    client.disconnect();
    await expect(done).rejects.toMatchObject({ status: 499 });
    expect(takeSlipped).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });
});
