// One writer for a Plan card's row. The Function form, the Description, and the tag links
// all used to keep a copy. A missing ETag is null: the next list write must read a version first.

import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { asGrid } from "@kaigilb/gilbplatformcode-description-parts-model";
import { isFactStringFaithful, readRecord, type BaseRecord, type MergePatchValue } from "@kaigilb/gilbplatformcode-lws-records";
import { planRecordKey } from "./planFind";
import { putRecordInCaches, RECORD_QUERY_HEAD, recordsKey, refreshRecordInCaches, type RecordsPage } from "./recordCaches";

export type PlanRowPatch = Record<string, MergePatchValue>;

function editorString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(editorString).join(", ");
  if (typeof value === "object" && "@id" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)["@id"]);
  }
  return "";
}

export function applyPatch(
  row: GridRecord,
  patch: PlanRowPatch,
  etag: string | null,
  opts?: { keepOpaque?: boolean },
): GridRecord {
  const facts = { ...row.facts };
  const servedFacts = { ...(row.served?.facts ?? {}) };
  let opaque = [...(row.opaqueFacts ?? [])];
  for (const [slug, value] of Object.entries(patch)) {
    if (value === null) {
      delete facts[slug];
      delete servedFacts[slug];
      if (!opts?.keepOpaque) opaque = opaque.filter((k) => k !== slug);
      continue;
    }
    servedFacts[slug] = value;
    facts[slug] = editorString(value);
    if (opts?.keepOpaque) continue;
    if (!isFactStringFaithful(value)) {
      if (!opaque.includes(slug)) opaque.push(slug);
    } else opaque = opaque.filter((k) => k !== slug);
  }
  const servedKeys = [
    ...(row.servedKeys ?? []).filter((k) => patch[k] !== null),
    ...Object.keys(patch).filter((k) => patch[k] !== null && !(row.servedKeys ?? []).includes(k)),
  ];
  return {
    ...row,
    facts,
    opaqueFacts: opaque,
    servedKeys,
    etag,
    served: {
      facts: servedFacts,
      context: row.served?.context,
      etag,
      ...(row.served?.prefixedKeys ? { prefixedKeys: row.served.prefixedKeys } : {}),
    },
  };
}

function stamped(row: BaseRecord): number {
  const at = (row as GridRecord).updatedAt;
  return typeof at === "number" ? at : 0;
}

/** Greater `updatedAt` wins. On a tie, a non-null ETag beats a null one. */
function newer(candidate: BaseRecord, current: BaseRecord): boolean {
  const at = stamped(candidate);
  const bt = stamped(current);
  if (at !== bt) return at > bt;
  return !!candidate.etag && !current.etag;
}

/** The record read `putRecordInCaches` writes: `["base","record",id,origin]`, else any read of that id. */
function recordRead(qc: QueryClient, id: string, at: string | null): BaseRecord | undefined {
  const direct = qc.getQueryData<BaseRecord>(planRecordKey(id, at));
  if (direct) return direct;
  for (const [, row] of qc.getQueriesData<BaseRecord | null>({ queryKey: [...RECORD_QUERY_HEAD, id] })) {
    if (row) return row;
  }
  return undefined;
}

/**
 * The newest of the screen list, the record read, and `fallback`.
 * When the list row is older, it is caught up with `putRecordInCaches`.
 * A record read whose ETag differs from the list is the re-read the list has not stored yet:
 * the card shows that read (its `updatedAt` may still be the old one).
 */
export function liveRow(qc: QueryClient, vaultId: string, id: string, fallback: BaseRecord): GridRecord {
  const pages = qc.getQueryData<InfiniteData<RecordsPage>>(recordsKey(vaultId));
  const listRow = pages?.pages.flatMap((p) => p.records).find((r) => r.id === id);
  const cached = recordRead(qc, id, fallback.entityUri ?? null);
  if (cached?.etag && listRow?.etag && cached.etag !== listRow.etag) return asGrid(cached);
  let winner: BaseRecord = fallback;
  if (cached && !newer(winner, cached)) winner = cached;
  if (listRow && !newer(winner, listRow)) winner = listRow;
  if (listRow && winner !== listRow && newer(winner, listRow)) putRecordInCaches(qc, vaultId, asGrid(winner));
  return asGrid(winner);
}

/**
 * One list write. A save (`insert` false) replaces the row in every list that already holds it.
 * A create passes `{ insert: true }` and adds the row only on the record's own vault.
 */
export function storePlanRow(
  qc: QueryClient,
  planVault: string,
  row: BaseRecord,
  opts?: { insert?: boolean },
): void {
  putRecordInCaches(qc, planVault, row, opts);
}

/**
 * A Plan PATCH with no ETag reads the record first. Null when that read still has no ETag:
 * the caller refuses and does not write. The read is stored on the record's own vault list
 * only when that list already holds the row.
 */
export async function ensureEtag(qc: QueryClient, vaultId: string, row: GridRecord): Promise<GridRecord | null> {
  if (row.etag) return row;
  const fresh = await readRecord(row.id, row.entityUri ?? null).catch(() => null);
  if (!fresh?.etag) return null;
  const grid = asGrid(fresh);
  putRecordInCaches(qc, vaultId, grid);
  if (grid.entityUri) qc.setQueryData(planRecordKey(grid.id, grid.entityUri), grid);
  return grid;
}

/**
 * Read a missing ETag before the patch is built. When that read returns a different copy of a field
 * this write touches, `sameFor` is false: nothing is written. An ETag already on the row is not read.
 */
export async function ensureEtagUnchanged(
  qc: QueryClient,
  vaultId: string,
  row: GridRecord,
  sameFor: (fresh: GridRecord) => boolean,
): Promise<{ row: GridRecord } | { conflict: true } | { unreadable: true }> {
  if (row.etag) return { row };
  const fresh = await ensureEtag(qc, vaultId, row);
  if (!fresh?.etag) return { unreadable: true };
  if (!sameFor(fresh)) return { conflict: true };
  return { row: fresh };
}

/** Read the record after a 412 and put that row in the list and the record read. Returns the fresh row. */
export async function reconcileAfterConflict(
  qc: QueryClient,
  vaultId: string,
  row: { id: string; entityUri?: string | null },
): Promise<BaseRecord | null> {
  const fresh = await refreshRecordInCaches(qc, vaultId, { id: row.id, entityUri: row.entityUri ?? null });
  if (fresh?.entityUri) qc.setQueryData(planRecordKey(fresh.id, fresh.entityUri), fresh);
  return fresh;
}
