// PlanImpactsHostContext (plan-impacts): the Impacts line. 12 members.

import type { PlanImpactsHost } from "@kaigilb/gilbplatformcode-plan-impacts";
import { resolveType } from "@kaigilb/gilbplatformcode-record-types";
import { endRelation, writePairRelation } from "@kaigilb/gilbplatformcode-lws-relations";
import { useRelations } from "@kaigilb/gilbplatformcode-plan-stakeholder-io";
import { useCreateRecord, useRecords } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { invalidatePlanSearch } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { cacheAccess } from "../cacheAccess";
import { useImpactRelationDoc } from "../inline";
import type { HostEnv } from "../env";

export function createPlanImpactsHost(env: HostEnv): PlanImpactsHost {
  const { qc } = env;
  const cache = cacheAccess(qc);
  return {
    // PlanImpacts.tsx:502
    useRecords: (vaultId) => useRecords(vaultId),
    // PlanImpacts.tsx:503
    useRelations: (id, at) => useRelations(id, at),
    // PlanImpacts.tsx:506
    useSelfSource: env.useSelfSource,
    // PlanImpacts.tsx:395
    useRelationDoc: (relation, planVault) => useImpactRelationDoc(relation, planVault),
    // PlanImpacts.tsx:573
    resolveType: (kind) => resolveType(kind),
    // PlanImpacts.tsx:586
    invalidatePlanSearch: (planVault) => invalidatePlanSearch(qc, planVault),
    // PlanImpacts.tsx:80
    getRecordPages: cache.getRecordPages,
    // PlanImpacts.tsx:87
    setRecordPages: cache.setRecordPages,
    // PlanImpacts.tsx:537
    setRelations: cache.setRelations,
    // PlanImpacts.tsx:505
    useCreateRecord: (planVault) => useCreateRecord(planVault),
    // PlanImpacts.tsx:548
    writePairRelation: (input) => writePairRelation(input),
    // PlanImpacts.tsx:633
    endRelation: (relation, planVault) => endRelation(relation, planVault),
  };
}
