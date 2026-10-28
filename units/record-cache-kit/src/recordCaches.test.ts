import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InfiniteData } from "@tanstack/react-query";
import {
  RECORD_QUERY_HEAD,
  RECORDS_QUERY_HEAD,
  emptyPage,
  flattenRecordPages,
  isTempId,
  putRecordInCaches,
  recordsKey,
  refreshRecordInCaches,
  setList,
  setRecordReads,
  upsert,
  type RecordsPage,
} from "./recordCaches";
import { setUp, tearDown } from "../test/support";
import { baseRow, entityUri, fakeDoor, gridRow, VAULT } from "../test/rows";

const OTHER = "https://other.platform.example.test/vault";

function page(records: ReturnType<typeof gridRow>[], extra: Partial<RecordsPage> = {}): RecordsPage {
  return { records, total: records.length, complete: true, pageSize: 20, offset: 0, ...extra };
}

function seedList(qc: QueryClient, vault: string, records: ReturnType<typeof gridRow>[], key: readonly unknown[] = recordsKey(vault)) {
  qc.setQueryData<InfiniteData<RecordsPage>>(key, { pages: [page(records)], pageParams: [0] });
}

function listOf(qc: QueryClient, vault: string, key: readonly unknown[] = recordsKey(vault)) {
  return qc.getQueryData<InfiniteData<RecordsPage>>(key);
}

beforeEach(() => {
  setUp();
});
afterEach(() => {
  tearDown();
  vi.unstubAllGlobals();
});

describe("the keys", () => {
  it("recordsKey names the vault, and the ended list one part more", () => {
    expect(recordsKey("v")).toEqual(["base", "records", "v"]);
    expect(recordsKey("v", "live")).toEqual(["base", "records", "v"]);
    expect(recordsKey("v", "ended")).toEqual(["base", "records", "v", "ended"]);
  });
  it("the two heads are the prefix of every record read and every records list", () => {
    expect(RECORD_QUERY_HEAD).toEqual(["base", "record"]);
    expect(RECORDS_QUERY_HEAD).toEqual(["base", "records"]);
  });
  it("a temp id carries the temp: prefix", () => {
    expect(isTempId("temp:abc")).toBe(true);
    expect(isTempId("abc")).toBe(false);
    expect(isTempId("xtemp:abc")).toBe(false);
  });
});

describe("flattenRecordPages and emptyPage", () => {
  it("an absent or empty set of pages is no rows", () => {
    expect(flattenRecordPages(undefined)).toEqual([]);
    expect(flattenRecordPages({ pages: [], pageParams: [] })).toEqual([]);
  });
  it("keeps the first row of an id met twice, in page order, and skips a page with no records", () => {
    const a1 = gridRow("a", { n: "first" });
    const a2 = gridRow("a", { n: "second" });
    const b = gridRow("b");
    const data = { pages: [page([a1, b]), { ...page([]), records: undefined as never }, page([a2])], pageParams: [0, 1, 2] };
    const out = flattenRecordPages(data);
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
    expect(out[0]).toBe(a1);
  });
  it("emptyPage is an empty complete page of 20", () => {
    expect(emptyPage()).toEqual({ records: [], total: 0, complete: true, pageSize: 20, offset: 0 });
  });
});

describe("upsert and setList", () => {
  it("upsert puts a new row first and replaces a held row in place, stamping updatedAt on a row that has none", () => {
    const list = [gridRow("a", { n: "1" }), gridRow("b", { n: "1" })];
    const added = upsert(list, baseRow("c", { n: "2" }));
    expect(added.map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(typeof added[0]!.updatedAt).toBe("number");
    const replaced = upsert(list, baseRow("b", { n: "9" }));
    expect(replaced.map((r) => r.id)).toEqual(["a", "b"]);
    expect(replaced[1]!.facts.n).toBe("9");
    expect(list[1]!.facts.n).toBe("1");
  });
  it("setList on a vault with no list makes one page holding the result", () => {
    const qc = new QueryClient();
    setList(qc, VAULT, (l) => [...l, gridRow("a")]);
    const data = listOf(qc, VAULT)!;
    expect(data.pages).toHaveLength(1);
    expect(data.pages[0]!.records.map((r) => r.id)).toEqual(["a"]);
    expect(data.pages[0]!.total).toBe(1);
    expect(data.pageParams).toEqual([0]);
  });
  it("setList keeps the total it had when it is larger, and empties the later pages", () => {
    const qc = new QueryClient();
    qc.setQueryData<InfiniteData<RecordsPage>>(recordsKey(VAULT), {
      pages: [page([gridRow("a")], { total: 40 }), page([gridRow("b")], { offset: 20 })],
      pageParams: [0, 20],
    });
    setList(qc, VAULT, (l) => l);
    const data = listOf(qc, VAULT)!;
    expect(data.pages[0]!.records.map((r) => r.id)).toEqual(["a", "b"]);
    expect(data.pages[0]!.total).toBe(40);
    expect(data.pages[1]!.records).toEqual([]);
    expect(data.pageParams).toEqual([0, 20]);
  });
});

describe("putRecordInCaches", () => {
  it("a save replaces the row in every list that holds it, adds it to no list, and makes no list", () => {
    const qc = new QueryClient();
    seedList(qc, VAULT, [gridRow("a", { n: "old" })]);
    seedList(qc, OTHER, [gridRow("a", { n: "old" }), gridRow("z")]);
    seedList(qc, "https://third.platform.example.test/vault", [gridRow("z")]);
    putRecordInCaches(qc, VAULT, baseRow("a", { n: "new" }));
    expect(listOf(qc, VAULT)!.pages[0]!.records[0]!.facts.n).toBe("new");
    expect(listOf(qc, OTHER)!.pages[0]!.records.map((r) => [r.id, r.facts.n])).toEqual([["a", "new"], ["z", undefined]]);
    expect(listOf(qc, "https://third.platform.example.test/vault")!.pages[0]!.records.map((r) => r.id)).toEqual(["z"]);
    putRecordInCaches(qc, "https://fourth.platform.example.test/vault", baseRow("a", { n: "newer" }));
    expect(listOf(qc, "https://fourth.platform.example.test/vault")).toBeUndefined();
  });
  it("a create (insert) adds the row first on the named vault only, and makes the list when there is none", () => {
    const qc = new QueryClient();
    seedList(qc, VAULT, [gridRow("a")]);
    seedList(qc, OTHER, [gridRow("a")]);
    putRecordInCaches(qc, VAULT, baseRow("n"), { insert: true });
    expect(listOf(qc, VAULT)!.pages[0]!.records.map((r) => r.id)).toEqual(["n", "a"]);
    expect(listOf(qc, OTHER)!.pages[0]!.records.map((r) => r.id)).toEqual(["a"]);
    putRecordInCaches(qc, "https://fresh.platform.example.test/vault", baseRow("m"), { insert: true });
    expect(listOf(qc, "https://fresh.platform.example.test/vault")!.pages[0]!.records.map((r) => r.id)).toEqual(["m"]);
  });
  it("insert: false is the save", () => {
    const qc = new QueryClient();
    putRecordInCaches(qc, VAULT, baseRow("a"), { insert: false });
    expect(listOf(qc, VAULT)).toBeUndefined();
  });
  it("an ended list and a snapshot are not lists that hold the row", () => {
    const qc = new QueryClient();
    seedList(qc, VAULT, [gridRow("a", { n: "old" })], recordsKey(VAULT, "ended"));
    seedList(qc, VAULT, [gridRow("a", { n: "old" })], [...RECORDS_QUERY_HEAD, "snapshot"]);
    putRecordInCaches(qc, VAULT, baseRow("a", { n: "new" }));
    expect(listOf(qc, VAULT, recordsKey(VAULT, "ended"))!.pages[0]!.records[0]!.facts.n).toBe("old");
    expect(listOf(qc, VAULT, [...RECORDS_QUERY_HEAD, "snapshot"])!.pages[0]!.records[0]!.facts.n).toBe("old");
    expect(listOf(qc, VAULT)).toBeUndefined();
  });
  it("a live list that does not hold the row is left as the same object", () => {
    const qc = new QueryClient();
    seedList(qc, VAULT, [gridRow("z")]);
    const before = listOf(qc, VAULT);
    putRecordInCaches(qc, VAULT, baseRow("a", { n: "new" }));
    expect(listOf(qc, VAULT)).toBe(before);
  });
  it("writes the row into every record read of that id and makes none", () => {
    const qc = new QueryClient();
    const doorA = ["base", "record", "a", "https://plan.platform.example.test"] as const;
    const doorB = ["base", "record", "a", "https://other.platform.example.test"] as const;
    qc.setQueryData(doorA, baseRow("a", { n: "old" }));
    qc.setQueryData(doorB, null);
    putRecordInCaches(qc, VAULT, baseRow("a", { n: "new" }));
    expect((qc.getQueryData(doorA) as { facts: Record<string, string> }).facts.n).toBe("new");
    expect(qc.getQueryData(doorB)).toBeNull();
    expect(qc.getQueryCache().findAll({ queryKey: [...RECORD_QUERY_HEAD, "a"] })).toHaveLength(2);
  });
});

describe("setRecordReads", () => {
  it("changes only the reads that hold a row, with the function's answer", () => {
    const qc = new QueryClient();
    qc.setQueryData(["base", "record", "a", "h1"], baseRow("a", { n: "1" }));
    qc.setQueryData(["base", "record", "a", "h2"], null);
    qc.setQueryData(["base", "record", "b", "h1"], baseRow("b", { n: "1" }));
    setRecordReads(qc, "a", (prev) => ({ ...prev, facts: { n: "2" } }));
    expect((qc.getQueryData(["base", "record", "a", "h1"]) as { facts: { n: string } }).facts.n).toBe("2");
    expect(qc.getQueryData(["base", "record", "a", "h2"])).toBeNull();
    expect((qc.getQueryData(["base", "record", "b", "h1"]) as { facts: { n: string } }).facts.n).toBe("1");
  });
});

describe("refreshRecordInCaches", () => {
  it("reads the record as stored, puts it on the named vault's list and every read, and returns it", async () => {
    const door = fakeDoor({ a: { body: { "a:body": "stored now" }, etag: '"e9"' } });
    vi.stubGlobal("fetch", door.fetchMock);
    const qc = new QueryClient();
    seedList(qc, VAULT, [gridRow("a", { body: "stale" })]);
    qc.setQueryData(["base", "record", "a", "https://plan.platform.example.test"], baseRow("a", { body: "stale" }));
    const fresh = await refreshRecordInCaches(qc, VAULT, { id: "a", entityUri: entityUri("a") });
    expect(fresh?.facts.body).toBe("stored now");
    expect(fresh?.etag).toBe('"e9"');
    expect(listOf(qc, VAULT)!.pages[0]!.records[0]!.facts.body).toBe("stored now");
    expect((qc.getQueryData(["base", "record", "a", "https://plan.platform.example.test"]) as { etag: string }).etag).toBe('"e9"');
  });
  it("adds the row to the named vault's list when that list does not hold it yet", async () => {
    vi.stubGlobal("fetch", fakeDoor({ a: { body: { "a:body": "x" }, etag: '"e1"' } }).fetchMock);
    const qc = new QueryClient();
    seedList(qc, VAULT, [gridRow("z")]);
    await refreshRecordInCaches(qc, VAULT, { id: "a", entityUri: entityUri("a") });
    expect(listOf(qc, VAULT)!.pages[0]!.records.map((r) => r.id)).toEqual(["a", "z"]);
  });
  it("a record that is gone is null and writes nothing", async () => {
    const door = fakeDoor({});
    vi.stubGlobal("fetch", door.fetchMock);
    const qc = new QueryClient();
    expect(await refreshRecordInCaches(qc, VAULT, { id: "a", entityUri: entityUri("a") })).toBeNull();
    expect(listOf(qc, VAULT)).toBeUndefined();
  });
});
