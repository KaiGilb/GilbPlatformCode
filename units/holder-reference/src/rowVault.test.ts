// A reference's target is in the named vault exactly when its typed-list row's `vault` equals that vault. The package half of the
// platform's per-row vault answer. Also: `createRecord` refuses another origin before any request (not ported: the create path is
// not in this unit).
import { describe, it, expect } from "vitest";
import type { ReferencePicker } from "./holderReference";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { VocabularyUnavailableError } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { readReferenceReading } from "../test/readingOf";
import { addReference, checkReference, PartialReferenceError, ReferenceRefusedError, ReferenceUnknownError, writeRoleRecord } from "./holderReference";
import { PlacementUnknownError, rowPlacement } from "./rowVault";
import { fixtureMaster, RIG, t } from "../test/support";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { withReferenceTerms } from "../test/fixtureReference";
import { fixturePlatform, PLATFORM_RIG, VAULT_HOST, type FixturePlatform } from "../test/fixturePlatform";

const VAULT = "https://ann.example.test/vault";
const CHILD_VAULT = "https://annchild.example.test/vault";
const HOLDER = `${VAULT_HOST}/base/e/kai-self-card`;
const AGENT = "https://id.example.test/base/p/0b6c9a52-agent";

async function setup(opts: { rowVault?: boolean; origin?: string } = {}) {
  const m = withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));
  const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
  const reading = await readReferenceReading(source, await resolveFieldSets(source), { references: true });
  const p = fixturePlatform({ origin: opts.origin ?? new URL(VAULT).origin, rowVault: opts.rowVault });
  p.reach.add(VAULT).add(CHILD_VAULT);
  p.nest(VAULT, CHILD_VAULT);
  const picker: ReferencePicker = { platform: { origin: p.origin, fetch: p.fetch }, reading, master: source };
  return { picker, p };
}
const writes = (p: FixturePlatform) => p.requests.filter((r) => r.method !== "GET").length;
const lists = (p: FixturePlatform) => p.requests.filter((r) => r.path.endsWith("/records")).map((r) => decodeURIComponent(new URL(r.url).pathname));
async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ReferenceRefusedError) return err.reason;
    if (err instanceof ReferenceUnknownError || err instanceof VocabularyUnavailableError || err instanceof PlacementUnknownError) return "unknown";
    if (err instanceof PartialReferenceError) return "partial";
    throw err;
  }
  return "resolved";
}
function world(p: FixturePlatform) {
  return {
    ben: p.seed(VAULT, "t:Person", { "a:name": "Ben" }),
    owners: p.seed(VAULT, "t:PartyGroup", { "a:name": "Owners" }),
    acme: p.seed(VAULT, "t:Organization", { "a:name": "Acme" }),
    childBen: p.seed(CHILD_VAULT, "t:Person", { "a:name": "Ben (child)" }),
    childOwners: p.seed(CHILD_VAULT, "t:PartyGroup", { "a:name": "Owners (child)" }),
    childAcme: p.seed(CHILD_VAULT, "t:Organization", { "a:name": "Acme (child)" }),
  };
}
/** Every record-reference writer and check, naming `VAULT`, aimed at the given targets. */
async function everyReference(picker: ReferencePicker, w: ReturnType<typeof world>, target: { group: string; party: string; org: string }) {
  return {
    memberOf: await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: target.group })),
    heldParty: await reason(checkReference(picker, { vaultId: VAULT, field: "a:heldParty", carrierType: "HeldPartyFieldClaim", target: target.party })),
    actsOnBehalfOf: await reason(checkReference(picker, { vaultId: VAULT, field: "a:actsOnBehalfOf", carrierType: "Person", target: target.org })),
    roleRecord: await reason(writeRoleRecord(picker, { vaultId: VAULT, agent: AGENT, player: target.party, group: w.owners })),
    add: await reason(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:memberOf", target: target.group })),
  };
}

describe("rowPlacement — the one reading of a row's vault", () => {
  it("is 'in' only on exact IRI equality with the named vault; every other shape fails closed", () => {
    const at = (row: Record<string, unknown>) => rowPlacement(row, VAULT);
    expect(at({ vault: VAULT, vaultAmbiguous: false })).toBe("in-vault");
    expect(at({ vault: VAULT })).toBe("in-vault"); // the flag's missing value claims nothing
    expect(at({ vault: CHILD_VAULT, vaultAmbiguous: false })).toBe("other-vault");
    expect(at({ vault: `${VAULT}/`, vaultAmbiguous: false })).toBe("other-vault"); // exact IRI
    expect(at({ vault: "https://ANN.example.test/vault", vaultAmbiguous: false })).toBe("other-vault");
    expect(at({ vault: null, vaultAmbiguous: true })).toBe("more-than-one-vault");
    expect(at({ vault: VAULT, vaultAmbiguous: true })).toBe("more-than-one-vault"); // never "in"
    expect(at({ entity: "x", typeUri: "t:Person" })).toBe("not-known-yet"); // no key: a platform that names no vault per row
    expect(at({ vault: null })).toBe("not-known-yet");
    expect(at({ vault: null, vaultAmbiguous: false })).toBe("not-known-yet");
    expect(at({ vault: "", vaultAmbiguous: false })).toBe("not-known-yet");
    expect(at({ vault: [VAULT], vaultAmbiguous: false })).toBe("not-known-yet");
  });
});

describe("the check — a nested vault's record is another vault's", () => {
  it("is refused for every record reference, with nothing sent; the vault's own records pass", async () => {
    const { picker, p } = await setup();
    const w = world(p);
    expect(await everyReference(picker, w, { group: w.childOwners, party: w.childBen, org: w.childAcme })).toEqual({
      memberOf: "not-in-vault",
      heldParty: "not-in-vault",
      actsOnBehalfOf: "not-in-vault",
      roleRecord: "not-in-vault",
      add: "not-in-vault",
    });
    expect(writes(p)).toBe(0);
    const own = await everyReference(picker, w, { group: w.owners, party: w.ben, org: w.acme });
    expect(own).toMatchObject({ memberOf: "resolved", heldParty: "resolved", actsOnBehalfOf: "resolved", roleRecord: "resolved", add: "resolved" });
  });

  it("costs one walk of the named vault's list until the target, and none of a nested vault's", async () => {
    const { picker, p } = await setup();
    const w = world(p);
    // On page 1: one list GET, of the named vault.
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.owners }))).toBe("resolved");
    expect(lists(p)).toEqual([`/lws/vault/${VAULT}/records`]);
    // Pushed to page 2 by 25 newer persons: two list GETs, both of the named vault.
    for (let i = 0; i < 25; i++) p.seed(VAULT, "t:Person", { "a:name": `Filler ${i}` });
    p.requests.length = 0;
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.owners }))).toBe("resolved");
    expect(lists(p)).toEqual([`/lws/vault/${VAULT}/records`, `/lws/vault/${VAULT}/records`]);
    // A nested record: refused from the named vault's list alone.
    p.requests.length = 0;
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: w.childOwners }))).toBe("not-in-vault");
    expect(lists(p).every((path) => path === `/lws/vault/${VAULT}/records`)).toBe(true);
  });

  it("reads the vault from the row, never from the record's IRI", async () => {
    const { picker, p } = await setup();
    // A record held in the CHILD whose IRI sits under the named vault's own address and host.
    const lookalike = p.seed(CHILD_VAULT, "t:PartyGroup", { "a:name": "Look-alike" }, { id: `${VAULT}/e/lookalike` });
    // A record held in the named vault whose IRI is on another host (the fixture mints on VAULT_HOST).
    const owners = p.seed(VAULT, "t:PartyGroup", { "a:name": "Owners" });
    expect(new URL(owners).host).not.toBe(new URL(VAULT).host);
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: lookalike }))).toBe("not-in-vault");
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: owners }))).toBe("resolved");
  });
});

describe("the check — a record held in more than one vault", () => {
  it("is refused as 'held in more than one vault' for every record reference, never 'in the vault'; nothing sent", async () => {
    const { picker, p } = await setup();
    const w = world(p);
    const split = { group: w.owners, party: w.ben, org: w.acme };
    for (const r of Object.values(split)) p.split(r, CHILD_VAULT);
    const got = await everyReference(picker, w, split);
    // The role record's group is `w.owners`, split too: refused at the group, before the player.
    expect(got).toEqual({
      memberOf: "in-more-than-one-vault",
      heldParty: "in-more-than-one-vault",
      actsOnBehalfOf: "in-more-than-one-vault",
      roleRecord: "in-more-than-one-vault",
      add: "in-more-than-one-vault",
    });
    expect(writes(p)).toBe(0);
  });

  it("counts ambiguity over the scan only: named as the child alone, the split record is the child's", async () => {
    const { picker, p } = await setup({ origin: new URL(CHILD_VAULT).origin });
    const owners = p.seed(VAULT, "t:PartyGroup", { "a:name": "Owners" });
    p.split(owners, CHILD_VAULT);
    expect(await reason(checkReference(picker, { vaultId: CHILD_VAULT, field: "a:memberOf", carrierType: "Person", target: owners }))).toBe("resolved");
  });
});

describe("the check — a row with no vault key (a platform that names no vault per row)", () => {
  it("is 'not known yet' for every record reference, never 'in the vault', never 'in no other vault'; nothing sent", async () => {
    const { picker, p } = await setup({ rowVault: false });
    const w = world(p);
    const own = await everyReference(picker, w, { group: w.owners, party: w.ben, org: w.acme });
    expect(own).toEqual({ memberOf: "unknown", heldParty: "unknown", actsOnBehalfOf: "unknown", roleRecord: "unknown", add: "unknown" });
    const nested = await everyReference(picker, w, { group: w.childOwners, party: w.childBen, org: w.childAcme });
    expect(nested).toEqual({ memberOf: "unknown", heldParty: "unknown", actsOnBehalfOf: "unknown", roleRecord: "unknown", add: "unknown" });
    expect(writes(p)).toBe(0);
    // A record no list holds is still "not in the vault": its absence is read, not its row.
    expect(await reason(checkReference(picker, { vaultId: VAULT, field: "a:memberOf", carrierType: "Person", target: `${VAULT_HOST}/base/e/nowhere` }))).toBe("not-in-vault");
  });
});
