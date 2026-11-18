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

const REQ = (extra: Record<string, unknown> = {}): [string, unknown] => ["approval_request", { id: "0123456789abcdef", tool: "WebFetch", summary: "https://example.com/a", notice: "Host: example.com", ...extra }];
const ok = (url: string) => (url === `${BRIDGE}/v1/approval` ? json(200, { ok: true }) : undefined);
const posted = (calls: { url: string; init: RequestInit }[]) => calls.filter((c) => c.url === `${BRIDGE}/v1/approval`).map((c) => JSON.parse(String(c.init.body)));
const run = (onApproval: (r: never) => unknown, evs: ClaudeCodeStreamEvent[] = []) =>
  client.sendTurn([{ role: "user", content: "hi" }], { thread: "T", mode: "code", approval: "each-write", onApproval: onApproval as never, onEvent: (e) => evs.push(e) });

describe("approval scope (bridge 0.3.12)", () => {
  it("passes scopes through to onApproval and the approval_request event", async () => {
    client.save("s3cret");
    fakeBridge([REQ({ scopes: ["once", "turn"] }), ANSWER], ok);
    const onApproval = vi.fn(async () => true);
    const evs: ClaudeCodeStreamEvent[] = [];
    await run(onApproval, evs);
    expect((onApproval.mock.calls[0] as unknown[])[0]).toMatchObject({ scopes: ["once", "turn"], notice: "Host: example.com" });
    expect(evs.find((e) => e.event === "approval_request")).toMatchObject({ data: { scopes: ["once", "turn"] } });
  });
  it("drops unknown scopes; none known leaves scopes off", async () => {
    client.save("s3cret");
    fakeBridge([REQ({ scopes: ["turn", "forever", 3, "turn"] }), ANSWER], ok);
    const a = vi.fn(async () => true);
    await run(a);
    expect((a.mock.calls[0] as unknown[])[0]).toMatchObject({ scopes: ["turn"] });
    for (const scopes of [["forever"], "turn", [], null]) {
      fakeBridge([REQ({ scopes }), ANSWER], ok);
      const b = vi.fn(async () => true);
      await run(b);
      expect((b.mock.calls[0] as unknown[])[0]).not.toHaveProperty("scopes");
    }
  });
  it("POSTs scope turn for an allow with scope turn, and no scope for a plain true (an old handler works)", async () => {
    client.save("s3cret");
    let calls = fakeBridge([REQ({ scopes: ["once", "turn"] }), ANSWER], ok);
    await run(async () => ({ allow: true, scope: "turn" }));
    expect(posted(calls)).toEqual([{ turnId: "t1", id: "0123456789abcdef", allow: true, scope: "turn" }]);
    calls = fakeBridge([REQ({ scopes: ["once", "turn"] }), ANSWER], ok);
    await run(async () => true);
    expect(posted(calls)).toEqual([{ turnId: "t1", id: "0123456789abcdef", allow: true }]);
    calls = fakeBridge([REQ({ scopes: ["once"] }), ANSWER], ok);
    await run(async () => ({ allow: true, scope: "once" }));
    expect(posted(calls)).toEqual([{ turnId: "t1", id: "0123456789abcdef", allow: true }]); // "once" is the default, so it is left off
  });
  it("never sends scope turn when the bridge did not offer it (local host, or an older bridge)", async () => {
    client.save("s3cret");
    for (const extra of [{ scopes: ["once"] }, {}]) {
      const calls = fakeBridge([REQ(extra), ANSWER], ok);
      await run(async () => ({ allow: true, scope: "turn" }));
      expect(posted(calls)).toEqual([{ turnId: "t1", id: "0123456789abcdef", allow: true }]);
    }
  });
  it("a refusal never carries a scope", async () => {
    client.save("s3cret");
    for (const answer of [false, { allow: false, scope: "turn" }, { scope: "turn" }]) {
      const calls = fakeBridge([REQ({ scopes: ["once", "turn"] }), ANSWER], ok);
      await run(async () => answer);
      expect(posted(calls)).toEqual([{ turnId: "t1", id: "0123456789abcdef", allow: false }]);
    }
  });
  it("approval_done carries a known scope", async () => {
    client.save("s3cret");
    fakeBridge([["approval_done", { id: "x1", allow: true, scope: "turn" }], ["approval_done", { id: "x2", allow: true, scope: "bogus" }], ANSWER], ok);
    const evs: ClaudeCodeStreamEvent[] = [];
    await run(async () => true, evs);
    const done = evs.filter((e) => e.event === "approval_done").map((e) => e.data);
    expect(done).toEqual([{ id: "x1", allow: true, scope: "turn" }, { id: "x2", allow: true }]);
  });
  it("bridgeInfo reads options.web, and leaves it off when absent or malformed", async () => {
    const hello = (options: unknown) => fetchMock.mockImplementation(async () => json(200, { bridge: "gilb-claude-code-bridge", build: "0.3.12", options }));
    const base = { models: ["opus"], efforts: ["low"], delegateCoding: true };
    hello({ ...base, web: { search: true, fetch: "ask" } });
    expect((await client.bridgeInfo()).options?.web).toEqual({ search: true, fetch: "ask" });
    hello({ ...base, web: { search: false, fetch: "off" } });
    expect((await client.bridgeInfo()).options?.web).toEqual({ search: false, fetch: "off" });
    for (const web of [{ search: "yes", fetch: "ask" }, { search: true, fetch: "always" }, "x", null]) {
      hello({ ...base, web });
      expect((await client.bridgeInfo()).options).not.toHaveProperty("web");
    }
    hello(base);
    expect((await client.bridgeInfo()).options).not.toHaveProperty("web");
  });
});
