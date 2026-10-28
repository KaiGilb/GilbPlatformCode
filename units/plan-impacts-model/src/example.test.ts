// The README example, run: a person types the numbers, the unit reads them, builds the facts for the relation, and shows the words.
import { describe, expect, it } from "vitest";
import {
  IMPACT_RESOURCE_ROLE,
  IMPACT_VALUE_ROLE,
  factsFromExtras,
  impactExtraFacts,
  impactNumbersText,
  impactsOnSolution,
  parseImpactFields,
  sameImpact,
  sortImpacts,
} from "./index";

describe("README example", () => {
  it("lists the impacts of a Solution, parses what was typed, stores it on the relation and shows it", () => {
    const rows = [
      { relation: "r1", role: "role:solution", type: "t:ImpactOn", members: [{ member: "https://vault.example.test/base/e/res", role: "role:resource" }] },
      { relation: "r2", role: "role:solution", type: "t:ImpactOn", members: [{ member: "https://vault.example.test/base/e/val", role: "role:value" }] },
    ];
    const tagOf = (uri: string) => (uri.endsWith("/val") ? "V.1" : "R.1");
    expect(sortImpacts(impactsOnSolution(rows), tagOf).map((l) => l.targetRole)).toEqual([IMPACT_VALUE_ROLE, IMPACT_RESOURCE_ROLE]);

    const typed = { status: "3", expected: "0,2", amount: "", unit: " seconds ", basis: "estimate" as const };
    const commit = parseImpactFields(IMPACT_VALUE_ROLE, typed);
    expect(commit?.valueEstimate).toBe("3 → 0.2");

    const facts = impactExtraFacts(commit!, { text: "measured on site" });
    const back = factsFromExtras(facts, IMPACT_VALUE_ROLE);
    expect(sameImpact(back, commit!)).toBe(true);
    expect(impactNumbersText(back)).toBe("3 → 0.2 seconds");
  });
});
