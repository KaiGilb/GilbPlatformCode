// The client half of the search continuation.
//
// 2026-09-05: a headline reading "more than 205 matches for 'planguage'" above 41 rows —
// "why is it showing 41 items, are there more to show". Measured at the door the same day:
// `GET https://ontology.platform.example.test/base/search?q=planguage` returned `total {kind:"atLeast",
// value:200}` with `ids: 20`, and `&limit=` / `&offset=` / `&page=` each 400'd. Base now takes
// an opaque keyset `?cursor=`; this is the client carrying it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchEntities, UNTYPED_FIND } from "./search";
import { setUp, tearDown } from "../test/support";

function resp(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  setUp();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tearDown();
});

const VAULT = "https://ontology.platform.example.test/base";

describe("Cycle161 — searchEntities carries the keyset cursor", () => {
  it("🔴 sends `?cursor=` when one is given, and OMITS it on the first page", async () => {
    fetchMock.mockResolvedValue(resp(200, { total: null, ids: [], next: null }));

    await searchEntities("planguage", UNTYPED_FIND, undefined, VAULT);
    expect(String(fetchMock.mock.calls.at(-1)![0])).not.toContain("cursor=");

    await searchEntities("planguage", UNTYPED_FIND, undefined, VAULT, undefined, "CURSOR~TOKEN");
    const url = new URL(String(fetchMock.mock.calls.at(-1)![0]));
    // The DISCRIMINATING assertion — pre-fix there was no cursor to send and Base had no
    // parameter to receive it.
    expect(url.searchParams.get("cursor")).toBe("CURSOR~TOKEN");
    expect(url.searchParams.get("q")).toBe("planguage");
  });

  it("reads `next` back off the wire", async () => {
    fetchMock.mockResolvedValue(
      resp(200, { total: { kind: "atLeast", value: 200 }, ids: ["https://ontology.platform.example.test/base/e/a"], next: "NEXT~1" }),
    );
    const r = await searchEntities("planguage", UNTYPED_FIND, undefined, VAULT);
    expect(r.next).toBe("NEXT~1");
  });

  it("🔴 `null` (no more) and ABSENT (a Base that cannot say) stay DISTINGUISHABLE", async () => {
    // Collapsing absent→null would let a caller claim a list is whole on a server that never
    // said so. The hook maps both to "stop asking", but it must be the HOOK's decision, made
    // where the two stop differing — not a silent flattening at the wire.
    fetchMock.mockResolvedValue(resp(200, { total: null, ids: [], next: null }));
    expect((await searchEntities("q", UNTYPED_FIND, undefined, VAULT)).next).toBeNull();

    fetchMock.mockResolvedValue(resp(200, { total: null, ids: [] })); // an older Base
    expect((await searchEntities("q", UNTYPED_FIND, undefined, VAULT)).next).toBeUndefined();
  });

  it("a cursor is passed through OPAQUELY — never parsed, rebuilt or normalised", async () => {
    // Base authenticates the token by exact round-trip and 400s anything else, so any client
    // that "tidied" it would turn its own next page into a refusal.
    const opaque = "eyJyIjowLjEyMzQ1LCJlIjoiaHR0cHM6Ly92ZWRhIn0";
    fetchMock.mockResolvedValue(resp(200, { total: null, ids: [], next: null }));
    await searchEntities("q", UNTYPED_FIND, undefined, VAULT, undefined, opaque);
    expect(new URL(String(fetchMock.mock.calls.at(-1)![0])).searchParams.get("cursor")).toBe(opaque);
  });
});
