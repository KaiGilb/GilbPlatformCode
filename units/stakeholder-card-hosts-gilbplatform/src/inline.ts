// The members that are one short expression or hook at their GilbApp call site and sit in no unit. Each is the source's code with its free
// names replaced by the units' exports; each is cited `path:line` of GilbApp at the commit named in unit.json.

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { readRecord, type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { MAX_PARALLEL_DEREFERENCES, mapWithConcurrency } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import type { PickerQueryArgs, PickerQueryResult } from "@kaigilb/gilbplatformcode-record-picker";
import { idFromResourceUri } from "@kaigilb/gilbplatformcode-resource-id";
import { entityUriInVault } from "@kaigilb/gilbplatformcode-vault-namespace";
import type { ReadResource } from "@kaigilb/gilbplatformcode-org-employees";
import { watchRecordDeletes } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { deletedLinkedRecords, deletedLinkedRevision, onDeletedLinkedRecords } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";

/** How old a kept record may be and still answer for a read: the app's own freshness for a record read. GilbApp: `HELD_RECORD_FRESH_MS`, lib/base/recordHooks.ts:449. */
export const HELD_RECORD_FRESH_MS = 15_000;

/**
 * The record the record reads' cache holds for this row, or null: not held, or held for longer than {@link HELD_RECORD_FRESH_MS}.
 * GilbApp: `heldRecordOf`, lib/base/recordHooks.ts:456-462.
 */
export function heldRecordOf(qc: QueryClient, id: string, entityUri: string | null | undefined): BaseRecord | null {
  if (!entityUri) return null;
  const key = ["base", "record", id, vaultOriginOf(entityUri)] as const;
  const st = qc.getQueryState<BaseRecord | null>(key);
  if (!st?.data || Date.now() - st.dataUpdatedAt >= HELD_RECORD_FRESH_MS) return null;
  return st.data;
}

/**
 * The ids of records being deleted or deleted in this session: the delete watcher's pending ids and the session's deleted list.
 * GilbApp: `useRecordsBeingDeleted`, lib/base/recordHooks.ts:2609-2630.
 */
export function useRecordsBeingDeleted(): ReadonlySet<string> {
  const qc = useQueryClient();
  const watch = watchRecordDeletes(qc);
  const subscribe = useCallback(
    (tell: () => void) => {
      const a = watch.subscribe(() => tell());
      const b = onDeletedLinkedRecords(tell);
      return () => {
        a();
        b();
      };
    },
    [watch],
  );
  const pending = useSyncExternalStore(subscribe, watch.pending, watch.pending);
  const landedRev = useSyncExternalStore(subscribe, deletedLinkedRevision, deletedLinkedRevision);
  return useMemo(() => {
    const landed = deletedLinkedRecords();
    if (pending.size === 0) return landed;
    return new Set([...landed, ...pending]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, landedRev]);
}

// holdingVaultOf and the door lookup of the app both read it through createdInVaultOf. GilbApp: lib/base/recordHooks.ts:2836.
const CREATED_IN_VAULT_HEAD = ["created-in-vault"] as const;
/** The cache key for where a create made in this session wrote a record (its short id). GilbApp: `createdInVaultKey`, recordHooks.ts:2838-2840. */
export function createdInVaultKey(recordId: string) {
  return [...CREATED_IN_VAULT_HEAD, recordId] as const;
}
/** Remember the vault a create wrote into, for the session. GilbApp: `rememberCreatedIn`, lib/base/recordHooks.ts:2842-2845. */
export function rememberCreatedIn(qc: QueryClient, recordId: string, vaultId: string): void {
  qc.setQueryDefaults(CREATED_IN_VAULT_HEAD, { gcTime: Infinity, staleTime: Infinity });
  qc.setQueryData(createdInVaultKey(recordId), vaultId);
}

/** The one React Query key of a vault's address set. GilbApp: `placeClaimsKey`, lib/mynet/place/usePlaceClaims.ts:50. */
export const placeClaimsKey = (vaultId: string) => ["mynet", "place-claims", vaultId] as const;
/** How old a held vault read a card load may use. GilbApp: `PLACE_CLAIMS_STALE_MS`, lib/mynet/place/usePlaceClaims.ts:52. */
export const PLACE_CLAIMS_STALE_MS = 60_000;

/** The catalogue's entity-address family, from its origin; trailing slashes of the origin are dropped. GilbApp: `GEO_ORIGIN` (lib/mynet/geo/baseGeo.ts:61) and `GEO_ENTITY_PREFIX` (:64). */
export function geoEntityPrefix(geoOrigin: string): string {
  return `${geoOrigin.replace(/\/+$/, "")}/base/e/`;
}

/**
 * True when the value is the address of a row in the shared world catalogue. GilbApp: `isGeoEntityId`, lib/mynet/geo/baseGeo.ts:82-84,
 * over the prefix of the catalogue's origin (`geoOrigin`, a provider prop).
 */
export function createIsGeoEntityId(geoOrigin: string): (value: unknown) => boolean {
  const prefix = geoEntityPrefix(geoOrigin);
  return (value: unknown) => typeof value === "string" && value.startsWith(prefix);
}

/** The pickers' query hook. GilbApp: `usePickerQuery`, the five options of `components/records/orgCard/OrgRecordPicker.tsx:144-150`; `retry: false` is the source's. */
export function usePickerQuery(a: PickerQueryArgs): PickerQueryResult {
  return useQuery({
    queryKey: a.key,
    queryFn: a.run,
    enabled: a.enabled,
    staleTime: a.staleTime,
    retry: false,
  });
}

/** One entity's served document and whether the store answered 404. GilbApp: `getResource` and `resourceOf`, lib/mynet/place/lws.ts:57-75 (the etag is not read by `readResources`, so it is left out). */
async function getResource(id: string, vaultId: string, entityUri?: string): Promise<{ doc: Record<string, unknown>; gone: boolean; typeUri?: string }> {
  const rec = await readRecord(id, entityUri ?? entityUriInVault(vaultId, id));
  if (!rec) return { doc: {}, gone: true };
  return { doc: rec.served?.facts ?? rec.facts, gone: false, ...(rec.typeUri ? { typeUri: rec.typeUri } : {}) };
}

/**
 * Read MANY records, at most six in flight, in input order; a record the store answered 404 for comes back `gone` with an empty `doc`; any other
 * failed read rejects. GilbApp: `readResources`, lib/mynet/place/lws.ts:164-170 (the host member `readResources` of the Employees group).
 */
export async function readResources(uris: readonly string[], vaultId: string): Promise<ReadResource[]> {
  return mapWithConcurrency(uris, MAX_PARALLEL_DEREFERENCES, async (uri) => {
    const id = idFromResourceUri(uri);
    const { doc, gone, typeUri } = await getResource(id, vaultId, uri);
    return { id, uri, doc, gone, ...(typeUri ? { typeUri } : {}) };
  });
}
