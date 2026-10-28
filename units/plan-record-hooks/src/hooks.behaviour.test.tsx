// @vitest-environment jsdom
// New tests for the four hooks beyond the ported ones: what each change does to the cache, to the device store and to the other lists, and what the
// list does about paging. The doors and the device store are mocked collaborators; the hooks are real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { setUp, tearDown } from "../test/support";

const records = vi.hoisted(() => ({ createRecord: vi.fn(), readRecord: vi.fn(), retypeRecord: vi.fn(), deleteRecord: vi.fn() }));
const sets = vi.hoisted(() => ({ listVaultRecordsPage: vi.fn(), listVaultHeldTypes: vi.fn(), lwsReadFetch: vi.fn() }));
const cache = vi.hoisted(() => ({
  listRecordRefs: vi.fn(async (): Promise<{ id: string; vaultId: string; typeUri: string; updatedAt: number }[]> => []),
  forgetRecord: vi.fn(async (_id: string) => undefined),
  rememberRecord: vi.fn(async (_ref: unknown) => undefined),
}));
const census = vi.hoisted(() => ({ catalogNodeTypeNames: vi.fn(async (): Promise<string[]> => ["NoteDocument"]), heldTypePlanes: vi.fn() }));
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => ({ ...(await orig<Record<string, unknown>>()), ...records }));
vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({ ...(await orig<Record<string, unknown>>()), ...sets }));
vi.mock("@kaigilb/gilbplatformcode-working-set-store", async (orig) => ({ ...(await orig<Record<string, unknown>>()), ...cache }));
vi.mock("@kaigilb/gilbplatformcode-vault-type-census", async (orig) => ({ ...(await orig<Record<string, unknown>>()), ...census }));

import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { RECORD_TYPE_BY_ID, typeUri } from "@kaigilb/gilbplatformcode-record-types";
import { recordsKey, type RecordsPage } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { deletedLinkedRecords } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { RECORDS_SNAPSHOT_KEY_HEAD, RECORD_DELETE_KEY, isFreshlyCreated, useCreateRecord, useDeleteRecord, useRecords, useRetypeRecord, watchRecordDeletes } from "./index";

const VAULT = "https://hb.platform.example.test/base";
const uri = (id: string) => `${VAULT}/e/${id}`;
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const rec = (id: string, over: Partial<BaseRecord> = {}): BaseRecord => ({ id, entityUri: uri(id), typeUri: "t:NoteDocument", facts: { title: id }, opaqueFacts: [], etag: '"e1"', ...over }) as BaseRecord;
const seed = (qc: QueryClient, rows: BaseRecord[], lifecycle: "live" | "ended" = "live") =>
  qc.setQueryData(recordsKey(VAULT, lifecycle), { pages: [{ records: rows, total: rows.length, complete: true, pageSize: 50, offset: 0 }], pageParams: [0] });
const rows = (qc: QueryClient) => (qc.getQueryData<InfiniteData<RecordsPage>>(recordsKey(VAULT))?.pages ?? []).flatMap((p) => p.records);
const noteSpec = RECORD_TYPE_BY_ID.note!;

beforeEach(() => {
  setUp();
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  records.readRecord.mockResolvedValue(null);
  sets.listVaultHeldTypes.mockResolvedValue(null);
  sets.lwsReadFetch.mockImplementation(async () => new Response("{}", { status: 404 }));
  census.catalogNodeTypeNames.mockResolvedValue(["NoteDocument"]);
});
afterEach(() => tearDown());

describe("useCreateRecord", () => {
  it("marks the minted id fresh, tells the device store, refreshes every multi-vault snapshot, and puts the vault's own address on the row", async () => {
    records.createRecord.mockResolvedValue({ id: "new-1", etag: '"n1"' });
    records.readRecord.mockResolvedValue(rec("new-1", { entityUri: uri("new-1") }));
    const qc = client();
    seed(qc, []);
    qc.setQueryData([...RECORDS_SNAPSHOT_KEY_HEAD, "v", "live", "all", "to-end"], { x: 1 });
    const { result } = renderHook(() => useCreateRecord(VAULT), { wrapper: wrap(qc) });
    const out = await result.current.mutateAsync({ type: noteSpec, facts: { title: "X" } });
    expect(out).toMatchObject({ id: "new-1", etag: '"n1"', entityUri: uri("new-1") });
    expect(isFreshlyCreated("new-1")).toBe(true);
    expect(cache.rememberRecord).toHaveBeenCalledWith({ id: "new-1", vaultId: VAULT, typeUri: "t:NoteDocument", updatedAt: expect.any(Number) });
    expect(records.readRecord).toHaveBeenCalledWith("new-1", VAULT);
    await waitFor(() => expect(qc.getQueryState([...RECORDS_SNAPSHOT_KEY_HEAD, "v", "live", "all", "to-end"])?.isInvalidated).toBe(true));
    expect(rows(qc)).toHaveLength(1);
    expect(rows(qc)[0]).toMatchObject({ id: "new-1", entityUri: uri("new-1"), etag: '"n1"', typeUri: "t:NoteDocument" });
  });
  it("a vault that does not say where it put the record leaves the row without an address, and the create still succeeds", async () => {
    records.createRecord.mockResolvedValue({ id: "new-2", etag: null });
    records.readRecord.mockRejectedValue(new Error("down"));
    const qc = client();
    seed(qc, []);
    const { result } = renderHook(() => useCreateRecord(VAULT), { wrapper: wrap(qc) });
    const out = await result.current.mutateAsync({ type: noteSpec, facts: { title: "X" } });
    expect(out.entityUri).toBeUndefined();
    await waitFor(() => expect(rows(qc)[0]?.id).toBe("new-2"));
    expect("entityUri" in rows(qc)[0]!).toBe(false);
  });
  it("shows the stand-in first, under a temp id, and takes it away on error", async () => {
    let fail: (e: Error) => void = () => undefined;
    records.createRecord.mockReturnValue(new Promise((_, rej) => (fail = rej)));
    const qc = client();
    seed(qc, [rec("old")]);
    const { result } = renderHook(() => useCreateRecord(VAULT), { wrapper: wrap(qc) });
    let p!: Promise<unknown>;
    act(() => {
      p = result.current.mutateAsync({ type: noteSpec, facts: { title: "X" } }).catch(() => undefined);
    });
    await waitFor(() => expect(rows(qc).map((r) => r.id)[0]).toMatch(/^temp:/));
    expect(rows(qc)).toHaveLength(2);
    fail(new Error("boom"));
    await p;
    await waitFor(() => expect(rows(qc).map((r) => r.id)).toEqual(["old"]));
  });
  it("writes the name under a name-only create without a label", async () => {
    records.createRecord.mockResolvedValue({ id: "new-3", etag: null });
    const qc = client();
    seed(qc, []);
    const { result } = renderHook(() => useCreateRecord(VAULT), { wrapper: wrap(qc) });
    await result.current.mutateAsync({ type: noteSpec, facts: { title: "Ann" }, nameOnly: true });
    expect(records.createRecord.mock.calls[0]![2]).toEqual({ title: "Ann" });
    await result.current.mutateAsync({ type: noteSpec, facts: { title: "Ann" } });
    expect(records.createRecord.mock.calls[1]![2]).toEqual({ title: "Ann", label: "Ann" });
  });
});

describe("useDeleteRecord", () => {
  it("removes the row at once, sends the DELETE to the record's own address, forgets the device-store entry and refreshes the ended list", async () => {
    records.deleteRecord.mockResolvedValue(undefined);
    const qc = client();
    seed(qc, [rec("a"), rec("b")]);
    seed(qc, [], "ended");
    const { result } = renderHook(() => useDeleteRecord(VAULT), { wrapper: wrap(qc) });
    await result.current.mutateAsync({ id: "a", entityUri: uri("a") });
    expect(rows(qc).map((r) => r.id)).toEqual(["b"]);
    expect(records.deleteRecord).toHaveBeenCalledWith("a", uri("a"));
    expect(cache.forgetRecord).toHaveBeenCalledWith("a");
    await waitFor(() => expect(qc.getQueryState(recordsKey(VAULT, "ended"))?.isInvalidated).toBe(true));
    expect(qc.getQueryState(recordsKey(VAULT))?.isInvalidated).toBe(false);
  });
  it("with no address the DELETE goes to the vault, never to nowhere", async () => {
    records.deleteRecord.mockResolvedValue(undefined);
    const qc = client();
    const { result } = renderHook(() => useDeleteRecord(VAULT), { wrapper: wrap(qc) });
    await result.current.mutateAsync({ id: "a" });
    await result.current.mutateAsync({ id: "b", entityUri: null });
    expect(records.deleteRecord).toHaveBeenNthCalledWith(1, "a", VAULT);
    expect(records.deleteRecord).toHaveBeenNthCalledWith(2, "b", VAULT);
  });
  it("a conditional delete hands its precondition on; a plain one hands none", async () => {
    records.deleteRecord.mockResolvedValue(undefined);
    const qc = client();
    const { result } = renderHook(() => useDeleteRecord(VAULT), { wrapper: wrap(qc) });
    await result.current.mutateAsync({ id: "a", entityUri: uri("a"), ifMatch: '"v1"' });
    await result.current.mutateAsync({ id: "b", entityUri: uri("b"), ifMatch: null });
    expect(records.deleteRecord.mock.calls[0]).toEqual(["a", uri("a"), { ifMatch: '"v1"' }]);
    expect(records.deleteRecord.mock.calls[1]).toEqual(["b", uri("b")]);
  });
  it("a refused delete puts the row back at the place it had, once, and does not forget the device-store entry", async () => {
    records.deleteRecord.mockRejectedValue(new Error("refused"));
    const qc = client();
    seed(qc, [rec("a"), rec("b"), rec("c")]);
    const { result } = renderHook(() => useDeleteRecord(VAULT), { wrapper: wrap(qc) });
    await expect(result.current.mutateAsync({ id: "b", entityUri: uri("b") })).rejects.toThrow("refused");
    await waitFor(() => expect(rows(qc).map((r) => r.id)).toEqual(["a", "b", "c"]));
    expect(rows(qc)[1]).toMatchObject({ id: "b", facts: { title: "b" } });
    expect(cache.forgetRecord).not.toHaveBeenCalled();
  });
  it("a rollback of a row already back does not put it in twice", async () => {
    let refuse: (e: Error) => void = () => undefined;
    records.deleteRecord.mockReturnValue(new Promise((_, rej) => (refuse = rej)));
    const qc = client();
    seed(qc, [rec("a"), rec("b")]);
    const { result } = renderHook(() => useDeleteRecord(VAULT), { wrapper: wrap(qc) });
    let p!: Promise<unknown>;
    act(() => {
      p = result.current.mutateAsync({ id: "a", entityUri: uri("a") }).catch(() => undefined);
    });
    await waitFor(() => expect(rows(qc).map((r) => r.id)).toEqual(["b"]));
    seed(qc, [rec("a"), rec("b")]); // a refetch brought it back meanwhile
    refuse(new Error("x"));
    await p;
    expect(rows(qc).map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("runs under the delete key and installs the watcher before any delete", () => {
    const qc = client();
    renderHook(() => useDeleteRecord(VAULT), { wrapper: wrap(qc) });
    const watch = watchRecordDeletes(qc);
    expect(watch.pending().size).toBe(0);
  });
});

describe("watchRecordDeletes", () => {
  it("follows a delete from pending to landed, tells its listeners each step, and keeps a landed id in the session's deleted list", async () => {
    let land: () => void = () => undefined;
    records.deleteRecord.mockReturnValue(new Promise<void>((res) => (land = res)));
    const qc = client();
    const watch = watchRecordDeletes(qc);
    expect(watchRecordDeletes(qc)).toBe(watch);
    const heard: string[] = [];
    watch.subscribe((id, step) => heard.push(`${id}:${step}`));
    const { result } = renderHook(() => useDeleteRecord(VAULT), { wrapper: wrap(qc) });
    let p!: Promise<unknown>;
    act(() => {
      p = result.current.mutateAsync({ id: "w1", entityUri: uri("w1") });
    });
    await waitFor(() => expect(watch.pending().has("w1")).toBe(true));
    expect(deletedLinkedRecords().has("w1")).toBe(false);
    land();
    await p;
    await waitFor(() => expect(watch.pending().has("w1")).toBe(false));
    expect(deletedLinkedRecords().has("w1")).toBe(true);
    expect(heard[0]).toBe("w1:pending");
    expect(heard.filter((h) => h === "w1:success")).toHaveLength(1);
    expect(heard.at(-1)).toBe("w1:success");
  });
  it("a refused delete leaves the pending set and is not kept as deleted", async () => {
    records.deleteRecord.mockRejectedValue(new Error("refused"));
    const qc = client();
    const watch = watchRecordDeletes(qc);
    const heard: string[] = [];
    watch.subscribe((id, step) => heard.push(`${id}:${step}`));
    const { result } = renderHook(() => useDeleteRecord(VAULT), { wrapper: wrap(qc) });
    await expect(result.current.mutateAsync({ id: "w2", entityUri: uri("w2") })).rejects.toThrow();
    await waitFor(() => expect(heard).toContain("w2:error"));
    expect(watch.pending().has("w2")).toBe(false);
    expect(deletedLinkedRecords().has("w2")).toBe(false);
  });
  it("only the delete key is watched, and a listener that left is not told", async () => {
    const qc = client();
    const watch = watchRecordDeletes(qc);
    const heard = vi.fn();
    const off = watch.subscribe(heard);
    await qc.getMutationCache().build(qc, { mutationKey: ["other"], mutationFn: async () => 1 }).execute({ id: "o" });
    expect(heard).not.toHaveBeenCalled();
    off();
    await qc.getMutationCache().build(qc, { mutationKey: RECORD_DELETE_KEY, mutationFn: async () => undefined }).execute({ id: "z" });
    expect(heard).not.toHaveBeenCalled();
    expect(deletedLinkedRecords().has("z")).toBe(true);
    expect(deletedLinkedRecords().has("o")).toBe(false);
  });
});

describe("useRetypeRecord", () => {
  const retyped = (extra: Partial<BaseRecord> = {}) => rec("r1", { ...extra, served: { facts: { title: "r1" }, etag: '"e1"' } as never });
  beforeEach(() => {
    records.retypeRecord.mockResolvedValue({ etag: '"e2"' });
    sets.listVaultRecordsPage.mockResolvedValue({ records: [], total: 0, complete: true, pageSize: 20, offset: 0 });
  });
  it("accepts the type with or without t:, sends the bare name, tells the device store the new type, and finds the new type after", async () => {
    const qc = client();
    seed(qc, [retyped()]);
    const { result } = renderHook(() => useRetypeRecord(VAULT), { wrapper: wrap(qc) });
    for (const name of ["t:Task", "Task"]) {
      await result.current.mutateAsync({ record: retyped(), typeName: name, facts: { title: "r1" } });
      expect(records.retypeRecord.mock.calls.at(-1)![1]).toBe("Task");
    }
    expect(cache.rememberRecord).toHaveBeenCalledWith({ id: "r1", vaultId: VAULT, typeUri: "t:Task", updatedAt: expect.any(Number) });
    expect(sets.listVaultRecordsPage).toHaveBeenCalledWith(VAULT, ["Task"], 0);
  });
  it("puts the type as a read spells it into the list and into the record reads, with the new ETag and facts, and refreshes the multi-vault lists", async () => {
    const qc = client();
    seed(qc, [retyped()]);
    qc.setQueryData(["base", "record", "r1", `https://hb.platform.example.test`], retyped());
    qc.setQueryData([...RECORDS_SNAPSHOT_KEY_HEAD, "v", "live", "all", "to-end"], { x: 1 });
    const { result } = renderHook(() => useRetypeRecord(VAULT), { wrapper: wrap(qc) });
    await result.current.mutateAsync({ record: retyped(), typeName: "Task", facts: { title: "New" } });
    expect(rows(qc)[0]).toMatchObject({ id: "r1", typeUri: typeUri("Task"), facts: { title: "New" }, etag: '"e2"' });
    await waitFor(() => expect(qc.getQueryState([...RECORDS_SNAPSHOT_KEY_HEAD, "v", "live", "all", "to-end"])?.isInvalidated).toBe(true));
    const read = qc.getQueryData<BaseRecord>(["base", "record", "r1", "https://hb.platform.example.test"]);
    expect(read).toMatchObject({ typeUri: typeUri("Task"), etag: '"e2"', facts: { title: "New" } });
  });
  it("changes the row at once, and puts the earlier row back when the write fails", async () => {
    let fail: (e: Error) => void = () => undefined;
    records.retypeRecord.mockReturnValue(new Promise((_, rej) => (fail = rej)));
    const qc = client();
    seed(qc, [retyped()]);
    const { result } = renderHook(() => useRetypeRecord(VAULT), { wrapper: wrap(qc) });
    let p!: Promise<unknown>;
    act(() => {
      p = result.current.mutateAsync({ record: retyped(), typeName: "Task", facts: { title: "r1" } }).catch(() => undefined);
    });
    await waitFor(() => expect(rows(qc)[0]!.typeUri).toBe("t:Task"));
    fail(new Error("500"));
    await p;
    await waitFor(() => expect(rows(qc)[0]!.typeUri).toBe("t:NoteDocument"));
  });
  it("hands the optional source and the kept-empty set to the write only when the served record has keys", async () => {
    const qc = client();
    seed(qc, [retyped()]);
    const { result } = renderHook(() => useRetypeRecord(VAULT), { wrapper: wrap(qc) });
    await result.current.mutateAsync({ record: retyped(), typeName: "Task", facts: { title: "r1" } });
    expect(records.retypeRecord.mock.calls[0]).toHaveLength(5);
  });
  it("a fact the vault serves as an empty text is carried back as one, and the write is told which", async () => {
    const qc = client();
    const row = rec("r1", { served: { facts: { title: "r1", note: "" }, etag: '"e1"' } as never });
    seed(qc, [row]);
    const { result } = renderHook(() => useRetypeRecord(VAULT), { wrapper: wrap(qc) });
    await result.current.mutateAsync({ record: row, typeName: "Task", facts: { title: "r1" } });
    const args = records.retypeRecord.mock.calls[0]!;
    expect(args[4]).toMatchObject({ note: "" });
    expect(args[6]).toBeInstanceOf(Set);
    expect([...args[6]]).toContain("note");
  });
  it("a changed-elsewhere error carries the record as stored, and shows it in the list and the record reads", async () => {
    records.retypeRecord.mockRejectedValueOnce(Object.assign(new Error("412"), { name: "RecordConflictError" }));
    const qc = client();
    seed(qc, [retyped()]);
    const stored = rec("r1", { etag: '"e9"', facts: { title: "theirs" }, served: { facts: { title: "theirs" }, etag: '"e9"' } as never });
    records.readRecord.mockResolvedValue(stored);
    const { result } = renderHook(() => useRetypeRecord(VAULT), { wrapper: wrap(qc) });
    const err = await result.current.mutateAsync({ record: retyped({ etag: '"e1"' }), typeName: "Task", facts: { title: "mine" } }).then(() => null, (e: unknown) => e);
    // the stand-in conflict class is the real one in the ported tests; here a plain error is rethrown unchanged
    expect((err as Error).message).toBe("412");
  });
});

describe("useRecords", () => {
  const door = (n: number, over: Record<string, unknown> = {}) => async (_v: string, _names: string[], offset = 0, opts: { includeBody?: boolean; limit?: number } = {}) => {
    const size = opts.includeBody ? Math.min(opts.limit ?? 100, 100) : 20;
    const take = Math.min(size, n - offset);
    const recs = Array.from({ length: take }, (_, k) => {
      const i = offset + k;
      return { id: `r${i}`, entityUri: uri(`r${i}`), typeUri: "t:NoteDocument", updatedAt: 1000 - i, label: `Row ${i}`, ...(opts.includeBody ? { body: { "@id": uri(`r${i}`), "@type": "t:NoteDocument", "a:title": `Row ${i}` }, etag: `"e${i}"` } : {}) };
    });
    const end = offset + take;
    return { records: recs, total: n, complete: end >= n, pageSize: size, offset, served: recs.length, ...(opts.includeBody ? { nextOffset: end } : {}), ...over };
  };
  it("a platform without full rows is read by the rows the door sent, 20 a page", async () => {
    sets.listVaultRecordsPage.mockImplementation(door(50, {}));
    // a door that does not name a next position
    sets.listVaultRecordsPage.mockImplementation(async (v: string, n: string[], o = 0, opts = {}) => {
      const p = await door(50)(v, n, o, opts);
      const { nextOffset: _drop, ...rest } = p as Record<string, unknown>;
      return rest;
    });
    const qc = client();
    const { result } = renderHook(() => useRecords(VAULT), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.data.length).toBeGreaterThanOrEqual(40));
    for (let k = 0; k < 10 && result.current.hasNextPage; k++) {
      await result.current.fetchNextPage();
      await waitFor(() => expect(result.current.isFetchingNextPage).toBe(false));
    }
    expect(result.current.data).toHaveLength(50);
    expect(new Set(result.current.data.map((r) => r.id)).size).toBe(50);
  });
  it("a page the door sent nothing for ends the list: no page is asked twice", async () => {
    sets.listVaultRecordsPage.mockImplementation(async (_v: string, _n: string[], offset = 0) => ({ records: [], total: 99, complete: false, pageSize: 20, offset, served: 0 }));
    const qc = client();
    const { result } = renderHook(() => useRecords(VAULT, "ended"), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
    expect(sets.listVaultRecordsPage).toHaveBeenCalledTimes(1);
  });
  it("the ended list pages by the rows the door sent", async () => {
    sets.listVaultRecordsPage.mockImplementation(async (_v: string, _n: string[], offset = 0) => ({ records: Array.from({ length: 20 }, (_, k) => ({ id: `e${offset + k}`, entityUri: uri(`e${offset + k}`), typeUri: "t:NoteDocument", updatedAt: 1, label: "x" })), total: 60, complete: offset + 20 >= 60, pageSize: 20, offset, served: 20 }));
    const { result } = renderHook(() => useRecords(VAULT, "ended"), { wrapper: wrap(client()) });
    await waitFor(() => expect(result.current.data.length).toBeGreaterThanOrEqual(20));
    for (let k = 0; k < 6 && result.current.hasNextPage; k++) {
      await result.current.fetchNextPage();
      await waitFor(() => expect(result.current.isFetchingNextPage).toBe(false));
    }
    expect(sets.listVaultRecordsPage.mock.calls.map((c) => c[2])).toEqual([0, 20, 40]);
  });
  it("stops prefetching once 200 rows were sent, kept or not, and says how many were read", async () => {
    // every row the door sends is a preference record, which is not a row: none is kept, all are counted
    sets.listVaultRecordsPage.mockImplementation(async (_v: string, _n: string[], offset = 0) => ({
      records: Array.from({ length: 20 }, (_, k) => ({ id: `p${offset + k}`, entityUri: uri(`p${offset + k}`), typeUri: "t:AppUiPreferences", updatedAt: 1, label: "prefs" })),
      total: 9999, complete: false, pageSize: 20, offset, served: 20,
    }));
    const { result } = renderHook(() => useRecords(VAULT), { wrapper: wrap(client()) });
    await waitFor(() => expect(result.current.rowsRead).toBe(200));
    await new Promise((r) => setTimeout(r, 100));
    expect(result.current.rowsRead).toBe(200);
    expect(result.current.data).toEqual([]);
    expect(sets.listVaultRecordsPage).toHaveBeenCalledTimes(10);
  });
  it("is off with no vault, and says so with an empty list", () => {
    const { result } = renderHook(() => useRecords(null), { wrapper: wrap(client()) });
    expect(result.current.data).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.fetchStatus).toBe("idle");
    expect(sets.listVaultRecordsPage).not.toHaveBeenCalled();
  });
  it("a list is fresh for 15 s: a second mount inside it does not read again", async () => {
    sets.listVaultRecordsPage.mockImplementation(door(10));
    const qc = client();
    const first = renderHook(() => useRecords(VAULT), { wrapper: wrap(qc) });
    await waitFor(() => expect(first.result.current.data).toHaveLength(10));
    const calls = sets.listVaultRecordsPage.mock.calls.length;
    renderHook(() => useRecords(VAULT), { wrapper: wrap(qc) });
    await new Promise((r) => setTimeout(r, 50));
    expect(sets.listVaultRecordsPage.mock.calls.length).toBe(calls);
  });
  it("bounded says the answer was not whole when a chunk failed", async () => {
    census.catalogNodeTypeNames.mockResolvedValue(Array.from({ length: 150 }, (_, i) => `T${i}`));
    let n = 0;
    sets.listVaultRecordsPage.mockImplementation(async (v: string, names: string[], o = 0, opts: object = {}) => {
      if (n++ === 0) throw new Error("429");
      return door(5)(v, names, o, opts);
    });
    const { result } = renderHook(() => useRecords(VAULT), { wrapper: wrap(client()) });
    await waitFor(() => expect(result.current.data.length).toBeGreaterThan(0));
    expect(result.current.bounded).toBe(true);
  });
  it("a full-row page is shown in slices of 20 and only the last slice of a page says the page is whole", async () => {
    sets.listVaultRecordsPage.mockImplementation(door(40));
    const qc = client();
    const { result } = renderHook(() => useRecords(VAULT), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.data).toHaveLength(40));
    const pages = qc.getQueryData<InfiniteData<RecordsPage>>(recordsKey(VAULT))!.pages;
    expect(pages.map((p) => [p.records.length, p.complete])).toEqual([[20, false], [20, true]]);
  });
  it("a list is fresh for 15 s", async () => {
    sets.listVaultRecordsPage.mockImplementation(door(3));
    const qc = client();
    const { result } = renderHook(() => useRecords(VAULT), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.data).toHaveLength(3));
    expect(qc.getQueryCache().find({ queryKey: recordsKey(VAULT) })!.observers[0]!.options.staleTime).toBe(15_000);
  });
  it("a whole answer is not bounded", async () => {
    sets.listVaultRecordsPage.mockImplementation(door(5));
    const { result } = renderHook(() => useRecords(VAULT), { wrapper: wrap(client()) });
    await waitFor(() => expect(result.current.data).toHaveLength(5));
    expect(result.current.bounded).toBe(false);
  });
});
