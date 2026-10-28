// The README example, run: read the people on a Plan record, decide whether a constraint still has a person as Authority,
// and refuse to remove the last one.
import { describe, expect, it } from "vitest";
import {
  CONSTRAINT_LAST_PERSON,
  CONSTRAINT_WARNING,
  authoritiesOf,
  isConstraintType,
  personAuthorities,
  removingLastPersonAuthority,
  resourceOwnersOf,
  stakeholderTagTexts,
  stakeholdersOf,
} from "./index";

describe("README example", () => {
  it("lists the stakeholders, finds the person Authorities of a constraint and guards the last one", () => {
    const rows = [
      { relation: "https://vault.example.test/base/r/1", role: "role:referenced-by", type: "t:StakeholderOf", members: [{ member: "https://vault.example.test/base/e/ben", role: "role:stakeholder" }] },
      { relation: "https://vault.example.test/base/r/2", role: "role:referenced-by", type: "t:AuthorityOf", members: [{ member: "https://vault.example.test/base/e/ann", role: "role:stakeholder" }] },
      { relation: "https://vault.example.test/base/r/3", role: "role:referenced-by", type: "t:ResourceOwnerOf", members: [{ member: "https://vault.example.test/base/e/org", role: "role:stakeholder" }] },
    ];
    expect(stakeholdersOf(rows).map((s) => s.uri)).toEqual(["https://vault.example.test/base/e/ben"]);
    expect(authoritiesOf(rows).map((s) => s.uri)).toEqual(["https://vault.example.test/base/e/ann"]);
    expect(resourceOwnersOf(rows).map((s) => s.uri)).toEqual(["https://vault.example.test/base/e/org"]);
    expect(stakeholderTagTexts('["Operators", { "label": "Night shift" }]')).toEqual(["Operators", "Night shift"]);

    const kindSet = {
      names: ["Person", "Staff"],
      complete: true,
      types: [
        { term: "https://ontology.example.test/base/t/Person", name: "Person", label: "Person", parents: [] },
        { term: "https://ontology.example.test/base/t/Staff", name: "Staff", label: "Staff", parents: ["https://ontology.example.test/base/t/Person"] },
      ],
    };
    const typeOf = (uri: string) => (uri.endsWith("/ann") ? "t:Staff" : null);
    const people = personAuthorities(rows, typeOf, kindSet);
    expect(isConstraintType("t:FunctionConstraint")).toBe(true);
    expect(people).toHaveLength(1);
    // With no person left the card shows the warning; removing the last one is refused with this sentence.
    expect(removingLastPersonAuthority(people, "https://vault.example.test/base/e/ann")).toBe(true);
    expect(CONSTRAINT_LAST_PERSON.startsWith("A constraint needs the named person")).toBe(true);
    expect(CONSTRAINT_WARNING.startsWith("This constraint names no Authority")).toBe(true);
  });
});
