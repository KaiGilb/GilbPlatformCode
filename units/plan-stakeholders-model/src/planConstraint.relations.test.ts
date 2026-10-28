// Ported from the constraint tests of the app (all four cases). Same inputs and expectations; hosts are
// example.test and the people are Ann and Ben.
import { describe, expect, it } from "vitest";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import type { StakeholderTypeSet } from "./kinds";
import {
  isPersonStakeholderType,
  personAuthorities,
  personTypeNames,
  removingLastPersonAuthority,
} from "./planConstraint";

const PERSON = "https://ontology.example.test/base/t/Person";
const COLLEAGUE = "https://ontology.example.test/base/t/Colleague";
const EMPLOYEE = "https://ontology.example.test/base/t/Employee";
const ORG = "https://ontology.example.test/base/t/Organization";
const AGENT = "https://ontology.example.test/base/t/AiAgent";
const SYSTEM = "https://ontology.example.test/base/t/SoftwareSystem";

const set: StakeholderTypeSet = {
  names: ["Person", "Colleague", "Employee", "Organization", "SoftwareSystem", "AiAgent"],
  complete: true,
  types: [
    { term: PERSON, name: "Person", label: "Person", parents: [] },
    { term: COLLEAGUE, name: "Colleague", label: "Colleague", parents: [PERSON] },
    { term: EMPLOYEE, name: "Employee", label: "Employee", parents: [COLLEAGUE] },
    { term: ORG, name: "Organization", label: "Organization", parents: [] },
    { term: SYSTEM, name: "SoftwareSystem", label: "Software System", parents: [] },
    { term: AGENT, name: "AiAgent", label: "AI agent", parents: [SYSTEM] },
  ],
};

describe("personTypeNames", () => {
  it("walks every kind under Person and leaves an organization, a role, and an AI agent out", () => {
    expect(personTypeNames(set)).toEqual(["Person", "Colleague", "Employee"]);
    expect(isPersonStakeholderType("t:Person", set)).toBe(true);
    expect(isPersonStakeholderType("t:Employee", set)).toBe(true);
    expect(isPersonStakeholderType("https://ontology.example.test/base/t/Employee", set)).toBe(true);
    expect(isPersonStakeholderType("t:Organization", set)).toBe(false);
    expect(isPersonStakeholderType("t:AiAgent", set)).toBe(false);
    expect(isPersonStakeholderType("t:SoftwareSystem", set)).toBe(false);
    expect(isPersonStakeholderType(null, set)).toBe(false);
    expect(isPersonStakeholderType("", set)).toBe(false);
  });

  it("names only Person when the set has no parents to walk", () => {
    const bare: StakeholderTypeSet = {
      names: ["Person", "Colleague"],
      complete: true,
      types: [
        { term: PERSON, name: "Person", label: "Person" },
        { term: COLLEAGUE, name: "Colleague", label: "Colleague" },
      ],
    };
    expect(personTypeNames(bare)).toEqual(["Person"]);
    expect(personTypeNames(undefined)).toEqual(["Person"]);
    expect(isPersonStakeholderType("t:Person", undefined)).toBe(true);
    expect(isPersonStakeholderType("t:Employee", undefined)).toBe(false);
  });

  it("refuses removing the only person Authority, and allows removing one of two", () => {
    const ann = { relation: "r1", uri: "https://vault.example.test/base/e/ann" };
    const ben = { relation: "r2", uri: "https://vault.example.test/base/e/ben" };
    expect(removingLastPersonAuthority([ann], ann.uri)).toBe(true);
    expect(removingLastPersonAuthority([ann, ben], ann.uri)).toBe(false);
    expect(removingLastPersonAuthority([ann], "https://vault.example.test/base/e/org")).toBe(false);
    expect(removingLastPersonAuthority([], ann.uri)).toBe(false);
  });

  it("counts a person relation and not text, and not an organization relation", () => {
    const rows: RecordRelation[] = [
      {
        relation: "https://vault.example.test/base/r/a1",
        role: "role:referenced-by",
        type: "t:AuthorityOf",
        members: [{ member: "https://vault.example.test/base/e/ann", role: "role:stakeholder" }],
      },
      {
        relation: "https://vault.example.test/base/r/a2",
        role: "role:referenced-by",
        type: "t:AuthorityOf",
        members: [{ member: "https://vault.example.test/base/e/org", role: "role:stakeholder" }],
      },
    ];
    const typeOf = (uri: string) => (uri.endsWith("/ann") ? "t:Employee" : uri.endsWith("/org") ? "t:Organization" : null);
    expect(personAuthorities(rows, typeOf, set).map((a) => a.uri)).toEqual(["https://vault.example.test/base/e/ann"]);
    expect(personAuthorities(rows, () => null, set)).toEqual([]);
  });
});
