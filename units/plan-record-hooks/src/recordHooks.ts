// The record hooks of the Plan card: the vault's records as an infinite list (`useRecords`), and the three mutations that change it (`useCreateRecord`, `useRetypeRecord`, `useDeleteRecord`).
//
// A mutation applies to the query cache synchronously (onMutate), so the grid draws at once; the write then runs in the background; on success the canonical id and ETag replace the optimistic stand-in,
// on error the cache rolls back. Saves ride the ETag / If-Match floor: a 412 reads again and reconciles to the vault's truth (the vault is always the source of truth; the cache and the
// device's working-set replica are transient mirrors).
// Taken from the app's record-hooks file: the statements its split plan gives to this unit; the cache helpers are in `record-cache-kit`.

import { useEffect, useMemo } from "react";
import { hashKey, useInfiniteQuery, useMutation, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import {
  createRecord,
  deleteRecord,
  factsAsServed,
  readRecord,
  recordFromServed,
  withTypeUri,
  retypeRecord,
  RecordConflictError,
  type BaseRecord,
  type RecordFacts,
  writeSource,
} from "@kaigilb/gilbplatformcode-lws-records";
import {
  isUiPrefsRecord,
  listVaultHeldTypes,
  listVaultRecordsPage,
  lwsReadFetch,
  mapWithConcurrency,
  typeLocalName,
  type VaultRecordRef,
  type VaultRecordsPage,
} from "@kaigilb/gilbplatformcode-lws-vault-sets";
import {
  entityDisplayName,
  flattenRecordPages,
  isTempId,
  RECORDS_QUERY_HEAD,
  recordsKey,
  setList,
  setRecordReads,
  upsert,
  withCanonicalLabel,
  type RecordsPage,
} from "@kaigilb/gilbplatformcode-record-cache-kit";
import { normalizeTypeUri, resolveType, typeUriForVaultNamespace, type RecordTypeSpec } from "@kaigilb/gilbplatformcode-record-types";
import { headRecordState, RECORD_PAGE_LIMIT, type RecordSyncState } from "@kaigilb/gilbplatformcode-record-sync";
import { forgetDeletedLinkedRecord, forgetPageLink, notePageLinks } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import {
  catalogNodeTypeNames,
  censusBareNames,
  chosenCensusCandidates,
  classifyCensusNames,
  heldTypePlanes,
  issueChosenCensusNames,
} from "@kaigilb/gilbplatformcode-vault-type-census";
import { forgetRecord, listRecordRefs, rememberRecord, type WorkingSetRef } from "@kaigilb/gilbplatformcode-working-set-store";
import { keysSavedElsewhere } from "./savedElsewhere";
import { typeFacetKey } from "./workingSetFacets";

/**
 * This module owns the multi-vault list's snapshot key: one entry per vault and per list (lifecycle and type choice).
 * `snapshotKeyParts` is its only reader; a module that walks the cached snapshots imports both, never a copy of the layout.
 */
export const RECORDS_SNAPSHOT_KEY_HEAD = [...RECORDS_QUERY_HEAD, "snapshot"] as const;

/**
 * After a write that adds a record or changes its type, every multi-vault snapshot is read again, so the Stakeholders list (the merged
 * list over every held vault) shows the change without a reload. ALL snapshots, not only the written vault's: a vault's typed list also
 * lists the records of the vaults nested in it, so a record made in a nested vault is in its parent's snapshot too. Only the queries on
 * screen refetch; the rest are read again when next shown.
 */
export function refreshMultiVaultLists(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({ queryKey: RECORDS_SNAPSHOT_KEY_HEAD });
}

/**
 * the rows one page of the live list shows: the door's own page without bodies (GilbPlatform `SEARCH_PAGE_SIZE`, 20).
 * The list reads 100 rows a request in full rows and hands them on 20 at a time, so it grows, prefetches and draws (the grid's rows,
 * the graph's nodes) in the very steps it did before; only the requests are fewer.
 */
export const LIST_SLICE_ROWS = 20;

/** The live list's page parameter: the full-row page read at `at`, from its row `skip`. A plain number is `{ at: n, skip: 0 }`. */
type ListPageParam = number | { at: number; skip: number };

/** the full-row pages the live lists read, per list and position, so the slices of one page share its one request. */
const fullPageReads = new Map<string, Promise<RecordsPage>>();

/** The most full-row pages kept for slicing (each holds up to 100 label rows; the documents live in the record reads' cache). */
const FULL_PAGE_READS_KEPT = 64;

/**
 * one slice of the live list: the full-row page at `at` (read once; a slice at `skip` 0 reads it anew, so a refetch of
 * the list reads every page again, in order, as it did before), cut to {@link LIST_SLICE_ROWS} rows from `skip`.
 */
async function listSlice(
  listKey: string,
  param: ListPageParam,
  read: (at: number) => Promise<RecordsPage>,
): Promise<RecordsPage> {
  const { at, skip } = typeof param === "number" ? { at: param, skip: 0 } : param;
  const key = `${listKey}\u0000${at}`;
  let full = skip === 0 ? undefined : fullPageReads.get(key);
  if (!full) {
    full = read(at);
    fullPageReads.delete(key);
    fullPageReads.set(key, full);
    // Bounded: the oldest reads go first (a list asks again from its first slice on a refetch).
    while (fullPageReads.size > FULL_PAGE_READS_KEPT) fullPageReads.delete(fullPageReads.keys().next().value!);
    full.catch(() => fullPageReads.delete(key));
  }
  const page = await full;
  const rows = page.records.slice(skip, skip + LIST_SLICE_ROWS);
  const last = skip + LIST_SLICE_ROWS >= page.records.length;
  const served = page.doorRows ?? page.records.length;
  return {
    ...page,
    records: rows,
    // The door's rows are counted once over the slices: each slice its own rows, the last one also the rows the door sent and the
    // list does not keep (field claims), so `rowsRead` sums to what the door sent.
    doorRows: last ? Math.max(0, served - Math.min(skip, page.records.length)) : rows.length,
    complete: page.complete && last,
    slice: { at, skip, rows: page.records.length, served, nextOffset: page.nextOffset ?? null, chunkComplete: page.complete },
  };
}

/**
 * the full-row options of one page read ({@link hydrateRecordsPage}): the most rows a page carries (`?limit=`, at most
 * {@link RECORD_PAGE_LIMIT}), and who takes the documents the rows carry (the record reads' cache, so a face, a detail pane or a search
 * hit is answered without `GET /lws/r/<id>`).
 */
export interface FullRowsOpts {
  limit: number;
  /** Each record the page carried in full, exactly as `readRecord` would give it (its document and ETag). */
  onBodies?: (records: readonly BaseRecord[]) => void;
    /**
     * On the FIRST page only: the list's two feed positions taken NOW (`since=head`, live and ended, no rows), BEFORE the page is read,
     * for the type names the page asks; null when the platform has no feed or the ask is several unions. The screen's return then
     * reads only what changed since.
     */
  onHead?: (head: { state: RecordSyncState; typeNames: string[] } | null) => void;
}

/**
 * the feed positions of the lists on screen, per list (its query key), taken with the list's first page. A return to the
 * screen asks only what changed since ({@link syncHeldLists}); with no position the list is read again when stale, as before.
 */
interface ListHead {
  vaultId: string;
  typeNames: string[];
  state: RecordSyncState;
  /** When the last sync (or the first page) ended, ms. */
  at: number;
  running: boolean;
}

const listHeads = new Map<string, ListHead>();

/**
 * How long a list stays fresh (main's `staleTime`). Past it the list is read again on return, as before: that read is what drops a
 * record whose grant was taken back ("losing access gives no signal", Developer Guide §10.2) and adds one whose access grew.
 */
export const LIST_FRESH_MS = 15_000;

/** keep (or drop) a list's feed position, by its query key. */
function keepListHead(key: readonly unknown[], vaultId: string, head: { state: RecordSyncState; typeNames: string[] } | null): void {
  const k = hashKey(key);
  if (!head) listHeads.delete(k);
  else listHeads.set(k, { vaultId, typeNames: head.typeNames, state: head.state, at: Date.now(), running: false });
}

/**
 * put the documents a full-row page carried into the record reads' cache (`useRecord`'s key, the record's own door), so
 * the detail pane, a row's face and a search hit take them instead of reading each record. ⛔ Never over an entry kept less than
 * {@link HELD_RECORD_FRESH_MS} ago: that entry may hold a write made in this session, and the list page may have been read before it.
 * An older entry is replaced (the page was read after it).
 *
 * @param qc the query client
 * @param records the records a full-row page carried
 */
export function seedRecordReads(qc: QueryClient, records: readonly BaseRecord[]): void {
  qc.setQueryDefaults(PAGE_DOC_HEAD, { gcTime: Infinity, staleTime: Infinity });
  for (const r of records) {
    // the row's own page document, for its face, whatever its age (`rowDocOf`).
    qc.setQueryData([...PAGE_DOC_HEAD, r.id, vaultOriginOf(r.entityUri ?? null)], r);
    const key = ["base", "record", r.id, vaultOriginOf(r.entityUri ?? null)] as const;
    const st = qc.getQueryState(key);
    if (st?.data !== undefined && Date.now() - st.dataUpdatedAt < HELD_RECORD_FRESH_MS) continue;
    qc.setQueryData(key, r);
  }
}

/** where the last list page that carried a record keeps its document (the query cache: cleared with it on sign-out). */
const PAGE_DOC_HEAD = ["base", "page-doc"] as const;

/**
 * how old a kept record may be and still answer for a read: the app's own freshness for a
 * record read (`useRecord`'s `staleTime`). An older one answers nothing, and the caller reads the record, as main does.
 */
export const HELD_RECORD_FRESH_MS = 15_000;

// ── freshly-created signal ─────────────────────────────────────────────────────────────
// A marker set by +New (RecordGrid) and read by the detail pane when it opens that id. It drives create-flow auto-focus of the name
// field, and pins the row in the list across a page-0 refetch that might briefly omit a just-minted id. Module-scoped, not
// cache or state, because it is a transient UI intent, never vault truth.
//
// Why this is a TIME WINDOW and not a strict one-shot. It used to be read-and-delete: the first component instance to ask got `true`
// and every later one got `false`. That made the create flow depend on the detail pane mounting exactly once, which a React tree does
// not guarantee: a list refetch that briefly drops the row unmounts the pane, and the remount (same record, milliseconds later) then
// found the flag already spent and opened the new record unfocused. It presented as an intermittently failing auto-focus assertion; the
// assertion was right.
//
// Widening it to "was this id created in the last few seconds" makes the behaviour depend on the user-visible fact (this record was
// just minted) rather than on a render-count accident. Re-focusing a brand-new record after an incidental remount is the correct UX
// anyway. Entries are dropped lazily once stale, so the map cannot grow without bound. The window is long enough that a slow list
// refetch after +New cannot drop the row; short enough that ordinary re-opens do not keep auto-focusing forever.
const FRESH_WINDOW_MS = 60_000;

const freshlyCreatedIds = new Map<string, number>();

function sweepFreshlyCreated(): void {
  const now = Date.now();
  for (const [key, at] of freshlyCreatedIds) {
    if (now - at > FRESH_WINDOW_MS) freshlyCreatedIds.delete(key);
  }
}

/** Mark a just-minted record id so its detail auto-focuses the name field on open. */
export function markFreshlyCreated(id: string): void {
  freshlyCreatedIds.set(id, Date.now());
  sweepFreshlyCreated();
}

/** Peek whether `id` is still inside the fresh-create window (does not consume). */
export function isFreshlyCreated(id: string): boolean {
  const at = freshlyCreatedIds.get(id);
  if (at === undefined) return false;
  if (Date.now() - at > FRESH_WINDOW_MS) {
    freshlyCreatedIds.delete(id);
    return false;
  }
  return true;
}

/**
 * True when `id` was minted by +New within the fresh window, so this open is the create flow and not an ordinary open.
 * Idempotent within the window (see the note above); a stale entry is dropped on read.
 */
export function consumeFreshlyCreated(id: string): boolean {
  return isFreshlyCreated(id);
}

/** Explicitly end a record's fresh window, once the create flow is over (the person typed, saved or left), so a later open behaves normally. */
export function clearFreshlyCreated(id: string): void {
  freshlyCreatedIds.delete(id);
}

function newTempId(): string {
  return `temp:${Math.random().toString(36).slice(2)}`;
}

// ── Hydrate a page of the grid FROM THE VAULT ───────────────────────────────────────────
//
// The set comes from `GET /lws/vault/…/records` and the content from `GET /lws/r/:id`. The list is paged (`?offset=`) so a vault of
// about a thousand rows can scroll-load rather than only ever showing page 0. The working-set cache is DERIVED only (reconciled on the
// first page): never the source of membership.
//
// Find is find-by-type of named types. Types come from the catalogue (`GET /base/vocab` via `catalogNodeTypeNames`) or the vault's
// census, then a `?type=<bare>` union. An empty `?type=` is not a find by type. The app-private type enum is not the catalogue. A
// catalogue miss is a miss.
// - The records door slices a `?type=` union silently to 100 names. One 741-name union keeps BasicPlanguage (entity index 40) and drops
//   Person (423). Do not revert to the untyped list. Chunk, so every issued name actually reaches the find.
// - The catalogue of the planes the Nodes type chooser creates (Things | Functions | Values), not entity-only. Relation-plane types stay
//   out. Person stays issued (chunking).
// - Do not `Promise.all` every chunk. The live vocabulary (entity 741, function 11238, value 11) is about 11990 names, so 120 chunks. 120
//   parallel requests fail closed on the first rejection and the graph and grid report that the vault could not be reached. Cap the
//   in-flight requests; one chunk miss must not blank the graph.
// - The catalogue is not the only name list. A just-created Function whose type name is absent from the catalogue, or whose type chunk
//   answers 429, is shown from the optimistic row and `markFreshlyCreated`, then the next hydrate drops it from the seed while its
//   capable-of relation stays, and the relation shows a pendant. So the bare type names already held on the previous rows are united
//   into the find, and those stored ids are opened one by one when their type was not in a successful chunk.
// - That recovery covers the session's previous rows only. After a reload (or when React Query has no previous page) they are empty. The
//   offset-0 prune still forgets the device-store ids not in the find. `listRecordRefs` already has stored ids and type uris from
//   `rememberRecord`. So those stored type names are united into the find too, and those stored ids are opened when the type chunk
//   missed, not because the catalogue omitted them.

/** Live Base LWS records cap. Server slices; the client must not send a larger union. */
const LWS_RECORDS_MAX_TYPES = 100;

/**
 * The most page fetches of the find in flight.
 *
 * THE BOUND STANDS AND IS THE POINT: an unbounded `Promise.all` of about 120 chunks is the named cause of the blank Nodes view, and a
 * storm of about 140 requests a second sustained against one vault took the platform down at its edge the same day. Never unbounded.
 * Never above the guard's ceiling of 32 without re-measuring what is measured below.
 *
 * 6 became 24 on measured ground. The old value rested on a claim about a per-origin connection limit under the previous HTTP
 * revision. That claim is false on production and is not restated here: the platform and its geo vault both answer `http_version=2`,
 * where one connection multiplexes about 100 streams.
 *
 * The number is 24 because of this reading, not because 24 is a round number. Origin-side, on the authenticated records door, from the
 * platform's own request log: 13,986 requests with both ends, bucketed by instantaneous in-flight (the door's own natural experiment,
 * not a synthetic probe):
 *
 *   in-flight   6 ->   6.0 completions/s      in-flight  24 ->  18.5/s
 *   in-flight  12 ->  11.0/s                  in-flight  30 ->  24.5/s
 *   in-flight  18 ->  12.0/s  (n = 127 s)     in-flight 40+ ->  71.0/s (max 93)
 *
 * Throughput rises monotonically to 40+, so there is no ceiling near the old cap, and 6 was the bottleneck. Two hypotheses died here
 * and are recorded so nobody re-runs them: (i) "the door is DB-bound" (the door's own query measured 5.2 ms and flat at parallelism
 * 1/6/10/16/24 on the live store); (ii) "the door is CPU-serial in one Node process, so concurrency cannot help" (falsified by the
 * monotonic rise above).
 *
 * The serving pool is postgres.js's default `max: 10` (read from the installed package; the platform sets no `max`). It is not binding
 * here: at 5.2 ms a query, ten connections serve about 1,900 q/s, orders above anything this cap can ask for.
 *
 * 24, not 32: 32 is the guard's ceiling with no margin, and the in-flight 28-30 buckets rest on 6-8 seconds of observation. 24 sits
 * inside the range with headroom and its own reading. Predicted, not promised: the 163-chunk sweep at about 163/18.5 = 8.8 s, against a
 * measured 11.7-13.1 s per sweep at the old cap. The same model reproduces the old figure (163/6.3 = 26 s against the geo vault's
 * observed 23.4-28.3 s for two sweeps), which is why it is worth stating.
 */
const LWS_RECORDS_MAX_PARALLEL_PAGES = 24;

/**
 * The token grammar the records door accepts, mirrored client-side.
 *
 * The platform refuses a `?type=` token that is not a bare local name with 400 `type_token_unresolved`, and it refuses the WHOLE REQUEST,
 * deliberately, so a bad token can never be silently dropped and answered as "there are none" (its grammar is
 * `/^[A-Za-z0-9_-]{1,64}$/`). That is the right server posture. Its consequence on this side is that one unsendable name takes its
 * (at most 99) chunk-mates down with it.
 *
 * Measured on production from the server's own request log for one session: every vault view issued 120 chunk GETs of which 15 answered
 * 400 (12.5 %), and 1,500 perfectly askable names were never issued as collateral. On the opt-in listing the find moved to, it is 22 of
 * 163 chunks and 2,200 names. Which askable names are lost is decided purely by where the long name lands in a label sort, that is by
 * luck. A fix whose success depends on that is not a fix.
 *
 * So a name the door cannot be asked for is not sent, and its absence is DECLARED beside the result (the honest report of a bound, not a
 * silent drop). This is not a new app-side list of types or planes: it is the door's own wire grammar, mirrored exactly as
 * `LWS_RECORDS_MAX_TYPES` already mirrors the door's cap, and it names nothing.
 *
 * Records of a type whose name is over 64 characters stay unreachable through this door (42 such names are live on the ontology host
 * today). They were unreachable before this too; the change is that they no longer make 99 other types unreachable with them, and that
 * the bound is said out loud instead of arriving as an empty grid.
 */
const DOOR_TYPE_NAME = /^[A-Za-z0-9_-]{1,64}$/;

function chunkNamedTypes(typeNames: readonly string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < typeNames.length; i += size) {
    out.push(typeNames.slice(i, i + size));
  }
  return out;
}

/**
 * Bare type names already held on records this view listed (the previous rows: a prior find or a create). A find of those names is
 * still find-by-type; not an invented path, not an empty `?type=`.
 */
function heldTypeNames(records: readonly GridRecord[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    if (isTempId(r.id) || isUiPrefsRecord(r.facts, r.typeUri)) continue;
    const n = typeLocalName(r.typeUri ?? "").trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * Bare type names this device already stored for the vault (`listRecordRefs` / `rememberRecord`). They survive a reload when the previous
 * rows are empty. A find of those names is still find-by-type; not an empty `?type=`, not an invented row. AppUiPreferences stays out
 * of the grid.
 */
function storedTypeNames(refs: readonly WorkingSetRef[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of refs) {
    if (isTempId(r.id) || isUiPrefsRecord(undefined, r.typeUri)) continue;
    const n = typeLocalName(r.typeUri ?? "").trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * The find of every named type. The platform caps one `?type=` union at 100 names. Chunk and merge so Person (and the rest past the
 * first 100 by label) actually issue. In-flight pages are bounded; the chunks that returned are merged. All chunks failing still throws
 * (the vault really is unreachable). One 429 must not become `nodeSet.error`.
 */
async function listVaultRecordsPageAllNamedTypes(
  vaultId: string,
  typeNames: readonly string[],
  offset: number,
  admitRelationRow?: (typeUri: string) => boolean,
  /** ask each page with the records' bodies (`?include=body`; the Stakeholders view only). Absent: as before. */
  includeBody?: boolean,
    /**
     * Read the page in full rows, `?include=body&limit=<n>`, when the ask is ONE `?type=` union: each row carries the document
     * `GET /lws/r/<id>` serves and its ETag, and the page names where the next starts (`nextOffset`). Over 100 names (several unions, each
     * paged on its own offset) the page is read as before.
     */
  fullRowsLimit?: number,
): Promise<VaultRecordsPage & { successfulTypeNames: string[]; askBounded: boolean }> {
  // a token the door refuses is not sent, and the refusal bound is declared.
  const askable = typeNames.filter((n) => DOOR_TYPE_NAME.test(n));
  const unaskable = typeNames.filter((n) => !DOOR_TYPE_NAME.test(n));
  if (unaskable.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[base] F-LIVE ${vaultId}: ${unaskable.length} of ${typeNames.length} named type(s) cannot be ` +
        `asked for on ?type= — the door takes a bare local name matching ` +
        `/^[A-Za-z0-9_-]{1,64}$/ and refuses the WHOLE request otherwise. Records of these ` +
        `types are NOT listed and their absence is NOT an empty vault:`,
      unaskable,
    );
  }
  if (askable.length === 0) {
    throw new Error(
      `F-LIVE of named types issued no page: all ${typeNames.length} named type(s) are ` +
        `unaskable on the records door (bare local name, /^[A-Za-z0-9_-]{1,64}$/)`,
    );
  }
  const chunks = chunkNamedTypes(askable, LWS_RECORDS_MAX_TYPES);
  // full rows only for one union (a single offset); `nextOffset` is then this page's own.
  const fullRows = fullRowsLimit !== undefined && fullRowsLimit > 0 && chunks.length === 1 ? Math.min(fullRowsLimit, RECORD_PAGE_LIMIT) : 0;
  const settled = await mapWithConcurrency(chunks, LWS_RECORDS_MAX_PARALLEL_PAGES, async (chunk) => {
    try {
      // with bodies only when asked (the Stakeholders view); every other caller's request is the same as before.
      // or in full rows of `fullRows` (one union only).
      const page = fullRows > 0
        ? await listVaultRecordsPage(vaultId, chunk, offset, { ...(admitRelationRow ? { admitRelationRow } : {}), includeBody: true, limit: fullRows })
        : includeBody
        ? await listVaultRecordsPage(vaultId, chunk, offset, { ...(admitRelationRow ? { admitRelationRow } : {}), includeBody: true })
        : admitRelationRow
          ? await listVaultRecordsPage(vaultId, chunk, offset, { admitRelationRow })
          : await listVaultRecordsPage(vaultId, chunk, offset);
      // the links of every page that carries bodies (the Stakeholders grid reads its pages this way with one vault too;
      // the links are read only under the stakeholder view, `RecordGrid`).
      if (includeBody || fullRows > 0) notePageLinks(page.records);
      return { ok: true as const, page, chunk };
    } catch (err) {
      return { ok: false as const, err, chunk };
    }
  });
  const pages = settled.filter((s) => s.ok).map((s) => s.page);
  const failed = settled.filter((s) => !s.ok);
  const successfulTypeNames = settled.filter((s) => s.ok).flatMap((s) => s.chunk);
  if (pages.length === 0) {
    const first = failed[0];
    throw first && !first.ok ? first.err : new Error("F-LIVE of named types issued no page");
  }
  if (failed.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[base] F-LIVE All-types: ${failed.length} of ${chunks.length} type-chunks failed; showing ${pages.length} that returned. Vault remains source of truth.`,
    );
  }
  const seen = new Set<string>();
  const records: VaultRecordRef[] = [];
  for (const page of pages) {
    for (const row of page.records) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      records.push(row);
    }
  }
  const typeByUri = new Map<string, number>();
  for (const page of pages) {
    for (const t of page.types ?? []) {
      typeByUri.set(t.typeUri, (typeByUri.get(t.typeUri) ?? 0) + t.count);
    }
  }
  return {
    records,
    total: pages.reduce((sum, page) => sum + page.total, 0),
        // A dropped chunk means some named types were not listed: not "all shown".
        // The UNASKABLE names are not folded in here, and that is the whole point. They are a STANDING property of the catalogue (56 names
        // exceed the door's 64-character bound on every read, forever), so folding them into `complete` made it permanently false, which
        // pinned `hasNextPage` true, which re-armed the auto-prefetch on every vault (measured on production: 652 chunk GETs to render a
        // 4-node vault). `complete` answers "is there another page?"; `askBounded` answers "did something we asked for fail to come back?".
    complete: failed.length === 0 && pages.every((page) => page.complete),
    askBounded: failed.length > 0,
    pageSize: pages[0]?.pageSize ?? 20,
    offset,
    // the rows the door SENT (before the register filter), summed over the chunks (disjoint types).
    served: pages.reduce((sum, page) => sum + (page.served ?? page.records.length), 0),
    types:
      typeByUri.size > 0
        ? [...typeByUri.entries()].map(([typeUri, count]) => ({ typeUri, count }))
        : pages[0]?.types,
    successfulTypeNames,
    // where the next full-row page starts (only for one union read in full rows).
    ...(fullRows > 0 && pages.length === 1 ? { nextOffset: pages[0]!.nextOffset ?? null } : {}),
  };
}

// ── census, then scoped find ───────────────────────────────────────────────────────────
//
// The all-types sweep asked the CATALOGUE which types exist (about 11,990 names) and ran the find for every one of them: 120 `?type=`
// chunks and 120 preflights per vault view. The view's question was never "which types exist?"; it was "which types does THIS VAULT
// hold, for me?", and only the vault can answer that. Naming the types you ask for is satisfied by naming the types the vault holds,
// under four conditions:
//   1. the find's wire form is UNCHANGED: `listVaultRecordsPageAllNamedTypes` below still issues bare names on `?type=`, chunked at
//      100, never empty;
//   2. the census is a ROW-LESS act on its OWN door, `listVaultHeldTypes`: not the untyped list, and not the `types[]` facet off a
//      records page (that facet is read only as the FALLBACK's grid census, never as a name source);
//   3. what a held name IS comes from DEREFERENCING its term (`heldTypePlanes`), never from a new app-side list; an uncatalogued name
//      (the `WritingPlanguage` case) is STILL issued and lists under its own type name, un-anchored;
//   4. per viewer: the door groups the AUTHORIZED read; the find names only what the viewer was shown.
// The two second-hand vault-held legs, `heldTypeNames` and `storedTypeNames`, stay in the union as the offline and partial-chunk
// fallbacks.
//
// Capability probe and fallback: the census GET itself is the probe. A platform that predates the door answers 404, `listVaultHeldTypes`
// returns null, and this function takes the catalogue sweep unchanged. Never a HEAD. Never a body-shape probe. So the client may land
// ahead of the server without ever showing a grid narrower than before.
//
// ── a choice of types narrows the ask ────────────────────────────────────────────────────
// With `chosenTypes` given, `?type=` names the chosen types the vault's census holds, and nothing else. So the 100-densest cap below
// no longer decides whether a rare chosen type is asked for. A chosen relation kind is asked for too, including one the census lists
// only under `excludedTypes` (the measured reason is at `issueChosenCensusNames` in the census unit).
// - `chosenTypes` are compared through `typeFacetKey`, the key the grid's own type filter compares with. A row this read leaves out is
//   one that filter drops.
// - The type facet the page returns is still the whole census. The choice narrows the rows asked for, not the choices offered.
// - With no `chosenTypes` this function does what it did before.
// - A row of a chosen relation kind addressed `/base/r/` is kept by the records client only through `admitRelationRow`; without it the
//   client drops that row. The client's relation test reads `/base/r/` only, so for a row addressed `/vault/r/` the rule decides
//   nothing: the relation-address arm keeps it either way, and the type-name arms still drop a kind on the non-record name list (a
//   `PartOf` link, for example). That gap predates this step.
// - The listing below does not write a row of a chosen relation kind to the device store, on either address form: a stored type name
//   joins every later ask, and a view with no choice must not be widened by a relation kind. `issuedRelationTypeNames` carries those
//   names from page 0 to later pages, as `issuedTypeNames` carries the names asked for. The recovery that opens stored ids one by one
//   (further down) stores what it recovers without this check. It cannot recover a relation today, because `GET /lws/r/<id>` answers
//   404 for one; whoever makes a relation readable there owes the check and its test.
// - The catalogue fallback (a platform with no census door) is not narrowed.
// - No hook passes `chosenTypes` yet. That wiring is its own step.
export async function hydrateRecordsPage(
  vaultId: string,
  offset: number,
  prevFlat: readonly GridRecord[] = [],
  issuedTypeNames: readonly string[] = [],
  lifecycle: "live" | "ended" = "live",
  chosenTypes: readonly string[] = [],
  issuedRelationTypeNames: readonly string[] = [],
  /** the pages with the records' bodies (the Stakeholders view); their links are kept (`pageLinks.ts`). */
  includeBody = false,
  /** read the live page in full rows (one `?type=` union only); absent: as before. */
  fullRows?: FullRowsOpts,
): Promise<RecordsPage> {
  if (lifecycle === "ended") {
    const page = await listVaultRecordsPage(vaultId, [], offset, { lifecycle: "ended" });
    const records: GridRecord[] = page.records.map((ref) => {
      const facts: Record<string, string> = {};
      if (ref.label) facts.label = ref.label;
      return {
        id: ref.id,
        entityUri: ref.entityUri,
        typeUri: ref.typeUri,
        facts,
        opaqueFacts: [],
        etag: null,
        hydrated: false,
        updatedAt: ref.updatedAt,
        ...(ref.endingActorKind ? { endingActorKind: ref.endingActorKind } : {}),
      };
    });
    return {
      records,
      total: page.total,
      complete: page.complete,
      pageSize: page.pageSize,
      offset: page.offset,
      types: page.types,
      issuedTypeNames: [],
    };
  }
  // the choice, in the key the grid's own type filter compares with.
  const chosenKeys = new Set(chosenTypes.map((t) => typeFacetKey(t)));
  const narrowed = chosenKeys.size > 0;
  const isChosen = (typeUri: string | null | undefined): boolean =>
    !!typeUri && chosenKeys.has(typeFacetKey(typeUri));
  const storedRefs = await listRecordRefs(vaultId).catch(() => []);
  // With a choice, the two device-side legs  name only chosen types, so a type this
  // device happens to remember does not widen the ask again.
  const heldNames = heldTypeNames(narrowed ? prevFlat.filter((r) => isChosen(r.typeUri)) : prevFlat);
  const cachedNames = storedTypeNames(narrowed ? storedRefs.filter((r) => isChosen(r.typeUri)) : storedRefs);
  // The issued names that are relation kinds: read on page 0, handed back on later pages.
  let relationNames: string[] = narrowed ? [...issuedRelationTypeNames] : [];
  let censusNames: string[] = [];
  let catalogNames: string[] = [];
  let census: Awaited<ReturnType<typeof listVaultHeldTypes>> = null;
  // Next pages reuse the names page 0 already F-LIVE'd. Re-running census + heldTypePlanes
  // + F-CAT on every "next 20" is why geo scroll was useless.
  if (offset > 0 && issuedTypeNames.length > 0) {
    censusNames = [...issuedTypeNames];
  } else {
  // F-HELD first — one row-less call. `null` ⇒ the door is absent on this Base (404).
  census = await listVaultHeldTypes(vaultId);
  if (census && narrowed) {
    // the chosen types this vault's census holds, and no cap: every one is asked
    // for (`listVaultRecordsPageAllNamedTypes` chunks a union past 100 names). The plane read
    // stays here, in the caller, where the per-view request log below counts it.
    const candidates = chosenCensusCandidates(census, isChosen);
    const reading = await heldTypePlanes([...candidates.held, ...candidates.excluded]);
    const { issued, notIssued, relation } = issueChosenCensusNames(candidates, reading);
    censusNames = issued;
    relationNames = relation;
    // eslint-disable-next-line no-console
    console.info(
      `[base] F-HELD ${vaultId}: census=1 (${census.types.length} held type(s), ${census.totalItemsKind}` +
        `, ${census.excludedTypes.length} excluded in the door) → chosen=${chosenKeys.size}` +
        ` → held-and-chosen=${candidates.held.length}, excluded-and-chosen=${candidates.excluded.length}` +
        ` → issued=${issued.length} on ?type=${issued.length ? ` {${issued.join(" ")}}` : ""}` +
        `, not-issued=${notIssued.length}${notIssued.length ? ` {${notIssued.join(" ")}}` : ""}` +
        `; /base/t/ termLookups=${reading.dereferences} (upper bound — cache hits counted) parentWalks=${reading.parentWalks} /base/vocab?type= batched=${reading.batched}`,
    );
  } else if (census) {
        // The store's own spellings (up to three) merge by BARE local name; the plane of each is reached by dereference. Relation and
        // attribute planes are not issued; uncatalogued names ARE issued (un-anchored by name).
        // The derivation lives in `censusBareNames` + `classifyCensusNames` so any census consumer takes the identical answer. It used to
        // live here and only here, which is how the grid came to ask the VAULT which types it holds while search asked the global
        // CATALOGUE which types exist. Behaviour is unchanged. The pair is kept PURE: an earlier draft fetched the planes inside them, which
        // hid the `heldTypePlanes` call from the per-view request-count instrument.
    const bare = censusBareNames(census.types);
        // The census is already ordered by count, descending. A live ontology vault holds 6101 type uris; classifying every name is 6101
        // `GET /base/t/<bare>` (the batched vocabulary pin is off) and the find is 61 type chunks. Issue at most one `?type=` union (at most
        // 100 names): the densest types, which is the recency page. The remaining types stay on the census facet and on untyped text search.
    const toClassify =
      bare.length > LWS_RECORDS_MAX_TYPES ? bare.slice(0, LWS_RECORDS_MAX_TYPES) : bare;
    const reading = await heldTypePlanes(toClassify);
    const { issued, notIssued, uncatalogued } = classifyCensusNames(toClassify, reading);
    censusNames = issued;
        // The app-side per-view request log. The platform's request instrument counts only `/lws/vault/*/records|types`; a sweep moved onto
        // `/base/t/*` or `/base/vocab?type=` would be invisible to it, so those counts are printed HERE, beside the find count.
        // `termLookups` counts lookups through the fetcher: an UPPER bound on `/base/t/` requests, because a `termDocCache` hit is counted
        // too (the fetcher cannot say); the platform's request log is the instrument for requests actually issued.
    console.info(
      `[base] F-HELD ${vaultId}: census=1 (${census.types.length} held type(s), ${census.totalItemsKind}` +
        `, ${census.excludedTypes.length} excluded in the door) → classified=${toClassify.length}` +
        `${bare.length > toClassify.length ? ` of ${bare.length} (first ${LWS_RECORDS_MAX_TYPES} by count)` : ""}` +
        ` → issued=${censusNames.length} on ?type=` +
        `, not-issued(relation/attribute)=${notIssued.length}${notIssued.length ? ` {${notIssued.join(" ")}}` : ""}` +
        `, uncatalogued-issued=${uncatalogued.length}${uncatalogued.length ? ` {${uncatalogued.join(" ")}}` : ""}` +
        `; /base/t/ termLookups=${reading.dereferences} (upper bound — cache hits counted) parentWalks=${reading.parentWalks} /base/vocab?type= batched=${reading.batched}`,
    );
  } else {
        // FALLBACK: the catalogue sweep, unchanged, until the platform this app talks to serves the census door. Stated in the log so a
        // 120-chunk view on a served platform is never mistaken for the census path.
    catalogNames = await catalogNodeTypeNames();
    // eslint-disable-next-line no-console
    console.info(
      `[base] F-HELD ${vaultId}: census door absent (404) — fallback to the shipped F-CAT sweep ` +
        `(${catalogNames.length} catalog names) until Base serves GET /lws/vault/:vaultId/types`,
    );
  }
  }
  const typeNames = [...new Set([...censusNames, ...catalogNames, ...heldNames, ...cachedNames])];
  if (typeNames.length === 0) {
    if (census) {
            // The vault holds no grid type this viewer may read, and nothing is held or stored on this device: not the untyped list. Empty is
            // complete, and it is a VAULT answer, not a miss. With a choice of types this is the SKIP: a vault whose census holds none of the
            // chosen types ends here, after its one census call, with no find. A chosen kind the census reports only under `excludedTypes` is
            // a candidate (`chosenCensusCandidates`), so a vault of role records does not end here. A chosen type this device remembers for
            // the vault is still asked for.
      return {
        records: [],
        total: 0,
        complete: true,
        pageSize: 20,
        offset,
        types: census.types,
        issuedTypeNames: typeNames,
        scannedVaults: census.scannedVaults,
      };
    }
        // A catalogue miss, no held type from a prior find or create, and no stored type on this device: not the untyped list, not the
        // app-private type enum. Empty is complete.
        //
        // `askBounded` IS TRUE HERE, and its absence was a defect against this module's own written contract. `bounded` is defined below as
        // "false when a `?type=` chunk failed or a named type could not be asked for at all". A catalogue miss is the limit case of that
        // second clause: not one named type could be asked for, because the catalogue named none. The app therefore knows it did not ask the
        // vault anything, and an empty list it never asked for is NOT a fact about the vault.
        //
        // Returning this branch unbounded sent the empty state to its fourth state, and only the fourth may say "No records yet". That is
        // precisely the symptom seen on production over a vault holding 51,228 rows: nothing failed, every request answered 200, and the app
        // reported its own silence as the vault's emptiness. The earlier repair added `bounded` and wired it from the find page, but this
        // early return never reached that wiring, so the one branch that means "I asked nothing" was the one branch still claiming a whole
        // answer.
        //
        // The sibling `census` return above stays unbounded on purpose: it is a genuine vault answer ("the vault holds no grid type this
        // viewer may read"), not a miss.
    console.warn(
      `[base] F-CAT of node types (Things/Functions/Values) for ${vaultId} returned none — F-LIVE not issued. ` +
        `Empty grid is a catalog miss, not a typed empty vault.`,
    );
    return { records: [], total: 0, complete: true, pageSize: 20, offset, askBounded: true, issuedTypeNames: typeNames };
  }
  if (census) {
    // eslint-disable-next-line no-console
    console.info(
      `[base] F-HELD ${vaultId}: finds=${Math.ceil(typeNames.length / LWS_RECORDS_MAX_TYPES)} ` +
        `(${typeNames.length} named type(s) at ≤ ${LWS_RECORDS_MAX_TYPES} per ?type= union)`,
    );
  }
  // the first page of a full-row list takes the list's feed positions FIRST (no rows), so a change made while
  // the page is read is seen by the next sync. One union only (a position belongs to the names it was asked with).
  if (offset === 0 && lifecycle === "live" && fullRows?.onHead) {
    const askable = typeNames.filter((n) => DOOR_TYPE_NAME.test(n));
    const one = askable.length > 0 && askable.length <= LWS_RECORDS_MAX_TYPES;
    const state = one
      ? await headRecordState({ origin: vaultOriginOf(vaultId), fetch: lwsReadFetch }, vaultId, askable).catch(() => null)
      : null;
    fullRows.onHead(state ? { state, typeNames: askable } : null);
  }
  const page = await listVaultRecordsPageAllNamedTypes(vaultId, typeNames, offset, narrowed ? isChosen : undefined, includeBody || undefined, fullRows?.limit);
  const successfulTypes = new Set(page.successfulTypeNames);
  const relationNameSet = new Set(relationNames);

  // Forget cached ids ONLY when this page IS the whole authorized set. Page 0 of a
  // 51 k-entity vault is 20 rows — treating that as membership and forgetting the rest
  // was a paging bug, and F-OPEN of the forgotten ids is how geo loaded 1–2 MB
  // MULTIPOLYGONs to paint a label.
  if (offset === 0 && page.complete) {
    const listedIds = new Set(page.records.map((r) => r.id));
    await Promise.all(
      storedRefs
        .filter((c) => {
          if (listedIds.has(c.id) || isFreshlyCreated(c.id) || isTempId(c.id)) return false;
          // a narrowed page is the whole set of the CHOSEN types only. A ref of
          // any other type (or of no known type) was not asked about, so it is kept.
          if (narrowed && !isChosen(c.typeUri)) return false;
          const cachedType = typeLocalName(c.typeUri ?? "");
          if (cachedType && !successfulTypes.has(cachedType)) return false;
          const held = prevFlat.find((r) => r.id === c.id);
          if (held && !successfulTypes.has(typeLocalName(held.typeUri ?? ""))) return false;
          return true;
        })
        .map((c) => forgetRecord(c.id)),
    );
  }

  // Grid paints from the LIST label when the door sent one (geo). Rows with no
  // label still F-OPEN — that is the just-minted Untitled / test harness path.
  // ⛔ Never F-OPEN a labelled geo MULTIPOLYGON to draw a name.
  const notCarried: { id: string; door: string; why: string }[] = [];
  // the records the full-row page carried, as `readRecord` gives them (handed to `fullRows.onBodies`).
  const carried: BaseRecord[] = [];
  for (const ref of page.records) if (ref.body) carried.push(recordFromServed(ref.id, ref.body, ref.etag ?? null));
  const carriedById = new Map(carried.map((r) => [r.id, r]));
  const settled = await Promise.all(
    page.records.map(async (ref: VaultRecordRef) => {
      const label = ref.label?.trim() ?? "";
      // a row of a chosen relation kind stays out of the device store (see above).
      if (!relationNameSet.has(typeLocalName(ref.typeUri ?? ""))) {
        await rememberRecord({ id: ref.id, vaultId, typeUri: ref.typeUri, updatedAt: ref.updatedAt });
      }
      if (label) {
        return {
          id: ref.id,
          entityUri: ref.entityUri,
          typeUri: ref.typeUri,
          facts: { label },
          opaqueFacts: [],
          etag: null,
          hydrated: false,
          updatedAt: ref.updatedAt,
        } satisfies GridRecord;
      }
      const stub = (why: string): GridRecord => {
        notCarried.push({ id: ref.id, door: ref.entityUri, why });
        return {
          id: ref.id,
          entityUri: ref.entityUri,
          typeUri: ref.typeUri,
          facts: {},
          opaqueFacts: [],
          etag: null,
          hydrated: false,
          updatedAt: ref.updatedAt,
        };
      };
      try {
        // a row read in full rows carries the very document this read would get: no read of its own.
        const record = carriedById.get(ref.id) ?? (await readRecord(ref.id, ref.entityUri));
        if (!record) return stub("404 — absent, unreadable or deleted at that door");
        return {
          ...withTypeUri(record, ref.typeUri),
          entityUri: record.entityUri ?? ref.entityUri,
          hydrated: true,
          updatedAt: ref.updatedAt,
        };
      } catch (e) {
        return stub(e instanceof Error ? e.message : String(e));
      }
    }),
  );
  if (notCarried.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[base] ${notCarried.length} of ${page.records.length} listed record(s) in ${vaultId} were ` +
        `NOT carried — membership known, CONTENT NOT READ.`,
      notCarried,
    );
  }

  if (carried.length > 0) fullRows?.onBodies?.(carried);

  // Hide AppUiPreferences instances (theme on vault) — presentation state, not content nodes.
  let records = settled.filter((r) => !isUiPrefsRecord(r.facts, r.typeUri));

  // Page 0: re-pin optimistic/temp + freshly-created rows the server page has not listed
  // yet (create→list race, or empty-fact entities briefly absent from the join). Never
  // silently drop a note the user just minted. A list row with no label must not
  // overwrite the optimistic Untitled the user is looking at.
  if (offset === 0 && prevFlat.length > 0) {
    const prevById = new Map(prevFlat.map((r) => [r.id, r]));
    records = records.map((r) => {
      if (!isFreshlyCreated(r.id) && !isTempId(r.id)) return r;
      const prev = prevById.get(r.id);
      if (!prev) return r;
      if (Object.keys(r.facts).length > 0) return r;
      return { ...withTypeUri(prev, r.typeUri || prev.typeUri), id: r.id, entityUri: r.entityUri ?? prev.entityUri, updatedAt: r.updatedAt };
    });
    const listed = new Set(records.map((r) => r.id));
    const pinned = prevFlat.filter(
      (r) =>
        !listed.has(r.id) &&
        (isTempId(r.id) || isFreshlyCreated(r.id)) &&
        !isUiPrefsRecord(r.facts, r.typeUri),
    );
    if (pinned.length > 0) {
      records = [...pinned, ...records];
    }
  }

  // F-OPEN only stored ids whose TYPE-CHUNK failed. ⛔ Not the listed page
  // (that is the geo 30 s: 20 × 1–2 MB MULTIPOLYGON). A 429 on WritingPlanguage still
  // recovers the one cached Function; a successful Person chunk does not F-OPEN 51 k
  // geo rows.
  if (offset === 0) {
    const listed = new Set(records.map((r) => r.id));
    type Openable = {
      id: string;
      typeUri?: string | null;
      entityUri?: string | null;
      updatedAt: number;
      facts?: Record<string, string>;
    };
    const toOpen: Openable[] = [];
    const seenOpen = new Set<string>();
    const consider = (r: Openable) => {
      if (seenOpen.has(r.id) || listed.has(r.id) || isTempId(r.id)) return;
      if (isUiPrefsRecord(r.facts, r.typeUri)) return;
      // a type that was not chosen was not asked for, so its absence from
      // `successfulTypes` is not a failed chunk. ⛔ Not opened one by one.
      if (narrowed && !isChosen(r.typeUri)) return;
      if (successfulTypes.has(typeLocalName(r.typeUri ?? ""))) return;
      seenOpen.add(r.id);
      toOpen.push(r);
    };
    for (const r of prevFlat) consider(r);
    for (const c of storedRefs) {
      consider({
        id: c.id,
        typeUri: c.typeUri,
        entityUri: null,
        updatedAt: c.updatedAt,
      });
    }
    if (toOpen.length > 0) {
      const recovered: GridRecord[] = [];
      for (const held of toOpen) {
        try {
          const rec = await readRecord(held.id, held.entityUri ?? null);
          if (!rec) continue;
          // GET of an ended node is 200. Live F-OPEN must not recover it.
          if (rec.facts.entityLifecycleState === "ended") {
            await forgetRecord(held.id);
            continue;
          }
          await rememberRecord({
            id: held.id,
            vaultId,
            typeUri: rec.typeUri || held.typeUri || "",
            updatedAt: held.updatedAt,
          });
          recovered.push({
            ...rec,
            entityUri: rec.entityUri ?? held.entityUri ?? undefined,
            typeUri: rec.typeUri || held.typeUri || "",
            hydrated: true,
            updatedAt: held.updatedAt,
          });
        } catch {
          // F-OPEN miss — keep the honest absence.
        }
      }
      if (recovered.length > 0) records = [...recovered, ...records];
    }
  }

  return {
    records,
    total: Math.max(page.total, records.length),
    complete: page.complete,
    pageSize: page.pageSize,
    offset: page.offset,
    // The grid's TYPE facet: F-HELD's per-viewer census when the door is served; the
    // records-page facet only on the fallback path (there it is a page-derived approximation
    // and stays what it was — §5 forbids reading it as a NAME source, which nothing
    // here does).
    types: census ? census.types : page.types,
    askBounded: page.askBounded === true,
    issuedTypeNames: typeNames,
    ...(relationNames.length > 0 ? { issuedRelationTypeNames: relationNames } : {}),
    ...(census ? { scannedVaults: census.scannedVaults } : {}),
    // the door's own count, as this field's note says (it was the register-filtered count, so a page
    // of 20 field claims said 0 and the read could not advance past it).
    doorRows: page.served ?? page.records.length,
    ...(page.nextOffset !== undefined ? { nextOffset: page.nextOffset } : {}),
  };
}

/**
 * The records query for the SELECTED vault — infinite pages from the vault, hydrated.
 *
 * `data` is the flattened list (compatible with the prior single-page shape). Extra fields
 * drive the scroll sentinel: `fetchNextPage`, `hasNextPage`, `isFetchingNextPage`, `total`.
 *
 * `podId` is the vault NAMESPACE; absent → the query is disabled, never defaulted.
 */
/** The list's own prefetch stops once this many rows are KEPT (one extra page so the first scroll is warm). */
export const RECORDS_PREFETCH_KEPT_CAP = 40;

/** ...or once the door has sent this many rows, kept or not (a vault whose newest rows are all field
 *  claims keeps none). The grid reads on past this only when the person asks ("Read further"). */
export const RECORDS_PREFETCH_ROWS_CAP = 200;

export function useRecords(vaultId: string | undefined | null, lifecycle: "live" | "ended" = "live") {
  const qc = useQueryClient();
  const q = useInfiniteQuery<RecordsPage, Error>({
    queryKey: recordsKey(vaultId ?? "none", lifecycle),
    queryFn: ({ pageParam }) => {
      const read = (at: number) => {
        const prev = qc.getQueryData<InfiniteData<RecordsPage>>(recordsKey(vaultId!, lifecycle));
        const prevFlat = flattenRecordPages(prev);
        const issued = prev?.pages[0]?.issuedTypeNames ?? [];
        return hydrateRecordsPage(vaultId!, at, prevFlat, issued, lifecycle);
      };
      if (lifecycle !== "live") return read(typeof pageParam === "number" ? pageParam : (pageParam as { at: number }).at);
      // the live list reads full rows of 100 (the documents go to the record reads' cache) and shows them 20 at a time.
      return listSlice(hashKey(recordsKey(vaultId!, lifecycle)), pageParam as ListPageParam, (at) => {
        const prev = qc.getQueryData<InfiniteData<RecordsPage>>(recordsKey(vaultId!, lifecycle));
        return hydrateRecordsPage(
          vaultId!,
          at,
          flattenRecordPages(prev),
          prev?.pages[0]?.issuedTypeNames ?? [],
          lifecycle,
          [],
          [],
          false,
          {
            // (the first screen never costs more bytes than main): the first page carries the
            // rows the first screen draws and prefetches (40), each later page 100.
            limit: at === 0 ? RECORDS_PREFETCH_KEPT_CAP : RECORD_PAGE_LIMIT,
            onBodies: (rs) => seedRecordReads(qc, rs),
            onHead: (head) => keepListHead(recordsKey(vaultId!, lifecycle), vaultId!, head),
          },
        );
      });
    },
    initialPageParam: 0 as ListPageParam,
    getNextPageParam: (last): ListPageParam | undefined => {
      // a slice of a full-row page — the next slice of the same page, else the page the door names next (`nextOffset`,
      // ⛔ never offset + rows). No position, or one that does not move forward, ends the read.
      if (last.slice) {
        const { at, skip, rows, served, nextOffset, chunkComplete } = last.slice;
        if (skip + LIST_SLICE_ROWS < rows) return { at, skip: skip + LIST_SLICE_ROWS };
        if (chunkComplete) return undefined;
        if (nextOffset !== null) return nextOffset > at ? { at: nextOffset, skip: 0 } : undefined;
        // A page that names no next position (a platform without full rows serves its own 20-row page and no `nextOffset`): as
        // before, by the rows the door sent; a page that sent none ends the read.
        return served > 0 ? { at: at + served, skip: 0 } : undefined;
      }
      if (last.complete) return undefined;
            // A page that returned no rows cannot advance the cursor. `last.offset + 0` is the SAME pageParam, and React Query only stops on
            // `null`/`undefined` (`0` is neither), so it would re-run `queryFn` with the identical param and append another page, forever.
            //
            // This is not hypothetical and not a tidy-up. `complete` is false whenever ONE of the 120 vocabulary chunks failed
            // (`listVaultRecordsPageAllNamedTypes`: `failed.length === 0 && ...`), and 120 requests at 6-way concurrency against one vault make
            // that near-certain under load. The failure then pins `complete` false, which keeps `hasNextPage` true, which re-arms the
            // auto-prefetch effect below, which fires another 120-request sweep: the storm manufactures the very failure that sustains it.
            // Measured on production: about 140 requests a second sustained against one vault, 343k edge-worker invocations in a day against a
            // 100k a day limit, which took the platform down at its edge.
            //
            // The `complete` flag itself is deliberately left alone: it is a DISCLOSURE ("some named types were not listed"), not a paging
            // verdict, and conflating the two is what caused this. Paging stops here; the partial-result disclosure survives.
            // Paging goes by the rows the DOOR sent, not the rows kept. A page whose 20 rows are all field claims keeps none (the register filter
            // drops them), and "kept none" is not "the end": the vault's newest records were claims, and the people the view lists lie further
            // on (a vault holding 5 people read "No records yet"). A page the door sent NOTHING for still ends the read, as before.
      const sent = last.doorRows ?? last.records.length;
      if (sent === 0) return undefined;
      return last.offset + sent;
    },
    enabled: !!vaultId,
    staleTime: LIST_FRESH_MS,
  });

  const data = useMemo(() => flattenRecordPages(q.data), [q.data]);
  const total = q.data?.pages[0]?.total ?? data.length;

    // Prefetch more *list pages* so scroll is instant. Cheap only because labelled rows skip the one-by-one open (a geo MULTIPOLYGON). One
    // extra list page so the first scroll is warm (100 rows at 10 s a SQL page is why next-20 looked dead). The prefetch below counts KEPT
    // rows, and a vault whose newest records are all field claims keeps none, so it needs a bound of its own on the rows the DOOR has sent
    // so far (kept or not): ten pages, then the grid says so and reads further only when asked (`RecordGrid`, "Read further").
  const rowsRead = useMemo(
    () => (q.data?.pages ?? []).reduce((sum, pg) => sum + (pg.doorRows ?? pg.records.length), 0),
    [q.data],
  );
  useEffect(() => {
    if (!q.hasNextPage || q.isFetchingNextPage) return;
    if (data.length >= RECORDS_PREFETCH_KEPT_CAP) return;
    if (rowsRead >= RECORDS_PREFETCH_ROWS_CAP) return;
    void q.fetchNextPage();
  }, [q.hasNextPage, q.isFetchingNextPage, q.fetchNextPage, data.length, rowsRead]);

  return {
    ...q,
    data,
    total,
    /** rows the door has sent over every page read (kept or not). */
    rowsRead,
    typeCensus: q.data?.pages[0]?.types ?? [],
        /**
         * Was the vault's answer whole? False when a `?type=` chunk failed or a named type could not be asked for at all, i.e. when the app
         * knows it did NOT ask the vault everything. An empty list under `bounded` is not "No records yet": that sentence is a claim about
         * the VAULT, and only an unbounded answer licenses it. This is the surfaced half of the `complete` disclosure that until now reached
         * the console and nothing else, which is how a vault holding 51,228 rows told a person it was empty.
         */
    bounded: q.data?.pages.some((p) => p.askBounded === true) ?? false,
  };
}

/**
 * The vault's OWN framed `@id` for a record that was JUST created into `vaultId`.
 *
 * Why a create must ask, and may not compose. The create ack carries an id, never an address: `POST /lws/vault/:vaultId/c` answers
 * `Location: https://<OWNER_HOST>/lws/r/<id>` with a body `{"@id": <that same lws URI>}`, and `createRecord` correctly reduces it to the id
 * tail. So the moment a create returns, the app knows a record exists and does NOT know where it lives.
 *
 * That gap was invisible because the canonical row written into the list cache simply had no `entityUri`, and `entityUri` is optional.
 * Its consequences are not optional:
 *   - the graph's `entityUriById` has no entry for the new record, so the graph assembly reads its relations with `readRelations(id, null)`,
 *     `vaultOriginOf(null)` is the platform's own origin, an id is resolved at the host the request NAMED and at no other, so the platform
 *     correctly answers 404, `readRelations` maps 404 to `[]`, the new record reports no relation, and the graph draws the honest pendant;
 *   - a drag-to-link onto that node falls through to the composed `<vaultNamespace>/e/<id>` frame, the wrong-host corruption.
 *
 * It does NOT compose `<vaultId>/e/<id>`. That composition is exactly the corruption above. The vault is used to address the request; the
 * URI returned is the vault's own framed `@id`, verbatim, or nothing.
 *
 * Non-fatal by contract: a failed read returns `undefined`, the row lands exactly as it did before, and the create still succeeds. An
 * address lookup may never fail a write.
 *
 * @param id the id the create ack minted
 * @param vaultId the vault NAMESPACE the record was created into, the door to ask
 * @returns the vault's own framed entity URI, or `undefined` when the vault did not give one
 */
async function createdEntityUri(id: string, vaultId: string): Promise<string | undefined> {
  const fresh = await readRecord(id, vaultId).catch(() => null);
  return fresh?.entityUri;
}

/** Create a record of `type` with the given facts — optimistic insert, background POST,
 * canonical swap on success. The mutation resolves with the minted id AND the vault's own
 * framed `@id` for it, so the caller can select, open AND LINK it. */
/**
 * @param vaultId the vault NAMESPACE the grid is VIEWING. It is BOTH the cache scope the optimistic row lands in AND the CREATE TARGET: the
 *              create POSTs to `/lws/vault/<vaultId>/c`, so the record lands in the vault on screen, not the sign-in vault. The two ids that
 *              used to be threaded separately (read scope and sign-in container) are now the SAME vault, which is the whole point: the cache
 *              key and the write target can no longer name two vaults. The shell's write guard only offers this on a vault the principal
 *              holds write on.
 */
/**
 * The facts a create writes. A create that names a party, or a type that may be one, writes the name under its one home only (`nameOnly`,
 * decided by the caller through `stakeholderCard.createWritesNameOnly`): `withCanonicalLabel` does not run, so no `a:label` and no `a:title`
 * is copied from the name. Every other create keeps the label wiring.
 */
export function createWiring(facts: RecordFacts, nameField: string | undefined, nameOnly?: boolean): RecordFacts {
  return nameOnly ? facts : withCanonicalLabel(facts, nameField);
}

export function useCreateRecord(vaultId: string) {
  const qc = useQueryClient();
  return useMutation<
    { id: string; etag: string | null; entityUri?: string; tempId: string },
    Error,
    { type: RecordTypeSpec; facts: RecordFacts; nameOnly?: boolean },
    { tempId: string }
  >({
    mutationFn: async ({ type, facts, nameOnly }) => {
      const uri = typeUriForVaultNamespace(type.typeName, vaultId);
      const wired = createWiring(facts, type.nameField, nameOnly);
      const { id, etag } = await createRecord(
        vaultId,
        uri,
        wired,
        entityDisplayName(wired, { nameField: type.nameField, fallback: "" }) || undefined,
      );
      await rememberRecord({ id, vaultId, typeUri: uri, updatedAt: Date.now() });
      // the ack gave an id; ask the vault where it put it. See `createdEntityUri`.
      const entityUri = await createdEntityUri(id, vaultId);
      return { id, etag, entityUri, tempId: "" };
    },
    onMutate: ({ type, facts, nameOnly }) => {
      const tempId = newTempId();
      const wired = createWiring(facts, type.nameField, nameOnly);
      const optimistic: GridRecord = {
        id: tempId,
        typeUri: typeUriForVaultNamespace(type.typeName, vaultId),
        facts: wired,
                // Client-authored strings, faithful by construction: nothing here came through a lossy coercion, so there is nothing to preserve
                // by omission.
        opaqueFacts: [],
        etag: null,
        updatedAt: Date.now(),
      };
      setList(qc, vaultId, (list) => [optimistic, ...list]);
      return { tempId };
    },
    onSuccess: ({ id, etag, entityUri }, { type, facts, nameOnly }, ctx) => {
      // Pin against list-refetch prune for a minute (see isFreshlyCreated / hydrate merge).
      markFreshlyCreated(id);
      const wired = createWiring(facts, type.nameField, nameOnly);
      const canonical: GridRecord = {
        id,
                // The row carries the vault's OWN framed `@id`. Without it the row is a record with a name and no address, and every consumer that
                // addresses by `entityUri` falls to the apex (see `createdEntityUri`). `undefined` when the vault did not answer: identical to the
                // row before this was added, never a composed guess.
        ...(entityUri ? { entityUri } : {}),
        typeUri: typeUriForVaultNamespace(type.typeName, vaultId),
        facts: wired,
                // Built from CLIENT facts; the vault's view of them is not re-read here (`createdEntityUri` keeps only `entityUri`). A vault-side
                // normalisation into an object shape would be invisible to this row; the next `readRecord` of this id restores the true marking.
                // Recorded as the known edge rather than left implicit.
        opaqueFacts: [],
        etag,
        updatedAt: Date.now(),
      };
      setList(qc, vaultId, (list) => upsert(list.filter((r) => r.id !== ctx?.tempId), canonical));
      // the multi-vault list shows the new record too.
      void refreshMultiVaultLists(qc);
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.tempId) setList(qc, vaultId, (list) => list.filter((r) => r.id !== ctx.tempId));
    },
  });
}

/**
 * The retype was NOT written, because the record was saved elsewhere since the card read it (or it is gone). `stored` is the record as
 * stored now, with its type unchanged; the card shows it and the person picks the type again.
 */
export class RetypeChangedElsewhereError extends Error {
  readonly stored: BaseRecord | null;
  constructor(stored: BaseRecord | null) {
    super("This record was changed elsewhere, so its type was not changed. The latest is shown. Pick the type again.");
    this.name = "RetypeChangedElsewhereError";
    this.stored = stored;
  }
}

/**
 * Change a record's BaseVeda type. Used when the user picks a live ontology type after naming a blank node.
 *
 * PUT of the same `<ID>` + new `<TYPE_BARE>` only. Not `readRecord` -> merge every RENDERED (flattened) fact -> `replaceRecord` (that
 * round-trip is lossy). The PUT carries the editor's facts where the person edited them and, for every other fact, the value the raw read
 * served (`factsAsServed`; a link stays a link, a grant is kept). Assembled buckets are still omitted by `storedSpellings`. Pair the find of
 * the new type after.
 *
 * NO `If-Match: *`, EVER. The PUT replaces every fact, so a `*` replaced another session's saved value this card never showed (measured in
 * the card and on a real store). Now:
 *   - the record is read first (the PUT needs the served values); when the read is the version in hand, the PUT is bound to that ETag;
 *     with no ETag, or a read that has moved past it, cases (a) and (b) below decide at once (a PUT on the old ETag could only 412);
 *   - on 412 (or with no ETag) the record is read as stored now. (a) If nothing in it was saved elsewhere since the card read it
 *     (`keysSavedElsewhere`: every stored value is what the card read or what the card itself has), the retype is sent ONCE more, bound to
 *     that read, with the card's facts as they are now (`compose`). (b) Otherwise nothing is written and the mutation fails with
 *     `RetypeChangedElsewhereError`, carrying the record as stored; the card shows it and the person picks the type again. A second 412 is
 *     (b). Never the old facts under the newer ETag: that is the same defect in disguise.
 * Server-side, the replace re-stamps a:lwsSelf.
 */
export function useRetypeRecord(vaultId: string) {
  const qc = useQueryClient();
  return useMutation<
    { etag: string | null; typeUri: string; facts: RecordFacts },
    Error,
    {
      record: BaseRecord;
      typeName: string;
      facts?: RecordFacts;
            /**
             * The card's facts NOW: `held`, the editor's facts, and `send`, the PUT's facts built from them. Called before each send, so a resend
             * after a 412 carries an edit the card made meanwhile. Absent: `facts` (or the record's) for both.
             */
      compose?: () => { held: RecordFacts; send: RecordFacts };
    },
    { previous: BaseRecord | undefined }
  >({
    mutationFn: async ({ record, typeName, facts, compose }) => {
      const typeBare = typeName.replace(/^t:/, "").trim();
      const typeUri = typeUriForVaultNamespace(typeBare, vaultId);
      const now = () => {
        if (compose) return compose();
        const f = facts ?? record.facts;
        return { held: f, send: f };
      };
      const read = record.facts ?? {};
      const at = record.entityUri ?? null;
            // The PUT replaces every fact and stores what it is sent verbatim, so each fact the person did not edit goes back AS THE STORE
            // SERVED IT (`factsAsServed`), from the served document of the version the PUT is bound to: a link stays `{"@id"}`, a list stays a
            // list, a fact the editor never held (a grant, another app's fact) is kept, not retracted. Built from the editor's strings,
            // `a:statedBy` was stored as text.
      const send = async (base: BaseRecord, token: string, composed: { held: RecordFacts; send: RecordFacts }) => {
        const served = base.served?.etag === token ? base.served : undefined;
        const wire = served ? await factsAsServed(served, at, composed) : { facts: composed.send, keepEmpty: undefined };
        // The optional tail stays EMPTY when it carries nothing, so the call keeps the arity it had
        // (the same reason `writeSource` spreads; see its docblock).
        const { etag } = wire.keepEmpty?.size
          ? await retypeRecord(record.id, typeBare, token, at, wire.facts, writeSource(base)[0], wire.keepEmpty)
          : await retypeRecord(record.id, typeBare, token, at, wire.facts, ...writeSource(base));
        await listVaultRecordsPage(vaultId, [typeBare], 0);
        await rememberRecord({ id: record.id, vaultId, typeUri, updatedAt: Date.now() });
        return { etag, typeUri, facts: composed.send };
      };

      const inHand = record.etag?.trim() ? record.etag : null;
      let stored: BaseRecord | null = null;
      if (inHand) {
                // The PUT is bound to the ETag in hand. It needs the document served AT that ETag: the card's own read when it is that version,
                // else a raw read now (re-send from a raw GET). After a save the card holds a newer ETag than its read, so it reads. A read that has
                // moved past the ETag in hand is what a 412 would show: cases (a) and (b) decide at once, with no PUT that can only be refused.
        let base: BaseRecord | null = record.served?.etag === inHand ? record : null;
        if (!base) {
          stored = await readRecord(record.id, at);
          if (!stored?.etag) throw new RetypeChangedElsewhereError(stored);
          if (stored.etag === inHand) base = stored;
        }
        if (base) {
          try {
            return await send(base, inHand, now());
          } catch (e) {
            if (!(e instanceof RecordConflictError)) throw e;
          }
          stored = null;
        }
      }
            // Read the record as stored now (unless just read); send once more only in case (a).
      if (!stored) stored = await readRecord(record.id, at);
      if (!stored?.etag) throw new RetypeChangedElsewhereError(stored);
      const composed = now();
      const { held, send: body } = composed;
      const own = [held, body, withCanonicalLabel(held, resolveType(record.typeUri)?.nameField ?? "title")];
      if (keysSavedElsewhere(stored.facts, read, own).length > 0) throw new RetypeChangedElsewhereError(stored);
      try {
        return await send(stored, stored.etag, composed);
      } catch (e) {
        if (!(e instanceof RecordConflictError)) throw e;
        // Refused twice: case (b). Show the record as stored now; ⛔ no third send.
        const again = await readRecord(record.id, at).catch(() => null);
        throw new RetypeChangedElsewhereError(again ?? stored);
      }
    },
    onMutate: ({ record, typeName, facts }) => {
      const list = flattenRecordPages(qc.getQueryData<InfiniteData<RecordsPage>>(recordsKey(vaultId)));
      const previous = list.find((r) => r.id === record.id);
      const typeUri = typeUriForVaultNamespace(typeName.replace(/^t:/, ""), vaultId);
      setList(qc, vaultId, (l) =>
        upsert(l, {
          ...record,
          typeUri,
          facts: facts ?? record.facts,
          etag: record.etag,
        }),
      );
      return { previous };
    },
    onSuccess: ({ etag, typeUri: written, facts }, { record }) => {
            // The cache holds the type as a READ spells it (`normalizeTypeUri`), not the wire CURIE: the card resolves the type by that
            // spelling, and with `t:Organization` it showed "t:Organization · open type" until reopened.
      const typeUri = normalizeTypeUri(written);
      setList(qc, vaultId, (l) =>
        l.map((r) =>
          r.id === record.id
            ? { ...withTypeUri(r, typeUri), facts, etag }
            : r,
        ),
      );
            // The open card shows the new type without being reopened.
      setRecordReads(qc, record.id, (r) => ({ ...withTypeUri(r, typeUri), facts, etag }));
            // A record retyped into (or out of) a stakeholder kind moves in the multi-vault list too.
      void refreshMultiVaultLists(qc);
    },
    onError: async (err, { record }, ctx) => {
            // The record as stored now, its type unchanged, replaces the optimistic row.
      if (err instanceof RetypeChangedElsewhereError) {
        if (err.stored) {
          setList(qc, vaultId, (l) => upsert(l, err.stored!));
          setRecordReads(qc, record.id, () => err.stored!);
        } else if (ctx?.previous) setList(qc, vaultId, (l) => upsert(l, ctx.previous!));
        return;
      }
            // No `RecordConflictError` arm here. `mutationFn` catches the 412 of both sends and turns the second into
            // `RetypeChangedElsewhereError` (case (b)), so a conflict never reaches this callback; the arm that re-read the record was dead.
      if (ctx?.previous) setList(qc, vaultId, (l) => upsert(l, ctx.previous!));
    },
  });
}

/**
 * The key every record delete runs under ({@link useDeleteRecord}), so a list that does not read the records cache (the Stakeholders
 * list) can follow a delete made anywhere in the app: it watches the mutation cache for this key.
 */
export const RECORD_DELETE_KEY = ["base", "record-delete"] as const;

/** What a record delete is called with (`useDeleteRecord`'s variables). */
export interface DeleteRecordVars {
  id: string;
  entityUri?: string | null;
  /** the version being ended. Sent as If-Match; a 404 is then an error (the record was already replaced or removed). */
  ifMatch?: string | null;
}

/** A step of a record delete as the app's one delete door runs it: started, refused by the store, or landed. */
export type RecordDeleteStep = "pending" | "error" | "success";

/**
 * THE one watcher of the record delete door (`RECORD_DELETE_KEY`), shared by every screen that follows deletes (the Stakeholders grid,
 * the Stakeholders list reader). One per query client, installed by the first caller and kept for the client's life, so a delete made
 * while no list is on screen (Card view) is still seen.
 *   - `pending()`: the ids whose delete is out (taken out again when the store refuses one);
 *   - a landed delete is kept in the SESSION's deleted list (`forgetDeletedLinkedRecord` of `stakeholder-list-state`), which outlives any
 *     screen and is cleared only on sign-out;
 *   - `subscribe(step)`: each step, for a screen's own after-work (the reader's redraw).
 */
export interface RecordDeleteWatch {
  pending(): ReadonlySet<string>;
  subscribe(listener: (id: string, step: RecordDeleteStep) => void): () => void;
}

const deleteWatches = new WeakMap<QueryClient, RecordDeleteWatch>();

/** Whether a mutation key is the record delete door's. */
export function isRecordDeleteKey(key: readonly unknown[] | undefined): boolean {
  return !!key && key.length === RECORD_DELETE_KEY.length && key.every((k, i) => k === RECORD_DELETE_KEY[i]);
}

/**
 * The query client's one delete watcher (made on first use).
 *
 * @param qc the page's query client
 */
export function watchRecordDeletes(qc: QueryClient): RecordDeleteWatch {
  const kept = deleteWatches.get(qc);
  if (kept) return kept;
  let pending: ReadonlySet<string> = new Set();
  const listeners = new Set<(id: string, step: RecordDeleteStep) => void>();
  qc.getMutationCache().subscribe((e) => {
    if (e.type !== "updated" || !isRecordDeleteKey(e.mutation.options.mutationKey)) return;
    const id = (e.mutation.state.variables as DeleteRecordVars | undefined)?.id;
    const step = e.action.type;
    if (!id || (step !== "pending" && step !== "error" && step !== "success")) return;
    const next = new Set(pending);
    if (step === "pending") next.add(id);
    else next.delete(id);
    // Landed: into the session's deleted list FIRST, so no screen sees the id in neither set.
    if (step === "success") forgetDeletedLinkedRecord(id);
    pending = next;
    for (const l of listeners) l(id, step);
  });
  const watch: RecordDeleteWatch = {
    pending: () => pending,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  deleteWatches.set(qc, watch);
  return watch;
}

/** Delete a record — optimistic remove, background DELETE, restore on error. */
export function useDeleteRecord(vaultId: string) {
  const qc = useQueryClient();
  // the delete watcher is there before any delete runs, whether or not a list is on screen.
  watchRecordDeletes(qc);
  return useMutation<void, Error, DeleteRecordVars, { previous: GridRecord | undefined; index: number }>({
    mutationKey: RECORD_DELETE_KEY,
        // The caller passes the record's own entity URI so the DELETE lands at the vault that listed it. A reported live symptom ("no such
        // step", the step still there) was this call sending only the tail to the API origin.
    mutationFn: async ({ id, entityUri, ifMatch }) => {
            // THE FALLBACK IS THE VAULT, NOT `null`. `null` resolves `vaultOriginOf(null)` = the platform's own default origin, which holds no
            // other vault's data, so an absent `entityUri` sent the write to the apex and the 404 was swallowed as already-gone. `vaultId` is
            // the vault this hook is scoped to and is ALWAYS in scope here; it yields the right ORIGIN even when the exact entity URI is not to
            // hand. Latent today because every call site now passes `entityUri`, and a latent wrong default is exactly how this defect class
            // came back the first time.
            // The third argument is passed only for a conditional delete, so every other caller's call is unchanged.
      if (ifMatch) await deleteRecord(id, entityUri ?? vaultId ?? null, { ifMatch });
      else await deleteRecord(id, entityUri ?? vaultId ?? null);
            // The Stakeholders list's kept up-front answers forget the record once the DELETE has landed (a refused delete keeps them). That is
            // done ONCE, by the delete watcher's landed step (`watchRecordDeletes`, installed above), not here as well.
            // And its link, read with the grid's pages, is forgotten (a deleted record was opened).
      forgetPageLink(id);
      await forgetRecord(id);
    },
    onMutate: ({ id }) => {
      const list = flattenRecordPages(qc.getQueryData<InfiniteData<RecordsPage>>(recordsKey(vaultId)));
      const index = list.findIndex((r) => r.id === id);
      const previous = index >= 0 ? list[index] : undefined;
      setList(qc, vaultId, (l) => l.filter((r) => r.id !== id));
      return { previous, index };
    },
        // A rollback must restore, not re-insert.
        //
        // This used to be `upsert(l, ctx.previous!)`. Because `onMutate` had already filtered the row out, `upsert` took its not-found branch
        // (`[{ updatedAt: Date.now(), ...rec }, ...l]`) and so did TWO things a rollback must never do:
        //   1. stamped a FRESH `updatedAt` of "now", overwriting the row's real vault recency;
        //   2. PREPENDED it, discarding its position.
        // Measured effect for a person: delete a row far down the register, have the DELETE fail (offline, 403, vault unreachable), and the row
        // comes back at the TOP of the list, presenting itself as the most recently touched thing in the vault. The app fabricates a recency
        // fact out of a failure; the undo is not supposed to be an edit. Restore the snapshot verbatim, at the index it came from.
    onError: (_err, _vars, ctx) => {
      const prev = ctx?.previous;
      if (!prev) return;
      setList(qc, vaultId, (l) => {
        if (l.some((r) => r.id === prev.id)) return l; // already back — never double-insert
        const at = ctx.index >= 0 ? Math.min(ctx.index, l.length) : l.length;
        const copy = l.slice();
        copy.splice(at, 0, prev);
        return copy;
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: recordsKey(vaultId, "ended") });
    },
  });
}
