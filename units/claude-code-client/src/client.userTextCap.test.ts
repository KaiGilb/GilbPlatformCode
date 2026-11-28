// Client 0.3.16: the platform gets at most 24,000 characters of the last message as userText; the bridge gets all of it.
// Spec: S.Plan.Report. Measurement behind the 24,000: the dispatcher reported on 2026-11-28 that gilb.com/app at b59369dd
// refused a Plan -> Report request with "body/userText must NOT have more than 24000 characters". This file does not fake
// that refusal; it checks the bodies the client really sends. The Ajv count rule (code points) was measured by running
// Ajv 8.20.0 from GilbPlatform's install with Fastify's options (coerceTypes false, useDefaults, removeAdditional false):
// 24,000 emoji (48,000 units) passed maxLength 24000, 24,001 emoji failed, 24,001 ASCII failed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClaudeCodeClient, capUserText, MAX_USER_TEXT } from "./client";

const PLATFORM = "https://platform.example.test";
const CONTEXT_URL = `${PLATFORM}/base/ai/claude-code/context`;
const TOOL_URL = `${PLATFORM}/base/ai/claude-code/tool`;
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

// A turn in which the bridge asks for one tool, so the context POST and the tool POST both happen.
const toolTurn = () => {
  const calls: { url: string; body: any }[] = [];
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url === CONTEXT_URL) return json(200, { system: "S", tools: [] });
    if (url === `${BRIDGE}/v1/turn`) return sse([["start", { ok: true, turnId: "t1" }], ["tool_request", { id: "c1", name: "list_vaults", arguments: "{}" }], ["message", { role: "assistant", content: "done", model: "m" }]]);
    if (url === TOOL_URL) return json(200, { result: "[]" });
    if (url === `${BRIDGE}/v1/tool-result`) return json(200, { ok: true });
    throw new Error(`unexpected ${url}`);
  });
  return calls;
};
const bodyOf = (calls: { url: string; body: any }[], url: string) => calls.find((c) => c.url === url)!.body;
const user = (content: string) => [{ role: "user" as const, content }];
const isHigh = (u: number) => u >= 0xd800 && u <= 0xdbff;

describe("capUserText", () => {
  it("returns exactly 24,000 characters unchanged", () => {
    const text = "a".repeat(MAX_USER_TEXT);
    expect(capUserText(text)).toBe(text);
  });

  it("cuts 24,001 characters to the first 24,000", () => {
    const text = "a".repeat(MAX_USER_TEXT) + "b";
    const out = capUserText(text);
    expect(out.length).toBe(24000);
    expect(out).toBe(text.slice(0, 24000));
  });

  it("drops a high surrogate that the cut would leave at the end", () => {
    // Arrange: unit 23,999 is the first half of an emoji.
    const text = "a".repeat(MAX_USER_TEXT - 1) + "\u{1F600}" + "tail";
    expect(isHigh(text.charCodeAt(23999))).toBe(true);
    const out = capUserText(text);
    expect(out.length).toBe(23999);
    expect(isHigh(out.charCodeAt(out.length - 1))).toBe(false);
  });

  it("keeps a whole emoji when the cut falls after its second half", () => {
    const text = "a".repeat(MAX_USER_TEXT - 2) + "\u{1F600}" + "tail";
    const out = capUserText(text);
    expect(out.length).toBe(24000);
    expect(out.endsWith("\u{1F600}")).toBe(true);
  });

  it("cuts 60,000 emoji to at most 24,000 units, with no lone surrogate (Ajv counts code points, so this passes)", () => {
    const out = capUserText("\u{1F600}".repeat(60000));
    expect(out.length).toBeLessThanOrEqual(24000);
    expect([...out].length).toBeLessThanOrEqual(24000);
    expect(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(out)).toBe(false);
  });
});

describe("sendTurn userText", () => {
  it("sends 24,000 characters to /context and /tool for a 60,000-character message, and the whole message to the bridge", async () => {
    const calls = toolTurn();
    const message = "x".repeat(60000);
    await client.sendTurn(user(message), { thread: "T" });
    expect(bodyOf(calls, CONTEXT_URL).userText.length).toBe(24000);
    expect(bodyOf(calls, CONTEXT_URL).userText).toBe(message.slice(0, 24000));
    expect(bodyOf(calls, TOOL_URL).userText.length).toBe(24000);
    expect(bodyOf(calls, TOOL_URL).userText).toBe(message.slice(0, 24000));
    expect(bodyOf(calls, `${BRIDGE}/v1/turn`).prompt.length).toBe(60000);
    expect(bodyOf(calls, `${BRIDGE}/v1/turn`).prompt).toBe(message);
  });

  it("sends a 24,000-character message whole and cuts a 24,001-character one", async () => {
    const whole = "y".repeat(24000);
    const c1 = toolTurn();
    await client.sendTurn(user(whole), { thread: "T" });
    expect(bodyOf(c1, CONTEXT_URL).userText).toBe(whole);
    const c2 = toolTurn();
    await client.sendTurn(user(whole + "z"), { thread: "T" });
    expect(bodyOf(c2, CONTEXT_URL).userText.length).toBe(24000);
  });

  it("never sends a lone high surrogate in userText", async () => {
    const calls = toolTurn();
    await client.sendTurn(user("a".repeat(23999) + "\u{1F600}" + "b".repeat(1000)), { thread: "T" });
    const sent: string = bodyOf(calls, CONTEXT_URL).userText;
    expect(sent.length).toBe(23999);
    expect(isHigh(sent.charCodeAt(sent.length - 1))).toBe(false);
  });
});
