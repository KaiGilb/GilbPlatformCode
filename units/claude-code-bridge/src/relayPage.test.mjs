/**
 * The guards INSIDE the relay page's script, run as the browser would run them.
 * The page is built by the real `relayPage()` from the built bridge/bridge.mjs (the file the other tests import); its inline
 * script is pulled out of the html and run in a node:vm context with a hand-made window, document, location and fetch.
 * One source of truth: the script text in bridge.ts. Nothing here copies the guards.
 */
import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { relayPage } from "../bridge/bridge.mjs";

const GILB = "https://gilb.com";
const OTHER = "https://other.example";
const EVIL = "https://evil.example";
const SELF = "http://127.0.0.1:47821";

/** Runs the page script. Returns helpers to post a message "from" a source/origin and to read what the page did. */
function boot({ pending = false } = {}) {
  const { html } = relayPage([GILB, OTHER]);
  const m = /<script>([\s\S]*)<\/script>/.exec(html);
  expect(m).not.toBeNull();
  const sent = []; // what the page posted to its opener: { msg, target }
  const fetches = []; // what the page fetched: { url, init }
  const opener = { closed: false, postMessage: (msg, target) => sent.push({ msg, target }) };
  const status = { textContent: "" };
  const intervals = []; // the page's setInterval callbacks
  const aborted = []; // the paths of requests whose fetch was aborted (only when `pending`)
  let handler = null;
  const win = {
    opener,
    document: { getElementById: () => status },
    location: { origin: SELF },
    addEventListener: (type, fn) => {
      if (type === "message") handler = fn;
    },
    setInterval: (fn) => {
      intervals.push(fn);
      return 0;
    },
    fetch: (url, init) => {
      fetches.push({ url, init });
      if (pending) {
        // A request that never answers, like a turn's stream: it ends only when the page's signal aborts it.
        return new Promise((_, reject) => init.signal.addEventListener("abort", () => { aborted.push(url); reject(new Error("aborted")); }));
      }
      return Promise.resolve({
        status: 200,
        headers: { get: (k) => (k === "content-type" ? "application/json" : null) },
        text: () => Promise.resolve("{}"),
      });
    },
  };
  const ctx = vm.createContext({
    window: win,
    document: win.document,
    location: win.location,
    addEventListener: win.addEventListener,
    setInterval: win.setInterval,
    fetch: win.fetch,
    URL,
    AbortController,
    TextDecoder,
  });
  vm.runInContext(m[1], ctx);
  expect(handler).toBeTypeOf("function");
  const post = (data, { source = opener, origin = GILB } = {}) => handler({ data, source, origin });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const replies = () => sent.filter((s) => s.msg.type !== "gilb-bridge-ready");
  return { post, settle, sent, fetches, opener, status, replies, intervals, aborted };
}

const req = (path, extra = {}) => ({ type: "gilb-bridge-req", id: "1", path, ...extra });

describe("relay page script guards", () => {
  it("says ready to each allowed origin only, and answers a good request through fetch", async () => {
    const p = boot();
    expect(p.sent.map((s) => s.target)).toEqual([GILB, OTHER]);
    p.post(req("/v1/hello"));
    await p.settle();
    expect(p.fetches.length).toBe(1);
    expect(p.fetches[0].url).toBe("/v1/hello");
    expect(p.replies().map((r) => r.msg.type)).toEqual(["gilb-bridge-head", "gilb-bridge-res"]);
  });

  it("ignores a message whose source is not the opener", async () => {
    const p = boot();
    p.post(req("/v1/hello"), { source: { postMessage() {} } });
    p.post(req("/v1/hello"), { source: null });
    await p.settle();
    expect(p.fetches.length).toBe(0);
    expect(p.replies().length).toBe(0);
  });

  it("ignores a message from an origin that is not on the allow-list", async () => {
    const p = boot();
    for (const origin of [EVIL, SELF, "null", ""]) p.post(req("/v1/hello"), { origin });
    await p.settle();
    expect(p.fetches.length).toBe(0);
    expect(p.replies().length).toBe(0);
    expect(p.status.textContent).toBe("");
  });

  it("binds to the first accepted origin and ignores a second listed origin", async () => {
    const p = boot();
    p.post(req("/v1/hello"), { origin: GILB });
    await p.settle();
    const before = p.fetches.length;
    p.post(req("/v1/hello", { id: "2" }), { origin: OTHER });
    p.post({ type: "gilb-bridge-abort", id: "1" }, { origin: OTHER });
    await p.settle();
    expect(p.fetches.length).toBe(before);
    expect(p.replies().every((r) => r.target === GILB)).toBe(true);
    expect(p.status.textContent).toBe(`Connected to ${GILB}`);
  });

  it.each([
    "/v1/../control/code",
    "/v1/%2e%2e/control/code",
    "/v1/%2E%2E/control/unpair-all",
    "/v1/hello/../../control/code",
    "/v1",
    "/V1/hello",
    "/relay",
    "/control/code",
    "//evil.example/v1/hello",
    "/\\evil.example/v1/hello",
    "http://evil.example/v1/hello",
    "https://gilb.com/v1/hello",
    "",
  ])("refuses path %j and never fetches", async (path) => {
    const p = boot();
    p.post(req(path));
    await p.settle();
    expect(p.fetches.length).toBe(0);
    expect(p.replies()).toEqual([{ msg: { type: "gilb-bridge-err", message: "Not an allowed request.", id: "1" }, target: GILB }]);
  });

  it("refuses odd methods and non-string paths", async () => {
    const p = boot();
    for (const method of ["PUT", "DELETE", "post", "OPTIONS", "HEAD"]) p.post(req("/v1/hello", { method }));
    p.post(req(null));
    p.post(req({ toString: () => "/control/code" }, {}));
    await p.settle();
    // a path object that stringifies to /control/code is still outside /v1/
    expect(p.fetches.length).toBe(0);
  });

  it("drops headers outside the whitelist and sets x-gilb-relay-origin last, to the bound origin", async () => {
    const p = boot();
    p.post(
      req("/v1/hello", {
        headers: {
          "Content-Type": "application/json",
          "x-bridge-secret": "s3",
          Accept: "*/*",
          "x-gilb-relay-origin": EVIL,
          "X-Gilb-Relay-Origin": OTHER,
          cookie: "a=b",
          host: "evil.com",
          origin: EVIL,
          authorization: "Bearer x",
        },
      }),
    );
    await p.settle();
    expect(p.fetches.length).toBe(1);
    expect(p.fetches[0].init.headers).toEqual({
      "content-type": "application/json",
      "x-bridge-secret": "s3",
      accept: "*/*",
      "x-gilb-relay-origin": GILB,
    });
  });
});

describe("relay page: the opener goes away (0.3.2)", () => {
  const open = (p, n) => {
    for (let i = 1; i <= n; i++) p.post(req("/v1/turn", { id: String(i), method: "POST", body: "{}" }));
  };

  it("a gilb-bridge-bye from the page aborts every open request, and tells each one it was aborted", async () => {
    const p = boot({ pending: true });
    open(p, 2);
    await p.settle();
    expect(p.fetches.length).toBe(2);
    expect(p.aborted).toEqual([]);
    p.post({ type: "gilb-bridge-bye" });
    await p.settle();
    expect(p.aborted).toEqual(["/v1/turn", "/v1/turn"]);
    expect(p.replies().map((r) => r.msg.message)).toEqual(["aborted", "aborted"]);
  });

  it("the opener closing aborts them too (the window's own check)", async () => {
    const p = boot({ pending: true });
    open(p, 1);
    await p.settle();
    expect(p.intervals.length).toBe(1);
    p.intervals[0](); // the opener is still there: nothing happens
    await p.settle();
    expect(p.aborted).toEqual([]);
    p.opener.closed = true;
    p.intervals[0]();
    await p.settle();
    expect(p.aborted).toEqual(["/v1/turn"]);
    expect(p.status.textContent).toMatch(/has closed/);
  });

  it("a bye from a page that is not the opener, or from another origin, aborts nothing", async () => {
    const p = boot({ pending: true });
    open(p, 1);
    await p.settle();
    p.post({ type: "gilb-bridge-bye" }, { source: { postMessage() {} } });
    p.post({ type: "gilb-bridge-bye" }, { origin: EVIL });
    p.post({ type: "gilb-bridge-bye" }, { origin: OTHER }); // allowed, but the window is bound to the first origin
    await p.settle();
    expect(p.aborted).toEqual([]);
  });
});
