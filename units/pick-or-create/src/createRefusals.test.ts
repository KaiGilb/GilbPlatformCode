// Refusals of the create and the picker: no agent, no default vault, a stater given as a field, a row of a type that is not a
// stakeholder kind, a page that says "more" and gives nothing, and a reference to a party's identity.
import { describe, it, expect } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { createRecord, CreateRefusedError, findCandidates, pickByTag, readPickerVocabulary, type CreateInput, type Picker } from "./pickOrCreate";
import { fixtureMaster, RIG, t, a } from "../test/support";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { fixturePlatform, VAULT_HOST, type FixturePlatform } from "../test/fixturePlatform";

const VAULT = "https://ann.example.test/vault";
const HOLDER = "https://ann.example.test/vault/e/ann-self-card";
const AGENT = "https://ann.example.test/vault/e/app-ourapp";

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

describe("refusals of the create", () => {
  it("a create with no agent is refused before any request", async () => {
    const { picker, p } = await setup();
    expect(await reasonOf(createRecord(picker, ben({ agent: "" })))).toBe("no-agent");
    expect(await reasonOf(createRecord(picker, ben({ agent: undefined as unknown as string })))).toBe("no-agent");
    expect(p.requests.length).toBe(0);
  });

  it("find and pick-by-tag have no default vault: no vault named, no request", async () => {
    const { picker, p } = await setup();
    expect(await reasonOf(findCandidates(picker, { vaultId: "" }))).toBe("no-vault");
    expect(await reasonOf(pickByTag(picker, { vaultId: "", tag: "ben" }))).toBe("no-vault");
    expect(await reasonOf(findCandidates(picker, { vaultId: "ann" }))).toBe("no-vault");
    expect(p.requests.length).toBe(0);
  });

  it("a stater that the master offered as a field is still set from `holder` only", async () => {
    const { picker, p } = await setup();
    const person = picker.reading.fieldSets.byKind[t("Person")]!;
    person.fields.push({ term: a("statedBy"), label: "stated by", readKeys: ["a:statedBy", "statedBy"], writeKey: "a:statedBy", writeKeyProblem: null, encoding: "inline-literal:text", declaredOn: [t("Person")], record: null } as never);
    // A reference field is refused earlier, as not writable, so that form does not reach the
    // guard under test. With a text encoding it does. Removing the guard does NOT write the agent. The stater is set from `holder` on the next
    // line either way. What the guard does is refuse, instead of silently dropping what was
    // passed; this test goes red without it because the create is then no longer refused.
    expect(await reasonOf(createRecord(picker, ben({ fields: { "a:statedBy": AGENT } })))).toBe("field-ambiguous");
    expect(p.entities.size).toBe(0);
  });
});

describe("the find does not trust the list blindly", () => {
  it("a row of a type that is not a stakeholder kind is not a candidate, even when the server sends it", async () => {
    const { picker, p } = await setup();
    p.failNext("GET", "/lws/vault/", 200, {
      complete: true,
      records: [
        // Each row names its vault, as the platform serves it (the test is
        // about the type check; the placement is the named vault's).
        { entity: `${VAULT_HOST}/base/e/pump1`, typeUri: "t:Pump", label: "Pump 1", vault: VAULT, vaultAmbiguous: false },
        { entity: `${VAULT_HOST}/base/e/ben1`, typeUri: "t:Person", label: "Ben", vault: VAULT, vaultAmbiguous: false },
      ],
    });
    const found = await findCandidates(picker, { vaultId: VAULT });
    expect(found.candidates.map((c) => c.record)).toEqual([`${VAULT_HOST}/base/e/ben1`]);
  });

  it("a page that says 'more' and gives nothing ends the walk as incomplete, in one request", async () => {
    const { picker, p } = await setup();
    p.failNext("GET", "/lws/vault/", 200, { complete: false, records: [] });
    const found = await findCandidates(picker, { vaultId: VAULT });
    expect(found.complete).toBe(false);
    expect(found.pages).toBe(1);
    expect(p.count("GET", "/lws/vault/")).toBe(1);
  });
});

describe("a holder-side reference names a record of the holder's vault, never a party's identity", () => {
  // Every holder-side fact about a party points at the holder's own record for that party, never at the party's own identity.
  // No function of the unit accepts or returns a party's own identity.
  it("a reference field given an IRI that is no record of the named vault is not written", async () => {
    const { picker, p } = await setup();
    const partyIdentity = "https://id.example.test/base/p/00000000-0000-4000-8000-00000000000a";
    let outcome = "written";
    try {
      await createRecord(picker, ben({ fields: { "a:actsOnBehalfOf": { "@id": partyIdentity } } }));
    } catch {
      outcome = "refused";
    }
    const stored = [...p.entities.values()].filter((e) => JSON.stringify(e.facts).includes(partyIdentity));
    expect({ outcome, recordsNamingTheIdentity: stored.length }).toEqual({ outcome: "refused", recordsNamingTheIdentity: 0 });
  });
});
