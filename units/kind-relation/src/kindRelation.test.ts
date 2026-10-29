// Kind-as-relation and the default associated-with tie: the pure rules and the WIRE (what the real `writePairRelation` / `endRelation` send).
// The app's mocks of its token and DPoP modules are the fake auth host of `test/support.ts`, set with `setLwsAuth`; its mock of the term slots
// and of the relation-document reader are mocks of the two peers.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakeAttributeNames = vi.hoisted((): Record<string, string> => ({ claimSubject: "claimSubject", visibilityTier: "visibilityTier" }));
vi.mock("@kaigilb/gilbplatformcode-term-slots", async (importOriginal) => ({
  ...((await importOriginal()) as typeof import("@kaigilb/gilbplatformcode-term-slots")),
  attributeSpelling: async (n: string) => fakeAttributeNames[n] ?? null,
  typeSpelling: async () => null,
  attributeLabel: async () => null,
}));
const docs = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@kaigilb/gilbplatformcode-lws-relations", async (orig) => ({ ...(await orig<typeof import("@kaigilb/gilbplatformcode-lws-relations")>()), readRelationDoc: docs.read }));

import { NotSignedInError } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { __setCatalogForTest, catalogFromGraph, mintRelationId } from "@kaigilb/gilbplatformcode-lws-relations";
import { canonicalEntity, sameEntity, type KindEntry } from "@kaigilb/gilbplatformcode-contact-kind-model";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import { setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { ONTOLOGY, PRINCIPAL, setUp, tearDown, type FakeHost } from "../test/support";
import {
  __resetKindRelationVocab,
  assertKindRelationFacts,
  defaultTieEntry,
  defaultTieEntryId,
  endKindRelations,
  isDefaultTie,
  isPartyType,
  KindRelationError,
  kindRelationFacts,
  endTies,
  healTies,
  isLegacyKindRelationId,
  legacyKindRelationId,
  matchTies,
  MAX_TIE_GENERATIONS,
  ownLiveTies,
  tieLockName,
  withBrowserLock,
  readBackIsTie,
  relationKindsOffered,
  relationsTouchingVault,
  resolveKindRelationVocab,
  vaultMasterType,
  writeKindRelation,
  writeTie,
  type KindVault,
} from "./kindRelation";

setTermOrigin(ONTOLOGY);
const M = `${ONTOLOGY}/base`;
const HOLDER = PRINCIPAL;
const VNS = "https://ann.platform.example.test/base";
const VENT = `${VNS}/e/vault-entity-ann`;
const CONTACT = `${VNS}/e/ben`;
const SELF_CARD = `${VNS}/e/vsc-selfcard`;
const VAULT: KindVault = { vaultId: VNS, entity: VENT, represents: `${M}/t/Person` };
const VOCAB = { claimSubject: "a:claimSubject", visibilityTier: "a:visibilityTier" };
const SYMMETRIC = /^(FriendOf|FamilyOf|ColleagueOf|BusinessPartnerOf|AssociatedWith)$/;
const CAT = catalogFromGraph(
  ["AssociatedWith", "FriendOf", "CustomerOf", "FamilyOf", "ColleagueOf", "ProspectOf", "SupplierOf", "AdvisorOf", "BusinessPartnerOf"].map((n) => ({
    "@id": `${M}/t/${n}`,
    "a:label": n === "AssociatedWith" ? "associated-with" : n,
    "a:linkPlane": "user",
    "a:typeAttribute": `t:${n}`,
    "a:symmetric": SYMMETRIC.test(n),
  })),
  "user",
);

const entry = (label: string, curie: string | null, over: Partial<KindEntry> = {}): KindEntry => ({
  id: `${M}/e/relationship-kind-${label.toLowerCase()}`,
  label,
  order: 1,
  playableBy: [`${M}/t/Person`],
  axis: "relationshipKind",
  own: false,
  ...(curie ? { kindPredicate: { curie } } : {}),
  kindForVault: [`${M}/t/Person`, `${M}/t/Organization`, `${M}/t/Project`],
  ...over,
});
const FRIEND = entry("Friend", "t:FriendOf");
const CUSTOMER = entry("Customer", "t:CustomerOf", { playableBy: [`${M}/t/Person`, `${M}/t/Organization`] });
const DEFAULT = defaultTieEntry(CAT)!;

const okResponse = (status: number, json: unknown) => ({ ok: true, status, json: async (): Promise<unknown> => json, text: async (): Promise<string> => "", headers: { get: (): string | null => null } });
let puts: { url: string; method: string; body: Record<string, unknown> }[] = [];
let others: { url: string; method: string }[] = [];
let host: FakeHost;

beforeEach(() => {
  host = setUp();
  puts = [];
  others = [];
  __resetKindRelationVocab();
  docs.read.mockReset();
  host.tokenManager.getSession.mockResolvedValue({ principal: HOLDER, vault: { vaultId: VNS }, vaults: [{ vaultId: VNS, modes: ["read", "write"] }] } as never);
  __setCatalogForTest(CAT);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "PUT") {
        puts.push({ url: String(url), method, body: JSON.parse(String(init!.body)) });
        return okResponse(201, { changed: true, entity: String(url) });
      }
      // The read-back that `endRelation` makes after an end: the app's mock of the document reader answered nothing there, which is a 404 here.
      if (method === "GET" && /\/base\/r\//.test(String(url))) return { ok: false, status: 404, json: async (): Promise<unknown> => ({}), text: async (): Promise<string> => "", headers: { get: (): string | null => null } };
      others.push({ url: String(url), method });
      if (method === "POST" && /\/end$/.test(String(url))) return okResponse(200, { relation: `${VNS}/r/${String(url).split("/").slice(-2)[0]}`, changed: true });
      throw new Error(`unexpected fetch ${method} ${url}`);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  __setCatalogForTest(null);
  tearDown();
});

describe("the facts of a kind relation: EXACTLY four, an allowlist", () => {
  const good = () => kindRelationFacts(VOCAB, { source: CONTACT, target: VENT, holder: HOLDER });
  const args = { source: CONTACT, target: VENT, holder: HOLDER };
  it("are the two roles, the holder and the private tier, and nothing else", () => {
    expect(good()).toEqual({ "role:source": { "@id": CONTACT }, "role:target": { "@id": VENT }, "a:claimSubject": { "@id": HOLDER }, "a:visibilityTier": "private" });
  });
  it.each([
    ["a:directReader", { "@id": HOLDER }],
    ["a:readerGroup", { "@id": "x" }],
    ["a:vaultReader", { "@id": "x" }],
    ["a:audienceRungMember", { "@id": "x" }],
    ["a:audience", "t:SignedInGrantee"],
    ["a:networkFindKey", "x"],
    ["a:statedBy", { "@id": SELF_CARD }],
    ["a:inventedGrantPredicateNobodyThoughtOf", true],
  ])("refuses %s: any fact outside the four", (key, value) => {
    expect(() => assertKindRelationFacts({ ...good(), [key]: value }, VOCAB, args)).toThrow(KindRelationError);
  });
  it("refuses any tier but private, and a missing tier", () => {
    for (const tier of ["public", "t:SignedInGrantee", "", undefined]) expect(() => assertKindRelationFacts({ ...good(), "a:visibilityTier": tier }, VOCAB, args)).toThrow(/private row/);
    const { "a:visibilityTier": _t, ...noTier } = good();
    void _t;
    expect(() => assertKindRelationFacts(noTier, VOCAB, args)).toThrow(KindRelationError);
  });
  it("refuses a holder that is not the signed-in one", () => {
    expect(() => assertKindRelationFacts({ ...good(), "a:claimSubject": { "@id": CONTACT } }, VOCAB, args)).toThrow(/holder only/);
    expect(() => kindRelationFacts(VOCAB, { ...args, holder: "" })).toThrow(KindRelationError);
  });
  it("starts at the contact and ends at the VAULT'S ENTITY, never the contact itself", () => {
    expect(() => assertKindRelationFacts({ ...good(), "role:target": { "@id": SELF_CARD } }, VOCAB, args)).toThrow(/vault's entity/);
    expect(() => kindRelationFacts(VOCAB, { source: CONTACT, target: CONTACT, holder: HOLDER })).toThrow(/itself/);
  });
});

describe("the relation's id (r3, G1): RANDOM, never computed from the tie; the old hashed ids are only recognised", () => {
  const a = { holder: HOLDER, source: CONTACT, curie: "t:FriendOf", target: VENT };
  it("a new id is 26 hex and a different one every time", () => {
    const ids = new Set(Array.from({ length: 200 }, () => mintRelationId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{26}$/);
  });
  it("THE GUESS ATTACK FAILS: no kind and no generation of the old formula gives the new id", async () => {
    const id = mintRelationId();
    const kinds = ["AssociatedWith", "FriendOf", "FamilyOf", "ColleagueOf", "CustomerOf", "ProspectOf", "SupplierOf", "BusinessPartnerOf", "AdvisorOf"];
    for (const k of kinds) for (let g = 0; g < MAX_TIE_GENERATIONS; g++) expect(await legacyKindRelationId({ ...a, curie: `t:${k}`, generation: g })).not.toBe(id);
    expect(await isLegacyKindRelationId(id, a)).toBe(false);
  });
  it("an OLD id (any generation) of this tie is recognised; another tie's old id is not", async () => {
    for (let g = 0; g < MAX_TIE_GENERATIONS; g++) expect(await isLegacyKindRelationId(await legacyKindRelationId({ ...a, generation: g }), a)).toBe(true);
    expect(await isLegacyKindRelationId(await legacyKindRelationId({ ...a, curie: "t:CustomerOf" }), a)).toBe(false);
    expect(await isLegacyKindRelationId("not-hex", a)).toBe(false);
  });
});

describe("what the real door sends (WIRE): ONE PUT of the relation, nothing else", () => {
  it("PUT <vault>/r/<id> with the predicate as the type, the four facts and the vault named", async () => {
    const id = mintRelationId();
    const res = await writeKindRelation({ vault: VAULT, subject: CONTACT, curie: "t:FriendOf", holder: HOLDER, id });
    expect(res.id).toBe(id);
    expect(puts).toHaveLength(1);
    expect(others).toEqual([]);
    expect(puts[0]!.url).toMatch(new RegExp(`/base/r/${id}$`));
    expect(puts[0]!.body.type).toBe("t:FriendOf");
    expect(puts[0]!.body.vault).toBe(VNS);
    expect(puts[0]!.body.facts).toEqual({ "role:source": { "@id": CONTACT }, "role:target": { "@id": VENT }, "a:claimSubject": { "@id": HOLDER }, "a:visibilityTier": "private" });
    expect(Object.keys(puts[0]!.body).sort()).toEqual(["agent", "facts", "type", "vault"]);
  });
  it("the DEFAULT is the same shape with t:AssociatedWith as its type (⛔ never t:ConnectedTo)", async () => {
    await writeKindRelation({ vault: VAULT, subject: CONTACT, curie: DEFAULT.kindPredicate!.curie, holder: HOLDER, id: "d1" });
    expect(puts[0]!.body.type).toBe("t:AssociatedWith");
    expect(puts[0]!.body.facts).toEqual({ "role:source": { "@id": CONTACT }, "role:target": { "@id": VENT }, "a:claimSubject": { "@id": HOLDER }, "a:visibilityTier": "private" });
  });
  it("the default is refused by the one door when the live user-plane catalogue does not list it: nothing else is written in its place", async () => {
    __setCatalogForTest(catalogFromGraph([{ "@id": `${M}/t/FriendOf`, "a:label": "friend-of", "a:linkPlane": "user", "a:typeAttribute": "t:FriendOf" }], "user"));
    await expect(writeKindRelation({ vault: VAULT, subject: CONTACT, curie: "t:AssociatedWith", holder: HOLDER, id: "d1" })).rejects.toThrow(/not a live user-plane join/);
    expect(puts).toHaveLength(0);
  });
  it("the same tie written twice under its id is the SAME relation (same address): an upsert", async () => {
    await writeKindRelation({ vault: VAULT, subject: CONTACT, curie: "t:FriendOf", holder: HOLDER, id: "f1" });
    await writeKindRelation({ vault: VAULT, subject: CONTACT, curie: "t:FriendOf", holder: HOLDER, id: "f1" });
    expect(puts[1]!.url).toBe(puts[0]!.url);
    expect(puts[1]!.body).toEqual(puts[0]!.body);
  });
  it("refused before any request: no vault entity, no predicate, no holder, no subject, no vault, no id", async () => {
    const id = "x1";
    await expect(writeKindRelation({ vault: { ...VAULT, entity: null }, subject: CONTACT, curie: "t:FriendOf", holder: HOLDER, id })).rejects.toThrow(/no entity/);
    await expect(writeKindRelation({ vault: VAULT, subject: CONTACT, curie: "", holder: HOLDER, id })).rejects.toThrow(/stands for no relation/);
    await expect(writeKindRelation({ vault: VAULT, subject: CONTACT, curie: "t:FriendOf", holder: "", id })).rejects.toThrow(KindRelationError);
    await expect(writeKindRelation({ vault: VAULT, subject: "", curie: "t:FriendOf", holder: HOLDER, id })).rejects.toThrow(KindRelationError);
    await expect(writeKindRelation({ vault: { ...VAULT, vaultId: "" }, subject: CONTACT, curie: "t:FriendOf", holder: HOLDER, id })).rejects.toThrow(KindRelationError);
    await expect(writeKindRelation({ vault: VAULT, subject: CONTACT, curie: "t:FriendOf", holder: HOLDER, id: "" })).rejects.toThrow(/no id/);
    expect(puts).toHaveLength(0);
    expect(others).toEqual([]);
  });
  it("ending ENDS (POST …/end) and never deletes", async () => {
    await endKindRelations(VNS, [`${VNS}/r/abc123`]);
    expect(others).toHaveLength(1);
    expect(others[0]).toMatchObject({ method: "POST" });
    expect(others[0]!.url).toMatch(/\/base\/r\/abc123\/end$/);
    expect(others.some((o) => o.method === "DELETE")).toBe(false);
  });
  it("an ending the vault cannot confirm is not reported as done when the relation is still read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 404, ok: false, text: async (): Promise<string> => "", json: async (): Promise<unknown> => ({}), headers: { get: (): string | null => null } })));
    docs.read.mockResolvedValue({ sourceUri: CONTACT, targetUri: VENT });
    await expect(endKindRelations(VNS, [`${VNS}/r/abc123`])).rejects.toThrow(/still holds it/);
  });
});

/** An in-memory vault for the tie doors (`writeTie`'s deps): live and ended relations, the reverse lookup, the read-back and the ending. */
function tieStore() {
  type R = { id: string; uri: string; type: string; source: string; target: string; holder: string; ended: boolean };
  const rels = new Map<string, R>();
  const log: string[] = [];
  let tick = 0;
  // A few turns of the microtask queue, 1 to 3, so concurrent callers interleave without any wait on the clock.
  const pause = async (): Promise<void> => {
    for (let i = 0; i <= ++tick % 3; i++) await Promise.resolve();
  };
  const deps = {
    readRows: vi.fn(async (_id: string, at: string | null): Promise<RecordRelation[]> => {
      await pause();
      return [...rels.values()]
        .filter((r) => !r.ended && (r.source === at || r.target === at))
        .map((r) => ({ relation: r.uri, role: "role:source", type: r.type, members: [{ member: r.source, role: "role:source" }, { member: r.target, role: "role:target" }] }));
    }),
    readDoc: vi.fn(async (uri: string) => {
      const r = rels.get(uri);
      if (!r) return null;
      const extras = { "a:claimSubject": { "@id": r.holder }, "a:visibilityTier": "private" };
      return r.ended ? { id: r.id, uri, typeCurie: r.type, sourceUri: null, targetUri: null, extras } : { id: r.id, uri, typeCurie: r.type, sourceUri: r.source, targetUri: r.target, extras };
    }),
    write: vi.fn(async (a: { subject: string; curie: string; holder: string; id: string; vault: KindVault }) => {
      await pause();
      const uri = `${VNS}/r/${a.id}`;
      const was = rels.get(uri);
      if (was?.ended && store.refuseEnded) throw new Error("relation write failed: 409 ended");
      rels.set(uri, { id: a.id, uri, type: a.curie, source: a.subject, target: a.vault.entity!, holder: a.holder, ended: false });
      log.push(`write ${a.id} ${a.curie}`);
      return { id: a.id, uri };
    }),
    readBack: vi.fn(async (uri: string) => {
      const r = rels.get(uri);
      return r && !r.ended && !store.dropReadBack ? { curie: r.type, source: r.source, target: r.target } : null;
    }),
    end: vi.fn(async (_v: string, uris: readonly string[]) => {
      for (const u of uris) {
        if (store.endFails) throw new Error("Not ended: the vault refused (403).");
        const r = rels.get(u);
        if (r) r.ended = true;
        log.push(`end ${u.split("/").pop()}`);
      }
    }),
    newId: vi.fn(() => mintRelationId()),
  };
  const store = {
    rels,
    log,
    deps,
    refuseEnded: false,
    dropReadBack: false,
    endFails: false,
    put(curie: string, id = mintRelationId(), holder = HOLDER, ended = false) {
      const uri = `${VNS}/r/${id}`;
      rels.set(uri, { id, uri, type: curie, source: CONTACT, target: VENT, holder, ended });
      return uri;
    },
    live: () => [...rels.values()].filter((r) => !r.ended),
  };
  return store;
}
/** A lock that makes callers of one name take turns (what Web Locks gives two tabs of one browser). */
function fifoLock() {
  const chains = new Map<string, Promise<unknown>>();
  return <T,>(name: string, act: () => Promise<T>): Promise<T> => {
    const next = (chains.get(name) ?? Promise.resolve()).then(act, act);
    chains.set(name, next.catch(() => undefined));
    return next;
  };
}
const noLock = <T,>(_n: string, act: () => Promise<T>): Promise<T> => act();

describe("writeTie (r3): look up the holder's own tie first and reuse its id; a new random id only when there is none", () => {
  const tie = (curie: string) => ({ vault: VAULT, subject: CONTACT, curie, holder: HOLDER });
  it("no tie yet: ONE write under a NEW random id, read back live", async () => {
    const st = tieStore();
    const res = await writeTie(tie("t:AssociatedWith"), { ...st.deps, lock: noLock });
    expect(res).toMatchObject({ live: true, reused: null });
    expect(res.id).toMatch(/^[0-9a-f]{26}$/);
    expect(st.deps.write).toHaveBeenCalledTimes(1);
    expect(st.deps.newId).toHaveBeenCalledTimes(1);
    expect(await isLegacyKindRelationId(res.id, { holder: HOLDER, source: CONTACT, curie: "t:AssociatedWith", target: VENT })).toBe(false);
  });
  it("the holder's LIVE tie of that kind: nothing is written, its id is kept", async () => {
    const st = tieStore();
    const uri = st.put("t:FriendOf", "friend0000000000000000000a");
    const res = await writeTie(tie("t:FriendOf"), { ...st.deps, lock: noLock });
    expect(res).toMatchObject({ uri, live: true, reused: "live" });
    expect(st.deps.write).not.toHaveBeenCalled();
    expect(st.deps.newId).not.toHaveBeenCalled();
  });
  it("a live tie of that kind held by SOMEONE ELSE is not the holder's: a new id is written", async () => {
    const st = tieStore();
    st.put("t:FriendOf", "other00000000000000000000a", "https://id.platform.example.test/base/p/ben");
    const res = await writeTie(tie("t:FriendOf"), { ...st.deps, lock: noLock });
    expect(res.reused).toBeNull();
    expect(st.deps.write).toHaveBeenCalledTimes(1);
  });
  it("an ENDED tie this tab ended is written again under ITS id (revived), not a new one", async () => {
    const st = tieStore();
    const uri = st.put("t:AssociatedWith", "dflt0000000000000000000001");
    await endTies(VAULT, HOLDER, CONTACT, [{ relationUri: uri, curie: "t:AssociatedWith" }]).catch(() => undefined); // the real door is not stubbed here: remember only
    st.rels.get(uri)!.ended = true;
    const res = await writeTie(tie("t:AssociatedWith"), { ...st.deps, lock: noLock });
    expect(res).toMatchObject({ uri, reused: "ended", live: true });
    expect(st.deps.newId).toHaveBeenCalledTimes(1); // made as the fallback, never used
    expect(st.deps.write).toHaveBeenCalledTimes(1);
    expect(st.deps.write.mock.calls[0]![0].id).toBe("dflt0000000000000000000001");
  });
  it("an ended id the platform REFUSES (409) falls back to a new random id", async () => {
    const st = tieStore();
    const uri = st.put("t:AssociatedWith", "dflt0000000000000000000001");
    await endTies(VAULT, HOLDER, CONTACT, [{ relationUri: uri, curie: "t:AssociatedWith" }]).catch(() => undefined);
    st.rels.get(uri)!.ended = true;
    st.refuseEnded = true;
    const res = await writeTie(tie("t:AssociatedWith"), { ...st.deps, lock: noLock });
    expect(res.reused).toBeNull();
    expect(res.uri).not.toBe(uri);
    expect(st.live()).toHaveLength(1);
  });
  it("an OLD guessable id is found while live and ended like any other, but never revived: picking it again makes a new random id", async () => {
    const st = tieStore();
    const oldId = await legacyKindRelationId({ holder: HOLDER, source: CONTACT, curie: "t:FriendOf", target: VENT });
    const oldUri = st.put("t:FriendOf", oldId);
    expect((await ownLiveTies(tie("t:FriendOf"), st.deps)).map((t) => t.uri)).toEqual([oldUri]);
    expect((await writeTie(tie("t:FriendOf"), { ...st.deps, lock: noLock })).reused).toBe("live");
    await endTies(VAULT, HOLDER, CONTACT, [{ relationUri: oldUri, curie: "t:FriendOf" }]).catch(() => undefined);
    st.rels.get(oldUri)!.ended = true;
    const res = await writeTie(tie("t:FriendOf"), { ...st.deps, lock: noLock });
    expect(res.reused).toBeNull();
    expect(res.id).not.toBe(oldId);
    expect(await isLegacyKindRelationId(res.id, { holder: HOLDER, source: CONTACT, curie: "t:FriendOf", target: VENT })).toBe(false);
  });
  it("a write the store does not keep (read-back not live) says so", async () => {
    const st = tieStore();
    st.dropReadBack = true;
    await expect(writeTie(tie("t:FriendOf"), { ...st.deps, lock: noLock })).rejects.toThrow(/did not keep/);
  });
  it("any other refusal (403, the predicate itself, a guard) is said as it is and not retried", async () => {
    const st = tieStore();
    const refused = vi.fn(async () => {
      throw new Error("relation write failed: 409 conflict");
    });
    await expect(writeTie(tie("t:FriendOf"), { ...st.deps, write: refused as never, lock: noLock })).rejects.toThrow(/409/);
    expect(refused).toHaveBeenCalledTimes(1); // a 409 on a NEW id is not a revive refusal
    const guard = vi.fn(async () => {
      throw new KindRelationError("no entity");
    });
    await expect(writeTie(tie("t:FriendOf"), { ...st.deps, write: guard as never, lock: noLock })).rejects.toThrow(KindRelationError);
    expect(guard).toHaveBeenCalledTimes(1);
  });
  it("a specific kind ENDS the holder's live default AFTER it is written (replace, never both)", async () => {
    const st = tieStore();
    const d = st.put("t:AssociatedWith");
    const res = await writeTie(tie("t:FriendOf"), { ...st.deps, lock: noLock });
    expect(st.live().map((r) => r.type)).toEqual(["t:FriendOf"]);
    expect(st.rels.get(d)!.ended).toBe(true);
    expect(res.ended.map((t) => t.uri)).toEqual([d]);
    expect(st.log.findIndex((l) => l.startsWith("write"))).toBeLessThan(st.log.findIndex((l) => l.startsWith("end")));
  });
  it("a default written while a specific kind is live is ended again at once and reported not live", async () => {
    const st = tieStore();
    st.put("t:FriendOf");
    const res = await writeTie(tie("t:AssociatedWith"), { ...st.deps, lock: noLock });
    expect(res.live).toBe(false);
    expect(st.live().map((r) => r.type)).toEqual(["t:FriendOf"]);
  });
  it("an ending the heal cannot do is returned (notEnded + the reason), never thrown: the kind is kept", async () => {
    const st = tieStore();
    const d = st.put("t:AssociatedWith");
    st.endFails = true;
    const res = await writeTie(tie("t:FriendOf"), { ...st.deps, lock: noLock });
    expect(res.live).toBe(true);
    expect(res.notEnded.map((t) => t.uri)).toEqual([d]);
    expect(res.endError).toMatch(/403/);
  });
});

describe("writeTie (r3): edge cases of the lookup", () => {
  const tie = { vault: VAULT, subject: CONTACT, curie: "t:FriendOf", holder: HOLDER };
  it("a relation the other way round (vault entity -> contact) is not the holder's tie: a tie is written from the contact", async () => {
    const st = tieStore();
    const uri = `${VNS}/r/reversed00000000000000000a`;
    st.rels.set(uri, { id: "reversed00000000000000000a", uri, type: "t:FriendOf", source: VENT, target: CONTACT, holder: HOLDER, ended: false });
    st.deps.readRows.mockImplementation(async () => [{ relation: uri, role: "role:target", type: "t:FriendOf", members: [{ member: VENT, role: "role:source" }, { member: CONTACT, role: "role:target" }] }]);
    expect(await ownLiveTies(tie, st.deps)).toEqual([]);
  });
  it("a reverse lookup that lags behind the write still counts the tie just written: it is live", async () => {
    const st = tieStore();
    st.deps.readRows.mockImplementation(async () => []);
    const res = await writeTie(tie, { ...st.deps, lock: noLock });
    expect(res.live).toBe(true);
    expect(res.reused).toBeNull();
  });
  it("the remembered ended ids are memory only: after a reset (a reload) an ended tie is not found, and a new id is made", async () => {
    const st = tieStore();
    const uri = st.put("t:FriendOf", "friend1000000000000000000a");
    await endTies(VAULT, HOLDER, CONTACT, [{ relationUri: uri, curie: "t:FriendOf" }]).catch(() => undefined);
    st.rels.get(uri)!.ended = true;
    __resetKindRelationVocab();
    const res = await writeTie(tie, { ...st.deps, lock: noLock });
    expect(res.reused).toBeNull();
    expect(res.uri).not.toBe(uri);
  });
});

describe("CONCURRENCY (r3): two tabs or two devices write the same kind at the same moment", () => {
  const tie = { vault: VAULT, subject: CONTACT, curie: "t:FriendOf", holder: HOLDER };
  it("two tabs of one browser take turns under the lock: ONE write, the second finds it live and writes nothing", async () => {
    const st = tieStore();
    const lock = fifoLock();
    const [a, b] = await Promise.all([writeTie(tie, { ...st.deps, lock }), writeTie(tie, { ...st.deps, lock })]);
    expect(st.deps.write).toHaveBeenCalledTimes(1);
    expect(a.uri).toBe(b.uri);
    expect(b.reused).toBe("live");
    expect(st.live()).toHaveLength(1);
  });
  it("two devices (no shared lock) both write: the heal leaves ONE live tie, the lowest id (the later writer sees both and ends the other)", async () => {
    let raced = 0;
    for (let run = 0; run < 25; run++) {
      const st = tieStore();
      const [a, b] = await Promise.all([
        writeTie(tie, { ...st.deps, lock: noLock, pending: new Map() }),
        writeTie(tie, { ...st.deps, lock: noLock, pending: new Map() }),
      ]);
      const live = st.live();
      expect(live).toHaveLength(1);
      const all = [...st.rels.values()].map((r) => r.id).sort();
      if (all.length === 2) {
        raced++;
        expect(live[0]!.id).toBe(all[0]);
      }
      expect([a.uri, b.uri]).toContain(live[0]!.uri);
    }
    expect(raced).toBeGreaterThan(0); // the race really happened (both wrote) and was healed
  });
  it("two concurrent writes in this tab share the unconfirmed id: ONE live tie, never a second", async () => {
    // Two devices do not share this map (each has its own memory). Two calls in one realm do: that is one tab.
    // A pair of distinct ids is still healed by `healTies` (the test below). Here both writes must be the same id.
    for (let run = 0; run < 25; run++) {
      __resetKindRelationVocab();
      const st = tieStore();
      const [a, b] = await Promise.all([writeTie(tie, { ...st.deps, lock: noLock }), writeTie(tie, { ...st.deps, lock: noLock })]);
      expect(st.live()).toHaveLength(1);
      expect(new Set([...st.rels.values()].map((r) => r.id)).size).toBe(1);
      expect(a.id).toBe(b.id);
      expect(a.uri).toBe(st.live()[0]!.uri);
    }
  });
  it("three at once: still one live tie", async () => {
    const st = tieStore();
    await Promise.all([1, 2, 3].map(() => writeTie(tie, { ...st.deps, lock: noLock })));
    expect(st.live()).toHaveLength(1);
  });
  it("healTies keeps the lowest id of one kind and ends the rest; it touches no other holder's tie", async () => {
    const st = tieStore();
    const hi = st.put("t:FriendOf", "f000000000000000000000000a"); // stored first: the order must come from the ids, not the list
    const lo = st.put("t:FriendOf", "0000000000000000000000000a");
    st.put("t:FriendOf", "5000000000000000000000000a", "https://id.platform.example.test/base/p/ben");
    const own = await ownLiveTies(tie, st.deps);
    expect(own.map((t) => t.uri)).toEqual([lo, hi]);
    const h = await healTies(tie, own, { end: st.deps.end });
    expect(h.kept!.uri).toBe(lo);
    expect(st.rels.get(hi)!.ended).toBe(true);
    expect(st.live()).toHaveLength(2); // the lowest one, and the other holder's
  });
});

describe("the browser lock", () => {
  it("is named by vault and contact", () => {
    expect(tieLockName(VNS, CONTACT)).toBe(`gilbapp:kind-tie:${VNS}:${CONTACT}`);
  });
  it("uses Web Locks (exclusive) when the browser has them, and runs the act as is when it does not", async () => {
    const request = vi.fn(async (_n: string, _o: unknown, cb: () => Promise<unknown>) => cb());
    vi.stubGlobal("navigator", { locks: { request } });
    await expect(withBrowserLock("n1", async () => 7)).resolves.toBe(7);
    expect(request).toHaveBeenCalledWith("n1", expect.objectContaining({ mode: "exclusive" }), expect.any(Function));
    vi.stubGlobal("navigator", {});
    await expect(withBrowserLock("n2", async () => 8)).resolves.toBe(8);
  });
});

describe("readBackIsTie", () => {
  it("readBackIsTie wants that predicate, from the contact, to the vault's entity", () => {
    const want = { curie: "t:FriendOf", subject: CONTACT, vaultEntity: VENT };
    expect(readBackIsTie({ curie: "https://ontology.example.test/base/t/FriendOf", source: CONTACT, target: VENT }, want)).toBe(true);
    expect(readBackIsTie({ curie: "t:CustomerOf", source: CONTACT, target: VENT }, want)).toBe(false);
    expect(readBackIsTie({ curie: "t:FriendOf", source: CONTACT, target: `${VNS}/e/other` }, want)).toBe(false);
    expect(readBackIsTie(null, want)).toBe(false);
  });
});

describe("the attribute spellings are asked of the master, not typed", () => {
  it("claimSubject and visibilityTier come from the term slots (a missing one refuses)", async () => {
    await expect(resolveKindRelationVocab()).resolves.toEqual({ claimSubject: "a:claimSubject", visibilityTier: "a:visibilityTier" });
    __resetKindRelationVocab();
    const saved = fakeAttributeNames["claimSubject"]!;
    delete fakeAttributeNames["claimSubject"];
    await expect(resolveKindRelationVocab()).rejects.toThrow(/claimSubject/);
    fakeAttributeNames["claimSubject"] = saved;
  });
});

describe("which kinds fit, which records are parties, and the default's words", () => {
  it("vaultMasterType turns any spelling into the master's type address; undeclared stays empty", () => {
    for (const r of ["t/Person", "t:Person", `${M}/t/Person`, `${M}/t/Person/`]) expect(vaultMasterType(r)).toBe(`${M}/t/Person`);
    expect(vaultMasterType(null)).toBe("");
    expect(vaultMasterType("   ")).toBe("");
  });
  const person = new Set([`${M}/t/Person`]);
  const org = new Set([`${M}/t/Organization`]);
  const entries = [
    entry("Friend", "t:FriendOf", { kindForVault: [`${M}/t/Person`] }),
    CUSTOMER,
    entry("Public authority", null, { playableBy: [`${M}/t/Organization`] }),
    entry("Competitor", null),
    entry("Dog walker", null, { own: true }),
    entry("Broken", "t:FriendOf", { kindPredicate: null }),
  ];
  const labels = (r: KindEntry[]) => r.map((e) => e.label);
  it("a person's vault offers Friend and Customer; an organization's Customer; an unknown vault no relation kind", () => {
    expect(labels(relationKindsOffered(entries, person, person))).toEqual(["Friend", "Customer", "Dog walker"]);
    expect(labels(relationKindsOffered(entries, person, org))).toEqual(["Customer", "Dog walker"]);
    expect(labels(relationKindsOffered(entries, person, null))).toEqual(["Dog walker"]);
  });
  it("an ORGANIZATION contact is offered Customer, not Friend", () => {
    expect(labels(relationKindsOffered(entries, org, person))).toEqual(["Customer"]);
  });
  it("Public authority, Competitor (no predicate, not the holder's) and an unreadable predicate are never offered", () => {
    const all = labels(relationKindsOffered(entries, new Set([...person, ...org]), new Set([...person, ...org])));
    expect(all).not.toContain("Public authority");
    expect(all).not.toContain("Competitor");
    expect(all).not.toContain("Broken");
  });
  it("a party is a type some kind with a predicate is playable by (person, organization); a note is not; a holder's own kind does not make one", () => {
    expect(isPartyType(entries, person)).toBe(true);
    expect(isPartyType(entries, org)).toBe(true);
    expect(isPartyType(entries, new Set([`${M}/t/NoteDocument`]))).toBe(false);
    expect(isPartyType([entry("Dog walker", null, { own: true, playableBy: [`${M}/t/NoteDocument`] })], new Set([`${M}/t/NoteDocument`]))).toBe(false);
  });
  it("the default's words are the TERM's own label from the user-plane catalogue; none when the catalogue does not list it", () => {
    expect(DEFAULT).toMatchObject({ id: defaultTieEntryId(), label: "associated-with", kindPredicate: { curie: "t:AssociatedWith" }, defaultTie: true, axis: "relationshipKind" });
    expect(defaultTieEntry(catalogFromGraph([], "user"))).toBeNull();
    expect(defaultTieEntry(null)).toBeNull();
    expect(isDefaultTie("https://ontology.example.test/base/t/AssociatedWith")).toBe(true);
    expect(isDefaultTie("t:ConnectedTo")).toBe(false);
  });
});

describe("reading ties back: the relations that touch this vault's entity", () => {
  const catalogue = [FRIEND, CUSTOMER, entry("Advisor", "t:AdvisorOf"), entry("Competitor", null)];
  const opts = { defaultEntry: DEFAULT, catalog: CAT };
  const row = (relation: string, type: string | undefined, source: string, target: string) => ({
    relation,
    role: "role:source",
    ...(type ? { type } : {}),
    members: [
      { member: source, role: "role:source" },
      { member: target, role: "role:target" },
    ],
  });
  it("keeps a kind's predicate and the default, from THIS contact to THIS vault's entity, each mapped to its chip", async () => {
    const touching = await relationsTouchingVault([row(`${VNS}/r/1`, "t:FriendOf", CONTACT, VENT), row(`${VNS}/r/2`, "t:AssociatedWith", CONTACT, VENT)], VENT, VNS);
    expect(matchTies(touching, catalogue, CONTACT, VENT, opts).map((r) => [r.label, r.isDefault, r.entryId])).toEqual([
      ["Friend", false, FRIEND.id],
      ["associated-with", true, defaultTieEntryId()],
    ]);
  });
  it("ignores another vault's entity, a predicate that is no kind (part-of, connected-to), and another contact", async () => {
    const touching = await relationsTouchingVault(
      [row(`${VNS}/r/1`, "t:FriendOf", CONTACT, "https://acme.platform.example.test/base/e/v"), row(`${VNS}/r/2`, "t:PartOf", CONTACT, VENT), row(`${VNS}/r/3`, "t:ConnectedTo", CONTACT, VENT), row(`${VNS}/r/4`, "t:FriendOf", `${VNS}/e/ben2`, VENT)],
      VENT,
      VNS,
    );
    expect(matchTies(touching, catalogue, CONTACT, VENT, opts)).toEqual([]);
  });
  it("a SYMMETRIC predicate (and the default) written from the vault's side is the same tie; a DIRECTED one reversed is not", () => {
    const rev = (type: string, uri: string) => ({ uri, type, source: VENT, target: CONTACT });
    expect(matchTies([rev("t:FriendOf", `${VNS}/r/1`)], catalogue, CONTACT, VENT, opts).map((r) => r.label)).toEqual(["Friend"]);
    expect(matchTies([rev("t:AssociatedWith", `${VNS}/r/3`)], catalogue, CONTACT, VENT, opts).map((r) => r.isDefault)).toEqual([true]);
    expect(matchTies([rev("t:CustomerOf", `${VNS}/r/2`)], catalogue, CONTACT, VENT, opts)).toEqual([]);
  });
  it("two spellings of the same entity address compare equal", () => {
    expect(sameEntity(VENT, VENT.replace("ann", "Ann") + "/")).toBe(true);
    expect(canonicalEntity("https://A.platform.example.test/base/e/x/")).toBe("https://a.platform.example.test/base/e/x");
    expect(sameEntity(null, VENT)).toBe(false);
  });
  it("a row that does not say its members is dereferenced, never assumed to be about the vault", async () => {
    const read = vi.fn(async (uri: string) => ({ id: "x", uri, typeCurie: "t:FriendOf", sourceUri: CONTACT, targetUri: VENT, extras: {} }));
    const touching = await relationsTouchingVault([{ relation: `${VNS}/r/9`, role: "role:source" }], VENT, VNS, { readDoc: read as never });
    expect(read).toHaveBeenCalledTimes(1);
    expect(matchTies(touching, catalogue, CONTACT, VENT, opts).map((r) => r.label)).toEqual(["Friend"]);
    expect(await relationsTouchingVault([{ relation: `${VNS}/r/9`, role: "role:source" }], VENT, VNS, { readDoc: (async () => null) as never })).toEqual([]);
  });
});

describe("r4: a tie write the vault refuses while the other side wrote the same tie", () => {
  const tie = { vault: VAULT, subject: CONTACT, curie: "t:FriendOf", holder: HOLDER };
  const cas500 = () => new Error('relation write failed: 500 {"error":"InternalServerError"}');
  it("refused (500) but a live tie of this kind is there: that tie is kept, no error", async () => {
    const st = tieStore();
    const write = st.deps.write;
    st.deps.write = vi.fn(async (a: Parameters<typeof write>[0]) => {
      st.put("t:FriendOf", a.id); // the other device's write of the same id landed first
      throw cas500();
    }) as unknown as typeof write;
    const res = await writeTie(tie, { ...st.deps, lock: noLock });
    expect(res).toMatchObject({ live: true, reused: "live" });
    expect(st.live().map((r) => r.uri)).toEqual([res.uri]);
  });
  it("refused (500) and no live tie of this kind: the refusal is said", async () => {
    const st = tieStore();
    st.put("t:ColleagueOf");
    st.deps.write = vi.fn(async () => {
      throw cas500();
    }) as unknown as typeof st.deps.write;
    await expect(writeTie(tie, { ...st.deps, lock: noLock })).rejects.toThrow("500");
  });
  it("a sign-in failure is said as it is, with no second look", async () => {
    const st = tieStore();
    st.put("t:FriendOf");
    const before = await ownLiveTies(tie, st.deps);
    expect(before).toHaveLength(1);
    st.rels.clear();
    st.deps.write = vi.fn(async () => {
      throw new NotSignedInError();
    }) as unknown as typeof st.deps.write;
    st.deps.readRows.mockClear();
    await expect(writeTie(tie, { ...st.deps, lock: noLock })).rejects.toBeInstanceOf(NotSignedInError);
    expect(st.deps.readRows).toHaveBeenCalledTimes(1); // the lookup before the write only
  });
  it("two devices revive the SAME remembered id at once (the floor on both): one write is refused, both end with the one live tie", async () => {
    const st = tieStore();
    const dflt = st.put("t:AssociatedWith", "0000000000000000000000000d", HOLDER, true);
    const write = st.deps.write;
    const inFlight = new Set<string>();
    st.deps.write = vi.fn(async (a: Parameters<typeof write>[0]) => {
      if (inFlight.has(a.id)) {
        await new Promise((r) => setTimeout(r, 3));
        throw cas500();
      }
      inFlight.add(a.id);
      try {
        return await write(a);
      } finally {
        inFlight.delete(a.id);
      }
    }) as unknown as typeof write;
    // Both devices remember the ended default's id.
    await endTies(VAULT, HOLDER, CONTACT, [{ relationUri: dflt, curie: "t:AssociatedWith" }], { lock: noLock }).catch(() => undefined);
    st.rels.get(dflt)!.ended = true;
    const d = { vault: VAULT, subject: CONTACT, curie: "t:AssociatedWith", holder: HOLDER };
    const [a, b] = await Promise.all([writeTie(d, { ...st.deps, lock: noLock }), writeTie(d, { ...st.deps, lock: noLock })]);
    expect(a.uri).toBe(dflt);
    expect(b.uri).toBe(dflt);
    expect(st.live().map((r) => r.uri)).toEqual([dflt]);
  });
});
