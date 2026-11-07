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
function boot() {
  const { html } = relayPage([GILB, OTHER]);
  const m = /<script>([\s\S]*)<\/script>/.exec(html);
  expect(m).not.toBeNull();
  const sent = []; // what the page posted to its opener: { msg, target }
  const fetches = []; // what the page fetched: { url, init }
  const opener = { closed: false, postMessage: (msg, target) => sent.push({ msg, target }) };
  const status = { textContent: "" };
  let handler = null;
  const win = {
    opener,
    document: { getElementById: () => status },
    location: { origin: SELF },
    addEventListener: (type, fn) => {
      if (type === "message") handler = fn;
    },
    setInterval: () => 0,
    fetch: (url, init) => {
      fetches.push({ url, init });
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
  return { post, settle, sent, fetches, opener, status, replies };
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
