// A 429 is told apart and waited out (Retry-After, bounded, no tight loop); a hung request ends as "could not be reached"; an
// abandoned request is cancelled when the card is closed, reloaded or unlinked.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOnlineCardController, DEFAULT_BUSY_WAIT_MS, MAX_BUSY_WAIT_MS, MIN_BUSY_WAIT_MS, type ControllerDeps } from "./controller";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";

const RECORD = "https://h.test/base/e/r1", HOLDER = "https://h.test/vault", P = "https://k.test/vault", ENT = "https://k.test/vault/entity-x";
const SPELL = { heldParty: "a:heldParty", statedBy: "a:statedBy", sourceRecordId: "a:sourceRecordId", directReader: "a:directReader", claimType: "t:HeldPartyFieldClaim" };
const card = () => new Response(JSON.stringify({ fields: [{ principal: P, field: "a:email", value: "k@x.org", rung: "public", sourceEntity: "https://k.test/e/1" }] }), { status: 200 });
const resolved = () => new Response(JSON.stringify({ kind: "person", principal: P, entity: ENT }), { status: 200 });

type Handler = (path: string, init: RequestInit | undefined, n: number) => Promise<Response> | Response;
function mk(handler: Handler, over: Partial<ControllerDeps> = {}) {
  const calls: { path: string; signal?: AbortSignal | null }[] = [];
  const writes: unknown[] = [];
  const platform: PlatformClient = {
    origin: "https://id.test",
    fetch: async (url, init) => {
      const path = new URL(url).pathname;
      calls.push({ path, signal: init?.signal });
      return handler(path, init, calls.length);
    },
  };
  const deps: ControllerDeps = {
    platform,
    subject: { uri: RECORD, holder: HOLDER, link: { state: "linked", target: P } },
    canWrite: true,
    writeLink: async (l) => void writes.push(l),
    ...over,
  };
  return { deps, calls, writes };
}
const normal: Handler = (path) => (path.endsWith("online-card-anchor") ? resolved() : path.endsWith("public-card") ? card() : new Response("{}", { status: 404 }));
const busy = (retryAfter?: string): Handler => (path) => new Response("{}", { status: 429, headers: retryAfter === undefined ? {} : { "retry-after": retryAfter } });

afterEach(() => vi.useRealTimers());
/** Lets the requests the controller has started reach the fake fetch, with no wall-clock wait. */
const tick = () => vi.advanceTimersByTimeAsync(0);

describe("a 429 is 'busy', waited out, never retried in a loop", () => {
  it("reads Retry-After, says busy until then, and a load in the meantime asks nothing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const w = mk(busy("3"));
    const c = createOnlineCardController(w.deps);
    await c.load();
    expect(c.getState().online).toEqual({ status: "busy", retryAt: 1_003_000 });
    const n = w.calls.length;
    await c.load(true);
    await c.load();
    expect(w.calls.length).toBe(n);
  });
  it("tells the screen when the wait is over, and then asks again", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    let first = true;
    const w = mk((path, init, k) => {
      if (first && path.endsWith("online-card-anchor")) {
        first = false;
        return new Response("{}", { status: 429, headers: { "retry-after": "2" } });
      }
      return normal(path, init, k);
    });
    const c = createOnlineCardController(w.deps);
    let notified = 0;
    c.subscribe(() => notified++);
    await c.load();
    const before = notified;
    await vi.advanceTimersByTimeAsync(1999);
    expect(notified).toBe(before);
    await vi.advanceTimersByTimeAsync(2);
    expect(notified).toBeGreaterThan(before);
    await c.load(true);
    expect(c.getState().online.status).toBe("ready");
  });
  it("keeps the wait within bounds: none or 0 waits the minimum, a huge one the maximum, an HTTP date counts from now", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-10-18T10:00:00Z"));
    const at = async (h?: string) => {
      const c = createOnlineCardController(mk(busy(h)).deps);
      await c.load();
      const o = c.getState().online;
      c.dispose();
      return o.status === "busy" ? o.retryAt - Date.now() : -1;
    };
    // no readable Retry-After (a browser cannot read it cross-origin unless the platform exposes it): a fixed default, not the minimum
    expect(await at(undefined)).toBe(DEFAULT_BUSY_WAIT_MS);
    expect(DEFAULT_BUSY_WAIT_MS).toBe(5000);
    expect(await at("0")).toBe(MIN_BUSY_WAIT_MS);
    expect(await at("99999")).toBe(MAX_BUSY_WAIT_MS);
    expect(await at("Sun, 18 Oct 2026 10:00:07 GMT")).toBe(7000);
  });
  it("a 429 on the card read is busy too", async () => {
    const w = mk((path) => (path.endsWith("online-card-anchor") ? resolved() : new Response("{}", { status: 429, headers: { "retry-after": "1" } })));
    const c = createOnlineCardController(w.deps);
    await c.load();
    expect(c.getState().online.status).toBe("busy");
  });
  it("other failures stay 'unavailable' (a 503 is not busy)", async () => {
    const c = createOnlineCardController(mk(() => new Response("{}", { status: 503 })).deps);
    await c.load();
    expect(c.getState().online.status).toBe("unavailable");
  });
});

describe("a hung request ends, an abandoned one is cancelled", () => {
  const hang: Handler = () => new Promise<Response>(() => {});
  it("a hung resolver ends as 'unavailable' after the timeout, and Try again asks again", async () => {
    vi.useFakeTimers();
    let hung = true;
    const w = mk((p, i, k) => (hung ? hang(p, i, k) : normal(p, i, k)), { requestTimeoutMs: 10_000 });
    const c = createOnlineCardController(w.deps);
    const run = c.load();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(c.getState().online.status).toBe("loading");
    await vi.advanceTimersByTimeAsync(2);
    await run;
    expect(c.getState().online.status).toBe("unavailable");
    expect(w.calls[0]!.signal?.aborted).toBe(true);
    hung = false;
    await c.load(true);
    expect(c.getState().online.status).toBe("ready");
  });
  it("a request that answers leaves no timer behind", async () => {
    vi.useFakeTimers();
    const c = createOnlineCardController(mk(normal).deps);
    await c.load();
    expect(c.getState().online.status).toBe("ready");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("the default timeout is 10 s", async () => {
    vi.useFakeTimers();
    const c = createOnlineCardController(mk(hang).deps);
    const run = c.load();
    await vi.advanceTimersByTimeAsync(10_001);
    await run;
    expect(c.getState().online.status).toBe("unavailable");
  });
  it("a hung card read ends too", async () => {
    vi.useFakeTimers();
    const c = createOnlineCardController(mk((p, i, k) => (p.endsWith("online-card-anchor") ? resolved() : hang(p, i, k)), { requestTimeoutMs: 500 }).deps);
    const run = c.load();
    await vi.advanceTimersByTimeAsync(600);
    await run;
    expect(c.getState().online.status).toBe("unavailable");
  });
  it("a hung search ends as an error, not 'searching' forever", async () => {
    vi.useFakeTimers();
    const w = mk(hang, { subject: { uri: RECORD, holder: HOLDER, link: { state: "none" } }, requestTimeoutMs: 500 });
    const c = createOnlineCardController(w.deps);
    c.openFind("x");
    const run = c.search("x");
    await vi.advanceTimersByTimeAsync(600);
    await run;
    expect(c.getState().find.status).toBe("error");
  });
  it("an app-supplied resolve that hangs ends as 'unavailable' too", async () => {
    vi.useFakeTimers();
    const c = createOnlineCardController(mk(normal, { resolve: () => new Promise(() => {}), requestTimeoutMs: 300 }).deps);
    const run = c.load();
    await vi.advanceTimersByTimeAsync(400);
    await run;
    expect(c.getState().online.status).toBe("unavailable");
  });
  it("closing the card (dispose) cancels the request in flight", async () => {
    vi.useFakeTimers();
    const w = mk(hang);
    const c = createOnlineCardController(w.deps);
    void c.load();
    await tick();
    const s = w.calls[0]!.signal!;
    expect(s.aborted).toBe(false);
    c.dispose();
    expect(s.aborted).toBe(true);
  });
  it("a newer load cancels the older one; unlink cancels a read in flight", async () => {
    vi.useFakeTimers();
    const w = mk(hang);
    const c = createOnlineCardController(w.deps);
    void c.load();
    await tick();
    const first = w.calls[0]!.signal!;
    void c.load(true);
    await tick();
    expect(first.aborted).toBe(true);
    const second = w.calls[1]!.signal!;
    expect(second.aborted).toBe(false);
    await c.unlink();
    expect(second.aborted).toBe(true);
  });
  it("closing the search cancels it, and a newer search cancels the older", async () => {
    vi.useFakeTimers();
    const w = mk(hang, { subject: { uri: RECORD, holder: HOLDER, link: { state: "none" } } });
    const c = createOnlineCardController(w.deps);
    c.openFind("a");
    void c.search("a");
    await tick();
    const a = w.calls[0]!.signal!;
    void c.search("b");
    await tick();
    expect(a.aborted).toBe(true);
    const b = w.calls[1]!.signal!;
    c.closeFind();
    expect(b.aborted).toBe(true);
  });
});
