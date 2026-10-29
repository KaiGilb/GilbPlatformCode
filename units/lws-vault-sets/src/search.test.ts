import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchEntities, idFromEntityUri, SearchUnavailableError } from "./search";
import { NotSignedInError } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { setUp, tearDown, type FakeHost } from "../test/support";

function resp(status: number, opts: { body?: unknown } = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => opts.body,
    text: async () => JSON.stringify(opts.body ?? ""),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
let host: FakeHost;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  host = setUp();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tearDown();
});

function lastCall(): [string, RequestInit] {
  return fetchMock.mock.calls.at(-1) as [string, RequestInit];
}

describe("idFromEntityUri", () => {
  it("extracts the trailing opaque id from an entity URI", () => {
    expect(idFromEntityUri("https://localhost:8787/base/e/abc123")).toBe("abc123");
    expect(idFromEntityUri("bare")).toBe("bare");
  });
});

describe("searchEntities (GET /base/search)", () => {
  it("GETs q (+ facet) with a Bearer and returns count + ids + facets", async () => {
    fetchMock.mockResolvedValue(
      resp(200, {
        body: {
          count: 2,
          ids: ["https://localhost:8787/base/e/r1", "https://localhost:8787/base/e/r2"],
          facets: [{ key: "t:Note", count: 2 }],
        },
      }),
    );

    const out = await searchEntities("milk", ["Note"], "type");
    expect(out.count).toBe(2);
    expect(out.ids).toHaveLength(2);
    expect(out.facets).toEqual([{ key: "t:Note", count: 2 }]);

    const [url, init] = lastCall();
    expect(url).toContain("/base/search?");
    expect(url).toContain("q=milk");
    expect(url).toContain("type=Note");
    expect(url).toContain("facet=type");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).authorization).toBe("DPoP tok-bearer");
    expect((init.headers as Record<string, string>).dpop).toBe("proof-bearer");
    expect(host.bearerHeaderFor).toHaveBeenCalledWith(url);
  });

  it("a body with neither total nor count establishes NO total — ⛔ not zero", async () => {
    fetchMock.mockResolvedValue(resp(200, { body: {} }));
    const out = await searchEntities("x", ["Note"]);
    // 🔴 The old assertion was `{ count: 0, ids: [] }`, produced by
    // `body.count ?? 0`. That coalescing is the defect this landing removes: "the vault
    // established no total" and "the vault counted zero matches" are different facts, and
    // collapsing them printed "0 matches" — and, on the Standards tab, "the vault found
    // nothing matching X" — above rows that were on screen.
    expect(out).toEqual({ total: null, ids: [] });
  });

  // A transport-level failure is a REAL failure now — the route is CORS-covered, so a
  // rejected fetch means the vault could not be reached, not that the feature is unbuilt.
  it("maps a network throw to SearchUnavailableError", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(searchEntities("x", ["Note"])).rejects.toBeInstanceOf(SearchUnavailableError);
  });

  // 2026-07-19 audit P2.4 — INVERTED ASSERTION, deliberately.
  //
  // This used to assert that a 401 becomes SearchUnavailableError, on the belief that
  // "the route doesn't accept this token yet". That belief was false — /base/search binds
  // bearerFloorSurfacePrincipal and accepts exactly this token — so the 401 it was
  // modelling is the ordinary one every other call on this origin gets: the session ended.
  // Reporting a signed-out user's 401 as "search isn't available" told them the wrong
  // thing about their own app. A 401 is now a sign-out, handled identically to records.ts
  // and files.ts.
  it("treats 401 as a real sign-out (NOT 'unavailable') and drops the token", async () => {
    const invalidate = host.tokenManager.invalidate;
    fetchMock.mockResolvedValue(resp(401));
    await expect(searchEntities("x", ["Note"])).rejects.toBeInstanceOf(NotSignedInError);
    expect(invalidate).toHaveBeenCalled();
  });

  it("maps 403 to SearchUnavailableError", async () => {
    fetchMock.mockResolvedValue(resp(403));
    await expect(searchEntities("x", ["Note"])).rejects.toBeInstanceOf(SearchUnavailableError);
  });

  // A genuine sign-out (NotSignedInError from the token seam) must NOT be masked as unavailable.
  it("propagates NotSignedInError from token minting (not masked as unavailable)", async () => {
    host.bearerHeaderFor.mockRejectedValue(new NotSignedInError());
    await expect(searchEntities("x", ["Note"])).rejects.toBeInstanceOf(NotSignedInError);
  });
});
