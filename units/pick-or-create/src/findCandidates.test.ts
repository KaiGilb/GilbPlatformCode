// A reference's target is in the named vault exactly when its typed-list row's `vault` equals that vault, and the picker offers
// only those rows. `createRecord` refuses another origin before any request.
import { describe, it, expect } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { VocabularyUnavailableError } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { createRecord, CreateRefusedError, findCandidates, readPickerVocabulary, type Picker } from "./pickOrCreate";
import { checkReference, PartialReferenceError, ReferenceRefusedError, ReferenceUnknownError } from "@kaigilb/gilbplatformcode-holder-reference";
import { PlacementUnknownError } from "@kaigilb/gilbplatformcode-holder-reference";
import { fixtureMaster, RIG, t } from "../test/support";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { withReferenceTerms } from "../test/fixtureReference";
import { fixturePlatform, PLATFORM_RIG, VAULT_HOST, type FixturePlatform } from "../test/fixturePlatform";

const VAULT = "https://ann.example.test/vault";
const CHILD_VAULT = "https://annchild.example.test/vault";
const HOLDER = `${VAULT_HOST}/base/e/ann-self-card`;
const AGENT = "https://id.example.test/base/p/0b6c9a52-agent";

async function setup(opts: { rowVault?: boolean; origin?: string } = {}) {
  const m = withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));
  const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
  const reading = await readPickerVocabulary(source, await resolveFieldSets(source), { references: true });
  const p = fixturePlatform({ origin: opts.origin ?? new URL(VAULT).origin, rowVault: opts.rowVault });
  p.reach.add(VAULT).add(CHILD_VAULT);
  p.nest(VAULT, CHILD_VAULT);
  const picker: Picker = { platform: { origin: p.origin, fetch: p.fetch }, reading, master: source };
  return { picker, p };
}
async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ReferenceRefusedError || err instanceof CreateRefusedError) return err.reason;
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

describe("the picker — findCandidates offers only the named vault's own records", () => {
  it("does not offer a nested vault's record; offers the vault's own", async () => {
    const { picker, p } = await setup();
    const w = world(p);
    const found = await findCandidates(picker, { vaultId: VAULT });
    expect(found.complete).toBe(true);
    expect(found.candidates.map((c) => c.record).sort()).toEqual([w.ben, w.owners, w.acme].sort());
    expect(found.candidates.every((c) => c.vaultId === VAULT)).toBe(true);
    // Named as the child, the child's records are offered.
    const asChild = await findCandidates({ ...picker, platform: { origin: picker.platform.origin, fetch: picker.platform.fetch } }, { vaultId: CHILD_VAULT });
    expect(asChild.candidates.map((c) => c.record).sort()).toEqual([w.childBen, w.childOwners, w.childAcme].sort());
  });

  it("does not offer a record held in more than one vault", async () => {
    const { picker, p } = await setup();
    const w = world(p);
    p.split(w.owners, CHILD_VAULT);
    const found = await findCandidates(picker, { vaultId: VAULT });
    expect(found.candidates.map((c) => c.record).sort()).toEqual([w.ben, w.acme].sort());
  });

  it("answers 'not known yet' when a row it would offer names no vault, ⛔ not an empty list", async () => {
    const { picker, p } = await setup({ rowVault: false });
    world(p);
    await expect(findCandidates(picker, { vaultId: VAULT })).rejects.toBeInstanceOf(PlacementUnknownError);
    await expect(findCandidates(picker, { vaultId: VAULT, text: "ben" })).rejects.toBeInstanceOf(PlacementUnknownError);
    // A text no row holds offers no one, whatever the rows' placement: that answer is exact.
    expect((await findCandidates(picker, { vaultId: VAULT, text: "zzz-nobody" })).candidates).toEqual([]);
  });

  it("agrees with the check: every offered record passes it, no record it refuses is offered", async () => {
    const { picker, p } = await setup();
    const w = world(p);
    p.split(w.acme, CHILD_VAULT);
    const offered = (await findCandidates(picker, { vaultId: VAULT })).candidates.map((c) => c.record);
    for (const target of [w.ben, w.owners, w.acme, w.childBen, w.childOwners, w.childAcme]) {
      // Placement only: a type the field does not admit is another refusal, not a placement one.
      const checked = await reason(checkReference(picker, { vaultId: VAULT, field: "a:heldParty", carrierType: "HeldPartyFieldClaim", target }));
      const placedInVault = !["not-in-vault", "in-more-than-one-vault", "unknown"].includes(checked);
      expect({ target, placedInVault }).toEqual({ target, placedInVault: offered.includes(target) });
    }
  });
});

describe("createRecord, like every writer, needs the vault's own origin", () => {
  it("refuses an origin that is not the named vault's host before any request; the vault's own origin creates", async () => {
    for (const origin of [PLATFORM_RIG, "https://ann.example.test:8443", "https://localhost:8787"]) {
      const { picker, p } = await setup({ origin });
      expect(await reason(createRecord(picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Mona" }))).toBe("origin-not-vault-host");
      expect(p.requests.length).toBe(0);
    }
    const { picker } = await setup();
    expect(await reason(createRecord(picker, { vaultId: VAULT, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Mona" }))).toBe("resolved");
  });

  it("a system vault on the node's own host is created from the node's origin", async () => {
    const SYSTEM = `${PLATFORM_RIG}/base`;
    const { picker, p } = await setup({ origin: PLATFORM_RIG });
    p.reach.add(SYSTEM);
    expect(await reason(createRecord(picker, { vaultId: SYSTEM, holder: HOLDER, agent: AGENT, kind: t("Person"), name: "Mona" }))).toBe("resolved");
  });
});
