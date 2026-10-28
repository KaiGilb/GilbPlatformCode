// PlanTagLinksHostContext (plan-tag-links): Part of, Sub-functions, Function of Value, Solutions and the other links. 25 members.

import { createElement } from "react";
import type { PlanTagLinksCreateDialogProps, PlanTagLinksHost } from "@kaigilb/gilbplatformcode-plan-tag-links";
import { createRecord, patchRecord, readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { endRelation, memberEntityUri, writePairRelation } from "@kaigilb/gilbplatformcode-lws-relations";
import { resolveType, typeUriForVaultNamespace } from "@kaigilb/gilbplatformcode-record-types";
import { useRelations } from "@kaigilb/gilbplatformcode-plan-stakeholder-io";
import { useCreateRecord, useRecords } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import {
  applyPatch,
  dropPlanFind,
  ensureEtagUnchanged,
  invalidatePlanFind,
  invalidatePlanSearch,
  liveRow,
  prependPlanFind,
  putRecordInCaches,
  storePlanRow,
  usePlanFind,
} from "@kaigilb/gilbplatformcode-record-cache-kit";
import { cacheAccess } from "../cacheAccess";
import type { HostEnv } from "../env";

export function createPlanTagLinksHost(env: HostEnv): PlanTagLinksHost {
  const { qc } = env;
  const cache = cacheAccess(qc);
  const Dialog = env.createDialog;
  return {
    // PlanTagLinks.tsx:319
    useRecords: (vaultId) => useRecords(vaultId),
    // PlanTagLinks.tsx:908
    useRelations: (id, at) => useRelations(id, at),
    // PlanTagLinks.tsx:443
    usePlanFind: (planVault, attr, parent) => usePlanFind(planVault, attr, parent),
    // PlanTagLinks.tsx:446
    invalidatePlanFind: (planVault, attr, parentId) => invalidatePlanFind(qc, planVault, attr, parentId),
    // PlanTagLinks.tsx:409
    invalidatePlanSearch: (planVault) => invalidatePlanSearch(qc, planVault),
    // PlanTagLinks.tsx:349
    liveRow: (vaultId, id, fallback) => liveRow(qc, vaultId, id, fallback),
    // PlanTagLinks.tsx:159
    ensureEtagUnchanged: (planVault, row, sameFor) => ensureEtagUnchanged(qc, planVault, row, sameFor),
    // PlanTagLinks.tsx:170
    applyPatch: (row, patch, etag) => applyPatch(row, patch, etag),
    // PlanTagLinks.tsx:171
    storePlanRow: (planVault, row, opts) => storePlanRow(qc, planVault, row, opts),
    // PlanTagLinks.tsx:172
    setPlanRecord: cache.setRecordRead,
    // PlanTagLinks.tsx:175
    dropPlanFind: (planVault, attr, parentId, id) => dropPlanFind(qc, planVault, attr, parentId, id),
    // PlanTagLinks.tsx:176
    prependPlanFind: (planVault, attr, parentId, row) => prependPlanFind(qc, planVault, attr, parentId, row),
    // PlanTagLinks.tsx:606
    putRecordInCaches: (planVault, row, opts) => putRecordInCaches(qc, planVault, row, opts),
    // PlanTagLinks.tsx:839
    getRelations: cache.getRelations,
    // PlanTagLinks.tsx:841
    setRelations: cache.setRelations,
    // PlanTagLinks.tsx:402
    resolveType: (id) => resolveType(id),
    // PlanTagLinks.tsx:585
    typeUriForVaultNamespace: (typeName, vaultNamespace) => typeUriForVaultNamespace(typeName, vaultNamespace),
    // PlanTagLinks.tsx:593
    memberEntityUri: (idOrUri, preferredUri, vaultNamespace) => memberEntityUri(idOrUri, preferredUri, vaultNamespace),
    // PlanTagLinks.tsx:1276
    readRecord: (id, at) => readRecord(id, at),
    // PlanTagLinks.tsx:168
    patchRecord: (id, patch, at, source, precondition) => patchRecord(id, patch, at, source, precondition),
    // PlanTagLinks.tsx:585
    createRecord: (planVault, typeUri, facts, nameHint) => createRecord(planVault, typeUri, facts, nameHint),
    // PlanTagLinks.tsx:321
    useCreateRecord: (planVault) => useCreateRecord(planVault),
    // PlanTagLinks.tsx:827
    writePairRelation: (input) => writePairRelation(input),
    // PlanTagLinks.tsx:956
    endRelation: (relation, planVault) => endRelation(relation, planVault),
    // PlanTagLinks.tsx:1266: left out when the developer gave no dialog, so the line offers no create.
    ...(Dialog ? { ConnectedCreateDialog: (props: PlanTagLinksCreateDialogProps) => createElement(Dialog, props) } : {}),
  };
}
