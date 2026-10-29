// Lists given to reference and text fields: a reference given as `reference:@id`, a list to a multi text field and a list of one
// item to a one-value field are refused, and nothing is written.
import { describe, it, expect } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { createRecord, CreateRefusedError, readPickerVocabulary, type CreateInput, type Picker } from "./pickOrCreate";
import { a, fixtureMaster, RIG, t } from "../test/support";
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
describe("the reference refusal, for the token two of the three served reference fields carry", () => {
  it("a field whose term declares `reference:@id`, as the served a/memberOf does, is not written", async () => {
    // Served 2026-09-30T08:29:30Z (my reading): a/memberOf and a/preferredChannel declare
    // `reference:@id`; a/actsOnBehalfOf declares `reference`. Since 24ca2c3 the fixture's one
    // plain reference field carries the bare token, so no test met `reference:@id`.
    const { picker, p } = await setup();
    const person = picker.reading.fieldSets.byKind[t("Person")]!;
    person.fields.push({ term: a("memberOf"), label: "member of", readKeys: ["a:memberOf", "memberOf"], writeKey: "a:memberOf", writeKeyProblem: null, encoding: "reference:@id", many: true, declaredOn: [t("Person")], record: null } as never);
    for (const value of [{ "@id": IDENTITY }, [{ "@id": IDENTITY }], IDENTITY, [IDENTITY]])
      expect(await reasonOf(createRecord(picker, ben({ fields: { "a:memberOf": value as never } })))).toBe("field-not-writable");
    expect({ stored: naming(p, IDENTITY), requests: p.requests.length }).toEqual({ stored: 0, requests: 0 });
  });
});

describe("a list is checked as a list AND item by item", () => {
  it("positive control: a list of texts to a multi field is written", async () => {
    const { picker, p } = await setup();
    const made = await createRecord(picker, ben({ fields: { "a:phone": ["+47 1", "+47 2"] } }));
    expect(p.entities.get(made.record)!.facts["a:phone"]).toEqual(["+47 1", "+47 2"]);
  });

  it("a list to a multi text field is refused when one item is a reference, a blank, a record or not text; nothing is written", async () => {
    const { picker, p } = await setup();
    const bad: unknown[] = [{ "@id": IDENTITY }, " ", { record: { "a:org": "x" } }, 7, null, ["+47 3"]];
    for (const item of bad)
      expect(await reasonOf(createRecord(picker, ben({ fields: { "a:phone": ["+47 1", item] as never } })))).toBe("field-value");
    expect(await reasonOf(createRecord(picker, ben({ fields: { "a:phone": [{ "@id": IDENTITY }] as never } })))).toBe("field-value");
    expect({ stored: naming(p, IDENTITY), entities: p.entities.size, requests: p.requests.length }).toEqual({ stored: 0, entities: 0, requests: 0 });
  });

  it("a list of ONE item to a one-value field is refused, as a list of two is", async () => {
    const { picker, p } = await setup();
    expect(await reasonOf(createRecord(picker, ben({ fields: { "a:email": ["ben@example.test"] } })))).toBe("field-value");
    expect(await reasonOf(createRecord(picker, ben({ fields: { "a:employment": { record: { "a:org": ["Acme"] } } } })))).toBe("field-value");
    expect({ entities: p.entities.size, requests: p.requests.length }).toEqual({ entities: 0, requests: 0 });
  });
});
