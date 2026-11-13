import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClaudeCodeClient, type ClaudeCodeStreamEvent } from "./client";

const PLATFORM = "https://platform.example.test";
const CONTEXT_URL = `${PLATFORM}/base/ai/claude-code/context`;
const BRIDGE = "http://127.0.0.1:47821";
const PRINCIPAL = "https://pelleparafin.example.test/base";
const CONTEXT = { system: "You are the agent.", tools: [] };
const SESSION = "11111111-2222-4333-8444-555555555555";

const getAuthHeaders = vi.fn(async () => ({ authorization: "DPoP tok", dpop: "p" }));
const mk = () => createClaudeCodeClient({ principal: PRINCIPAL, platformOrigin: PLATFORM, bridgeUrl: BRIDGE, getAuthHeaders });
let client = mk();
let fetchMock: ReturnType<typeof vi.fn>;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sse = (events: [string, unknown][]) =>
  new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });

beforeEach(() => {
  client = mk();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

const ANSWER: [string, unknown] = ["message", { role: "assistant", content: "done", model: "m", sessionId: SESSION }];

/** A fake bridge: context from the platform, a turn that streams `events`, and every other call answered by `other`. */
function fakeBridge(events: [string, unknown][], other: (url: string, init: RequestInit) => Response | undefined = () => undefined) {
  const calls: { url: string; init: RequestInit }[] = [];
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url === CONTEXT_URL) return json(200, CONTEXT);
    if (url === `${BRIDGE}/v1/turn`) return sse([["start", { ok: true, turnId: "t1" }], ...events]);
    const r = other(url, init);
    if (r) return r;
    throw new Error(`unexpected ${url}`);
  });
  return calls;
}
const turnBody = (calls: { url: string; init: RequestInit }[]) => JSON.parse(String(calls.find((c) => c.url === `${BRIDGE}/v1/turn`)!.init.body)) as Record<string, unknown>;

describe("bridgeInfo", () => {
  it("reports codeTurns and workspace, false when hello omits them (an older bridge)", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { bridge: "gilb-claude-code-bridge", build: "0.2.0", codeTurns: true, workspace: true }));
    expect(await client.bridgeInfo()).toEqual({ reachable: true, build: "0.2.0", codeTurns: true, workspace: true });
    fetchMock.mockResolvedValueOnce(json(200, { bridge: "gilb-claude-code-bridge", build: "0.1.9" }));
    expect(await client.bridgeInfo()).toEqual({ reachable: true, build: "0.1.9", codeTurns: false, workspace: false });
    fetchMock.mockResolvedValueOnce(json(200, { bridge: "gilb-claude-code-bridge", codeTurns: "yes", workspace: 1 }));
    expect(await client.bridgeInfo()).toMatchObject({ codeTurns: false, workspace: false });
  });
});

describe("workspaceInfo", () => {
  it("posts with the secret and returns name and path", async () => {
    client.save("s3cret");
    fetchMock.mockResolvedValueOnce(json(200, { name: "MyCode", path: "/Users/p/MyCode" }));
    expect(await client.workspaceInfo()).toEqual({ name: "MyCode", path: "/Users/p/MyCode" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BRIDGE}/v1/workspace`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-bridge-secret"]).toBe("s3cret");
  });
  it("is null for a 404 (no code folder), a malformed body, and when not connected; a 401 throws", async () => {
    expect(await client.workspaceInfo()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    client.save("s3cret");
    fetchMock.mockResolvedValueOnce(json(404, { error: "This bridge has no code folder." }));
    expect(await client.workspaceInfo()).toBeNull();
    fetchMock.mockResolvedValueOnce(json(200, { name: 5 }));
    expect(await client.workspaceInfo()).toBeNull();
    fetchMock.mockResolvedValueOnce(json(401, { error: "Pair first." }));
    await expect(client.workspaceInfo()).rejects.toMatchObject({ status: 401 });
  });
});

describe("mode and approval on the turn body", () => {
  it("a chat turn carries neither", async () => {
    client.save("s3cret");
    const calls = fakeBridge([ANSWER]);
    await client.sendTurn([{ role: "user", content: "hi" }], { thread: "T" });
    expect(turnBody(calls)).not.toHaveProperty("mode");
    expect(turnBody(calls)).not.toHaveProperty("approval");
  });
  it("a code turn carries mode code and approval (session by default)", async () => {
    client.save("s3cret");
    let calls = fakeBridge([ANSWER]);
    await client.sendTurn([{ role: "user", content: "hi" }], { thread: "T", mode: "code" });
    expect(turnBody(calls)).toMatchObject({ mode: "code", approval: "session" });
    calls = fakeBridge([ANSWER]);
    await client.sendTurn([{ role: "user", content: "hi" }], { thread: "T", mode: "code", approval: "each-write" });
    expect(turnBody(calls)).toMatchObject({ mode: "code", approval: "each-write" });
  });
  it("a hand-off's nested turn never carries them", async () => {
    client.save("s3cret");
    const bodies: Record<string, unknown>[] = [];
    let turns = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === CONTEXT_URL) return json(200, CONTEXT);
      if (url === `${BRIDGE}/v1/turn`) {
        bodies.push(JSON.parse(String(init.body)));
        turns += 1;
        if (turns === 1) return sse([["start", { ok: true, turnId: "t1" }], ["tool_request", { id: "c1", name: "run_named_role", arguments: "{}" }], ANSWER]);
        return sse([["start", { ok: true, turnId: "t2" }], ["message", { role: "assistant", content: "nested", model: "m" }]]);
      }
      if (url === `${PLATFORM}/base/ai/claude-code/tool`) {
        return json(200, { hop: { id: "h1", via: "x", role: "R", task: "do it", system: "S", tools: [], answer: { role: "R" } } });
      }
      return json(200, { ok: true });
    });
    await client.sendTurn([{ role: "user", content: "hi" }], { thread: "T", mode: "code", approval: "each-write" });
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({ mode: "code", approval: "each-write" });
    expect(bodies[1]).toMatchObject({ parentTurnId: "t1" });
    expect(bodies[1]).not.toHaveProperty("mode");
    expect(bodies[1]).not.toHaveProperty("approval");
  });
});

describe("code stream events", () => {
  it("are passed on, validated; a malformed one is dropped without a throw", async () => {
    client.save("s3cret");
    fakeBridge([
      ["activity", { tool: "Write", summary: "a.txt" }],
      ["activity", { tool: "Write" }],
      ["activity", "nonsense"],
      ["tool_error", { tool: "Bash", summary: "ls /", text: "denied" }],
      ["tool_error", { tool: "Bash", summary: "ls /", text: 5 }],
      ["files_changed", { added: ["a.txt"], changed: [], removed: [], addedCount: 1, changedCount: 0, removedCount: 0, truncated: false }],
      ["files_changed", { added: "a.txt" }],
      ["approval_done", { id: "x", allow: true }],
      ["approval_done", { id: "x", allow: "yes" }],
      ANSWER,
    ]);
    const evs: ClaudeCodeStreamEvent[] = [];
    const reply = await client.sendTurn([{ role: "user", content: "hi" }], { thread: "T", mode: "code", onEvent: (e) => evs.push(e) });
    expect(reply.content).toBe("done");
    expect(evs.filter((e) => e.event !== "start" && e.event !== "standing")).toEqual([
      { event: "code_activity", data: { tool: "Write", summary: "a.txt" } },
      { event: "code_tool_error", data: { tool: "Bash", summary: "ls /", text: "denied" } },
      { event: "files_changed", data: { added: ["a.txt"], changed: [], removed: [], addedCount: 1, changedCount: 0, removedCount: 0, truncated: false } },
      { event: "approval_done", data: { id: "x", allow: true } },
    ]);
  });
});

describe("approvals", () => {
  const REQ: [string, unknown] = ["approval_request", { id: "0123456789abcdef", tool: "Write", summary: "a.txt" }];
  const approvalCalls = (calls: { url: string; init: RequestInit }[]) => calls.filter((c) => c.url === `${BRIDGE}/v1/approval`).map((c) => JSON.parse(String(c.init.body)));
  const ok = (url: string) => (url === `${BRIDGE}/v1/approval` ? json(200, { ok: true }) : undefined);

  it("calls onApproval, emits approval_request and POSTs the answer with the bridge's turn id", async () => {
    client.save("s3cret");
    const calls = fakeBridge([REQ, ANSWER], ok);
    const onApproval = vi.fn(async () => true);
    const evs: ClaudeCodeStreamEvent[] = [];
    await client.sendTurn([{ role: "user", content: "hi" }], { thread: "T", mode: "code", approval: "each-write", onApproval, onEvent: (e) => evs.push(e) });
    expect(onApproval).toHaveBeenCalledWith({ id: "0123456789abcdef", tool: "Write", summary: "a.txt" });
    expect(evs).toContainEqual({ event: "approval_request", data: { id: "0123456789abcdef", tool: "Write", summary: "a.txt" } });
    expect(approvalCalls(calls)).toEqual([{ turnId: "t1", id: "0123456789abcdef", allow: true }]);
    const post = calls.find((c) => c.url === `${BRIDGE}/v1/approval`)!;
    expect((post.init.headers as Record<string, string>)["x-bridge-secret"]).toBe("s3cret");
  });
  it("answers no when there is no onApproval, when it resolves false, and when it throws or rejects", async () => {
    client.save("s3cret");
    for (const onApproval of [undefined, async () => false, async () => { throw new Error("boom"); }, () => { throw new Error("sync boom"); }] as const) {
      const calls = fakeBridge([REQ, ANSWER], ok);
      await client.sendTurn([{ role: "user", content: "hi" }], { thread: "T", mode: "code", approval: "each-write", ...(onApproval ? { onApproval: onApproval as never } : {}) });
      expect(approvalCalls(calls)).toEqual([{ turnId: "t1", id: "0123456789abcdef", allow: false }]);
    }
  });
  it("keeps reading the stream while the person decides: a slow onApproval does not hold up later events", async () => {
    client.save("s3cret");
    // The stream's end (the message) arrives while onApproval is still waiting; the turn then waits for the answer to be sent.
    fakeBridge([REQ, ["activity", { tool: "Read", summary: "b.txt" }], ANSWER], ok);
    let release: (v: boolean) => void = () => {};
    const waiting = new Promise<boolean>((r) => (release = r));
    const evs: string[] = [];
    const p = client.sendTurn([{ role: "user", content: "hi" }], { thread: "T", mode: "code", approval: "each-write", onApproval: () => waiting, onEvent: (e) => evs.push(e.event) });
    await vi.waitFor(() => expect(evs).toContain("code_activity")); // read past the request while it is undecided
    release(true);
    expect((await p).content).toBe("done");
  });
  it("a 404 or 409 on the answer (timed out, already answered) does not fail the turn; a 401 does", async () => {
    client.save("s3cret");
    fakeBridge([REQ, ANSWER], (url) => (url === `${BRIDGE}/v1/approval` ? json(409, { error: "already answered" }) : undefined));
    expect((await client.sendTurn([{ role: "user", content: "hi" }], { thread: "T", mode: "code", approval: "each-write" })).content).toBe("done");
    fakeBridge([REQ, ANSWER], (url) => (url === `${BRIDGE}/v1/approval` ? json(401, { error: "Pair first." }) : undefined));
    await expect(client.sendTurn([{ role: "user", content: "hi" }], { thread: "T", mode: "code", approval: "each-write" })).rejects.toMatchObject({ status: 401 });
  });
});

describe("the stored session", () => {
  it("a code turn and a chat turn of one thread keep separate session ids", async () => {
    client.save("s3cret");
    const SESSION2 = "99999999-2222-4333-8444-555555555555";
    // chat turn first: stores a session
    fakeBridge([["message", { role: "assistant", content: "a", model: "m", sessionId: SESSION }]]);
    await client.sendTurn([{ role: "user", content: "one" }], { thread: "T" });
    // a code turn after it: must NOT resume the chat session, and stores its own
    let calls = fakeBridge([["message", { role: "assistant", content: "b", model: "m", sessionId: SESSION2 }]]);
    await client.sendTurn([{ role: "user", content: "one" }, { role: "assistant", content: "a" }, { role: "user", content: "two" }], { thread: "T", mode: "code" });
    expect(turnBody(calls)).not.toHaveProperty("sessionId");
    // the next chat turn resumes the chat session (covers 2 messages), the next code turn the code one
    calls = fakeBridge([["message", { role: "assistant", content: "c", model: "m", sessionId: SESSION }]]);
    await client.sendTurn([{ role: "user", content: "one" }, { role: "assistant", content: "a" }, { role: "user", content: "three" }], { thread: "T" });
    expect(turnBody(calls).sessionId).toBe(SESSION);
    calls = fakeBridge([["message", { role: "assistant", content: "d", model: "m", sessionId: SESSION2 }]]);
    await client.sendTurn([{ role: "user", content: "one" }, { role: "assistant", content: "a" }, { role: "user", content: "two" }, { role: "assistant", content: "b" }, { role: "user", content: "four" }], { thread: "T", mode: "code" });
    expect(turnBody(calls).sessionId).toBe(SESSION2);
  });
  it("disconnect removes the code sessions too", () => {
    client.save("s3cret");
    localStorage.setItem(`gilb.claude-code-session.${PRINCIPAL}.mode-code/T`, "{}");
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    client.disconnect();
    expect(localStorage.getItem(`gilb.claude-code-session.${PRINCIPAL}.mode-code/T`)).toBeNull();
  });
});
