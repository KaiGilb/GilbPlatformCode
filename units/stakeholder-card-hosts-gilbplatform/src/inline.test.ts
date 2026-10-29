import { describe, expect, test, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { resetBaseOrigin, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { HELD_RECORD_FRESH_MS, PLACE_CLAIMS_STALE_MS, createIsGeoEntityId, createdInVaultKey, geoEntityPrefix, heldRecordOf, placeClaimsKey, rememberCreatedIn } from "./inline";

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
