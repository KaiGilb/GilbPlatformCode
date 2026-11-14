// Client 0.3.2: the page can stop a turn (signal), learn about running turns (listTurns / cancelTurn), is told when a turn starts,
// sees the bridge's keepalive and each tool call as it begins, and gets BridgeTurnRunningError for a code turn already running.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BridgeTurnRunningError, ClaudeCodeBridgeError, createClaudeCodeClient, type ClaudeCodeStreamEvent } from "./client";

const PLATFORM = "https://platform.example.test";
const CONTEXT_URL = `${PLATFORM}/base/ai/claude-code/context`;
const TOOL_URL = `${PLATFORM}/base/ai/claude-code/tool`;
const BRIDGE = "http://127.0.0.1:47821";
const CONTEXT = { system: "You are the agent.", tools: [] };

let client = mk();
let fetchMock: ReturnType<typeof vi.fn>;
function mk() {
  return createClaudeCodeClient({ principal: "p", platformOrigin: PLATFORM, bridgeUrl: BRIDGE, getAuthHeaders: () => ({}) });
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sseText = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
const sse = (events: [string, unknown][]) => new Response(sseText(events), { status: 200, headers: { "content-type": "text/event-stream" } });
const ANSWER: [string, unknown] = ["message", { role: "assistant", content: "done", model: "m" }];
const STARTED = { turnId: "t1", startedAt: "2026-11-14T10:00:00.000Z", mode: "code", project: "alpha" };
const MSGS = [{ role: "user" as const, content: "hi" }];

beforeEach(() => {
  client = mk();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  client.save("s3cret");
});
afterEach(() => vi.unstubAllGlobals());

describe("new stream events", () => {
  it("turn_started is passed first, then start; a malformed one is dropped", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === CONTEXT_URL) return json(200, CONTEXT);
      return sse([["turn_started", STARTED], ["start", { ok: true, turnId: "t1" }], ["turn_started", { turnId: 5 }], ANSWER]);
    });
    const events: ClaudeCodeStreamEvent[] = [];
    await client.sendTurn(MSGS, { thread: "T", onEvent: (e) => events.push(e) });
    expect(events.map((e) => e.event)).toEqual(["turn_started", "start"]);
    expect(events[0]).toEqual({ event: "turn_started", data: STARTED });
  });

  it("a heartbeat comes for each bridge keepalive, with an ISO time", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === CONTEXT_URL) return json(200, CONTEXT);
      return new Response(`event: start\ndata: {"ok":true,"turnId":"t1"}\n\n: keepalive\n\n: keepalive\n\n${sseText([ANSWER])}`, { status: 200, headers: { "content-type": "text/event-stream" } });
    });
    const events: ClaudeCodeStreamEvent[] = [];
    await client.sendTurn(MSGS, { thread: "T", onEvent: (e) => events.push(e) });
    const beats = events.filter((e) => e.event === "heartbeat");
    expect(beats).toHaveLength(2);
    expect((beats[0] as { data: { at: string } }).data.at).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
  });

  it("tool_start comes before the platform call returns, then tool; no hop marker on the person's own turn", async () => {
    const order: string[] = [];
    let release: (r: Response) => void = () => {};
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === CONTEXT_URL) return json(200, CONTEXT);
      if (url === `${BRIDGE}/v1/turn`) return sse([["start", { ok: true, turnId: "t1" }], ["tool_request", { id: "c1", name: "list_vaults", arguments: "{}" }], ANSWER]);
      if (url === TOOL_URL) {
        order.push("platform-called");
        return new Promise<Response>((r) => (release = r));
      }
      if (url === `${BRIDGE}/v1/tool-result`) {
        order.push("result-posted");
        return json(200, { ok: true });
      }
      throw new Error(`unexpected ${url} ${String(init?.method)}`);
    });
    const events: ClaudeCodeStreamEvent[] = [];
    const p = client.sendTurn(MSGS, { thread: "T", onEvent: (e) => { events.push(e); order.push(e.event); } });
    await vi.waitFor(() => expect(order).toContain("platform-called"));
    expect(order).toContain("tool_start");
    expect(order).not.toContain("tool");
    release(json(200, { result: "{}" }));
    await p;
    const start = events.find((e) => e.event === "tool_start")!;
    expect(start).toEqual({ event: "tool_start", data: { name: "list_vaults", at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/), callId: "c1", args: {} } });
    expect(events.find((e) => e.event === "tool")).toEqual({ event: "tool", data: { name: "list_vaults", ok: true, callId: "c1", args: {}, answer: {} } });
  });

  it("a hand-off's tool calls and activity carry hop: true; the person's own are unchanged", async () => {
    let turns = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === CONTEXT_URL) return json(200, CONTEXT);
      if (url === `${BRIDGE}/v1/turn`) {
        turns += 1;
        if (turns === 1) return sse([["start", { ok: true, turnId: "t1" }], ["tool_request", { id: "c1", name: "run_named_role", arguments: "{}" }], ANSWER]);
        return sse([
          ["start", { ok: true, turnId: "t2" }],
          ["activity", { tool: "Read", summary: "a.txt" }],
          ["tool_error", { tool: "Bash", summary: "ls", text: "denied" }],
          ["tool_request", { id: "n1", name: "read_record", arguments: "{}" }],
          ["message", { role: "assistant", content: "nested", model: "m" }],
        ]);
      }
      if (url === TOOL_URL) {
        const b = JSON.parse(String(init.body)) as { hop?: { id: string; done?: boolean } };
        if (!b.hop) return json(200, { hop: { id: "h1", via: "x", role: "R", task: "do it", system: "S", tools: [], answer: { role: "R" } } });
        return json(200, { result: "{}" });
      }
      return json(200, { ok: true });
    });
    const events: ClaudeCodeStreamEvent[] = [];
    await client.sendTurn(MSGS, { thread: "T", onEvent: (e) => events.push(e) });
    const hop = events.filter((e) => (e as { hop?: boolean }).hop === true).map((e) => `${e.event}:${(e.data as { name?: string; tool?: string }).name ?? (e.data as { tool?: string }).tool}`);
    expect(hop).toEqual(["code_activity:Read", "code_tool_error:Bash", "tool_start:read_record", "tool:read_record"]);
    const own = events.filter((e) => e.event === "tool" || e.event === "tool_start").filter((e) => !(e as { hop?: boolean }).hop).map((e) => `${e.event}:${(e.data as { name: string }).name}`);
    expect(own).toEqual(["tool_start:run_named_role", "tool:run_named_role"]);
    expect(events.find((e) => e.event === "tool" && (e.data as { name: string }).name === "run_named_role")).not.toHaveProperty("hop");
  });
});

describe("sendTurn signal", () => {
  it("aborting closes the stream to the bridge and rejects with 'The turn was stopped.'", async () => {
    let streamSignal: AbortSignal | undefined;
    let cancelled = false;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === CONTEXT_URL) return json(200, CONTEXT);
      streamSignal = init.signal ?? undefined;
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode(sseText([["start", { ok: true, turnId: "t1" }]])));
        },
        cancel() {
          cancelled = true;
        },
      });
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    });
    const ctl = new AbortController();
    const events: string[] = [];
    const p = client.sendTurn(MSGS, { thread: "T", signal: ctl.signal, onEvent: (e) => events.push(e.event) });
    const assertion = expect(p).rejects.toMatchObject({ name: "ClaudeCodeBridgeError", status: 499, message: "The turn was stopped." });
    await vi.waitFor(() => expect(events).toContain("start"));
    ctl.abort();
    await assertion;
    expect(streamSignal?.aborted).toBe(true);
    expect(cancelled).toBe(true);
  });

  it("an already-aborted signal never reaches the bridge", async () => {
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return json(200, CONTEXT);
    });
    const ctl = new AbortController();
    ctl.abort();
    await expect(client.sendTurn(MSGS, { thread: "T", signal: ctl.signal })).rejects.toMatchObject({ status: 499 });
    expect(fetchMock.mock.calls.some((c) => String(c[0]).startsWith(BRIDGE))).toBe(false);
  });

  it("a turn without a signal is unchanged, and a late abort after the answer changes nothing", async () => {
    fetchMock.mockImplementation(async (url: string) => (url === CONTEXT_URL ? json(200, CONTEXT) : sse([["start", { ok: true, turnId: "t1" }], ANSWER])));
    const ctl = new AbortController();
    const reply = await client.sendTurn(MSGS, { thread: "T", signal: ctl.signal });
    expect(reply.content).toBe("done");
    ctl.abort();
  });
});

describe("BridgeTurnRunningError", () => {
  const body = { error: "A code turn is already running in alpha.", code: "CodeTurnRunning", project: "alpha", turnId: "t9", startedAt: "2026-11-14T10:00:00.000Z" };
  it("a 429 with code CodeTurnRunning throws it, with the bridge's text and fields", async () => {
    fetchMock.mockImplementation(async (url: string) => (url === CONTEXT_URL ? json(200, CONTEXT) : json(429, body)));
    const err = await client.sendTurn(MSGS, { thread: "T", mode: "code", project: "alpha" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeTurnRunningError);
    expect(err).toBeInstanceOf(ClaudeCodeBridgeError);
    expect(err).toMatchObject({ name: "BridgeTurnRunningError", code: "CodeTurnRunning", project: "alpha", turnId: "t9", startedAt: body.startedAt, status: 429, message: body.error });
  });
  it("project null is kept; other 429s (TooManyTurns, no code) stay a plain ClaudeCodeBridgeError", async () => {
    fetchMock.mockImplementation(async (url: string) => (url === CONTEXT_URL ? json(200, CONTEXT) : json(429, { ...body, project: null })));
    expect(await client.sendTurn(MSGS, { thread: "T" }).catch((e: unknown) => e)).toMatchObject({ project: null });
    for (const b of [{ error: "Too many turns at once.", code: "TooManyTurns" }, { error: "Too many turns at once." }]) {
      fetchMock.mockImplementation(async (url: string) => (url === CONTEXT_URL ? json(200, CONTEXT) : json(429, b)));
      const err = await client.sendTurn(MSGS, { thread: "T" }).catch((e: unknown) => e);
      expect(err).not.toBeInstanceOf(BridgeTurnRunningError);
      expect(err).toMatchObject({ name: "ClaudeCodeBridgeError", status: 429, message: "Too many turns at once." });
    }
  });
});

const ROW = { turnId: "t1", mode: "code", project: "alpha", startedAt: "2026-11-14T10:00:00.000Z", lastActivityAt: "2026-11-14T10:00:05.000Z", lastActivity: "a.txt", toolCalls: 2, handoffs: 1 };

describe("listTurns / cancelTurn (direct)", () => {
  it("listTurns posts with the secret and returns the rows; bad rows are dropped", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { turns: [ROW, { turnId: "" }, null, { ...ROW, turnId: "t2", mode: "chat", project: null }] }));
    const turns = await client.listTurns();
    expect(turns.map((t) => t.turnId)).toEqual(["t1", "t2"]);
    expect(turns[0]).toEqual(ROW);
    expect(turns[1]).toMatchObject({ mode: "chat", project: null });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BRIDGE}/v1/turns`);
    expect((init.headers as Record<string, string>)["x-bridge-secret"]).toBe("s3cret");
  });
  it("404 (an older bridge) -> [] and false; never throws for it", async () => {
    fetchMock.mockResolvedValue(json(404, { error: "not found" }));
    expect(await client.listTurns()).toEqual([]);
    expect(await client.cancelTurn("t1")).toBe(false);
  });
  it("cancelTurn posts the id and returns the bridge's answer", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { cancelled: true }));
    expect(await client.cancelTurn("t1")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BRIDGE}/v1/turn/cancel`);
    expect(JSON.parse(String(init.body))).toEqual({ turnId: "t1" });
    fetchMock.mockResolvedValueOnce(json(200, { cancelled: false }));
    expect(await client.cancelTurn("t1")).toBe(false);
  });
  it("401 throws; not connected throws", async () => {
    fetchMock.mockResolvedValue(json(401, { error: "Pair first." }));
    await expect(client.listTurns()).rejects.toMatchObject({ status: 401 });
    await expect(client.cancelTurn("t1")).rejects.toMatchObject({ status: 401 });
    client.disconnect();
    await expect(client.listTurns()).rejects.toMatchObject({ status: 401 });
  });
});

describe("listTurns / cancelTurn (through the relay) and pagehide", () => {
  const WIN_ORIGIN = BRIDGE;
  function relayed() {
    const win = { closed: false, postMessage: vi.fn(), focus: vi.fn(), close: vi.fn() };
    (window as unknown as { open: unknown }).open = vi.fn(() => win);
    const deliver = (data: unknown) => {
      const ev = new Event("message");
      Object.defineProperties(ev, { data: { value: data }, source: { value: win }, origin: { value: WIN_ORIGIN } });
      window.dispatchEvent(ev);
    };
    const last = () => {
      const c = win.postMessage.mock.calls.filter((x) => (x[0] as { type: string }).type === "gilb-bridge-req");
      return c[c.length - 1]![0] as { id: string; path: string; body?: string; headers: Record<string, string> };
    };
    const answer = async (status: number, body: unknown) => {
      for (let i = 0; i < 1000 && win.postMessage.mock.calls.length === 0; i++) await new Promise((r) => setImmediate(r));
      const r = last();
      deliver({ type: "gilb-bridge-head", id: r.id, status, contentType: "application/json" });
      deliver({ type: "gilb-bridge-res", id: r.id, status, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return r;
    };
    return { win, deliver, answer };
  }
  it("go through the window, never direct, and 404 is [] / false there too", async () => {
    const { win, deliver, answer } = relayed();
    const open = client.openRelay();
    deliver({ type: "gilb-bridge-ready", build: "0.3.2" });
    expect(await open).toBe(true);
    const p = client.listTurns();
    const r = await answer(200, { turns: [ROW] });
    expect(r.path).toBe("/v1/turns");
    expect(r.headers["x-bridge-secret"]).toBe("s3cret");
    expect(await p).toEqual([ROW]);
    win.postMessage.mockClear();
    const c = client.cancelTurn("t1");
    const r2 = await answer(200, { cancelled: true });
    expect(r2.path).toBe("/v1/turn/cancel");
    expect(JSON.parse(r2.body!)).toEqual({ turnId: "t1" });
    expect(await c).toBe(true);
    win.postMessage.mockClear();
    const l = client.listTurns();
    await answer(404, { error: "not found" });
    expect(await l).toEqual([]);
    const c2 = client.cancelTurn("t1");
    await answer(404, { error: "not found" });
    expect(await c2).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    client.closeRelay();
  });
  it("pagehide posts gilb-bridge-bye to the open window, and not after it is closed", async () => {
    const { win, deliver } = relayed();
    const open = client.openRelay();
    deliver({ type: "gilb-bridge-ready", build: "0.3.2" });
    await open;
    window.dispatchEvent(new Event("pagehide"));
    expect(win.postMessage).toHaveBeenCalledWith({ type: "gilb-bridge-bye" }, BRIDGE);
    client.closeRelay();
    win.postMessage.mockClear();
    window.dispatchEvent(new Event("pagehide"));
    expect(win.postMessage).not.toHaveBeenCalled();
  });
  it("aborting a turn through the relay posts gilb-bridge-abort", async () => {
    const { win, deliver } = relayed();
    const open = client.openRelay();
    deliver({ type: "gilb-bridge-ready", build: "0.3.2" });
    await open;
    fetchMock.mockImplementation(async () => json(200, CONTEXT));
    const ctl = new AbortController();
    const p = client.sendTurn(MSGS, { thread: "T", signal: ctl.signal }).catch((e: unknown) => e);
    for (let i = 0; i < 1000 && !win.postMessage.mock.calls.some((c) => (c[0] as { type: string }).type === "gilb-bridge-req"); i++) await new Promise((r) => setImmediate(r));
    ctl.abort();
    expect(await p).toMatchObject({ status: 499 });
    expect(win.postMessage.mock.calls.some((c) => (c[0] as { type: string }).type === "gilb-bridge-abort")).toBe(true);
    client.closeRelay();
  });
});
