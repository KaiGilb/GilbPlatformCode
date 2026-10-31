// Ported from the source's `ownCard.tester-delta.test.ts` (7 cases) and `ownCard.tester-s63.test.ts` (2 cases): the adversarial
// cases found on the rig, run over `isOwnCardIn` with the real `own-card` and the real derivation. Hosts are example hosts; the
// derived id comes from `vault-origin-rule` (the same function the app's `gilb-photo` import is; see the README, "Where it came from").
import { describe, expect, it } from "vitest";
import { selfCardIdForVault } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { isOwnCardIn } from "./index";
import { ALL, KID, KID_CHILD, LANDING, ORG, ORG_CHILD, P, SHARED, THREE } from "../test/support";

describe("own card: records he named 'MNB Profile ...' (source ownCard.tester-delta)", () => {
  // The app's create sends the record's display name as the slug, and the platform mints `<slug>-<ulid>`: a record he names
  // "MNB Profile Makers Ltd" gets an id starting `mnb-profile`. It is his record, not his MyNet card.
  for (const id of ["mnb-profile-makers-ltd-06gn7dw3fsy2hagdpr1kp0rp20", "mnb-profile-services-as-06gn7dt12xsendqmdbax55b3b4", "mnb-profile-ideas-06gn7dtk0nyvz7exc6t2j1pzqr"]) {
    it(`${id} in his landing vault is not his own card`, async () => {
      expect(await isOwnCardIn(id, LANDING, ALL)).toBe(false);
    });
  }
});

describe("own card: controls (source ownCard.tester-delta)", () => {
  it("his landing vault's derived card is his", async () => {
    expect(await isOwnCardIn(await selfCardIdForVault(P), LANDING, ALL)).toBe(true);
  });
  // A legacy card is his only when the profile app's lookup names it: the test hands `isOwnCardIn` that finding. Its id alone is no
  // longer enough.
  it("a legacy MyNet card (slug mnb-profile, bare) in his landing vault is his", async () => {
    const id = "mnb-profile-06gn7dsf5xs9n50y392hmp58y4";
    const finding = { cardId: id, cardUri: `${P}/e/${id}`, road: "pointer" as const, otherOwnerCards: [], otherOwnerCardsKnown: true, ignoredPointer: null };
    expect(await isOwnCardIn(id, LANDING, ALL, finding)).toBe(true);
    expect(await isOwnCardIn(id, LANDING, ALL)).toBe(false);
  });
  it("a nested PERSON vault's derived card and legacy card are not his", async () => {
    expect(await isOwnCardIn(await selfCardIdForVault(KID), KID_CHILD, ALL)).toBe(false);
    expect(await isOwnCardIn("mnb-profile-06gn7dywd9z015hgvgj01b5re8", KID_CHILD, ALL)).toBe(false);
  });
  it("another person's cards in a vault shared with him (read and write) are not his", async () => {
    expect(await isOwnCardIn(await selfCardIdForVault(THREE), SHARED, ALL)).toBe(false);
    expect(await isOwnCardIn("mnb-profile-06gn7e24e1zcq6z9r7vw6rmv6m", SHARED, ALL)).toBe(false);
  });
});

describe("own card: an organisation vault he holds (source ownCard.tester-s63)", () => {
  it("the derived self card of a nested ORGANISATION vault is not his own card", async () => {
    const orgCard = await selfCardIdForVault(ORG);
    expect(await isOwnCardIn(orgCard, ORG_CHILD, [LANDING, ORG_CHILD])).toBe(false);
  });
  it("control: his landing vault's derived card is his", async () => {
    expect(await isOwnCardIn(await selfCardIdForVault(P), LANDING, [LANDING, ORG_CHILD])).toBe(true);
  });
});
