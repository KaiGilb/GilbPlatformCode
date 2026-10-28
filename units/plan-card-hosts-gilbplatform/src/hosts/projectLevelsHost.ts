// ProjectLevelsHostContext (project-levels): the Level choices. 4 members.

import type { ProjectLevelsHost } from "@kaigilb/gilbplatformcode-project-levels";
import { addProjectLevel, ensureDefaultLevels, useAllLevels, waitForLevels } from "@kaigilb/gilbplatformcode-plan-levels-io";
import type { HostEnv } from "../env";

export function createProjectLevelsHost(env: HostEnv): ProjectLevelsHost {
  const { qc } = env;
  return {
    // planLevels.ts:294
    useAllLevels: (vaultId) => useAllLevels(vaultId),
    // planLevels.ts:462 (the source took the client first)
    waitForLevels: (vaultId) => waitForLevels(qc, vaultId),
    // planLevels.ts:359
    ensureDefaultLevels: (vaultId) => ensureDefaultLevels(vaultId, qc),
    // planLevels.ts:426
    addProjectLevel: (vaultId, label, parentToken) => addProjectLevel(vaultId, qc, label, parentToken),
  };
}
