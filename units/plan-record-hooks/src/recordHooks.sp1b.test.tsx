// @vitest-environment jsdom

/**
 * the Records list reads the platform's full rows (`?include=body&limit=100`, GilbPlatform 119 S5a), walks them by the
 * door's `nextOffset`, hands the list 20 rows at a time (so it draws and prefetches in the very steps it did before), and puts every
 * document into the record reads' cache so a face, the detail pane and a search hit read nothing of their own.
 *
 * MOCK: the records door, the census, the plane reading and the device store are mocked; `hydrateRecordsPage`, `snapshotVaultRecords`,
 * `useRecords`, `seedRecordReads` and `recordFromServed` are the real ones.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { afterEach as afterEachSetUp, beforeEach as beforeEachSetUp } from "vitest";
import { setUp, tearDown } from "../test/support";
beforeEachSetUp(() => {
  setUp();
});
afterEachSetUp(() => tearDown());
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const vaultSets = vi.hoisted(() => ({ listVaultRecordsPage: vi.fn(), listVaultHeldTypes: vi.fn(), lwsReadFetch: vi.fn() }));
/** The feed as the fake platform answers it: `since=head` → position `c:<l|e>:<clock>`; a cursor → the rows changed since. */
const feed = vi.hoisted(() => ({ clock: 1, changed: [] as { i: number; t: number }[], ended: [] as { i: number; t: number }[], log: [] as string[], invalid: false }));
const records = vi.hoisted(() => ({ readRecord: vi.fn() }));
const cache = vi.hoisted(() => ({
  listRecordRefs: vi.fn(async () => [] as { id: string; vaultId: string; typeUri: string; updatedAt: number }[]),
  forgetRecord: vi.fn(async (_id: string) => undefined),
  rememberRecord: vi.fn(async () => undefined),
}));
const planes = vi.hoisted(() => ({ heldTypePlanes: vi.fn() }));

vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listVaultRecordsPage: vaultSets.listVaultRecordsPage,
  listVaultHeldTypes: vaultSets.listVaultHeldTypes,
  lwsReadFetch: vaultSets.lwsReadFetch,
}));
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => ({ ...(await orig<Record<string, unknown>>()), readRecord: records.readRecord }));
vi.mock("@kaigilb/gilbplatformcode-working-set-store", async (orig) => ({ ...(await orig<Record<string, unknown>>()), ...cache }));
vi.mock("@kaigilb/gilbplatformcode-vault-type-census", async (orig) => ({ ...(await orig<Record<string, unknown>>()), heldTypePlanes: planes.heldTypePlanes }));

import { recordsKey } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { hydrateRecordsPage, LIST_SLICE_ROWS, seedRecordReads, useRecords } from "./recordHooks";
import { recordFromServed, type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";

/** The record the record reads' cache holds for a row, or null when none is held or it was kept 15 s ago or more (the app's `heldRecordOf`, which the hooks unit does not take). */
function heldRecordOf(qc: QueryClient, id: string, entityUri: string | null | undefined): BaseRecord | null {
  if (!entityUri) return null;
  const st = qc.getQueryState<BaseRecord | null>(["base", "record", id, vaultOriginOf(entityUri)]);
  if (!st?.data || Date.now() - st.dataUpdatedAt >= 15_000) return null;
  return st.data;
}


const VAULT = "https://home.platform.example.test/vault";
const N = 250;
const idOf = (i: number) => `rec-${String(i).padStart(4, "0")}`;
const uriOf = (i: number) => `https://home.platform.example.test/vault/e/${idOf(i)}`;
/** Row i: every 7th has no label (an untitled note); every 5th is a Person with a photo. */
const docOf = (i: number): Record<string, unknown> => ({
  "@id": uriOf(i),
  "@type": i % 5 === 0 ? "t:Person" : "t:NoteDocument",
  ...(i % 7 === 3 ? { "a:body": `untitled ${i}` } : { "a:title": `Row ${i}` }),
  ...(i % 5 === 0 ? { "a:profilePhoto": { "@id": `https://home.platform.example.test/vault/e/photo-${i}` } } : {}),
});
/** One window of the door, newest first. With `includeBody` the door serves up to `limit` rows, their documents and ETags, and
 *  `nextOffset` — the end of the window it EXAMINED, which here skips one refused row per page (so `offset + rows` is wrong). */
function door(_v: string, _names: readonly string[], offset = 0, opts: { includeBody?: boolean; limit?: number } = {}) {
  const size = opts.includeBody ? Math.min(opts.limit ?? 100, 100) : 20;
  const examined = Array.from({ length: Math.min(size, N - offset) }, (_, k) => offset + k);
  // The door drops rows 45, 95, 145, … (rows this viewer may not read): served < examined.
  const served = opts.includeBody ? examined.filter((i) => i % 50 !== 45) : examined;
  const rows = served.map((i) => ({
    id: idOf(i),
    entityUri: uriOf(i),
    typeUri: i % 5 === 0 ? "t:Person" : "t:NoteDocument",
    updatedAt: 10_000 - i,
    label: i % 7 === 3 ? null : `Row ${i}`,
    ...(opts.includeBody ? { body: docOf(i), etag: `"e${i}"` } : {}),
  }));
  const end = offset + examined.length;
  return Promise.resolve({
    records: rows,
    total: N,
    complete: end >= N,
    pageSize: size,
    offset,
    served: rows.length,
    ...(opts.includeBody ? { nextOffset: end } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vaultSets.listVaultHeldTypes.mockResolvedValue({
    types: [
      { typeUri: "https://ontology.platform.example.test/base/t/NoteDocument", count: 200 },
      { typeUri: "https://ontology.platform.example.test/base/t/Person", count: 50 },
    ],
    totalItems: N,
    totalItemsKind: "exact",
    excludedTypes: [],
    vault: VAULT,
    scannedVaults: [VAULT],
  });
  planes.heldTypePlanes.mockResolvedValue({ planes: new Map([["NoteDocument", "entity"], ["Person", "entity"]]), dereferences: 2, parentWalks: 0, batched: 0 });
  vaultSets.listVaultRecordsPage.mockImplementation(async (...a: Parameters<typeof door>) => {
    feed.log.push(`page ${a[2] ?? 0}`);
    return door(...a);
  });
  Object.assign(feed, { clock: 1, changed: [], ended: [], log: [], invalid: false });
  vaultSets.lwsReadFetch.mockImplementation(async (url: string) => {
    const q = new URL(url).searchParams;
    const ended = q.get("lifecycle") === "ended";
    const since = q.get("since")!;
    feed.log.push(`${ended ? "ended" : "live"} since=${since.startsWith("c:") ? "cursor" : since}`);
    const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (since === "head") return json(200, { records: [], complete: true, nextCursor: `c:${ended ? "e" : "l"}:${feed.clock}` });
    if (feed.invalid) return json(400, { error: "since_cursor_invalid", message: "since must be the nextCursor this list returned to you for this vault, or the word start, or the word head", accepted: ["start", "head", "<nextCursor>"] });
    const from = Number(since.split(":")[2]);
    const pool = (ended ? feed.ended : feed.changed).filter((r) => r.t > from);
    return json(200, {
      records: pool.map((r) => ({ entity: uriOf(r.i), typeUri: "t:NoteDocument", label: `Row ${r.i}`, updatedAt: null, ...(ended ? {} : { body: { ...docOf(r.i), "a:title": `Row ${r.i} changed` }, etag: `"c${r.t}"` }) })),
      complete: true,
      nextCursor: `c:${ended ? "e" : "l"}:${feed.clock}`,
    });
  });
  records.readRecord.mockImplementation(async (id: string) => {
    const i = Number(id.slice(4));
    return recordFromServed(id, docOf(i), `"e${i}"`);
  });
});

describe("hydrateRecordsPage in full rows", () => {
  it("asks ?include=body&limit=100, reads no untitled row on its own, hands every document on, and names the next page", async () => {
    const got: BaseRecord[] = [];
    const page = await hydrateRecordsPage(VAULT, 0, [], [], "live", [], [], false, { limit: 100, onBodies: (rs) => got.push(...rs) });
    const opts = vaultSets.listVaultRecordsPage.mock.calls[0]![3] as { includeBody?: boolean; limit?: number };
    expect(opts.includeBody).toBe(true);
    expect(opts.limit).toBe(100);
    expect(records.readRecord).not.toHaveBeenCalled();
    expect(page.records.length).toBe(98); // rows 45 and 95 refused by the door
    expect(page.nextOffset).toBe(100);
    expect(got.length).toBe(98);
    // The documents are exactly what a single read gives.
    const r3 = got.find((r) => r.id === idOf(3))!;
    expect(r3).toEqual(recordFromServed(idOf(3), docOf(3), `"e3"`));
    // An untitled row is the whole record, as main's read made it (hydrated), a labelled row stays a label row (as before).
    const row3 = page.records.find((r) => r.id === idOf(3))!;
    expect(row3.hydrated).toBe(true);
    expect(row3.facts).toEqual(r3.facts);
    const row2 = page.records.find((r) => r.id === idOf(2))!;
    expect(row2).toMatchObject({ hydrated: false, facts: { label: "Row 2" }, etag: null });
  });

  it("without the option it reads as before: 20 label rows, no bodies, an untitled row read on its own", async () => {
    const page = await hydrateRecordsPage(VAULT, 0, []);
    expect((vaultSets.listVaultRecordsPage.mock.calls[0]![3] as { includeBody?: boolean } | undefined)?.includeBody).toBeFalsy();
    expect(page.records.length).toBe(20);
    expect(page.nextOffset).toBeUndefined();
    expect(records.readRecord).toHaveBeenCalledTimes(3); // rows 3, 10, 17
  });
});


describe("useRecords: full rows of 100, shown 20 at a time", () => {
  function wrap() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    return { qc, wrapper };
  }

  it("the first screen is the same 40 rows in the same order as before, from ONE records request, and every document is held", async () => {
    const { qc, wrapper } = wrap();
    const { result } = renderHook(() => useRecords(VAULT), { wrapper });
    await waitFor(() => expect(result.current.data.length).toBe(2 * LIST_SLICE_ROWS));
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.data.length).toBe(40);
    expect(vaultSets.listVaultRecordsPage).toHaveBeenCalledTimes(1);
    expect(result.current.data.map((r) => r.id)).toEqual(Array.from({ length: 40 }, (_, k) => idOf(k)));
    // The first page carries the first screen's 40 rows (never more bytes than main on the first screen).
    expect((vaultSets.listVaultRecordsPage.mock.calls[0]![3] as { limit?: number }).limit).toBe(40);
    // …and hands them on 20 at a time, the pages the list grew by before (the grid's rows, the graph's nodes, the prefetch).
    const pages = qc.getQueryData<{ pages: { records: unknown[] }[] }>(recordsKey(VAULT))!.pages;
    expect(pages.map((pg) => pg.records.length)).toEqual([20, 20]);
    expect(records.readRecord).not.toHaveBeenCalled();
    // A row's face and the detail pane find the record in the reads' cache, under the record's own door.
    expect(heldRecordOf(qc, idOf(5), uriOf(5))).toEqual(recordFromServed(idOf(5), docOf(5), `"e5"`));
    expect(heldRecordOf(qc, idOf(39), uriOf(39))?.etag).toBe(`"e39"`);
  });

  it("scrolling to the end reads 4 requests for 250 rows (at 0, 40, 140, 240: each the door's nextOffset), and lists every row once", async () => {
    const { result } = renderHook(() => useRecords(VAULT), { wrapper: wrap().wrapper });
    await waitFor(() => expect(result.current.data.length).toBe(40));
    for (let k = 0; k < 20 && result.current.hasNextPage; k++) {
      await result.current.fetchNextPage();
      await waitFor(() => expect(result.current.isFetchingNextPage).toBe(false));
    }
    expect(result.current.hasNextPage).toBe(false);
    expect(vaultSets.listVaultRecordsPage.mock.calls.map((c) => c[2])).toEqual([0, 40, 140, 240]);
    const ids = result.current.data.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(N - 5);
  });
});

describe("seedRecordReads never overwrites what the cache holds", () => {
  it("keeps an entry already there (a write made in this session) and fills the rest", () => {
    const qc = new QueryClient();
    const mine = { ...recordFromServed(idOf(4), docOf(4), `"mine"`), facts: { title: "edited here" } };
    qc.setQueryData(["base", "record", idOf(4), vaultOriginOf(uriOf(4))], mine);
    seedRecordReads(qc, [recordFromServed(idOf(4), docOf(4), `"e4"`), recordFromServed(idOf(6), docOf(6), `"e6"`)]);
    expect(heldRecordOf(qc, idOf(4), uriOf(4))).toBe(mine);
    expect(heldRecordOf(qc, idOf(6), uriOf(6))?.etag).toBe(`"e6"`);
    expect(heldRecordOf(qc, idOf(6), null)).toBeNull();
  });
});

