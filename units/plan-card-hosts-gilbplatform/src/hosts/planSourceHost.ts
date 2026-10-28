// PlanSourceHostContext (plan-source): the source control under every line. 9 members.

import { createElement, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PlanSourceCreateDialogProps, PlanSourceHost } from "@kaigilb/gilbplatformcode-plan-source";
import { readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { memberEntityUri } from "@kaigilb/gilbplatformcode-lws-relations";
import { STAKEHOLDER_TYPE_SET_QUERY, findStakeholderRecords } from "@kaigilb/gilbplatformcode-plan-stakeholder-io";
import { heldVaultIds, matchWorkingSetQuery, useVaultFilesMulti, type ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import type { HostEnv } from "../env";

export function createPlanSourceHost(env: HostEnv): PlanSourceHost {
  const Dialog = env.createDialog;
  // PlanSource.tsx:210: absent a dialog, "+ New stakeholder" opens nothing.
  const ConnectedCreateDialog: ComponentType<PlanSourceCreateDialogProps> = Dialog
    ? (props) => createElement(Dialog, props)
    : () => null;
  return {
    // PlanSource.tsx:64, :105
    useShell: env.useShell,
    // PlanSource.tsx:106
    heldVaultIds: (vaults) => heldVaultIds(vaults as readonly ReachableVault[]),
    // PlanSource.tsx:107
    useStakeholderTypes: (enabled) => useQuery({ ...STAKEHOLDER_TYPE_SET_QUERY, enabled }),
    // PlanSource.tsx:109
    useVaultFilesMulti: (vaultIds, lifecycle) => useVaultFilesMulti(vaultIds, lifecycle),
    // PlanSource.tsx:55
    matchWorkingSetQuery: (items, query) => matchWorkingSetQuery(items, query),
    // PlanSource.tsx:115
    findStakeholderRecords: (vaultIds, typeNames, text) => findStakeholderRecords(vaultIds, typeNames, text),
    // PlanSource.tsx:221
    readRecord: (id, at) => readRecord(id, at),
    // PlanSource.tsx:222
    memberEntityUri: (idOrUri, preferredUri, vaultNamespace) => memberEntityUri(idOrUri, preferredUri, vaultNamespace),
    // PlanSource.tsx:210
    ConnectedCreateDialog,
  };
}
