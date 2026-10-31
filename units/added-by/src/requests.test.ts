// Where the name reads go, and what they carry. The route is `GET /base/source-name?items=…`, asked with a plain Bearer at the node that serves the item.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADDED_BY_COLLECT_MS, SOURCE_NAME_MAX_ITEMS, fetchSourceNames } from "./index";
import { installSourceName } from "../test/addedByTestkit";
import { ANNA, HYTTA, itemAt, setUp, tearDown } from "../test/support";

beforeEach(setUp);
afterEach(tearDown);

describe("fetchSourceNames", () => {
  it("is one call per host: items of two hosts go to their own nodes, each with a Bearer for that URL", async () => {
    const a = itemAt(HYTTA, "a");
    const b = itemAt("https://anna.platform.example.test", "b");
    const seen: { url: string; auth: string | undefined }[] = [];
    const rig = installSourceName(() => ({ [a]: { statedBy: ANNA, name: "A" }, [b]: { statedBy: ANNA, name: "B" } }));
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", async (u: string, init: RequestInit) => {
      seen.push({ url: String(u), auth: (init.headers as Record<string, string>).authorization });
      return inner(u, init);
    });
    await fetchSourceNames([a, b]);
    expect(rig.calls).toHaveLength(2);
    expect(seen.map((s) => new URL(s.url).origin).sort()).toEqual(["https://anna.platform.example.test", HYTTA]);
    for (const s of seen) {
      expect(new URL(s.url).pathname).toBe("/base/source-name");
      expect(s.auth).toBe(`Bearer for ${s.url}`);
    }
  });
  it("the single form `?item=` is never used", async () => {
    const rig = installSourceName(() => ({}));
    await fetchSourceNames([itemAt(HYTTA, "a")]);
    expect(rig.urls[0]).toContain("?items=");
    expect(rig.urls[0]).not.toMatch(/[?&]item=/);
  });
  it("50 is the bound of one call, and 51 are two", async () => {
    expect(SOURCE_NAME_MAX_ITEMS).toBe(50);
    const rig = installSourceName(() => ({}));
    await fetchSourceNames(Array.from({ length: 50 }, (_, i) => itemAt(HYTTA, `i${i}`)));
    expect(rig.calls.map((c) => c.length)).toEqual([50]);
    await fetchSourceNames(Array.from({ length: 51 }, (_, i) => itemAt(HYTTA, `j${i}`)));
    expect(rig.calls.map((c) => c.length)).toEqual([50, 50, 1]);
  });
  it("a name that is only blanks, or a card that is only blanks, is not disclosed", async () => {
    const a = itemAt(HYTTA, "a");
    installSourceName(() => ({ [a]: { statedBy: ANNA, name: "   " } }));
    expect((await fetchSourceNames([a])).get(a)).toBeNull();
    installSourceName(() => ({ [a]: { statedBy: "  ", name: "Anna" } }));
    expect((await fetchSourceNames([a])).get(a)).toBeNull();
  });
  it("a body that is not the expected shape gives null for each", async () => {
    const a = itemAt(HYTTA, "a");
    vi.stubGlobal("fetch", async () => new Response("null", { status: 200 }));
    expect((await fetchSourceNames([a])).get(a)).toBeNull();
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ items: "x" }), { status: 200 }));
    expect((await fetchSourceNames([a])).get(a)).toBeNull();
  });
  it("blank addresses are dropped, and an empty list makes no call", async () => {
    const rig = installSourceName(() => ({}));
    expect((await fetchSourceNames(["", "  "])).size).toBe(0);
    expect(rig.calls).toHaveLength(0);
  });
  it("a read that takes longer than 10 seconds is given up on: null, no throw, and the request is aborted", async () => {
    vi.useFakeTimers();
    const a = itemAt(HYTTA, "a");
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", (_u: string, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return new Promise((_res, rej) => signal!.addEventListener("abort", () => rej(new Error("aborted"))));
    });
    const p = fetchSourceNames([a]);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal!.aborted).toBe(true);
    expect((await p).get(a)).toBeNull();
  });
  it("the collecting window is 20 ms", () => expect(ADDED_BY_COLLECT_MS).toBe(20));
});
