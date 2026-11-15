// Client 0.3.6: pictures on sendTurn (checked before any request), and `images` from bridgeInfo.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClaudeCodeClient, ClaudeCodeBridgeError } from "./client";

const PLATFORM = "https://platform.example.test";
const CONTEXT_URL = `${PLATFORM}/base/ai/claude-code/context`;
const BRIDGE = "http://127.0.0.1:47821";
const PRINCIPAL = "https://pelleparafin.example.test/base";
const getAuthHeaders = vi.fn(async () => ({ authorization: "DPoP tok", dpop: "p" }));
let client = createClaudeCodeClient({ principal: PRINCIPAL, platformOrigin: PLATFORM, bridgeUrl: BRIDGE, getAuthHeaders });
let fetchMock: ReturnType<typeof vi.fn>;
const MiB = 1024 * 1024;

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

const bridge = () => {
  const calls: { url: string; init: RequestInit }[] = [];
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url === CONTEXT_URL) return json(200, { system: "S", tools: [] });
    if (url === `${BRIDGE}/v1/turn`) return sse([["start", { ok: true, turnId: "t1" }], ["message", { role: "assistant", content: "done", model: "m" }]]);
    throw new Error(`unexpected ${url}`);
  });
  return calls;
};
const U = [{ role: "user" as const, content: "hi" }];
const MAGIC: Record<string, number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff, 0xe0],
  "image/gif": [...new TextEncoder().encode("GIF87a")],
  "image/webp": [...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBP")],
};
const img = (type = "image/png", size = 64) => {
  const b = Buffer.alloc(size);
  Buffer.from(MAGIC[type]!).copy(b);
  return { mediaType: type, data: b.toString("base64") };
};

describe("pictures on sendTurn", () => {
  it("go in the /v1/turn body, in order, and NOT in the platform context request", async () => {
    const calls = bridge();
    const a = img("image/png"), b = img("image/webp"), c = img("image/gif"), d = img("image/jpeg");
    await client.sendTurn(U, { thread: "T", images: [a, b, c, d] });
    const turnBody = JSON.parse(String(calls.find((x) => x.url === `${BRIDGE}/v1/turn`)!.init.body));
    expect(turnBody.images).toEqual([a, b, c, d]);
    const ctxText = String(calls.find((x) => x.url === CONTEXT_URL)!.init.body);
    expect(ctxText).not.toContain(a.data);
    expect(ctxText).not.toContain("images");
    expect(JSON.parse(ctxText).userText).toBe("hi");
  });

  it("no pictures: no images field", async () => {
    const calls = bridge();
    await client.sendTurn(U, { thread: "T" });
    expect(JSON.parse(String(calls.find((x) => x.url === `${BRIDGE}/v1/turn`)!.init.body))).not.toHaveProperty("images");
    const c2 = bridge();
    await client.sendTurn(U, { thread: "T", images: [] });
    expect(JSON.parse(String(c2.find((x) => x.url === `${BRIDGE}/v1/turn`)!.init.body))).not.toHaveProperty("images");
  });

  it("each rule breach throws ClaudeCodeBridgeError(400, sentence) before any request", async () => {
    const good = img();
    const bad: Record<string, unknown> = {
      "5 pictures": [good, good, good, good, good],
      "not a list": "x",
      "unknown type": [{ mediaType: "image/svg+xml", data: good.data }],
      "no data": [{ mediaType: "image/png" }],
      "data: prefix": [{ mediaType: "image/png", data: `data:image/png;base64,${good.data}` }],
      "not base64": [{ mediaType: "image/png", data: "@@@@" }],
      "empty": [{ mediaType: "image/png", data: "" }],
      "jpeg bytes as png": [{ mediaType: "image/png", data: img("image/jpeg").data }],
      "text as png": [{ mediaType: "image/png", data: btoa("not a picture at all") }],
      "5 MiB + 1": [img("image/png", 5 * MiB + 1)],
      "11 MiB together": [img("image/png", 5 * MiB), img("image/png", 5 * MiB), img("image/png", 1 * MiB)],
    };
    for (const [name, images] of Object.entries(bad)) {
      fetchMock.mockClear();
      const err = await client.sendTurn(U, { thread: "T", images: images as never }).then(() => null, (e) => e);
      expect(err, name).toBeInstanceOf(ClaudeCodeBridgeError);
      expect(err.status, name).toBe(400);
      expect(err.message.length, name).toBeGreaterThan(10);
      expect(fetchMock, name).not.toHaveBeenCalled();
    }
  });

  it("5 MiB and exactly 10 MiB together pass", async () => {
    const calls = bridge();
    await client.sendTurn(U, { thread: "T", images: [img("image/png", 5 * MiB), img("image/png", 5 * MiB)] });
    expect(calls.some((x) => x.url === `${BRIDGE}/v1/turn`)).toBe(true);
  });
});

describe("bridgeInfo images option", () => {
  const hello = (options: unknown) => fetchMock.mockImplementation(async () => json(200, { bridge: "gilb-claude-code-bridge", build: "0.3.6", options }));
  const base = { models: ["opus"], efforts: ["low"], delegateCoding: true };
  it("is parsed", async () => {
    hello({ ...base, images: { maxCount: 4, maxBytes: 5242880, types: ["image/png", "image/jpeg", "image/gif", "image/webp"] } });
    expect((await client.bridgeInfo()).options?.images).toEqual({ maxCount: 4, maxBytes: 5242880, types: ["image/png", "image/jpeg", "image/gif", "image/webp"] });
  });
  it("keeps only known types", async () => {
    hello({ ...base, images: { maxCount: 4, maxBytes: 5242880, types: ["image/png", "image/svg+xml", 7] } });
    expect((await client.bridgeInfo()).options?.images?.types).toEqual(["image/png"]);
  });
  it("drops it when the numbers are not whole positive numbers, or it is absent (older bridge)", async () => {
    for (const images of [{ maxCount: "4", maxBytes: 5, types: [] }, { maxCount: 0, maxBytes: 5, types: [] }, { maxCount: 4, maxBytes: 1.5, types: [] }, { maxCount: 4, maxBytes: 5 }, "x", null]) {
      hello({ ...base, images });
      const o = (await client.bridgeInfo()).options;
      expect(o, JSON.stringify(images)).toBeDefined();
      expect(o).not.toHaveProperty("images");
    }
    hello(base);
    expect((await client.bridgeInfo()).options).not.toHaveProperty("images");
  });
});
