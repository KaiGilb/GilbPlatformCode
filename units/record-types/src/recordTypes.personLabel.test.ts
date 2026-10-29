/**
 * THE REGISTRY MAY CACHE A TERM'S LABEL; IT MAY NEVER DISAGREE WITH IT.
 *
 * Ruling, 2026-09-16, on the G4 question referred to it as sole minter
 * ([[Rule_Code_gilbveda-ontology-master#RuleBvmasterSoleMinter]]):
 *   · the persisted type is `t:Person` and it is CORRECT — nothing in the backend writes `t:Contact`
 *     (positive control: the same sweep DID find `t:ContactPrivateNote`, so it can see the shape)
 *   · `t:Contact` is a RELATION on the live master — `a:nodeKind: "relation"`,
 *     `a:predicateAttribute: "a:hasContact"` — and "Contact" is ITS `a:label`
 *   · `t:Person`'s own `a:label` is "Person"
 *   ⇒ displaying "Contact" over `t:Person` is one word across two meanings: RuleBpontHomonym.
 *
 * ⚠ The cost is measured, not hypothetical. A user read "Contact" on a correctly-typed record and
 * filed an ontology defect at severity-highest against data that was right.
 *
 * ⛔ These tests assert the DERIVED shape — a spec's display label may not be another live term's
 * label — ⛔ not the defect ([[Rule_Code_gilb-testing-discrimination#RuleBasetestNoDefectAssertion]]).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RECORD_TYPES, RECORD_TYPE_BY_ID, resolveType, typeUri } from "./recordTypes";
import { resetBaseOrigin, setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";

beforeEach(() => setBaseOrigin("https://platform.example.test"));
afterEach(() => resetBaseOrigin());

/** Live `a:label`s on `https://ontology.example.test/base` that name something OTHER than an entity type
 *  a record may carry. A spec that displays one of these has taken a word that is already taken. */
const LABELS_OWNED_BY_OTHER_TERMS: Readonly<Record<string, string>> = {
  Contact: "t:Contact — a RELATION (a:nodeKind 'relation', a:predicateAttribute 'a:hasContact')",
};

describe("Cycle182 G4 — the registry's label never contradicts the ontology", () => {
  it("no spec displays a label that is another live term's label", () => {
    const offenders = RECORD_TYPES.filter((t) => t.label in LABELS_OWNED_BY_OTHER_TERMS).map(
      (t) => `${t.typeName} displays "${t.label}" — owned by ${LABELS_OWNED_BY_OTHER_TERMS[t.label]}`,
    );
    expect(offenders).toEqual([]);
  });

  it("the Person spec is named Person, not Contact", () => {
    const person = RECORD_TYPES.find((t) => t.typeName === "Person");
    expect(person).toBeDefined();
    // The ontology's own word for this term. ⛔ Not a preference — `t:Person` a:label = "Person".
    expect(person!.label).toBe("Person");
    expect(person!.id).toBe("person");
  });

  it("a record stored as t:Person resolves to the Person spec and reads 'Person'", () => {
    const spec = resolveType(typeUri("Person"));
    expect(spec?.label).toBe("Person");
  });

  it("a legacy record stored as t:Contact still RESOLVES — the read alias is untouched", () => {
    // ⛔ Dropping `aliasTypeNames` would make every pre-2026-07-15 row unresolvable. The alias is
    // the READ path and this pins that the label repair did not take it away.
    // ⚠ Flags, and this increment does NOT close, that such a row renders identically to
    // a correct `t:Person` one — which hides how much of that debt exists. Owed, named, not fixed.
    expect(resolveType(typeUri("Contact"))?.typeName).toBe("Person");
  });

  it("a stored local id of 'contact' still resolves after the rename", () => {
    // `resolveType` takes a local id from a route param / saved filter / TypeIcon prop. A person
    // whose saved view names `contact` must not lose it on deploy.
    expect(RECORD_TYPE_BY_ID["contact"]?.typeName).toBe("Person");
    expect(resolveType("contact")?.id).toBe("person");
  });
});
