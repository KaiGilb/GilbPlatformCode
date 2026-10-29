// The create path refuses what the ontology's rules forbid, with nothing sent:
//   - a list to a one-value reference field, and an empty list to any, are refused at create;
//   - naming a vault, a record held in a vault NESTED in it is refused for every record reference, and nothing is written.
// The fixture is served at the named vault's own origin (the writers refuse any other), and each row of the typed list names its vault.
import { describe, it, expect } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { createRecord, CreateRefusedError, readPickerVocabulary, type Picker } from "./pickOrCreate";
import { addReference, checkReference, PartialReferenceError, ReferenceRefusedError, ReferenceUnknownError, writeRoleRecord } from "@kaigilb/gilbplatformcode-holder-reference";
import { fixtureMaster, RIG, CONTEXT, t, a } from "../test/support";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { withReferenceTerms } from "../test/fixtureReference";
import { fixturePlatform, VAULT_HOST, type FixturePlatform } from "../test/fixturePlatform";

const VAULT = "https://ann.example.test/vault";
const CHILD_VAULT = "https://annchild.example.test/vault";
const HOLDER = `${VAULT_HOST}/base/e/ann-self-card`;
const AGENT = "https://id.example.test/base/p/0b6c9a52-agent";
type M = ReturnType<typeof fixtureMaster>;

async function setup(mutate?: (m: M) => void) {
  const m = withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));
  // a/phone at its own address, as a/email is served (live 2026-10-02T09:50:57Z: a/email names
  // a:typeUri t/Email and a:predicateAttribute a:email).
  m.put("a/phone", { "@context": CONTEXT, "@id": a("phone"), "a:predicateAttribute": "a:phone", "a:typeUri": t("Phone"), "a:subTypeOf": { "@id": t("ElectronicContactPoint") } });
  mutate?.(m);
  const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
  const reading = await readPickerVocabulary(source, await resolveFieldSets(source), { references: true });
  const p = fixturePlatform({ origin: new URL(VAULT).origin });
  p.reach.add(VAULT).add(CHILD_VAULT);
  const picker: Picker = { platform: { origin: p.origin, fetch: p.fetch }, reading, master: source };
  return { picker, p, m, source };
}
const writes = (p: FixturePlatform) => p.requests.filter((r) => r.method !== "GET").length;
async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ReferenceRefusedError || err instanceof CreateRefusedError) return err.reason;
    if (err instanceof ReferenceUnknownError) return "unknown";
    if (err instanceof PartialReferenceError) return "partial";
    throw err;
  }
  return "resolved";
}

describe("decisions of the create path", () => {

  it("a list to a one-value reference field, and an empty list to any, are refused at create with nothing sent", async () => {
    const { picker, p } = await setup();
    expect(await reason(createRecord(picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Mona", fields: { "a:email": "m@x.test", "a:preferredChannel": [{ "@id": a("email") }] } }))).toBe("field-value");
    expect(await reason(createRecord(picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Mona", fields: { "a:memberOf": [] } }))).toBe("field-value");
    expect(writes(p)).toBe(0);
  });
});

describe("a record held in a nested vault", () => {
  // GilbPlatform `GET /lws/vault/<v>/records` scans the named vault AND every vault nested in it
  // that the caller reaches (`scopeVaultIds`). The fixture models the platform itself, where each row
  // names its vault (`p.nest`).
  function nestedScan(p: FixturePlatform, picker: Picker) {
    p.nest(VAULT, CHILD_VAULT);
    void picker;
  }

  it("naming a vault, a record held in a vault NESTED in it is refused for every record reference, and nothing is written", async () => {
    const { picker, p } = await setup();
    nestedScan(p, picker);
    const ben = p.seed(VAULT, "t:Person", { "a:name": "Ben" });
    const owners = p.seed(VAULT, "t:PartyGroup", { "a:name": "Owners" });
    const childBen = p.seed(CHILD_VAULT, "t:Person", { "a:name": "Ben (child vault)" });
    const childOwners = p.seed(CHILD_VAULT, "t:PartyGroup", { "a:name": "Owners (child vault)" });
    const childAcme = p.seed(CHILD_VAULT, "t:Organization", { "a:name": "Acme (child vault)" });
    // Controls: the vault's own records pass.
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: owners }))).toBe("resolved");
    const got = {
      memberOf: await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: childOwners })),
      heldParty: await reason(checkReference(picker, { vaultId: VAULT, field: "a:heldParty", carrierType: "HeldPartyFieldClaim", target: childBen })),
      actsOnBehalfOf: await reason(checkReference(picker, { vaultId: VAULT, field: "a:actsOnBehalfOf", carrierType: "Person", target: childAcme })),
      roleRecord: await reason(writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player: childBen, group: owners })),
      create: await reason(createRecord(picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Mona", fields: { "a:memberOf": { "@id": childOwners } } })),
      add: await reason(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: ben, field: "a:memberOf", target: childOwners })),
    };
    expect(got).toEqual({ memberOf: "not-in-vault", heldParty: "not-in-vault", actsOnBehalfOf: "not-in-vault", roleRecord: "not-in-vault", create: "not-in-vault", add: "not-in-vault" });
    expect(writes(p)).toBe(0);
  });
});
