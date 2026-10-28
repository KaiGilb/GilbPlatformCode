// ValueLinesHostContext (value-line-kit): the five Value lines and the Illustration. 5 members.

import type { ValueLinesHost } from "@kaigilb/gilbplatformcode-value-line-kit";
import { blankQueryReach, searchLiveTerms } from "@kaigilb/gilbplatformcode-ontology-reads";
import { useLinkLabel } from "../inline";
import type { HostEnv } from "../env";

export function createValueLinesHost(env: HostEnv): ValueLinesHost {
  return {
    // PlanValueLines.tsx:448
    useLinkLabel: (uri, vaultId) => useLinkLabel(uri, vaultId),
    // PlanValueLines.tsx:1376
    ...(env.openOntologyConcept ? { openOntologyConcept: env.openOntologyConcept } : {}),
    // PlanValueLines.tsx:1466
    searchTypes: searchLiveTerms,
    // PlanValueLines.tsx:1435
    blankReach: blankQueryReach(),
    // PlanValueLines.tsx:1435
    ...(env.renderTypeIcon ? { renderTypeIcon: env.renderTypeIcon } : {}),
  };
}
