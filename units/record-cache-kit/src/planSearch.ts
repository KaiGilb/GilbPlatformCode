// One vault search for every Plan picker. `/base/search` may not match a tag: the prefix
// analyzer splits on non-letters, and a tag is not guaranteed to be a token. `Speed` does
// not find `Walk.Step`. When the typed text has no spaces, an exact `a:unitTag` find covers
// that whole tag and is merged ahead of the search hits.

import type { QueryClient } from "@tanstack/react-query";
import { readRecord, recordFromServed, type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { MAX_PARALLEL_DEREFERENCES, UNTYPED_FIND, findByAttribute, idFromEntityUri, listVaultRecordsPage, mapWithConcurrency, planReadLimit, searchEntities, typeLocalName, type VaultRecordRef } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { recordTag } from "@kaigilb/gilbplatformcode-plan-links-model";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { planSearchKey } from "./cacheKeys";
import { entityDisplayName } from "./entityDisplayName";

const HIT_CAP = 20;
const LIST_LIMIT = 50;

/** Drop every plan picker's cached answer for this vault. Only an open picker re-runs; the rest re-run when next used. */
export function invalidatePlanSearch(qc: QueryClient, planVault: string): void {
  void qc.invalidateQueries({ queryKey: planSearchKey(planVault), refetchType: "active" });
}

export type PlanSearchHit = {
  uri: string;
  id: string;
  label: string;
  tag: string;
  typeName: string;
  /** The listed or read row, so a pick can write without reading it again. */
  row: BaseRecord;
};

export type PlanSearchPage = {
  hits: PlanSearchHit[];
  complete: boolean;
};

export type PlanSearchOpts = {
  search?: (
    q: string,
    types: readonly string[],
    facet: undefined,
    vaultId: string,
    match: "prefix",
  ) => Promise<{ ids?: string[]; next?: string | null }>;
  read?: (id: string, at: string | null) => Promise<BaseRecord | null>;
  list?: (
    vaultId: string,
    typeNames: readonly string[],
    offset: number,
    opts?: { includeBody?: boolean; limit?: number },
  ) => Promise<{ records: VaultRecordRef[]; complete: boolean }>;
  /** When set, the exact-tag find and its one record read take slots on this client's Plan read limit. */
  qc?: QueryClient;
  /**
   * Stands in for the exact `a:unitTag` find plus its one read. With `qc`, the call takes one
   * limiter slot and must not itself wait on that limiter.
   */
  findTag?: (vaultId: string, tag: string) => Promise<BaseRecord | null>;
};

function uniqueIds(ids: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function hitOf(row: BaseRecord, fallbackUri: string, fallbackId: string): PlanSearchHit | null {
  const uri = row.entityUri || fallbackUri;
  const id = row.id || fallbackId;
  if (!uri || !id) return null;
  const tag = recordTag(row.facts);
  const label = entityDisplayName(row.facts, { entityUri: uri, fallback: tag }).trim();
  if (!label) return null;
  return { uri, id, label, tag, typeName: typeLocalName(row.typeUri ?? ""), row };
}

function listedRow(ref: VaultRecordRef): BaseRecord {
  if (ref.body && typeof ref.body === "object" && !Array.isArray(ref.body)) {
    const row = recordFromServed(ref.id, ref.body, ref.etag ?? null);
    if (!row.entityUri && ref.entityUri) row.entityUri = ref.entityUri;
    return row;
  }
  const label = (ref.label ?? "").trim();
  return {
    id: ref.id,
    entityUri: ref.entityUri,
    typeUri: ref.typeUri,
    facts: label ? { label } : {},
    opaqueFacts: [],
    etag: ref.etag ?? null,
    servedKeys: label ? ["label"] : [],
    served: { facts: label ? { label } : {}, context: undefined, etag: ref.etag ?? null },
  };
}

type VaultSearch = (
  q: string,
  types: readonly string[],
  facet: undefined,
  vaultId: string,
  match: "prefix",
) => Promise<{ ids?: readonly string[]; next?: string | null }>;

export type VaultSearchOpts = {
  search?: VaultSearch;
  read?: (id: string, at: string | null) => Promise<BaseRecord | null>;
  /** A hit from a row that was read. Null drops it. Dropping a row does not make `complete` false. */
  toHit?: (row: BaseRecord, uri: string, id: string) => PlanSearchHit | null;
};

/**
 * Prefix Find across `vaultIds` (in parallel), one deduped list, at most 20 ids read 6 at a time.
 * `typeNames` null searches with no type conjunct. `complete` is false when a vault failed, a page
 * has a next cursor, the id list was cut, or a read of a kept id failed. A vault that failed adds
 * no ids; the others are still returned (`vaultsMissed`).
 */
export async function searchVaults(
  vaultIds: readonly string[],
  text: string,
  typeNames: readonly string[] | null,
  opts: VaultSearchOpts = {},
): Promise<{ hits: PlanSearchHit[]; complete: boolean; vaultsMissed: boolean }> {
  const vaults = [...new Set(vaultIds.map((v) => v.trim()).filter(Boolean))];
  const names = typeNames ? [...new Set(typeNames.map((n) => n.trim()).filter(Boolean))] : null;
  if (vaults.length === 0 || (names !== null && names.length === 0)) return { hits: [], complete: false, vaultsMissed: false };
  const search = (opts.search ?? searchEntities) as (
    q: string,
    types: readonly string[] | typeof UNTYPED_FIND,
    facet: undefined,
    vaultId: string,
    match: "prefix",
  ) => Promise<{ ids?: readonly string[]; next?: string | null }>;
  const read = opts.read ?? readRecord;
  const toHit = opts.toHit ?? hitOf;
  const types = names ?? UNTYPED_FIND;
  const needle = text.trim();
  const settled = await Promise.all(
    vaults.map(async (vaultId) => {
      try {
        return { ok: true as const, found: await search(needle, types, undefined, vaultId, "prefix") };
      } catch {
        return { ok: false as const };
      }
    }),
  );
  let complete = true;
  let vaultsMissed = false;
  const ids: string[] = [];
  for (const item of settled) {
    if (!item.ok) {
      vaultsMissed = true;
      complete = false;
      continue;
    }
    if (item.found.next !== null) complete = false;
    ids.push(...(item.found.ids ?? []));
  }
  const unique = uniqueIds(ids);
  if (unique.length > HIT_CAP) complete = false;
  const cut = unique.slice(0, HIT_CAP);
  const rows = await mapWithConcurrency(cut, MAX_PARALLEL_DEREFERENCES, async (entity) => {
    try {
      return await read(idFromEntityUri(entity), entity);
    } catch {
      return null;
    }
  });
  if (rows.some((row) => row === null)) complete = false;
  const hits: PlanSearchHit[] = [];
  for (let i = 0; i < cut.length; i++) {
    const rec = rows[i];
    if (!rec) continue;
    if (names && !names.includes(typeLocalName(rec.typeUri ?? ""))) continue;
    const hit = toHit(rec, cut[i]!, idFromEntityUri(cut[i]!));
    if (hit) hits.push(hit);
  }
  hits.sort((a, b) => a.label.localeCompare(b.label) || a.uri.localeCompare(b.uri));
  return { hits, complete, vaultsMissed };
}

/**
 * Records of `typeNames` in `vaultId` matching `text`.
 * Empty text: the first typed list page, labels from the body, no further reads.
 * Typed text: {@link searchVaults} for that one vault. A vault that could not be searched throws,
 * so the picker shows its error line instead of a partial list.
 * Typed text with no spaces also runs one exact `a:unitTag` find and merges that hit (of this
 * picker's type) ahead of the search hits. No client and no `findTag` skips that find.
 * `complete` is the list page's `complete`, or (for a search) `next === null`, no id past the cap,
 * and every id that was read came back. A failed or unreadable read is not complete.
 * A failed exact-tag find is not complete either, so Create is not offered on a partial answer.
 */
export async function searchPlanRecords(
  vaultId: string,
  text: string,
  typeNames: readonly string[],
  opts: PlanSearchOpts = {},
): Promise<PlanSearchPage> {
  const names = [...new Set(typeNames.map((n) => n.trim()).filter(Boolean))];
  const vault = vaultId.trim();
  if (!vault || names.length === 0) return { hits: [], complete: false };
  const needle = text.trim();
  const list = opts.list ?? ((id, types, offset, page) => listVaultRecordsPage(id, types, offset, page));
  if (!needle) {
    const page = await list(vault, names, 0, { includeBody: true, limit: LIST_LIMIT });
    const hits: PlanSearchHit[] = [];
    const seen = new Set<string>();
    for (const ref of page.records) {
      const typeName = typeLocalName(ref.typeUri ?? "");
      if (!names.includes(typeName)) continue;
      const hit = hitOf(listedRow(ref), ref.entityUri, ref.id);
      if (!hit || seen.has(hit.uri)) continue;
      seen.add(hit.uri);
      hits.push(hit);
    }
    hits.sort((a, b) => a.label.localeCompare(b.label) || a.uri.localeCompare(b.uri));
    return { hits, complete: page.complete };
  }
  const tag = exactTagText(needle);
  const exactPromise =
    tag && (opts.findTag || opts.qc)
      ? readExactTag(vault, tag, opts)
      : Promise.resolve({ row: null as BaseRecord | null, failed: false });
  const [exact, page] = await Promise.all([
    exactPromise,
    searchVaults([vault], needle, names, { search: opts.search, read: opts.read }),
  ]);
  if (page.vaultsMissed) throw new Error("Could not search");
  return { hits: mergeExactHit(page.hits, exact.row, names), complete: page.complete && !exact.failed };
}

/** A possible tag: at least one character and no spaces. A space stays a prefix search only. */
function exactTagText(text: string): string | null {
  if (text.length < 1 || /\s/.test(text)) return null;
  return text;
}

/**
 * One exact `a:unitTag` find and, when that returns an id, one record read of that first id.
 * A throw, or a read that comes back empty, is a failed answer. The caller drops a row whose type
 * is not one of the picker's.
 */
async function readExactTag(
  vault: string,
  tag: string,
  opts: PlanSearchOpts,
): Promise<{ row: BaseRecord | null; failed: boolean }> {
  const read = opts.read ?? readRecord;
  try {
    if (opts.findTag) {
      const load = () => opts.findTag!(vault, tag);
      const row = opts.qc ? await planReadLimit(opts.qc).run(load) : await load();
      return { row, failed: false };
    }
    const limit = planReadLimit(opts.qc!);
    const found = await limit.run(() => findByAttribute("a:unitTag", tag, { limit: 1 }, vaultOriginOf(vault)));
    const entity = found.ids[0];
    if (!entity) return { row: null, failed: false };
    const row = await limit.run(() => read(idFromEntityUri(entity), entity));
    return { row, failed: row == null };
  } catch {
    return { row: null, failed: true };
  }
}

/** The exact-tag row, when it is one of `names`, in front of `hits`. The same uri or id is not listed twice. */
function mergeExactHit(hits: PlanSearchHit[], row: BaseRecord | null, names: readonly string[]): PlanSearchHit[] {
  if (!row || !names.includes(typeLocalName(row.typeUri ?? ""))) return hits;
  const hit = hitOf(row, row.entityUri || "", row.id);
  if (!hit) return hits;
  const rest = hits.filter((item) => item.uri !== hit.uri && item.id !== hit.id);
  return [hit, ...rest];
}
