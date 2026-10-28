// PlanTagPickerHostContext (plan-tag-picker): the picker the link lines and Impacts use. 3 members.

import type { PlanTagPickerHost } from "@kaigilb/gilbplatformcode-plan-tag-picker";
import { searchPlanRecords } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { cacheAccess } from "../cacheAccess";
import { tagUsedInVault } from "../inline";
import type { HostEnv } from "../env";

export function createPlanTagPickerHost(env: HostEnv): PlanTagPickerHost {
  const { qc } = env;
  const cache = cacheAccess(qc);
  return {
    // PlanTagLinks.tsx:70: label only; the type name is the picker's own.
    findPlanRecords: async (planVault, text, typeNames) => {
      const page = await searchPlanRecords(planVault, text, typeNames, { qc });
      return {
        hits: page.hits.map((hit) => ({ uri: hit.uri, label: hit.label, row: hit.row })),
        complete: page.complete,
      };
    },
    // PlanTagLinks.tsx:98
    tagUsed: (planVault, tag) => tagUsedInVault(planVault, tag),
    // PlanTagLinks.tsx:115
    invalidateSearch: cache.invalidateSearch,
  };
}
