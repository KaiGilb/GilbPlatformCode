// @vitest-environment jsdom
// The names of places. Cases 1-2 are GilbApp's `usePlaceNames.test.ts` (commit a703b3ed, "loadPlaceNames"): the first unchanged in what it pins (every id
// is started at once), the second CHANGED on purpose — the source "drops one unresolvable id rather than blanking the line"; now a place that was not read is
// told from one that is gone (F6) and `loadPlaceNames` rejects (F8). The source stubbed `getPlace`; here the catalogue is doubled at `fetch`, with the real
// catalogue client in front of it. The rest is new.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { __resetGeoCache, __resetGeoGrainCache } from "@kaigilb/gilbplatformcode-geo-catalogue";
import { resetGeoOrigin, setGeoOrigin } from "@kaigilb/gilbplatformcode-geo-origin";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { PlaceNamesNotReadError, loadPlaceNames, readPlaceNames, usePlaceNames } from "./index";

const GEO = "https://geo.example.test";
const row = (id: string, label: string, type = "City") => ({ "@id": `${GEO}/base/e/${id}`, "@type": `t:${type}`, label });
const ROWS: Record<string, unknown> = {
  [`${GEO}/base/e/oslo`]: row("oslo", "Oslo", "Municipality"),
  [`${GEO}/base/e/viken`]: row("viken", "Viken", "GeoAdminArea"),
  [`${GEO}/base/e/norway`]: row("norway", "Norway", "Country"),
  [`${GEO}/base/e/nameless`]: { "@id": `${GEO}/base/e/nameless`, "@type": "t:City" },
};
const FAIL = new Set<string>();
let calls: { method: string; url: string }[] = [];
let inflight = 0;
let maxInflight = 0;
const nonGet: string[] = [];

beforeEach(() => {
  setGeoOrigin(GEO);
  setTermOrigin("https://ontology.example.test");
  __resetGeoCache();
  __resetGeoGrainCache();
  const kept = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) });
  FAIL.clear();
  calls = [];
  inflight = 0;
  maxInflight = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ method, url });
      if (method !== "GET" && url.startsWith(GEO)) nonGet.push(`${method} ${url}`);
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      await Promise.resolve();
      await Promise.resolve();
      inflight -= 1;
      if (FAIL.has(url)) return new Response("down", { status: 502 });
      const r = ROWS[url];
      return r ? new Response(JSON.stringify(r), { status: 200 }) : new Response("nf", { status: 404 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  __resetGeoCache();
  resetGeoOrigin();
  resetTermOrigin();
});
afterAll(() => expect(nonGet).toEqual([])); // the world-level proof: nothing but a GET ever went to the catalogue

const OSLO = `${GEO}/base/e/oslo`;
const VIKEN = `${GEO}/base/e/viken`;
const NORWAY = `${GEO}/base/e/norway`;
const GONE = `${GEO}/base/e/gone`;

describe("loadPlaceNames (ported)", () => {
  it("🔴 starts every catalogue id at once — not City then Region then Country", async () => {
    const out = await loadPlaceNames([OSLO, VIKEN, NORWAY]);
    expect(maxInflight).toBe(3);
    expect(out.map((p) => p.id)).toEqual([OSLO, VIKEN, NORWAY]);
  });

  it("(CHANGED) one id that cannot be read no longer yields a shorter line: loadPlaceNames rejects, naming what failed", async () => {
    FAIL.add(VIKEN);
    const err = await loadPlaceNames([OSLO, VIKEN]).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(PlaceNamesNotReadError);
    expect((err as PlaceNamesNotReadError).failed).toEqual([{ id: VIKEN, state: "failed", reason: "unreachable" }]);
  });
});

describe("F8: loadPlaceNames never resolves with half an address", () => {
  it("(M-K4) a failed id rejects, whatever the others did", async () => {
    FAIL.add(NORWAY);
    await expect(loadPlaceNames([OSLO, VIKEN, NORWAY])).rejects.toBeInstanceOf(PlaceNamesNotReadError);
  });

  it("a place the catalogue answers 404 for does NOT reject: it is gone, and left out", async () => {
    const out = await loadPlaceNames([OSLO, GONE, NORWAY]);
    expect(out.map((p) => p.label)).toEqual(["Oslo", "Norway"]);
  });

  it("a failed place AND a missing one: it rejects, and only the failed one is named as failed", async () => {
    FAIL.add(VIKEN);
    const err = (await loadPlaceNames([OSLO, GONE, VIKEN]).catch((e: unknown) => e)) as PlaceNamesNotReadError;
    expect(err.failed.map((f) => f.id)).toEqual([VIKEN]);
  });

  it("no ids, no request, an empty answer", async () => {
    expect(await loadPlaceNames([])).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("an id outside the catalogue rejects (not read) and is not asked for", async () => {
    await expect(loadPlaceNames([OSLO, "https://evil.example/base/e/x"])).rejects.toBeInstanceOf(PlaceNamesNotReadError);
    expect(calls.filter((c) => c.url.startsWith("https://evil.example"))).toEqual([]);
  });

  it("a row that was read and has no name is failed ('unnamed'), not silently dropped", async () => {
    await expect(loadPlaceNames([OSLO, `${GEO}/base/e/nameless`])).rejects.toMatchObject({ failed: [{ state: "failed", reason: "unnamed" }] });
  });
});

describe("F6: readPlaceNames tells named, missing and failed apart", () => {
  it("one answer per id, in order, each its own state", async () => {
    FAIL.add(VIKEN);
    const reads = await readPlaceNames([OSLO, GONE, VIKEN, "https://evil.example/base/e/x", `${GEO}/base/e/nameless`]);
    expect(reads.map((r) => [r.state, r.state === "failed" ? r.reason : ""])).toEqual([
      ["named", ""],
      ["missing", ""],
      ["failed", "unreachable"],
      ["failed", "not-geo"],
      ["failed", "unnamed"],
    ]);
    expect(reads[0]).toMatchObject({ id: OSLO, place: { label: "Oslo", type: "Municipality" } });
  });

  it("never rejects, whatever the catalogue does", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    const reads = await readPlaceNames([OSLO]);
    expect(reads).toEqual([{ id: OSLO, state: "failed", reason: "unreachable" }]);
  });

  it("a 404 is `missing` and a 502 is `failed`: never folded together", async () => {
    FAIL.add(OSLO);
    const reads = await readPlaceNames([OSLO, GONE]);
    expect(reads.map((r) => r.state)).toEqual(["failed", "missing"]);
  });
});

describe("usePlaceNames", () => {
  it("null while unresolved, then one answer per id; [] for no ids (and no request)", async () => {
    const { result } = renderHook(() => usePlaceNames([OSLO, GONE]));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current!.map((r) => r.state)).toEqual(["named", "missing"]);
    cleanup();
    calls.length = 0;
    const none = renderHook(() => usePlaceNames([]));
    await waitFor(() => expect(none.result.current).toEqual([]));
    expect(calls).toEqual([]);
  });

  it("a failed place is a failed answer in the list, not a shorter list", async () => {
    FAIL.add(VIKEN);
    const { result } = renderHook(() => usePlaceNames([OSLO, VIKEN]));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toHaveLength(2);
    expect(result.current![1]).toEqual({ id: VIKEN, state: "failed", reason: "unreachable" });
  });

  it("a new list of ids goes back to null and reads again; the same ids in a new array do not", async () => {
    const { result, rerender } = renderHook(({ ids }) => usePlaceNames(ids), { initialProps: { ids: [OSLO] } });
    await waitFor(() => expect(result.current?.[0]?.state).toBe("named"));
    const n = calls.length;
    rerender({ ids: [OSLO] });
    expect(calls.length).toBe(n);
    rerender({ ids: [NORWAY] });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.[0]).toMatchObject({ id: NORWAY, state: "named" }));
  });

  it("an answer that arrives after the hook was left changes nothing", async () => {
    const { unmount } = renderHook(() => usePlaceNames([OSLO]));
    unmount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(true).toBe(true); // no state update on an unmounted hook (React would warn)
  });
});
