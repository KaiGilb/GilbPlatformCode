// StakeholderLinesHostContext (plan-stakeholder-lines): the Stakeholder, Authority and Resource Owner lines. 28 members.
// The lines are read-only unless the host gives `renderCreateStakeholder` together with the writers, so that member is present only
// when the developer gave a dialog.

import { createElement, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CreateStakeholderProps, StakeholderLinesHost } from "@kaigilb/gilbplatformcode-plan-stakeholder-lines";
import { hasSubstitutedType, patchRecord, readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { endRelation, memberEntityUri, writePairRelation } from "@kaigilb/gilbplatformcode-lws-relations";
import {
  STAKEHOLDER_TYPE_SET_QUERY,
  endThenWriteAuthority,
  findAnyRecords,
  findStakeholderRecords,
  usePersonAuthorities,
  useRelations,
  writeAuthorityRelation,
} from "@kaigilb/gilbplatformcode-plan-stakeholder-io";
import { heldVaultIds, useRecords, type ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { applyPatch, ensureEtagUnchanged, liveRow, storePlanRow } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { cacheAccess } from "../cacheAccess";
import { useAuthorityRelationDoc, useRecordRead } from "../inline";
import type { HostEnv } from "../env";

export function createStakeholderLinesHost(env: HostEnv): StakeholderLinesHost {
  const { qc } = env;
  const cache = cacheAccess(qc);
  const Dialog = env.createDialog;
  return {
    // PlanStakeholders.tsx:128
    useRecords: (vaultId) => useRecords(vaultId),
    // PlanStakeholders.tsx:134
    useRecordRead: (ref, uri) => useRecordRead(ref, uri),
    // PlanStakeholders.tsx:226
    useRelations: (recordId, recordUri) => useRelations(recordId, recordUri),
    // PlanStakeholders.tsx:227
    useStakeholderKinds: (enabled) => useQuery({ ...STAKEHOLDER_TYPE_SET_QUERY, enabled }),
    // PlanStakeholders.tsx:624
    usePersonAuthorities: (record, vaultId) => usePersonAuthorities(record, vaultId),
    // PlanStakeholders.tsx:171
    useHeldVaults: () => {
      const shell = env.useShell();
      return useMemo(() => heldVaultIds(shell.vaults as readonly ReachableVault[]), [shell.vaults]);
    },
    // PlanStakeholders.tsx:110
    useOpenRecordInVault: () => env.openRecordInVault,
    // PlanStakeholders.tsx:534
    useRelationDoc: (relation, planVault) => useAuthorityRelationDoc(relation, planVault),
    // PlanStakeholders.tsx:241
    hasSubstitutedType: (record) => hasSubstitutedType(record),
    // PlanStakeholders.tsx:267
    getRelations: cache.getRelations,
    // PlanStakeholders.tsx:666
    getKindSet: cache.getKindSet,
    // PlanStakeholders.tsx:250
    liveRow: (planVault, id, fallback) => liveRow(qc, planVault, id, fallback),
    // PlanStakeholders.tsx:479
    readRecord: (id, at) => readRecord(id, at),
    // PlanStakeholders.tsx:266
    memberEntityUri: (idOrUri, preferredUri, vaultNamespace) => memberEntityUri(idOrUri, preferredUri, vaultNamespace),
    // PlanStakeholders.tsx:440
    findStakeholders: (vaults, names, text) => findStakeholderRecords(vaults, names, text),
    // PlanStakeholders.tsx:658
    findAnyRecords: (vaults, text) => findAnyRecords(vaults, text),
    // PlanStakeholders.tsx:88
    ensureEtagUnchanged: (planVault, row, sameFor) => ensureEtagUnchanged(qc, planVault, row, sameFor),
    // PlanStakeholders.tsx:104
    applyPatch: (row, patch, etag, opts) => applyPatch(row, patch, etag, opts),
    // PlanStakeholders.tsx:105
    storePlanRow: (planVault, row, opts) => storePlanRow(qc, planVault, row, opts),
    // PlanStakeholders.tsx:106
    setRecordRead: cache.setRecordRead,
    // PlanStakeholders.tsx:303
    setRelations: cache.setRelations,
    // PlanStakeholders.tsx:195
    invalidateSearch: cache.invalidateFilters,
    // PlanStakeholders.tsx:283
    // The member answers `uri` as absent where the client answers it as null; the line reads `written.uri ?? full`, so the two are the same.
    writePairRelation: async (input) => {
      const written = await writePairRelation(input);
      return written.uri == null ? { id: written.id } : { id: written.id, uri: written.uri };
    },
    // PlanStakeholders.tsx:309
    endRelation: (relation, vaultNamespace) => endRelation(relation, vaultNamespace),
    // PlanStakeholders.tsx:102
    patchRecord: (id, patch, at, source, precondition) => patchRecord(id, patch, at, source, precondition),
    // PlanStakeholders.tsx:738
    writeAuthorityRelation: (input) => writeAuthorityRelation(input),
    // PlanStakeholders.tsx:738
    endThenWriteAuthority: (endId, input) => endThenWriteAuthority(endId, input),
    // PlanStakeholders.tsx:467
    ...(Dialog ? { renderCreateStakeholder: (props: CreateStakeholderProps) => createElement(Dialog, props) } : {}),
  };
}
