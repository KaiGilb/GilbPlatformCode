import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClaudeCodeBridgeError,
  ClaudeCodePlatformError,
  createClaudeCodeClient,
  type ClaudeCodeClientConfig,
} from "./client";

const PLATFORM = "https://platform.example.test";
const AI_CLAUDE_CODE_CONTEXT_URL = `${PLATFORM}/base/ai/claude-code/context`;
const AI_CLAUDE_CODE_TOOL_URL = `${PLATFORM}/base/ai/claude-code/tool`;
const CLAUDE_CODE_BRIDGE_URL = "http://127.0.0.1:47821";
const PRINCIPAL = "https://pelleparafin.example.test/base";

const getAuthHeaders = vi.fn(async (_method: string, _url: string) => ({ authorization: "DPoP tok", dpop: "proof-1" }));
const invalidateAuth = vi.fn();

function mk(over: Partial<ClaudeCodeClientConfig> = {}) {
  return createClaudeCodeClient({ principal: PRINCIPAL, platformOrigin: PLATFORM, bridgeUrl: CLAUDE_CODE_BRIDGE_URL, getAuthHeaders, invalidateAuth, ...over });
}
let client = mk();

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function sse(events: [string, unknown][]): Response {
  const text = events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
  return new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  client = mk();
  getAuthHeaders.mockClear();
  invalidateAuth.mockClear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the bridge address", () => {
  it("is passed in by the host: there is no default, in the type or at runtime", () => {
    // @ts-expect-error — bridgeUrl is required
    const config: ClaudeCodeClientConfig = { principal: PRINCIPAL, platformOrigin: PLATFORM, getAuthHeaders };
    expect(() => createClaudeCodeClient(config)).toThrow(/bridgeUrl is required/);
    expect(() => createClaudeCodeClient({ ...config, bridgeUrl: "" })).toThrow(/bridgeUrl is required/);
  });
  it("is the one the host passed, without a trailing slash", () => {
    expect(mk({ bridgeUrl: "http://127.0.0.1:5000/" }).bridgeUrl).toBe("http://127.0.0.1:5000");
  });
});

describe("probe and pair", () => {
  it("probe is true only for the Gilb bridge and false when nothing answers", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { bridge: "gilb-claude-code-bridge" }));
    expect(await client.probe()).toBe(true);
    fetchMock.mockResolvedValueOnce(json(200, { something: "else" }));
    expect(await client.probe()).toBe(false);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await client.probe()).toBe(false);
  });

  it("pair posts the code to the bridge and returns the secret", async () => {
    fetchMock.mockResolvedValue(json(200, { secret: "s3cret" }));
    expect(await client.requestSecret(" K7F-29Q ")).toBe("s3cret");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${CLAUDE_CODE_BRIDGE_URL}/v1/pair`);
    expect(JSON.parse(String(init.body))).toEqual({ code: "K7F-29Q", principalHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it("a wrong code surfaces the bridge's own sentence", async () => {
    fetchMock.mockResolvedValue(json(401, { error: "That code is not right." }));
    await expect(client.requestSecret("AAA-AAA")).rejects.toMatchObject({ status: 401, message: "That code is not right." });
  });

  it("no bridge → a plain sentence naming the command to run", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    client = mk({ startCommand: () => "curl -fsSL https://app.example/claude-code-bridge.mjs -o ~/.gilb-claude-code-bridge.mjs && node ~/.gilb-claude-code-bridge.mjs" });
    await expect(client.requestSecret("AAA-AAA")).rejects.toThrow(/curl -fsSL .*claude-code-bridge\.mjs.*node ~\/\.gilb-claude-code-bridge\.mjs/);
    await expect(client.requestSecret("AAA-AAA")).rejects.toMatchObject({ status: 0 });
  });
});

describe("the stored connection", () => {
  it("is kept in localStorage per principal and the read-back never carries the secret", () => {
    client.save("s3cret");
    mk({ principal: "https://other.example.test/base" }).save("other");
    expect(client.load()?.secret).toBe("s3cret");
    expect(mk({ principal: "https://other.example.test/base" }).load()?.secret).toBe("other");
    const readback = client.readConnected();
    expect(readback).toMatchObject({ provider: "claude-code", connected: true });
    expect(JSON.stringify(readback)).not.toContain("s3cret");
  });

  it("is kept in localStorage and never in sessionStorage", () => {
    client.save("s3cret");
    expect(localStorage.getItem(`gilb.claude-code-bridge.${PRINCIPAL}`)).toContain("s3cret");
    expect(window.sessionStorage.length).toBe(0);
  });

  it("is shared by a second client on the same origin (a new tab or a browser restart)", () => {
    client.save("s3cret");
    expect(mk().load()?.secret).toBe("s3cret");
  });

  it("disconnect forgets the secret and its sessions, and tells the bridge", () => {
    client.save("s3cret");
    localStorage.setItem(`gilb.claude-code-session.${PRINCIPAL}.Jackfruit`, "{}");
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    client.disconnect();
    expect(client.load()).toBeNull();
    expect(localStorage.getItem(`gilb.claude-code-session.${PRINCIPAL}.Jackfruit`)).toBeNull();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${CLAUDE_CODE_BRIDGE_URL}/v1/unpair`);
    expect((init.headers as Record<string, string>)["x-bridge-secret"]).toBe("s3cret");
  });
});

describe("sendClaudeCodeTurn", () => {
  const CONTEXT = {
    system: "You are the GilbPlatform agent.",
    tools: [{ name: "list_vaults", description: "d", inputSchema: { type: "object", properties: {} } }],
    standing: { outcome: "loaded", group: "G", vault: "V", textSent: true },
  };

  it("composes on GilbPlatform, runs on the bridge, runs each vault tool on GilbPlatform with DPoP, and answers", async () => {
    client.save("s3cret");
    const calls: { url: string; init: RequestInit }[] = [];
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url === AI_CLAUDE_CODE_CONTEXT_URL) return json(200, CONTEXT);
      if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/turn`) {
        return sse([
          ["start", { ok: true, turnId: "t1" }],
          ["tool_request", { id: "c1", name: "list_vaults", arguments: "{}" }],
          ["message", { role: "assistant", content: "You have 1 vault.", model: "claude-opus-5-5", sessionId: "11111111-2222-4333-8444-555555555555" }],
        ]);
      }
      if (url === AI_CLAUDE_CODE_TOOL_URL) return json(200, { result: JSON.stringify({ vaults: ["https://a.example.test/base"] }) });
      if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/tool-result`) return json(200, { ok: true });
      throw new Error(`unexpected ${url}`);
    });
    const events: string[] = [];
    const reply = await client.sendTurn([{ role: "user", content: "which vaults?" }], {
      thread: "Jackfruit",
      agent: "Jackfruit",
      contentVaultIds: ["https://a.example.test/base"],
      onEvent: (ev) => events.push(ev.event),
    });
    expect(reply).toEqual({ role: "assistant", content: "You have 1 vault.", model: "claude-opus-5-5", payer: "person-claude-code" });
    expect(events).toEqual(["standing", "start", "tool"]);

    // The prompt/tools came from GilbPlatform, with the picked agent and vaults, authed with DPoP.
    const ctx = calls.find((c) => c.url === AI_CLAUDE_CODE_CONTEXT_URL)!;
    expect(JSON.parse(String(ctx.init.body))).toEqual({
      userText: "which vaults?",
      agent: "Jackfruit",
      contentVaultIds: ["https://a.example.test/base"],
      turnId: expect.stringMatching(/^[A-Za-z0-9_-]{8,64}$/),
    });
    expect((ctx.init.headers as Record<string, string>).authorization).toBe("DPoP tok");
    // The bridge got the prompt, the system text and the tools, with the pairing secret, and NO GilbPlatform credential.
    const turn = calls.find((c) => c.url === `${CLAUDE_CODE_BRIDGE_URL}/v1/turn`)!;
    const turnBody = JSON.parse(String(turn.init.body)) as Record<string, unknown>;
    expect(turnBody).toMatchObject({ prompt: "which vaults?", system: CONTEXT.system, tools: CONTEXT.tools });
    expect(turn.init.headers as Record<string, string>).toMatchObject({ "x-bridge-secret": "s3cret" });
    expect(JSON.stringify(turn)).not.toContain("DPoP tok");
    // The tool ran on GilbPlatform with its own DPoP proof, then went back to the bridge.
    const tool = calls.find((c) => c.url === AI_CLAUDE_CODE_TOOL_URL)!;
    expect(JSON.parse(String(tool.init.body))).toMatchObject({ name: "list_vaults", arguments: "{}", userText: "which vaults?" });
    // The tool call carries the SAME turn id as the context: GilbPlatform keeps the turn's limits under it.
    expect(JSON.parse(String(tool.init.body)).turnId).toBe(JSON.parse(String(ctx.init.body)).turnId);
    expect((tool.init.headers as Record<string, string>).authorization).toBe("DPoP tok");
    const back = calls.find((c) => c.url === `${CLAUDE_CODE_BRIDGE_URL}/v1/tool-result`)!;
    expect(JSON.parse(String(back.init.body))).toEqual({
      turnId: "t1",
      id: "c1",
      result: JSON.stringify({ vaults: ["https://a.example.test/base"] }),
      isError: false,
    });
  });

  describe("a hand-off to another agent runs as a nested turn on the person's own Claude Code", () => {
    const HOP = {
      id: "0123456789abcdef01234567",
      via: "run_named_role",
      role: "Agent.Outcome",
      task: "write the thing",
      system: "You are the GilbPlatform agent. HOP-STANDING",
      tools: [{ name: "read_record", description: "d", inputSchema: { type: "object", properties: {} } }],
      answer: { role: "Agent.Outcome", procedures: ["Agent.Outcome"], standingOutcome: "loaded" },
    };

    function rig(nested: [string, unknown][]) {
      const calls: { url: string; body: Record<string, unknown> }[] = [];
      let turns = 0;
      fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
        calls.push({ url, body });
        if (url === AI_CLAUDE_CODE_CONTEXT_URL) return json(200, CONTEXT);
        if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/turn`) {
          turns += 1;
          if (turns === 1) {
            return sse([
              ["start", { ok: true, turnId: "t1" }],
              ["tool_request", { id: "c1", name: "run_named_role", arguments: JSON.stringify({ role: "Agent.Outcome", task: "write the thing" }) }],
              ["message", { role: "assistant", content: "The Agent wrote it.", model: "m" }],
            ]);
          }
          return sse(nested);
        }
        if (url === AI_CLAUDE_CODE_TOOL_URL) {
          if (body.name === "run_named_role") return json(200, { hop: HOP });
          return json(200, { result: JSON.stringify({ ran: body.name }) });
        }
        if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/tool-result`) return json(200, { ok: true });
        throw new Error(`unexpected ${url}`);
      });
      return calls;
    }

    it("opens the hand-off on the same bridge under the asking turn, relays its tool calls with the hop id, and answers the asking tool call with its text", async () => {
      client.save("s3cret");
      const calls = rig([
        ["start", { ok: true, turnId: "t2" }],
        ["tool_request", { id: "n1", name: "read_record", arguments: "{}" }],
        ["message", { role: "assistant", content: "Done: it is written.", model: "m" }],
      ]);
      const events: string[] = [];
      const reply = await client.sendTurn([{ role: "user", content: "have Outcome write it" }], {
        thread: "Kai-Zen",
        agent: "Kai-Zen",
        onEvent: (ev) => events.push(ev.event),
      });
      expect(reply.content).toBe("The Agent wrote it.");
      const turnCalls = calls.filter((c) => c.url === `${CLAUDE_CODE_BRIDGE_URL}/v1/turn`);
      expect(turnCalls).toHaveLength(2);
      // The nested turn: the hand-off's own prompt and tools, under the asking turn, no thread, no session.
      expect(turnCalls[1]!.body).toEqual({ prompt: "write the thing", system: HOP.system, tools: HOP.tools, parentTurnId: "t1" });
      // Its tool call went to GilbPlatform with the hop id and the person turn's id; the plain turn's call carries no hop.
      const toolCalls = calls.filter((c) => c.url === AI_CLAUDE_CODE_TOOL_URL);
      expect(toolCalls[0]!.body.hop).toBeUndefined();
      expect(toolCalls[1]!.body).toMatchObject({ name: "read_record", hop: { id: HOP.id }, turnId: toolCalls[0]!.body.turnId });
      // When the nested turn is over, the page tells GilbPlatform so the hop id is closed, with the same turn fields.
      expect(toolCalls).toHaveLength(3);
      expect(toolCalls[2]!.body).toMatchObject({ hop: { id: HOP.id, done: true }, turnId: toolCalls[0]!.body.turnId });
      // Both tool calls were answered to the bridge: the nested turn's own, and the asking one with the hand-off's answer.
      const results = calls.filter((c) => c.url === `${CLAUDE_CODE_BRIDGE_URL}/v1/tool-result`).map((c) => c.body);
      expect(results[0]).toMatchObject({ turnId: "t2", id: "n1", isError: false });
      expect(results[1]).toMatchObject({ turnId: "t1", id: "c1", isError: false });
      expect(JSON.parse(String(results[1]!.result))).toEqual({ ...HOP.answer, content: "Done: it is written." });
      // GilbPlatform was never asked for a model answer: only context and tool.
      expect(new Set(calls.map((c) => c.url))).toEqual(
        new Set([AI_CLAUDE_CODE_CONTEXT_URL, AI_CLAUDE_CODE_TOOL_URL, `${CLAUDE_CODE_BRIDGE_URL}/v1/turn`, `${CLAUDE_CODE_BRIDGE_URL}/v1/tool-result`]),
      );
    });

    it("a hand-off that fails goes back to the asking model as an error with a way forward; the asking turn goes on", async () => {
      client.save("s3cret");
      const calls = rig([
        ["start", { ok: true, turnId: "t2" }],
        ["error", { message: "The hand-off took too long and was stopped." }],
      ]);
      const reply = await client.sendTurn([{ role: "user", content: "x" }], { thread: "Kai-Zen", agent: "Kai-Zen" });
      expect(reply.content).toBe("The Agent wrote it.");
      const asking = calls.filter((c) => c.url === `${CLAUDE_CODE_BRIDGE_URL}/v1/tool-result`).map((c) => c.body).find((b) => b.id === "c1")!;
      expect(asking.isError).toBe(true);
      const answer = JSON.parse(String(asking.result)) as Record<string, string>;
      expect(answer.error).toMatch(/run failed/);
      expect(answer.reason).toMatch(/took too long/);
      expect(answer.next).toMatch(/Tell the person/);
      // A failed hand-off is closed too.
      const closes = calls.filter((c) => c.url === AI_CLAUDE_CODE_TOOL_URL && (c.body.hop as { done?: boolean } | undefined)?.done === true);
      expect(closes).toHaveLength(1);
      expect(closes[0]!.body.hop).toEqual({ id: HOP.id, done: true });
    });

    it("a close that GilbPlatform cannot take does not change the hand-off's answer", async () => {
      client.save("s3cret");
      const calls = rig([
        ["start", { ok: true, turnId: "t2" }],
        ["message", { role: "assistant", content: "Done.", model: "m" }],
      ]);
      const rigged = fetchMock.getMockImplementation()! as unknown as (url: string, init: RequestInit) => Promise<Response>;
      fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
        const b = init?.body ? (JSON.parse(String(init.body)) as { hop?: { done?: boolean } }) : {};
        if (url === AI_CLAUDE_CODE_TOOL_URL && b.hop?.done === true) throw new Error("network down");
        return rigged(url, init);
      });
      const reply = await client.sendTurn([{ role: "user", content: "x" }], { thread: "Kai-Zen", agent: "Kai-Zen" });
      expect(reply.content).toBe("The Agent wrote it.");
      const asking = calls.filter((c) => c.url === `${CLAUDE_CODE_BRIDGE_URL}/v1/tool-result`).map((c) => c.body).find((b) => b.id === "c1")!;
      expect(asking.isError).toBe(false);
    });

    it("a hand-off is never opened without the id of the turn that asked for it", async () => {
      client.save("s3cret");
      const calls: string[] = [];
      fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
        calls.push(url);
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
        if (url === AI_CLAUDE_CODE_CONTEXT_URL) return json(200, CONTEXT);
        // a bridge that never says `start`: the page has no turn id to link a hand-off to
        if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/turn`) {
          return sse([["tool_request", { id: "c1", name: "run_named_role", arguments: "{}" }], ["message", { content: "ok" }]]);
        }
        if (url === AI_CLAUDE_CODE_TOOL_URL) return json(200, { hop: { ...HOP } });
        void body;
        return json(200, {});
      });
      await client.sendTurn([{ role: "user", content: "x" }], { thread: "Kai-Zen", agent: "Kai-Zen" });
      expect(calls.filter((u) => u === `${CLAUDE_CODE_BRIDGE_URL}/v1/turn`)).toHaveLength(1);
    });

    it("a hand-off answer the page cannot read is an error for the model, and nothing nested is started", async () => {
      client.save("s3cret");
      {
        const calls: string[] = [];
        fetchMock.mockImplementation(async (url: string) => {
          calls.push(url);
          if (url === AI_CLAUDE_CODE_CONTEXT_URL) return json(200, CONTEXT);
          if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/turn`) {
            return sse([["start", { turnId: "t1" }], ["tool_request", { id: "c1", name: "run_named_role", arguments: "{}" }], ["message", { content: "ok" }]]);
          }
          if (url === AI_CLAUDE_CODE_TOOL_URL) return json(200, { hop: { id: 1 } });
          return json(200, {});
        });
        await client.sendTurn([{ role: "user", content: "x" }], { thread: "Kai-Zen", agent: "Kai-Zen" });
        expect(calls.filter((u) => u === `${CLAUDE_CODE_BRIDGE_URL}/v1/turn`)).toHaveLength(1);
      }
    });
  });

  it("a tool GilbPlatform refuses goes back to Claude Code as an error, not as a crash", async () => {
    client.save("s3cret");
    const back: unknown[] = [];
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
        back.push(JSON.parse(String(init.body)));
        return json(200, {});
      }
      throw new Error(`unexpected ${url}`);
    });
    const reply = await client.sendTurn([{ role: "user", content: "x" }], { thread: "Jackfruit" });
    expect(reply.content).toBe("I could not.");
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ isError: true });
    expect(String((back[0] as { result: string }).result)).toContain("No write grant");
  });

  it("reuses the Claude Code session only when it already covers the thread before this message", async () => {
    client.save("s3cret");
    const SID = "11111111-2222-4333-8444-555555555555";
    const bodies: Record<string, unknown>[] = [];
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === AI_CLAUDE_CODE_CONTEXT_URL) return json(200, CONTEXT);
      if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/turn`) {
        bodies.push(JSON.parse(String(init.body)));
        return sse([["start", { turnId: "t" }], ["message", { content: "ok", sessionId: SID }]]);
      }
      throw new Error(`unexpected ${url}`);
    });
    const opts = { thread: "Jackfruit" };
    await client.sendTurn([{ role: "user", content: "one" }], opts);
    expect(bodies[0]).not.toHaveProperty("sessionId");
    await client.sendTurn(
      [{ role: "user", content: "one" }, { role: "assistant", content: "ok" }, { role: "user", content: "two" }],
      opts,
    );
    expect(bodies[1]).toMatchObject({ sessionId: SID, prompt: "two" });
    // A thread that no longer lines up (a turn was lost) starts fresh and carries the earlier turns as text.
    await client.sendTurn(
      [
        { role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "c" },
        { role: "assistant", content: "d" }, { role: "user", content: "e" }, { role: "assistant", content: "f" },
        { role: "user", content: "g" },
      ],
      opts,
    );
    expect(bodies[2]).not.toHaveProperty("sessionId");
    expect(String(bodies[2]!.history)).toContain("Person: a");
  });

  it("a bridge that no longer knows the secret (restarted) drops the connection with a plain sentence", async () => {
    client.save("stale");
    fetchMock.mockImplementation(async (url: string) => {
      if (url === AI_CLAUDE_CODE_CONTEXT_URL) return json(200, CONTEXT);
      return json(401, { error: "Pair first." });
    });
    await expect(client.sendTurn([{ role: "user", content: "x" }], { thread: "J" })).rejects.toThrow(
      /no longer knows this pairing/,
    );
    expect(client.load()).toBeNull();
  });

  describe("a bridge that stops knowing us in the middle of a turn", () => {
    const HOP = {
      id: "0123456789abcdef01234567", via: "run_named_role", role: "R", task: "t", system: "s",
      tools: [], answer: { role: "R" },
    };

    it("a 401 on the tool's answer drops the secret, stops the turn, and closes the stream (no 15-minute wait)", async () => {
      client.save("s3cret");
      let cancelled = false;
      fetchMock.mockImplementation(async (url: string) => {
        if (url === AI_CLAUDE_CODE_CONTEXT_URL) return json(200, CONTEXT);
        if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/turn`) {
          const enc = new TextEncoder();
          const body = new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(enc.encode(`event: start\ndata: ${JSON.stringify({ turnId: "t1" })}\n\n`));
              c.enqueue(enc.encode(`event: tool_request\ndata: ${JSON.stringify({ id: "c1", name: "list_vaults", arguments: "{}" })}\n\n`));
              // never ends: the bridge is waiting for the tool's answer
            },
            cancel() {
              cancelled = true;
            },
          });
          return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
        }
        if (url === AI_CLAUDE_CODE_TOOL_URL) return json(200, { result: "{}" });
        if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/tool-result`) return json(401, { error: "Pair first." });
        throw new Error(`unexpected ${url}`);
      });
      await expect(client.sendTurn([{ role: "user", content: "x" }], { thread: "J" })).rejects.toMatchObject({ status: 401, message: expect.stringMatching(/no longer knows/) });
      expect(client.load()).toBeNull();
      expect(cancelled).toBe(true);
    });

    it("a tool answer the bridge cannot take (404) stops the turn with a sentence, and keeps the secret", async () => {
      client.save("s3cret");
      fetchMock.mockImplementation(async (url: string) => {
        if (url === AI_CLAUDE_CODE_CONTEXT_URL) return json(200, CONTEXT);
        if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/turn`) {
          return sse([["start", { turnId: "t1" }], ["tool_request", { id: "c1", name: "list_vaults", arguments: "{}" }], ["message", { content: "late" }]]);
        }
        if (url === AI_CLAUDE_CODE_TOOL_URL) return json(200, { result: "{}" });
        if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/tool-result`) return json(404, { error: "No such turn." });
        throw new Error(`unexpected ${url}`);
      });
      await expect(client.sendTurn([{ role: "user", content: "x" }], { thread: "J" })).rejects.toMatchObject({ status: 404, message: expect.stringMatching(/turn was stopped/) });
      expect(client.load()?.secret).toBe("s3cret");
    });

    it("a 401 in a hand-off's nested turn drops the secret too", async () => {
      client.save("s3cret");
      let turns = 0;
      fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
        if (url === AI_CLAUDE_CODE_CONTEXT_URL) return json(200, CONTEXT);
        if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/turn`) {
          turns += 1;
          if (turns === 1) return sse([["start", { turnId: "t1" }], ["tool_request", { id: "c1", name: "run_named_role", arguments: "{}" }], ["message", { content: "x" }]]);
          return json(401, { error: "Pair first." }); // the nested turn
        }
        if (url === AI_CLAUDE_CODE_TOOL_URL) return body.name === "run_named_role" ? json(200, { hop: HOP }) : json(200, { result: "{}" });
        if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/tool-result`) return json(401, { error: "Pair first." });
        throw new Error(`unexpected ${url}`);
      });
      await expect(client.sendTurn([{ role: "user", content: "x" }], { thread: "J" })).rejects.toBeInstanceOf(ClaudeCodeBridgeError);
      expect(client.load()).toBeNull();
    });

    it("a getAuthHeaders that answers without a Promise is accepted", async () => {
      client = mk({ getAuthHeaders: () => ({ authorization: "sync" }) });
      client.save("s3cret");
      fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
        if (url === AI_CLAUDE_CODE_CONTEXT_URL) {
          expect((init.headers as Record<string, string>).authorization).toBe("sync");
          return json(200, CONTEXT);
        }
        return sse([["start", { turnId: "t" }], ["message", { content: "ok" }]]);
      });
      expect((await client.sendTurn([{ role: "user", content: "x" }], { thread: "J" })).content).toBe("ok");
    });
  });

  describe("tool requests of one turn are handled side by side", () => {
    const CTX = { system: "S", tools: [{ name: "list_vaults", description: "d", inputSchema: { type: "object", properties: {} } }] };
    const HOP = { id: "0123456789abcdef01234567", via: "run_named_role", role: "R", task: "t", system: "s", tools: [], answer: { role: "R" } };
    const enc = new TextEncoder();

    /** A bridge turn stream the test feeds by hand. */
    function liveStream() {
      let ctl!: ReadableStreamDefaultController<Uint8Array>;
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          ctl = c;
        },
        cancel() {
          cancelled = true;
        },
      });
      return {
        res: () => new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
        emit: (event: string, data: unknown) => ctl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)),
        end: () => ctl.close(),
        cancelled: () => cancelled,
      };
    }
    const tick = async (n = 20) => {
      for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
    };
    /** A deferred: a platform answer the test releases when it wants. */
    function gate() {
      let release!: () => void;
      const p = new Promise<void>((r) => (release = r));
      return { p, release };
    }

    /**
     * Rig: the person's turn stream is `live`; `/tool` answers per tool name through `toolAnswer`; the bridge's /v1/tool-result
     * answers are recorded in `results` in the order they were posted. Nested turns (hand-offs) get `nested()`.
     */
    function rig(opts: { toolAnswer: (name: string, init: RequestInit) => Promise<Response>; nested?: () => Response }) {
      const live = liveStream();
      const results: { id: string; turnId: string; result: string; isError: boolean }[] = [];
      const platformCalls: { name: string; hop?: unknown; signal?: AbortSignal | null }[] = [];
      let turns = 0;
      fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
        if (url === AI_CLAUDE_CODE_CONTEXT_URL) return json(200, CTX);
        if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/turn`) {
          turns += 1;
          return turns === 1 ? live.res() : (opts.nested?.() ?? json(500, {}));
        }
        if (url === AI_CLAUDE_CODE_TOOL_URL) {
          platformCalls.push({ name: String(body.name), hop: body.hop, signal: init.signal });
          return opts.toolAnswer(String(body.name), init);
        }
        if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/tool-result`) {
          results.push(body as { id: string; turnId: string; result: string; isError: boolean });
          return json(200, { ok: true });
        }
        throw new Error(`unexpected ${url}`);
      });
      return { live, results, platformCalls };
    }

    it("a plain tool is answered while a hand-off is still running; the hand-off is answered after it finishes", async () => {
      client.save("s3cret");
      const nested = liveStream();
      const r = rig({
        toolAnswer: async (name) => {
          if (name === "run_named_role") return json(200, { hop: HOP });
          return json(200, { result: JSON.stringify({ ran: name }) });
        },
        nested: () => nested.res(),
      });
      const done = client.sendTurn([{ role: "user", content: "x" }], { thread: "J" });
      await tick();
      r.live.emit("start", { turnId: "t1" });
      r.live.emit("tool_request", { id: "A", name: "run_named_role", arguments: "{}" });
      r.live.emit("tool_request", { id: "B", name: "list_vaults", arguments: "{}" });
      await tick();
      // B is answered although A (the hand-off's nested turn) has not finished.
      expect(r.results.map((x) => x.id)).toEqual(["B"]);
      expect(r.results[0]).toMatchObject({ turnId: "t1", isError: false });
      // The hand-off's nested turn ends only when released.
      nested.emit("start", { turnId: "t2" });
      nested.emit("message", { content: "hop answer", model: "m" });
      nested.end();
      await tick();
      expect(r.results.map((x) => x.id)).toEqual(["B", "A"]);
      expect(JSON.parse(r.results[1]!.result)).toMatchObject({ content: "hop answer" });
      r.live.emit("message", { content: "all done", model: "m" });
      r.live.end();
      expect((await done).content).toBe("all done");
    });

    it("the seventh concurrent request waits until one of the six finishes", async () => {
      client.save("s3cret");
      const gates = new Map<string, ReturnType<typeof gate>>();
      let started = 0;
      const r = rig({
        toolAnswer: async (name) => {
          started += 1;
          const g = gate();
          gates.set(name, g);
          await g.p;
          return json(200, { result: "{}" });
        },
      });
      const done = client.sendTurn([{ role: "user", content: "x" }], { thread: "J" });
      await tick();
      r.live.emit("start", { turnId: "t1" });
      for (let i = 1; i <= 7; i++) r.live.emit("tool_request", { id: `c${i}`, name: `tool${i}`, arguments: "{}" });
      await tick();
      expect(started).toBe(6);
      gates.get("tool3")!.release();
      await tick();
      expect(started).toBe(7);
      expect(r.results.map((x) => x.id)).toEqual(["c3"]);
      for (const g of gates.values()) g.release();
      await tick();
      expect(r.results).toHaveLength(7);
      r.live.emit("message", { content: "ok", model: "m" });
      r.live.end();
      await done;
    });

    it("a handler that fails still answers its own id with an error and does not break the others", async () => {
      client.save("s3cret");
      const r = rig({
        toolAnswer: async (name) => {
          if (name === "bad") throw new TypeError("platform exploded");
          return json(200, { result: JSON.stringify({ ran: name }) });
        },
      });
      const done = client.sendTurn([{ role: "user", content: "x" }], { thread: "J" });
      await tick();
      r.live.emit("start", { turnId: "t1" });
      r.live.emit("tool_request", { id: "bad1", name: "bad", arguments: "{}" });
      r.live.emit("tool_request", { id: "good1", name: "good", arguments: "{}" });
      await tick();
      const byId = Object.fromEntries(r.results.map((x) => [x.id, x]));
      expect(byId.bad1).toMatchObject({ isError: true });
      expect(String(byId.bad1!.result)).toContain("platform exploded");
      expect(byId.good1).toMatchObject({ isError: false });
      r.live.emit("message", { content: "ok", model: "m" });
      r.live.end();
      expect((await done).content).toBe("ok");
    });

    it("tool_cancelled aborts that request's fetch and posts nothing for it; the others are answered", async () => {
      client.save("s3cret");
      let slowSignal: AbortSignal | null | undefined;
      const r = rig({
        toolAnswer: async (name, init) => {
          if (name === "slow") {
            slowSignal = init.signal;
            return new Promise<Response>((_res, rej) => init.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
          }
          return json(200, { result: "{}" });
        },
      });
      const done = client.sendTurn([{ role: "user", content: "x" }], { thread: "J" });
      await tick();
      r.live.emit("start", { turnId: "t1" });
      r.live.emit("tool_request", { id: "S", name: "slow", arguments: "{}" });
      r.live.emit("tool_request", { id: "F", name: "fast", arguments: "{}" });
      await tick();
      expect(slowSignal?.aborted).toBe(false);
      r.live.emit("tool_cancelled", { type: "tool_cancelled", id: "S" });
      await tick();
      expect(slowSignal?.aborted).toBe(true);
      r.live.emit("message", { content: "ok", model: "m" });
      r.live.end();
      await done;
      expect(r.results.map((x) => x.id)).toEqual(["F"]);
    });

    it("tool_cancelled for a running hand-off stops its nested turn, closes the hop on GilbPlatform, and posts no result", async () => {
      client.save("s3cret");
      const nested = liveStream();
      let nestedSignal: AbortSignal | null | undefined;
      const r = rig({
        toolAnswer: async (name) => (name === "run_named_role" ? json(200, { hop: HOP }) : json(200, { result: "{}" })),
        nested: () => nested.res(),
      });
      const base = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
        if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/turn` && init.body && String(init.body).includes("parentTurnId")) nestedSignal = init.signal;
        return base(url, init);
      });
      const done = client.sendTurn([{ role: "user", content: "x" }], { thread: "J" });
      await tick();
      r.live.emit("start", { turnId: "t1" });
      r.live.emit("tool_request", { id: "A", name: "run_named_role", arguments: "{}" });
      await tick();
      nested.emit("start", { turnId: "t2" });
      await tick();
      expect(nestedSignal?.aborted).toBe(false);
      r.live.emit("tool_cancelled", { type: "tool_cancelled", id: "A" });
      await tick();
      expect(nestedSignal?.aborted).toBe(true);
      expect(r.platformCalls.some((c) => (c.hop as { done?: boolean } | undefined)?.done === true)).toBe(true);
      expect(r.results).toHaveLength(0);
      r.live.emit("message", { content: "ok", model: "m" });
      r.live.end();
      await done;
      expect(r.results).toHaveLength(0);
    });
  });

  it("not connected → an error and no request at all", async () => {
    await expect(client.sendTurn([{ role: "user", content: "x" }], { thread: "J" })).rejects.toBeInstanceOf(
      ClaudeCodeBridgeError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends only to the platform origin it was given and the bridge; the pairing secret never goes to the platform", async () => {
    client.save("s3cret-xyz");
    const urls: string[] = [];
    const platformBodies: string[] = [];
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      urls.push(url);
      if (url.startsWith(PLATFORM)) platformBodies.push(JSON.stringify([init.headers, init.body]));
      if (url === AI_CLAUDE_CODE_CONTEXT_URL) return json(200, CONTEXT);
      if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/turn`) {
        return sse([["start", { turnId: "t1" }], ["tool_request", { id: "c1", name: "list_vaults", arguments: "{}" }], ["message", { content: "ok" }]]);
      }
      if (url === AI_CLAUDE_CODE_TOOL_URL) return json(200, { result: "{}" });
      return json(200, {});
    });
    await client.sendTurn([{ role: "user", content: "x" }], { thread: "J" });
    expect(urls.every((u) => u.startsWith(PLATFORM) || u.startsWith(CLAUDE_CODE_BRIDGE_URL))).toBe(true);
    expect(platformBodies.length).toBeGreaterThan(0);
    for (const b of platformBodies) expect(b).not.toContain("s3cret-xyz");
  });

  it("signs every platform request for its own method and URL, and retries a 401 once after invalidating", async () => {
    client.save("s3cret");
    let ctxCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === AI_CLAUDE_CODE_CONTEXT_URL) {
        ctxCalls += 1;
        return ctxCalls === 1 ? json(401, {}) : json(200, CONTEXT);
      }
      if (url === `${CLAUDE_CODE_BRIDGE_URL}/v1/turn`) return sse([["start", { turnId: "t" }], ["message", { content: "ok" }]]);
      throw new Error(`unexpected ${url}`);
    });
    const reply = await client.sendTurn([{ role: "user", content: "x" }], { thread: "J" });
    expect(reply.content).toBe("ok");
    expect(ctxCalls).toBe(2);
    expect(invalidateAuth).toHaveBeenCalledTimes(1);
    expect(getAuthHeaders).toHaveBeenCalledWith("POST", AI_CLAUDE_CODE_CONTEXT_URL);
  });

  it("two 401s in a row stop with a plain sentence and no turn is run", async () => {
    client.save("s3cret");
    fetchMock.mockResolvedValue(json(401, {}));
    await expect(client.sendTurn([{ role: "user", content: "x" }], { thread: "J" })).rejects.toBeInstanceOf(ClaudeCodePlatformError);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/v1/turn"))).toBe(false);
  });

  it("the secret of one principal is not readable by another, and an empty principal never connects", () => {
    client.save("s3cret");
    expect(mk({ principal: "https://other.example.test/base" }).load()).toBeNull();
    const nobody = mk({ principal: "" });
    nobody.save("x");
    expect(nobody.load()).toBeNull();
  });

  it("pair sends a SHA-256 of the principal, never the principal", async () => {
    fetchMock.mockResolvedValue(json(200, { secret: "x" }));
    await client.requestSecret("AAA-AAA");
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.principalHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(body)).not.toContain(PRINCIPAL);
  });

  it("an injected storage is used instead of localStorage", () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; } };
    const c = mk({ storage });
    c.save("inj");
    expect(mem.size).toBe(1);
    expect(localStorage.length).toBe(0);
    expect(c.load()?.secret).toBe("inj");
  });

  it("a GilbPlatform refusal of the context (NotYourAgent) keeps its code for the pane", async () => {
    client.save("s3cret");
    fetchMock.mockResolvedValue(json(400, { error: "NotYourAgent", message: "That agent is not yours." }));
    await expect(
      client.sendTurn([{ role: "user", content: "x" }], { thread: "J", agentEntry: "https://x.example.test/base/e/abc" }),
    ).rejects.toMatchObject({ status: 400, code: "NotYourAgent" });
  });
});
