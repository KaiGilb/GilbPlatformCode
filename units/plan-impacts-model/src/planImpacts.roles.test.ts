// Ported from the app's planImpacts.roles test (1 case). Host names in the fixtures are generic.
import { describe, expect, it } from "vitest";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import {
  IMPACT_ON_TYPE,
  IMPACT_RESOURCE_ROLE,
  IMPACT_SOLUTION_ROLE,
  IMPACT_VALUE_ROLE,
  impactsOnSolution,
  sortImpacts,
} from "./index";

const VAL = "https://vault.example.test/base/e/val";
const RES = "https://vault.example.test/base/e/res";

function row(role: string, memberRole: string, member: string, relation: string): RecordRelation {
  return {
    relation,
    role,
    type: IMPACT_ON_TYPE,
    members: [{ member, role: memberRole }],
  };
}

describe("impactsOnSolution accepts role: and the bare slug", () => {
  it("reads solution/value/resource either way and stores the prefixed target role", () => {
    const prefixed = row("role:solution", "role:value", VAL, "https://vault.example.test/base/r/v");
    const bare = row("solution", "resource", RES, "https://vault.example.test/base/r/r");
    const valueBare = row("solution", "value", VAL, "https://vault.example.test/base/r/vb");
    expect(impactsOnSolution([prefixed])).toEqual([
      { relation: prefixed.relation, targetUri: VAL, targetRole: IMPACT_VALUE_ROLE },
    ]);
    expect(impactsOnSolution([bare])).toEqual([
      { relation: bare.relation, targetUri: RES, targetRole: IMPACT_RESOURCE_ROLE },
    ]);
    expect(impactsOnSolution([valueBare, bare])).toEqual([
      { relation: valueBare.relation, targetUri: VAL, targetRole: IMPACT_VALUE_ROLE },
      { relation: bare.relation, targetUri: RES, targetRole: IMPACT_RESOURCE_ROLE },
    ]);
    expect(impactsOnSolution([row("role:source", "role:value", VAL, "https://vault.example.test/base/r/no")])).toEqual([]);
    expect(impactsOnSolution([row("solution", "target", VAL, "https://vault.example.test/base/r/no2")])).toEqual([]);
    const sorted = sortImpacts(impactsOnSolution([bare, valueBare]), () => "");
    expect(sorted.map((link) => link.targetRole)).toEqual([IMPACT_VALUE_ROLE, IMPACT_RESOURCE_ROLE]);
    expect(IMPACT_SOLUTION_ROLE).toBe("role:solution");
    expect(IMPACT_VALUE_ROLE).toBe("role:value");
    expect(IMPACT_RESOURCE_ROLE).toBe("role:resource");
  });
});
