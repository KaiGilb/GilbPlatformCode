// A fake ValueWriteHost for the tests, built the way the app's own stack is built: a query client holds the finds by `a:partOf` and the
// reads of records; a find cache keeps the rows pinned by a create and the rows dropped by a delete (so a re-read that is late does
// not undo them) and the members a re-read must read fresh; a row cache keeps the screen's list; and the in-memory vault of
// test/server.ts answers the reads, the writes and the finds. One call to makeBrowser is one person's browser: its own caches,
// the shared vault. Every member is a vi.fn that also logs its call, in order, in `calls` ("name json-arguments").
import { vi, type Mock } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQueries } from "@tanstack/react-query";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { asGrid } from "@kaigilb/gilbplatformcode-description-parts-model";
import {
  ValueWriteHostContext,
  type PlanFind,
  type ValueWriteHost,
} from "@kaigilb/gilbplatformcode-value-card-write";
import { planFindRows } from "../src/planFind";
import { ConflictError, ForbiddenError, entityUriOf, type Server } from "./server";

export type FakeHost = { [K in keyof ValueWriteHost]: Mock<ValueWriteHost[K]> };

const originOf = (at: string | null) => {
  if (!at) return "base";
  try {
    return new URL(at).origin;
  } catch {
    return at;
  }
};
const idFromEntityUri = (uri: string) => uri.slice(uri.lastIndexOf("/") + 1);

/** One cache entry per (vault, attribute, record). */
export const planFindKey = (vaultId: string, attr: string, recordId: string) => ["plan-find", vaultId, attr, recordId] as const;
/** The record-by-id cache. */
export const planRecordKey = (id: string, at: string | null) => ["base", "record", id, originOf(at)] as const;
const RECORD_QUERY_HEAD = ["base", "record"] as const;

const stamped = (row: BaseRecord) => {
  const at = (row as GridRecord).updatedAt;
  return typeof at === "number" ? at : 0;
};
/** Greater `updatedAt` wins. On a tie, a non-null ETag beats a null one. */
const newer = (candidate: BaseRecord, current: BaseRecord) => {
  const at = stamped(candidate);
  const bt = stamped(current);
  if (at !== bt) return at > bt;
  return !!candidate.etag && !current.etag;
};

export function makeBrowser(server: Server) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const calls: string[] = [];
  const log = (name: string, ...args: unknown[]) => calls.push(`${name} ${JSON.stringify(args)}`);

  // ---- the find cache: pins, drops and the members a re-read reads fresh ----
  const pins = new Map<string, BaseRecord[]>();
  const drops = new Map<string, Set<string>>();
  const scopes = new Map<string, readonly string[] | "all">();
  const bucket = (vaultId: string, attr: string, recordId: string) => `${vaultId}\n${attr}\n${recordId}`;

  function rememberPin(key: string, row: BaseRecord) {
    const cur = pins.get(key) ?? [];
    pins.set(key, [row, ...cur.filter((r) => r.id !== row.id)]);
  }
  function forgetPin(key: string, id: string) {
    const cur = pins.get(key);
    if (!cur) return;
    const next = cur.filter((r) => r.id !== id);
    if (next.length === 0) pins.delete(key);
    else pins.set(key, next);
  }
  function applyDrops(key: string, merged: BaseRecord[], serverIds: ReadonlySet<string>): BaseRecord[] {
    const dead = drops.get(key);
    if (!dead) return merged;
    for (const id of [...dead]) {
      if (!serverIds.has(id)) dead.delete(id);
    }
    if (dead.size === 0) drops.delete(key);
    return merged.filter((r) => !dead.has(r.id));
  }
  /** Pins first, then the server rows, minus a drop the server still returns. */
  function applyPinsAndDrops(vaultId: string, attr: string, parentId: string, rows: BaseRecord[], serverIds: ReadonlySet<string>): BaseRecord[] {
    const key = bucket(vaultId, attr, parentId);
    const seen = new Set(rows.map((r) => r.id));
    const extras = (pins.get(key) ?? []).filter((r) => !seen.has(r.id));
    return applyDrops(key, [...extras, ...rows], serverIds);
  }
  async function staleMemberRecords(entityUris: readonly string[]) {
    await Promise.all(
      entityUris.map((entity) => qc.invalidateQueries({ queryKey: planRecordKey(idFromEntityUri(entity), entity), refetchType: "none" })),
    );
  }
  async function readCached(entityUri: string, fresh: boolean): Promise<BaseRecord | null> {
    const id = idFromEntityUri(entityUri);
    const key = planRecordKey(id, entityUri);
    try {
      const read = () => host.readRecord(id, entityUri);
      const row = fresh
        ? await qc.fetchQuery({ queryKey: key, queryFn: read, staleTime: 15_000 })
        : await qc.ensureQueryData({ queryKey: key, queryFn: read });
      return row ?? null;
    } catch {
      return null;
    }
  }
  /** A find against the in-memory vault: the records that are a part of `entityUri`, each read, then the pins and drops applied. */
  async function loadPlanFind(vaultId: string, attr: string, parentId: string, entityUri: string): Promise<PlanFind> {
    const findKey = planFindKey(vaultId, attr, parentId);
    const findInvalidated = qc.getQueryState(findKey)?.isInvalidated === true;
    const bk = bucket(vaultId, attr, parentId);
    const scope = findInvalidated ? scopes.get(bk) : undefined;
    if (findInvalidated) scopes.delete(bk);
    const ids = server.partsOf(entityUri);
    const freshAll = !findInvalidated || scope === undefined || scope === "all";
    if (findInvalidated && freshAll) await staleMemberRecords(ids);
    const freshSet = !freshAll && Array.isArray(scope) ? new Set(scope) : null;
    const read = await Promise.all(ids.map((entity) => readCached(entity, freshSet ? freshSet.has(entity) : true)));
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
    const serverIds = new Set(ids.map((entity) => idFromEntityUri(entity)));
    const merged = applyPinsAndDrops(vaultId, attr, parentId, rows, serverIds);
    return { rows: merged, total: ids.length, capped: false, unread, cap: 300 };
  }
  async function invalidatePlanFind(
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
    scopes.set(bucket(vaultId, attr, parentId), scope);
    await staleMemberRecords(members);
    opts?.afterStale?.();
    await qc.invalidateQueries({ queryKey: qk });
  }
  const seedRecord = (row: BaseRecord) => {
    if (!row.entityUri) return;
    qc.setQueryData(planRecordKey(row.id, row.entityUri), row);
  };
  function prependPlanFind(
    vaultId: string,
    attr: string,
    parentId: string,
    row: BaseRecord,
    opts?: { members?: readonly string[] | "all"; refresh?: boolean },
  ) {
    const key = bucket(vaultId, attr, parentId);
    rememberPin(key, row);
    drops.get(key)?.delete(row.id);
    qc.setQueryData<PlanFind>(planFindKey(vaultId, attr, parentId), (prev) => {
      const cur = prev ?? { rows: [], total: 0, capped: false, unread: 0 };
      return { ...cur, rows: [row, ...cur.rows.filter((r) => r.id !== row.id)] };
    });
    if (opts?.refresh === false) {
      seedRecord(row);
      return;
    }
    void invalidatePlanFind(vaultId, attr, parentId, {
      ...(opts?.members !== undefined ? { members: opts.members } : {}),
      afterStale: () => seedRecord(row),
    });
  }
  function dropPlanFind(
    vaultId: string,
    attr: string,
    parentId: string,
    id: string,
    opts?: { members?: readonly string[] | "all"; refresh?: boolean },
  ) {
    const key = bucket(vaultId, attr, parentId);
    forgetPin(key, id);
    const dead = drops.get(key) ?? new Set<string>();
    dead.add(id);
    drops.set(key, dead);
    qc.setQueryData<PlanFind>(planFindKey(vaultId, attr, parentId), (prev) => (prev ? { ...prev, rows: prev.rows.filter((r) => r.id !== id) } : prev));
    if (opts?.refresh === false) return;
    void invalidatePlanFind(vaultId, attr, parentId, opts?.members !== undefined ? { members: opts.members } : undefined);
  }
  function patchPlanFindRows(vaultId: string, id: string, next: (row: BaseRecord) => BaseRecord) {
    qc.setQueriesData<PlanFind>({ queryKey: ["plan-find", vaultId] }, (prev) => {
      if (!prev?.rows.some((r) => r.id === id)) return prev;
      return { ...prev, rows: prev.rows.map((r) => (r.id === id ? next(r) : r)) };
    });
    for (const [key, rows] of pins) {
      if (!key.startsWith(`${vaultId}\n`)) continue;
      if (!rows.some((r) => r.id === id)) continue;
      pins.set(key, rows.map((r) => (r.id === id ? next(r) : r)));
    }
  }

  // ---- the row cache: the screen's lists and the reads of records ----
  const lists = new Map<string, GridRecord[]>();
  function setRecordReads(id: string, next: (prev: BaseRecord) => BaseRecord) {
    qc.setQueriesData<BaseRecord | null>({ queryKey: [...RECORD_QUERY_HEAD, id] }, (prev) => (prev ? next(prev) : prev));
  }
  function putRecordInCaches(vaultId: string, row: BaseRecord, opts?: { insert?: boolean }) {
    const asGridRow: GridRecord = { updatedAt: Date.now(), ...row };
    if (opts?.insert === true) {
      const list = lists.get(vaultId) ?? [];
      const i = list.findIndex((r) => r.id === row.id);
      if (i >= 0) {
        const copy = list.slice();
        copy[i] = { ...list[i]!, ...asGridRow };
        lists.set(vaultId, copy);
      } else lists.set(vaultId, [asGridRow, ...list]);
    } else {
      for (const [held, list] of lists) {
        const i = list.findIndex((r) => r.id === row.id);
        if (i < 0) continue;
        const copy = list.slice();
        copy[i] = { ...list[i]!, ...asGridRow };
        lists.set(held, copy);
      }
    }
    setRecordReads(row.id, () => row);
  }
  function recordRead(id: string, at: string | null): BaseRecord | undefined {
    const direct = qc.getQueryData<BaseRecord>(planRecordKey(id, at));
    if (direct) return direct;
    for (const [, row] of qc.getQueriesData<BaseRecord | null>({ queryKey: [...RECORD_QUERY_HEAD, id] })) {
      if (row) return row;
    }
    return undefined;
  }
  function liveRow(vaultId: string, id: string, fallback: BaseRecord): GridRecord {
    const listRow = (lists.get(vaultId) ?? []).find((r) => r.id === id);
    const cached = recordRead(id, fallback.entityUri ?? null);
    if (cached?.etag && listRow?.etag && cached.etag !== listRow.etag) return asGrid(cached);
    let winner: BaseRecord = fallback;
    if (cached && !newer(winner, cached)) winner = cached;
    if (listRow && !newer(winner, listRow)) winner = listRow;
    if (listRow && winner !== listRow && newer(winner, listRow)) putRecordInCaches(vaultId, asGrid(winner));
    return asGrid(winner);
  }
  async function ensureEtag(vaultId: string, row: GridRecord): Promise<GridRecord | null> {
    if (row.etag) return row;
    const fresh = (await host.readRecord(row.id, row.entityUri ?? null).catch(() => null)) as BaseRecord | null;
    if (!fresh?.etag) return null;
    const grid = asGrid(fresh);
    putRecordInCaches(vaultId, grid);
    if (grid.entityUri) qc.setQueryData(planRecordKey(grid.id, grid.entityUri), grid);
    return grid;
  }
  async function refreshRecordInCaches(vaultId: string, record: { id: string; entityUri: string | null }): Promise<BaseRecord | null> {
    const fresh = (await host.readRecord(record.id, record.entityUri)) as BaseRecord | null;
    if (!fresh) return null;
    putRecordInCaches(vaultId, fresh, { insert: true });
    return fresh;
  }

  // ---- the host ----
  const remembered: { id: string; vaultId: string; typeUri: string; updatedAt: number }[] = [];
  const fresh: string[] = [];
  const searchInvalidated: string[] = [];
  const deleteMutation = {
    mutateAsync: async ({ id, entityUri, ifMatch }: { id: string; entityUri: string | null; ifMatch?: string | null }) => {
      log("delete", id, entityUri, ifMatch ?? null);
      if (ifMatch) await server.del(id, entityUri, { ifMatch });
      else await server.del(id, entityUri);
    },
  };

  const host: FakeHost = {
    createRecord: vi.fn(async (vault, typeUri, facts, nameHint) => {
      log("createRecord", vault, typeUri, facts, nameHint);
      return server.create(vault, typeUri, facts as Record<string, unknown>);
    }),
    readRecord: vi.fn(async (id, at) => {
      log("readRecord", id, at);
      return (await server.read(id, at)) as unknown as BaseRecord | null;
    }),
    patchRecord: vi.fn(async (id, patch, at, source, precondition) => {
      log("patchRecord", id, patch, at, source ? "source" : "no-source", precondition);
      return server.patch(id, patch, precondition);
    }),
    useDeleteRecord: vi.fn(() => deleteMutation),
    isConflict: vi.fn((e) => e instanceof ConflictError),
    isForbidden: vi.fn((e) => e instanceof ForbiddenError),
    cachedPlanFind: vi.fn((vault, attr, parentId) => qc.getQueryData<PlanFind>(planFindKey(vault, attr, parentId))),
    fetchPlanFind: vi.fn((vault, attr, parentId, parentUri, opts) => {
      log("fetchPlanFind", vault, attr, parentId, parentUri, opts);
      return qc.fetchQuery({
        queryKey: planFindKey(vault, attr, parentId),
        queryFn: () => loadPlanFind(vault, attr, parentId, parentUri),
        staleTime: opts.staleTime,
      });
    }),
    usePlanFinds: vi.fn((vault, attr, parents) =>
      useQueries({
        queries: parents.map((p) => ({
          queryKey: planFindKey(vault, attr, p.id),
          enabled: p.enabled,
          retry: false,
          staleTime: 15_000,
          queryFn: () => loadPlanFind(vault, attr, p.id, p.entityUri ?? ""),
        })),
      }),
    ),
    prependPlanFind: vi.fn((vault, attr, parentId, row, opts) => {
      log("prependPlanFind", vault, attr, parentId, row.id, opts);
      prependPlanFind(vault, attr, parentId, row, opts);
    }),
    dropPlanFind: vi.fn((vault, attr, parentId, id, opts) => {
      log("dropPlanFind", vault, attr, parentId, id, opts);
      dropPlanFind(vault, attr, parentId, id, opts);
    }),
    patchPlanFindRows: vi.fn((vault, id, next) => {
      log("patchPlanFindRows", vault, id);
      patchPlanFindRows(vault, id, next);
    }),
    invalidatePlanFind: vi.fn((vault, attr, parentId, opts) => {
      log("invalidatePlanFind", vault, attr, parentId, opts);
      return invalidatePlanFind(vault, attr, parentId, opts);
    }),
    liveRow: vi.fn((vault, id, fallback) => liveRow(vault, id, fallback)),
    ensureEtagUnchanged: vi.fn(async (vault, row, sameFor) => {
      log("ensureEtagUnchanged", vault, row.id);
      if (row.etag) return { row };
      const read = await ensureEtag(vault, row);
      if (!read?.etag) return { unreadable: true as const };
      if (!sameFor(read)) return { conflict: true as const };
      return { row: read };
    }),
    reconcileAfterConflict: vi.fn(async (vault, row) => {
      log("reconcileAfterConflict", vault, row.id);
      const read = await refreshRecordInCaches(vault, { id: row.id, entityUri: row.entityUri ?? null });
      if (read?.entityUri) qc.setQueryData(planRecordKey(read.id, read.entityUri), read);
      return read;
    }),
    storePlanRow: vi.fn((vault, row, opts) => {
      log("storePlanRow", vault, row.id, opts);
      putRecordInCaches(vault, row, opts);
    }),
    setPlanRecord: vi.fn((id, at, row) => {
      log("setPlanRecord", id, at, row.id);
      qc.setQueryData(planRecordKey(id, at), row);
    }),
    invalidatePlanSearch: vi.fn((vault) => {
      log("invalidatePlanSearch", vault);
      searchInvalidated.push(vault);
    }),
    rememberRecord: vi.fn(async (ref) => {
      log("rememberRecord", ref.id, ref.vaultId, ref.typeUri);
      remembered.push(ref);
    }),
    markFreshlyCreated: vi.fn((id) => {
      log("markFreshlyCreated", id);
      fresh.push(id);
    }),
    typeUriForVaultNamespace: vi.fn((typeName) => {
      const bare = typeName.replace(/^t:/, "").trim();
      return `t:${bare}`;
    }),
  };

  function Frame({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <ValueWriteHostContext.Provider value={host}>{children}</ValueWriteHostContext.Provider>
      </QueryClientProvider>
    );
  }

  return { qc, host, calls, log, Frame, lists, remembered, fresh, searchInvalidated, pins, drops, deleteMutation };
}

export type Browser = ReturnType<typeof makeBrowser>;

export { entityUriOf };
