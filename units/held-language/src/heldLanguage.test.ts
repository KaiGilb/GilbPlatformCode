// New. The source has no test of this file alone (its cases are in the languages section's tests, which are in `language-section`, and in
// `heldPrivate.sb1b`, which is in `held-languages-state`). These pin the composer's refusals, the reading, the three writes and their bodies.
// The real peers run over the fake platform (test/fakePlaceStore.ts, at the level of `fetch`); the term answers are the fake master's.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import * as fake from "../test/fakePlaceStore";
import { setUp, tearDown } from "../test/support";
import { watchWire, writes, type WireCall } from "../test/wire";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel };
});

// eslint-disable-next-line import/first
import {
  HeldLanguageError,
  HeldLanguageVocabUnavailableError,
  __resetHeldLanguageVocab,
  addHeldLanguage,
  dedupeHeldLanguages,
  heldLanguageFacts,
  heldLanguagesAbout,
  heldLanguagesOf,
  ownHeldLanguages,
  removeHeldLanguages,
  resolveHeldLanguageVocab,
  setHeldLanguageFlag,
  toHeldLanguage,
  type HeldLanguage,
  type ResolvedHeldLanguageVocab,
} from "./index";

const { VAULT, store } = fake;
const ORIGIN = "https://veda.platform.example.test";
const NOR = `${ORIGIN}/base/e/xja6zz79cmva`;
const ENG = `${ORIGIN}/base/e/eng000000001`;
const NORWAY = "https://geo.platform.example.test/base/e/osm-r-2978650";
const UK = "https://geo.platform.example.test/base/e/osm-r-62149";
const PRINCIPAL = "https://id.platform.example.test/base/p/kai";
const uriOf = (id: string) => `${VAULT}/e/${id}`;
const VOCAB: ResolvedHeldLanguageVocab = { heldParty: "a:heldParty", statedBy: "a:statedBy", languageUsed: "a:languageUsed", flagCountry: "a:flagCountry", heldClaimType: "t:HeldPartyFieldClaim" };
let calls: WireCall[];
let kai: string;
let tom: string;

beforeEach(() => {
  setUp();
  setTermOrigin(ORIGIN);
  fake.resetStore();
  __resetHeldLanguageVocab();
  calls = watchWire();
  kai = uriOf(fake.seed("t:Person", { "a:name": "Kai's vault" }));
  tom = uriOf(fake.seed("t:Person", { "a:givenName": "Tom" }));
});
afterEach(() => {
  resetTermOrigin();
  tearDown();
});

const facts = (over: Partial<Parameters<typeof heldLanguageFacts>[1]> = {}) => heldLanguageFacts(VOCAB, { subject: tom, language: NOR, stater: kai, ...over });
const claims = () => [...store.entries()].filter(([, e]) => e.type === "t:HeldPartyFieldClaim" && "a:languageUsed" in e.facts);

describe("the facts of a new held language claim (the one composer)", () => {
  it("is the person, the entry and the stater, and nothing else", () => {
    expect(facts()).toEqual({ "a:heldParty": { "@id": tom }, "a:languageUsed": { "@id": NOR }, "a:statedBy": { "@id": kai } });
  });
  it("adds the flag when given, and the signed-in principal as the self-read grant", () => {
    const f = facts({ flagCountry: NORWAY, readerPrincipal: PRINCIPAL });
    expect(f["a:flagCountry"]).toEqual({ "@id": NORWAY });
    expect(Object.keys(f)).toHaveLength(5);
    expect(Object.values(f)).toContain(PRINCIPAL);
  });
  it("🔴 never carries a rung or a claim subject, so a local card's language can never be found by the network", () => {
    for (const f of [facts(), facts({ flagCountry: UK, readerPrincipal: PRINCIPAL })]) {
      const keys = Object.keys(f).join(" ").toLowerCase();
      expect(keys).not.toMatch(/visibilitytier|claimsubject|tier|subject/);
    }
  });
  it("refuses a language that is not an entry address: a name, a term, a bare id, a path with more, a query", () => {
    for (const bad of ["Norwegian", `${ORIGIN}/base/t/Norwegian`, "xja6zz79cmva", `${ORIGIN}/base/e/a/b`, `${NOR}?x=1`, `${ORIGIN}/base/e/`, ""]) {
      expect(() => facts({ language: bad })).toThrow(HeldLanguageError);
    }
  });
  it("🔴 refuses the same entry path on a foreign origin, and accepts it on the term origin (STOP-7)", () => {
    expect(() => facts({ language: "https://veda.other.example.test/base/e/xja6zz79cmva" })).toThrow(/not a GilbVeda language entry address/);
    expect(() => facts({ language: "http://veda.platform.example.test/base/e/xja6zz79cmva" })).toThrow(HeldLanguageError);
    expect(facts({ language: NOR })["a:languageUsed"]).toEqual({ "@id": NOR });
  });
  it("🔴 the origin is the one set NOW: after it changes, the old origin's entry is refused", () => {
    setTermOrigin("https://veda.second.example.test");
    expect(() => facts({ language: NOR })).toThrow(HeldLanguageError);
    expect(facts({ language: "https://veda.second.example.test/base/e/xja6zz79cmva" })["a:languageUsed"]).toEqual({ "@id": "https://veda.second.example.test/base/e/xja6zz79cmva" });
  });
  it("refuses a flag that is not a catalogue address", () => {
    for (const bad of ["Norway", "http://geo.platform.example.test/base/e/osm-r-1", "https://geo.platform.example.test/base/t/Country", "https://geo.platform.example.test/base/e/a/b"]) {
      expect(() => facts({ flagCountry: bad })).toThrow(/not a catalogue address/);
    }
  });
  it("a blank flag is no flag", () => {
    expect(Object.keys(facts({ flagCountry: "  " }))).toHaveLength(3);
  });
});

describe("the vocabulary", () => {
  it("is asked of the master by term name, once, and a held claim is registered as a part of a card", async () => {
    const a = await resolveHeldLanguageVocab();
    const b = await resolveHeldLanguageVocab();
    expect(b).toBe(a);
    expect(a).toEqual(VOCAB);
    expect(fake.attributeSpelling).toHaveBeenCalledTimes(4);
    expect(fake.typeSpelling).toHaveBeenCalledTimes(1);
  });
  it("a term the master does not name makes it unavailable, says which, and is not remembered", async () => {
    fake.attributeSpelling.mockImplementation(async (n: string) => (n === "flagCountry" ? (null as unknown as string) : n));
    await expect(resolveHeldLanguageVocab()).rejects.toThrow(HeldLanguageVocabUnavailableError);
    await expect(resolveHeldLanguageVocab()).rejects.toThrow(/a\/flagCountry/);
    fake.attributeSpelling.mockImplementation(async (n: string) => n);
    await expect(resolveHeldLanguageVocab()).resolves.toEqual(VOCAB);
  });
});

describe("reading a claim", () => {
  const doc = (over: Record<string, unknown> = {}) => ({
    "a:heldParty": { "@id": tom },
    "a:languageUsed": { "@id": NOR },
    "a:statedBy": { "@id": kai },
    ...over,
  });
  it("takes the entry, the flag, the person and the stater; the wire spelling reads too", () => {
    const l = toHeldLanguage("c1", uriOf("c1"), doc({ "a:flagCountry": { "@id": NORWAY } }), VOCAB)!;
    expect(l).toMatchObject({ id: "c1", language: NOR, flagCountry: NORWAY, heldParties: [tom], statedBy: [kai] });
    const wire = toHeldLanguage("c2", uriOf("c2"), { heldParty: { "@id": tom }, languageUsed: { "@id": ENG }, statedBy: { "@id": kai } }, VOCAB)!;
    expect(wire.language).toBe(ENG);
    expect(wire.flagCountry).toBeNull();
  });
  it("a bare string is not a language: the term is a reference", () => {
    expect(toHeldLanguage("c1", uriOf("c1"), doc({ "a:languageUsed": "Norwegian" }), VOCAB)).toBeNull();
    expect(toHeldLanguage("c1", uriOf("c1"), { "a:heldParty": { "@id": tom } }, VOCAB)).toBeNull();
  });
  it("lists only the claims that carry a language, in id order", () => {
    const list = heldLanguagesOf(
      [
        { id: "b", uri: uriOf("b"), doc: doc() },
        { id: "x", uri: uriOf("x"), doc: { "a:heldParty": { "@id": tom }, "a:skill": { "@id": "s" } } },
        { id: "a", uri: uriOf("a"), doc: doc({ "a:languageUsed": { "@id": ENG } }) },
      ],
      VOCAB,
    );
    expect(list.map((l) => l.id)).toEqual(["a", "b"]);
  });
  const L = (id: string, language: string, by: string, party = tom): HeldLanguage => ({ id, uri: uriOf(id), heldParties: [party], language, flagCountry: null, statedBy: [by] });
  it("about one record: only the claims whose single party is that record", () => {
    const list = [L("a", NOR, kai), L("b", ENG, kai, uriOf("other")), { ...L("c", ENG, kai), heldParties: [tom, uriOf("other")] }];
    expect(heldLanguagesAbout(list, tom).map((l) => l.id)).toEqual(["a"]);
    expect(heldLanguagesAbout(list, "")).toEqual([]);
  });
  it("own: only the claims the viewer's own card stated", () => {
    const list = [L("a", NOR, kai), L("b", ENG, uriOf("someone-else"))];
    expect(ownHeldLanguages(list, kai).map((l) => l.id)).toEqual(["a"]);
    expect(ownHeldLanguages(list, null)).toEqual([]);
  });
  it("one entry is one row: the viewer's own claim is the row shown, else the first by id", () => {
    const other = uriOf("someone-else");
    const list = [L("a", NOR, other), L("b", NOR, kai), L("c", ENG, other), L("d", ENG, other)];
    expect(dedupeHeldLanguages(list, kai).map((l) => l.id)).toEqual(["b", "c"]);
    expect(dedupeHeldLanguages(list).map((l) => l.id)).toEqual(["a", "c"]);
  });
});

describe("the three writes", () => {
  const add = (over: Partial<Parameters<typeof addHeldLanguage>[0]> = {}) => addHeldLanguage({ vaultId: VAULT, subject: tom, language: NOR, existing: [], stater: kai, readerPrincipal: PRINCIPAL, ...over });

  it("add: ONE create of a held claim in the named vault, with the composed facts and no tier", async () => {
    const got = await add({ flagCountry: NORWAY });
    expect(got.kind).toBe("create");
    const w = writes(calls);
    expect(w).toHaveLength(1);
    expect(w[0]!.method).toBe("POST");
    expect(w[0]!.url).toContain("/lws/vault/");
    const body = w[0]!.body as { type: string; facts: Record<string, unknown> };
    expect(body.type).toBe("t:HeldPartyFieldClaim");
    expect(body.facts).toMatchObject({ "a:heldParty": { "@id": tom }, "a:languageUsed": { "@id": NOR }, "a:statedBy": { "@id": kai }, "a:flagCountry": { "@id": NORWAY } });
    expect(JSON.stringify(body)).not.toMatch(/visibilityTier|claimSubject/);
    expect(claims()).toHaveLength(1);
    if (got.kind === "create") expect(got.claim.uri).toBe(uriOf(got.claim.id));
  });
  it("add: an entry already on the card is kept: nothing is written", async () => {
    const existing: HeldLanguage[] = [{ id: "c", uri: uriOf("c"), heldParties: [tom], language: NOR, flagCountry: null, statedBy: [kai] }];
    expect(await add({ existing })).toEqual({ kind: "none" });
    expect(writes(calls)).toHaveLength(0);
  });
  it("add: refuses with no vault, no stater, no person or no language, and writes nothing", async () => {
    for (const over of [{ vaultId: "" }, { stater: "" }, { subject: "" }, { language: "" }]) await expect(add(over)).rejects.toThrow(HeldLanguageError);
    await expect(add({ language: "https://veda.other.example.test/base/e/xja6zz79cmva" })).rejects.toThrow(HeldLanguageError);
    expect(writes(calls)).toHaveLength(0);
  });
  it("flag: ONE PATCH carrying only the flag; the exact body for a chosen flag", async () => {
    const created = await add();
    if (created.kind !== "create") throw new Error("not created");
    calls.length = 0;
    await setHeldLanguageFlag(VAULT, created.claim, UK);
    const w = writes(calls);
    expect(w).toHaveLength(1);
    expect(w[0]!.method).toBe("PATCH");
    expect(w[0]!.url).toContain(`/lws/r/${created.claim.id}`);
    expect(w[0]!.body).toEqual({ "a:flagCountry": { "@id": UK } });
    expect(store.get(created.claim.id)!.facts["a:flagCountry"]).toEqual({ "@id": UK });
  });
  it("🔴 flag: a null is sent only for the flag, and only when it is cleared (the exact body), and the language stays", async () => {
    const created = await add({ flagCountry: UK });
    if (created.kind !== "create") throw new Error("not created");
    calls.length = 0;
    await setHeldLanguageFlag(VAULT, created.claim, null);
    await setHeldLanguageFlag(VAULT, created.claim, "  ");
    const w = writes(calls);
    expect(w.map((c) => c.body)).toEqual([{ "a:flagCountry": null }, { "a:flagCountry": null }]);
    expect(store.get(created.claim.id)!.facts["a:flagCountry"]).toBeUndefined();
    expect(store.get(created.claim.id)!.facts["a:languageUsed"]).toEqual({ "@id": NOR });
  });
  it("flag: refuses an address that is not a catalogue country, and no vault; nothing is written", async () => {
    const claim = { id: "c", uri: uriOf("c") };
    await expect(setHeldLanguageFlag(VAULT, claim, "Norway")).rejects.toThrow(/not a catalogue address/);
    await expect(setHeldLanguageFlag("", claim, UK)).rejects.toThrow(HeldLanguageError);
    expect(writes(calls)).toHaveLength(0);
  });
  it("remove: ONE DELETE for each claim named, none for the others; no vault is refused", async () => {
    const a = await add();
    const b = await add({ language: ENG });
    if (a.kind !== "create" || b.kind !== "create") throw new Error("not created");
    calls.length = 0;
    await removeHeldLanguages(VAULT, [a.claim]);
    expect(writes(calls).map((c) => [c.method, c.url.includes(a.claim.id)])).toEqual([["DELETE", true]]);
    expect(claims().map(([id]) => id)).toEqual([b.claim.id]);
    calls.length = 0;
    await removeHeldLanguages(VAULT, []);
    expect(writes(calls)).toHaveLength(0);
    await expect(removeHeldLanguages("", [b.claim])).rejects.toThrow(HeldLanguageError);
  });
});
