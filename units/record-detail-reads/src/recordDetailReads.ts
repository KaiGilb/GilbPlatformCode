// Reads one record for a record card: the record read itself (`useRecord`, `useRecordOnDemand`), the record and the address the page's
// caches already hold (`findKnownRecordInCache` and its hooks), the vault a create in this session wrote a record into
// (`createdInVaultOf`), the card an "Added by" link opened, and the record as the vault's list holds it (`useCachedRecord`).
import { useCallback, useSyncExternalStore } from "react";
import { hashKey, useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { readRecord, type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { flattenRecordPages, isTempId, recordsKey, type RecordsPage } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";

/**
 * One record read, made ONLY when asked: the viewer's chip for a link into another vault reads nothing when a process opens, and
 * reads once when the person clicks it. Observes the SAME cache entry {@link useRecord} fills (same key), so a record already read
 * costs no second read; it never reads by itself. `fetch()` makes exactly one read and returns the record (`null` = not there).
 */
export function useRecordOnDemand(id: string | null, at: string | null) {
  const q = useQuery<BaseRecord | null, Error>({
    queryKey: ["base", "record", id, vaultOriginOf(at)] as const,
    queryFn: () => readRecord(id!, at),
    enabled: false,
    staleTime: 15_000,
  });
  return {
    data: q.data,
    isFetching: q.isFetching,
    isError: q.isError,
    fetch: async (): Promise<BaseRecord | null> => (id ? ((await q.refetch()).data ?? null) : null),
  };
}

export function useRecord(id: string | null, at: string | null) {
  return useQuery<BaseRecord | null, Error>({
    // The DOOR belongs in this key: `readRecord(id, null)` asks the platform's base address and `readRecord(id, <vault>)` asks the
    // vault, the platform answers about no other host, and the two answers (`null` and the record) are indistinguishable once
    // they share one entry.
    queryKey: ["base", "record", id, vaultOriginOf(at)] as const,
    queryFn: () => readRecord(id!, at),
    enabled: !!id && !isTempId(id),
    staleTime: 15_000,
  });
}

/**
 * Rows a `["base", …]` query might hold for one record. Enumerated rather than deep-walked: a blind walk would match an unrelated
 * `{ id }` and that value decides WHICH VAULT is asked.
 *
 * `useRecord` stores the BaseRecord itself (not `{ records }`). Infinite-query pages (`{ pages: [{ records }] }`) are flattened.
 */
export function cacheRowsOf(data: unknown): unknown[] {
  // An array: a list of rows held bare.
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  const out: unknown[] = [];
  if (Array.isArray(o.records)) out.push(...o.records); // search / register-single / fanout
  if (Array.isArray(o.hits)) out.push(...o.hits); // jump hits + register-fanout hits
  if (Array.isArray(o.pages)) {
    for (const page of o.pages) {
      if (page && typeof page === "object" && Array.isArray((page as { records?: unknown }).records)) {
        out.push(...((page as { records: unknown[] }).records));
      }
    }
  }
  // A single-record query (`useRecord`) stores the BaseRecord itself.
  if (
    typeof o.id === "string" &&
    (typeof o.facts === "object" || typeof o.entityUri === "string" || typeof o.typeUri === "string")
  ) {
    out.push(o);
  }
  return out;
}

function asCachedBaseRecord(row: Record<string, unknown>): BaseRecord | null {
  if (typeof row.id !== "string" || !row.id) return null;
  const facts = row.facts;
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) return null;
  return {
    id: row.id,
    entityUri: typeof row.entityUri === "string" ? row.entityUri : undefined,
    typeUri: typeof row.typeUri === "string" ? row.typeUri : "",
    facts: facts as Record<string, string>,
    // This mapper REBUILDS a BaseRecord field by field, so anything not named here is silently dropped. `opaqueFacts` must
    // survive: a record reaching the save path through the cache scan (a jump, a deep link, a type the grid does not list)
    // would otherwise arrive with the protection absent rather than false, and the save's guard would be vacuous there.
    opaqueFacts: Array.isArray(row.opaqueFacts) ? (row.opaqueFacts as readonly string[]) : [],
    etag: typeof row.etag === "string" ? row.etag : null,
  };
}

export type KnownRecordInCache = {
  /** URI whose authority is the vault holding the record, or null if nothing knows. */
  door: string | null;
  /** Hydrated body when the cache actually holds facts (search / fanout / useRecord). */
  record: BaseRecord | null;
};

// ── Where a create in this session wrote a record ─────────────────────────────────────────────
// One key, one writer, one reader, all here: the door lookup below and a merged list's "which vault holds it" both read it through
// createdInVaultOf.
const CREATED_IN_VAULT_HEAD = ["created-in-vault"] as const;
/** The cache key for where a create made in this session wrote a record (its short id). */
export function createdInVaultKey(recordId: string) {
  return [...CREATED_IN_VAULT_HEAD, recordId] as const;
}
/** Remember the vault a create wrote into, for the session. Read only when no list attributes the record. */
export function rememberCreatedIn(qc: QueryClient, recordId: string, vaultId: string): void {
  qc.setQueryDefaults(CREATED_IN_VAULT_HEAD, { gcTime: Infinity, staleTime: Infinity });
  qc.setQueryData(createdInVaultKey(recordId), vaultId);
}
// ── The card an "Added by <name>" link opened ───────────────────────────────────────────────────
// The link names a card in the ADDER'S vault. That vault is usually not one the viewer holds, so the pane would read the card at
// the viewer's own host and answer 404 for the wrong reason. The link remembers the card's own address (the door) and the name the
// line already holds (for the name-only card shown when the card is not readable). Not under `["base"]`, so the record-cache scan
// never mistakes it for a record.
const ADDED_BY_CARD_HEAD = ["added-by-card"] as const;
/** What an "Added by" link remembers about the card it opened: the card's own address and the adder's name. */
export type AddedByCard = { readonly door: string; readonly name: string };
/** Remember the card an "Added by" link opened, for the session. */
export function rememberAddedByCard(qc: QueryClient, recordId: string, card: AddedByCard): void {
  qc.setQueryDefaults(ADDED_BY_CARD_HEAD, { gcTime: Infinity, staleTime: Infinity });
  qc.setQueryData([...ADDED_BY_CARD_HEAD, recordId], card);
}
/** The card an "Added by" link opened with this id, or null (the record was opened some other way). */
export function addedByCardOf(qc: QueryClient, recordId: string | null): AddedByCard | null {
  return recordId ? (qc.getQueryData<AddedByCard>([...ADDED_BY_CARD_HEAD, recordId]) ?? null) : null;
}

/** The vault a create in this session wrote `recordId` into, or null. */
export function createdInVaultOf(qc: QueryClient, recordId: string): string | null {
  return qc.getQueryData<string>(createdInVaultKey(recordId)) ?? null;
}

/**
 * Scan React Query's `["base"]` caches for a record the list page does not hold.
 * Prefers the body with the most facts (fanout `hits` over the name-only `records` mapper).
 */
export function findKnownRecordInCache(qc: QueryClient, id: string | null): KnownRecordInCache {
  if (!id) return { door: null, record: null };

  let vaultFallback: string | null = null;
  let door: string | null = null;
  let record: BaseRecord | null = null;
  for (const [, data] of qc.getQueriesData({ queryKey: ["base"] })) {
    for (const row of cacheRowsOf(data)) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      if (r.id !== id) continue;
      const rec = asCachedBaseRecord(r);
      if (rec && (!record || Object.keys(rec.facts).length > Object.keys(record.facts).length)) {
        record = rec;
      }
      if (!door && typeof r.entityUri === "string" && r.entityUri) door = r.entityUri;
      const vault =
        typeof r.vault === "string" ? r.vault : typeof r.sourceVaultId === "string" ? r.sourceVaultId : null;
      if (vault && !vaultFallback) vaultFallback = vault;
    }
  }
  // Last: the vault a create in this session wrote the record into. A stakeholder made from "+ New" in another held vault is in no
  // cached list yet, and without this its card was read from the open vault and answered 404.
  const createdIn = createdInVaultOf(qc, id);
  // Last of all: the card an "Added by" link opened lives at the adder's own host, never the viewer's.
  const addedByDoor = addedByCardOf(qc, id)?.door ?? null;
  return {
    door: door || record?.entityUri || vaultFallback || createdIn || addedByDoor,
    record,
  };
}

export function useKnownRecordInCache(id: string | null): KnownRecordInCache {
  const qc = useQueryClient();
  return findKnownRecordInCache(qc, id);
}

/** Door-only form: for a caller that only needs the address. */
export function useKnownRecordDoor(id: string | null): string | null {
  return useKnownRecordInCache(id).door;
}

/**
 * The record with `id` from the vault's records cache, read on every render as a getter would, AND the caller re-renders when the
 * row, whole, carries a NEW ETag: a write that landed, a reconcile.
 *
 * A card mounted twice (the centre pane that saves and a side rail that retypes) reads the record from here. With a one-shot getter
 * alone the rail never re-read it after the centre's save, so its retype went out with the first ETag and the first facts: a false
 * 412 "changed elsewhere". Do not go back to the getter for a pane.
 *
 * What does NOT re-render the card, on purpose:
 *   - an optimistic stand-in: it keeps the row's ETag (both mutations do), so a field the person is typing in is not swapped for the
 *     new type's fields while the retype's PUT is out;
 *   - a list refetch that brings the row back label-only (no ETag): the card would drop to "Loading record…" and lose what it holds.
 */
export function useCachedRecord(vaultId: string | undefined, id: string | null): BaseRecord | null {
  const qc = useQueryClient();
  const hash = hashKey(recordsKey(vaultId ?? ""));
  const read = useCallback((): BaseRecord | null => {
    if (!id || !vaultId) return null;
    return flattenRecordPages(qc.getQueryData<InfiniteData<RecordsPage>>(recordsKey(vaultId))).find((r) => r.id === id) ?? null;
  }, [qc, vaultId, id]);
  const subscribe = useCallback(
    (onChange: () => void) => {
      let seen = wholeRowEtag(read());
      return qc.getQueryCache().subscribe((e) => {
        if (e.query.queryHash !== hash) return;
        const now = wholeRowEtag(read());
        if (!now || now === seen) return;
        seen = now;
        onChange();
      });
    },
    [qc, hash, read],
  );
  return useSyncExternalStore(subscribe, read, read);
}

/** The ETag of a WHOLE cached row (`null` for a label-only row or none): what a pane adopts on. */
function wholeRowEtag(r: BaseRecord | null): string | null {
  if (!r || (r as { hydrated?: boolean }).hydrated === false) return null;
  return r.etag ?? null;
}
