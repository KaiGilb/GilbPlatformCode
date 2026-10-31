// Ported from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/lib/contact/useContactLabels.s8labels.test.tsx`. The chips of one held contact: what is stored, what the master offers, what a click does.
// Changes: the module mocks of the app's record client, vault sets, find-by-attribute, term slots, relation doors and adder card are replaced by the
// library's peers running over the fake platform of test/fakePlaceStore.ts (a `fetch` stub, test/support.ts), plus module mocks of `term-slots`, of the typed
// list (`listVaultRecordsPage` of `lws-vault-sets`), of the four relation doors (`lws-relations`, over test/relationStoreFake.ts) and of the viewer's own
// card (`adder-card`, test/adderCardMock.ts); the hosts are example.test hosts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import * as fake from "../test/fakePlaceStore";
import { setUp, stubNetwork, tearDown } from "../test/support";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel };
});
vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({
  ...(await orig<typeof import("@kaigilb/gilbplatformcode-lws-vault-sets")>()),
  listVaultRecordsPage: (await import("../test/fakePlaceStore")).listVaultRecordsPage,
}));
vi.mock("@kaigilb/gilbplatformcode-lws-relations", async (orig) => {
  const f = await import("../test/relationStoreFake");
  return { ...(await orig<typeof import("@kaigilb/gilbplatformcode-lws-relations")>()), writePairRelation: f.writePairRelation, endRelation: f.endRelation, readRelationDoc: f.readRelationDoc, readRelations: f.readRelations };
});
const stater = vi.hoisted(() => ({ uri: "" }));
vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) =>
  (await import("../test/adderCardMock")).adderCardMock(await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(), async () => {
    return stater.uri;
  }),
);

import { useContactLabels } from "./useContactLabels";
import { __resetContactLabelVocab } from "./heldContactLabel";
import { __resetCatalogueCache } from "@kaigilb/gilbplatformcode-contact-kind-catalogue";
import { __resetKindRelationVocab, type KindVault } from "@kaigilb/gilbplatformcode-kind-relation";
import { __resetHeldNoteChains } from "@kaigilb/gilbplatformcode-held-notes";
import { relationsLive, resetRelationStore } from "../test/relationStoreFake";

afterEach(tearDown);

const { VAULT, store } = fake;
const M = "https://ontology.example.test/base";
const HOLDER = "https://id.platform.example.test/base/p/kai";
const uriOf = (id: string) => `${VAULT}/e/${id}`;
const FRIEND = `${M}/e/relationship-kind-friend`;
const INNER = `${M}/e/circle-label-professional-inner-circle`;
const labelClaims = () => [...store.values()].filter((e) => e.type === "t:HeldPartyFieldClaim");
let party: string;
/** The vault the records are held in, as a target of a kind: its OWN entity (not the self card) and what it represents. */
const PERSON_VAULT: KindVault = { vaultId: VAULT, entity: `${VAULT}/e/vault-entity-kai`, represents: `${M}/t/Person` };
const ORG_VAULT: KindVault = { vaultId: VAULT, entity: `${VAULT}/e/vault-entity-acme`, represents: `${M}/t/Organization` };

beforeEach(() => {
  setUp();
  fake.resetStore();
  __resetContactLabelVocab();
  __resetCatalogueCache();
  __resetKindRelationVocab();
  resetRelationStore();
  __resetHeldNoteChains();
  stater.uri = uriOf(fake.seed("t:Person", { "a:name": "Kai's vault" }));
  party = uriOf(fake.seed("t:Person", { "a:name": "Rita Larsen" }));
  const m = stubNetwork();
});

function mount(typeUri: string, enabled = true, needOffers = true, kindVault: KindVault | null = PERSON_VAULT) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(() => useContactLabels({ vaultId: VAULT, ownVaultId: VAULT, subject: party, principal: HOLDER, typeUri, kindVault, enabled, needOffers }), { wrapper });
}

describe("the chips of one held contact", () => {
  it("show the stored labels in the catalogue's own words, circle labels before kinds, and nothing before they are read", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:relationshipKind": { "@id": FRIEND }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER } });
    fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:circleLabel": { "@id": INNER }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER } });
    const { result } = mount(`${M}/t/Person`);
    expect(result.current.chips).toBeNull();
    await waitFor(() => expect(result.current.chips).not.toBeNull(), { timeout: 5000 });
    expect(result.current.chips!.map((c) => [c.label, c.tone, c.axis])).toEqual([
      ["Professional · Inner Circle", "professional", "circleLabel"],
      ["Friend", "neutral", "relationshipKind"],
    ]);
  });

  it("SB1a-2: a chip is its CLAIM SUBJECT's to remove, whoever stated it: one the viewer wrote earlier, stated by a vault card, is removable by them; another member's is shown read-only and refused", async () => {
    const OTHER_MEMBER = "https://id.platform.example.test/base/p/other-member";
    // The viewer's chip as written BEFORE SB1a: stated by the shared vault's card, claim subject = the viewer.
    const legacy = fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:circleLabel": { "@id": INNER }, "a:statedBy": { "@id": uriOf("vsc-oldvaultcard") }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER } });
    // The viewer's chip as written NOW: stated by the adder's own card, claim subject = the viewer.
    const fresh = fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:relationshipKind": { "@id": FRIEND }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER } });
    // Another member's chip in the same shared vault (the platform would not return it to the viewer; if it ever did, it is not theirs).
    const theirs = fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:relationshipKind": { "@id": `${M}/e/relationship-kind-customer` }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": OTHER_MEMBER } });
    const { result } = mount(`${M}/t/Person`);
    await waitFor(() => expect(result.current.chips).not.toBeNull(), { timeout: 5000 });
    const chip = (id: string) => result.current.chips!.find((c) => c.claimId === id)!;
    expect(chip(legacy).readOnly).toBeUndefined();
    expect(chip(fresh).readOnly).toBeUndefined();
    expect(chip(theirs).readOnly).toBe(true);
    let removed = true;
    await act(async () => {
      removed = await result.current.remove(chip(theirs));
    });
    expect(removed).toBe(false);
    expect(store.has(theirs)).toBe(true);
    await act(async () => {
      removed = await result.current.remove(chip(legacy));
    });
    expect(removed).toBe(true);
    expect(store.has(legacy)).toBe(false);
    await act(async () => {
      removed = await result.current.remove(chip(fresh));
    });
    expect(removed).toBe(true);
    expect(store.has(fresh)).toBe(false);
    expect(store.has(theirs)).toBe(true);
  });

  it("offer what fits the record's type and is not already on it: a person is offered Friend and not Competitor", async () => {
    const { result } = mount(`${M}/t/Person`);
    await waitFor(() => expect(result.current.offered.relationshipKind.length).toBeGreaterThan(0), { timeout: 5000 });
    const kinds = result.current.offered.relationshipKind.map((e) => e.label);
    expect(kinds).toContain("Friend");
    expect(kinds).toContain("Customer");
    expect(kinds).not.toContain("Competitor");
    expect(result.current.offered.circleLabel.map((e) => e.label)).toEqual(["Personal · 1st Connection", "Personal · Inner Circle", "Professional · 1st Connection", "Professional · Inner Circle"]);
  });

  it("an organization in an organization's vault is offered the ties an organization has (Customer, Supplier, Partner), not Friend, and no Competitor (Kai-Zen 2026-10-17: not a tie to the holder yet)", async () => {
    const { result } = mount(`${M}/t/Organization`, true, true, ORG_VAULT);
    await waitFor(() => expect(result.current.offered.relationshipKind.length).toBeGreaterThan(0), { timeout: 5000 });
    const kinds = result.current.offered.relationshipKind.map((e) => e.label);
    expect(kinds).toEqual(["Customer", "Prospect", "Supplier", "Partner"]);
    expect(kinds).not.toContain("Friend");
    expect(kinds).not.toContain("Competitor");
    expect(kinds).not.toContain("Public authority");
    expect(kinds).not.toContain("Non-profit");
  });

  it("a sub-type of Person is offered the person kinds", async () => {
    const { result } = mount(`${M}/t/Passenger`);
    await waitFor(() => expect(result.current.offered.relationshipKind.map((e) => e.label)).toContain("Friend"), { timeout: 5000 });
  });

  it("adding a kind writes ONE private RELATION contact -> the vault's entity (no claim), shows the chip, and takes it out of the offer; removing ENDS it", async () => {
    const { result } = mount(`${M}/t/Person`);
    await waitFor(() => expect(result.current.offered.relationshipKind.length).toBeGreaterThan(0), { timeout: 5000 });
    const friend = result.current.offered.relationshipKind.find((e) => e.label === "Friend")!;
    let ok = false;
    await act(async () => {
      ok = await result.current.add(friend);
    });
    expect(ok).toBe(true);
    expect(labelClaims().length).toBe(0);
    const live = relationsLive();
    expect(live.length).toBe(1);
    expect(live[0]).toMatchObject({ type: "t:FriendOf", source: party, target: PERSON_VAULT.entity });
    expect(live[0]!.extra).toEqual({ "a:claimSubject": { "@id": HOLDER }, "a:visibilityTier": "private" });
    await waitFor(() => expect(result.current.chips!.map((c) => c.label)).toEqual(["Friend"]));
    expect(result.current.offered.relationshipKind.map((e) => e.label)).not.toContain("Friend");
    await act(async () => {
      ok = await result.current.remove(result.current.chips![0]!);
    });
    expect(ok).toBe(true);
    expect(relationsLive().length).toBe(0);
    await waitFor(() => expect(result.current.chips).toEqual([]));
  });

  it("a removal is confirmed when the platform keeps an ENDED tombstone (MEASURED: DELETE 204, then GET 200 saying only that it ended)", async () => {
    const { result } = mount(`${M}/t/Person`);
    await waitFor(() => expect(result.current.chips).not.toBeNull());
    let ok = false;
    await act(async () => {
      ok = await result.current.add(result.current.offered.circleLabel.find((e) => e.label.startsWith("Professional · Inner"))!);
    });
    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.chips?.length).toBe(1));
    fake.deleteRecord.mockImplementationOnce(async (id: string) => {
      const e = fake.store.get(id)!;
      fake.store.set(id, { ...e, facts: { "a:entityLifecycleState": "ended", "a:endingActorKind": "holder" } });
    });
    await act(async () => {
      ok = await result.current.remove(result.current.chips![0]!);
    });
    expect(ok).toBe(true);
    expect(result.current.actError).toBeNull();
    await waitFor(() => expect(result.current.chips).toEqual([]));
  });

  it("the holder's own kinds are offered after the master's, and only where they fit", async () => {
    fake.seed("t:RelationshipKind", { "a:label": "Godparent", "a:playableBy": { "@id": `${M}/t/Person` } });
    fake.seed("t:RelationshipKind", { "a:label": "Landlord", "a:playableBy": { "@id": `${M}/t/Organization` } });
    const { result } = mount(`${M}/t/Person`);
    await waitFor(() => expect(result.current.offered.relationshipKind.map((e) => e.label)).toContain("Godparent"), { timeout: 5000 });
    const kinds = result.current.offered.relationshipKind.map((e) => e.label);
    expect(kinds.at(-1)).toBe("Godparent");
    expect(kinds).not.toContain("Landlord");
  });

  it("a failed read of the chips is said, never shown as no chips", async () => {
    fake.findByAttribute.mockRejectedValueOnce(new Error("boom"));
    const { result } = mount(`${M}/t/Person`);
    await waitFor(() => expect(result.current.readError).toMatch(/boom/), { timeout: 5000 });
    expect(result.current.chips).toBeNull();
  });

  it("a card with no chip that is not being edited asks the MASTER nothing (a second card of a session makes no master read)", async () => {
    const m = stubNetwork();
    const { result } = mount(`${M}/t/Person`, true, false);
    await waitFor(() => expect(result.current.chips).toEqual([]), { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 30));
    expect(m.log).toEqual([]);
    expect(result.current.offered.relationshipKind).toEqual([]);
  });

  it("a card with a chip reads the master for that chip's words even when it is not being edited", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:relationshipKind": { "@id": FRIEND }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER } });
    const { result } = mount(`${M}/t/Person`, true, false);
    await waitFor(() => expect(result.current.chips?.[0]?.label).toBe("Friend"), { timeout: 5000 });
  });

  it("asks nothing while it is not enabled", async () => {
    const { result } = mount(`${M}/t/Person`, false);
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.chips).toBeNull();
    expect(fake.findByAttribute).not.toHaveBeenCalled();
  });
});
