// @vitest-environment jsdom
// New tests (the source has none for the cap, the parent's node as such, or the hook). Real `lws-vault-sets`, `lws-records`,
// `vault-origin-rule` over a fake platform in which every host is a store (test/support.ts).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MEMBER_OF_ATTR, MEMBER_OF_FIND_PAGE, MEMBER_OF_HYDRATE_CAP, cachedRecordsPointingAt, loadMemberOfChildren, useMemberOfChildren } from "./index";
import { NORWAY, SYSTEM, VAULT_B, fakePlatform, kids, setUp, tearDown } from "../test/support";

beforeEach(() => setUp());
afterEach(() => tearDown());

const newQc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const world = (n: number, origin = SYSTEM, parent = NORWAY) => fakePlatform({ stores: { [origin]: { [parent]: kids(origin, 0, n) } } });

describe("the constants", () => {
  it("are the source's", () => {
    expect(MEMBER_OF_ATTR).toBe("a:memberOf");
    expect(MEMBER_OF_FIND_PAGE).toBe(200);
    expect(MEMBER_OF_HYDRATE_CAP).toBe(80);
  });
});

describe("the hydrate cap of 80", () => {
  it("0 ids: no read, no record, total 0", async () => {
    const w = world(0);
    const out = await loadMemberOfChildren(NORWAY);
    expect(out).toEqual({ records: [], total: 0 });
    expect(w.reads).toHaveLength(0);
    expect(w.finds).toHaveLength(1);
  });
  it("3 ids: 3 reads, 3 records, total 3", async () => {
    const w = world(3);
    const out = await loadMemberOfChildren(NORWAY);
    expect(w.reads).toHaveLength(3);
    expect(out.records).toHaveLength(3);
    expect(out.total).toBe(3);
  });
  it("80 ids: exactly the cap, 80 reads, nothing withheld", async () => {
    const w = world(80);
    const out = await loadMemberOfChildren(NORWAY);
    expect(w.reads).toHaveLength(80);
    expect(out.records).toHaveLength(80);
    expect(out.total).toBe(80);
  });
  it("81 ids: the reads are capped at 80, and the total still says 81", async () => {
    const w = world(81);
    const out = await loadMemberOfChildren(NORWAY);
    expect(w.reads).toHaveLength(80);
    expect(out.records).toHaveLength(80);
    expect(out.total).toBe(81);
    // the first 80 in the order the platform gave them; the 81st is not read
    expect(w.reads.map((r) => r.id)).toEqual(Array.from({ length: 80 }, (_, i) => `kommune-${i}`));
  });
  it("records already in the cache count against the cap and are not read again", async () => {
    const w = world(120);
    const qc = newQc();
    for (let i = 0; i < 10; i++) {
      qc.setQueryData(["base", "record", `kommune-${i}`, SYSTEM], { id: `kommune-${i}`, entityUri: `${SYSTEM}/base/e/kommune-${i}`, typeUri: "t:Municipality", facts: { title: `K${i}`, memberOf: NORWAY }, etag: null });
    }
    const out = await loadMemberOfChildren(NORWAY, qc);
    expect(out.records).toHaveLength(80);
    expect(w.reads).toHaveLength(70);
    expect(w.reads.map((r) => r.id)).not.toContain("kommune-3");
    expect(out.records.slice(0, 10).map((r) => r.id)).toEqual(Array.from({ length: 10 }, (_, i) => `kommune-${i}`));
    expect(out.total).toBe(120);
  });
  it("a cache already holding 85 children (past the cap) leaves no room: no read at all, never a negative room", async () => {
    const w = world(100);
    const qc = newQc();
    for (let i = 0; i < 85; i++) {
      qc.setQueryData(["base", "record", `kommune-${i}`, SYSTEM], { id: `kommune-${i}`, entityUri: `${SYSTEM}/base/e/kommune-${i}`, typeUri: "t:Municipality", facts: { memberOf: NORWAY }, etag: null });
    }
    const out = await loadMemberOfChildren(NORWAY, qc);
    expect(w.reads).toHaveLength(0);
    expect(out.records).toHaveLength(85);
    expect(out.total).toBe(100);
  });
  it("the total is never lower than what was hydrated (a stale count)", async () => {
    fakePlatform({ stores: { [SYSTEM]: { [NORWAY]: kids(SYSTEM, 0, 5) } }, counts: { [NORWAY]: 2 } });
    const out = await loadMemberOfChildren(NORWAY);
    expect(out.records).toHaveLength(5);
    expect(out.total).toBe(5);
  });
  it("the reads are made together, one per id, each at the child's own node", async () => {
    const kidsB = kids(VAULT_B, 0, 4, "vault");
    const parent = `${VAULT_B}/vault/e/parent`;
    const w = fakePlatform({ stores: { [VAULT_B]: { [parent]: kidsB } } });
    await loadMemberOfChildren(parent);
    expect(w.reads.map((r) => r.url)).toEqual(kidsB.map((u) => `${VAULT_B}/lws/r/${u.slice(u.lastIndexOf("/") + 1)}`));
  });
  it("a read child with the same id twice is listed once", async () => {
    fakePlatform({ stores: { [SYSTEM]: { [NORWAY]: [`${SYSTEM}/base/e/k1`, `${SYSTEM}/vault/e/k1`] } } });
    const out = await loadMemberOfChildren(NORWAY);
    expect(out.records.map((r) => r.id)).toEqual(["k1"]);
  });
});

describe("the parent's own node is the one asked", () => {
  it("the find goes to the parent's host, once per page, never to the base address", async () => {
    const parent = `${VAULT_B}/vault/e/parent`;
    const w = fakePlatform({ stores: { [VAULT_B]: { [parent]: kids(VAULT_B, 0, 250, "vault") } } });
    await loadMemberOfChildren(parent);
    expect(w.finds.map((f) => f.origin)).toEqual([VAULT_B, VAULT_B]);
    expect(w.all().filter((u) => u.startsWith("https://platform.example.test/"))).toEqual([]);
  });
  it("a child kept in a different store than its parent is not found (documented limit)", async () => {
    const parent = `${VAULT_B}/vault/e/parent`;
    fakePlatform({ stores: { [SYSTEM]: { [parent]: kids(SYSTEM, 0, 3) } } });
    expect((await loadMemberOfChildren(parent)).total).toBe(0);
  });
});

describe("useMemberOfChildren", () => {
  it("reads nothing for a missing parent", async () => {
    const w = world(3);
    const a = renderHook(() => useMemberOfChildren(null), { wrapper: wrap(newQc()) });
    const b = renderHook(() => useMemberOfChildren(undefined), { wrapper: wrap(newQc()) });
    expect(a.result.current.fetchStatus).toBe("idle");
    expect(b.result.current.fetchStatus).toBe("idle");
    expect(w.fetchFake).not.toHaveBeenCalled();
  });
  it("loads the children under the key [base, memberOfChildren, parent], through the page's client", async () => {
    world(2);
    const qc = newQc();
    const { result } = renderHook(() => useMemberOfChildren(NORWAY), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.data?.total).toBe(2));
    expect(qc.getQueryData(["base", "memberOfChildren", NORWAY])).toBe(result.current.data);
  });
  it("seeds from the records already in the page's cache", async () => {
    const w = world(0);
    const qc = newQc();
    qc.setQueryData(["base", "record", "nordre-follo", SYSTEM], { id: "nordre-follo", entityUri: `${SYSTEM}/base/e/nordre-follo`, typeUri: "t:Municipality", facts: { memberOf: NORWAY }, etag: null });
    const { result } = renderHook(() => useMemberOfChildren(NORWAY), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.data?.records.map((r) => r.id)).toEqual(["nordre-follo"]));
    expect(w.reads).toHaveLength(0);
  });
  it("is fresh for 30 seconds: a second card for the same parent reads nothing more", async () => {
    const w = world(2);
    const qc = newQc();
    const a = renderHook(() => useMemberOfChildren(NORWAY), { wrapper: wrap(qc) });
    await waitFor(() => expect(a.result.current.data?.total).toBe(2));
    const before = w.finds.length;
    const b = renderHook(() => useMemberOfChildren(NORWAY), { wrapper: wrap(qc) });
    expect(b.result.current.data?.total).toBe(2);
    await waitFor(() => expect(b.result.current.fetchStatus).toBe("idle"));
    expect(w.finds.length).toBe(before);
  });
  it("a refused find is an error, not an empty list", async () => {
    const { fetchFake } = fakePlatform();
    fetchFake.mockImplementation(async () => ({ ok: false, status: 500, headers: new Headers(), text: async () => "boom", json: async () => ({}) }) as unknown as Response);
    const { result } = renderHook(() => useMemberOfChildren(NORWAY), { wrapper: wrap(newQc()) });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("cachedRecordsPointingAt", () => {
  const rec = (id: string, facts: Record<string, string>) => ({ id, entityUri: `${SYSTEM}/base/e/${id}`, typeUri: "t:Municipality", facts, etag: null });
  it("finds a record by the parent's address, its id, or its rebuilt address", () => {
    const qc = newQc();
    qc.setQueryData(["base", "record", "a", SYSTEM], rec("a", { memberOf: NORWAY }));
    qc.setQueryData(["base", "record", "b", SYSTEM], rec("b", { memberOf: `${NORWAY}?x=1#y` }));
    expect(cachedRecordsPointingAt(qc, NORWAY).map((r) => r.id).sort()).toEqual(["a", "b"]);
  });
  it("reads every shape of cached rows once, and lists a record once", () => {
    const qc = newQc();
    const a = rec("a", { memberOf: NORWAY });
    qc.setQueryData(["base", "records", "v"], { pages: [{ records: [a, a] }], pageParams: [0] });
    qc.setQueryData(["base", "search", "x"], { records: [a] });
    expect(cachedRecordsPointingAt(qc, NORWAY).map((r) => r.id)).toEqual(["a"]);
  });
  it("ignores queries outside [base], rows without an id or facts, and records that point elsewhere", () => {
    const qc = newQc();
    qc.setQueryData(["other", "x"], rec("z", { memberOf: NORWAY }));
    qc.setQueryData(["base", "bad1"], { id: "", facts: { memberOf: NORWAY } });
    qc.setQueryData(["base", "bad2"], { id: "q", facts: ["x"] });
    qc.setQueryData(["base", "bad3"], { id: "r" });
    qc.setQueryData(["base", "elsewhere"], rec("e", { memberOf: `${SYSTEM}/base/e/other-parent` }));
    expect(cachedRecordsPointingAt(qc, NORWAY)).toEqual([]);
  });
  it("carries opaqueFacts and the etag of the row (the mirror of the detail reads' rebuild)", () => {
    const qc = newQc();
    qc.setQueryData(["base", "r"], { ...rec("a", { memberOf: NORWAY }), opaqueFacts: ["languages"], etag: '"e1"' });
    expect(cachedRecordsPointingAt(qc, NORWAY)[0]).toMatchObject({ opaqueFacts: ["languages"], etag: '"e1"', entityUri: `${SYSTEM}/base/e/a` });
  });
  it("an entry with no opaqueFacts or etag gets [] and null, and an unknown type is empty text", () => {
    const qc = newQc();
    qc.setQueryData(["base", "r"], { id: "a", facts: { memberOf: NORWAY } });
    expect(cachedRecordsPointingAt(qc, NORWAY)[0]).toMatchObject({ opaqueFacts: [], etag: null, typeUri: "" });
  });
});
