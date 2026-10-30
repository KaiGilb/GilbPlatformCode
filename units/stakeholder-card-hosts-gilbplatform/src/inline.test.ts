import { describe, expect, test, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { resetBaseOrigin, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { HELD_RECORD_FRESH_MS, PLACE_CLAIMS_STALE_MS, createIsGeoEntityId, createdInVaultKey, geoEntityPrefix, heldRecordOf, placeClaimsKey, readResources, rememberCreatedIn, usePickerQuery } from "./inline";
import { resetLwsAuth, lwsAuthFromSession, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { setSystemHostLabels, resetSystemHostLabels } from "@kaigilb/gilbplatformcode-own-card";
import { BASE, P, createWorld } from "../test/world";

const record = { id: "r1", entityUri: "https://holder.example.test/base/e/r1" } as unknown as BaseRecord;

describe("heldRecordOf (recordHooks.ts:456)", () => {
  function setUp() {
    resetBaseOrigin();
    setBaseOrigin("https://example.test");
    setSystemVaultHosts([]);
  }
  const keyFor = (uri: string) => ["base", "record", "r1", vaultOriginOf(uri)] as const;

  test("a record held within 15 s answers; an older one, a missing one and a null address answer null", () => {
    setUp();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000_000);
      const qc = new QueryClient();
      const uri = "https://holder.example.test/base/e/r1";
      expect(heldRecordOf(qc, "r1", uri)).toBeNull();
      qc.setQueryData(keyFor(uri), record);
      expect(heldRecordOf(qc, "r1", uri)).toBe(record);
      vi.setSystemTime(1_000_000 + HELD_RECORD_FRESH_MS - 1);
      expect(heldRecordOf(qc, "r1", uri)).toBe(record);
      vi.setSystemTime(1_000_000 + HELD_RECORD_FRESH_MS);
      expect(heldRecordOf(qc, "r1", uri)).toBeNull();
      expect(heldRecordOf(qc, "r1", null)).toBeNull();
      expect(heldRecordOf(qc, "r1", undefined)).toBeNull();
      expect(heldRecordOf(qc, "r1", "")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("the key has the vault's origin in it, so the same id at another host is another record", () => {
    setUp();
    const qc = new QueryClient();
    qc.setQueryData(keyFor("https://holder.example.test/base/e/r1"), record);
    expect(heldRecordOf(qc, "r1", "https://other.example.test/base/e/r1")).toBeNull();
    expect(heldRecordOf(qc, "r1", "https://holder.example.test/base/e/r1")).toBe(record);
  });

  test("the freshness is 15 seconds", () => {
    expect(HELD_RECORD_FRESH_MS).toBe(15_000);
  });
});

describe("rememberCreatedIn (recordHooks.ts:2842)", () => {
  test("keeps the vault under the record's key, for good", () => {
    const qc = new QueryClient();
    rememberCreatedIn(qc, "rec1", "https://holder.example.test/base/pann");
    expect(qc.getQueryData(["created-in-vault", "rec1"])).toBe("https://holder.example.test/base/pann");
    expect(qc.getQueryDefaults(["created-in-vault", "rec1"])).toMatchObject({ gcTime: Infinity, staleTime: Infinity });
    expect(createdInVaultKey("rec1")).toEqual(["created-in-vault", "rec1"]);
  });

  test("another record is kept apart", () => {
    const qc = new QueryClient();
    rememberCreatedIn(qc, "a", "va");
    rememberCreatedIn(qc, "b", "vb");
    expect([qc.getQueryData(["created-in-vault", "a"]), qc.getQueryData(["created-in-vault", "b"])]).toEqual(["va", "vb"]);
  });
});

describe("the place members' inline values (usePlaceClaims.ts:50-52)", () => {
  test("the key and the stale time", () => {
    expect(placeClaimsKey("v")).toEqual(["mynet", "place-claims", "v"]);
    expect(PLACE_CLAIMS_STALE_MS).toBe(60_000);
  });
});

describe("isGeoEntityId (baseGeo.ts:82)", () => {
  test("an address under the catalogue's /base/e/ is a row; nothing else is", () => {
    const is = createIsGeoEntityId("https://geo.example.test");
    expect(is("https://geo.example.test/base/e/paris")).toBe(true);
    expect(is("https://geo.example.test/base/e/")).toBe(true);
    expect(is("https://geo.example.test/base/t/Place")).toBe(false);
    expect(is("https://geo.example.test.evil.example/base/e/paris")).toBe(false);
    expect(is("base:e/paris")).toBe(false);
    expect(is("")).toBe(false);
    expect(is(undefined)).toBe(false);
    expect(is({})).toBe(false);
  });
  test("trailing slashes of the origin are dropped, as the source's GEO_ORIGIN drops them", () => {
    expect(geoEntityPrefix("https://geo.example.test/")).toBe("https://geo.example.test/base/e/");
    expect(geoEntityPrefix("https://geo.example.test///")).toBe("https://geo.example.test/base/e/");
    expect(createIsGeoEntityId("https://geo.example.test/")("https://geo.example.test/base/e/x")).toBe(true);
  });
  test("the prefix is read from the origin it is given, not from a fixed one", () => {
    expect(createIsGeoEntityId("https://other.example.test")("https://geo.example.test/base/e/x")).toBe(false);
  });
});

describe("readResources (lws.ts:164)", () => {
  async function world(over: Parameters<typeof createWorld>[0] = {}) {
    resetBaseOrigin();
    setBaseOrigin(BASE);
    setSystemVaultHosts([]);
    setSystemHostLabels(["id"]);
    resetLwsAuth();
    const w = await createWorld(over);
    setLwsAuth(lwsAuthFromSession(w.session));
    return w;
  }

  test("reads each record at its own address, in input order; a 404 comes back gone with an empty doc, and the type is the one served", async () => {
    const w = await world();
    vi.stubGlobal("fetch", w.fetch);
    try {
      const a = w.platform.seed(P, "t:Person", { "a:name": "A", "a:employer": { "@id": "https://x.example.test/base/e/o" } });
      const b = w.platform.seed(P, "t:Organization", { "a:name": "B" });
      const gone = `${a.slice(0, a.lastIndexOf("/") + 1)}nosuchrecord`;
      const got = await readResources([b, gone, a], P);
      expect(got.map((r) => r.uri)).toEqual([b, gone, a]);
      expect(got.map((r) => r.id)).toEqual([b.split("/").pop(), "nosuchrecord", a.split("/").pop()]);
      expect(got.map((r) => r.gone)).toEqual([false, true, false]);
      expect(got[1]!.doc).toEqual({});
      expect(got[1]!).not.toHaveProperty("typeUri");
      expect(got[2]!.doc).toMatchObject({ name: "A" });
      // The document as served (a reference stays an object), not the flattened facts.
      expect(got[2]!.doc.employer).toEqual({ "@id": "https://x.example.test/base/e/o" });
      expect(got[0]!.typeUri).toMatch(/Organization$/);
    } finally {
      vi.unstubAllGlobals();
      resetLwsAuth();
      resetSystemHostLabels();
      resetBaseOrigin();
    }
  });

  test("a failed read rejects, and none at all is an empty list with no request", async () => {
    const w = await world();
    vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => (String(u).includes("/lws/r/") ? new Response(JSON.stringify({ message: "busy" }), { status: 503 }) : w.fetch(u, init)));
    try {
      await expect(readResources(["https://holder.example.test/base/e/x"], P)).rejects.toThrow();
      expect(await readResources([], P)).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
      resetLwsAuth();
      resetSystemHostLabels();
      resetBaseOrigin();
    }
  });

  test("at most six reads are in flight", async () => {
    const w = await world();
    let live = 0;
    let most = 0;
    vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
      live += 1;
      most = Math.max(most, live);
      await new Promise((r) => setTimeout(r, 0));
      live -= 1;
      return w.fetch(u, init);
    });
    try {
      const ids = Array.from({ length: 20 }, (_, i) => w.platform.seed(P, "t:Person", { "a:name": `P${i}` }));
      const got = await readResources(ids, P);
      expect(got.length).toBe(20);
      expect(most).toBe(6);
    } finally {
      vi.unstubAllGlobals();
      resetLwsAuth();
      resetSystemHostLabels();
      resetBaseOrigin();
    }
  });
});

describe("usePickerQuery (OrgRecordPicker.tsx:144-150)", () => {
  const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);

  test("a failed search is asked once even where the client would retry: retry is false", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 0 } } });
    const run = vi.fn(async () => Promise.reject(new Error("no")));
    const { result } = renderHook(() => usePickerQuery({ key: ["k"], run, enabled: true, staleTime: 0 }), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(run).toHaveBeenCalledTimes(1);
  });

  test("the key, the run, enabled and the stale time are passed on; a disabled query asks nothing", async () => {
    const qc = new QueryClient();
    const run = vi.fn(async () => ({ hits: [], complete: true }));
    const { result, rerender } = renderHook((p: { on: boolean }) => usePickerQuery({ key: ["a", "b"], run, enabled: p.on, staleTime: 12_345 }), { wrapper: wrap(qc), initialProps: { on: false } });
    expect(run).not.toHaveBeenCalled();
    expect(result.current.isFetching).toBe(false);
    rerender({ on: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(run).toHaveBeenCalledTimes(1);
    expect(qc.getQueryCache().find({ queryKey: ["a", "b"] })).toBeTruthy();
    expect(qc.getQueryCache().find({ queryKey: ["a", "b"] })!.observers[0]!.options.staleTime).toBe(12_345);
  });
});
