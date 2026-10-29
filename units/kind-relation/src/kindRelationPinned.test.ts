// Pins of the exports the ported tests leave open, and of the module state: the write bound, the cached vocabulary, the remembered ended ids
// and the unconfirmed ids. Fake time only; nothing waits on the clock.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spell = vi.hoisted(() => ({ attributeSpelling: vi.fn(async (n: string): Promise<string | null> => n) }));
vi.mock("@kaigilb/gilbplatformcode-term-slots", async (orig) => ({
  ...((await orig()) as typeof import("@kaigilb/gilbplatformcode-term-slots")),
  attributeSpelling: spell.attributeSpelling,
}));
const docs = vi.hoisted(() => ({ read: vi.fn(), end: null as null | ((...a: unknown[]) => Promise<unknown>) }));
vi.mock("@kaigilb/gilbplatformcode-lws-relations", async (orig) => {
  const actual = await orig<typeof import("@kaigilb/gilbplatformcode-lws-relations")>();
  return { ...actual, readRelationDoc: docs.read, endRelation: (...a: Parameters<typeof actual.endRelation>) => (docs.end ? docs.end(...a) : actual.endRelation(...a)) };
});

import { BoundTimeoutError } from "@kaigilb/gilbplatformcode-lws-relations";
import type { RelationDoc } from "@kaigilb/gilbplatformcode-lws-relations";
import type { RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";
import { setTermOrigin, resetTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import type { KindEntry } from "@kaigilb/gilbplatformcode-contact-kind-model";
import { setUp, tearDown } from "../test/support";
import {
  __resetEndedTies,
  __resetKindRelationVocab,
  __setKindWriteBoundForTest,
  defaultTieEntry,
  defaultTieEntryId,
  endKindRelations,
  endTies,
  healTies,
  isDefaultTie,
  isLegacyKindRelationId,
  legacyKindRelationId,
  MAX_TIE_GENERATIONS,
  isPartyType,
  KIND_RELATION_TIER,
  KindRelationError,
  KindRelationVocabUnavailableError,
  kindVaultOf,
  kindWriteBoundMs,
  matchTies,
  ownLiveTies,
  readBackIsTie,
  readKindRelationBack,
  relationIdOf,
  relationsTouchingVault,
  resolveKindRelationVocab,
  samePredicate,
  tieHolderOf,
  tieLockName,
  withBrowserLock,
  writeTie,
  type KindVault,
  type OwnTie,
} from "./kindRelation";

const ONT = "https://ontology.example.test";
const M = `${ONT}/base`;
const VNS = "https://ann.platform.example.test/base";
const VENT = `${VNS}/e/vault-entity-ann`;
const CONTACT = `${VNS}/e/ben`;
const HOLDER = "https://id.platform.example.test/base/p/ann";
const VAULT: KindVault = { vaultId: VNS, entity: VENT, represents: `${M}/t/Person` };
const CURIE = "t:FriendOf";
const VOCAB = { claimSubject: "a:claimSubject", visibilityTier: "a:visibilityTier" };
const doc = (over: Partial<RelationDoc> = {}): RelationDoc => ({ id: "x", uri: `${VNS}/r/x`, typeCurie: CURIE, sourceUri: CONTACT, targetUri: VENT, extras: {}, ...over });
const rel = (id: string, type: string | null = CURIE, source = CONTACT, target = VENT): RecordRelation => ({
  relation: `${VNS}/r/${id}`,
  role: "role:source",
  ...(type ? { type } : {}),
  members: [
    { member: source, role: "role:source" },
    { member: target, role: "role:target" },
  ],
});
const noLock = <T,>(_n: string, act: () => Promise<T>): Promise<T> => act();

beforeEach(() => {
  setUp();
  setTermOrigin(ONT);
  spell.attributeSpelling.mockReset();
  spell.attributeSpelling.mockImplementation(async (n: string) => n);
  docs.read.mockReset();
  __resetKindRelationVocab();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  __setKindWriteBoundForTest(null);
  __resetKindRelationVocab();
  docs.end = null;
  tearDown();
});

describe("the write bound (module state: kindWriteBoundOverride)", () => {
  it("is 12 000 ms until a test sets it, and null restores it", () => {
    expect(kindWriteBoundMs()).toBe(12_000);
    __setKindWriteBoundForTest(40);
    expect(kindWriteBoundMs()).toBe(40);
    __setKindWriteBoundForTest(0);
    expect(kindWriteBoundMs()).toBe(0);
    __setKindWriteBoundForTest(null);
    expect(kindWriteBoundMs()).toBe(12_000);
  });
});

describe("small exports", () => {
  it("the tier of a kind relation is private", () => {
    expect(KIND_RELATION_TIER).toBe("private");
  });
  it("kindVaultOf copies the three fields, turns a missing one into null, and null into null", () => {
    expect(kindVaultOf(null)).toBeNull();
    expect(kindVaultOf(undefined)).toBeNull();
    expect(kindVaultOf({ vaultId: VNS, entity: VENT, represents: "t:Person" })).toEqual({ vaultId: VNS, entity: VENT, represents: "t:Person" });
    expect(kindVaultOf({ vaultId: VNS } as never)).toEqual({ vaultId: VNS, entity: null, represents: null });
  });
  it("samePredicate compares the last segment after / or :, and is false for an empty or missing side", () => {
    expect(samePredicate("t:FriendOf", `${M}/t/FriendOf`)).toBe(true);
    expect(samePredicate("t:FriendOf", "t:FamilyOf")).toBe(false);
    expect(samePredicate("t:FriendOf", null)).toBe(false);
    expect(samePredicate(undefined, "t:FriendOf")).toBe(false);
    expect(samePredicate("", "")).toBe(false);
  });
  it("isDefaultTie is true for the associated-with predicate in either spelling, and false for no predicate", () => {
    expect(isDefaultTie("t:AssociatedWith")).toBe(true);
    expect(isDefaultTie(`${M}/t/AssociatedWith`)).toBe(true);
    expect(isDefaultTie(null)).toBe(false);
    expect(isDefaultTie(undefined)).toBe(false);
  });
  it("relationIdOf is the tail of the address", () => {
    expect(relationIdOf(`${VNS}/r/abc123`)).toBe("abc123");
    expect(relationIdOf("abc123")).toBe("abc123");
  });
  it("defaultTieEntryId is the term's address on the ontology origin as set when it is called, and throws when none is set", () => {
    expect(defaultTieEntryId()).toBe(`${M}/t/AssociatedWith`);
    setTermOrigin("https://other-ontology.example.test");
    expect(defaultTieEntryId()).toBe("https://other-ontology.example.test/base/t/AssociatedWith");
    resetTermOrigin();
    expect(() => defaultTieEntryId()).toThrow();
  });
});

describe("the cached vocabulary (module state: cachedVocab)", () => {
  it("asks the two attribute spellings once and answers the same promise to every caller", async () => {
    const [a, b] = await Promise.all([resolveKindRelationVocab(), resolveKindRelationVocab()]);
    expect(a).toEqual(VOCAB);
    expect(b).toBe(a);
    await resolveKindRelationVocab();
    expect(spell.attributeSpelling.mock.calls.map((c) => c[0])).toEqual(["claimSubject", "visibilityTier"]);
  });
  it("prefixes the spelling the ontology gave with a:", async () => {
    spell.attributeSpelling.mockImplementation(async (n: string) => (n === "claimSubject" ? "claimSubjectX" : "visibilityTierY"));
    await expect(resolveKindRelationVocab()).resolves.toEqual({ claimSubject: "a:claimSubjectX", visibilityTier: "a:visibilityTierY" });
  });
  it("names every missing term in the error, and does not keep a failure: the next call asks again", async () => {
    spell.attributeSpelling.mockImplementation(async () => null);
    const err = await resolveKindRelationVocab().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KindRelationVocabUnavailableError);
    expect((err as Error).name).toBe("KindRelationVocabUnavailableError");
    expect((err as Error).message).toBe("The ontology did not name a/claimSubject, a/visibilityTier, so a kind of contact cannot be kept as a relation right now.");
    spell.attributeSpelling.mockImplementation(async (n: string) => n);
    await expect(resolveKindRelationVocab()).resolves.toEqual(VOCAB);
  });
  it("names only the missing one", async () => {
    spell.attributeSpelling.mockImplementation(async (n: string) => (n === "visibilityTier" ? null : n));
    await expect(resolveKindRelationVocab()).rejects.toThrow("did not name a/visibilityTier, so");
  });
  it("__resetKindRelationVocab drops the cache", async () => {
    await resolveKindRelationVocab();
    __resetKindRelationVocab();
    await resolveKindRelationVocab();
    expect(spell.attributeSpelling).toHaveBeenCalledTimes(4);
  });
});

describe("readKindRelationBack and tieHolderOf", () => {
  it("reads the document at the address in the vault, and gives its predicate and both ends", async () => {
    docs.read.mockResolvedValue(doc());
    await expect(readKindRelationBack(`${VNS}/r/x`, VNS)).resolves.toEqual({ curie: CURIE, source: CONTACT, target: VENT });
    expect(docs.read).toHaveBeenCalledWith(`${VNS}/r/x`, VNS);
  });
  it("is null when there is no document", async () => {
    docs.read.mockResolvedValue(null);
    await expect(readKindRelationBack(`${VNS}/r/x`, VNS)).resolves.toBeNull();
  });
  it("readBackIsTie also wants the source and the target to be the same entity, not only the predicate", () => {
    const want = { curie: CURIE, subject: CONTACT, vaultEntity: VENT };
    expect(readBackIsTie({ curie: CURIE, source: `${VNS}/e/other`, target: VENT }, want)).toBe(false);
    expect(readBackIsTie({ curie: CURIE, source: CONTACT, target: VENT }, want)).toBe(true);
  });
  it("tieHolderOf reads a:claimSubject under the bare or the prefixed key, expands base: against the document, and is null when none", () => {
    expect(tieHolderOf(null, VOCAB)).toBeNull();
    expect(tieHolderOf(doc({ extras: { claimSubject: { "@id": HOLDER } } }), VOCAB)).toBe(HOLDER);
    expect(tieHolderOf(doc({ extras: { "a:claimSubject": { "@id": HOLDER } } }), VOCAB)).toBe(HOLDER);
    expect(tieHolderOf(doc({ extras: { claimSubject: [{ "@id": HOLDER }] } }), VOCAB)).toBe(HOLDER);
    expect(tieHolderOf(doc({ uri: `${VNS}/r/x`, extras: { claimSubject: { "@id": "base:p/ann" } } }), VOCAB)).toBe(`${VNS}/p/ann`);
    expect(tieHolderOf(doc({ extras: { claimSubject: { "@id": "relative-only" } } }), VOCAB)).toBeNull();
    expect(tieHolderOf(doc({ extras: {} }), VOCAB)).toBeNull();
  });
});

describe("withBrowserLock", () => {
  const withLocks = (request: (n: string, o: { mode: string; signal?: AbortSignal }, cb: () => Promise<unknown>) => Promise<unknown>) => vi.stubGlobal("navigator", { locks: { request } });
  it("runs the act as is when the browser has no locks, or its request is not a function", async () => {
    vi.stubGlobal("navigator", {});
    await expect(withBrowserLock("n", async () => 1)).resolves.toBe(1);
    vi.stubGlobal("navigator", { locks: { request: "no" } });
    await expect(withBrowserLock("n", async () => 2)).resolves.toBe(2);
    vi.stubGlobal("navigator", undefined);
    await expect(withBrowserLock("n", async () => 3)).resolves.toBe(3);
  });
  it("asks for the lock exclusive with an abort signal, and answers what the act answers", async () => {
    const seen: { name: string; mode: string; signal: boolean }[] = [];
    withLocks(async (name, o, cb) => {
      seen.push({ name, mode: o.mode, signal: o.signal instanceof AbortSignal });
      return cb();
    });
    await expect(withBrowserLock("lock-a", async () => "done")).resolves.toBe("done");
    expect(seen).toEqual([{ name: "lock-a", mode: "exclusive", signal: true }]);
  });
  it("a lock that is not granted within the write bound rejects with the named error and aborts the request; the act never runs", async () => {
    vi.useFakeTimers();
    __setKindWriteBoundForTest(1000);
    let signal: AbortSignal | undefined;
    const act = vi.fn(async () => "never");
    withLocks((_n, o) => {
      signal = o.signal;
      return new Promise((_res, rej) => o.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
    });
    const run = withBrowserLock("n", act).then(() => "ok" as const, (e: unknown) => e);
    await vi.advanceTimersByTimeAsync(999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const err = await run;
    expect(err).toBeInstanceOf(KindRelationError);
    expect((err as Error).message).toBe("waiting for the browser lock timed out");
    expect(signal?.aborted).toBe(true);
    expect(act).not.toHaveBeenCalled();
  });
  it("once granted the act is not inside the timer: an act longer than the bound still completes", async () => {
    vi.useFakeTimers();
    __setKindWriteBoundForTest(1000);
    withLocks(async (_n, _o, cb) => cb());
    const run = withBrowserLock("n", () => new Promise<string>((res) => setTimeout(() => res("slow"), 5000)));
    await vi.advanceTimersByTimeAsync(5000);
    await expect(run).resolves.toBe("slow");
  });
  it("an act that throws rejects with that error, and a request that is refused (not aborted) rejects with its error", async () => {
    withLocks(async (_n, _o, cb) => cb());
    await expect(withBrowserLock("n", async () => { throw new Error("act failed"); })).rejects.toThrow("act failed");
    withLocks(async () => { throw new Error("request refused"); });
    await expect(withBrowserLock("n", async () => 1)).rejects.toThrow("request refused");
  });
});

describe("ownLiveTies", () => {
  const holderDoc = (id: string, holder = HOLDER, over: Partial<RelationDoc> = {}): RelationDoc =>
    doc({ id, uri: `${VNS}/r/${id}`, extras: { "a:claimSubject": { "@id": holder } }, ...over });
  it("is empty without asking for anything when the vault has no entity", async () => {
    const readRows = vi.fn();
    await expect(ownLiveTies({ vault: { ...VAULT, entity: null }, subject: CONTACT, holder: HOLDER }, { readRows })).resolves.toEqual([]);
    expect(readRows).not.toHaveBeenCalled();
  });
  it("asks the reverse lookup for the contact by its id tail and its address", async () => {
    const readRows = vi.fn(async () => []);
    await ownLiveTies({ vault: VAULT, subject: CONTACT, holder: HOLDER }, { readRows });
    expect(readRows).toHaveBeenCalledWith("ben", CONTACT);
  });
  it("keeps the holder's own ties of the contact and this vault's entity, sorted by id, and drops the others", async () => {
    const rows = [rel("b2"), rel("a1"), rel("c3", CURIE, CONTACT, `${VNS}/e/elsewhere`), rel("d4", CURIE, `${VNS}/e/ben2`, VENT), rel("e5")];
    const readDoc = vi.fn(async (uri: string) => (uri.endsWith("/e5") ? holderDoc("e5", "https://id.platform.example.test/base/p/ben") : holderDoc(uri.split("/").pop()!)));
    const own = await ownLiveTies({ vault: VAULT, subject: CONTACT, holder: HOLDER }, { readRows: async () => rows, readDoc: readDoc as never });
    expect(own.map((t) => t.id)).toEqual(["a1", "b2"]);
    expect(own[0]).toEqual({ uri: `${VNS}/r/a1`, id: "a1", curie: CURIE });
  });
  it("a document that cannot be read is not the holder's", async () => {
    const readDoc = vi.fn(async () => {
      throw new Error("network");
    });
    await expect(ownLiveTies({ vault: VAULT, subject: CONTACT, holder: HOLDER }, { readRows: async () => [rel("a1")], readDoc: readDoc as never })).resolves.toEqual([]);
  });
});

describe("relationsTouchingVault and matchTies", () => {
  it("a row whose members name the vault is kept with its ends, one that does not is dropped without a read", async () => {
    const read = vi.fn();
    const out = await relationsTouchingVault([rel("a1"), rel("b2", CURIE, CONTACT, `${VNS}/e/elsewhere`)], VENT, VNS, { readDoc: read });
    expect(out).toEqual([{ uri: `${VNS}/r/a1`, type: CURIE, source: CONTACT, target: VENT }]);
    expect(read).not.toHaveBeenCalled();
  });
  it("a row with members but no type is dereferenced", async () => {
    const read = vi.fn(async (uri: string) => doc({ uri, typeCurie: "t:CustomerOf" }));
    const out = await relationsTouchingVault([rel("a1", null)], VENT, VNS, { readDoc: read as never });
    expect(read).toHaveBeenCalledTimes(1);
    expect(out.map((r) => r.type)).toEqual(["t:CustomerOf"]);
  });
  it("dereferences at most 24 rows that do not say their members", async () => {
    const read = vi.fn(async (uri: string) => doc({ uri }));
    const rows = Array.from({ length: 30 }, (_, i) => ({ relation: `${VNS}/r/n${i}`, role: "role:source" }));
    const out = await relationsTouchingVault(rows, VENT, VNS, { readDoc: read as never });
    expect(read).toHaveBeenCalledTimes(24);
    expect(out).toHaveLength(24);
  });
  it("a dereferenced document that touches the vault by its target alone is kept; one that fails to read is left out", async () => {
    const read = vi.fn(async (uri: string) => {
      if (uri.endsWith("/bad")) throw new Error("x");
      return doc({ uri, sourceUri: `${VNS}/e/elsewhere`, targetUri: VENT });
    });
    const out = await relationsTouchingVault([{ relation: `${VNS}/r/ok`, role: "role:source" }, { relation: `${VNS}/r/bad`, role: "role:source" }], VENT, VNS, { readDoc: read as never });
    expect(out.map((r) => r.uri)).toEqual([`${VNS}/r/ok`]);
  });
  it("matchTies leaves out a row with no type and an entry whose predicate could not be read", () => {
    const friend: KindEntry = { id: "f", label: "Friend", order: 1, playableBy: [], axis: "relationshipKind", own: false, kindPredicate: null };
    const out = matchTies([{ uri: `${VNS}/r/1`, type: null, source: CONTACT, target: VENT }, { uri: `${VNS}/r/2`, type: CURIE, source: CONTACT, target: VENT }], [friend], CONTACT, VENT, { defaultEntry: null, catalog: null });
    expect(out).toEqual([]);
  });
  it("matchTies gives the default its own words and no order when there is no default entry, and the entry's order otherwise", () => {
    const friend: KindEntry = { id: "f", label: "Friend", order: 7, playableBy: [], axis: "relationshipKind", own: false, kindPredicate: { curie: CURIE } };
    const out = matchTies(
      [{ uri: `${VNS}/r/1`, type: "t:AssociatedWith", source: CONTACT, target: VENT }, { uri: `${VNS}/r/2`, type: CURIE, source: CONTACT, target: VENT }],
      [friend],
      CONTACT,
      VENT,
      { defaultEntry: null, catalog: null },
    );
    expect(out).toEqual([
      { relationUri: `${VNS}/r/1`, curie: "t:AssociatedWith", entryId: defaultTieEntryId(), label: "t:AssociatedWith", order: null, isDefault: true },
      { relationUri: `${VNS}/r/2`, curie: CURIE, entryId: "f", label: "Friend", order: 7, isDefault: false },
    ]);
  });
  it("defaultTieEntry falls back to the term's CURIE as its words when the term has no label of its own", () => {
    const cat = { terms: [{ curie: "t:AssociatedWith", label: "  ", labelled: true, symmetric: true }] } as never;
    expect(defaultTieEntry(cat)).toMatchObject({ label: "t:AssociatedWith", id: defaultTieEntryId() });
    const unlabelled = { terms: [{ curie: "t:AssociatedWith", label: "associated", labelled: false, symmetric: true }] } as never;
    expect(defaultTieEntry(unlabelled)).toMatchObject({ label: "t:AssociatedWith" });
    const named = { terms: [{ curie: "t:AssociatedWith", label: "  linked  ", labelled: true, symmetric: true }] } as never;
    expect(defaultTieEntry(named)).toMatchObject({ label: "linked" });
  });
  it("isPartyType is false for a kind whose predicate could not be read", () => {
    const e: KindEntry = { id: "f", label: "F", order: 1, playableBy: [`${M}/t/Person`], axis: "relationshipKind", own: false, kindPredicate: null };
    expect(isPartyType([e], new Set([`${M}/t/Person`]))).toBe(false);
  });
});

describe("healTies", () => {
  const own = (...pairs: [string, string][]): OwnTie[] => pairs.map(([id, curie]) => ({ uri: `${VNS}/r/${id}`, id, curie }));
  const args = { vault: VAULT, subject: CONTACT, curie: CURIE, holder: HOLDER };
  it("with one tie of the kind and no default it ends nothing and keeps that tie", async () => {
    const end = vi.fn(async () => undefined);
    const ties = own(["a1", CURIE]);
    const h = await healTies(args, ties, { end });
    expect(end).not.toHaveBeenCalled();
    expect(h).toEqual({ kept: ties[0], ended: [], notEnded: [], error: null });
  });
  it("a default alone beside no specific kind is kept: the floor", async () => {
    const end = vi.fn(async () => undefined);
    const h = await healTies({ ...args, curie: "t:AssociatedWith" }, own(["d1", "t:AssociatedWith"]), { end });
    expect(end).not.toHaveBeenCalled();
    expect(h.kept?.id).toBe("d1");
  });
  it("ends the extra ties of the kind and the default beside a specific kind, one at a time, in that order", async () => {
    const order: string[] = [];
    const end = vi.fn(async (_v: string, uris: readonly string[]) => {
      order.push(uris[0]!.split("/").pop()!);
    });
    const h = await healTies(args, own(["a1", CURIE], ["a2", CURIE], ["d1", "t:AssociatedWith"]), { end });
    expect(order).toEqual(["a2", "d1"]);
    expect(h.kept?.id).toBe("a1");
    expect(h.ended.map((t) => t.id)).toEqual(["a2", "d1"]);
    expect(end).toHaveBeenCalledWith(VNS, [`${VNS}/r/a2`]);
  });
  it("a default written while a specific kind is live is ended and kept is null", async () => {
    const end = vi.fn(async () => undefined);
    const h = await healTies({ ...args, curie: "t:AssociatedWith" }, own(["a1", CURIE], ["d1", "t:AssociatedWith"]), { end });
    expect(h.kept).toBeNull();
    expect(h.ended.map((t) => t.id)).toEqual(["d1"]);
  });
  it("an ending that fails is returned with its first reason; the others go on", async () => {
    const end = vi.fn(async (_v: string, uris: readonly string[]) => {
      if (uris[0]!.endsWith("/a2")) throw new Error("first reason");
      if (uris[0]!.endsWith("/a3")) throw new Error("second reason");
    });
    const h = await healTies(args, own(["a1", CURIE], ["a2", CURIE], ["a3", CURIE]), { end });
    expect(h.notEnded.map((t) => t.id)).toEqual(["a2", "a3"]);
    expect(h.error).toBe("first reason");
    expect(end).toHaveBeenCalledTimes(2);
  });
  it("a non-error rejection is reported as its text", async () => {
    const end = vi.fn(async () => {
      throw "plain text";
    });
    const h = await healTies(args, own(["a1", CURIE], ["a2", CURIE]), { end });
    expect(h.error).toBe("plain text");
  });
  it("a wait that never ends is thrown, not counted as not ended", async () => {
    const end = vi.fn(async () => {
      throw new BoundTimeoutError("ending the extra kind tie");
    });
    await expect(healTies(args, own(["a1", CURIE], ["a2", CURIE]), { end })).rejects.toBeInstanceOf(BoundTimeoutError);
  });
});

describe("the remembered ended ids and the unconfirmed ids (module state: endedTieIds, pendingTieIds)", () => {
  const tie = { vault: VAULT, subject: CONTACT, curie: CURIE, holder: HOLDER };
  /** A store of one vault: the live ties by id. */
  function store() {
    const live = new Map<string, { curie: string }>();
    const calls: string[] = [];
    const deps = {
      readRows: async (): Promise<RecordRelation[]> => [...live.entries()].map(([id, v]) => rel(id, v.curie)),
      readDoc: async (uri: string): Promise<RelationDoc | null> => {
        const id = uri.split("/").pop()!;
        return live.has(id) ? doc({ id, uri, typeCurie: live.get(id)!.curie, extras: { "a:claimSubject": { "@id": HOLDER } } }) : null;
      },
      write: vi.fn(async (a: { id: string; curie: string }) => {
        live.set(a.id, { curie: a.curie });
        calls.push(`write ${a.id}`);
        return { id: a.id, uri: `${VNS}/r/${a.id}` };
      }),
      readBack: async (uri: string) => {
        const id = uri.split("/").pop()!;
        return live.has(id) ? { curie: live.get(id)!.curie, source: CONTACT, target: VENT } : null;
      },
      end: vi.fn(async (_v: string, uris: readonly string[]) => {
        for (const u of uris) live.delete(u.split("/").pop()!);
        calls.push(`end ${uris.join()}`);
      }),
      newId: vi.fn(() => "nnnnnnnnnnnnnnnnnnnnnnnnnn"),
      lock: noLock,
    };
    return { live, calls, deps };
  }
  it("a tie ended with endTies is written again under its own id by the same writer; after __resetEndedTies it is not", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ relation: `${VNS}/r/old0000000000000000000000a`, changed: true }), text: async () => "", headers: { get: () => null } })));
    {
      const s = store();
      docs.read.mockResolvedValue(null);
      await endTies(VAULT, HOLDER, CONTACT, [{ relationUri: `${VNS}/r/old0000000000000000000000a`, curie: CURIE }], { lock: noLock });
      const revived = await writeTie(tie, s.deps);
      expect(revived).toMatchObject({ id: "old0000000000000000000000a", reused: "ended" });
      s.live.clear();
      await endTies(VAULT, HOLDER, CONTACT, [{ relationUri: `${VNS}/r/old0000000000000000000000a`, curie: CURIE }], { lock: noLock });
      __resetEndedTies();
      const fresh = await writeTie(tie, s.deps);
      expect(fresh).toMatchObject({ id: "nnnnnnnnnnnnnnnnnnnnnnnnnn", reused: null });
    }
  });
  it("the id of a write that failed stays unconfirmed in the module map: the next write of the same tie sends that id, and __resetEndedTies forgets it", async () => {
    const s = store();
    let fail = true;
    const write = s.deps.write;
    s.deps.write = vi.fn(async (a: { id: string; curie: string }) => {
      if (fail) throw new Error("relation write failed: 500");
      return write(a);
    }) as never;
    await expect(writeTie(tie, s.deps)).rejects.toThrow("500");
    fail = false;
    s.deps.newId.mockReturnValue("zzzzzzzzzzzzzzzzzzzzzzzzzz");
    const again = await writeTie(tie, s.deps);
    expect(again).toMatchObject({ id: "nnnnnnnnnnnnnnnnnnnnnnnnnn", reused: "pending" });
    // confirmed: the unconfirmed id is cleared
    s.live.clear();
    const third = await writeTie(tie, s.deps);
    expect(third.id).toBe("zzzzzzzzzzzzzzzzzzzzzzzzzz");
    // an unconfirmed id again, then the reset forgets it
    fail = true;
    s.live.clear();
    s.deps.newId.mockReturnValue("yyyyyyyyyyyyyyyyyyyyyyyyyy");
    await expect(writeTie(tie, s.deps)).rejects.toThrow("500");
    __resetEndedTies();
    fail = false;
    s.deps.newId.mockReturnValue("xxxxxxxxxxxxxxxxxxxxxxxxxx");
    expect((await writeTie(tie, s.deps)).id).toBe("xxxxxxxxxxxxxxxxxxxxxxxxxx");
  });
  it("a writer with its own pending map does not see the module's", async () => {
    const s = store();
    s.deps.write = vi.fn(async () => {
      throw new Error("relation write failed: 500");
    }) as never;
    await expect(writeTie(tie, { ...s.deps, pending: new Map() })).rejects.toThrow("500");
    s.deps.write = vi.fn(async (a: { id: string; curie: string }) => {
      s.live.set(a.id, { curie: a.curie });
      return { id: a.id, uri: `${VNS}/r/${a.id}` };
    }) as never;
    const other = await writeTie(tie, s.deps);
    expect(other.reused).toBeNull();
  });
  it("a vault with no entity is refused before anything is read", async () => {
    const s = store();
    const readRows = vi.fn(s.deps.readRows);
    await expect(writeTie({ ...tie, vault: { ...VAULT, entity: null } }, { ...s.deps, readRows })).rejects.toThrow("This vault has no entity");
    expect(readRows).not.toHaveBeenCalled();
  });
  it("the lock is taken once, by vault and contact", async () => {
    const s = store();
    const lock = vi.fn(noLock);
    await writeTie(tie, { ...s.deps, lock: lock as never });
    expect(lock).toHaveBeenCalledTimes(1);
    expect(lock.mock.calls[0]![0]).toBe(tieLockName(VNS, CONTACT));
  });
  it("a legacy id is recognised only as 26 hex", async () => {
    await expect(isLegacyKindRelationId("ABCDEF0123456789ABCDEF0123", { holder: HOLDER, source: CONTACT, curie: CURIE, target: VENT })).resolves.toBe(false);
    await expect(isLegacyKindRelationId("0123456789abcdef0123456789", { holder: HOLDER, source: CONTACT, curie: CURIE, target: VENT })).resolves.toBe(false);
  });
});

describe("endKindRelations", () => {
  it("refuses with no vault named, before any request", async () => {
    await expect(endKindRelations("", [`${VNS}/r/a`])).rejects.toThrow("Refusing to remove a kind of contact with no vault named.");
  });
  it("an end the vault says changed nothing, whose tie reads back gone or ended, is done", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 404, ok: false, text: async () => "", json: async () => ({}), headers: { get: () => null } })));
    docs.read.mockResolvedValue(null);
    await expect(endKindRelations(VNS, [`${VNS}/r/abc`])).resolves.toBeUndefined();
    docs.read.mockResolvedValue(doc({ sourceUri: null, targetUri: null }));
    await expect(endKindRelations(VNS, [`${VNS}/r/abc`])).resolves.toBeUndefined();
    docs.read.mockRejectedValue(new Error("network"));
    await expect(endKindRelations(VNS, [`${VNS}/r/abc`])).resolves.toBeUndefined();
  });
  it("a wait that never ends while ending is thrown as it is, with no read-back", async () => {
    docs.end = async () => {
      throw new BoundTimeoutError("ending");
    };
    docs.read.mockResolvedValue(doc({ sourceUri: null, targetUri: null }));
    await expect(endKindRelations(VNS, [`${VNS}/r/a`])).rejects.toBeInstanceOf(BoundTimeoutError);
    expect(docs.read).not.toHaveBeenCalled();
  });
});

describe("the legacy ids", () => {
  const a = { holder: HOLDER, source: CONTACT, curie: CURIE, target: VENT };
  it("six generations are recognised, the seventh is not", async () => {
    expect(MAX_TIE_GENERATIONS).toBe(6);
    expect(await isLegacyKindRelationId(await legacyKindRelationId({ ...a, generation: 5 }), a)).toBe(true);
    expect(await isLegacyKindRelationId(await legacyKindRelationId({ ...a, generation: 6 }), a)).toBe(false);
  });
  it("the id is 26 hex of the digest, the same with no generation and with generation 0, and a later generation is another id", async () => {
    const none = await legacyKindRelationId(a);
    expect(none).toMatch(/^[0-9a-f]{26}$/);
    expect(await legacyKindRelationId({ ...a, generation: 0 })).toBe(none);
    expect(await legacyKindRelationId({ ...a, generation: 1 })).not.toBe(none);
    expect(await legacyKindRelationId({ ...a, curie: "t:CustomerOf" })).not.toBe(none);
  });
});

describe("matchTies from the vault's side", () => {
  const friend: KindEntry = { id: "f", label: "Friend", order: 1, playableBy: [], axis: "relationshipKind", own: false, kindPredicate: { curie: CURIE } };
  const reversed = (type: string) => [{ uri: `${VNS}/r/1`, type, source: VENT, target: CONTACT }];
  it("the default is the same tie either way round, whatever the catalogue says", () => {
    expect(matchTies(reversed("t:AssociatedWith"), [friend], CONTACT, VENT, { defaultEntry: null, catalog: null }).map((t) => t.isDefault)).toEqual([true]);
  });
  it("another predicate reversed is matched only when the catalogue says it is symmetric", () => {
    expect(matchTies(reversed(CURIE), [friend], CONTACT, VENT, { defaultEntry: null, catalog: null })).toEqual([]);
    const symmetric = { terms: [{ curie: CURIE, label: "friend-of", symmetric: true }] } as never;
    expect(matchTies(reversed(CURIE), [friend], CONTACT, VENT, { defaultEntry: null, catalog: symmetric }).map((t) => t.label)).toEqual(["Friend"]);
  });
});

describe("writeTie: the waits are named, and the ids are kept as the state says", () => {
  const tie = { vault: VAULT, subject: CONTACT, curie: CURIE, holder: HOLDER };
  function mem() {
    const live = new Map<string, string>();
    const deps = {
      readRows: async (): Promise<RecordRelation[]> => [...live.entries()].map(([id, c]) => rel(id, c)),
      readDoc: async (uri: string): Promise<RelationDoc | null> => {
        const id = uri.split("/").pop()!;
        return live.has(id) ? doc({ id, uri, typeCurie: live.get(id)!, extras: { "a:claimSubject": { "@id": HOLDER } } }) : null;
      },
      write: vi.fn(async (a: { id: string; curie: string }) => {
        live.set(a.id, a.curie);
        return { id: a.id, uri: `${VNS}/r/${a.id}` };
      }),
      readBack: vi.fn(async (uri: string) => {
        const id = uri.split("/").pop()!;
        return live.has(id) ? { curie: live.get(id)!, source: CONTACT, target: VENT } : null;
      }),
      end: vi.fn(async (_v: string, uris: readonly string[]) => {
        for (const u of uris) live.delete(u.split("/").pop()!);
      }),
      newId: vi.fn(() => "nnnnnnnnnnnnnnnnnnnnnnnnnn"),
      lock: noLock,
    };
    return { live, deps };
  }
  it("a read-back that never settles ends with the wait named, the id that was sent on the error, and a late answer", async () => {
    vi.useFakeTimers();
    __setKindWriteBoundForTest(1000);
    const m = mem();
    m.deps.readBack = vi.fn(() => new Promise(() => {})) as never;
    const run = writeTie(tie, m.deps).then(() => "ok" as const, (e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);
    const err = (await run) as Error & { written?: { id: string; uri: string }; late?: Promise<unknown> };
    expect(err.message).toBe("reading the kind relation back timed out");
    expect(err.written).toEqual({ id: "nnnnnnnnnnnnnnnnnnnnnnnnnn", uri: `${VNS}/r/nnnnnnnnnnnnnnnnnnnnnnnnnn` });
    expect(err.late).toBeInstanceOf(Promise);
  });
  it("a read-back that fails is not a wait: the store did not keep it", async () => {
    const m = mem();
    m.deps.readBack = vi.fn(async () => {
      throw new Error("network");
    }) as never;
    await expect(writeTie(tie, m.deps)).rejects.toThrow("The store accepted this but did not keep it.");
  });
  it("the list read after the write that never settles ends with the wait named and the id on the error", async () => {
    vi.useFakeTimers();
    __setKindWriteBoundForTest(1000);
    const m = mem();
    let reads = 0;
    const rows = m.deps.readRows;
    m.deps.readRows = vi.fn(() => (++reads === 1 ? rows() : new Promise(() => {}))) as never;
    const run = writeTie(tie, m.deps).then(() => "ok" as const, (e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);
    const err = (await run) as Error & { written?: { id: string } };
    expect(err.message).toBe("reading this contact's kind ties timed out");
    expect(err.written?.id).toBe("nnnnnnnnnnnnnnnnnnnnnnnnnn");
  });
  it("an unconfirmed id whose write then returns but is not kept is an error, not a second tie under a new id", async () => {
    const m = mem();
    const write = m.deps.write;
    m.deps.write = vi.fn(async () => {
      throw new Error("relation write failed: 500");
    }) as never;
    await expect(writeTie(tie, m.deps)).rejects.toThrow("500");
    m.deps.write = write;
    m.deps.readBack = vi.fn(async () => null) as never;
    m.deps.newId.mockClear();
    await expect(writeTie(tie, m.deps)).rejects.toThrow("The store accepted this but did not keep it.");
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0].id).toBe("nnnnnnnnnnnnnnnnnnnnnnnnnn");
  });
  it("a confirmed write forgets the remembered ended id: a tie ended elsewhere afterwards is written under a new id", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ relation: `${VNS}/r/old0000000000000000000000a`, changed: true }), text: async () => "", headers: { get: () => null } })));
    docs.read.mockResolvedValue(null);
    const m = mem();
    await endTies(VAULT, HOLDER, CONTACT, [{ relationUri: `${VNS}/r/old0000000000000000000000a`, curie: CURIE }], { lock: noLock });
    const revived = await writeTie(tie, m.deps);
    expect(revived).toMatchObject({ id: "old0000000000000000000000a", reused: "ended" });
    m.live.clear();
    const again = await writeTie(tie, m.deps);
    expect(again).toMatchObject({ id: "nnnnnnnnnnnnnnnnnnnnnnnnnn", reused: null });
  });
});
