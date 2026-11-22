import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClaudeCodeClient } from "./client";

// Every fake bridge answer below is MEASURED from the bridge code of PR #305 (units/claude-code-bridge/src/bridge.ts at 4c739088:
// PreviewRefusal bodies, handlePreview, the router's `json(res, 404, { error: "not found" })`), read 2026-11-22. Where an answer is
// NOT in that code it is labelled GUESS. The live-bridge probe is in the PR text; these tests never reach a real bridge.

const PLATFORM = "https://platform.example.test";
const BRIDGE = "http://127.0.0.1:47821";
const SESSION = "11111111-2222-4333-8444-555555555555";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sse = (events: [string, unknown][]) =>
  new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });

let fetchMock: ReturnType<typeof vi.fn>;
const mk = () => createClaudeCodeClient({ principal: "p", platformOrigin: PLATFORM, bridgeUrl: BRIDGE, getAuthHeaders: () => ({}) });
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

/** A client that is paired, and whose next bridge answer is `answer`. */
function paired(answer: Response | Error) {
  const client = mk();
  client.save("s3cret");
  if (answer instanceof Error) fetchMock.mockRejectedValueOnce(answer);
  else fetchMock.mockResolvedValueOnce(answer);
  return client;
}

describe("preview(): one result per answer", () => {
  it("200 (measured: handlePreview returns startPreview's { url, project, folder }) is ok with the address", async () => {
    const client = paired(json(200, { url: "http://127.0.0.1:5280/", project: "alpha", folder: "dist" }));
    expect(await client.preview("alpha")).toEqual({ ok: true, url: "http://127.0.0.1:5280/", project: "alpha", folder: "dist" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BRIDGE}/v1/preview`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-bridge-secret"]).toBe("s3cret");
    expect(JSON.parse(String(init.body))).toEqual({ project: "alpha" });
  });

  const table: [string, number, unknown, unknown][] = [
    ["400 bad-project (measured)", 400, { error: "bad-project" }, { ok: false, code: "bad-project" }],
    ["404 no-build keeps the bridge's message (measured)", 404, { error: "no-build", message: "No build yet for alpha. Run npm run build in the project folder, then press Open again." }, { ok: false, code: "no-build", message: "No build yet for alpha. Run npm run build in the project folder, then press Open again." }],
    ["404 route missing in an older bridge (measured: { error: \"not found\" })", 404, { error: "not found" }, { ok: false, code: "unsupported" }],
    ["404 route missing, body not JSON (GUESS: a proxy or very old bridge)", 404, "<html>", { ok: false, code: "unsupported" }],
    ["404 bridge has no code folder (measured NO_WORKSPACE) is a refusal, not a missing route", 404, { error: "This bridge has no code folder. Start it with --workspace <folder>." }, { ok: false, code: "failed", message: "This bridge has no code folder. Start it with --workspace <folder>." }],
    ["409 no-port (measured, with message)", 409, { error: "no-port", message: "Pin this project's port." }, { ok: false, code: "no-port", message: "Pin this project's port." }],
    ["409 bad-port (measured, port)", 409, { error: "bad-port", port: 3000 }, { ok: false, code: "bad-port", port: 3000 }],
    ["409 port-in-use (measured, port)", 409, { error: "port-in-use", port: 5280 }, { ok: false, code: "port-in-use", port: 5280 }],
    ["409 origin-paired (measured, port)", 409, { error: "origin-paired", port: 5280 }, { ok: false, code: "origin-paired", port: 5280 }],
    ["409 build-changed (measured, message)", 409, { error: "build-changed", message: "The build changed while it was being opened. Press Open again." }, { ok: false, code: "build-changed", message: "The build changed while it was being opened. Press Open again." }],
    ["409 no-preview-place (measured, message)", 409, { error: "no-preview-place", message: "No place." }, { ok: false, code: "no-preview-place", message: "No place." }],
    ["409 with a code this client does not know falls back to failed, keeping the message (measured: preview-cancelled)", 409, { error: "preview-cancelled", message: "The preview was stopped while it was starting." }, { ok: false, code: "failed", message: "The preview was stopped while it was starting." }],
    ["409 with a code from a newer bridge (GUESS)", 409, { error: "something-new" }, { ok: false, code: "failed" }],
    ["413 build-too-large (measured)", 413, { error: "build-too-large" }, { ok: false, code: "build-too-large" }],
    ["503 closing (measured: { error: \"The bridge is stopping.\" })", 503, { error: "The bridge is stopping." }, { ok: false, code: "closing" }],
    ["401 not paired (measured: \"Pair first.\")", 401, { error: "Pair first." }, { ok: false, code: "unpaired" }],
    ["403 (GUESS: an origin the bridge refuses)", 403, { error: "no" }, { ok: false, code: "unpaired" }],
    ["500 bridge error (measured)", 500, { error: "bridge error" }, { ok: false, code: "failed" }],
    ["200 without an address (GUESS: a broken answer)", 200, {}, { ok: false, code: "failed" }],
  ];
  it.each(table)("%s", async (_name, status, body, want) => {
    const client = paired(typeof body === "string" ? new Response(body, { status }) : json(status, body));
    expect(await client.preview("alpha")).toEqual(want);
  });

  it("a network failure is unreachable and does not throw", async () => {
    const client = paired(new TypeError("Failed to fetch"));
    expect(await client.preview("alpha")).toEqual({ ok: false, code: "unreachable" });
  });

  it("not paired: unpaired without any request", async () => {
    expect(await mk().preview("alpha")).toEqual({ ok: false, code: "unpaired" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("preview(): routing", () => {
  const win = { closed: false, postMessage: vi.fn(), focus: vi.fn(), close: vi.fn() };
  const reqs = () => win.postMessage.mock.calls.map((c) => c[0] as { type: string; id: string; path: string; method: string; headers: Record<string, string>; body?: string }).filter((m) => m.type === "gilb-bridge-req");
  const deliver = (data: unknown) => {
    const ev = new Event("message");
    Object.defineProperties(ev, { data: { value: data }, source: { value: win }, origin: { value: BRIDGE } });
    window.dispatchEvent(ev);
  };
  beforeEach(() => {
    win.closed = false;
    win.postMessage = vi.fn();
    const open = vi.fn(() => win);
    vi.stubGlobal("open", open);
    (window as unknown as { open: unknown }).open = open;
  });

  it("relay open: the call goes through the relay window and never directly (relay message shape measured from the bridge's relay page script)", async () => {
    const client = mk();
    client.save("s3cret");
    const opening = client.openRelay();
    deliver({ type: "gilb-bridge-ready", build: "0.3.22" });
    expect(await opening).toBe(true);
    const p = client.preview("alpha");
    for (let i = 0; i < 100000 && reqs().length === 0; i++) await new Promise((r) => setImmediate(r));
    const req = reqs()[0]!;
    expect(req.path).toBe("/v1/preview");
    expect(req.method).toBe("POST");
    expect(req.headers["x-bridge-secret"]).toBe("s3cret");
    expect(JSON.parse(req.body!)).toEqual({ project: "alpha" });
    deliver({ type: "gilb-bridge-head", id: req.id, status: 409, contentType: "application/json" }); // the relay page sends the real status in the head, then in the res
    deliver({ type: "gilb-bridge-res", id: req.id, status: 409, headers: {}, body: JSON.stringify({ error: "port-in-use", port: 5280 }) });
    expect(await p).toEqual({ ok: false, code: "port-in-use", port: 5280 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("relay closed: the call goes directly and nothing is posted to a window", async () => {
    const client = paired(json(200, { url: "http://127.0.0.1:5280/", project: "alpha", folder: "build" }));
    expect((await client.preview("alpha")).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(win.postMessage).not.toHaveBeenCalled();
  });

  it("the relay window going away is unreachable, not a throw", async () => {
    const client = mk();
    client.save("s3cret");
    const opening = client.openRelay();
    deliver({ type: "gilb-bridge-ready", build: "0.3.22" });
    await opening;
    const p = client.preview("alpha");
    for (let i = 0; i < 100000 && reqs().length === 0; i++) await new Promise((r) => setImmediate(r));
    win.closed = true;
    client.closeRelay();
    expect(await p).toEqual({ ok: false, code: "unreachable" });
  });
});

describe("sendTurn: client.preview", () => {
  const CONTEXT = { system: "You are the agent.", tools: [] };
  const bodyOf = (): Record<string, unknown> => JSON.parse(String((fetchMock.mock.calls.find((c) => (c[0] as string) === `${BRIDGE}/v1/turn`)![1] as RequestInit).body));
  async function send(extra: Record<string, unknown>) {
    const client = mk();
    client.save("s3cret");
    fetchMock.mockImplementation(async (url: string) => {
      if (url === `${PLATFORM}/base/ai/claude-code/context`) return json(200, CONTEXT);
      if (url === `${BRIDGE}/v1/turn`) return sse([["start", { ok: true, turnId: "t1" }], ["message", { role: "assistant", content: "done", model: "m", sessionId: SESSION }]]);
      throw new Error(`unexpected ${url}`);
    });
    await client.sendTurn([{ role: "user", content: "hi" }], { thread: "T", mode: "code", ...extra });
    return bodyOf();
  }

  it("client.preview === true sends exactly { client: { preview: true } }", async () => {
    expect((await send({ client: { preview: true } })).client).toEqual({ preview: true });
  });
  it.each([[{ client: { preview: false } }], [{ client: {} }], [{}], [{ client: { preview: "true" } }], [{ client: { preview: 1 } }]])("%j sends no client key", async (extra) => {
    expect("client" in (await send(extra))).toBe(false);
  });
  it("extra fields on client are dropped, never spread", async () => {
    const body = await send({ client: { preview: true, foo: "bar" } });
    expect(body.client).toEqual({ preview: true });
  });
});
