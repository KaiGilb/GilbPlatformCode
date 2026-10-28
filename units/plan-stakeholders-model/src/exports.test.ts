// The export list of the unit, pinned: a name added or dropped fails here.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the unit's exports", () => {
  it("are these, and each is the kind of thing it says", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "AUTHORITY_RELATION_TYPE",
        "CONSTRAINT_AUTHORITY_WHY",
        "CONSTRAINT_AVOID",
        "CONSTRAINT_LAST_PERSON",
        "CONSTRAINT_UNLINKED",
        "CONSTRAINT_WARNING",
        "NOT_A_PERSON",
        "PERSON_TYPE_NAME",
        "RESOURCE_OWNER_RELATION_TYPE",
        "STAKEHOLDER_RELATION_FACT",
        "STAKEHOLDER_RELATION_TYPE",
        "STAKEHOLDER_ROLES",
        "actsForOnRelation",
        "alreadyLinked",
        "authoritiesOf",
        "handleFromFacts",
        "isConstraintType",
        "isPersonStakeholderType",
        "kindDescendants",
        "legacyAuthorityOf",
        "linkedStakeholders",
        "personAuthorities",
        "personTypeNames",
        "removingLastPersonAuthority",
        "resourceOwnersOf",
        "sameRecord",
        "stakeholderTagText",
        "stakeholderTagTexts",
        "stakeholdersOf",
        "stakeholdersWithoutTag",
      ].sort(),
    );
    for (const [name, value] of Object.entries(unit)) {
      if (/^[A-Z_]+$/.test(name)) expect(typeof value, name).toMatch(/^(string|object)$/);
      else expect(typeof value, name).toBe("function");
    }
  });
});
