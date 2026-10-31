// Ported from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/lib/contact/useContactLabels.c214r5.test.tsx`. Every message and every floor decision is made from a fresh read AFTER the write or end, never from a list read before it.
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

import { useContactLabels } from "./useContactLabels";
import { __resetContactLabelVocab } from "./heldContactLabel";
import { __resetCatalogueCache } from "@kaigilb/gilbplatformcode-contact-kind-catalogue";
import { __resetKindRelationVocab, type KindVault } from "@kaigilb/gilbplatformcode-kind-relation";
import { __resetHeldNoteChains } from "@kaigilb/gilbplatformcode-held-notes";
import { __setCatalogForTest, catalogFromGraph } from "@kaigilb/gilbplatformcode-lws-relations";
import { endRelation, fail, readRelations, relationsLive, rels, resetRelationStore, writePairRelation } from "../test/relationStoreFake";

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


const pickFriend = (r: { current: ReturnType<typeof useContactLabels> }) => r.current.add(r.current.offered.relationshipKind.find((e) => e.label === "Friend")!);

describe("r5 (s143 D3): both sides pick the same kind at once; what is said comes from a fresh read after the write", () => {
  it("TABS: the other tab wrote Friend and ended the default between this card's read and its write: no message, one Friend chip", async () => {
    // Agent.Tester s143 gap test, adopted: two tabs take turns under the lock, so this card's read (before the lock) is older than its write.
    const dflt = relate("t:AssociatedWith");
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]), { timeout: 5000 });
    await offers(result);
    const real = readRelations.getMockImplementation()!;
    let n = 0;
    readRelations.mockImplementation(async (...a: Parameters<typeof real>) => {
      const out = await real(...a);
      if (++n === 1) {
        relate("t:FriendOf", party, "zzother");
        rels.get(dflt)!.ended = true;
      }
      return out;
    });
    await act(async () => {
      await pickFriend(result);
    });
    readRelations.mockImplementation(real);
    expect(liveTypes()).toEqual(["t:FriendOf"]);
    expect(result.current.actError).toBeNull();
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]));
    expect(result.current.ties?.map((t) => t.curie)).toEqual(["t:FriendOf"]);
  });
  it("DEVICES: the other device's Friend (a lower id) lands as this one writes, and it ended the default: this card's heal keeps theirs, no message", async () => {
    const dflt = relate("t:AssociatedWith");
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]), { timeout: 5000 });
    await offers(result);
    const real = writePairRelation.getMockImplementation()!;
    writePairRelation.mockImplementationOnce(async (input) => {
      relate("t:FriendOf", party, "--other");
      rels.get(dflt)!.ended = true;
      return real(input);
    });
    await act(async () => {
      await pickFriend(result);
    });
    expect(relationsLive().map((r) => `${r.type} ${r.id}`)).toEqual(["t:FriendOf --other"]);
    expect(result.current.actError).toBeNull();
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]));
    expect(result.current.ties?.map((t) => t.relationUri)).toEqual([`${VAULT}/r/--other`]);
  });
  it("a REAL failure is still said: the end of the default is refused and the default reads back live", async () => {
    relate("t:AssociatedWith");
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]), { timeout: 5000 });
    await offers(result);
    fail.end = true;
    await act(async () => {
      await pickFriend(result);
    });
    expect(liveTypes()).toEqual(["t:AssociatedWith", "t:FriendOf"]);
    expect(result.current.actError).toMatch(/^Friend was added\. The earlier associated-with could not be ended \(Not ended: the vault refused \(403\)\.\)/);
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]));
  });
  it("the end of the default is refused, but by the time this card reads it back it is ended: nothing is said", async () => {
    const dflt = relate("t:AssociatedWith");
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]), { timeout: 5000 });
    await offers(result);
    let calls = 0;
    let refused = false;
    const realEnd = endRelation.getMockImplementation()!;
    endRelation.mockImplementation(async (u: string) => {
      if (u === dflt && !refused) {
        refused = true;
        throw new Error("Not ended: the vault refused (500).");
      }
      return realEnd(u);
    });
    const { readRelationDoc } = await import("../test/relationStoreFake");
    const realDoc = readRelationDoc.getMockImplementation()!;
    readRelationDoc.mockImplementation(async (...a: Parameters<typeof realDoc>) => {
      // The first read after the refusal (inside the end) still sees it live; the other side's end lands before the card's own read-back.
      if (refused && a[0] === dflt && ++calls === 2) rels.get(dflt)!.ended = true;
      return realDoc(...a);
    });
    await act(async () => {
      await pickFriend(result);
    });
    readRelationDoc.mockImplementation(realDoc);
    endRelation.mockImplementation(realEnd);
    expect(refused).toBe(true);
    expect(liveTypes()).toEqual(["t:FriendOf"]);
    expect(result.current.actError).toBeNull();
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]));
  });
});

describe("r5 sweep: the floor and the removes decide from a fresh read after the end", () => {
  it("REMOVE RACE: the other device removed Colleague meanwhile; removing Friend here (the card still shows Colleague) brings the default back, never zero ties", async () => {
    relate("t:FriendOf");
    const colleague = relate("t:ColleagueOf");
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(result.current.chips?.length).toBe(2), { timeout: 5000 });
    rels.get(colleague)!.ended = true; // the other device's remove; this card has not read since
    let ok = false;
    await act(async () => {
      ok = await result.current.remove(result.current.chips!.find((c) => c.label === "Friend")!);
    });
    expect(ok).toBe(true);
    expect(result.current.actError).toBeNull();
    expect(liveTypes()).toEqual(["t:AssociatedWith"]);
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]));
  });
  it("REMOVE RACE: the other device added Colleague meanwhile; removing Friend here writes no default and shows Colleague", async () => {
    relate("t:FriendOf");
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]), { timeout: 5000 });
    relate("t:ColleagueOf");
    writePairRelation.mockClear();
    await act(async () => {
      await result.current.remove(result.current.chips![0]!);
    });
    expect(writePairRelation).not.toHaveBeenCalled();
    expect(result.current.actError).toBeNull();
    expect(liveTypes()).toEqual(["t:ColleagueOf"]);
    await waitFor(() => expect(labels(result)).toEqual(["Colleague"]));
  });
  it("an OLD label the other side already removed: this card's delete is refused, the label reads back gone, nothing is said and the default comes back", async () => {
    const id = labelOf(FRIEND);
    const { result } = mount();
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]), { timeout: 5000 });
    fake.deleteRecord.mockImplementationOnce(async () => {
      store.delete(id);
      throw new Error("delete failed: 500");
    });
    let ok = false;
    await act(async () => {
      ok = await result.current.remove(result.current.chips![0]!);
    });
    expect(ok).toBe(true);
    expect(result.current.actError).toBeNull();
    expect(labelClaims()).toHaveLength(0);
    expect(liveTypes()).toEqual(["t:AssociatedWith"]);
  });
  it("an OLD label whose delete really fails (it reads back live) is still said", async () => {
    labelOf(FRIEND);
    const { result } = mount();
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]), { timeout: 5000 });
    fake.deleteRecord.mockImplementationOnce(async () => {
      throw new Error("delete failed: 500");
    });
    let ok = true;
    await act(async () => {
      ok = await result.current.remove(result.current.chips![0]!);
    });
    expect(ok).toBe(false);
    expect(result.current.actError).toMatch(/^Could not remove this: delete failed: 500/);
    expect(labelClaims()).toHaveLength(1);
    expect(liveTypes()).toEqual([]);
  });
});

describe("r5: a reverse lookup that lags behind the write or end does not undo what this card confirmed", () => {
  it("removing the LAST kind while the lookup still lists it: the default is still written (never zero ties)", async () => {
    relate("t:FriendOf");
    const { result } = mount();
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]), { timeout: 5000 });
    const stale = await readRelations.getMockImplementation()!("", party);
    readRelations.mockImplementationOnce(async () => stale); // the floor's read, just after the end
    await act(async () => {
      await result.current.remove(result.current.chips![0]!);
    });
    expect(result.current.actError).toBeNull();
    expect(liveTypes()).toEqual(["t:AssociatedWith"]);
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]));
  });
  it("picking Friend while the lookup after the write still shows only the default: the card shows Friend, and not the default it ended", async () => {
    const dflt = relate("t:AssociatedWith");
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]), { timeout: 5000 });
    await offers(result);
    const stale = await readRelations.getMockImplementation()!("", party);
    const realEnd = endRelation.getMockImplementation()!;
    endRelation.mockImplementation(async (u: string) => {
      const out = await realEnd(u);
      if (u === dflt) readRelations.mockImplementationOnce(async () => stale); // the card's read after the write lags
      return out;
    });
    await act(async () => {
      await pickFriend(result);
    });
    endRelation.mockImplementation(realEnd);
    expect(liveTypes()).toEqual(["t:FriendOf"]);
    expect(result.current.actError).toBeNull();
    expect(result.current.ties?.map((t) => t.curie)).toEqual(["t:FriendOf"]);
    expect(labels(result)).toEqual(["Friend"]);
  });
  it("REMOVING THE DEFAULT after another device added Colleague: the card shows Colleague from its read after the end", async () => {
    const dflt = relate("t:AssociatedWith");
    const { result } = mount();
    await waitFor(() => expect(labels(result)).toEqual(["associated-with"]), { timeout: 5000 });
    relate("t:ColleagueOf"); // the other device's pick (its heal ends the default)
    rels.get(dflt)!.ended = true;
    let ok = false;
    await act(async () => {
      ok = await result.current.remove(result.current.chips![0]!);
    });
    expect(ok).toBe(true);
    expect(result.current.actError).toBeNull();
    expect(liveTypes()).toEqual(["t:ColleagueOf"]);
    expect(result.current.ties?.map((t) => t.curie)).toEqual(["t:ColleagueOf"]);
  });
});

describe("r5: what a refused label delete is never taken as done", () => {
  it("a sign-in failure is said, never read back (even when the claim is gone)", async () => {
    const id = labelOf(FRIEND);
    const { result } = mount();
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]), { timeout: 5000 });
    // Changed from the source, which threw `NotSignedInError` from its record-client mock: the real client raises it on a 401, so the platform answers 401
    // to the one DELETE (after the claim is gone).
    const real = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: unknown, i?: RequestInit) => {
        if (i?.method === "DELETE") {
          store.delete(id);
          return new Response("{}", { status: 401 });
        }
        return real(u as string, i);
      }),
    );
    let ok = true;
    await act(async () => {
      ok = await result.current.remove(result.current.chips![0]!);
    });
    expect(ok).toBe(false);
    expect(result.current.actError).toMatch(/^Could not remove this: Your sign-in needs refreshing/);
  });
  it("a claim that cannot be read back after the refusal keeps the refusal", async () => {
    labelOf(FRIEND);
    const { result } = mount();
    await waitFor(() => expect(labels(result)).toEqual(["Friend"]), { timeout: 5000 });
    fake.deleteRecord.mockImplementationOnce(async () => {
      fake.readRecord.mockImplementationOnce(async () => {
        throw new Error("read failed: 500");
      });
      throw new Error("delete failed: 500");
    });
    let ok = true;
    await act(async () => {
      ok = await result.current.remove(result.current.chips![0]!);
    });
    expect(ok).toBe(false);
    expect(result.current.actError).toMatch(/^Could not remove this: delete failed: 500/);
  });
});
