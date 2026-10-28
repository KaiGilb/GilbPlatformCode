// @vitest-environment node
// The members of the lines' host this unit serves, assigned to the host's own types: a change in either that breaks the fit fails the type check
// (`npm run typecheck`), and the test shows the members are the unit's own functions.
import { describe, expect, it } from "vitest";
import { useQuery } from "@tanstack/react-query";
import type { StakeholderLinesHost } from "@kaigilb/gilbplatformcode-plan-stakeholder-lines";
import { endRelation } from "@kaigilb/gilbplatformcode-lws-relations";
import { useRecords } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import {
  STAKEHOLDER_TYPE_SET_QUERY,
  findAnyRecords,
  findStakeholderRecords,
  useRelations,
  usePersonAuthorities,
  writeAuthorityRelation,
} from "./index";

// ---- as in the README ----
export const served = {
  useRecords: (vaultId) => useRecords(vaultId),
  useRelations: (recordId, recordUri) => useRelations(recordId, recordUri),
  useStakeholderKinds: (enabled) => useQuery({ ...STAKEHOLDER_TYPE_SET_QUERY, enabled }),
  usePersonAuthorities,
  findStakeholders: (vaults, names, text) => findStakeholderRecords(vaults, names, text),
  findAnyRecords: (vaults, text) => findAnyRecords(vaults, text),
  writeAuthorityRelation,
  endRelation,
} satisfies Partial<StakeholderLinesHost>;
// ---- end of the README example ----

describe("the members of the lines' host served by this unit", () => {
  it("are functions", () => {
    expect(Object.keys(served).sort()).toEqual(
      ["endRelation", "findAnyRecords", "findStakeholders", "usePersonAuthorities", "useRecords", "useRelations", "useStakeholderKinds", "writeAuthorityRelation"].sort(),
    );
    for (const f of Object.values(served)) expect(typeof f).toBe("function");
  });
});
