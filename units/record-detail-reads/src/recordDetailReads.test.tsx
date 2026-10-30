// @vitest-environment jsdom
// Ported from the source's `RecordDetail.searchHitDoor.test.tsx` (2 of its 4 cases, as hook tests: the door a record is asked at,
// and the genuine 404; the 2 that read the rendered screen are left out, see the README). The rest is new: every export, over the
// real `lws-records`, `record-cache-kit` and `vault-origin-rule` and a fake platform (test/support.ts), no timers.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { recordsKey } from "@kaigilb/gilbplatformcode-record-cache-kit";
import {
  addedByCardOf,
  cacheRowsOf,
  createdInVaultKey,
  createdInVaultOf,
  findKnownRecordInCache,
  rememberAddedByCard,
  rememberCreatedIn,
  useCachedRecord,
  useKnownRecordDoor,
  useKnownRecordInCache,
  useRecord,
  useRecordOnDemand,
} from "./index";
import { APEX, OTHER_ORIGIN, VAULT_ORIGIN, fakePlatform, gate, resp, setUp, tearDown } from "../test/support";

beforeEach(() => setUp());
afterEach(() => tearDown());

const newQc = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

const OSLO = "osm-r-406091";
const OSLO_URI = `${VAULT_ORIGIN}/base/e/${OSLO}`;
const row = (over: Partial<BaseRecord> & { id: string }): BaseRecord => ({ typeUri: "t:Person", facts: { name: "A" }, opaqueFacts: [], etag: '"e1"', ...over });
const page = (records: unknown[]) => ({ pages: [{ records, total: records.length, complete: true, pageSize: 50, offset: 0 }], pageParams: [0] });

describe("searchHitDoor (ported): a search hit is asked at ITS OWN vault, not at the platform's apex", () => {
  it("a record found in the page's caches names its vault; reading it there asks that vault and never the apex", async () => {
    const world = fakePlatform({ held: { [OSLO]: { origin: VAULT_ORIGIN, facts: { label: "Oslo" }, etag: '"sha256:oslo"' } } });
    const qc = newQc();
    // A search hit is in no list of the open vault: it sits in a search query, with the record's own address.
    qc.setQueryData(["base", "search", "oslo"], { records: [{ id: OSLO, entityUri: OSLO_URI, typeUri: "t:GeoRegion", facts: { label: "Oslo" } }] });
    const door = renderHook(() => useKnownRecordDoor(OSLO), { wrapper: wrap(qc) });
    expect(door.result.current).toBe(OSLO_URI);
    const rec = renderHook(() => useRecord(OSLO, door.result.current), { wrapper: wrap(qc) });
    await waitFor(() => expect(rec.result.current.data?.facts.label).toBe("Oslo"));
    expect(world.readUrls()).toContain(`${VAULT_ORIGIN}/lws/r/${OSLO}`);
    expect(world.readUrls().filter((u) => u.startsWith(`${APEX}/`))).toEqual([]);
  });

  it("the same record asked with no door goes to the apex and is not found (the defect the door lookup exists for)", async () => {
    const world = fakePlatform({ held: { [OSLO]: { origin: VAULT_ORIGIN, facts: { label: "Oslo" } } } });
    const rec = renderHook(() => useRecord(OSLO, null), { wrapper: wrap(newQc()) });
    await waitFor(() => expect(rec.result.current.isSuccess).toBe(true));
    expect(rec.result.current.data).toBeNull();
    expect(world.readUrls()).toEqual([`${APEX}/lws/r/${OSLO}`]);
  });

  it("a record the vault does not give is null, asked at the vault's door and not the apex's", async () => {
    const world = fakePlatform({});
    const rec = renderHook(() => useRecord("zzz-no-such-entity", `${VAULT_ORIGIN}/base/e/zzz-no-such-entity`), { wrapper: wrap(newQc()) });
    await waitFor(() => expect(rec.result.current.isSuccess).toBe(true));
    expect(rec.result.current.data).toBeNull();
    expect(world.readUrls()).toEqual([`${VAULT_ORIGIN}/lws/r/zzz-no-such-entity`]);
  });
});

describe("useRecord", () => {
  it("reads the record at the node of the address it is given, with its facts and ETag", async () => {
    const world = fakePlatform({ held: { r1: { origin: OTHER_ORIGIN, facts: { name: "Tom" }, etag: '"v7"' } } });
    const { result } = renderHook(() => useRecord("r1", `${OTHER_ORIGIN}/base/e/r1`), { wrapper: wrap(newQc()) });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data!.facts.name).toBe("Tom");
    expect(result.current.data!.etag).toBe('"v7"');
    expect(world.readUrls()).toEqual([`${OTHER_ORIGIN}/lws/r/r1`]);
  });

  it("the query key holds the id and the ORIGIN asked, so a read at the apex and a read at the vault are two entries", async () => {
    fakePlatform({ held: { r2: { origin: VAULT_ORIGIN, facts: { name: "T" } } } });
    const qc = newQc();
    const a = renderHook(() => useRecord("r2", null), { wrapper: wrap(qc) });
    const b = renderHook(() => useRecord("r2", `${VAULT_ORIGIN}/base/e/r2`), { wrapper: wrap(qc) });
    await waitFor(() => expect(a.result.current.isSuccess && b.result.current.isSuccess).toBe(true));
    expect(a.result.current.data).toBeNull();
    expect(b.result.current.data?.id).toBe("r2");
    const keys = qc.getQueryCache().findAll({ queryKey: ["base", "record", "r2"] }).map((q) => q.queryKey);
    expect(keys).toContainEqual(["base", "record", "r2", APEX]);
    expect(keys).toContainEqual(["base", "record", "r2", VAULT_ORIGIN]);
  });

  it("makes no read for a null id or a temporary id", async () => {
    const world = fakePlatform({});
    const a = renderHook(() => useRecord(null, null), { wrapper: wrap(newQc()) });
    const b = renderHook(() => useRecord("temp:abc", null), { wrapper: wrap(newQc()) });
    await act(async () => {});
    expect(a.result.current.fetchStatus).toBe("idle");
    expect(b.result.current.fetchStatus).toBe("idle");
    expect(world.seen).toEqual([]);
  });

  it("a second hook for the same record within 15 s reads nothing more (the cache answers)", async () => {
    const world = fakePlatform({ held: { r3: { origin: VAULT_ORIGIN, facts: { name: "T" } } } });
    const qc = newQc();
    const a = renderHook(() => useRecord("r3", `${VAULT_ORIGIN}/base/e/r3`), { wrapper: wrap(qc) });
    await waitFor(() => expect(a.result.current.data).toBeTruthy());
    const b = renderHook(() => useRecord("r3", `${VAULT_ORIGIN}/base/e/r3`), { wrapper: wrap(qc) });
    expect(b.result.current.data?.id).toBe("r3");
    await act(async () => {});
    expect(world.reads()).toHaveLength(1);
  });

  it("is stale after 15 s: the query is configured with staleTime 15 000", async () => {
    fakePlatform({ held: { r4: { origin: VAULT_ORIGIN, facts: {} } } });
    const qc = newQc();
    renderHook(() => useRecord("r4", `${VAULT_ORIGIN}/base/e/r4`), { wrapper: wrap(qc) });
    await waitFor(() => expect(qc.getQueryCache().findAll({ queryKey: ["base", "record", "r4"] })[0]?.state.data).toBeTruthy());
    const q = qc.getQueryCache().findAll({ queryKey: ["base", "record", "r4"] })[0]!;
    expect((q.options as { staleTime?: number }).staleTime).toBe(15_000);
  });

  it("a refused read (500) is an error, not a null", async () => {
    fakePlatform({ read: () => resp(500, { body: "boom" }) });
    const { result } = renderHook(() => useRecord("r5", `${VAULT_ORIGIN}/base/e/r5`), { wrapper: wrap(newQc()) });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

describe("useRecordOnDemand", () => {
  it("reads nothing by itself", async () => {
    const world = fakePlatform({ held: { d1: { origin: VAULT_ORIGIN, facts: { name: "X" } } } });
    const { result } = renderHook(() => useRecordOnDemand("d1", `${VAULT_ORIGIN}/base/e/d1`), { wrapper: wrap(newQc()) });
    await act(async () => {});
    expect(world.seen).toEqual([]);
    expect(result.current.data).toBeUndefined();
    expect(result.current.isFetching).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it("fetch() makes exactly one read at the record's node and returns the record", async () => {
    const world = fakePlatform({ held: { d2: { origin: VAULT_ORIGIN, facts: { name: "X" } } } });
    const { result } = renderHook(() => useRecordOnDemand("d2", `${VAULT_ORIGIN}/base/e/d2`), { wrapper: wrap(newQc()) });
    let got: BaseRecord | null = null;
    await act(async () => {
      got = await result.current.fetch();
    });
    expect(got!.facts.name).toBe("X");
    expect(world.readUrls()).toEqual([`${VAULT_ORIGIN}/lws/r/d2`]);
    await waitFor(() => expect(result.current.data?.id).toBe("d2"));
  });

  it("fetch() of a record that is not there is null", async () => {
    fakePlatform({});
    const { result } = renderHook(() => useRecordOnDemand("d3", `${VAULT_ORIGIN}/base/e/d3`), { wrapper: wrap(newQc()) });
    let got: BaseRecord | null | undefined;
    await act(async () => {
      got = await result.current.fetch();
    });
    expect(got).toBeNull();
  });

  it("fetch() of a refused read (500) is null, not undefined", async () => {
    fakePlatform({ read: () => resp(500, { body: "boom" }) });
    const { result } = renderHook(() => useRecordOnDemand("d6", `${VAULT_ORIGIN}/base/e/d6`), { wrapper: wrap(newQc()) });
    let got: BaseRecord | null | undefined;
    await act(async () => {
      got = await result.current.fetch();
    });
    expect(got).toBeNull();
  });

  it("fetch() with no id reads nothing and returns null", async () => {
    const world = fakePlatform({});
    const { result } = renderHook(() => useRecordOnDemand(null, null), { wrapper: wrap(newQc()) });
    let got: BaseRecord | null | undefined;
    await act(async () => {
      got = await result.current.fetch();
    });
    expect(got).toBeNull();
    expect(world.seen).toEqual([]);
  });

  it("observes the SAME entry useRecord fills: a record already read is on hand without a second read", async () => {
    const world = fakePlatform({ held: { d4: { origin: VAULT_ORIGIN, facts: { name: "X" } } } });
    const qc = newQc();
    const full = renderHook(() => useRecord("d4", `${VAULT_ORIGIN}/base/e/d4`), { wrapper: wrap(qc) });
    await waitFor(() => expect(full.result.current.data).toBeTruthy());
    const od = renderHook(() => useRecordOnDemand("d4", `${VAULT_ORIGIN}/base/e/d4`), { wrapper: wrap(qc) });
    expect(od.result.current.data?.id).toBe("d4");
    expect(world.reads()).toHaveLength(1);
  });

  it("a refused read sets isError", async () => {
    fakePlatform({ read: () => resp(500, { body: "boom" }) });
    const { result } = renderHook(() => useRecordOnDemand("d5", `${VAULT_ORIGIN}/base/e/d5`), { wrapper: wrap(newQc()) });
    await act(async () => {
      await result.current.fetch();
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("cacheRowsOf", () => {
  it("an array is its own rows", () => {
    const a = [{ id: "a" }, { id: "b" }];
    expect(cacheRowsOf(a)).toBe(a);
  });
  it("nothing, a string and a number hold no rows", () => {
    expect(cacheRowsOf(undefined)).toEqual([]);
    expect(cacheRowsOf(null)).toEqual([]);
    expect(cacheRowsOf("x")).toEqual([]);
    expect(cacheRowsOf(3)).toEqual([]);
  });
  it("`records`, `hits` and the `records` of every infinite page are flattened, in that order", () => {
    const out = cacheRowsOf({ records: [{ id: "r" }], hits: [{ id: "h" }], pages: [{ records: [{ id: "p1" }] }, { records: [{ id: "p2" }] }, null, { records: "no" }] });
    expect(out).toEqual([{ id: "r" }, { id: "h" }, { id: "p1" }, { id: "p2" }]);
  });
  it("a single record (a useRecord entry) is its own row when it has an id and facts, an entityUri or a typeUri", () => {
    const withFacts = { id: "a", facts: {} };
    const withUri = { id: "b", entityUri: "u" };
    const withType = { id: "c", typeUri: "t:X" };
    expect(cacheRowsOf(withFacts)).toEqual([withFacts]);
    expect(cacheRowsOf(withUri)).toEqual([withUri]);
    expect(cacheRowsOf(withType)).toEqual([withType]);
  });
  it("an unrelated `{ id }` is NOT a row (a blind match would decide which vault is asked)", () => {
    expect(cacheRowsOf({ id: "x" })).toEqual([]);
    expect(cacheRowsOf({ id: 5, facts: {} })).toEqual([]);
  });
  it("a record that also has `records` is both", () => {
    const o = { id: "a", facts: {}, records: [{ id: "z" }] };
    expect(cacheRowsOf(o)).toEqual([{ id: "z" }, o]);
  });
});

describe("findKnownRecordInCache", () => {
  it("no id: nothing", () => {
    expect(findKnownRecordInCache(newQc(), null)).toEqual({ door: null, record: null });
    expect(findKnownRecordInCache(newQc(), "")).toEqual({ door: null, record: null });
  });
  it("an empty id finds nothing, even beside a row that carries an empty id and an address", () => {
    const qc = newQc();
    qc.setQueryData(["base", "search", "q"], { records: [{ id: "", entityUri: "https://empty.x/base/e/", facts: {} }] });
    rememberCreatedIn(qc, "", "V");
    expect(findKnownRecordInCache(qc, "")).toEqual({ door: null, record: null });
  });
  it("an id nothing holds: nothing", () => {
    const qc = newQc();
    qc.setQueryData(["base", "records", "v"], page([row({ id: "other" })]));
    expect(findKnownRecordInCache(qc, "nope")).toEqual({ door: null, record: null });
  });
  it("finds the record and its address in a list page, a search, a jump and a single read", () => {
    const qc = newQc();
    qc.setQueryData(["base", "records", "v"], page([row({ id: "a", entityUri: "https://a.x/base/e/a" })]));
    qc.setQueryData(["base", "search", "q"], { records: [row({ id: "b", entityUri: "https://b.x/base/e/b" })] });
    qc.setQueryData(["base", "jump"], { hits: [{ id: "c", entityUri: "https://c.x/base/e/c", facts: { n: "1" } }] });
    qc.setQueryData(["base", "record", "d", "https://d.x"], row({ id: "d", entityUri: "https://d.x/base/e/d" }));
    expect(findKnownRecordInCache(qc, "a").door).toBe("https://a.x/base/e/a");
    expect(findKnownRecordInCache(qc, "b").door).toBe("https://b.x/base/e/b");
    expect(findKnownRecordInCache(qc, "c").door).toBe("https://c.x/base/e/c");
    expect(findKnownRecordInCache(qc, "c").record?.facts).toEqual({ n: "1" });
    expect(findKnownRecordInCache(qc, "d").record?.id).toBe("d");
  });
  it("scans only the `base` caches", () => {
    const qc = newQc();
    qc.setQueryData(["elsewhere", "x"], { records: [row({ id: "a", entityUri: "https://a.x/base/e/a" })] });
    expect(findKnownRecordInCache(qc, "a")).toEqual({ door: null, record: null });
  });
  it("prefers the body with the most facts, and rebuilds a BaseRecord field by field (unknown fields dropped, defaults filled)", () => {
    const qc = newQc();
    qc.setQueryData(["base", "search", "q"], { records: [{ id: "a", facts: { label: "A" } }] });
    qc.setQueryData(["base", "jump"], { hits: [{ id: "a", facts: { label: "A", phone: "1" }, typeUri: "t:Person", etag: '"e9"', extra: "dropped" }] });
    const { record } = findKnownRecordInCache(qc, "a");
    expect(record).toEqual({ id: "a", entityUri: undefined, typeUri: "t:Person", facts: { label: "A", phone: "1" }, opaqueFacts: [], etag: '"e9"' });
  });
  it("a body with FEWER or equal facts does not replace the one held", () => {
    const qc = newQc();
    qc.setQueryData(["base", "jump"], { hits: [{ id: "a", facts: { x: "1", y: "2" } }] });
    qc.setQueryData(["base", "search", "q"], { records: [{ id: "a", facts: { x: "9", y: "9" } }, { id: "a", facts: { z: "1" } }] });
    expect(findKnownRecordInCache(qc, "a").record?.facts).toEqual({ x: "1", y: "2" });
  });
  it("opaqueFacts survive the rebuild (the save's guard must not be vacuous for a record reached through the cache)", () => {
    const qc = newQc();
    qc.setQueryData(["base", "search", "q"], { records: [row({ id: "obj-note1", facts: { title: "T", altLabelByLang: "" }, opaqueFacts: ["altLabelByLang"] })] });
    expect(findKnownRecordInCache(qc, "obj-note1").record?.opaqueFacts).toEqual(["altLabelByLang"]);
  });
  it("a row without a usable facts map gives a door but no record", () => {
    const qc = newQc();
    qc.setQueryData(["base", "search", "q"], { records: [{ id: "a", entityUri: "https://a.x/base/e/a", facts: ["no"] }, { id: "b", facts: null }] });
    expect(findKnownRecordInCache(qc, "a")).toEqual({ door: "https://a.x/base/e/a", record: null });
    expect(findKnownRecordInCache(qc, "b")).toEqual({ door: null, record: null });
  });
  it("a row with an empty id is no record", () => {
    const qc = newQc();
    qc.setQueryData(["base", "search", "q"], { records: [{ id: "", facts: {} }] });
    expect(findKnownRecordInCache(qc, "").record).toBeNull();
  });
  it("the door: the row's own address first; else the held record's; else the vault it was found in (`vault`, then `sourceVaultId`); else the vault a create wrote it into; else the 'Added by' card's door", () => {
    const mk = () => newQc();
    let qc = mk();
    qc.setQueryData(["base", "s"], { records: [{ id: "a", entityUri: "https://own.x/base/e/a", vault: "V1", facts: {} }] });
    rememberCreatedIn(qc, "a", "CV");
    rememberAddedByCard(qc, "a", { door: "https://adder.x/base/e/a", name: "N" });
    expect(findKnownRecordInCache(qc, "a").door).toBe("https://own.x/base/e/a");

    qc = mk();
    qc.setQueryData(["base", "s"], { records: [{ id: "a", vault: "V1", sourceVaultId: "V2", facts: {} }] });
    rememberCreatedIn(qc, "a", "CV");
    expect(findKnownRecordInCache(qc, "a").door).toBe("V1");

    qc = mk();
    qc.setQueryData(["base", "s"], { records: [{ id: "a", sourceVaultId: "V2", facts: {} }] });
    rememberCreatedIn(qc, "a", "CV");
    expect(findKnownRecordInCache(qc, "a").door).toBe("V2");

    qc = mk();
    rememberCreatedIn(qc, "a", "CV");
    rememberAddedByCard(qc, "a", { door: "https://adder.x/base/e/a", name: "N" });
    expect(findKnownRecordInCache(qc, "a").door).toBe("CV");

    qc = mk();
    rememberAddedByCard(qc, "a", { door: "https://adder.x/base/e/a", name: "N" });
    expect(findKnownRecordInCache(qc, "a")).toEqual({ door: "https://adder.x/base/e/a", record: null });
  });
  it("the first address seen wins within a scan, and the first vault seen wins", () => {
    const qc = newQc();
    qc.setQueryData(["base", "s"], { records: [{ id: "a", entityUri: "https://first.x/e/a", vault: "V1", facts: {} }, { id: "a", entityUri: "https://second.x/e/a", vault: "V2", facts: {} }] });
    expect(findKnownRecordInCache(qc, "a").door).toBe("https://first.x/e/a");
    const qc2 = newQc();
    qc2.setQueryData(["base", "s"], { records: [{ id: "a", vault: "V1", facts: {} }, { id: "a", vault: "V2", facts: {} }] });
    expect(findKnownRecordInCache(qc2, "a").door).toBe("V1");
  });
  it("an empty entityUri is no address", () => {
    const qc = newQc();
    qc.setQueryData(["base", "s"], { records: [{ id: "a", entityUri: "", facts: {} }] });
    expect(findKnownRecordInCache(qc, "a").door).toBeNull();
  });
});

describe("createdInVaultOf, createdInVaultKey, rememberCreatedIn", () => {
  it("the key is ['created-in-vault', id]", () => {
    expect(createdInVaultKey("x1")).toEqual(["created-in-vault", "x1"]);
  });
  it("a record no create wrote is null", () => {
    expect(createdInVaultOf(newQc(), "never")).toBeNull();
  });
  it("what rememberCreatedIn stores is read back, per id, under that key", () => {
    const qc = newQc();
    rememberCreatedIn(qc, "x2", "vault-a");
    rememberCreatedIn(qc, "x3", "vault-b");
    expect(createdInVaultOf(qc, "x2")).toBe("vault-a");
    expect(createdInVaultOf(qc, "x3")).toBe("vault-b");
    expect(qc.getQueryData(["created-in-vault", "x2"])).toBe("vault-a");
  });
  it("is held for the session: the entry never goes stale and is never collected", () => {
    const qc = newQc();
    rememberCreatedIn(qc, "x4", "vault-a");
    expect(qc.getQueryDefaults(["created-in-vault", "x4"])).toMatchObject({ gcTime: Infinity, staleTime: Infinity });
  });
  it("is not under `base`, so the record-cache scan never mistakes it for a record", () => {
    const qc = newQc();
    rememberCreatedIn(qc, "x5", "vault-a");
    expect(qc.getQueriesData({ queryKey: ["base"] })).toEqual([]);
  });
  it("a later create of the same id replaces the vault", () => {
    const qc = newQc();
    rememberCreatedIn(qc, "x6", "old");
    rememberCreatedIn(qc, "x6", "new");
    expect(createdInVaultOf(qc, "x6")).toBe("new");
  });
});

describe("rememberAddedByCard, addedByCardOf", () => {
  it("what is remembered is read back by id", () => {
    const qc = newQc();
    rememberAddedByCard(qc, "c1", { door: "https://adder.x/base/e/c1", name: "Ann" });
    expect(addedByCardOf(qc, "c1")).toEqual({ door: "https://adder.x/base/e/c1", name: "Ann" });
    expect(qc.getQueryData(["added-by-card", "c1"])).toEqual({ door: "https://adder.x/base/e/c1", name: "Ann" });
  });
  it("a card remembered under an empty id is still not given for no id", () => {
    const qc = newQc();
    rememberAddedByCard(qc, "", { door: "d", name: "n" });
    expect(addedByCardOf(qc, "")).toBeNull();
  });
  it("no id, or a card no link opened, is null", () => {
    const qc = newQc();
    expect(addedByCardOf(qc, null)).toBeNull();
    expect(addedByCardOf(qc, "")).toBeNull();
    expect(addedByCardOf(qc, "none")).toBeNull();
  });
  it("is held for the session and is not under `base`", () => {
    const qc = newQc();
    rememberAddedByCard(qc, "c2", { door: "d", name: "n" });
    expect(qc.getQueryDefaults(["added-by-card", "c2"])).toMatchObject({ gcTime: Infinity, staleTime: Infinity });
    expect(qc.getQueriesData({ queryKey: ["base"] })).toEqual([]);
  });
});

describe("useKnownRecordInCache, useKnownRecordDoor", () => {
  it("answer from the client's caches: the record and the door, or the door alone", () => {
    const qc = newQc();
    qc.setQueryData(["base", "search", "q"], { records: [row({ id: "k1", entityUri: "https://k.x/base/e/k1" })] });
    const both = renderHook(() => useKnownRecordInCache("k1"), { wrapper: wrap(qc) });
    expect(both.result.current.door).toBe("https://k.x/base/e/k1");
    expect(both.result.current.record?.id).toBe("k1");
    const door = renderHook(() => useKnownRecordDoor("k1"), { wrapper: wrap(qc) });
    expect(door.result.current).toBe("https://k.x/base/e/k1");
  });
  it("a record nothing holds: null door, null record; no id: the same", () => {
    const qc = newQc();
    expect(renderHook(() => useKnownRecordDoor("zz"), { wrapper: wrap(qc) }).result.current).toBeNull();
    expect(renderHook(() => useKnownRecordInCache(null), { wrapper: wrap(qc) }).result.current).toEqual({ door: null, record: null });
  });
  it("the door of a record a create wrote in this session is that vault (found with no list)", () => {
    const qc = newQc();
    rememberCreatedIn(qc, "k2", "other-vault");
    expect(renderHook(() => useKnownRecordDoor("k2"), { wrapper: wrap(qc) }).result.current).toBe("other-vault");
  });
});

describe("useCachedRecord", () => {
  const V = "vault-1";
  const seed = (qc: QueryClient, records: unknown[], vault = V) => qc.setQueryData(recordsKey(vault), page(records));

  it("is the record of the vault's list, or null: no vault, no id, or a record the list does not hold", () => {
    const qc = newQc();
    seed(qc, [row({ id: "u1" })]);
    expect(renderHook(() => useCachedRecord(V, "u1"), { wrapper: wrap(qc) }).result.current?.id).toBe("u1");
    expect(renderHook(() => useCachedRecord(undefined, "u1"), { wrapper: wrap(qc) }).result.current).toBeNull();
    expect(renderHook(() => useCachedRecord(V, null), { wrapper: wrap(qc) }).result.current).toBeNull();
    expect(renderHook(() => useCachedRecord(V, "u-none"), { wrapper: wrap(qc) }).result.current).toBeNull();
    expect(renderHook(() => useCachedRecord("vault-2", "u1"), { wrapper: wrap(qc) }).result.current).toBeNull();
  });

  it("re-renders the caller when the row, whole, carries a NEW ETag (a write that landed, a reconcile)", async () => {
    const qc = newQc();
    seed(qc, [row({ id: "u2", etag: '"e1"' })]);
    let renders = 0;
    const { result } = renderHook(() => { renders++; return useCachedRecord(V, "u2"); }, { wrapper: wrap(qc) });
    expect(result.current?.etag).toBe('"e1"');
    const before = renders;
    act(() => seed(qc, [row({ id: "u2", etag: '"e2"', facts: { name: "B" } })]));
    await waitFor(() => expect(result.current?.etag).toBe('"e2"'));
    expect(renders).toBeGreaterThan(before);
    expect(result.current?.facts.name).toBe("B");
  });

  it("does NOT re-render for the same ETag, for a row that arrives label-only (no ETag, or hydrated false), or for another vault's list", async () => {
    const qc = newQc();
    seed(qc, [row({ id: "u3", etag: '"e1"' })]);
    let renders = 0;
    renderHook(() => { renders++; return useCachedRecord(V, "u3"); }, { wrapper: wrap(qc) });
    await act(async () => {});
    const before = renders;
    act(() => seed(qc, [row({ id: "u3", etag: '"e1"', facts: { name: "same etag, other facts" } })]));
    act(() => seed(qc, [row({ id: "u3", etag: null })]));
    act(() => seed(qc, [{ ...row({ id: "u3", etag: '"e5"' }), hydrated: false }]));
    act(() => seed(qc, [row({ id: "u3", etag: '"e9"' })], "vault-2"));
    await act(async () => {});
    expect(renders).toBe(before);
  });

  it("while the subscription holds the last whole ETag it saw, a row back to the earlier ETag is news again", async () => {
    const qc = newQc();
    seed(qc, [row({ id: "u4", etag: '"e1"' })]);
    const { result } = renderHook(() => useCachedRecord(V, "u4"), { wrapper: wrap(qc) });
    act(() => seed(qc, [row({ id: "u4", etag: '"e2"' })]));
    await waitFor(() => expect(result.current?.etag).toBe('"e2"'));
    act(() => seed(qc, [row({ id: "u4", etag: '"e1"' })]));
    await waitFor(() => expect(result.current?.etag).toBe('"e1"'));
  });
});

describe("a read in flight does not block the caches (a held read, then released)", () => {
  it("useRecord shows no data until the vault answers", async () => {
    const g = gate<Response>();
    fakePlatform({ read: () => g.promise as unknown as Response });
    const { result } = renderHook(() => useRecord("h1", `${VAULT_ORIGIN}/base/e/h1`), { wrapper: wrap(newQc()) });
    await act(async () => {});
    expect(result.current.isPending).toBe(true);
    await act(async () => {
      g.release(resp(200, { body: { "@id": `${VAULT_ORIGIN}/base/e/h1`, "@type": "t:Person", name: "late" }, headers: { etag: '"late"' } }));
    });
    await waitFor(() => expect(result.current.data?.facts.name).toBe("late"));
  });
});

