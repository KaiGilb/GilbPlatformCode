// A reference at create is written only to the holder's own record.
//
// Refused, with nothing sent: a target that is a party's identity, a principal, a record of another vault, or an IRI the typed list
// does not hold. Each ruled shape is written with a checked target.
//
// Expected values are LITERALS. The master is `fixtureMaster` refreshed by `withReferenceTerms`; the platform is `fixturePlatform`.
import { describe, it, expect } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { createRecord, CreateRefusedError, readPickerVocabulary, type Picker } from "./pickOrCreate";
import {
  addReference,
  ReferenceRefusedError,
  ReferenceUnknownError,
} from "@kaigilb/gilbplatformcode-holder-reference";
import { fixtureMaster, RIG, t, a } from "../test/support";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { withReferenceTerms } from "../test/fixtureReference";
import { fixturePlatform, VAULT_HOST, type FixturePlatform } from "../test/fixturePlatform";

const VAULT = "https://ann.example.test/vault";
const OTHER_VAULT = "https://ann2.example.test/vault";
const HOLDER = `${VAULT_HOST}/base/e/ann-self-card`;
const AGENT = "https://id.example.test/base/p/0b6c9a52-agent";
/** A party's identity anchor and an account principal, as GilbPlatform mints them. */
const IDENTITY = "https://id.example.test/base/p/7d1e2f30-4a5b-4c6d-8e9f-0a1b2c3d4e5f";

async function setup(mutate?: (m: ReturnType<typeof fixtureMaster>) => void) {
  const m = withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));
  mutate?.(m);
  const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
  const reading = await readPickerVocabulary(source, await resolveFieldSets(source), { references: true });
  // Served at the named vault's own origin: the package's writers refuse any other.
  const p = fixturePlatform({ origin: new URL(VAULT).origin });
  p.reach.add(VAULT).add(OTHER_VAULT);
  const picker: Picker = { platform: { origin: p.origin, fetch: p.fetch }, reading, master: source };
  return { picker, p, m };
}

/** Writes sent to the platform: anything but a GET. */
const writes = (p: FixturePlatform) => p.requests.filter((r) => r.method !== "GET").length;

async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ReferenceRefusedError || err instanceof CreateRefusedError) return err.reason;
    if (err instanceof ReferenceUnknownError) return "unknown";
    throw err;
  }
  return "resolved";
}

function seedWorld(p: FixturePlatform) {
  return {
    ben: p.seed(VAULT, "t:Person", { "a:name": "Ben", "a:email": "ben@example.test" }),
    acme: p.seed(VAULT, "t:Organization", { "a:name": "Acme AS" }),
    owners: p.seed(VAULT, "t:PartyGroup", { "a:name": "Owners" }),
    systems: p.seed(VAULT, "t:SoftwareSystemGroup", { "a:name": "Our systems" }),
    things: p.seed(VAULT, "t:ObjectGroup", { "a:name": "Things we keep" }),
    ourapp: p.seed(VAULT, "t:SoftwareSystem", { "a:name": "Our app" }),
    bot: p.seed(VAULT, "t:AiAgent", { "a:name": "Our bot" }),
    project: p.seed(VAULT, "t:Project", { "a:name": "Project X" }),
    benElsewhere: p.seed(OTHER_VAULT, "t:Person", { "a:name": "Ben" }),
    ownersElsewhere: p.seed(OTHER_VAULT, "t:PartyGroup", { "a:name": "Owners" }),
    selfCardElsewhere: p.seed(OTHER_VAULT, "t:Person", { "a:name": "Ann (vault 2)" }),
  };
}

describe("refused, with nothing sent", () => {

  it("a create whose member-of names another vault's group or an identity is refused before its first write", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    const before = p.entities.size;
    for (const target of [w.ownersElsewhere, IDENTITY]) {
      expect(
        await reason(createRecord(picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Mona Lisa", fields: { "a:memberOf": { "@id": target } } })),
      ).toBe("not-in-vault");
    }
    expect(p.entities.size).toBe(before);
    expect(writes(p)).toBe(0);
  });
});

describe("the type each reference admits is read live", () => {

  it("a:skill stays refused at create, as before", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    expect(await reason(createRecord(picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Mona", fields: { "a:skill": { "@id": w.project } } }))).toBe("field-not-writable");
    expect(writes(p)).toBe(0);
  });
});

describe("not known yet is never 'admits nothing'", () => {

  it("with no reference reading at all, a create refuses the reference field as before", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    delete picker.reading.references;
    expect(await reason(createRecord(picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Mona", fields: { "a:memberOf": { "@id": w.owners } } }))).toBe("field-not-writable");
    expect(writes(p)).toBe(0);
  });
});

describe("each ruled shape is written with a checked target", () => {

  it("row 4 at create: a member-of edge is written as the checked reference; two as a list", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    const one = await createRecord(picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Mona Lisa", fields: { "a:memberOf": { "@id": w.owners } } });
    expect(p.entities.get(one.record)!.facts["a:memberOf"]).toEqual({ "@id": w.owners });
    const two = await createRecord(picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Ola Nordmann", fields: { "a:memberOf": [w.owners, { "@id": w.things }] } });
    expect(p.entities.get(two.record)!.facts["a:memberOf"]).toEqual([{ "@id": w.owners }, { "@id": w.things }]);
  });

  it("rows 6 and 7 at create: acts-on-behalf-of and the preferred channel, checked against the facts being written", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    const made = await createRecord(picker, {
      vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Mona Lisa",
      fields: { "a:email": "mona@example.test", "a:actsOnBehalfOf": { "@id": w.acme }, "a:preferredChannel": { "@id": a("email") } },
    });
    const facts = p.entities.get(made.record)!.facts;
    expect(facts["a:actsOnBehalfOf"]).toEqual({ "@id": w.acme });
    expect(facts["a:preferredChannel"]).toEqual({ "@id": a("email") });
    // No email given: the preferred channel names nothing the record holds.
    expect(await reason(createRecord(picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Ola", fields: { "a:preferredChannel": { "@id": a("email") } } }))).toBe("carrier-holds-no-value");
  });

  it("a member-of added to an existing record is one merge patch of that field, keeping the values it had", async () => {
    const { picker, p } = await setup();
    const w = seedWorld(p);
    const made = await createRecord(picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Mona Lisa", fields: { "a:memberOf": { "@id": w.owners } } });
    const added = await addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: made.record, field: "a:memberOf", target: w.things });
    expect(added.value).toEqual({ "@id": w.things });
    const patch = p.requests.filter((r) => r.method === "PATCH");
    expect(patch).toHaveLength(1);
    expect(patch[0]!.body).toEqual({ "a:memberOf": [{ "@id": w.owners }, { "@id": w.things }] });
    expect(patch[0]!.headers["content-type"]).toBe("application/merge-patch+json");
    expect(patch[0]!.headers["x-base-agent"]).toBe(AGENT);
    expect(p.entities.get(made.record)!.facts["a:name"]).toBe("Mona Lisa");
    // The same target again sends the field unchanged, never a duplicate.
    await addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: made.record, field: "a:memberOf", target: w.things });
    expect(p.requests.filter((r) => r.method === "PATCH")[1]!.body).toEqual({ "a:memberOf": [{ "@id": w.owners }, { "@id": w.things }] });
  });
});
