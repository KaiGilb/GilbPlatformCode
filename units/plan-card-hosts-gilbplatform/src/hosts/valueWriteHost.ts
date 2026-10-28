// ValueWriteHostContext (value-card-write): the Value's levels, qualifiers, meters and Scale. 22 members.

import { useQueries } from "@tanstack/react-query";
import type { ValueWriteHost } from "@kaigilb/gilbplatformcode-value-card-write";
import { createRecord, patchRecord, readRecord, RecordConflictError, RecordForbiddenError } from "@kaigilb/gilbplatformcode-lws-records";
import { typeUriForVaultNamespace } from "@kaigilb/gilbplatformcode-record-types";
import { rememberRecord } from "@kaigilb/gilbplatformcode-working-set-store";
import { markFreshlyCreated, useDeleteRecord } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import {
  dropPlanFind,
  ensureEtagUnchanged,
  invalidatePlanFind,
  invalidatePlanSearch,
  liveRow,
  loadPlanFind,
  patchPlanFindRows,
  planFindKey,
  prependPlanFind,
  reconcileAfterConflict,
  storePlanRow,
} from "@kaigilb/gilbplatformcode-record-cache-kit";
import { cacheAccess } from "../cacheAccess";
import type { HostEnv } from "../env";

export function createValueWriteHost(env: HostEnv): ValueWriteHost {
  const { qc } = env;
  const cache = cacheAccess(qc);
  return {
    // valueChildRecords.ts:131
    createRecord: (vaultNamespace, typeUri, facts, nameHint) => createRecord(vaultNamespace, typeUri, facts, nameHint),
    // valueChildRecords.ts:137
    readRecord: (id, at) => readRecord(id, at),
    // valueChildRecords.ts:214
    patchRecord: (id, patch, at, source, precondition) => patchRecord(id, patch, at, source, precondition),
    // useValueChildren.ts:46
    useDeleteRecord: (vaultId) => useDeleteRecord(vaultId),
    // valueChildRecords.ts:220
    isConflict: (e) => e instanceof RecordConflictError,
    // useValueScale.ts:153
    isForbidden: (e) => e instanceof RecordForbiddenError,
    // valueChildRecords.ts:102
    cachedPlanFind: cache.getFind,
    // valueChildRecords.ts:343-347 (staleTime 0), useValueQualifiers.ts:53 (15000)
    fetchPlanFind: (planVault, attr, parentId, parentUri, opts) =>
      qc.fetchQuery({
        queryKey: planFindKey(planVault, attr, parentId),
        queryFn: () => loadPlanFind(qc, planVault, attr, parentId, parentUri),
        staleTime: opts.staleTime,
      }),
    // useValueMeters.ts:52-60, useValueQualifiers.ts:121-129
    usePlanFinds: (planVault, attr, parents) =>
      useQueries({
        queries: parents.map((p) => ({
          queryKey: planFindKey(planVault, attr, p.id),
          enabled: p.enabled,
          retry: false as const,
          staleTime: 15_000,
          queryFn: () => loadPlanFind(qc, planVault, attr, p.id, p.entityUri ?? ""),
        })),
      }),
    // valueChildRecords.ts:160
    prependPlanFind: (planVault, attr, parentId, row, opts) => prependPlanFind(qc, planVault, attr, parentId, row, opts),
    // valueChildRecords.ts:248
    dropPlanFind: (planVault, attr, parentId, id, opts) => dropPlanFind(qc, planVault, attr, parentId, id, opts),
    // valueChildRecords.ts:223
    patchPlanFindRows: (planVault, id, next) => patchPlanFindRows(qc, planVault, id, next),
    // valueChildRecords.ts:192
    invalidatePlanFind: (planVault, attr, parentId, opts) => invalidatePlanFind(qc, planVault, attr, parentId, opts),
    // valueChildRecords.ts:182
    liveRow: (planVault, id, fallback) => liveRow(qc, planVault, id, fallback),
    // valueChildRecords.ts:186
    ensureEtagUnchanged: (planVault, row, sameFor) => ensureEtagUnchanged(qc, planVault, row, sameFor),
    // valueChildRecords.ts:222
    reconcileAfterConflict: (planVault, row) => reconcileAfterConflict(qc, planVault, row),
    // valueChildRecords.ts:158
    storePlanRow: (planVault, row, opts) => storePlanRow(qc, planVault, row, opts),
    // valueChildRecords.ts:236
    setPlanRecord: cache.setRecordRead,
    // valueChildRecords.ts:159
    invalidatePlanSearch: (planVault) => invalidatePlanSearch(qc, planVault),
    // valueChildRecords.ts:139
    rememberRecord: (ref) => rememberRecord(ref),
    // valueChildRecords.ts:140
    markFreshlyCreated: (id) => markFreshlyCreated(id),
    // valueChildRecords.ts:119
    typeUriForVaultNamespace: (typeName, vaultNamespace) => typeUriForVaultNamespace(typeName, vaultNamespace),
  };
}
