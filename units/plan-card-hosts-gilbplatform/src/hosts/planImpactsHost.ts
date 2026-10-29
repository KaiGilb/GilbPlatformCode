// PlanImpactsHostContext (plan-impacts): the Impacts line. 13 members.

import type { PlanImpactsHost } from "@kaigilb/gilbplatformcode-plan-impacts";
import { resolveType } from "@kaigilb/gilbplatformcode-record-types";
import { endRelation, writePairRelation } from "@kaigilb/gilbplatformcode-lws-relations";
import { useRelations } from "@kaigilb/gilbplatformcode-plan-stakeholder-io";
import { useMainTagsForRows } from "@kaigilb/gilbplatformcode-main-tag";
import { useCreateRecord, useRecords } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { invalidatePlanSearch } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { cacheAccess } from "../cacheAccess";
import { useImpactRelationDoc } from "../inline";
import type { HostEnv } from "../env";

export function createPlanImpactsHost(env: HostEnv): PlanImpactsHost {
  const { qc } = env;
  const cache = cacheAccess(qc);
  return {
    // PlanImpacts.tsx:504
    useRecords: (vaultId) => useRecords(vaultId),
    // PlanImpacts.tsx:505
    useRelations: (id, at) => useRelations(id, at),
    // PlanImpacts.tsx:508
    useSelfSource: env.useSelfSource,
    // PlanImpacts.tsx:517
    useMainTagsForRows: (rows) => useMainTagsForRows(rows),
    // PlanImpacts.tsx:397
    useRelationDoc: (relation, planVault) => useImpactRelationDoc(relation, planVault),
    // PlanImpacts.tsx:580
    resolveType: (kind) => resolveType(kind),
    // PlanImpacts.tsx:593
    invalidatePlanSearch: (planVault) => invalidatePlanSearch(qc, planVault),
    // PlanImpacts.tsx:81
    getRecordPages: cache.getRecordPages,
    // PlanImpacts.tsx:88
    setRecordPages: cache.setRecordPages,
    // PlanImpacts.tsx:544
    setRelations: cache.setRelations,
    // PlanImpacts.tsx:507
    useCreateRecord: (planVault) => useCreateRecord(planVault),
    // PlanImpacts.tsx:555
    writePairRelation: (input) => writePairRelation(input),
    // PlanImpacts.tsx:640
    endRelation: (relation, planVault) => endRelation(relation, planVault),
  };
}
