// DescriptionPartsHostContext (description-parts-view): the Description (Ambition Level) parts. 28 members and the 4 of LevelHost.

import { useQueries } from "@tanstack/react-query";
import type { DescriptionPartsHost } from "@kaigilb/gilbplatformcode-description-parts-view";
import { createRecord, patchRecord, readRecord, RecordConflictError } from "@kaigilb/gilbplatformcode-lws-records";
import { typeUriForVaultNamespace } from "@kaigilb/gilbplatformcode-record-types";
import { rememberRecord } from "@kaigilb/gilbplatformcode-working-set-store";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { markFreshlyCreated, useDeleteRecord, useRecords } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import {
  applyPinsAndDrops,
  dropPlanFind,
  ensureEtagUnchanged,
  invalidatePlanFind,
  invalidatePlanSearch,
  liveRow,
  loadPlanFind,
  pageAttributeIds,
  patchPlanFindRows,
  planFindKey,
  prependPlanFind,
  readCached,
  reconcileAfterConflict,
  storePlanRow,
  usePlanFind,
} from "@kaigilb/gilbplatformcode-record-cache-kit";
import { cacheAccess } from "../cacheAccess";
import { tagUsedInVault } from "../inline";
import type { HostEnv } from "../env";

export function createDescriptionPartsHost(env: HostEnv): DescriptionPartsHost {
  const { qc } = env;
  const cache = cacheAccess(qc);
  return {
    // ---- LevelHost (lib/base/planLevelRead.ts)
    // planLevelRead.ts:45
    pageChildIds: (planVault, parentUri, opts) =>
      pageAttributeIds("a:partOf", parentUri, vaultOriginOf(planVault), { cap: opts.cap, qc }),
    // planLevelRead.ts:53
    markStale: cache.markStale,
    // planLevelRead.ts:58
    readMember: (entityUri, fresh) => readCached(qc, entityUri, fresh),
    // planLevelRead.ts:76
    applyPinsAndDrops: (planVault, attr, parentId, rows, serverIds) => applyPinsAndDrops(qc, planVault, attr, parentId, rows, serverIds),
    // ---- reads (hooks)
    // usePlanParts.ts:90
    useRecords: (vaultId) => useRecords(vaultId),
    // usePlanParts.ts:91
    usePlanFind: (vaultId, attr, parent, cap) => usePlanFind(vaultId, attr, parent, cap),
    // usePlanParts.ts:103
    useSubFinds: (vaultId, attr, parents) =>
      useQueries({
        queries: parents.map((p) => ({
          queryKey: planFindKey(vaultId, attr, p.id),
          enabled: !!p.uri,
          retry: false as const,
          staleTime: 15_000,
          queryFn: () => loadPlanFind(qc, vaultId, attr, p.id, p.uri),
        })),
      }),
    // PlanDescriptionParts.tsx:242
    useSelfSource: env.useSelfSource,
    // ---- click-time getters
    // PlanDescriptionParts.tsx:377
    cachedRecords: cache.cachedRecords,
    // PlanDescriptionParts.tsx:488
    getFind: cache.getFind,
    // PlanDescriptionParts.tsx:997
    getFinds: cache.getFinds,
    // PlanDescriptionParts.tsx:527
    liveRow: (vaultId, id, fallback) => liveRow(qc, vaultId, id, fallback),
    // PlanDescriptionParts.tsx:450
    readRecord: (id, at) => readRecord(id, at),
    // PlanDescriptionParts.tsx:706
    tagUsedInVault: (vaultId, tag) => tagUsedInVault(vaultId, tag),
    // PlanDescriptionParts.tsx:530
    ensureEtagUnchanged: (vaultId, row, sameFor) => ensureEtagUnchanged(qc, vaultId, row, sameFor),
    // PlanDescriptionParts.tsx:564
    reconcileAfterConflict: (vaultId, row) => reconcileAfterConflict(qc, vaultId, row),
    // PlanDescriptionParts.tsx:563
    isConflict: (e) => e instanceof RecordConflictError,
    // PlanDescriptionParts.tsx:437
    typeUriForVaultNamespace: (typeName, vaultNamespace) => typeUriForVaultNamespace(typeName, vaultNamespace),
    // ---- cache writes
    // PlanDescriptionParts.tsx:478
    storePlanRow: (vaultId, row, opts) => storePlanRow(qc, vaultId, row, opts),
    // PlanDescriptionParts.tsx:559
    setRecordRead: cache.setRecordRead,
    // PlanDescriptionParts.tsx:479
    invalidatePlanSearch: (vaultId) => invalidatePlanSearch(qc, vaultId),
    // PlanDescriptionParts.tsx:480
    prependPlanFind: (vaultId, attr, parentId, row, opts) => prependPlanFind(qc, vaultId, attr, parentId, row, opts),
    // PlanDescriptionParts.tsx:1056
    dropPlanFind: (vaultId, attr, parentId, id, opts) => dropPlanFind(qc, vaultId, attr, parentId, id, opts),
    // PlanDescriptionParts.tsx:538
    patchPlanFindRows: (vaultId, id, next) => patchPlanFindRows(qc, vaultId, id, next),
    // PlanDescriptionParts.tsx:542
    invalidatePlanFind: (vaultId, attr, parentId, opts) => invalidatePlanFind(qc, vaultId, attr, parentId, opts),
    // PlanDescriptionParts.tsx:489
    setFind: cache.setFind,
    // PlanDescriptionParts.tsx:452
    rememberRecord: (ref) => rememberRecord(ref),
    // PlanDescriptionParts.tsx:453
    markFreshlyCreated: (id) => markFreshlyCreated(id),
    // PlanDescriptionParts.tsx:1856: absent a help button, nothing is drawn.
    HelpButton: env.HelpButton ?? (() => null),
    // ---- writers
    // PlanDescriptionParts.tsx:448
    createRecord: (vaultNamespace, typeUri, facts, nameHint) => createRecord(vaultNamespace, typeUri, facts, nameHint),
    // PlanDescriptionParts.tsx:554
    patchRecord: (id, patch, at, source, precondition) => patchRecord(id, patch, at, source, precondition),
    // PlanDescriptionParts.tsx:248
    useDeleteRecord: (vaultId) => useDeleteRecord(vaultId),
  };
}
