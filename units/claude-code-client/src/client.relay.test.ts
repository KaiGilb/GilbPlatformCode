import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { ClaudeCodeBridgeError, createClaudeCodeClient } from "./client";

const PLATFORM = "https://platform.example.test";
const BRIDGE = "http://127.0.0.1:47821";
const CLOSED_MSG = "The Claude Code bridge window was closed. Open it again to go on.";

interface FakeWin {
  closed: boolean;
  postMessage: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}
function fakeWin(): FakeWin {
  const w: FakeWin = {
    closed: false,
    postMessage: vi.fn(),
    focus: vi.fn(),
    close: vi.fn(() => {
      w.closed = true;
    }),
  };
  return w;
}
/** Delivers a message to the page the way the browser does: with `source` and `origin` set. */
function deliver(data: unknown, source: unknown, origin = BRIDGE) {
  const ev = new Event("message");
  Object.defineProperties(ev, { data: { value: data }, source: { value: source }, origin: { value: origin } });
  window.dispatchEvent(ev);
}

let fetchMock: ReturnType<typeof vi.fn>;
let win: FakeWin;
let openSpy: ReturnType<typeof vi.fn>;
function mk() {
  return createClaudeCodeClient({ principal: "p", platformOrigin: PLATFORM, bridgeUrl: BRIDGE, getAuthHeaders: () => ({}), startCommand: "run-bridge" });
}
beforeEach(() => {
  seenReqs = 0;
  win = fakeWin();
  openSpy = vi.fn(() => win);
  vi.stubGlobal("open", openSpy);
  (window as unknown as { open: unknown }).open = openSpy;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function openedClient() {
  const client = mk();
  const p = client.openRelay();
  deliver({ type: "gilb-bridge-ready", build: "0.1.7" }, win);
  expect(await p).toBe(true);
  return client;
}
const lastReq = () => {
  const calls = win.postMessage.mock.calls.filter((c) => (c[0] as { type: string }).type === "gilb-bridge-req");
  return calls[calls.length - 1]![0] as { id: string; path: string; method: string; headers: Record<string, string>; body?: string };
};
const tick = () => new Promise((r) => setImmediate(r));
let seenReqs = 0;
const reqCount = () => win.postMessage.mock.calls.filter((c) => (c[0] as { type: string }).type === "gilb-bridge-req").length;
/** Waits (real time) until the client has posted one more request than the last time this was called. */
const waitReq = async () => {
  for (let i = 0; i < 100000 && reqCount() <= seenReqs; i++) await new Promise((r) => setImmediate(r));
  seenReqs = reqCount();
};
const fakeTimers = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });

describe("every bridge call goes through one transport", () => {
  it("client.ts has exactly one bare fetch to the bridge, and it is inside bridgeRequest", () => {
    const src = fs.readFileSync(`${process.cwd()}/src/client.ts`, "utf8");
    const bare = src.match(/fetch\(`\$\{bridgeUrl\}/g) ?? [];
    expect(bare.length).toBe(1);
    const start = src.indexOf("function bridgeRequest(");
    const end = src.indexOf("\n  }\n", start);
    expect(src.slice(start, end)).toContain("fetch(`${bridgeUrl}");
    expect(/\bfetch\(\s*bridgeUrl/.test(src)).toBe(false);
    expect(/\bfetch\([^)]*bridgeUrl/.test(src.replace(/fetch\(`\$\{bridgeUrl\}\$\{path\}`/, ""))).toBe(false);
  });
});

describe("routing", () => {
  it("closed: a direct fetch, nothing posted", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ bridge: "gilb-claude-code-bridge" }), { status: 200 }));
    const client = mk();
    expect(await client.probe()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(`${BRIDGE}/v1/hello`);
    expect(win.postMessage).not.toHaveBeenCalled();
  });

  it("open: through the relay, never also direct; only the allowed headers; targetOrigin is the bridge origin", async () => {
    const client = await openedClient();
    const p = client.requestSecret("K7F-29Q");
    await waitReq();
    const req = lastReq();
    expect(req.path).toBe("/v1/pair");
    expect(req.method).toBe("POST");
    expect(JSON.parse(req.body!).code).toBe("K7F-29Q");
    expect(Object.keys(req.headers)).toEqual(["content-type"]);
    expect((win.postMessage.mock.calls.at(-1) ?? [])[1]).toBe(BRIDGE);
    deliver({ type: "gilb-bridge-head", id: req.id, status: 200, contentType: "application/json" }, win);
    deliver({ type: "gilb-bridge-res", id: req.id, status: 200, headers: { "content-type": "application/json" }, body: '{"secret":"abc"}' }, win);
    expect(await p).toBe("abc");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("chooseWorkspace goes through the open relay and still waits after 4 minutes (the dialog is open)", async () => {
    const client = await openedClient();
    client.save("s3cret");
    fakeTimers();
    const p = client.chooseWorkspace("MyJackfruitCode");
    await waitReq();
    const req = lastReq();
    expect(req.path).toBe("/v1/workspace/choose");
    expect(req.headers["x-bridge-secret"]).toBe("s3cret");
    expect(JSON.parse(req.body!)).toEqual({ suggest: "MyJackfruitCode" });
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
    deliver({ type: "gilb-bridge-head", id: req.id, status: 200, contentType: "application/json" }, win);
    deliver({ type: "gilb-bridge-res", id: req.id, status: 200, headers: {}, body: '{"chosen":true,"name":"MyCode","path":"/p/MyCode"}' }, win);
    expect(await p).toEqual({ chosen: true, name: "MyCode", path: "/p/MyCode" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("chooseWorkspace through the relay gives up only after 5 minutes 30 seconds", async () => {
    const client = await openedClient();
    client.save("s3cret");
    fakeTimers();
    const p = client.chooseWorkspace().catch((e) => e);
    await waitReq();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 31000);
    expect(((await p) as ClaudeCodeBridgeError).status).toBe(0);
  });

  it("workspaceInfo goes through the open relay, with the secret", async () => {
    const client = await openedClient();
    client.save("s3cret");
    const p = client.workspaceInfo();
    await waitReq();
    const req = lastReq();
    expect(req.path).toBe("/v1/workspace");
    expect(req.method).toBe("POST");
    expect(req.headers["x-bridge-secret"]).toBe("s3cret");
    deliver({ type: "gilb-bridge-head", id: req.id, status: 200, contentType: "application/json" }, win);
    deliver({ type: "gilb-bridge-res", id: req.id, status: 200, headers: {}, body: '{"name":"MyCode","path":"/p/MyCode"}' }, win);
    expect(await p).toEqual({ name: "MyCode", path: "/p/MyCode" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("probe and bridgeInfo go through the open relay", async () => {
    const client = await openedClient();
    const p = client.bridgeInfo();
    await waitReq();
    const req = lastReq();
    expect(req.path).toBe("/v1/hello");
    deliver({ type: "gilb-bridge-head", id: req.id, status: 200, contentType: "application/json" }, win);
    deliver({ type: "gilb-bridge-res", id: req.id, status: 200, headers: {}, body: '{"bridge":"gilb-claude-code-bridge","build":"0.1.7"}' }, win);
    expect(await p).toEqual({ reachable: true, build: "0.1.7", codeTurns: false, workspace: false, codeMode: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("disconnect sends the unpair through the open relay, without keepalive, and ignores a failure", async () => {
    const client = await openedClient();
    client.save("sec");
    client.disconnect();
    await waitReq();
    const req = lastReq();
    expect(req.path).toBe("/v1/unpair");
    expect(req.headers).toEqual({ "x-bridge-secret": "sec" });
    expect(req).not.toHaveProperty("keepalive");
    deliver({ type: "gilb-bridge-err", id: req.id, message: "boom" }, win);
    await tick();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("disconnect with the relay closed is a direct keepalive fetch", () => {
    fetchMock.mockResolvedValue(new Response("{}"));
    const client = mk();
    client.save("sec");
    client.disconnect();
    expect(fetchMock.mock.calls[0]![0]).toBe(`${BRIDGE}/v1/unpair`);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).keepalive).toBe(true);
  });
});

describe("a streamed answer", () => {
  it("head + chunk + end becomes a Response that the SSE reader parses (split across chunks)", async () => {
    const client = await openedClient();
    client.save("sec");
    // the turn calls the platform first; give it a minimal context, then the bridge streams
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/context")) return new Response(JSON.stringify({ system: "s", tools: [] }), { status: 200 });
      throw new Error("unexpected " + url);
    });
    const p = client.sendTurn([{ role: "user", content: "hi" }], { thread: "t" });
    for (let i = 0; i < 20 && !win.postMessage.mock.calls.some((c) => (c[0] as { type: string }).type === "gilb-bridge-req"); i++) await waitReq();
    const req = lastReq();
    expect(req.path).toBe("/v1/turn");
    expect(req.headers["x-bridge-secret"]).toBe("sec");
    deliver({ type: "gilb-bridge-head", id: req.id, status: 200, contentType: "text/event-stream" }, win);
    deliver({ type: "gilb-bridge-chunk", id: req.id, chunk: ": keepalive\n\nevent: start\ndata: {\"turnId\":\"T1\"}\n\nevent: mess" }, win);
    deliver({ type: "gilb-bridge-chunk", id: req.id, chunk: 'age\ndata: {"content":"héllo ✓","model":"m"}\n\n' }, win);
    deliver({ type: "gilb-bridge-end", id: req.id }, win);
    const reply = await p;
    expect(reply.content).toBe("héllo ✓");
    expect(reply.model).toBe("m");
  });

  it("an err before the head rejects like 'not reachable' (status 0)", async () => {
    const client = await openedClient();
    client.save("sec");
    const p = client.requestSecret("x");
    await waitReq();
    deliver({ type: "gilb-bridge-err", id: lastReq().id, message: "Failed to fetch" }, win);
    await expect(p).rejects.toMatchObject({ name: "ClaudeCodeBridgeError", status: 0, message: expect.stringContaining("not reachable") });
  });

  it("an err after the head errors the stream", async () => {
    const client = await openedClient();
    fetchMock.mockResolvedValue(new Response("{}"));
    // use the relay directly through probe-like path: a request whose body reader we hold
    const p = client.bridgeInfo();
    await waitReq();
    const req = lastReq();
    deliver({ type: "gilb-bridge-head", id: req.id, status: 200, contentType: "application/json" }, win);
    deliver({ type: "gilb-bridge-err", id: req.id, message: "network error" }, win);
    expect(await p).toEqual({ reachable: false, build: null, codeTurns: false, workspace: false, codeMode: null }); // the body could not be read: not reachable
  });

  it("an abort before the head posts gilb-bridge-abort and rejects as an aborted fetch (499)", async () => {
    const client = await openedClient();
    client.save("sec");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ system: "s", tools: [] }), { status: 200 }));
    const p = client.sendTurn([{ role: "user", content: "hi" }], { thread: "t" });
    const done = p.catch((e) => e);
    for (let i = 0; i < 20 && !win.postMessage.mock.calls.some((c) => (c[0] as { type: string }).type === "gilb-bridge-req"); i++) await waitReq();
    const req = lastReq();
    client.disconnect(); // aborts the running turn
    const err = await done;
    expect(err).toBeInstanceOf(ClaudeCodeBridgeError);
    expect((err as ClaudeCodeBridgeError).status).toBe(499);
    expect(win.postMessage).toHaveBeenCalledWith({ type: "gilb-bridge-abort", id: req.id }, BRIDGE);
  });

  it("an abort after the head errors the stream and posts abort", async () => {
    const client = await openedClient();
    client.save("sec");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ system: "s", tools: [] }), { status: 200 }));
    const p = client.sendTurn([{ role: "user", content: "hi" }], { thread: "t" });
    const done = p.catch((e) => e);
    for (let i = 0; i < 20 && !win.postMessage.mock.calls.some((c) => (c[0] as { type: string }).type === "gilb-bridge-req"); i++) await waitReq();
    const req = lastReq();
    deliver({ type: "gilb-bridge-head", id: req.id, status: 200, contentType: "text/event-stream" }, win);
    deliver({ type: "gilb-bridge-chunk", id: req.id, chunk: "event: start\ndata: {\"turnId\":\"T\"}\n\n" }, win);
    await tick();
    client.disconnect();
    const err = await done;
    expect((err as ClaudeCodeBridgeError).status).toBe(499);
    expect(win.postMessage).toHaveBeenCalledWith({ type: "gilb-bridge-abort", id: req.id }, BRIDGE);
  });
});

describe("cancel of a held stream", () => {
  it("cancelling the body reader posts gilb-bridge-abort (the unpair's body is cancelled once it has its head)", async () => {
    const client = await openedClient();
    client.save("sec");
    client.disconnect();
    await waitReq();
    const req = lastReq();
    expect(req.path).toBe("/v1/unpair");
    win.postMessage.mockClear();
    deliver({ type: "gilb-bridge-head", id: req.id, status: 200, contentType: "text/event-stream" }, win);
    await tick();
    expect(win.postMessage).toHaveBeenCalledWith({ type: "gilb-bridge-abort", id: req.id }, BRIDGE);
  });

  it("an error event in a relayed stream ends the turn with the bridge's message", async () => {
    const client = await openedClient();
    client.save("sec");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ system: "s", tools: [] }), { status: 200 }));
    const done = client.sendTurn([{ role: "user", content: "hi" }], { thread: "t" }).catch((e) => e);
    for (let i = 0; i < 20 && !win.postMessage.mock.calls.some((c) => (c[0] as { type: string }).type === "gilb-bridge-req"); i++) await waitReq();
    const req = lastReq();
    deliver({ type: "gilb-bridge-head", id: req.id, status: 200, contentType: "text/event-stream" }, win);
    deliver({ type: "gilb-bridge-chunk", id: req.id, chunk: 'event: error\ndata: {"message":"nope"}\n\n' }, win);
    await tick();
    deliver({ type: "gilb-bridge-end", id: req.id }, win);
    const err = await done;
    expect((err as ClaudeCodeBridgeError).status).toBe(502);
  });
});

describe("the window closes", () => {
  it("fails every open request with the exact message and goes to closed", async () => {
    fakeTimers();
    const client = mk();
    const op = client.openRelay();
    deliver({ type: "gilb-bridge-ready" }, win);
    expect(await op).toBe(true);
    const states: string[] = [];
    client.onRelayChange((s) => states.push(s));
    const a = client.requestSecret("a").catch((e) => e);
    const b = client.requestSecret("b").catch((e) => e);
    await waitReq();
    win.closed = true;
    await vi.advanceTimersByTimeAsync(1100);
    for (const e of [await a, await b]) {
      expect(e).toBeInstanceOf(ClaudeCodeBridgeError);
      expect((e as ClaudeCodeBridgeError).status).toBe(0);
      expect((e as ClaudeCodeBridgeError).message).toBe(CLOSED_MSG);
    }
    expect(client.relayState()).toBe("closed");
    expect(states).toEqual(["closed"]);
  });

  it("closeRelay closes the window and fails open requests", async () => {
    const client = await openedClient();
    const a = client.requestSecret("a").catch((e) => e);
    await waitReq();
    client.closeRelay();
    expect(win.close).toHaveBeenCalled();
    expect(((await a) as Error).message).toBe(CLOSED_MSG);
    expect(client.relayState()).toBe("closed");
  });

  it("a request with no head in 15 s fails like 'not reachable'", async () => {
    fakeTimers();
    const client = mk();
    const op = client.openRelay();
    deliver({ type: "gilb-bridge-ready" }, win);
    await op;
    const a = client.requestSecret("a").catch((e) => e);
    await waitReq();
    await vi.advanceTimersByTimeAsync(15100);
    const e = (await a) as ClaudeCodeBridgeError;
    expect(e.status).toBe(0);
    expect(e.message).toContain("not reachable");
  });
});

describe("messages that are not from our window", () => {
  it("a wrong origin or a wrong source is ignored", async () => {
    const client = await openedClient();
    const p = client.requestSecret("a").catch((e) => e);
    await waitReq();
    const id = lastReq().id;
    const res = { type: "gilb-bridge-res", id, status: 200, headers: {}, body: '{"secret":"evil"}' };
    deliver({ type: "gilb-bridge-head", id, status: 200, contentType: "application/json" }, win, "https://evil.example");
    deliver({ type: "gilb-bridge-head", id, status: 200, contentType: "application/json" }, fakeWin());
    deliver(res, fakeWin());
    deliver(res, win, "https://evil.example");
    let settled = false;
    void p.then(() => (settled = true));
    await tick();
    expect(settled).toBe(false);
    deliver({ type: "gilb-bridge-head", id, status: 200, contentType: "application/json" }, win);
    deliver({ ...res, body: '{"secret":"good"}' }, win);
    expect(await p).toBe("good");
  });

  it("a ready from a wrong origin or source does not open it", async () => {
    const client = mk();
    const p = client.openRelay();
    deliver({ type: "gilb-bridge-ready" }, win, "https://evil.example");
    deliver({ type: "gilb-bridge-ready" }, fakeWin());
    expect(client.relayState()).toBe("opening");
    deliver({ type: "gilb-bridge-ready" }, win);
    expect(await p).toBe(true);
    expect(client.relayState()).toBe("open");
  });
});

describe("openRelay", () => {
  it("returns false when window.open returns null (blocked)", async () => {
    openSpy.mockReturnValue(null);
    const client = mk();
    expect(await client.openRelay()).toBe(false);
    expect(client.relayState()).toBe("closed");
  });

  it("calls window.open with the right arguments before any microtask runs", async () => {
    let microtaskRan = false;
    let ranBeforeOpen: boolean | null = null;
    openSpy.mockImplementation(() => {
      ranBeforeOpen = microtaskRan;
      return win;
    });
    const client = mk();
    queueMicrotask(() => (microtaskRan = true));
    const p = client.openRelay();
    expect(ranBeforeOpen).toBe(false);
    expect(openSpy).toHaveBeenCalledWith(`${BRIDGE}/relay`, "gilb-claude-code-bridge", "popup,width=460,height=240");
    deliver({ type: "gilb-bridge-ready" }, win);
    await p;
  });

  it("times out after 10 s with false, and closes the silent window", async () => {
    fakeTimers();
    const client = mk();
    const states: string[] = [];
    client.onRelayChange((s) => states.push(s));
    const p = client.openRelay();
    await vi.advanceTimersByTimeAsync(10100);
    expect(await p).toBe(false);
    expect(win.close).toHaveBeenCalled();
    expect(states).toEqual(["opening", "closed"]);
  });

  it("returns false when the window closes first", async () => {
    fakeTimers();
    const client = mk();
    const p = client.openRelay();
    win.closed = true;
    await vi.advanceTimersByTimeAsync(1100);
    expect(await p).toBe(false);
    expect(client.relayState()).toBe("closed");
  });

  it("when already open, focuses the window and resolves true without opening another", async () => {
    const client = await openedClient();
    openSpy.mockClear();
    expect(await client.openRelay()).toBe(true);
    expect(openSpy).not.toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });

  it("onRelayChange reports changes and its unsubscribe stops them", async () => {
    const client = mk();
    const seen: string[] = [];
    const off = client.onRelayChange((s) => seen.push(s));
    const p = client.openRelay();
    deliver({ type: "gilb-bridge-ready" }, win);
    await p;
    off();
    client.closeRelay();
    expect(seen).toEqual(["opening", "open"]);
  });
});

describe("directBlocked", () => {
  it("is true when a direct hello throws a TypeError, false when it answers or the relay is open", async () => {
    const client = mk();
    fetchMock.mockRejectedValueOnce(new TypeError("Load failed"));
    expect(await client.directBlocked()).toBe(true);
    fetchMock.mockResolvedValueOnce(new Response("{}"));
    expect(await client.directBlocked()).toBe(false);
    const opened = await openedClient();
    fetchMock.mockClear();
    expect(await opened.directBlocked()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("is false when nothing comes back in 1.5 s", async () => {
    fakeTimers();
    fetchMock.mockImplementation((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")))));
    const p = mk().directBlocked();
    await vi.advanceTimersByTimeAsync(1600);
    expect(await p).toBe(false);
  });
});
