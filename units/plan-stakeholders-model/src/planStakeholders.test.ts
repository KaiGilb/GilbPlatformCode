// Every export of planStakeholders, with the odd cases: dedupe, the type compare by local name, the text-tag readers,
// the older holder keys, the acts-for expansion, the handle.
import { describe, expect, expectTypeOf, it } from "vitest";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import type { RelationDoc } from "./relationDoc";
import {
  AUTHORITY_RELATION_TYPE,
  RESOURCE_OWNER_RELATION_TYPE,
  STAKEHOLDER_RELATION_FACT,
  STAKEHOLDER_RELATION_TYPE,
  STAKEHOLDER_ROLES,
  actsForOnRelation,
  alreadyLinked,
  authoritiesOf,
  legacyAuthorityOf,
  linkedStakeholders,
  resourceOwnersOf,
  sameRecord,
  stakeholderTagText,
  stakeholderTagTexts,
  stakeholdersOf,
  stakeholdersWithoutTag,
  type AuthorityWrite,
  type LinkedStakeholder,
} from "./planStakeholders";

const ANN = "https://vault.example.test/base/e/ann";
const BEN = "https://vault.example.test/base/e/ben";
const ORG = "https://vault.example.test/base/e/org";

function rel(type: string | undefined, member: string, relation: string, role = "role:referenced-by"): RecordRelation {
  return { relation, role, ...(type ? { type } : {}), members: [{ member, role: "role:stakeholder" }] };
}

describe("the wire vocabulary", () => {
  it("is the relation types, the two roles and the relation-type fact", () => {
    expect(STAKEHOLDER_RELATION_TYPE).toBe("t:StakeholderOf");
    expect(AUTHORITY_RELATION_TYPE).toBe("t:AuthorityOf");
    expect(RESOURCE_OWNER_RELATION_TYPE).toBe("t:ResourceOwnerOf");
    expect(STAKEHOLDER_ROLES).toEqual({ source: "role:referenced-by", target: "role:stakeholder" });
    expect(STAKEHOLDER_RELATION_FACT).toBe("stakeholder");
  });
});

describe("stakeholdersOf / authoritiesOf / resourceOwnersOf / linkedStakeholders", () => {
  const plain = rel(STAKEHOLDER_RELATION_TYPE, ANN, "https://vault.example.test/base/r/s1");
  const authority = rel(AUTHORITY_RELATION_TYPE, BEN, "https://vault.example.test/base/r/a1");
  const owner = rel(RESOURCE_OWNER_RELATION_TYPE, ORG, "https://vault.example.test/base/r/o1");
  const all = [plain, authority, owner];

  it("reads one type each: a Resource Owner is in neither of the other two lists", () => {
    expect(stakeholdersOf(all)).toEqual([{ relation: plain.relation, uri: ANN }]);
    expect(authoritiesOf(all)).toEqual([{ relation: authority.relation, uri: BEN }]);
    expect(resourceOwnersOf(all)).toEqual([{ relation: owner.relation, uri: ORG }]);
  });

  it("reads only t:ResourceOwnerOf rows as Resource Owners, in any spelling of the type", () => {
    const longForm = rel("https://ontology.example.test/base/t/ResourceOwnerOf", ORG, "https://vault.example.test/base/r/o2");
    expect(resourceOwnersOf([longForm])).toEqual([{ relation: longForm.relation, uri: ORG }]);
    expect(resourceOwnersOf([plain, authority])).toEqual([]);
    expect(resourceOwnersOf([rel("t:ResourceOwner", ORG, "x")])).toEqual([]);
    expect(resourceOwnersOf([rel(undefined, ORG, "x")])).toEqual([]);
    expect(resourceOwnersOf(null)).toEqual([]);
    expect(resourceOwnersOf(undefined)).toEqual([]);
    expect(resourceOwnersOf([])).toEqual([]);
  });

  it("linkedStakeholders is the plain list: the same rows as stakeholdersOf", () => {
    expect(linkedStakeholders(all)).toEqual(stakeholdersOf(all));
    expect(linkedStakeholders(null)).toEqual([]);
  });

  it("keeps the first row for a person named twice, and skips a row with no stakeholder member", () => {
    const again = rel(STAKEHOLDER_RELATION_TYPE, ANN, "https://vault.example.test/base/r/s2");
    expect(stakeholdersOf([plain, again])).toEqual([{ relation: plain.relation, uri: ANN }]);
    const noMember: RecordRelation = { relation: "n", role: "role:referenced-by", type: STAKEHOLDER_RELATION_TYPE, members: [] };
    const noMembers: RecordRelation = { relation: "n2", role: "role:referenced-by", type: STAKEHOLDER_RELATION_TYPE };
    const wrongRole: RecordRelation = {
      relation: "n3",
      role: "role:referenced-by",
      type: STAKEHOLDER_RELATION_TYPE,
      members: [{ member: ANN, role: "role:other" }],
    };
    const emptyMember: RecordRelation = {
      relation: "n4",
      role: "role:referenced-by",
      type: STAKEHOLDER_RELATION_TYPE,
      members: [{ member: "", role: "role:stakeholder" }],
    };
    expect(stakeholdersOf([noMember, noMembers, wrongRole, emptyMember])).toEqual([]);
  });

  it("takes the first stakeholder member of a row, and the same person under two relation types in both lists", () => {
    const two: RecordRelation = {
      relation: "t1",
      role: "role:referenced-by",
      type: STAKEHOLDER_RELATION_TYPE,
      members: [
        { member: ORG, role: "role:other" },
        { member: ANN, role: "stakeholder" },
        { member: BEN, role: "role:stakeholder" },
      ],
    };
    expect(stakeholdersOf([two])).toEqual([{ relation: "t1", uri: ANN }]);
    const asAuthority = rel(AUTHORITY_RELATION_TYPE, ANN, "t2");
    expect(stakeholdersOf([plain, asAuthority])).toEqual([{ relation: plain.relation, uri: ANN }]);
    expect(authoritiesOf([plain, asAuthority])).toEqual([{ relation: "t2", uri: ANN }]);
  });

  it("only reads rows where this record is referenced-by", () => {
    expect(stakeholdersOf([rel(STAKEHOLDER_RELATION_TYPE, ANN, "x", "role:stakeholder")])).toEqual([]);
    expect(stakeholdersOf([rel(STAKEHOLDER_RELATION_TYPE, ANN, "x", "referenced-by")])).toEqual([{ relation: "x", uri: ANN }]);
  });
});

describe("sameRecord", () => {
  it("is true for equal strings, and for two spellings of one address", () => {
    expect(sameRecord(ANN, ANN)).toBe(true);
    expect(sameRecord("", "")).toBe(true);
    expect(sameRecord("plain text", "plain text")).toBe(true);
    expect(sameRecord(`${ANN}?x=1`, ANN)).toBe(true);
    expect(sameRecord(`  ${ANN}`, ANN)).toBe(true);
    expect(sameRecord("HTTPS://vault.example.test/base/e/ann", ANN)).toBe(false);
  });

  it("is false for another id, another host, another base/vault segment, or an unreadable address", () => {
    expect(sameRecord(ANN, BEN)).toBe(false);
    expect(sameRecord(ANN, "https://other.example.test/base/e/ann")).toBe(false);
    expect(sameRecord(ANN, "https://vault.example.test/vault/e/ann")).toBe(false);
    expect(sameRecord("one", "two")).toBe(false);
    expect(sameRecord(ANN, "")).toBe(false);
  });
});

describe("alreadyLinked", () => {
  const rows = [
    rel(STAKEHOLDER_RELATION_TYPE, ANN, "s1"),
    rel(AUTHORITY_RELATION_TYPE, BEN, "a1"),
  ];

  it("asks the plain stakeholders only, with the address trimmed", () => {
    expect(alreadyLinked(rows, ANN)).toBe(true);
    expect(alreadyLinked(rows, `  ${ANN}  `)).toBe(true);
    expect(alreadyLinked(rows, `${ANN}?x=1`)).toBe(true);
    expect(alreadyLinked(rows, BEN)).toBe(false);
    expect(alreadyLinked(rows, ORG)).toBe(false);
    expect(alreadyLinked(null, ANN)).toBe(false);
    expect(alreadyLinked(undefined, ANN)).toBe(false);
    expect(alreadyLinked([], ANN)).toBe(false);
  });
});

describe("stakeholderTagText", () => {
  it("trims a string and gives null for a blank one", () => {
    expect(stakeholderTagText("  Ann ")).toBe("Ann");
    expect(stakeholderTagText("   ")).toBeNull();
    expect(stakeholderTagText("")).toBeNull();
  });

  it("gives null for a value that is not a string or an object", () => {
    expect(stakeholderTagText(null)).toBeNull();
    expect(stakeholderTagText(undefined)).toBeNull();
    expect(stakeholderTagText(42)).toBeNull();
    expect(stakeholderTagText(true)).toBeNull();
  });

  it("reads unitTag, then label, then tag, then the tail of @id", () => {
    expect(stakeholderTagText({ unitTag: "S.1", label: "L", tag: "T" })).toBe("S.1");
    expect(stakeholderTagText({ label: "L", tag: "T" })).toBe("L");
    expect(stakeholderTagText({ tag: "T", "@id": "https://vault.example.test/base/e/abc" })).toBe("T");
    expect(stakeholderTagText({ "@id": "https://vault.example.test/base/e/abc" })).toBe("abc");
    expect(stakeholderTagText({ "a:unitTag": " S.2 " })).toBe("S.2");
    expect(stakeholderTagText({ "https://ontology.example.test/base/a/label": "Iri" })).toBe("Iri");
  });

  it("falls through a blank or non-string field to the next", () => {
    expect(stakeholderTagText({ unitTag: "  ", label: "L" })).toBe("L");
    expect(stakeholderTagText({ unitTag: 7, label: "L" })).toBe("L");
    expect(stakeholderTagText({ unitTag: null, label: "", tag: "T" })).toBe("T");
  });

  it("takes the tail of an @id after the last slash, or the whole id when there is none or it ends in a slash", () => {
    expect(stakeholderTagText({ "@id": "abc" })).toBe("abc");
    expect(stakeholderTagText({ "@id": "  https://vault.example.test/base/e/abc  " })).toBe("abc");
    expect(stakeholderTagText({ "@id": "https://vault.example.test/base/e/" })).toBe("https://vault.example.test/base/e/");
    expect(stakeholderTagText({ "@id": "   " })).toBe("");
    expect(stakeholderTagText({ "@id": 5 })).toBeNull();
    expect(stakeholderTagText({})).toBeNull();
  });
});

describe("stakeholderTagTexts", () => {
  it("reads a bare string as one tag, trimmed, and nothing from a blank one", () => {
    expect(stakeholderTagTexts("Ann")).toEqual(["Ann"]);
    expect(stakeholderTagTexts("  Ann  ")).toEqual(["Ann"]);
    expect(stakeholderTagTexts("")).toEqual([]);
    expect(stakeholderTagTexts("   ")).toEqual([]);
    expect(stakeholderTagTexts(null)).toEqual([]);
    expect(stakeholderTagTexts(undefined)).toEqual([]);
    expect(stakeholderTagTexts(7)).toEqual([]);
  });

  it("reads a list, a single object and a JSON string of either; an @id is a text tag, not a relation", () => {
    expect(stakeholderTagTexts(["A", { label: "B" }, { "@id": "https://vault.example.test/base/e/c" }, 5, null, " ", ""])).toEqual([
      "A",
      "B",
      "c",
    ]);
    expect(stakeholderTagTexts({ unitTag: "S.1" })).toEqual(["S.1"]);
    expect(stakeholderTagTexts('["A","B"]')).toEqual(["A", "B"]);
    expect(stakeholderTagTexts('[{"label":"A"},{"tag":"B"}]')).toEqual(["A", "B"]);
    expect(stakeholderTagTexts('{"label":"A"}')).toEqual(["A"]);
    expect(stakeholderTagTexts(' ["A"] ')).toEqual(["A"]);
  });

  it("reads nothing from broken JSON text", () => {
    expect(stakeholderTagTexts("{broken")).toEqual([]);
    expect(stakeholderTagTexts("[broken")).toEqual([]);
  });

  it("keeps a repeated name as many times as it is given", () => {
    expect(stakeholderTagTexts(["A", "A"])).toEqual(["A", "A"]);
  });
});

describe("stakeholdersWithoutTag", () => {
  it("drops every item with exactly that tag and gives null when nothing remains", () => {
    expect(stakeholdersWithoutTag(["A", "B"], "A")).toEqual(["B"]);
    expect(stakeholdersWithoutTag(["A", "B", "A"], "A")).toEqual(["B"]);
    expect(stakeholdersWithoutTag(["A"], "A")).toBeNull();
    expect(stakeholdersWithoutTag("A", "A")).toBeNull();
    expect(stakeholdersWithoutTag(null, "A")).toBeNull();
    expect(stakeholdersWithoutTag([], "A")).toBeNull();
  });

  it("compares the tag exactly: case and spaces count; the stored items are trimmed first", () => {
    expect(stakeholdersWithoutTag(["A", "B"], "a")).toEqual(["A", "B"]);
    expect(stakeholdersWithoutTag([" A ", "B"], "A")).toEqual(["B"]);
    expect(stakeholdersWithoutTag(["A", "B"], " A")).toEqual(["A", "B"]);
  });

  it("returns the remaining names as text, whatever they were stored as", () => {
    expect(stakeholdersWithoutTag([{ label: "A" }, { "@id": "https://vault.example.test/base/e/b" }], "A")).toEqual(["b"]);
  });
});

describe("legacyAuthorityOf", () => {
  it("reads the holder under the bare key, the a: key, or a full-IRI key", () => {
    expect(legacyAuthorityOf({ authorityHolder: ANN })).toEqual({ holder: ANN, actsFor: null });
    expect(legacyAuthorityOf({ "a:authorityHolder": ANN })).toEqual({ holder: ANN, actsFor: null });
    expect(legacyAuthorityOf({ "https://ontology.example.test/base/a/authorityHolder": ANN })).toEqual({ holder: ANN, actsFor: null });
    expect(legacyAuthorityOf({ authorityHolder: { "@id": ANN } })).toEqual({ holder: ANN, actsFor: null });
  });

  it("takes the a: key when the bare key is there but unusable, and null when neither is", () => {
    expect(legacyAuthorityOf({ authorityHolder: "nope", "a:authorityHolder": ANN })).toEqual({ holder: ANN, actsFor: null });
    expect(legacyAuthorityOf({ authorityHolder: "nope", "https://ontology.example.test/base/a/authorityHolder": ANN })).toBeNull();
    expect(legacyAuthorityOf({ authorityHolder: "", "a:authorityHolder": null })).toBeNull();
    expect(legacyAuthorityOf({ authorityHolder: ["x"] })).toBeNull();
    expect(legacyAuthorityOf({ authorityHolder: 3 })).toBeNull();
    expect(legacyAuthorityOf(undefined)).toBeNull();
  });

  it("accepts an entity address as its stored form, and any http text as it is", () => {
    expect(legacyAuthorityOf({ authorityHolder: `${ANN}?x=1` })).toEqual({ holder: ANN, actsFor: null });
    expect(legacyAuthorityOf({ authorityHolder: "https://other.example.test/page" })).toEqual({
      holder: "https://other.example.test/page",
      actsFor: null,
    });
    expect(legacyAuthorityOf({ authorityHolder: "  " + ANN + " " })).toEqual({ holder: ANN, actsFor: null });
  });

  it("reads acts-for the same way, and gives null when it is absent or unusable", () => {
    expect(legacyAuthorityOf({ authorityHolder: ANN, authorityActsFor: ORG })).toEqual({ holder: ANN, actsFor: ORG });
    expect(legacyAuthorityOf({ authorityHolder: ANN, "a:authorityActsFor": { "@id": ORG } })).toEqual({ holder: ANN, actsFor: ORG });
    expect(legacyAuthorityOf({ authorityHolder: ANN, authorityActsFor: "text" })).toEqual({ holder: ANN, actsFor: null });
    expect(legacyAuthorityOf({ authorityActsFor: ORG })).toBeNull();
  });
});

describe("actsForOnRelation", () => {
  const doc = (uri: string, extras: Record<string, unknown>): RelationDoc => ({
    id: "r1",
    uri,
    typeCurie: "t:AuthorityOf",
    sourceUri: null,
    targetUri: null,
    extras,
  });
  const REL = "https://vault.example.test/base/r/r1";

  it("is null for no document and for none of the acts-for", () => {
    expect(actsForOnRelation(null)).toBeNull();
    expect(actsForOnRelation(undefined)).toBeNull();
    expect(actsForOnRelation(doc(REL, {}))).toBeNull();
    expect(actsForOnRelation(doc(REL, { "a:authorityActsFor": null }))).toBeNull();
    expect(actsForOnRelation(doc(REL, { "a:authorityActsFor": "" }))).toBeNull();
  });

  it("reads an absolute address as it is, as a string or as @id, and under the bare key too", () => {
    expect(actsForOnRelation(doc(REL, { "a:authorityActsFor": { "@id": ORG } }))).toBe(ORG);
    expect(actsForOnRelation(doc(REL, { "a:authorityActsFor": ORG }))).toBe(ORG);
    expect(actsForOnRelation(doc(REL, { authorityActsFor: ORG }))).toBe(ORG);
    expect(actsForOnRelation(doc(REL, { "a:authorityActsFor": `${ORG}?x=1` }))).toBe(ORG);
    expect(actsForOnRelation(doc(REL, { "a:authorityActsFor": "https://other.example.test/page" }))).toBe("https://other.example.test/page");
  });

  it("expands base: from the relation's own address, keeping its base or vault segment and its host", () => {
    expect(actsForOnRelation(doc(REL, { "a:authorityActsFor": { "@id": "base:e/org" } }))).toBe("https://vault.example.test/base/e/org");
    expect(actsForOnRelation(doc(REL, { "a:authorityActsFor": "base:e/org" }))).toBe("https://vault.example.test/base/e/org");
    expect(actsForOnRelation(doc("http://h2.example.test/vault/r/r9", { authorityActsFor: " base:e/org " }))).toBe(
      "http://h2.example.test/vault/e/org",
    );
  });

  it("expands nothing when the relation's address is not .../(base|vault)/r/..., or the text does not start with base:", () => {
    expect(actsForOnRelation(doc("https://vault.example.test/base/e/r1", { authorityActsFor: "base:e/org" }))).toBeNull();
    expect(actsForOnRelation(doc("r1", { authorityActsFor: "base:e/org" }))).toBeNull();
    expect(actsForOnRelation(doc(REL, { authorityActsFor: "e/org" }))).toBeNull();
    expect(actsForOnRelation(doc(REL, { authorityActsFor: 5 }))).toBeNull();
    expect(actsForOnRelation(doc(REL, { authorityActsFor: [ORG] }))).toBeNull();
  });

  it("expands a bare 'base:' to the vault root with nothing after it", () => {
    expect(actsForOnRelation(doc(REL, { authorityActsFor: "base:" }))).toBe("https://vault.example.test/base/");
  });
});

describe("the types", () => {
  it("LinkedStakeholder is a relation and an address", () => {
    expectTypeOf<LinkedStakeholder>().toEqualTypeOf<{ relation: string; uri: string }>();
  });

  it("AuthorityWrite names the record and the stakeholder; actsFor and relationType are optional", () => {
    expectTypeOf<AuthorityWrite["recordId"]>().toEqualTypeOf<string>();
    expectTypeOf<AuthorityWrite["recordUri"]>().toEqualTypeOf<string | null>();
    expectTypeOf<AuthorityWrite["stakeholderUri"]>().toEqualTypeOf<string>();
    expectTypeOf<AuthorityWrite["vaultId"]>().toEqualTypeOf<string>();
    expectTypeOf<AuthorityWrite["actsFor"]>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<AuthorityWrite["relationType"]>().toEqualTypeOf<string | undefined>();
    const minimal: AuthorityWrite = { recordId: "r", recordUri: null, stakeholderUri: ANN, vaultId: "v" };
    const owner: AuthorityWrite = { ...minimal, relationType: RESOURCE_OWNER_RELATION_TYPE };
    expect(owner.relationType).toBe("t:ResourceOwnerOf");
    expect(minimal.relationType).toBeUndefined();
  });

  it("RelationDoc is the relation document the vault serves", () => {
    expectTypeOf<RelationDoc["extras"]>().toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf<RelationDoc["otherRoles"]>().toEqualTypeOf<Record<string, unknown> | undefined>();
    expectTypeOf<RelationDoc["typeCurie"]>().toEqualTypeOf<string | null>();
  });
});
