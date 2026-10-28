// Membership of a Plan card's own lines: parts, sub-functions, Function of Value.
// Asked with find-by-attribute at the vault's origin. Never the paged vault list:
// that list is the first 40 rows, then 100 a page, so a line on a later page disappears.

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { readRecord, type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { MAX_PARALLEL_DEREFERENCES, idFromEntityUri, mapWithConcurrency, pageAllByAttribute, planReadLimit } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { planFindVaultKey } from "./cacheKeys";

export const PLAN_FIND_PAGE = 100;

/** One find shows at most this many linked records, and says so when more exist. */
export const PLAN_FIND_CAP = 300;

export type PlanFind = {
  rows: BaseRecord[];
  total: number;
  capped: boolean;
  unread: number;
  /** The cap this find used (absent on a find built by hand: {@link PLAN_FIND_CAP}). */
  cap?: number;
};

export function planFindRows(data: PlanFind | undefined): readonly BaseRecord[] {
  return data?.rows ?? [];
}

/** One cache entry per (vault, attribute, record). */
export function planFindKey(vaultId: string, attr: string, recordId: string) {
  return ["plan-find", vaultId, attr, recordId] as const;
}

/** The record-by-id cache `useRecord` and the stakeholder chip (`EntityRefValue`) already fill. */
export function planRecordKey(id: string, at: string | null) {
  return ["base", "record", id, vaultOriginOf(at)] as const;
}

// Held on the query client, not a module map: a part pinned in one card must not
// appear on the next card that happens to use the same vault and record id.
const pinStore = new WeakMap<QueryClient, Map<string, BaseRecord[]>>();
const dropStore = new WeakMap<QueryClient, Map<string, Set<string>>>();

function bucket(vaultId: string, attr: string, recordId: string): string {
  return `${vaultId}\n${attr}\n${recordId}`;
}

function pinsOf(qc: QueryClient): Map<string, BaseRecord[]> {
  let m = pinStore.get(qc);
  if (!m) pinStore.set(qc, (m = new Map()));
  return m;
}

function dropsOf(qc: QueryClient): Map<string, Set<string>> {
  let m = dropStore.get(qc);
  if (!m) dropStore.set(qc, (m = new Map()));
  return m;
}

/**
 * Every id, unless `opts.cap` stops the walk. A removal passes the budget it still has. The card's find caps itself.
 * `a:partOf` is stored as `{"@id"}`. `a:unitTag` is the tag string; wrapping it would find nothing.
 * `opts.until` stops the walk at the first id it accepts. `opts.cap` stops it early; omitted, the walk pages to the end.
 * `capped` is the walk's own flag: the cap stopped it on a full page and one more find returned a new id.
 * `ids.length >= count` is the whole answer, not a cap. `opts.qc`, when passed, puts each find through that
 * client's Plan read limit. Callers with no client (a tag check, a probe) pass none.
 */
export async function pageAttributeIds(
  attr: string,
  entityUri: string,
  origin: string,
  opts?: { until?: (id: string) => boolean; cap?: number; qc?: QueryClient },
): Promise<{ ids: string[]; count: number; capped: boolean }> {
  const cap = opts?.cap ?? Number.POSITIVE_INFINITY;
  const value = attr === "a:unitTag" ? entityUri : { "@id": entityUri };
  const run = opts?.qc ? planReadLimit(opts.qc).run : undefined;
  const page = await pageAllByAttribute(attr, value, origin, {
    pageSize: PLAN_FIND_PAGE,
    cap,
    until: opts?.until,
    ...(run ? { run } : {}),
  });
  return { ids: page.ids, count: page.count, capped: page.capped };
}

// Which member records the next re-read of one find should mark stale. Absent means every member:
// a direct `invalidateQueries` did not name a list. Held on the client, like the pins.
const memberScope = new WeakMap<QueryClient, Map<string, readonly string[] | "all">>();

function scopeMap(qc: QueryClient): Map<string, readonly string[] | "all"> {
  let m = memberScope.get(qc);
  if (!m) memberScope.set(qc, (m = new Map()));
  return m;
}

function rememberMemberScope(
  qc: QueryClient,
  vaultId: string,
  attr: string,
  parentId: string,
  scope: readonly string[] | "all",
) {
  scopeMap(qc).set(bucket(vaultId, attr, parentId), scope);
}

function takeMemberScope(
  qc: QueryClient,
  vaultId: string,
  attr: string,
  parentId: string,
): readonly string[] | "all" | undefined {
  const m = memberScope.get(qc);
  if (!m) return undefined;
  const key = bucket(vaultId, attr, parentId);
  const scope = m.get(key);
  m.delete(key);
  return scope;
}

/**
 * One member read. `fresh` uses `fetchQuery` (a stale or invalidated row is read again).
 * Otherwise `ensureQueryData`: the cached row, whatever its age, and a fetch only when there is none.
 */
export async function readCached(qc: QueryClient, entityUri: string, fresh: boolean): Promise<BaseRecord | null> {
  const id = idFromEntityUri(entityUri);
  const key = planRecordKey(id, entityUri);
  try {
    const read = () => planReadLimit(qc).run(() => readRecord(id, entityUri));
    const row = fresh
      ? await qc.fetchQuery({
          queryKey: key,
          queryFn: read,
          staleTime: 15_000,
        })
      : await qc.ensureQueryData({
          queryKey: key,
          queryFn: read,
        });
    return row ?? null;
  } catch {
    return null;
  }
}

/** Mark member records stale so the next `fetchQuery` reads what is stored now, without a second fetch. */
async function staleMemberRecords(qc: QueryClient, entityUris: readonly string[]): Promise<void> {
  await Promise.all(
    entityUris.map((entity) =>
      qc.invalidateQueries({ queryKey: planRecordKey(idFromEntityUri(entity), entity), refetchType: "none" }),
    ),
  );
}

function rememberPin(qc: QueryClient, key: string, row: BaseRecord) {
  const pins = pinsOf(qc);
  const cur = pins.get(key) ?? [];
  pins.set(key, [row, ...cur.filter((r) => r.id !== row.id)]);
}

function forgetPin(qc: QueryClient, key: string, id: string) {
  const pins = pinsOf(qc);
  const cur = pins.get(key);
  if (!cur) return;
  const next = cur.filter((r) => r.id !== id);
  if (next.length === 0) pins.delete(key);
  else pins.set(key, next);
}

function applyDrops(qc: QueryClient, key: string, merged: BaseRecord[], serverIds: ReadonlySet<string>): BaseRecord[] {
  const drops = dropsOf(qc);
  const dead = drops.get(key);
  if (!dead) return merged;
  for (const id of [...dead]) {
    if (!serverIds.has(id)) dead.delete(id);
  }
  if (dead.size === 0) drops.delete(key);
  return merged.filter((r) => !dead.has(r.id));
}

/** Pins first, then the server rows, minus a drop the server still returns. `serverIds` are server row ids, not pins. */
export function applyPinsAndDrops(
  qc: QueryClient,
  vaultId: string,
  attr: string,
  parentId: string,
  rows: BaseRecord[],
  serverIds: ReadonlySet<string>,
): BaseRecord[] {
  const key = bucket(vaultId, attr, parentId);
  const seen = new Set(rows.map((r) => r.id));
  const extras = (pinsOf(qc).get(key) ?? []).filter((r) => !seen.has(r.id));
  return applyDrops(qc, key, [...extras, ...rows], serverIds);
}

export async function loadPlanFind(
  qc: QueryClient,
  vaultId: string,
  attr: string,
  parentId: string,
  entityUri: string,
  cap: number = PLAN_FIND_CAP,
): Promise<PlanFind> {
  const origin = vaultOriginOf(vaultId);
  const findKey = planFindKey(vaultId, attr, parentId);
  // A re-read of the find (including one started outside this module) must not keep a fresh member cache.
  const findInvalidated = qc.getQueryState(findKey)?.isInvalidated === true;
  // `invalidatePlanFind` already marked its list. Taking it here stops this re-read from marking every
  // member again. No list (a direct invalidateQueries) still marks every member of the fresh page.
  const scope = findInvalidated ? takeMemberScope(qc, vaultId, attr, parentId) : undefined;
  const paged = await pageAllByAttribute(attr, { "@id": entityUri }, origin, {
    pageSize: PLAN_FIND_PAGE,
    cap,
    run: planReadLimit(qc).run,
  });
  // No named list (card open, Try again, another writer's change) reads every member.
  // A narrowed list reads those fresh and leaves every other member on its cached row.
  const freshAll = !findInvalidated || scope === undefined || scope === "all";
  if (findInvalidated && freshAll) await staleMemberRecords(qc, paged.ids);
  const freshSet = !freshAll && Array.isArray(scope) ? new Set(scope) : null;
  const read = await mapWithConcurrency(paged.ids, MAX_PARALLEL_DEREFERENCES, (entity) =>
    readCached(qc, entity, freshSet ? freshSet.has(entity) : true),
  );
  const rows: BaseRecord[] = [];
  const seen = new Set<string>();
  let unread = 0;
  for (const rec of read) {
    if (!rec) {
      unread += 1;
      continue;
    }
    if (seen.has(rec.id)) continue;
    seen.add(rec.id);
    rows.push(rec);
  }
  const serverIds = new Set(paged.ids.map((entity) => idFromEntityUri(entity)));
  const merged = applyPinsAndDrops(qc, vaultId, attr, parentId, rows, serverIds);
  // A short page ends the walk: the note's number is how many ids came back, not `count`.
  // Stopped at the cap: `count` may say "at least N".
  const total = paged.capped ? paged.count : paged.ids.length;
  return { rows: merged, total, capped: paged.capped, unread, cap };
}

/**
 * Re-read one find. `members` is whose record could have changed: those entity URIs, or `"all"`
 * (the default — every member this find currently shows). `[]` re-reads the find and no records.
 */
export async function invalidatePlanFind(
  qc: QueryClient,
  vaultId: string,
  attr: string,
  parentId: string,
  opts?: { members?: readonly string[] | "all"; afterStale?: () => void },
): Promise<void> {
  const qk = planFindKey(vaultId, attr, parentId);
  const scope = opts?.members ?? "all";
  const members =
    scope === "all"
      ? planFindRows(qc.getQueryData<PlanFind>(qk))
          .map((row) => row.entityUri)
          .filter((uri): uri is string => !!uri)
      : scope;
  rememberMemberScope(qc, vaultId, attr, parentId, scope);
  await staleMemberRecords(qc, members);
  opts?.afterStale?.();
  await qc.invalidateQueries({ queryKey: qk });
}

export function usePlanFind(
  vaultId: string,
  attr: string,
  parent: { id: string; entityUri?: string } | null,
  cap: number = PLAN_FIND_CAP,
) {
  const qc = useQueryClient();
  const id = parent?.id ?? "";
  const uri = parent?.entityUri ?? "";
  return useQuery({
    queryKey: planFindKey(vaultId, attr, id),
    enabled: !!vaultId && !!uri,
    retry: false,
    staleTime: 15_000,
    queryFn: () => loadPlanFind(qc, vaultId, attr, id, uri, cap),
  });
}

function seedRecord(qc: QueryClient, row: BaseRecord) {
  if (!row.entityUri) return;
  qc.setQueryData(planRecordKey(row.id, row.entityUri), row);
}

/** Show `row` on this line at once, then re-read the find. A stale re-read keeps the pin. `refresh: false` leaves the re-read to the caller. */
export function prependPlanFind(
  qc: QueryClient,
  vaultId: string,
  attr: string,
  parentId: string,
  row: BaseRecord,
  opts?: { members?: readonly string[] | "all"; refresh?: boolean },
) {
  const key = bucket(vaultId, attr, parentId);
  rememberPin(qc, key, row);
  dropsOf(qc).get(key)?.delete(row.id);
  const qk = planFindKey(vaultId, attr, parentId);
  qc.setQueryData<PlanFind>(qk, (prev) => {
    const cur = prev ?? { rows: [], total: 0, capped: false, unread: 0 };
    return { ...cur, rows: [row, ...cur.rows.filter((r) => r.id !== row.id)] };
  });
  if (opts?.refresh === false) {
    seedRecord(qc, row);
    return;
  }
  void invalidatePlanFind(qc, vaultId, attr, parentId, {
    ...(opts?.members !== undefined ? { members: opts.members } : {}),
    // The row was just read. Put it back after the stale mark so this re-read does not GET it again.
    afterStale: () => seedRecord(qc, row),
  });
}

/** Drop `id` from this line at once, then re-read. A stale re-read does not put it back. `refresh: false` leaves the re-read to the caller. */
export function dropPlanFind(
  qc: QueryClient,
  vaultId: string,
  attr: string,
  parentId: string,
  id: string,
  opts?: { members?: readonly string[] | "all"; refresh?: boolean },
) {
  const key = bucket(vaultId, attr, parentId);
  forgetPin(qc, key, id);
  const drops = dropsOf(qc);
  const dead = drops.get(key) ?? new Set<string>();
  dead.add(id);
  drops.set(key, dead);
  const qk = planFindKey(vaultId, attr, parentId);
  qc.setQueryData<PlanFind>(qk, (prev) => (prev ? { ...prev, rows: prev.rows.filter((r) => r.id !== id) } : prev));
  if (opts?.refresh === false) return;
  void invalidatePlanFind(
    qc,
    vaultId,
    attr,
    parentId,
    opts?.members !== undefined ? { members: opts.members } : undefined,
  );
}

/** A patch of one linked record (its text, its order) shown on every line that holds it. */
export function patchPlanFindRows(
  qc: QueryClient,
  vaultId: string,
  id: string,
  next: (row: BaseRecord) => BaseRecord,
) {
  qc.setQueriesData<PlanFind>({ queryKey: planFindVaultKey(vaultId) }, (prev) => {
    if (!prev?.rows.some((r) => r.id === id)) return prev;
    return { ...prev, rows: prev.rows.map((r) => (r.id === id ? next(r) : r)) };
  });
  const pins = pinsOf(qc);
  for (const [key, rows] of pins) {
    if (!key.startsWith(`${vaultId}\n`)) continue;
    if (!rows.some((r) => r.id === id)) continue;
    pins.set(key, rows.map((r) => (r.id === id ? next(r) : r)));
  }
  qc.setQueriesData<BaseRecord | null>({ queryKey: ["base", "record", id] }, (prev) => (prev ? next(prev) : prev));
}
