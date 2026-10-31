// Ported from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/lib/contact/useContactLabels.s9labels.test.tsx`. What a card pays (the reads it makes, and the ones it does not) and that a chip never shows an address.
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

import { CHIP_PENDING_LABEL, CHIP_UNREADABLE_LABEL, NOT_OWN_VAULT_SAYS, useContactLabels } from "./useContactLabels";
import { __resetContactLabelVocab, contactLabelsOf, resolveContactLabelReadVocab } from "./heldContactLabel";
import { __resetCatalogueCache, __resetOwnKindType } from "@kaigilb/gilbplatformcode-contact-kind-catalogue";
import { __resetKindRelationVocab, type KindVault } from "@kaigilb/gilbplatformcode-kind-relation";
import { __resetHeldNoteChains } from "@kaigilb/gilbplatformcode-held-notes";
import { relationsLive, resetRelationStore } from "../test/relationStoreFake";

afterEach(tearDown);

const { VAULT, store } = fake;
const M = "https://ontology.example.test/base";
const HOLDER = "https://id.platform.example.test/base/p/kai";
const uriOf = (id: string) => `${VAULT}/e/${id}`;
const FRIEND = `${M}/e/relationship-kind-friend`;
const RAW = /^[0-9a-z]{20,}$/;
let party: string;
let log: string[];
const PERSON_VAULT: KindVault = { vaultId: VAULT, entity: `${VAULT}/e/vault-entity-kai`, represents: `${M}/t/Person` };

beforeEach(() => {
  setUp();
  fake.resetStore();
  fake.listVaultRecordsPage.mockClear();
  fake.typeSpelling.mockClear();
  fake.attributeSpelling.mockClear();
  __resetContactLabelVocab();
  __resetCatalogueCache();
  __resetOwnKindType();
  __resetKindRelationVocab();
  resetRelationStore();
  __resetHeldNoteChains();
  stater.uri = uriOf(fake.seed("t:Person", { "a:name": "Kai's vault" }));
  party = uriOf(fake.seed("t:Person", { "a:name": "Rita Larsen" }));
  log = stubNetwork().log;
});

function mount(opts: { needOffers?: boolean; subject?: string; principal?: string; qc?: QueryClient; ownVaultId?: string | null } = {}) {
  const qc = opts.qc ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(
    () => useContactLabels({ vaultId: VAULT, ownVaultId: opts.ownVaultId === undefined ? VAULT : opts.ownVaultId, subject: opts.subject ?? party, principal: opts.principal ?? HOLDER, typeUri: `${M}/t/Person`, kindVault: PERSON_VAULT, enabled: true, needOffers: opts.needOffers ?? false }),
    { wrapper },
  );
}
const claimOf = (kindId: string, subject = party, extra: Record<string, unknown> = {}) =>
  fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": subject }, "a:relationshipKind": { "@id": kindId }, "a:statedBy": { "@id": stater.uri }, "a:visibilityTier": "private", "a:claimSubject": { "@id": HOLDER }, ...extra });
const seedOwn = (n: number): string[] => Array.from({ length: n }, (_, i) => uriOf(fake.seed("t:RelationshipKind", { "a:label": `Own kind ${String(i + 1).padStart(3, "0")}`, "a:playableBy": { "@id": `${M}/t/Person` } })));
const masterReads = () => log.filter((u) => /\/search\?|\/e\/(circle-label|relationship-kind)|\/t\/(CircleLabel|RelationshipKind|Person|Organization|Animal|Organism)$/.test(u));

describe("a chip never shows an address (Agent.Scaling C1: the chip of an own kind past the 50th was its raw id)", () => {
  it("chips naming own kinds 51, 100 and 120 of 120 carry their own names", async () => {
    const own = seedOwn(120);
    for (const i of [50, 99, 119]) claimOf(own[i]!);
    const { result } = mount();
    await waitFor(() => expect(result.current.chips?.length).toBe(3), { timeout: 5000 });
    await waitFor(() => expect(result.current.chips!.every((c) => c.label !== CHIP_PENDING_LABEL)).toBe(true), { timeout: 5000 });
    expect(result.current.chips!.map((c) => c.label).sort()).toEqual(["Own kind 051", "Own kind 100", "Own kind 120"]);
    for (const c of result.current.chips!) expect(c.label).not.toMatch(RAW);
  });

  it("while a kind is being read its chip says '…', and when it cannot be read it says so in words: ⛔ never the address", async () => {
    const own = seedOwn(2);
    claimOf(own[0]!);
    claimOf(`${VAULT}/e/06gk000000000000000000gone`); // a kind that no longer exists
    const real = fake.readRecord.getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    fake.readRecord.mockImplementation(async (id: string, at: string | null) => {
      if (id === own[0]!.slice(own[0]!.lastIndexOf("/") + 1)) await gate;
      return real(id, at);
    });
    const { result } = mount();
    await waitFor(() => expect(result.current.chips?.length).toBe(2), { timeout: 5000 });
    await waitFor(() => expect(result.current.chips!.map((c) => c.label)).toContain(CHIP_UNREADABLE_LABEL), { timeout: 5000 });
    expect(result.current.chips!.map((c) => c.label)).toContain(CHIP_PENDING_LABEL);
    for (const c of result.current.chips!) expect(c.label).not.toMatch(RAW);
    release();
    await waitFor(() => expect(result.current.chips!.map((c) => c.label)).toContain("Own kind 001"), { timeout: 5000 });
    fake.readRecord.mockImplementation(real);
  });
});

describe("what a card pays (Agent.Scaling C1, C4, C5)", () => {
  it("a card with chips does NOT read the holder's own kinds, nor either master catalogue: one small read per distinct kind", async () => {
    const own = seedOwn(120);
    claimOf(own[100]!);
    claimOf(FRIEND);
    claimOf(FRIEND); // a second claim naming the same kind: one read
    const { result } = mount();
    await waitFor(() => expect(result.current.chips?.length).toBe(3), { timeout: 5000 });
    await waitFor(() => expect(result.current.chips!.every((c) => c.label !== CHIP_PENDING_LABEL)).toBe(true), { timeout: 5000 });
    expect(fake.listVaultRecordsPage).not.toHaveBeenCalled();
    expect(log.filter((u) => /\/search\?/.test(u))).toEqual([]);
    expect(log.filter((u) => u === FRIEND)).toHaveLength(1);
    expect(masterReads().filter((u) => u !== FRIEND)).toEqual([]);
  });

  it("a card with no held record about the contact asks the master nothing and reads no term", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.chips).toEqual([]));
    expect(log).toEqual([]);
    expect(fake.typeSpelling).not.toHaveBeenCalled();
    expect(fake.attributeSpelling).not.toHaveBeenCalled();
  });

  it("a card with only the note records (they carry a:heldParty) reads ONE type document, not the label terms (RED at c3972dd: 7 documents)", async () => {
    fake.seed("t:ContactPrivateNote", { "a:heldParty": { "@id": party }, "a:contactPrivateNote": "met her" });
    fake.seed("t:ConnectionOrigin", { "a:heldParty": { "@id": party }, "a:connectionOrigin": "Madrid" });
    const { result } = mount();
    await waitFor(() => expect(result.current.chips).toEqual([]));
    expect(fake.typeSpelling.mock.calls.map((c) => c[0])).toEqual(["HeldPartyFieldClaim"]);
    expect(fake.attributeSpelling).not.toHaveBeenCalled();
    expect(log).toEqual([]);
  });

  it("the lists to add from are read when the chooser opens, all of them: the holder's 200 own kinds, none cut", async () => {
    seedOwn(200);
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(result.current.offersLoading).toBe(false), { timeout: 8000 });
    expect(result.current.offered.relationshipKind.filter((e) => /^Own kind/.test(e.label)).length).toBe(200);
    expect(result.current.catalogueNote).toBeNull();
  });

  it("past the ceiling the chooser SAYS how many it shows", async () => {
    seedOwn(520);
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(result.current.offersLoading).toBe(false), { timeout: 20000 });
    expect(result.current.catalogueNote).toBe("Showing 500 of 520 of your own kinds. The search looks only in these.");
  }, 30000);
});

describe("a chip add or remove carries the list the card holds (Agent.Scaling C6)", () => {
  it("adding a chip to a card that holds 4 records does not list them again; removing one does not either", async () => {
    claimOf(FRIEND);
    fake.seed("t:ContactPrivateNote", { "a:heldParty": { "@id": party }, "a:contactPrivateNote": "x" });
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(result.current.chips?.length).toBe(1), { timeout: 5000 });
    await waitFor(() => expect(result.current.offersLoading).toBe(false), { timeout: 8000 });
    const finds = fake.findByAttribute.mock.calls.length;
    let ok = false;
    await act(async () => {
      ok = await result.current.add(result.current.offered.relationshipKind.find((e) => e.label === "Colleague")!);
    });
    expect(ok).toBe(true);
    expect(fake.findByAttribute.mock.calls.length).toBe(finds); // RED at c3972dd: two finds per act, and a read of every claim
    await waitFor(() => expect(result.current.chips?.length).toBe(2));
    await act(async () => {
      ok = await result.current.remove(result.current.chips!.find((c) => c.label === "Colleague")!);
    });
    expect(ok).toBe(true);
    expect(fake.findByAttribute.mock.calls.length).toBe(finds);
    expect([...store.values()].filter((e) => e.type === "t:HeldPartyFieldClaim").length).toBe(1);
  });

  // SB1a-2: `claimSubject` is now a READ term (a chip is its claim subject's to remove), so it is asked with the other read terms when a chip is read; the private row's
  // tier alone is a write term.
  it("the write term (the private row's tier) is asked when a chip is written, not when the card opens; claimSubject is read with the chips", async () => {
    claimOf(FRIEND);
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(result.current.chips?.length).toBe(1), { timeout: 5000 });
    await waitFor(() => expect(result.current.offersLoading).toBe(false), { timeout: 8000 });
    const asked = () => fake.attributeSpelling.mock.calls.map((c) => c[0]);
    expect(asked()).toContain("claimSubject");
    expect(asked()).not.toContain("visibilityTier");
    await act(async () => {
      await result.current.add(result.current.offered.relationshipKind.find((e) => e.label === "Colleague")!);
    });
    expect(asked()).toContain("visibilityTier");
  });
});

describe("the leak surface (Agent.Tester F2: two mutants survived the s8 tests)", () => {
  it("the chips of ANOTHER contact do not show on this card (the subject filter)", async () => {
    const other = uriOf(fake.seed("t:Person", { "a:name": "Walker Hayes" }));
    claimOf(FRIEND);
    claimOf(`${M}/e/relationship-kind-customer`, other);
    const v = await resolveContactLabelReadVocab();
    const all = [...store.entries()].map(([id, e]) => ({ id, uri: uriOf(id), doc: e.facts as Record<string, unknown>, typeUri: e.type }));
    const mine = contactLabelsOf(all, v, party);
    expect(mine.map((c) => c.entry)).toEqual([FRIEND]);
    expect(contactLabelsOf(all, v, other).map((c) => c.entry)).toEqual([`${M}/e/relationship-kind-customer`]);
    const { result } = mount();
    await waitFor(() => expect(result.current.chips?.length).toBe(1), { timeout: 5000 });
  });

  it("the holder written on a claim is the signed-in PRINCIPAL, not the vault's address", async () => {
    claimOf(FRIEND); // so the card has something; the add below writes the new one
    const { result } = mount({ needOffers: true });
    await waitFor(() => expect(result.current.offersLoading).toBe(false), { timeout: 8000 });
    await act(async () => {
      await result.current.add(result.current.offered.relationshipKind.find((e) => e.label === "Colleague")!);
    });
    // Colleague is a RELATION now: the holder is on the relation, not the vault's address, and no reader is written.
    const written = relationsLive().at(-1)!;
    expect(written.extra["a:claimSubject"]).toEqual({ "@id": HOLDER });
    expect(written.extra["a:claimSubject"]).not.toEqual({ "@id": VAULT });
    expect(written.extra["a:directReader"]).toBeUndefined();
  });
});

describe("only in the signer's own vault (F5, Kai-Zen 2026-10-16)", () => {
  it("add and remove refuse on a vault that is not the signer's own, say so, write nothing, and the chip is still READ", async () => {
    claimOf(FRIEND);
    const { result } = mount({ needOffers: true, ownVaultId: "https://other.platform.example.test/base" });
    await waitFor(() => expect(result.current.chips?.length).toBe(1), { timeout: 5000 });
    expect(result.current.chips![0]!.label).toBe("Friend");
    const before = store.size;
    let ok = true;
    await act(async () => {
      ok = await result.current.add({ id: `${M}/e/relationship-kind-customer`, label: "Customer", order: 1, playableBy: [], axis: "relationshipKind", own: false });
    });
    expect(ok).toBe(false);
    expect(result.current.actError).toBe(NOT_OWN_VAULT_SAYS);
    await act(async () => {
      ok = await result.current.remove(result.current.chips![0]!);
    });
    expect(ok).toBe(false);
    expect(store.size).toBe(before);
  });
  it("with no own vault known nothing is written", async () => {
    const { result } = mount({ ownVaultId: null });
    await waitFor(() => expect(result.current.chips).toEqual([]));
    let ok = true;
    await act(async () => {
      ok = await result.current.add({ id: FRIEND, label: "Friend", order: 5, playableBy: [], axis: "relationshipKind", own: false });
    });
    expect(ok).toBe(false);
    expect([...store.values()].filter((e) => e.type === "t:HeldPartyFieldClaim").length).toBe(0);
  });
});
