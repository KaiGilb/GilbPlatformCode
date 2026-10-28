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

import { useRecords } from "./recordHooks";
import { recordFromServed } from "@kaigilb/gilbplatformcode-lws-records";

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


// Gap test: nothing held "a nextOffset that does not move ends the read".
describe("the live list never reads a page it already read", () => {
  it("a page whose nextOffset does not move forward ends the list (no second read of the same window, no repeated rows)", async () => {
    vaultSets.listVaultRecordsPage.mockImplementation(async (...a: Parameters<typeof door>) => {
      const p = await door(...a);
      // From offset 40 on, the door names the SAME position again (a stuck window).
      return (a[2] ?? 0) >= 40 ? { ...p, nextOffset: a[2], complete: false } : p;
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useRecords(VAULT), { wrapper });
    await waitFor(() => expect(result.current.data.length).toBe(40));
    for (let k = 0; k < 12 && result.current.hasNextPage; k++) {
      await result.current.fetchNextPage();
      await waitFor(() => expect(result.current.isFetchingNextPage).toBe(false));
    }
    expect(result.current.hasNextPage).toBe(false);
    const offsets = vaultSets.listVaultRecordsPage.mock.calls.map((c) => c[2] ?? 0);
    expect(offsets.filter((o) => o === 40)).toHaveLength(1);
    const ids = result.current.data.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

