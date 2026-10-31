// New. The requests the unit sends and the servers they go to: the ontology master (public reads, no credential, at `termOrigin()` read WHEN USED, not when the
// module loads), the user-plane vocabulary (`GET /base/vocab?status=all&linkPlane=user`, public, at the platform's corpus origin), and the vault's own node
// (the per-person find, the create and the read-back, each signed for the vault node it is sent to). Also the module state of the term caches.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import * as fake from "../test/fakePlaceStore";
import { APEX, ONTOLOGY, PRINCIPAL, setUp, stubNetwork, tearDown } from "../test/support";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { isCardPartType } from "@kaigilb/gilbplatformcode-lws-vault-sets";

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
  (await import("../test/adderCardMock")).adderCardMock(await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(), async () => stater.uri),
);

import { useContactLabels } from "./useContactLabels";
import { __resetContactLabelVocab, resolveContactLabelReadVocab, resolveContactLabelVocab, resolveHeldClaimType } from "./heldContactLabel";
import { __resetCatalogueCache } from "@kaigilb/gilbplatformcode-contact-kind-catalogue";
import { __resetKindRelationVocab, type KindVault } from "@kaigilb/gilbplatformcode-kind-relation";
import { __resetHeldNoteChains } from "@kaigilb/gilbplatformcode-held-notes";
import { __setCatalogForTest } from "@kaigilb/gilbplatformcode-lws-relations";
import { rels, resetRelationStore } from "../test/relationStoreFake";

const { VAULT } = fake;
const VAULT_HOST = "https://hytta.platform.example.test";
const M = `${ONTOLOGY}/base`;
const PERSON_VAULT: KindVault = { vaultId: VAULT, entity: `${VAULT}/e/vault-entity-kai`, represents: `${M}/t/Person` };
let party: string;

beforeEach(() => {
  setUp();
  fake.resetStore();
  __resetContactLabelVocab();
  __resetCatalogueCache();
  __resetKindRelationVocab();
  resetRelationStore();
  __resetHeldNoteChains();
  __setCatalogForTest(null);
  stater.uri = `${VAULT}/e/${fake.seed("t:Person", { "a:name": "Kai's vault" })}`;
  party = `${VAULT}/e/${fake.seed("t:Person", { "a:name": "Rita Larsen" })}`;
});
afterEach(() => {
  cleanup();
  __setCatalogForTest(null);
  tearDown();
});

type Call = [unknown, RequestInit | undefined];
function mount(kindVault: KindVault | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(() => useContactLabels({ vaultId: VAULT, ownVaultId: VAULT, subject: party, principal: PRINCIPAL, typeUri: `${M}/t/Person`, kindVault, enabled: true, needOffers: true }), { wrapper });
}
const urls = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map(([u]) => new URL(String(u)));
const headerOf = (init: RequestInit | undefined, name: string): string | undefined => (init?.headers as Record<string, string> | undefined)?.[name];

describe("the servers a card talks to", () => {
  it("adding a circle label sends the master reads to the master, public (no credential), and every vault request to the vault's own node, signed for that node", async () => {
    const net = stubNetwork();
    const { result } = mount();
    await waitFor(() => expect(result.current.offersLoading).toBe(false), { timeout: 8000 });
    await act(async () => {
      expect(await result.current.add(result.current.offered.circleLabel[0]!)).toBe(true);
    });
    const calls = net.fetchSpy.mock.calls as Call[];
    expect([...new Set(urls(net.fetchSpy).map((u) => u.origin))].sort()).toEqual([ONTOLOGY, VAULT_HOST].sort());
    for (const [u, init] of calls) {
      const url = new URL(String(u));
      if (url.origin === ONTOLOGY) {
        expect(url.pathname).toMatch(/^\/base\/(search|t\/|e\/)/);
        expect(init?.method ?? "GET").toBe("GET");
        expect(headerOf(init, "authorization")).toBeUndefined();
      } else {
        expect(headerOf(init, "authorization")).toBe("DPoP tok-test");
        // The find and the create are signed for the exact request (DPoP); the read-back by address carries the bearer only.
        if (url.pathname.startsWith("/lws/r/")) expect(headerOf(init, "dpop")).toBeUndefined();
        else expect(headerOf(init, "dpop")).toBe(`htu=${url.origin}${url.pathname}`);
      }
    }
    const vaultCalls = calls.filter(([u]) => new URL(String(u)).origin === VAULT_HOST).map(([u, i]) => `${i?.method ?? "GET"} ${new URL(String(u)).pathname}`);
    expect(vaultCalls.filter((c) => c.startsWith("GET /base/find-by-attribute")).length).toBeGreaterThan(0);
    expect(vaultCalls.filter((c) => c.startsWith("POST "))).toEqual([`POST /lws/vault/${encodeURIComponent(VAULT)}/c`]);
    expect(vaultCalls.filter((c) => !c.startsWith("GET /base/find-by-attribute") && !c.startsWith("POST ") && !c.startsWith("GET /lws/r/"))).toEqual([]);
  });

  it("the master's address is read when it is USED: an origin set after the module loaded is the one asked", async () => {
    setTermOrigin("https://ontology-two.example.test");
    const net = stubNetwork();
    const { result } = mount();
    await waitFor(() => expect(result.current.offersLoading).toBe(false), { timeout: 8000 });
    const hosts = [...new Set(urls(net.fetchSpy).map((u) => u.origin))];
    expect(hosts).toContain("https://ontology-two.example.test");
    expect(hosts).not.toContain(ONTOLOGY);
  });

  it("with a relation to the vault, the user-plane vocabulary is read ONCE: GET /base/vocab?status=all&linkPlane=user at the platform's corpus origin, with no credential", async () => {
    const net = stubNetwork();
    const inner = globalThis.fetch;
    const vocab = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: unknown, i?: RequestInit) => {
        if (String(u).startsWith(`${APEX}/base/vocab`)) {
          vocab(String(u), i);
          return Response.json({ "@graph": [{ "@id": `${M}/t/AssociatedWith`, "a:label": "associated-with", "a:linkPlane": "user", "a:typeAttribute": "t:AssociatedWith", "a:symmetric": true }] });
        }
        return inner(u as string, i);
      }),
    );
    void net;
    rels.set(`${VAULT}/r/r1`, { id: "r1", uri: `${VAULT}/r/r1`, type: "t:AssociatedWith", source: party, target: PERSON_VAULT.entity!, extra: {}, vault: VAULT, ended: false });
    const { result } = mount(PERSON_VAULT);
    await waitFor(() => expect(result.current.chips?.map((c) => c.label)).toEqual(["associated-with"]), { timeout: 8000 });
    await waitFor(() => expect(result.current.offersLoading).toBe(false), { timeout: 8000 });
    expect(vocab).toHaveBeenCalledTimes(1);
    const [url, init] = vocab.mock.calls[0]!;
    expect(url).toBe(`${APEX}/base/vocab?status=all&linkPlane=user`);
    expect(init?.method ?? "GET").toBe("GET");
    expect(headerOf(init, "authorization")).toBeUndefined();
  });

  it("a card with no relation to the vault and no chip asks neither the vocabulary nor the master before the chooser opens", async () => {
    const net = stubNetwork();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useContactLabels({ vaultId: VAULT, ownVaultId: VAULT, subject: party, principal: PRINCIPAL, typeUri: `${M}/t/Person`, kindVault: PERSON_VAULT, enabled: true }), { wrapper });
    await waitFor(() => expect(result.current.chips).toEqual([]), { timeout: 5000 });
    const hosts = urls(net.fetchSpy).map((u) => `${u.origin}${u.pathname}`);
    expect(hosts.filter((h) => h.startsWith(ONTOLOGY) || h.startsWith(`${APEX}/base/vocab`))).toEqual([]);
  });
});

describe("module state: the term caches", () => {
  beforeEach(() => {
    fake.typeSpelling.mockClear();
    fake.attributeSpelling.mockClear();
  });
  it("the claim type and the term spellings are asked once per page session, and again after the test seam", async () => {
    const a = await resolveHeldClaimType();
    await resolveHeldClaimType();
    expect(a).toBe("t:HeldPartyFieldClaim");
    expect(fake.typeSpelling).toHaveBeenCalledTimes(1);
    const read = await resolveContactLabelReadVocab();
    await resolveContactLabelReadVocab();
    expect(read.claimSubject).toBe("a:claimSubject");
    const readCalls = fake.attributeSpelling.mock.calls.length;
    const full = await resolveContactLabelVocab();
    await resolveContactLabelVocab();
    expect(full.visibilityTier).toBe("a:visibilityTier");
    expect(fake.attributeSpelling.mock.calls.length).toBe(readCalls + 1); // only the one write term more
    __resetContactLabelVocab();
    await resolveHeldClaimType();
    expect(fake.typeSpelling).toHaveBeenCalledTimes(2);
  });
  it("the claim type is registered as a part of a person card, not a register row, when it is resolved", async () => {
    fake.typeSpelling.mockImplementationOnce(async () => "t:LabelClaimProbeType");
    expect(isCardPartType("t:LabelClaimProbeType")).toBe(false);
    await resolveHeldClaimType();
    expect(isCardPartType("t:LabelClaimProbeType")).toBe(true);
  });
  it("a read the master could not answer is not kept: the next ask tries again", async () => {
    fake.typeSpelling.mockImplementationOnce(async () => null as never);
    await expect(resolveHeldClaimType()).rejects.toThrow(/did not name t\/HeldPartyFieldClaim/);
    await expect(resolveHeldClaimType()).resolves.toBe("t:HeldPartyFieldClaim");
  });
  it("a missing write term makes the write vocabulary unavailable but leaves the read vocabulary working", async () => {
    fake.attributeSpelling.mockImplementation(async (n: string) => (n === "visibilityTier" ? (null as never) : n));
    await expect(resolveContactLabelVocab()).rejects.toThrow(/a\/visibilityTier/);
    await expect(resolveContactLabelReadVocab()).resolves.toMatchObject({ heldParty: "a:heldParty" });
    fake.attributeSpelling.mockReset().mockImplementation(async (n: string) => n);
  });
});
