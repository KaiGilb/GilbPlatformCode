// The reference refusal holds for every shape a caller can give, and an empty list is not a value.
import { describe, it, expect } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { createRecord, CreateRefusedError, readPickerVocabulary, type CreateInput, type Picker } from "./pickOrCreate";
import { fixtureMaster, RIG, t } from "../test/support";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { fixturePlatform, type FixturePlatform } from "../test/fixturePlatform";

const VAULT = "https://ann.example.test/vault";
const HOLDER = "https://ann.example.test/vault/e/ann-self-card";
const AGENT = "https://ann.example.test/vault/e/app-ourapp";
const IDENTITY = "https://id.example.test/base/p/00000000-0000-4000-8000-00000000000a";

async function setup(): Promise<{ picker: Picker; p: FixturePlatform }> {
  const m = withWritableFields(withTagStandard(fixtureMaster()));
  const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
  const reading = await readPickerVocabulary(source, await resolveFieldSets(source));
  // createRecord, like every writer, refuses an origin that is not the named
  // vault's own host, so the fixture is served at the vault's own origin.
  const p = fixturePlatform({ origin: new URL(VAULT).origin });
  p.reach.add(VAULT);
  return { picker: { platform: { origin: p.origin, fetch: p.fetch }, reading }, p };
}
const ben = (over: Partial<CreateInput> = {}): CreateInput => ({ vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Ben Lee", ...over });
const reasonOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (err) {
    if (err instanceof CreateRefusedError) return err.reason;
    throw err;
  }
  return "not refused";
};
const naming = (p: FixturePlatform, text: string) => [...p.entities.values()].filter((e) => JSON.stringify(e.facts).includes(text)).length;

// Every holder-side fact about a party points at the holder's own record for that party, never at the party's own identity.
describe("the reference refusal holds for every shape a caller can give", () => {
  it("positive control: the same create with a text field writes a record", async () => {
    const { picker, p } = await setup();
    const made = await createRecord(picker, ben({ fields: { "a:email": "ben@example.test" } }));
    expect(p.entities.get(made.record)!.facts["a:email"]).toBe("ben@example.test");
  });

  it("a reference given inside a list is not written", async () => {
    const { picker, p } = await setup();
    expect(await reasonOf(createRecord(picker, ben({ fields: { "a:actsOnBehalfOf": [{ "@id": IDENTITY }] } })))).toBe("field-not-writable");
    expect({ stored: naming(p, IDENTITY), requests: p.requests.length }).toEqual({ stored: 0, requests: 0 });
  });

  it("a reference field given the IRI as text is not written", async () => {
    const { picker, p } = await setup();
    expect(await reasonOf(createRecord(picker, ben({ fields: { "a:actsOnBehalfOf": IDENTITY } })))).toBe("field-not-writable");
    expect(await reasonOf(createRecord(picker, ben({ fields: { "a:actsOnBehalfOf": [IDENTITY] } })))).toBe("field-not-writable");
    expect({ stored: naming(p, IDENTITY), requests: p.requests.length }).toEqual({ stored: 0, requests: 0 });
  });

  it("a field whose term declares the bare token `reference`, as the served a/actsOnBehalfOf does, is not written", async () => {
    // Served 2026-09-30T08:14:39Z: https://ontology.platform.example.test/base/a/actsOnBehalfOf a:encoding "reference".
    // The fixture declares "reference:@id" for the same field, so the builder's tests never meet this token.
    const { picker, p } = await setup();
    const field = picker.reading.fieldSets.byKind[t("Person")]!.fields.find((f) => f.writeKey === "a:actsOnBehalfOf")!;
    (field as { encoding: string | null }).encoding = "reference";
    expect(await reasonOf(createRecord(picker, ben({ fields: { "a:actsOnBehalfOf": { "@id": IDENTITY } } })))).toBe("field-not-writable");
    expect({ stored: naming(p, IDENTITY), requests: p.requests.length }).toEqual({ stored: 0, requests: 0 });
  });
});

// The employment record carries "only the fields … that the
// person filled in", and `a:org` = the typed text. The create's own rules: a blank text is refused
// (field-value), a held record with no facts is refused, a record field given no entry is refused.
describe("an empty list is not a value", () => {
  it("a text field given an empty list is refused, and nothing is written", async () => {
    const { picker, p } = await setup();
    let outcome = "written";
    try {
      await createRecord(picker, ben({ fields: { "a:email": [] } }));
    } catch (err) {
      outcome = err instanceof CreateRefusedError ? err.reason : "threw";
    }
    expect({ outcome, entities: p.entities.size }).toEqual({ outcome: "field-value", entities: 0 });
  });

  it("a held record whose only field is an empty list is refused as a record with no facts", async () => {
    const { picker, p } = await setup();
    let outcome = "written";
    try {
      await createRecord(picker, ben({ fields: { "a:employment": { record: { "a:org": [] } } } }));
    } catch (err) {
      outcome = err instanceof CreateRefusedError ? err.reason : "threw";
    }
    expect({ outcome, entities: p.entities.size }).toEqual({ outcome: "field-value", entities: 0 });
  });
});
