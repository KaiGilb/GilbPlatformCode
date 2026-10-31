// New. What "+ Relation" (and the "+ Kind" chooser behind it) WRITES, per choice: a kind that names a predicate is a private RELATION from the contact to the
// vault's entity and never a label claim; a circle label and a holder's own kind are a private LABEL claim and never a relation; and every refusal writes
// nothing at all. The relation doors are the in-memory store of test/relationStoreFake.ts; the vault is the fake platform of test/fakePlaceStore.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import * as fake from "../test/fakePlaceStore";
import { PRINCIPAL, setUp, stubNetwork, tearDown } from "../test/support";

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
const stater = vi.hoisted(() => ({ uri: "", fail: false }));
vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) =>
  (await import("../test/adderCardMock")).adderCardMock(await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(), async () => {
    if (stater.fail) throw new Error("no card of the holder");
    return stater.uri;
  }),
);

import { NOT_OWN_VAULT_SAYS, NO_VAULT_TIE_SAYS, useContactLabels } from "./useContactLabels";
import { __resetContactLabelVocab } from "./heldContactLabel";
import { __resetCatalogueCache } from "@kaigilb/gilbplatformcode-contact-kind-catalogue";
import { __resetKindRelationVocab, type KindVault } from "@kaigilb/gilbplatformcode-kind-relation";
import { __resetHeldNoteChains } from "@kaigilb/gilbplatformcode-held-notes";
import { __setCatalogForTest, catalogFromGraph } from "@kaigilb/gilbplatformcode-lws-relations";
import type { CatalogueEntry } from "@kaigilb/gilbplatformcode-contact-kind-model";
import { endRelation, relationsLive, rels, resetRelationStore, writePairRelation } from "../test/relationStoreFake";
import type { FakeRelation } from "../test/relationStoreFake";

const { VAULT, store } = fake;
const M = "https://ontology.example.test/base";
const HOLDER = PRINCIPAL;
const uriOf = (id: string) => `${VAULT}/e/${id}`;
const PERSON_VAULT: KindVault = { vaultId: VAULT, entity: `${VAULT}/e/vault-entity-kai`, represents: `${M}/t/Person` };
const userCatalog = () =>
  catalogFromGraph(
    ["AssociatedWith", "FriendOf", "CustomerOf", "ColleagueOf", "PartOf"].map((n) => ({
      "@id": `${M}/t/${n}`,
      "a:label": n === "AssociatedWith" ? "associated-with" : n.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase(),
      "a:linkPlane": "user",
      "a:typeAttribute": `t:${n}`,
      "a:symmetric": /AssociatedWith|FriendOf|ColleagueOf/.test(n),
    })),
    "user",
  );
let party: string;

beforeEach(() => {
  setUp();
  fake.resetStore();
  __resetContactLabelVocab();
  __resetCatalogueCache();
  __resetKindRelationVocab();
  resetRelationStore();
  __resetHeldNoteChains();
  __setCatalogForTest(userCatalog());
  stater.fail = false;
  stater.uri = uriOf(fake.seed("t:Person", { "a:name": "Kai's vault" }));
  party = uriOf(fake.seed("t:Person", { "a:name": "Rita Larsen" }));
  stubNetwork();
});
afterEach(() => {
  cleanup();
  __setCatalogForTest(null);
  tearDown();
});

function mount(o: { kindVault?: KindVault | null; ownVaultId?: string | null; principal?: string | null } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(
    () =>
      useContactLabels({
        vaultId: VAULT,
        ownVaultId: o.ownVaultId === undefined ? VAULT : o.ownVaultId,
        subject: party,
        principal: o.principal === undefined ? HOLDER : o.principal,
        typeUri: `${M}/t/Person`,
        kindVault: o.kindVault === undefined ? PERSON_VAULT : o.kindVault,
        enabled: true,
        needOffers: true,
      }),
    { wrapper },
  );
}
const ready = async (r: { current: { chips: unknown[] | null; offersLoading: boolean } }) => {
  await waitFor(() => expect(r.current.chips).not.toBeNull(), { timeout: 5000 });
  await waitFor(() => expect(r.current.offersLoading).toBe(false), { timeout: 8000 });
};
const pick = (r: { current: { offered: Record<string, CatalogueEntry[]> } }, axis: string, label: string): CatalogueEntry => {
  const e = r.current.offered[axis]!.find((x) => x.label === label);
  if (!e) throw new Error(`not offered: ${label}`);
  return e;
};
const claims = () => [...store.entries()].filter(([, e]) => e.type === "t:HeldPartyFieldClaim");
const deletes = () => (globalThis.fetch as unknown as { mock: { calls: Array<[unknown, RequestInit | undefined]> } }).mock.calls.filter(([, i]) => i?.method === "DELETE");

describe("a kind that names a predicate is a RELATION to the vault, never a label claim", () => {
  it("Friend writes exactly one private relation, party -> the vault's entity, and no claim", async () => {
    const { result } = mount();
    await ready(result);
    let ok = false;
    await act(async () => {
      ok = await result.current.add(pick(result, "relationshipKind", "Friend"));
    });
    expect(ok).toBe(true);
    expect(claims()).toHaveLength(0);
    expect(writePairRelation).toHaveBeenCalledTimes(1);
    const live = relationsLive();
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ type: "t:FriendOf", source: party, target: PERSON_VAULT.entity });
    expect(live[0]!.extra).toMatchObject({ "a:claimSubject": { "@id": HOLDER }, "a:visibilityTier": "private" });
  });
  it("needs no card of the holder: with none, the relation is still written", async () => {
    stater.fail = true;
    const { result } = mount();
    await ready(result);
    let ok = false;
    await act(async () => {
      ok = await result.current.add(pick(result, "relationshipKind", "Friend"));
    });
    expect(ok).toBe(true);
    expect(relationsLive().map((r) => r.type)).toEqual(["t:FriendOf"]);
    expect(claims()).toHaveLength(0);
  });
  it("associated-with (the default) is a relation too", async () => {
    const { result } = mount();
    await ready(result);
    await act(async () => {
      await result.current.add(pick(result, "relationshipKind", "associated-with"));
    });
    expect(relationsLive().map((r) => r.type)).toEqual(["t:AssociatedWith"]);
    expect(claims()).toHaveLength(0);
  });
});

describe("a circle label and a holder's own kind are a private LABEL claim, never a relation", () => {
  it("a circle label writes one claim: the party, the label, the adder's card as source, the holder as subject, the private row, and no relation", async () => {
    const { result } = mount();
    await ready(result);
    let ok = false;
    await act(async () => {
      ok = await result.current.add(pick(result, "circleLabel", "Professional · Inner Circle"));
    });
    expect(ok).toBe(true);
    expect(writePairRelation).not.toHaveBeenCalled();
    expect(rels.size).toBe(0);
    expect(claims()).toHaveLength(1);
    const facts = claims()[0]![1].facts;
    expect(facts).toEqual({
      "a:heldParty": { "@id": party },
      "a:circleLabel": { "@id": `${M}/e/circle-label-professional-inner-circle` },
      "a:statedBy": { "@id": stater.uri },
      "a:claimSubject": { "@id": HOLDER },
      "a:visibilityTier": "private",
    });
  });
  it("the holder's own kind (no predicate) is a claim under a:relationshipKind and writes no relation", async () => {
    fake.seed("t:RelationshipKind", { "a:label": "Dog walker", "a:playableBy": { "@id": `${M}/t/Person` } });
    const { result } = mount();
    await ready(result);
    await act(async () => {
      await result.current.add(pick(result, "relationshipKind", "Dog walker"));
    });
    expect(writePairRelation).not.toHaveBeenCalled();
    expect(rels.size).toBe(0);
    expect(claims()).toHaveLength(1);
    expect(Object.keys(claims()[0]![1].facts).sort()).toEqual(["a:claimSubject", "a:heldParty", "a:relationshipKind", "a:statedBy", "a:visibilityTier"]);
  });
  it("a label needs the holder's own card: with none, nothing is written and it is said", async () => {
    stater.fail = true;
    const { result } = mount();
    await ready(result);
    let ok = true;
    await act(async () => {
      ok = await result.current.add(pick(result, "circleLabel", "Professional · Inner Circle"));
    });
    expect(ok).toBe(false);
    expect(result.current.actError).toBe("no card of the holder");
    expect(claims()).toHaveLength(0);
    expect(rels.size).toBe(0);
  });
});

describe("every refusal writes nothing", () => {
  const writes = () => fake.createRecord.mock.calls.length + fake.patchRecord.mock.calls.length + fake.deleteRecord.mock.calls.length;
  it("in a vault that is not the signer's own, neither a relation nor a label is written", async () => {
    const { result } = mount({ ownVaultId: "https://other.platform.example.test/base" });
    await waitFor(() => expect(result.current.chips).not.toBeNull(), { timeout: 5000 });
    let a = true;
    let b = true;
    await act(async () => {
      a = await result.current.add({ id: `${M}/e/relationship-kind-friend`, label: "Friend", order: 1, playableBy: [], axis: "relationshipKind", own: false, kindPredicate: { curie: "t:FriendOf" } } as never);
      b = await result.current.add({ id: `${M}/e/circle-label-professional-inner-circle`, label: "x", order: 1, playableBy: [], axis: "circleLabel", own: false });
    });
    expect([a, b]).toEqual([false, false]);
    expect(result.current.actError).toBe(NOT_OWN_VAULT_SAYS);
    expect(writePairRelation).not.toHaveBeenCalled();
    expect(writes()).toBe(0);
  });
  it("a kind with a predicate, when the card was not told which vault it is, says so and writes nothing", async () => {
    const { result } = mount({ kindVault: null });
    await waitFor(() => expect(result.current.chips).not.toBeNull(), { timeout: 5000 });
    let ok = true;
    await act(async () => {
      ok = await result.current.add({ id: `${M}/e/relationship-kind-friend`, label: "Friend", order: 1, playableBy: [], axis: "relationshipKind", own: false, kindPredicate: { curie: "t:FriendOf" } } as never);
    });
    expect(ok).toBe(false);
    expect(result.current.actError).toBe(NO_VAULT_TIE_SAYS);
    expect(writePairRelation).not.toHaveBeenCalled();
    expect(writes()).toBe(0);
  });
  it("with no principal nothing is written, relation or label", async () => {
    const { result } = mount({ principal: null });
    await waitFor(() => expect(result.current.chips).not.toBeNull(), { timeout: 5000 });
    let ok = true;
    await act(async () => {
      ok = await result.current.add({ id: `${M}/e/circle-label-professional-inner-circle`, label: "x", order: 1, playableBy: [], axis: "circleLabel", own: false });
    });
    expect(ok).toBe(false);
    expect(result.current.actError).toBe("Not signed in to a vault, so there is nowhere to keep this.");
    expect(writes()).toBe(0);
    expect(writePairRelation).not.toHaveBeenCalled();
  });
  it("when the master offers no kind with a predicate for an unknown vault, none is offered (never guessed)", async () => {
    const { result } = mount({ kindVault: null });
    await ready(result);
    expect(result.current.offered.relationshipKind.some((e) => (e as { kindPredicate?: unknown }).kindPredicate)).toBe(false);
  });
});

describe("removing follows the same split: a relation is ENDED, a label claim is deleted", () => {
  it("a relation chip is ended and nothing is deleted; the label claim beside it is untouched", async () => {
    const label = fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:circleLabel": { "@id": `${M}/e/circle-label-professional-inner-circle` }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER } });
    const { result } = mount();
    await ready(result);
    await act(async () => {
      await result.current.add(pick(result, "relationshipKind", "Friend"));
    });
    await waitFor(() => expect(result.current.chips!.map((c) => c.label)).toContain("Friend"));
    const friend = result.current.chips!.find((c) => c.label === "Friend")!;
    await act(async () => {
      await result.current.remove(friend);
    });
    expect(endRelation).toHaveBeenCalled();
    expect(deletes()).toHaveLength(0);
    expect(store.has(label)).toBe(true);
  });
  it("a label chip is deleted and no relation is ended", async () => {
    const label = fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:circleLabel": { "@id": `${M}/e/circle-label-professional-inner-circle` }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER } });
    const { result } = mount();
    await waitFor(() => expect(result.current.chips?.length).toBe(1), { timeout: 5000 });
    await act(async () => {
      await result.current.remove(result.current.chips![0]!);
    });
    expect(store.has(label)).toBe(false);
    expect(endRelation).not.toHaveBeenCalled();
    expect(deletes()).toHaveLength(1);
  });
});

const relate = (curie: string, id = `r${rels.size + 1}`): string => {
  const uri = `${VAULT}/r/${id}`;
  const r: FakeRelation = { id, uri, type: curie, source: party, target: PERSON_VAULT.entity!, extra: { "a:claimSubject": { "@id": HOLDER }, "a:visibilityTier": "private" }, vault: VAULT, ended: false };
  rels.set(uri, r);
  return uri;
};

describe("the relation is written once, and the default comes back only when nothing specific is left", () => {
  it("a kind the contact is already tied by is not written again", async () => {
    relate("t:FriendOf");
    const { result } = mount();
    await ready(result);
    await waitFor(() => expect(result.current.chips!.map((c) => c.label)).toEqual(["Friend"]));
    let ok = false;
    await act(async () => {
      ok = await result.current.add({ id: `${M}/e/relationship-kind-friend`, label: "Friend", order: 5, playableBy: [], axis: "relationshipKind", own: false, kindPredicate: { curie: "t:FriendOf" } } as never);
    });
    expect(ok).toBe(true);
    expect(writePairRelation).not.toHaveBeenCalled();
    expect(relationsLive()).toHaveLength(1);
  });
  it("associated-with picked while the contact has any tie writes nothing (it is the default, never beside a specific kind)", async () => {
    relate("t:FriendOf");
    const { result } = mount();
    await ready(result);
    await waitFor(() => expect(result.current.chips!.map((c) => c.label)).toEqual(["Friend"]));
    let ok = false;
    await act(async () => {
      ok = await result.current.add({ id: `${M}/t/AssociatedWith`, label: "associated-with", order: null, playableBy: [], axis: "relationshipKind", own: false, defaultTie: true, kindPredicate: { curie: "t:AssociatedWith" } } as never);
    });
    expect(ok).toBe(true);
    expect(writePairRelation).not.toHaveBeenCalled();
    expect(relationsLive().map((r) => r.type)).toEqual(["t:FriendOf"]);
  });
  it("removing the last tie writes the default back, unless an older label claim of a kind with a predicate still stands as the specific kind", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:relationshipKind": { "@id": `${M}/e/relationship-kind-friend` }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER } });
    relate("t:ColleagueOf");
    const { result } = mount();
    await ready(result);
    await waitFor(() => expect(result.current.chips!.map((c) => c.label).sort()).toEqual(["Colleague", "Friend"]));
    const colleague = result.current.chips!.find((c) => c.label === "Colleague")!;
    await act(async () => {
      expect(await result.current.remove(colleague)).toBe(true);
    });
    expect(relationsLive()).toHaveLength(0);
    expect(writePairRelation).not.toHaveBeenCalled();
    expect(result.current.actError).toBeNull();
  });
});
