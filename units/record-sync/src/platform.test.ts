// New tests: the exports of platform.ts, pinned.
import { describe, expect, it, vi } from "vitest";
import { PlatformError, expectStatus, request, routeUrl, vaultSegment, type PlatformAnswer, type PlatformClient } from "./platform";

const ORIGIN = "https://holder.platform.example.test";
function client(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const sent: { url: string; init?: RequestInit }[] = [];
  const platform: PlatformClient = { origin: ORIGIN, fetch: async (url, init) => { sent.push({ url, init }); return handler(url, init); } };
  return { platform, sent };
}

async function thrown(p: Promise<unknown>): Promise<PlatformError> {
  try {
    await p;
  } catch (e) {
    return e as PlatformError;
  }
  throw new Error("did not throw");
}

describe("PlatformError", () => {
  it("is an Error named PlatformError that carries the status, the url and the body", () => {
    const e = new PlatformError("no", 404, "https://h.example.test/x", "{}");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("PlatformError");
    expect([e.message, e.status, e.url, e.body]).toEqual(["no", 404, "https://h.example.test/x", "{}"]);
  });
});

describe("routeUrl and vaultSegment", () => {
  it("routeUrl puts the path on the client's origin whatever the slashes at the joint", () => {
    expect(routeUrl({ origin: `${ORIGIN}///`, fetch: fetch }, "/lws/vaults")).toBe(`${ORIGIN}/lws/vaults`);
    expect(routeUrl({ origin: ORIGIN, fetch: fetch }, "lws/vaults")).toBe(`${ORIGIN}/lws/vaults`);
    expect(routeUrl({ origin: ORIGIN, fetch: fetch }, "//a/b")).toBe(`${ORIGIN}/a/b`);
  });
  it("vaultSegment percent-encodes the vault id as one path segment", () => {
    expect(vaultSegment("https://holder.example.test/vault")).toBe("https%3A%2F%2Fholder.example.test%2Fvault");
    expect(vaultSegment("a b")).toBe("a%20b");
  });
});

describe("request", () => {
  it("sends the method alone for a body-less call, and reads a JSON object", async () => {
    const c = client(() => Response.json({ a: 1 }, { status: 200, headers: { "x-k": "v" } }));
    const a = await request(c.platform, "GET", `${ORIGIN}/x`);
    expect(c.sent[0]!.init).toEqual({ method: "GET" });
    expect(a.status).toBe(200);
    expect(a.url).toBe(`${ORIGIN}/x`);
    expect(a.json).toEqual({ a: 1 });
    expect(a.text).toBe('{"a":1}');
    expect(a.headers.get("x-k")).toBe("v");
  });
  it("passes the cache mode and the headers on, and a body is sent as JSON with a content type", async () => {
    const c = client(() => new Response("", { status: 201 }));
    await request(c.platform, "POST", `${ORIGIN}/y`, { k: 1 }, { "x-a": "b" }, "no-store");
    expect(c.sent[0]!.init).toEqual({ method: "POST", cache: "no-store", headers: { "content-type": "application/json", "x-a": "b" }, body: '{"k":1}' });
    await request(c.platform, "GET", `${ORIGIN}/z`, undefined, { "x-a": "b" });
    expect(c.sent[1]!.init).toEqual({ method: "GET", headers: { "x-a": "b" } });
  });
  it("an empty body, text that is not JSON, and JSON that is not an object are all json null", async () => {
    for (const body of ["", "<html>", "[1,2]", "7", "null"]) {
      const c = client(() => new Response(body, { status: 200 }));
      const a = await request(c.platform, "GET", `${ORIGIN}/x`);
      expect(a.json).toBeNull();
      expect(a.text).toBe(body);
    }
  });
  it("a status that is not a success is an answer, not an error", async () => {
    const c = client(() => Response.json({ error: "NotFound" }, { status: 404 }));
    const a = await request(c.platform, "GET", `${ORIGIN}/x`);
    expect(a.status).toBe(404);
    expect(a.json).toEqual({ error: "NotFound" });
  });
  it("a fetch that fails is a PlatformError with status 0 and the method and url in the message", async () => {
    const platform: PlatformClient = { origin: ORIGIN, fetch: async () => { throw new TypeError("offline"); } };
    const e = await thrown(request(platform, "PUT", `${ORIGIN}/x`));
    expect(e).toBeInstanceOf(PlatformError);
    expect(e.status).toBe(0);
    expect(e.url).toBe(`${ORIGIN}/x`);
    expect(e.message).toBe(`PUT ${ORIGIN}/x could not be reached: TypeError: offline`);
  });
  it("a bound with a timeout ends a silent request as could-not-be-reached and aborts the signal the fetch was given", async () => {
    let signal: AbortSignal | undefined;
    const platform: PlatformClient = { origin: ORIGIN, fetch: (_u, init) => { signal = init?.signal ?? undefined; return new Promise<Response>(() => {}); } };
    const e = await thrown(request(platform, "GET", `${ORIGIN}/x`, undefined, undefined, undefined, { timeoutMs: 20 }));
    expect(e).toBeInstanceOf(PlatformError);
    expect(e.status).toBe(0);
    expect(e.message).toBe(`GET ${ORIGIN}/x could not be reached: no answer in 20 ms`);
    expect(signal!.aborted).toBe(true);
  });
  it("a bound with a signal ends the request when it aborts; one already aborted sends nothing it waits for", async () => {
    const ac = new AbortController();
    const platform: PlatformClient = { origin: ORIGIN, fetch: () => new Promise<Response>(() => {}) };
    const p = request(platform, "GET", `${ORIGIN}/x`, undefined, undefined, undefined, { signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toThrow(/could not be reached: cancelled/);
    await expect(request(platform, "GET", `${ORIGIN}/x`, undefined, undefined, undefined, { signal: ac.signal })).rejects.toThrow(/cancelled/);
  });
  it("a bound that never fires leaves the answer alone and removes its listener and timer", async () => {
    const ac = new AbortController();
    const add = vi.spyOn(ac.signal, "addEventListener");
    const remove = vi.spyOn(ac.signal, "removeEventListener");
    const c = client(() => Response.json({ ok: true }));
    const a = await request(c.platform, "GET", `${ORIGIN}/x`, undefined, undefined, undefined, { signal: ac.signal, timeoutMs: 10_000 });
    expect(a.json).toEqual({ ok: true });
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it("an empty bound (neither a signal nor a timeout) is the plain request", async () => {
    const c = client(() => Response.json({}));
    await request(c.platform, "GET", `${ORIGIN}/x`, undefined, undefined, undefined, {});
    expect(c.sent[0]!.init).toEqual({ method: "GET" });
  });
});

describe("expectStatus", () => {
  const answer = (status: number, text = ""): PlatformAnswer => ({ status, url: "https://h.example.test/base/tag/masters", headers: new Headers(), json: null, text });

  it("hands an answer with an accepted status back unchanged: the same object", () => {
    const a = answer(200, "{}");
    expect(expectStatus(a, "POST", [200, 201])).toBe(a);
    const b = answer(201);
    expect(expectStatus(b, "POST", [200, 201])).toBe(b);
  });

  it("throws a PlatformError with the status, the url and the body, and a message that says what was asked and what came back", () => {
    let caught: unknown;
    try {
      expectStatus(answer(403, "no way"), "POST", [200]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PlatformError);
    const e = caught as PlatformError;
    expect(e.status).toBe(403);
    expect(e.url).toBe("https://h.example.test/base/tag/masters");
    expect(e.body).toBe("no way");
    expect(e.message).toBe("POST https://h.example.test/base/tag/masters answered 403: no way");
  });

  it("cuts the body in the message to 300 characters and keeps all of it on the error", () => {
    const long = "x".repeat(400);
    let caught: unknown;
    try {
      expectStatus(answer(500, long), "GET", [200]);
    } catch (e) {
      caught = e;
    }
    const e = caught as PlatformError;
    expect(e.message).toBe(`GET https://h.example.test/base/tag/masters answered 500: ${"x".repeat(300)}`);
    expect(e.body).toBe(long);
  });

  it("refuses every status when none is accepted, and accepts only the listed ones", () => {
    expect(() => expectStatus(answer(200), "GET", [])).toThrow(PlatformError);
    expect(() => expectStatus(answer(204), "GET", [200])).toThrow(PlatformError);
    expect(expectStatus(answer(204), "GET", [200, 204]).status).toBe(204);
  });
});
