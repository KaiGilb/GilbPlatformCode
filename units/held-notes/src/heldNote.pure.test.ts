// @vitest-environment node
// New. The pure rules of `heldNote.ts` and the read's limits, which the ported cases touch only on the way: how a served claim is read, the two
// spellings of a person's address, `inVault`, which claims are a card's and which are the viewer's, the page cap, `DIRECT_READER`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fake from "../test/fakePlaceStore";
import { setUp, tearDown } from "../test/support";
import {
  DIRECT_READER,
  HELD_FIND_MAX_PAGES,
  HELD_FIND_PAGE,
  HeldNoteError,
  heldClaimFacts,
  heldNotesAbout,
  heldNotesOfKind,
  inVault,
  listHeldClaimsAbout,
  listHeldNotesAbout,
  notesForTopic,
  ownHeldNotes,
  readHeldClaimDoc,
  subjectSpellings,
  toHeldNote,
  type HeldNote,
} from "./index";
import { __resetHeldNoteVocab, resolveHeldNoteVocab, resolveHeldPartyAttr } from "./heldNoteVocab";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel };
});

const { VAULT } = fake;
const uriOf = (id: string) => `${VAULT}/e/${id}`;
const NURSING = "https://veda.platform.example.test/base/t/Nursing";
const ME = "https://adder.platform.example.test/base/e/vsc-me";

beforeEach(() => {
  setUp();
  fake.resetStore();
  __resetHeldNoteVocab();
  fake.attributeSpelling.mockReset().mockImplementation(async (n: string) => n);
  fake.typeSpelling.mockClear();
});
afterEach(tearDown);

const note = (over: Partial<HeldNote> = {}): HeldNote => ({ id: "1", uri: "u1", heldParties: ["p"], topic: NURSING, note: "a", statedBy: [ME], ...over });

describe("constants", () => {
  it("the find page is the platform's cap and the walk stops at ten pages", () => {
    expect(HELD_FIND_PAGE).toBe(200);
    expect(HELD_FIND_MAX_PAGES).toBe(10);
  });
  it("DIRECT_READER is the read-back grant key", () => {
    expect(DIRECT_READER).toBe("a:directReader");
  });
});

describe("subjectSpellings and inVault", () => {
  it("a /base/e/ address is asked under both spellings, a /vault/e/ one likewise, any other under itself", () => {
    expect(subjectSpellings("https://h.example.test/base/e/x")).toEqual(["https://h.example.test/base/e/x", "https://h.example.test/vault/e/x"]);
    expect(subjectSpellings("https://h.example.test/vault/e/x")).toEqual(["https://h.example.test/vault/e/x", "https://h.example.test/base/e/x"]);
    expect(subjectSpellings("https://h.example.test/lws/r/x")).toEqual(["https://h.example.test/lws/r/x"]);
    expect(subjectSpellings("base:e/x")).toEqual(["base:e/x"]);
  });
  it("an entity is in a vault when their hosts are the same (case ignored); an address that is no URL is in none", () => {
    expect(inVault("https://H.example.test/base/e/x", "https://h.example.test/base")).toBe(true);
    expect(inVault("https://h.example.test/base/e/x", "https://i.example.test/base")).toBe(false);
    expect(inVault("base:e/x", "https://h.example.test/base")).toBe(false);
    expect(inVault("https://h.example.test/base/e/x", "not a url")).toBe(false);
    expect(inVault("not a url", "not a url")).toBe(false);
  });
});

describe("toHeldNote — a served claim read under either spelling", () => {
  const vocab = async () => resolveHeldNoteVocab("skill");
  it("reads the topic, the note, the parties, the stater and the tier from stored keys", async () => {
    const n = toHeldNote("i", "u", { "a:heldParty": { "@id": "P" }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "ICU", "a:statedBy": { "@id": ME }, "a:visibilityTier": "private" }, await vocab());
    expect(n).toEqual({ id: "i", uri: "u", heldParties: ["P"], topic: NURSING, note: "ICU", statedBy: [ME], isPrivate: true });
  });
  it("reads the wire (bare) spellings the platform frames, strings and lists of references", async () => {
    const n = toHeldNote("i", "u", { heldParty: [{ "@id": "P" }, "Q"], skill: [{ "@id": NURSING }], skillDepthNote: ["first", "second"], statedBy: { "@id": ME } }, await vocab());
    expect(n).toMatchObject({ heldParties: ["P", "Q"], topic: NURSING, note: "first", statedBy: [ME], isPrivate: false });
  });
  it("a claim with no category of this kind is no note of this kind", async () => {
    expect(toHeldNote("i", "u", { "a:heldParty": { "@id": "P" }, "a:email": "x" }, await vocab())).toBeNull();
    expect(toHeldNote("i", "u", { "a:skill": [] }, await vocab())).toBeNull();
  });
  it("no note reads as an empty note; no stater as none", async () => {
    expect(toHeldNote("i", "u", { "a:skill": { "@id": NURSING } }, await vocab())).toMatchObject({ note: "", statedBy: [], heldParties: [] });
  });
  it("a literal category another app wrote is kept as text", async () => {
    expect(toHeldNote("i", "u", { "a:skill": "Nursing" }, await vocab())!.topic).toBe("Nursing");
  });
});

describe("which claims are a card's, and which are the viewer's", () => {
  it("heldNotesAbout keeps a claim about exactly this record (either spelling's tail), never about two", () => {
    const tom = "https://h.example.test/base/e/tom";
    const kept = note({ id: "k", heldParties: [tom] });
    expect(heldNotesAbout([kept, note({ id: "two", heldParties: [tom, "x"] }), note({ id: "other", heldParties: ["https://h.example.test/base/e/ann"] }), note({ id: "none", heldParties: [] })], tom).map((n) => n.id)).toEqual(["k"]);
    expect(heldNotesAbout([kept], "")).toEqual([]);
    expect(heldNotesAbout([note({ heldParties: ["https://h.example.test/vault/e/tom"] })], tom)).toHaveLength(1);
  });
  it("ownHeldNotes keeps exactly the claims whose one stater is the viewer's card, byte for byte", () => {
    const mine = note({ id: "m", statedBy: [ME] });
    const got = ownHeldNotes([mine, note({ id: "t", statedBy: [`${ME}/`] }), note({ id: "two", statedBy: [ME, "x"] }), note({ id: "none", statedBy: [] })], ME);
    expect(got.map((n) => n.id)).toEqual(["m"]);
    expect(ownHeldNotes([mine], null)).toEqual([]);
    expect(ownHeldNotes([mine], undefined)).toEqual([]);
  });
  it("notesForTopic filters by category", () => {
    expect(notesForTopic([note({ id: "a" }), note({ id: "b", topic: "x" })], NURSING).map((n) => n.id)).toEqual(["a"]);
  });
  it("heldNotesOfKind sorts by id, whatever order the claims came in", async () => {
    const v = await resolveHeldNoteVocab("skill");
    const doc = (id: string) => ({ id, uri: `u${id}`, doc: { "a:skill": { "@id": `${NURSING}${id}` } } });
    expect(heldNotesOfKind([doc("c"), doc("a"), doc("b")], v).map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
});

describe("listHeldClaimsAbout — what it asks and what it refuses", () => {
  it("nothing is asked for no vault or no person", async () => {
    expect(await listHeldClaimsAbout("", uriOf("tom"))).toEqual([]);
    expect(await listHeldClaimsAbout(VAULT, "")).toEqual([]);
    expect(await listHeldNotesAbout("skill", "", uriOf("tom"))).toEqual([]);
    expect(await listHeldNotesAbout("skill", VAULT, "")).toEqual([]);
    expect(fake.findByAttribute).not.toHaveBeenCalled();
  });
  it("the find is asked at the vault's own node, once per spelling, on a:heldParty with the reference as the value", async () => {
    await listHeldClaimsAbout(VAULT, uriOf("tom"));
    expect(fake.findByAttribute.mock.calls.map((c) => [c[0], c[1], c[3]])).toEqual([
      ["a:heldParty", { "@id": uriOf("tom") }, "https://hytta.platform.example.test"],
      ["a:heldParty", { "@id": `https://hytta.platform.example.test/vault/e/tom` }, "https://hytta.platform.example.test"],
    ]);
    expect(fake.findByAttribute.mock.calls.every((c) => (c[2] as { limit: number }).limit === 200)).toBe(true);
  });
  it("the claims come back sorted by id, with their type", async () => {
    const b = fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": uriOf("tom") }, "a:skill": { "@id": NURSING } }, "b-late");
    const a = fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": uriOf("tom") }, "a:skill": { "@id": NURSING } }, "a-early");
    const got = await listHeldClaimsAbout(VAULT, uriOf("tom"));
    expect(got.map((c) => c.id)).toEqual([a, b]);
    expect(got[0]!.typeUri).toMatch(/\/t\/HeldPartyFieldClaim$/);
    expect(got[0]!.uri).toBe(uriOf(a));
  });
  it("the claims come back sorted by id even when the find lists them the other way round", async () => {
    const a = fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": uriOf("tom") }, "a:skill": { "@id": NURSING } }, "a1");
    const b = fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": uriOf("tom") }, "a:skill": { "@id": NURSING } }, "b1");
    fake.findByAttribute.mockImplementation(async () => ({ count: 2, ids: [uriOf(b), uriOf(a)] }));
    expect((await listHeldClaimsAbout(VAULT, uriOf("tom"))).map((c) => c.id)).toEqual([a, b]);
  });
  it("a claim found twice (both spellings name the person) is read once", async () => {
    fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": [{ "@id": uriOf("tom") }, { "@id": "https://hytta.platform.example.test/vault/e/tom" }], "a:skill": { "@id": NURSING } });
    expect(await listHeldClaimsAbout(VAULT, uriOf("tom"))).toHaveLength(1);
    expect(fake.readRecord).toHaveBeenCalledTimes(1);
  });
  it("⛔ more claims than the cap (10 pages of 200) fails the read: none is shown rather than some", async () => {
    fake.findByAttribute.mockImplementation(async (_a: string, _v: unknown, page: { limit?: number; offset?: number } = {}) => {
      const offset = page.offset ?? 0;
      const limit = page.limit ?? 200;
      const total = 5000;
      const ids = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_x, i) => `${VAULT}/e/c${offset + i}`);
      return { count: total, ids };
    });
    await expect(listHeldClaimsAbout(VAULT, uriOf("tom"))).rejects.toThrow(/more held claims about this person than can be read \(2000\); none is shown rather than some/);
    await expect(listHeldClaimsAbout(VAULT, uriOf("tom"))).rejects.toBeInstanceOf(HeldNoteError);
  });
  it("exactly the cap is read, not refused", async () => {
    fake.findByAttribute.mockImplementation(async (_a: string, _v: unknown, page: { limit?: number; offset?: number } = {}) => {
      const offset = page.offset ?? 0;
      const limit = page.limit ?? 200;
      const total = 2000;
      const ids = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_x, i) => `${VAULT}/e/c${offset + i}`);
      return { count: total, ids };
    });
    fake.readRecord.mockImplementation(async () => null);
    expect(await listHeldClaimsAbout(VAULT, uriOf("tom"))).toEqual([]); // all 2000 answered 404: gone
    expect(fake.readRecord).toHaveBeenCalledTimes(2000);
  }, 60_000);
});

describe("readHeldClaimDoc and the vocabulary", () => {
  it("a served claim is its id, address, document and type; one served with nothing is null", async () => {
    const id = fake.seed("t:HeldPartyFieldClaim", { "a:skill": { "@id": NURSING } });
    const got = await readHeldClaimDoc(VAULT, { id, uri: uriOf(id) });
    expect(got).toMatchObject({ id, uri: uriOf(id) });
    expect(got!.typeUri).toMatch(/\/t\/HeldPartyFieldClaim$/);
    expect(got!.doc["skill"]).toEqual({ "@id": NURSING });
    expect(await readHeldClaimDoc(VAULT, { id: "gone", uri: uriOf("gone") })).toBeNull();
  });
  it("the vocabulary is asked once per kind and kept, and a failure is not kept", async () => {
    await resolveHeldNoteVocab("skill");
    await resolveHeldNoteVocab("skill");
    expect(fake.typeSpelling).toHaveBeenCalledTimes(1);
    fake.attributeSpelling.mockImplementationOnce(async () => null as never);
    await expect(resolveHeldNoteVocab("interest")).rejects.toThrow(/The ontology did not name .* so no interest note can be read or written right now\./);
    await expect(resolveHeldNoteVocab("interest")).resolves.toMatchObject({ kind: "interest", topic: "a:topicInterest", note: "a:topicInterestNote" });
  });
  it("the per-person spelling is `a:heldParty`, apart from either kind, and cached on success only", async () => {
    expect(await resolveHeldPartyAttr()).toBe("a:heldParty");
    const calls = fake.attributeSpelling.mock.calls.length;
    await resolveHeldPartyAttr();
    expect(fake.attributeSpelling.mock.calls.length).toBe(calls);
    __resetHeldNoteVocab();
    fake.attributeSpelling.mockImplementationOnce(async () => null as never);
    await expect(resolveHeldPartyAttr()).rejects.toThrow(/did not name a\/heldParty/);
    expect(await resolveHeldPartyAttr()).toBe("a:heldParty");
  });
  it("the resolved vocabulary of a kind: the two terms, the claim type in both forms", async () => {
    expect(await resolveHeldNoteVocab("skill")).toEqual({ kind: "skill", heldParty: "a:heldParty", statedBy: "a:statedBy", topic: "a:skill", note: "a:skillDepthNote", heldClaimType: "t:HeldPartyFieldClaim", heldClaimTypeQuery: "HeldPartyFieldClaim" });
    expect(await resolveHeldNoteVocab("interest")).toMatchObject({ topic: "a:topicInterest", note: "a:topicInterestNote" });
  });
  it("a missing claim type is refused like a missing term", async () => {
    fake.typeSpelling.mockImplementationOnce(async () => null as never);
    await expect(resolveHeldNoteVocab("skill")).rejects.toThrow(/did not name t\/HeldPartyFieldClaim/);
  });
  it("an empty note is not a fact of the claim", async () => {
    const v = await resolveHeldNoteVocab("skill");
    const facts = heldClaimFacts(v, { subject: "s", topic: NURSING, note: "", stater: ME });
    expect("a:skillDepthNote" in facts).toBe(false);
    expect(Object.keys(facts).sort()).toEqual(["a:heldParty", "a:skill", "a:statedBy"]);
  });
  it("the spelling the master gives is the one written (never a guessed key)", async () => {
    fake.attributeSpelling.mockImplementation(async (n: string) => (n === "skillDepthNote" ? "depthNote" : n));
    const v = await resolveHeldNoteVocab("skill");
    expect(v.note).toBe("a:depthNote");
    const facts = heldClaimFacts(v, { subject: "s", topic: NURSING, note: "x", stater: ME });
    expect(facts["a:depthNote"]).toBe("x");
    expect("a:skillDepthNote" in facts).toBe(false);
  });
});
