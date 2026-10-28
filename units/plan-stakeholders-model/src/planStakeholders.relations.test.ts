// Ported from the Authority tests of the app (the pure cases: the relation readers, the older holder keys and the
// acts-for expansion). Same inputs and expectations; hosts are example.test and the people are Ann and Org.
import { describe, expect, it } from "vitest";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import type { RelationDoc } from "./relationDoc";
import {
  AUTHORITY_RELATION_TYPE,
  STAKEHOLDER_RELATION_TYPE,
  STAKEHOLDER_ROLES,
  actsForOnRelation,
  authoritiesOf,
  legacyAuthorityOf,
  stakeholdersOf,
} from "./planStakeholders";

const ANN = "https://vault.example.test/base/e/ann";
const ORG = "https://vault.example.test/base/e/org";

function rel(type: string | undefined, member: string, id: string, role = "role:referenced-by"): RecordRelation {
  return {
    relation: id,
    role,
    ...(type ? { type } : {}),
    members: [{ member, role: "role:stakeholder" }],
  };
}

describe("authoritiesOf / stakeholdersOf", () => {
  const plain = rel(STAKEHOLDER_RELATION_TYPE, ANN, "https://vault.example.test/base/r/s1");
  const authority = rel("https://ontology.example.test/base/t/AuthorityOf", ORG, "https://vault.example.test/base/r/a1");
  const untyped = rel(undefined, ANN, "https://vault.example.test/base/r/u1");

  it("splits on the relation type, and a row with no type is neither", () => {
    expect(stakeholdersOf([plain, authority, untyped])).toEqual([{ relation: plain.relation, uri: ANN }]);
    expect(authoritiesOf([plain, authority, untyped])).toEqual([{ relation: authority.relation, uri: ORG }]);
    expect(stakeholdersOf([rel(STAKEHOLDER_RELATION_TYPE, ANN, "x", "role:source")])).toEqual([]);
    expect(authoritiesOf(null)).toEqual([]);
  });

  it("reads referenced-by and stakeholder with or without the role: prefix", () => {
    const bare: RecordRelation = {
      relation: "https://vault.example.test/base/r/bare",
      role: "referenced-by",
      type: STAKEHOLDER_RELATION_TYPE,
      members: [{ member: ANN, role: "stakeholder" }],
    };
    const mixed: RecordRelation = {
      relation: "https://vault.example.test/base/r/mixed",
      role: "role:referenced-by",
      type: AUTHORITY_RELATION_TYPE,
      members: [{ member: ORG, role: "stakeholder" }],
    };
    expect(stakeholdersOf([bare])).toEqual([{ relation: bare.relation, uri: ANN }]);
    expect(stakeholdersOf([plain])).toEqual([{ relation: plain.relation, uri: ANN }]);
    expect(authoritiesOf([mixed])).toEqual([{ relation: mixed.relation, uri: ORG }]);
    expect(STAKEHOLDER_ROLES).toEqual({ source: "role:referenced-by", target: "role:stakeholder" });
  });
});

describe("legacyAuthorityOf", () => {
  it("reads the deprecated record keys, prefixed or not, string or @id", () => {
    expect(legacyAuthorityOf(null)).toBeNull();
    expect(legacyAuthorityOf({})).toBeNull();
    expect(legacyAuthorityOf({ authorityHolder: "not-a-uri" })).toBeNull();
    expect(legacyAuthorityOf({ authorityHolder: ANN, authorityActsFor: ORG })).toEqual({ holder: ANN, actsFor: ORG });
    expect(legacyAuthorityOf({ "a:authorityHolder": { "@id": ANN } })).toEqual({ holder: ANN, actsFor: null });
  });
});

describe("actsForOnRelation", () => {
  it("expands a compacted base: ref from the relation's own URI", () => {
    const doc: RelationDoc = {
      id: "r1",
      uri: "https://vault.example.test/vault/r/r1",
      typeCurie: "t:AuthorityOf",
      sourceUri: null,
      targetUri: null,
      extras: { "a:authorityActsFor": { "@id": "base:e/org" } },
    };
    expect(actsForOnRelation(doc)).toBe("https://vault.example.test/vault/e/org");
    expect(actsForOnRelation({ ...doc, extras: {} })).toBeNull();
  });
});
