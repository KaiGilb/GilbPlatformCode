// The caches of the record lists and of the single record reads: the keys, the page shape, and the writes that put a row into every list and read that already holds it.
// Taken from the app's record hooks file (the part its cache helpers and the Plan card's row cache share); the hooks themselves are not here.

import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { readRecord, type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";

/** The records query key for a vault.
 *
 * ⚠ Since Base Cycle013 VDS-7 the `podId` threaded through this module is the vault
 * NAMESPACE (`ReachableVault.vaultId`) — the identity the READ REQUEST names in its path — not
 * the session vault's entity-id tail it used to be. That is the point of the change: the
 * cache key and the request now carry the SAME vault, so a key can no longer claim a scope
 * the request never had. The one place the entity-id tail is still needed is the CREATE
 * container (`POST /lws/c/<containerId>`), which is passed separately and explicitly. */
export function recordsKey(vaultId: string, lifecycle: "live" | "ended" = "live") {
  return lifecycle === "live"
    ? (["base", "records", vaultId] as const)
    : (["base", "records", vaultId, "ended"] as const);
}

/**
 * GAPP214.30b (VAScaling B1) — the heads every cached record read sits under: one record
 * (`["base","record", …]`) and every records list (`["base","records", …]`, the infinite pages
 * and the snapshots below). A caller that must drop them after a write invalidates THESE, ⛔ never
 * a retyped literal.
 */
export const RECORD_QUERY_HEAD = ["base", "record"] as const;

export const RECORDS_QUERY_HEAD = ["base", "records"] as const;

/** One hydrated page of the register (infinite-query pageParam = offset). */
export interface RecordsPage {
  records: GridRecord[];
  total: number;
  complete: boolean;
  pageSize: number;
  offset: number;
  types?: { typeUri: string; count: number }[];
  /**
   * 🔴 Cycle161 — A DISCLOSURE, ⛔ A PAGING VERDICT, and the two must never be the same field.
   *
   * True when a `?type=` chunk this view ISSUED did not come back — so the app asked the vault
   * and did not get an answer, and an empty list is therefore the app's, not the vault's. Read
   * ONLY by the grid's empty state.
   *
   * ⛔ `getNextPageParam` must never read it, and `complete` must never carry it. Folding a
   * standing property into `complete` pins `hasNextPage` true forever, which re-arms the
   * auto-prefetch, which fires another whole-catalogue sweep — measured on live M1
   * 2026-09-03 as **652 chunk GETs to render a 4-node vault**, four sweeps where one was owed.
   * That is exactly the storm the comment on `getNextPageParam` was written about, and this
   * separate field is what keeps the two questions apart.
   */
  askBounded?: boolean;
  /** Bare type names this view already F-LIVE'd — next pages reuse them, ⛔ no census / F-CAT. */
  issuedTypeNames?: string[];
  /** GAPP214.26 — the issued names that are relation kinds a person chose. Next pages reuse
   * them, so such rows stay out of the device store on every page. Absent when there are none. */
  issuedRelationTypeNames?: string[];
  /** GAPP214.27 — the census's `scannedVaults` (the named vault and the nested vaults the viewer
   * reaches), as the platform answered on page 0. Absent when no census was read. The multi-vault
   * merge reads it to keep a record under the vault that holds it (ValPlan R44). */
  scannedVaults?: string[];
  /** GAPP214.28 — how many rows the records door served on this page, before this function
   * hides presentation rows or adds recovered and pinned ones. A walk that pages a vault to its
   * end advances its offset by this count, the door's own, ⛔ not by `records.length`. Absent on
   * returns that asked the door nothing. */
  doorRows?: number;
  /**
   * C214-SP1b — only on a page read in full rows: where the door says the next page starts (`nextOffset`), or null when it names
   * none. A full-row page may stop early at the door's byte budget and drops rows this viewer may not read from `records` while they
   * still sit in its window, so the next page starts HERE, ⛔ not at `offset + doorRows`. Absent on a page read as before.
   */
  nextOffset?: number | null;
  /**
   * C214-SP1b — set on the live list's pages ({@link useRecords}): this page is the slice `[skip, skip + size)` of the full-row page
   * read at `at` (100 rows, one request), handed to the list {@link LIST_SLICE_ROWS} at a time, as the door's own pages were before.
   */
  slice?: { at: number; skip: number; rows: number; served: number; nextOffset: number | null; chunkComplete: boolean };
}

/** A temp id carries the `temp:` prefix until the vault mints the real one (create flow). */
export function isTempId(id: string): boolean {
  return id.startsWith("temp:");
}

/** Flatten infinite pages, de-duping by id (create optimistic rows may collide). */
export function flattenRecordPages(data: InfiniteData<RecordsPage> | undefined): GridRecord[] {
  if (!data?.pages?.length) return [];
  const seen = new Set<string>();
  const out: GridRecord[] = [];
  for (const page of data.pages) {
    if (!page?.records) continue;
    for (const r of page.records) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}

// ── cache helpers (infinite pages) ───────────────────────────────────────────────────
export function emptyPage(): RecordsPage {
  return { records: [], total: 0, complete: true, pageSize: 20, offset: 0 };
}

/**
 * Put a row the caller already holds into every read of that record. No network read.
 * `insert` defaults to false: a save replaces the row in every list that already holds it
 * (the record's vault and the screen vault) and never adds a row. A missing list stays missing.
 * A create passes `{ insert: true }` and adds the row only on `vaultId`.
 */
export function putRecordInCaches(
  qc: QueryClient,
  vaultId: string,
  row: BaseRecord,
  opts?: { insert?: boolean },
): void {
  if (opts?.insert === true) {
    setList(qc, vaultId, (l) => upsert(l, row));
  } else {
    for (const held of listsHolding(qc, row.id)) setList(qc, held, (l) => replaceOnly(l, row));
  }
  setRecordReads(qc, row.id, () => row);
}

/** Live `recordsKey` lists that already contain `id`. Snapshots and ended lists are not lists. */
function listsHolding(qc: QueryClient, id: string): string[] {
  const vaults: string[] = [];
  for (const query of qc.getQueryCache().findAll({ queryKey: RECORDS_QUERY_HEAD })) {
    const key = query.queryKey;
    if (key.length !== 3 || typeof key[2] !== "string" || key[2] === "snapshot") continue;
    const data = query.state.data as InfiniteData<RecordsPage> | undefined;
    if (!flattenRecordPages(data).some((r) => r.id === id)) continue;
    vaults.push(key[2]);
  }
  return vaults;
}

/**
 * Read one record as stored now and put it into the vault's list and every read of the record — the
 * same reconcile `useUpdateRecord` runs after a 412. For a write made outside the card's own save
 * (the person photo, Cycle214 step 1e it2, Agent.Scaling B1), so the card and its next save hold the
 * stored facts and ETag, ⛔ not the ones read before that write.
 */
export async function refreshRecordInCaches(
  qc: QueryClient,
  vaultId: string,
  record: { id: string; entityUri: string | null },
): Promise<BaseRecord | null> {
  const fresh = await readRecord(record.id, record.entityUri);
  if (!fresh) return null;
  putRecordInCaches(qc, vaultId, fresh, { insert: true });
  return fresh;
}

export function setList(qc: QueryClient, vaultId: string, fn: (list: GridRecord[]) => GridRecord[]) {
  qc.setQueryData<InfiniteData<RecordsPage>>(recordsKey(vaultId), (prev) => {
    const pages = prev?.pages?.length ? prev.pages : [emptyPage()];
    const flat = flattenRecordPages({ pages, pageParams: prev?.pageParams ?? [0] });
    const next = fn(flat);
    // Keep page 0 as the full optimistic/current set so mutations stay simple; later pages
    // stay for scroll-append until the next refetch rebuilds them.
    const head: RecordsPage = {
      ...(pages[0] ?? emptyPage()),
      records: next,
      total: Math.max(pages[0]?.total ?? 0, next.length),
    };
    return {
      pages: [head, ...pages.slice(1).map((p) => ({ ...p, records: [] }))],
      pageParams: prev?.pageParams ?? [0],
    };
  });
}

function replaceOnly(list: GridRecord[], rec: BaseRecord): GridRecord[] {
  const asGridRow: GridRecord = { updatedAt: Date.now(), ...rec };
  const i = list.findIndex((r) => r.id === rec.id);
  if (i < 0) return list;
  const copy = list.slice();
  copy[i] = { ...list[i]!, ...asGridRow };
  return copy;
}

export function upsert(list: GridRecord[], rec: BaseRecord): GridRecord[] {
  const asGridRow: GridRecord = { updatedAt: Date.now(), ...rec };
  const i = list.findIndex((r) => r.id === rec.id);
  if (i >= 0) {
    const copy = list.slice();
    copy[i] = { ...list[i]!, ...asGridRow };
    return copy;
  }
  return [asGridRow, ...list];
}

/**
 * 🔴 GAPP214.42 — a write the app made lands in EVERY cached read of that record
 * (`["base","record",id,<door>]`), ⛔ not only in the viewed vault's list. A card opened from a
 * label-only list row (Stakeholders, the multi-vault grid) renders from the record read; the list
 * row alone left both panes on the first read. Only entries that exist are updated; none is made.
 */
export function setRecordReads(qc: QueryClient, id: string, next: (prev: BaseRecord) => BaseRecord): void {
  qc.setQueriesData<BaseRecord | null>({ queryKey: [...RECORD_QUERY_HEAD, id] }, (prev) => (prev ? next(prev) : prev));
}
