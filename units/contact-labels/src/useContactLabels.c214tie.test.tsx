// Ported from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/lib/contact/useContactLabels.c214tie.test.tsx`. The chips of a held contact when a kind is a RELATION to the vault and a tie starts as associated-with (replace, never both; the floor rule; the default is hidden beside a specific kind).
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
const stater = vi.hoisted(() => ({ uri: "", fail: false }));
vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) =>
  (await import("../test/adderCardMock")).adderCardMock(await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(), async () => {
    if (stater.fail) throw new Error("this vault has no card of its holder");
    return stater.uri;
  }),
);

import { DEFAULT_TIE_MISSING_SAYS, NOT_OWN_VAULT_SAYS, useContactLabels } from "./useContactLabels";
import { __resetContactLabelVocab } from "./heldContactLabel";
import { __resetCatalogueCache } from "@kaigilb/gilbplatformcode-contact-kind-catalogue";
import { __resetKindRelationVocab, defaultTieEntryId, isLegacyKindRelationId, legacyKindRelationId, type KindVault } from "@kaigilb/gilbplatformcode-kind-relation";
import { __resetHeldNoteChains } from "@kaigilb/gilbplatformcode-held-notes";
import { __setCatalogForTest, catalogFromGraph } from "@kaigilb/gilbplatformcode-lws-relations";
import { ended, endRelation, fail, relationsLive, rels, resetRelationStore, writePairRelation } from "../test/relationStoreFake";

afterEach(tearDown);

const { VAULT, store } = fake;
const M = "https://ontology.example.test/base";
const HOLDER = "https://id.platform.example.test/base/p/kai";
const uriOf = (id: string) => `${VAULT}/e/${id}`;
const FRIEND = `${M}/e/relationship-kind-friend`;
const PERSON_VAULT: KindVault = { vaultId: VAULT, entity: `${VAULT}/e/vault-entity-kai`, represents: `${M}/t/Person` };
const VENT = PERSON_VAULT.entity!;
const labelClaims = () => [...store.values()].filter((e) => e.type === "t:HeldPartyFieldClaim" && e.facts["a:entityLifecycleState"] !== "ended");
const userCatalog = (withDefault = true) =>
  catalogFromGraph(
    [...(withDefault ? ["AssociatedWith"] : []), "FriendOf", "CustomerOf", "ColleagueOf", "PartOf"].map((n) => ({
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
afterEach(() => __setCatalogForTest(null));

function mount(o: { typeUri?: string; subject?: string; ownVaultId?: string; needOffers?: boolean } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(
    () =>
      useContactLabels({
        vaultId: VAULT,
        ownVaultId: o.ownVaultId ?? VAULT,
        subject: o.subject ?? party,
        principal: HOLDER,
        typeUri: o.typeUri ?? `${M}/t/Person`,
        kindVault: PERSON_VAULT,
        enabled: true,
        needOffers: o.needOffers ?? false,
      }),
    { wrapper },
  );
}
const labelOf = (kind: string, subject = party) =>
  fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": subject }, "a:relationshipKind": { "@id": kind }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER } });
const relate = (curie: string, subject = party, id = `r${rels.size + 1}`) => {
  const uri = `${VAULT}/r/${id}`;
  rels.set(uri, { id, uri, type: curie, source: subject, target: VENT, extra: { "a:claimSubject": { "@id": HOLDER }, "a:visibilityTier": "private" }, vault: VAULT, ended: false });
  return uri;
};
const liveTypes = () => relationsLive().map((r) => r.type).sort();
const labels = (r: { current: { chips: { label: string }[] | null } }) => r.current.chips?.map((c) => c.label);
const offers = async (r: { current: { offersLoading: boolean } }) => waitFor(() => expect(r.current.offersLoading).toBe(false), { timeout: 8000 });

describe("reading: the default is shown by the term's own label, and hidden beside a specific kind", () => {
  it("a contact whose only tie is the default shows ONE chip, 'associated-with' (the GilbVeda term's label)", async () => {
    relate("t:AssociatedWith");
    const { result } = mount();
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]), { timeout: 5000 });
    expect(result.current.chips![0]).toMatchObject({ axis: "relationshipKind", entryId: defaultTieEntryId() });
  });
  it("the default and a specific kind both live (ending the default failed earlier): only the specific one is shown", async () => {
    relate("t:AssociatedWith");
    relate("t:FriendOf");
    const { result } = mount();
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]), { timeout: 5000 });
  });
  it("an OLD label claim of a kind with a predicate (the stored form before this) counts as specific: the default is hidden beside it", async () => {
    labelOf(FRIEND);
    relate("t:AssociatedWith");
    const { result } = mount();
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]), { timeout: 5000 });
  });
  it("a holder's OWN kind (a label, no predicate) is not a tie: the default stays beside it", async () => {
    const own = uriOf(fake.seed("t:RelationshipKind", { "a:label": "Dog walker", "a:playableBy": { "@id": `${M}/t/Person` } }));
    labelOf(own);
    relate("t:AssociatedWith");
    const { result } = mount();
    await waitFor(() => expect(labels(result)?.sort()).toEqual(["Dog walker", "associated-with"]), { timeout: 5000 });
  });
  it("a default written from the vault's side (symmetric) is the same tie; a relation to the vault that is no kind (part-of) is not a chip", async () => {
    rels.set(`${VAULT}/r/back`, { id: "back", uri: `${VAULT}/r/back`, type: "t:AssociatedWith", source: VENT, target: party, extra: {}, vault: VAULT, ended: false });
    relate("t:PartOf");
    const { result } = mount();
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]), { timeout: 5000 });
  });
  it("old data is read as it is and nothing is rewritten by opening the card", async () => {
    labelOf(FRIEND);
    relate("t:AssociatedWith");
    const { result } = mount();
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]), { timeout: 5000 });
    expect(writePairRelation).not.toHaveBeenCalled();
    expect(endRelation).not.toHaveBeenCalled();
    expect(labelClaims()).toHaveLength(1);
  });
});

describe("picking a specific kind REPLACES the default (never both)", () => {
  it("Friend picked on a contact tied by the default: Friend is written FIRST, then the default is ENDED; one chip", async () => {
    const dflt = relate("t:AssociatedWith");
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]), { timeout: 5000 });
    await offers(result);
    let ok = false;
    await act(async () => {
      ok = await result.current.add(result.current.offered.relationshipKind.find((e) => e.label === "Friend")!);
    });
    expect(ok).toBe(true);
    expect(liveTypes()).toEqual(["t:FriendOf"]);
    expect(rels.get(dflt)!.ended).toBe(true); // ended, never deleted
    expect(writePairRelation.mock.invocationCallOrder[0]!).toBeLessThan(endRelation.mock.invocationCallOrder[0]!);
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]));
    expect(result.current.actError).toBeNull();
  });
  it("a second specific kind is a second relation; the default is not written again", async () => {
    relate("t:FriendOf");
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]), { timeout: 5000 });
    await offers(result);
    await act(async () => {
      await result.current.add(result.current.offered.relationshipKind.find((e) => e.label === "Colleague")!);
    });
    expect(liveTypes()).toEqual(["t:ColleagueOf", "t:FriendOf"]);
  });
  it("when ending the default fails, the specific kind is kept, the default is HIDDEN, it is said, and the next change ends it", async () => {
    const dflt = relate("t:AssociatedWith");
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]), { timeout: 5000 });
    await offers(result);
    fail.end = true;
    await act(async () => {
      await result.current.add(result.current.offered.relationshipKind.find((e) => e.label === "Friend")!);
    });
    expect(liveTypes()).toEqual(["t:AssociatedWith", "t:FriendOf"]);
    expect(result.current.actError).toMatch(/could not be ended/);
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]));
    fail.end = false;
    await act(async () => {
      await result.current.add(result.current.offered.relationshipKind.find((e) => e.label === "Colleague")!);
    });
    expect(rels.get(dflt)!.ended).toBe(true);
    expect(liveTypes()).toEqual(["t:ColleagueOf", "t:FriendOf"]);
  });
  it("associated-with is offered only while the contact has no tie; picking it writes the default", async () => {
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(result.current.chips).toEqual([]), { timeout: 5000 });
    await offers(result);
    const kinds = result.current.offered.relationshipKind;
    expect(kinds[0]).toMatchObject({ label: "associated-with", id: defaultTieEntryId() });
    expect(kinds.map((e) => e.label)).not.toContain("Public authority");
    await act(async () => {
      await result.current.add(kinds[0]!);
    });
    expect(liveTypes()).toEqual(["t:AssociatedWith"]);
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]));
    expect(result.current.offered.relationshipKind.map((e) => e.label)).not.toContain("associated-with");
  });
  it("the default is never written beside a specific kind, even when asked (two tabs)", async () => {
    const m = mount({ needOffers: true });
    await waitFor(() => expect(m.result.current.chips).toEqual([]), { timeout: 5000 });
    await offers(m.result);
    const dflt = m.result.current.offered.relationshipKind[0]!;
    relate("t:FriendOf"); // written meanwhile from another tab
    await act(async () => {
      await m.result.current.add(dflt);
    });
    expect(liveTypes()).toEqual(["t:FriendOf"]);
  });
  it("a refused write is said and nothing is shown as kept; no label is written in its place", async () => {
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(result.current.chips).toEqual([]), { timeout: 5000 });
    await offers(result);
    fail.write = true;
    let ok = true;
    await act(async () => {
      ok = await result.current.add(result.current.offered.relationshipKind.find((e) => e.label === "Friend")!);
    });
    expect(ok).toBe(false);
    expect(result.current.actError).toMatch(/Could not save the relation/);
    expect(relationsLive()).toHaveLength(0);
    expect(labelClaims()).toHaveLength(0);
  });
});

describe("an ORGANIZATION contact", () => {
  it("is offered Customer (not Friend); picking it writes t:CustomerOf from the organization's record to the vault and replaces the default", async () => {
    const acme = uriOf(fake.seed("t:Organization", { "a:name": "Acme" }));
    const dflt = relate("t:AssociatedWith", acme);
    const { result } = mount({ typeUri: `${M}/t/Organization`, subject: acme, needOffers: true });
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]), { timeout: 5000 });
    await offers(result);
    const kinds = result.current.offered.relationshipKind.map((e) => e.label);
    expect(kinds).toContain("Customer");
    expect(kinds).not.toContain("Friend");
    await act(async () => {
      await result.current.add(result.current.offered.relationshipKind.find((e) => e.label === "Customer")!);
    });
    expect(relationsLive()).toEqual([expect.objectContaining({ type: "t:CustomerOf", source: acme, target: VENT, extra: { "a:claimSubject": { "@id": HOLDER }, "a:visibilityTier": "private" } })]);
    expect(rels.get(dflt)!.ended).toBe(true);
  });
});

describe("removing: the floor rule, and removing the default", () => {
  it("removing the LAST specific kind ends it and writes the default again (one tie stays)", async () => {
    relate("t:FriendOf");
    const { result } = mount();
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]), { timeout: 5000 });
    await act(async () => {
      await result.current.remove(result.current.chips![0]!);
    });
    expect(liveTypes()).toEqual(["t:AssociatedWith"]);
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]));
  });
  it("removing one of two specific kinds writes no default", async () => {
    relate("t:FriendOf");
    relate("t:ColleagueOf");
    const { result } = mount();
    await waitFor(() => expect(result.current.chips?.length).toBe(2), { timeout: 5000 });
    await act(async () => {
      await result.current.remove(result.current.chips!.find((c) => c.label === "Friend")!);
    });
    expect(liveTypes()).toEqual(["t:ColleagueOf"]);
  });
  it("REMOVING THE DEFAULT ends it and writes nothing else: the person removed the tie", async () => {
    const dflt = relate("t:AssociatedWith");
    const { result } = mount();
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]), { timeout: 5000 });
    writePairRelation.mockClear();
    await act(async () => {
      await result.current.remove(result.current.chips![0]!);
    });
    expect(rels.get(dflt)!.ended).toBe(true);
    expect(relationsLive()).toHaveLength(0);
    expect(writePairRelation).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.chips).toEqual([]));
  });
  it("removing an OLD label of a kind with a predicate (the last one) ends the label and writes the default", async () => {
    labelOf(FRIEND);
    const { result } = mount();
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]), { timeout: 5000 });
    await act(async () => {
      await result.current.remove(result.current.chips![0]!);
    });
    expect(labelClaims()).toHaveLength(0);
    expect(liveTypes()).toEqual(["t:AssociatedWith"]);
  });
  it("re-written after it was ended: an ended id the platform REFUSES falls back to a new random id, and the tie is kept", async () => {
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(result.current.chips).toEqual([]), { timeout: 5000 });
    await offers(result);
    await act(async () => {
      await result.current.add(result.current.offered.relationshipKind[0]!); // the default
    });
    const first = relationsLive()[0]!.uri;
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]));
    await act(async () => {
      await result.current.add(result.current.offered.relationshipKind.find((e) => e.label === "Friend")!);
    });
    expect(rels.get(first)!.ended).toBe(true);
    ended.put = "refuse";
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]));
    await act(async () => {
      await result.current.remove(result.current.chips![0]!);
    });
    const live = relationsLive();
    expect(live.map((r) => r.type)).toEqual(["t:AssociatedWith"]);
    expect(live[0]!.uri).not.toBe(first);
  });
  it("re-written after it was ended: an ended id the platform REVIVES keeps the same id (the id is found, not computed)", async () => {
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(result.current.chips).toEqual([]), { timeout: 5000 });
    await offers(result);
    await act(async () => {
      await result.current.add(result.current.offered.relationshipKind[0]!); // the default
    });
    const first = relationsLive()[0]!.uri;
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]));
    await act(async () => {
      await result.current.add(result.current.offered.relationshipKind.find((e) => e.label === "Friend")!);
    });
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]));
    await act(async () => {
      await result.current.remove(result.current.chips![0]!);
    });
    expect(relationsLive().map((r) => r.uri)).toEqual([first]);
  });
  it("when GilbVeda does not list associated-with, the floor writes nothing in its place and SAYS so (the kind is removed)", async () => {
    __setCatalogForTest(userCatalog(false));
    relate("t:FriendOf");
    const { result } = mount();
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]), { timeout: 5000 });
    await act(async () => {
      await result.current.remove(result.current.chips![0]!);
    });
    expect(relationsLive()).toHaveLength(0);
    expect(result.current.actError).toBe(DEFAULT_TIE_MISSING_SAYS);
  });
  it("in a vault that is not the person's own the chips are read, and add and remove refuse and write nothing", async () => {
    relate("t:AssociatedWith");
    const { result } = mount({ ownVaultId: "https://other.platform.example.test/base" });
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]), { timeout: 5000 });
    let ok = true;
    await act(async () => {
      ok = await result.current.remove(result.current.chips![0]!);
    });
    expect(ok).toBe(false);
    expect(result.current.actError).toBe(NOT_OWN_VAULT_SAYS);
    expect(relationsLive()).toHaveLength(1);
    expect(endRelation).not.toHaveBeenCalled();
  });
});

describe("r3 (G1): ids are found, not computed", () => {
  it("an OLD tie written under the hashed id is shown, removed (ENDED, under its own id), and picked again under a NEW random id", async () => {
    const oldId = await legacyKindRelationId({ holder: HOLDER, source: party, curie: "t:FriendOf", target: VENT });
    const old = relate("t:FriendOf", party, oldId);
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]), { timeout: 5000 });
    await act(async () => {
      await result.current.remove(result.current.chips![0]!);
    });
    expect(rels.get(old)!.ended).toBe(true);
    expect(liveTypes()).toEqual(["t:AssociatedWith"]); // the floor
    await offers(result);
    await waitFor(() => expect(result.current.offered.relationshipKind.some((e) => e.label === "Friend")).toBe(true));
    await act(async () => {
      await result.current.add(result.current.offered.relationshipKind.find((e) => e.label === "Friend")!);
    });
    const friend = relationsLive().filter((r) => r.type === "t:FriendOf");
    expect(friend).toHaveLength(1);
    expect(friend[0]!.id).not.toBe(oldId);
    expect(await isLegacyKindRelationId(friend[0]!.id, { holder: HOLDER, source: party, curie: "t:FriendOf", target: VENT })).toBe(false);
    expect(liveTypes()).toEqual(["t:FriendOf"]);
  });
  it("every id this card writes is random: none is the old hash of its tie", async () => {
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(result.current.chips).toEqual([]), { timeout: 5000 });
    await offers(result);
    await act(async () => {
      await result.current.add(result.current.offered.relationshipKind[0]!); // the default
    });
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]));
    await act(async () => {
      await result.current.add(result.current.offered.relationshipKind.find((e) => e.label === "Friend")!);
    });
    for (const r of rels.values()) expect(await isLegacyKindRelationId(r.id, { holder: HOLDER, source: party, curie: r.type, target: VENT })).toBe(false);
  });
  it("two cards on the same contact pick Friend at the same moment: ONE live Friend tie", async () => {
    const a = mount({ needOffers: true });
    const b = mount({ needOffers: true });
    await waitFor(() => expect(a.result.current.chips).toEqual([]), { timeout: 5000 });
    await waitFor(() => expect(b.result.current.chips).toEqual([]), { timeout: 5000 });
    await offers(a.result);
    await offers(b.result);
    const pick = (r: typeof a.result) => r.current.add(r.current.offered.relationshipKind.find((e) => e.label === "Friend")!);
    await act(async () => {
      await Promise.all([pick(a.result), pick(b.result)]);
    });
    expect(relationsLive().filter((r) => r.type === "t:FriendOf")).toHaveLength(1);
  });
});

describe("r4 (s142 D2): another tab or device removes the same kind at the same moment", () => {
  it("this card's end is refused (500) but the tie reads back ended: no error, the floor brings the default back, and Friend is offered again", async () => {
    const friend = relate("t:FriendOf");
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]), { timeout: 5000 });
    // The other side's end lands first; this one is refused as the platform does today ("CAS conflict").
    endRelation.mockImplementationOnce(async () => {
      rels.get(friend)!.ended = true;
      throw new Error('Not ended: the vault refused (500). {"error":"InternalServerError"}');
    });
    let ok = false;
    await act(async () => {
      ok = await result.current.remove(result.current.chips![0]!);
    });
    expect(ok).toBe(true);
    expect(result.current.actError).toBeNull();
    expect(liveTypes()).toEqual(["t:AssociatedWith"]);
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]));
    await offers(result);
    await waitFor(() => expect(result.current.offered.relationshipKind.some((e) => e.label === "Friend")).toBe(true));
  });
  it("an end that really fails is said, and the card reads its ties again (it does not keep a stale list)", async () => {
    relate("t:FriendOf");
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]), { timeout: 5000 });
    // Meanwhile another device added Colleague; this card's end of Friend is refused and Friend is still live.
    relate("t:ColleagueOf");
    fail.end = true;
    let ok = true;
    await act(async () => {
      ok = await result.current.remove(result.current.chips![0]!);
    });
    expect(ok).toBe(false);
    expect(result.current.actError).toMatch(/^Could not remove this/);
    await waitFor(() => expect(labels(result)?.sort()).toEqual(["Colleague", "Friend"]));
  });
});
