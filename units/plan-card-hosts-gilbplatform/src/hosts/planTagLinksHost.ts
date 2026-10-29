// PlanTagLinksHostContext (plan-tag-links): Part of, Sub-functions, Function of Value, Solutions and the other links. 26 members.

import { createElement } from "react";
import type { PlanTagLinksCreateDialogProps, PlanTagLinksHost } from "@kaigilb/gilbplatformcode-plan-tag-links";
import { createRecord, patchRecord, readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { endRelation, memberEntityUri, writePairRelation } from "@kaigilb/gilbplatformcode-lws-relations";
import { resolveType, typeUriForVaultNamespace } from "@kaigilb/gilbplatformcode-record-types";
import { useRelations } from "@kaigilb/gilbplatformcode-plan-stakeholder-io";
import { useMainTagsForRows } from "@kaigilb/gilbplatformcode-main-tag";
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
    // PlanTagLinks.tsx:320
    useRecords: (vaultId) => useRecords(vaultId),
    // PlanTagLinks.tsx:492, :869
    useMainTagsForRows: (rows) => useMainTagsForRows(rows),
    // PlanTagLinks.tsx:916
    useRelations: (id, at) => useRelations(id, at),
    // PlanTagLinks.tsx:444
    usePlanFind: (planVault, attr, parent) => usePlanFind(planVault, attr, parent),
    // PlanTagLinks.tsx:447
    invalidatePlanFind: (planVault, attr, parentId) => invalidatePlanFind(qc, planVault, attr, parentId),
    // PlanTagLinks.tsx:410
    invalidatePlanSearch: (planVault) => invalidatePlanSearch(qc, planVault),
    // PlanTagLinks.tsx:350
    liveRow: (vaultId, id, fallback) => liveRow(qc, vaultId, id, fallback),
    // PlanTagLinks.tsx:160
    ensureEtagUnchanged: (planVault, row, sameFor) => ensureEtagUnchanged(qc, planVault, row, sameFor),
    // PlanTagLinks.tsx:171
    applyPatch: (row, patch, etag) => applyPatch(row, patch, etag),
    // PlanTagLinks.tsx:172
    storePlanRow: (planVault, row, opts) => storePlanRow(qc, planVault, row, opts),
    // PlanTagLinks.tsx:173
    setPlanRecord: cache.setRecordRead,
    // PlanTagLinks.tsx:176
    dropPlanFind: (planVault, attr, parentId, id) => dropPlanFind(qc, planVault, attr, parentId, id),
    // PlanTagLinks.tsx:177
    prependPlanFind: (planVault, attr, parentId, row) => prependPlanFind(qc, planVault, attr, parentId, row),
    // PlanTagLinks.tsx:609
    putRecordInCaches: (planVault, row, opts) => putRecordInCaches(qc, planVault, row, opts),
    // PlanTagLinks.tsx:843
    getRelations: cache.getRelations,
    // PlanTagLinks.tsx:845
    setRelations: cache.setRelations,
    // PlanTagLinks.tsx:403
    resolveType: (id) => resolveType(id),
    // PlanTagLinks.tsx:588
    typeUriForVaultNamespace: (typeName, vaultNamespace) => typeUriForVaultNamespace(typeName, vaultNamespace),
    // PlanTagLinks.tsx:596
    memberEntityUri: (idOrUri, preferredUri, vaultNamespace) => memberEntityUri(idOrUri, preferredUri, vaultNamespace),
    // PlanTagLinks.tsx:1284
    readRecord: (id, at) => readRecord(id, at),
    // PlanTagLinks.tsx:169
    patchRecord: (id, patch, at, source, precondition) => patchRecord(id, patch, at, source, precondition),
    // PlanTagLinks.tsx:588
    createRecord: (planVault, typeUri, facts, nameHint) => createRecord(planVault, typeUri, facts, nameHint),
    // PlanTagLinks.tsx:322
    useCreateRecord: (planVault) => useCreateRecord(planVault),
    // PlanTagLinks.tsx:831
    writePairRelation: (input) => writePairRelation(input),
    // PlanTagLinks.tsx:964
    endRelation: (relation, planVault) => endRelation(relation, planVault),
    // PlanTagLinks.tsx:1274: left out when the developer gave no dialog, so the line offers no create.
    ...(Dialog ? { ConnectedCreateDialog: (props: PlanTagLinksCreateDialogProps) => createElement(Dialog, props) } : {}),
  };
}
