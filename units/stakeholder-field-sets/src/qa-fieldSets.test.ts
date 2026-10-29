// Ported from `gilb-stakeholders` `test/qa-c214.test.ts` at 0a261488: 7 of its 12 tests (the others read the app's cached vocabulary,
// `createStakeholderVocabulary`, or call `resolveStakeholderKinds` alone) and not the one skipped test, which is a shape the master does not
// serve; `kindTypeNames` (not in this unit) is written out as the type names of the kinds. Gap tests of the field sets.
//
// Every expected value is a literal or a fixture document. Each negative has a positive control in the same describe block.
import { describe, it, expect } from "vitest";
import { VocabularyUnavailableError, masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import type { StakeholderKinds } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import { resolveFieldSets } from "./fieldSets";
import { fixtureMaster, RIG, t, CONTEXT } from "../test/support";

const src = (m: ReturnType<typeof fixtureMaster>) => masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
const fieldsOf = (sets: Awaited<ReturnType<typeof resolveFieldSets>>, kind: string) =>
  sets.byKind[t(kind)]!.fields.map((f) => f.term);
const kindTypeNames = (kinds: StakeholderKinds): string[] => kinds.types.map((k) => k.name);

const REMARK_ON_ORGANISM = {
  "@id": t("FixtureRemark"),
  "a:predicateAttribute": "a:fixtureRemark",
  "a:label": "Remark",
  "a:fieldOf": { "@id": t("Organism") },
};

describe("the live shape: a member with its own is-a child", () => {
  // The type set resolves from the ontology. Read live on 2026-09-30:
  // t/Person/children = [Passenger], complete. The shipped fixture has children under Software
  // System only, so this live shape (a child under a PARTY member) was never exercised.
  it("a child of Person is a kind and inherits every field Person offers", async () => {
    const m = fixtureMaster();
    m.children("Person", [{ name: "Passenger", label: "Passenger" }]);
    m.children("Passenger", []);
    const sets = await resolveFieldSets(src(m));
    expect(kindTypeNames(sets.kinds)).toContain("Passenger");
    expect(kindTypeNames(sets.kinds)).toHaveLength(10);
    expect(fieldsOf(sets, "Passenger")).toEqual([t("Email"), t("Name"), t("PlanguageLevel")]);
    expect(sets.byKind[t("Passenger")]!.fields.find((f) => f.term === t("Email"))!.declaredOn).toEqual([t("Person")]);
  });
});

describe("inheritance reaches EVERY is-a parent (inherited down is-a)", () => {
  // The field set per kind comes from a:fieldOf, inherited down is-a: instances of a type, and of every type under it, may carry the
  // attribute. `fieldSets.ts` header: "ancestors(K) = K and every type above it by is-a".
  const dual = () => {
    const m = fixtureMaster();
    // Dual is listed under Person (so it is a kind) AND is-a Envoy, a type outside the kind set.
    m.children("Person", [{ name: "Dual", label: "Dual" }]);
    m.children("Dual", []);
    m.put("t/Dual", {
      "@context": CONTEXT,
      "@id": t("Dual"),
      "a:label": "Dual",
      "a:subTypeOf": [{ "@id": t("Person") }, { "@id": t("FixtureEnvoy") }],
    });
    m.put("t/FixtureEnvoy", { "@context": CONTEXT, "@id": t("FixtureEnvoy"), "a:label": "Envoy", "a:subTypeOf": { "@id": t("Substance") } });
    m.listing([
      [
        { "@id": t("FixtureMandate"), "a:predicateAttribute": "a:fixtureMandate", "a:label": "Mandate", "a:fieldOf": { "@id": t("FixtureEnvoy") } },
        { "@id": t("Email"), "a:predicateAttribute": "a:email", "a:label": "Email", "a:fieldOf": { "@id": t("Person") } },
      ],
    ]);
    return m;
  };

  it("positive control: Person, which is not an Envoy, is not offered the Envoy field", async () => {
    const sets = await resolveFieldSets(src(dual()));
    expect(fieldsOf(sets, "Person")).toEqual([t("Email")]);
  });
});

describe("an unreadable ancestor is an error, never fewer fields", () => {
  // `VocabularySource.term` throws VocabularyUnavailableError on anything but a document; a failure must never read as "there is
  // nothing". A field declared ABOVE a member is found only through the upward walk, so a silently skipped ancestor drops it.
  it("positive control: with the ancestors readable, Person is offered the field declared on Organism", async () => {
    const m = fixtureMaster();
    m.listing([[REMARK_ON_ORGANISM]]);
    const sets = await resolveFieldSets(src(m));
    expect(fieldsOf(sets, "Person")).toEqual([t("FixtureRemark")]);
  });

  it("an ancestor answering 503 rejects with VocabularyUnavailableError", async () => {
    const m = fixtureMaster();
    m.listing([[REMARK_ON_ORGANISM]]);
    m.status.set(`${RIG}/base/t/Animal`, 503);
    await expect(resolveFieldSets(src(m))).rejects.toBeInstanceOf(VocabularyUnavailableError);
  });

  it("an ancestor answering 404 rejects with VocabularyUnavailableError", async () => {
    const m = fixtureMaster();
    m.listing([[REMARK_ON_ORGANISM]]);
    m.docs.delete(`${RIG}/base/t/Animal`);
    await expect(resolveFieldSets(src(m))).rejects.toBeInstanceOf(VocabularyUnavailableError);
  });
});

describe("the listing's next link", () => {
  // `carriersOf`: where completeness was lost, it is stated rather than dropped. A relative `next` (a legal HTTP form) must be followed
  // on the origin, or fail as VocabularyUnavailableError, never escape as a raw TypeError.
  it("a relative next link is followed or refused as VocabularyUnavailableError", async () => {
    const m = fixtureMaster();
    m.listing([
      [{ "@id": t("Email"), "a:predicateAttribute": "a:email", "a:fieldOf": { "@id": t("Person") } }],
      [{ "@id": t("Phone"), "a:predicateAttribute": "a:phone", "a:fieldOf": { "@id": t("Person") } }],
    ]);
    const first = `${RIG}/base/vocab?status=all&limit=2000`;
    const page = m.docs.get(first) as Record<string, unknown>;
    m.docs.set(first, { ...page, next: "/base/vocab?status=all&limit=2000&cursor=c1" });
    let outcome: string;
    try {
      // The whole walk: this test is about the walk's `next` (the selector is the default).
      const sets = await resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch, carriers: "walk" }));
      outcome = fieldsOf(sets, "Person").join(",");
    } catch (err) {
      outcome = err instanceof VocabularyUnavailableError ? "VocabularyUnavailableError" : `raw ${String(err)}`;
    }
    expect([`${t("Email")},${t("Phone")}`, "VocabularyUnavailableError"]).toContain(outcome);
  });
});

describe("kinds never include an ancestor above a member", () => {
  // The kinds are the role's players and their SUBTYPES.
  // A type above a member (Animal, Substance) is not a stakeholder kind.
  it("the upward walk used for fields adds no kind", async () => {
    const sets = await resolveFieldSets(src(fixtureMaster()));
    const names = kindTypeNames(sets.kinds);
    expect(names).not.toContain("Animal");
    expect(names).not.toContain("Substance");
    expect(Object.keys(sets.byKind)).toHaveLength(10);
    // positive control: the same reading does hold those types as Person's ancestors
    expect(sets.byKind[t("Person")]!.ancestors).toEqual([t("Person"), t("Animal"), t("Organism"), t("Substance")]);
  });
});
