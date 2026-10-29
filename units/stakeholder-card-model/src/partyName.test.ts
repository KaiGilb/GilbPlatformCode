// The pure rules: a party's name, the card's extra-fact rule while the kinds are not known, and the card's set split.
// Real functions imported; the package's own predicates read from its own fixture master.
import { describe, expect, it } from "vitest";
import type { RecordFacts } from "@kaigilb/gilbplatformcode-lws-records";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { fixtureMaster, RIG } from "../test/support";
import { withReferenceTerms } from "../test/fixtureReference";
import { PARTY_NAME_FLOOR, partyNameKeys, partyNameOf, partySavePatch } from "./partyName";
import { extraFactEditable, factsTheCardKeeps, packageReferenceFactKeys, splitSetFields, cardFieldOf } from "./stakeholderCardModel";

/** The facts a record holds after a merge-patch body (bare slugs; `null` deletes). Pure. */
export function factsAfterPatch(served: RecordFacts, patch: Readonly<Record<string, string | null>>): RecordFacts {
  const out: RecordFacts = { ...served };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}

const floorRule = { keys: partyNameKeys(null) };

describe("every reader takes a:name first, then a:label, never a:title", () => {
  it("a record holding a:name and a different a:label: the party name is a:name", () => {
    expect(partyNameOf({ name: "Ben", label: "Ann Berg" })).toBe("Ben");
  });
  it("a label-only party record: the party name is the label (the fallback holds)", () => {
    expect(partyNameOf({ label: "Ann Berg" })).toBe("Ann Berg");
  });
  it("a:title is not a party name: a record with only a title reads no party name", () => {
    expect(partyNameOf({ title: "Ann Berg" })).toBeNull();
  });
  it("with the session reading's predicates, the package's own readPartyName gives the same answers", async () => {
    const m = withReferenceTerms(fixtureMaster());
    const sets = await resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }));
    const p = sets.kinds.predicates;
    expect(partyNameOf({ name: "Ben", label: "Ann Berg" }, p)).toBe("Ben");
    expect(partyNameOf({ label: "Ann Berg" }, p)).toBe("Ann Berg");
    expect(partyNameOf({ title: "Ann Berg" }, p)).toBeNull();
    // The floor's spellings equal the master's (the dated snapshot names its source).
    expect(partyNameKeys(p)).toEqual({ name: PARTY_NAME_FLOOR.name, legacy: [...PARTY_NAME_FLOOR.legacy] });
  });
});

describe("what a party save sends", () => {
  it("a label-only party renamed: a:name only, the label retracted, no title key", () => {
    const served = { label: "Ann Berg", title: "Ann Berg" };
    const body = partySavePatch(served, { name: "Ben", label: "Ann Berg", title: "Ann Berg" }, floorRule);
    expect(body).toEqual({ name: "Ben", label: null });
    expect("title" in body).toBe(false);
  });
  it("a party held under a:name renamed: no label and no title key at all", () => {
    const body = partySavePatch({ name: "Ann" }, { name: "Ben" }, floorRule);
    expect(body).toEqual({ name: "Ben" });
  });
  it("a:title is not retracted: after the rename the title stays", () => {
    const served = { label: "Ann Berg", title: "Ann Berg" };
    const after = factsAfterPatch(served, partySavePatch(served, { name: "Ben" }, floorRule)) as Record<string, string>;
    expect(after.title).toBe("Ann Berg");
    expect(after.label).toBeUndefined();
  });
  it("an untouched fact is not sent, and a save that does not change the name writes no label", () => {
    expect(partySavePatch({ name: "Ann", label: "Ann Berg" }, { name: "Ann", email: "" }, floorRule)).toEqual({});
    expect(partySavePatch({ label: "Ann Berg" }, { name: "", phone: "1" }, floorRule)).toEqual({ phone: "1" });
  });
  it("a kept fact is neither written nor retracted, whatever it holds", () => {
    const keep = new Set(["memberOf"]);
    expect(partySavePatch({ name: "Ann", memberOf: "Acme team" }, { name: "Ben", memberOf: "https://q/vault/e/g" }, floorRule, { keep })).toEqual({ name: "Ben" });
    expect(partySavePatch({ name: "Ann", memberOf: "Acme team" }, { name: "Ben" }, floorRule, { keep, retractable: () => true })).toEqual({ name: "Ben" });
  });
});

describe("while the kinds are not known, a reference field is decided by its NAME", () => {
  const reading = { state: "reading" } as const;
  const kinds503 = { state: "kinds-not-known", reason: "503" } as const;
  it("a fact named as a package reference is not editable whatever its value; another fact is", () => {
    const refs = packageReferenceFactKeys();
    expect(refs.has("memberOf")).toBe(true);
    for (const state of [reading, kinds503]) {
      expect(extraFactEditable("memberOf", false, state)).toBe(false);
      expect(extraFactEditable("memberOf", true, state)).toBe(false);
      expect(extraFactEditable("phone", false, state)).toBe(true);
      expect(extraFactEditable("phone", true, state)).toBe(false);
      expect(factsTheCardKeeps(state, { name: "Ann", memberOf: "Acme team", phone: "1" })).toEqual(["memberOf"]);
    }
    expect(extraFactEditable("phone", false, { state: "not-a-stakeholder-kind" })).toBe(true);
    expect(factsTheCardKeeps({ state: "not-a-stakeholder-kind" }, { memberOf: "x" })).toEqual([]);
  });
});

describe("the card's set split is a pure function", () => {
  it("a literal held under another spelling, or holding several values, is shown and not edited", async () => {
    const m = withReferenceTerms(fixtureMaster());
    const sets = await resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }));
    const person = Object.values(sets.byKind).find((k) => k.name === "Person")!;
    const fields = person.fields.map(cardFieldOf);
    const lit = fields.find((f) => f.mode === "card-edit" && f.slug)!;
    expect(splitSetFields(fields, {}).editable.map((f) => f.term)).toContain(lit.term);
    const several = splitSetFields(fields, { [lit.slug!]: ["a", "b"] as unknown as string });
    expect(several.editable.map((f) => f.term)).not.toContain(lit.term);
    expect(several.other.find((f) => f.term === lit.term)!.shownBecause).toMatch(/several values/);
  });
});

describe("the retraction of the legacy label is a party's only", () => {
  it("retractLegacy false: a changed name is written, the label is not retracted", () => {
    expect(partySavePatch({ name: "Alpha", label: "Alpha" }, { name: "Beta" }, { keys: partyNameKeys(null), retractLegacy: false })).toEqual({ name: "Beta" });
    expect(partySavePatch({ name: "Alpha", label: "Alpha" }, { name: "Beta" }, { keys: partyNameKeys(null) })).toEqual({ name: "Beta", label: null });
  });
});
