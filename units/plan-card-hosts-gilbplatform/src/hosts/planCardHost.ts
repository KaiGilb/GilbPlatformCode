// PlanCardHostContext (plan-card): the card's own reads and writes. 30 members.

import { createElement } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PlanCardHost } from "@kaigilb/gilbplatformcode-plan-card";
import { readRecord, patchRecord, RecordConflictError } from "@kaigilb/gilbplatformcode-lws-records";
import { memberEntityUri } from "@kaigilb/gilbplatformcode-lws-relations";
import { useRelations } from "@kaigilb/gilbplatformcode-plan-stakeholder-io";
import {
  STAKEHOLDER_TYPE_SET_QUERY,
  findStakeholderRecords,
  migratedAuthorityRelation,
  usePersonAuthorities,
  writeAuthorityRelation,
} from "@kaigilb/gilbplatformcode-plan-stakeholder-io";
import { heldVaultIds, useRetypeRecord, type ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { applyPatch, ensureEtagUnchanged, liveRow, reconcileAfterConflict, storePlanRow, usePlanFind } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { blankQueryReach, searchLiveTerms } from "@kaigilb/gilbplatformcode-ontology-reads";
import { cacheAccess } from "../cacheAccess";
import type { HostEnv } from "../env";

export function createPlanCardHost(env: HostEnv): PlanCardHost {
  const { qc } = env;
  const cache = cacheAccess(qc);
  return {
    // PlanFunctionForm.tsx:480
    useSelfSource: env.useSelfSource,
    // PlanFunctionForm.tsx:488
    useRelations: (recordId, recordUri) => useRelations(recordId, recordUri),
    // PlanFunctionForm.tsx:491
    usePlanFind: (vaultId, attr, parent, cap) => usePlanFind(vaultId, attr, parent, cap),
    // PlanFunctionForm.tsx:566
    usePersonAuthorities: (record, vaultId) => usePersonAuthorities(record, vaultId),
    // PlanFunctionForm.tsx:545
    useRetypeRecord: (vaultId) => useRetypeRecord(vaultId),
    // PersonAuthoritySearch.tsx:26
    useShell: env.useShell,
    // PersonAuthoritySearch.tsx:27
    heldVaultIds: (vaults) => heldVaultIds(vaults as readonly ReachableVault[]),
    // PersonAuthoritySearch.tsx:28
    useStakeholderKindSet: () => useQuery(STAKEHOLDER_TYPE_SET_QUERY),
    // PersonAuthoritySearch.tsx:30
    findStakeholderRecords: (vaultIds, typeNames, text) => findStakeholderRecords(vaultIds, typeNames, text),
    // TypeChooser.tsx:151
    searchTypes: searchLiveTerms,
    // TypeChooser.tsx:176
    blankReach: blankQueryReach(),
    // PlanTypeField.tsx:90
    ...(env.openOntologyConcept ? { openOntologyConcept: env.openOntologyConcept } : {}),
    // TypeChooser.tsx:364
    ...(env.renderTypeIcon ? { renderTypeIcon: env.renderTypeIcon } : {}),
    // PlanFunctionForm.tsx:624
    getRelations: cache.getRelations,
    // PlanFunctionForm.tsx:846
    getKindSet: cache.getKindSet,
    // PlanFunctionForm.tsx:583
    liveRow: (vaultId, id, fallback) => liveRow(qc, vaultId, id, fallback),
    // PlanFunctionForm.tsx:845
    readRecord: (id, at) => readRecord(id, at),
    // PlanFunctionForm.tsx:851
    memberEntityUri: (idOrUri, preferredUri, vaultNamespace) => memberEntityUri(idOrUri, preferredUri, vaultNamespace),
    // PlanFunctionForm.tsx:584
    ensureEtagUnchanged: (vaultId, row, sameFor) => ensureEtagUnchanged(qc, vaultId, row, sameFor),
    // PlanFunctionForm.tsx:642
    applyPatch: (row, patch, etag, opts) => applyPatch(row, patch, etag, opts),
    // PlanFunctionForm.tsx:654
    isConflict: (e) => e instanceof RecordConflictError,
    // PlanFunctionForm.tsx:655
    reconcileAfterConflict: (vaultId, row) => reconcileAfterConflict(qc, vaultId, row),
    // PlanFunctionForm.tsx:643
    storePlanRow: (vaultId, row, opts) => storePlanRow(qc, vaultId, row, opts),
    // PlanFunctionForm.tsx:645
    setRecordRead: cache.setRecordRead,
    // PlanFunctionForm.tsx:632
    setRelations: cache.setRelations,
    // PlanFunctionForm.tsx:1468
    invalidateAuthoritySearch: cache.invalidateAuthoritySearch,
    // PlanFunctionForm.tsx:640
    patchRecord: (id, patch, at, source, precondition) => patchRecord(id, patch, at, source, precondition),
    // PlanFunctionForm.tsx:625
    migratedAuthorityRelation: (row, vaultId, relations) => migratedAuthorityRelation(row, vaultId, relations),
    // PlanFunctionForm.tsx:869
    writeAuthorityRelation: (input) => writeAuthorityRelation(input),
    // PlanFunctionForm.tsx:1459: absent a dialog, nothing is drawn and the person lines stay read-only.
    renderCreateStakeholder: (props) => {
      const Dialog = env.createDialog;
      return Dialog ? createElement(Dialog, props) : null;
    },
  };
}
