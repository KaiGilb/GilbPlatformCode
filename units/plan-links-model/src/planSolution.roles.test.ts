// Ported from the app's planSolution.roles test (3 cases). Host names in the fixtures are generic.
import { describe, expect, it } from "vitest";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import { SOLUTION_OF_ROLES, SOLUTION_OF_TYPE, solutionOfCacheRow, solutionOfFunctions, solutionsTargeting } from "./index";

const FN = "https://vault.example.test/base/e/fn";
const SOL = "https://vault.example.test/base/e/sol";

function row(role: string, memberRole: string, member = FN, relation = "https://vault.example.test/base/r/s1"): RecordRelation {
  return {
    relation,
    role,
    type: SOLUTION_OF_TYPE,
    members: [{ member, role: memberRole }],
  };
}

describe("solution readers accept role: and the bare slug", () => {
  it("solutionOfFunctions reads role:source and source as the same link", () => {
    const prefixed = row("role:source", "role:target");
    const bare = row("source", "target", FN, "https://vault.example.test/base/r/s2");
    const want = (relation: string) => [{ relation, uri: FN }];
    expect(solutionOfFunctions([prefixed])).toEqual(want(prefixed.relation));
    expect(solutionOfFunctions([bare])).toEqual(want(bare.relation));
    expect(solutionOfFunctions([row("role:target", "role:source")])).toEqual([]);
  });

  it("solutionsTargeting reads role:target and target as the same link", () => {
    const prefixed = row("role:target", "role:source", SOL);
    const bare = row("target", "source", SOL, "https://vault.example.test/base/r/s2");
    expect(solutionsTargeting([prefixed])).toEqual([{ relation: prefixed.relation, uri: SOL }]);
    expect(solutionsTargeting([bare])).toEqual([{ relation: bare.relation, uri: SOL }]);
    expect(solutionsTargeting([row("source", "target")])).toEqual([]);
  });

  it("the cache row the card writes still stores the prefixed roles", () => {
    expect(solutionOfCacheRow({ relation: "https://vault.example.test/base/r/s1", view: "source", otherUri: FN })).toEqual({
      relation: "https://vault.example.test/base/r/s1",
      role: SOLUTION_OF_ROLES.source,
      type: SOLUTION_OF_TYPE,
      members: [{ member: FN, role: SOLUTION_OF_ROLES.target }],
    });
    expect(SOLUTION_OF_ROLES).toEqual({ source: "role:source", target: "role:target" });
  });
});
