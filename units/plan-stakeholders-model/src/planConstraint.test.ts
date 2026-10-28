// Every export of planConstraint: the sentences (verbatim), the constraint type test, the Person walk over a kind set
// with a diamond, the person Authorities and the last-person rule.
import { afterEach, describe, expect, it } from "vitest";
import { resetTypeKey, setTypeKey } from "@kaigilb/gilbplatformcode-type-key";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import type { StakeholderTypeSet } from "./kinds";
import {
  CONSTRAINT_AUTHORITY_WHY,
  CONSTRAINT_AVOID,
  CONSTRAINT_LAST_PERSON,
  CONSTRAINT_UNLINKED,
  CONSTRAINT_WARNING,
  NOT_A_PERSON,
  PERSON_TYPE_NAME,
  isConstraintType,
  isPersonStakeholderType,
  personAuthorities,
  personTypeNames,
  removingLastPersonAuthority,
} from "./planConstraint";

const T = (name: string) => `https://ontology.example.test/base/t/${name}`;

// Person has two kinds directly under it (Staff, Visitor); Member sits under both (a diamond); Guest is under Visitor only.
// Other is a root of its own, with Robot under it.
const diamond: StakeholderTypeSet = {
  names: ["Person", "Staff", "Visitor", "Member", "Guest", "Other", "Robot"],
  complete: true,
  types: [
    { term: T("Person"), name: "Person", label: "Person", parents: [] },
    { term: T("Staff"), name: "Staff", label: "Staff", parents: [T("Person")] },
    { term: T("Visitor"), name: "Visitor", label: "Visitor", parents: [T("Person")] },
    { term: T("Member"), name: "Member", label: "Member", parents: [T("Staff"), T("Visitor")] },
    { term: T("Guest"), name: "Guest", label: null, parents: [T("Visitor")] },
    { term: T("Other"), name: "Other", label: "Other" },
    { term: T("Robot"), name: "Robot", label: "Robot", parents: [T("Other")] },
  ],
};

afterEach(() => resetTypeKey());

describe("the sentences", () => {
  it("are verbatim", () => {
    expect(PERSON_TYPE_NAME).toBe("Person");
    expect(CONSTRAINT_AVOID).toBe(
      "Avoid constraints where you can: each one locks out options. Record one only when a named person requires it.",
    );
    expect(CONSTRAINT_AUTHORITY_WHY).toBe("A constraint's Authority is the named person who requires it.");
    expect(CONSTRAINT_UNLINKED).toBe("The constraint was made, but its Authority was not linked: add it on the card.");
    expect(CONSTRAINT_LAST_PERSON).toBe(
      "A constraint needs the named person who requires it. Change the Type to Function instead, or add another Authority first.",
    );
    expect(CONSTRAINT_WARNING).toBe("This constraint names no Authority. Add the person who requires it, or change it to a Function.");
    expect(NOT_A_PERSON).toBe("not a person");
  });
});

describe("isConstraintType", () => {
  it("is true for a Function Constraint and a Design Constraint, in any spelling of the type", () => {
    expect(isConstraintType("t:FunctionConstraint")).toBe(true);
    expect(isConstraintType("t:DesignConstraint")).toBe(true);
    expect(isConstraintType("FunctionConstraint")).toBe(true);
    expect(isConstraintType("DesignConstraint")).toBe(true);
    expect(isConstraintType("https://vault.example.test/base/t/FunctionConstraint")).toBe(true);
    expect(isConstraintType("https://vault.example.test/base/t/DesignConstraint")).toBe(true);
  });

  it("is true whatever the case, because the default type key lower-cases", () => {
    expect(isConstraintType("t:functionconstraint")).toBe(true);
    expect(isConstraintType("DESIGNCONSTRAINT")).toBe(true);
  });

  it("is false for a Function, a Solution, the other Plan types and a near name", () => {
    for (const t of ["t:Function", "t:Solution", "t:Value", "t:Resource", "t:Note", "t:Constraint", "t:FunctionConstraints", "t:Design"]) {
      expect(isConstraintType(t)).toBe(false);
    }
  });

  it("is false for no type", () => {
    expect(isConstraintType(null)).toBe(false);
    expect(isConstraintType(undefined)).toBe(false);
    expect(isConstraintType("")).toBe(false);
    expect(isConstraintType("   ")).toBe(false);
  });

  it("asks the type key of the app: a key set with setTypeKey decides", () => {
    expect(isConstraintType("t:FunctionConstraint")).toBe(true);
    // A key that keeps the prefix: the CURIE no longer has the key of the bare name.
    setTypeKey((t) => t.toUpperCase());
    expect(isConstraintType("t:FunctionConstraint")).toBe(false);
    expect(isConstraintType("FunctionConstraint")).toBe(true);
    // A key that keeps the case: only the exact spelling is a constraint.
    setTypeKey((t) => t.replace(/^t:/, "").replace(/^.*\//, ""));
    expect(isConstraintType("t:FunctionConstraint")).toBe(true);
    expect(isConstraintType("t:functionconstraint")).toBe(false);
    resetTypeKey();
    expect(isConstraintType("t:functionconstraint")).toBe(true);
  });
});

describe("personTypeNames", () => {
  it("lists Person, then each kind under it once, depth first, a diamond kind where it is first reached", () => {
    expect(personTypeNames(diamond)).toEqual(["Person", "Staff", "Member", "Visitor", "Guest"]);
  });

  it("leaves out a kind that is under another root", () => {
    expect(personTypeNames(diamond)).not.toContain("Other");
    expect(personTypeNames(diamond)).not.toContain("Robot");
  });

  it("is only the root name when the set is missing, or Person is not in it, or Person has no term", () => {
    expect(personTypeNames(null)).toEqual(["Person"]);
    expect(personTypeNames(undefined)).toEqual(["Person"]);
    expect(personTypeNames({ names: [], complete: true, types: [] })).toEqual(["Person"]);
    expect(personTypeNames({ names: ["Staff"], complete: true, types: [{ term: T("Staff"), name: "Staff", label: null, parents: [T("Person")] }] })).toEqual([
      "Person",
    ]);
    expect(
      personTypeNames({
        names: ["Person", "Staff"],
        complete: true,
        types: [
          { term: "", name: "Person", label: null, parents: [] },
          { term: T("Staff"), name: "Staff", label: null, parents: [""] },
        ],
      }),
    ).toEqual(["Person"]);
  });

  it("does not invent descendants when the set carries no parents", () => {
    expect(
      personTypeNames({
        names: ["Person", "Staff"],
        complete: true,
        types: [
          { term: T("Person"), name: "Person", label: null },
          { term: T("Staff"), name: "Staff", label: null },
        ],
      }),
    ).toEqual(["Person"]);
  });

  it("lists a name once, skips a nameless kind, and ends on a loop in the set", () => {
    const odd: StakeholderTypeSet = {
      names: [],
      complete: false,
      types: [
        { term: T("Person"), name: "Person", label: null, parents: [T("Staff")] },
        { term: T("Staff"), name: "Staff", label: null, parents: [T("Person")] },
        { term: T("Staff2"), name: "Staff", label: null, parents: [T("Person")] },
        { term: T("Nameless"), name: "", label: null, parents: [T("Person")] },
        { term: T("Person2"), name: "Person", label: null, parents: [T("Person")] },
      ],
    };
    expect(personTypeNames(odd)).toEqual(["Person", "Staff"]);
  });

  it("reads the first kind named Person as the root", () => {
    const twice: StakeholderTypeSet = {
      names: [],
      complete: true,
      types: [
        { term: T("PersonA"), name: "Person", label: null, parents: [] },
        { term: T("PersonB"), name: "Person", label: null, parents: [] },
        { term: T("Under"), name: "Under", label: null, parents: [T("PersonB")] },
      ],
    };
    expect(personTypeNames(twice)).toEqual(["Person"]);
  });
});

describe("isPersonStakeholderType", () => {
  it("is true for Person and each kind under it, by name from a CURIE or an address", () => {
    for (const n of ["Person", "Staff", "Visitor", "Member", "Guest"]) {
      expect(isPersonStakeholderType(`t:${n}`, diamond)).toBe(true);
      expect(isPersonStakeholderType(T(n), diamond)).toBe(true);
    }
  });

  it("is false for another root, its kinds, an unknown type and a different case", () => {
    expect(isPersonStakeholderType("t:Other", diamond)).toBe(false);
    expect(isPersonStakeholderType("t:Robot", diamond)).toBe(false);
    expect(isPersonStakeholderType("t:Unknown", diamond)).toBe(false);
    expect(isPersonStakeholderType("t:person", diamond)).toBe(false);
  });

  it("is false for no type", () => {
    expect(isPersonStakeholderType(null, diamond)).toBe(false);
    expect(isPersonStakeholderType(undefined, diamond)).toBe(false);
    expect(isPersonStakeholderType("", diamond)).toBe(false);
    expect(isPersonStakeholderType("  ", diamond)).toBe(false);
  });

  it("is true for Person alone when there is no set", () => {
    expect(isPersonStakeholderType("t:Person", null)).toBe(true);
    expect(isPersonStakeholderType("t:Staff", null)).toBe(false);
  });
});

describe("personAuthorities", () => {
  const row = (type: string | undefined, member: string, relation: string, role = "role:referenced-by"): RecordRelation => ({
    relation,
    role,
    ...(type ? { type } : {}),
    members: [{ member, role: "role:stakeholder" }],
  });
  const ANN = "https://vault.example.test/base/e/ann";
  const BEN = "https://vault.example.test/base/e/ben";
  const BOT = "https://vault.example.test/base/e/bot";
  const types: Record<string, string> = { [ANN]: "t:Member", [BEN]: T("Guest"), [BOT]: "t:Robot" };
  const typeOf = (uri: string) => types[uri] ?? null;

  it("keeps the Authorities whose record is a person, in order", () => {
    const rows = [row("t:AuthorityOf", ANN, "a1"), row("t:AuthorityOf", BOT, "a2"), row("t:AuthorityOf", BEN, "a3")];
    expect(personAuthorities(rows, typeOf, diamond)).toEqual([
      { relation: "a1", uri: ANN },
      { relation: "a3", uri: BEN },
    ]);
  });

  it("asks the type of each stakeholder address, once per Authority row", () => {
    const asked: string[] = [];
    personAuthorities([row("t:AuthorityOf", ANN, "a1"), row("t:AuthorityOf", BOT, "a2")], (u) => (asked.push(u), typeOf(u)), diamond);
    expect(asked).toEqual([ANN, BOT]);
  });

  it("does not count a plain stakeholder, a Resource Owner, a row with no type, or a person of unknown type", () => {
    const rows = [
      row("t:StakeholderOf", ANN, "s1"),
      row("t:ResourceOwnerOf", ANN, "o1"),
      row(undefined, ANN, "u1"),
      row("t:AuthorityOf", "https://vault.example.test/base/e/stranger", "a9"),
    ];
    expect(personAuthorities(rows, typeOf, diamond)).toEqual([]);
    expect(personAuthorities(null, typeOf, diamond)).toEqual([]);
    expect(personAuthorities(undefined, typeOf, diamond)).toEqual([]);
  });

  it("counts every person Authority as a person when there is no set only for the type Person", () => {
    const rows = [row("t:AuthorityOf", ANN, "a1")];
    expect(personAuthorities(rows, () => "t:Person", undefined)).toEqual([{ relation: "a1", uri: ANN }]);
    expect(personAuthorities(rows, () => "t:Member", undefined)).toEqual([]);
  });
});

describe("removingLastPersonAuthority", () => {
  const ANN = "https://vault.example.test/base/e/ann";
  const BEN = "https://vault.example.test/base/e/ben";

  it("is true only when the one person left is the one removed", () => {
    expect(removingLastPersonAuthority([{ uri: ANN }], ANN)).toBe(true);
    expect(removingLastPersonAuthority([{ uri: ANN }], BEN)).toBe(false);
    expect(removingLastPersonAuthority([{ uri: ANN }, { uri: BEN }], ANN)).toBe(false);
    expect(removingLastPersonAuthority([], ANN)).toBe(false);
  });

  it("matches the same record by its address, not by the string", () => {
    expect(removingLastPersonAuthority([{ uri: ANN }], `${ANN}?x=1`)).toBe(true);
    expect(removingLastPersonAuthority([{ uri: ANN }], "https://vault.example.test/vault/e/ann")).toBe(false);
  });

  it("counts two entries for one person as two", () => {
    expect(removingLastPersonAuthority([{ uri: ANN }, { uri: ANN }], ANN)).toBe(false);
  });
});
