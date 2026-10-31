// Ported from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/lib/mynet/heldnote/heldNote.c214.test.ts` (31 cases).
// Re-based: the source drove the store through module mocks of the app's record client; here the real peers run over a fake platform
// (test/fakePlaceStore.ts, at the level of `fetch`). `listVaultRecordsPage` is not part of the store (nothing here lists).
// Cycle214 step 1e — the holder's note on one skill (and, since s7, one interest) of a person card: the
// SHARED held-note store (`heldNote.ts`; it replaced the skill-only `heldSkillNote.ts`), driven through
// GilbApp's real record client seam (`../place/lws.ts`) over the in-memory vault (`fakePlaceStore`,
// MOCK). Every write is proved by what the VAULT holds afterwards.
// Spec: Kai 2026-10-14 — "the skills and interests are categories/generic. then each person have special
// capabilities and or interests within that, so that is best captured with a free text filled in."
// Spec: Agent.Concept ruling §2a (C214-1e-PersonCardOntology-AgentConcept-2026-10-14) — `a:skillDepthNote`
// on a `t:HeldPartyFieldClaim` in the holder's vault, `a:heldParty` → the person, `a:skill` → the skill.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fake from "../test/fakePlaceStore";
import { setUp, tearDown } from "../test/support";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel };
});

// eslint-disable-next-line import/first
import {
  addHeldTopic,
  heldClaimFacts,
  heldNoteSurvived as noteSurvived,
  heldNotesAbout as skillNotesAbout,
  ownHeldNotes,
  HeldNoteError as SkillNoteError,
  listHeldNotesAbout,
  notesForTopic as notesForSkill,
  planHeldNoteWrite as planSkillNoteWrite,
  readHeldClaim,
  removeHeldNotes as removeSkillNotes,
  saveHeldNote,
  type HeldNote as HeldSkillNote,
} from "./heldNote";
// eslint-disable-next-line import/first
import { __resetHeldNoteVocab as __resetSkillNoteVocab, HeldNoteVocabUnavailableError as SkillNoteVocabUnavailableError, resolveHeldNoteVocab } from "./heldNoteVocab";
// eslint-disable-next-line import/first
import { isCardPartType } from "@kaigilb/gilbplatformcode-lws-vault-sets";

const { VAULT, store } = fake;
const NURSING = "https://veda.platform.example.test/base/t/Nursing";
const SELL = "https://veda.platform.example.test/base/t/SellProducts";
const PHOTO = "https://veda.platform.example.test/base/t/Photography";
const AGENT = "https://id.platform.example.test/base/p/kai";
const uriOf = (id: string) => `${VAULT}/e/${id}`;
const claims = () => [...store.entries()].filter(([, e]) => e.type === "t:HeldPartyFieldClaim");

let tom: string;
let ann: string;
/** The holding vault's self card: the stater of every note this card writes (typing gate r1). */
const ADDER_CARD = "https://adder.platform.example.test/base/e/vsc-adder";
let SELF: string;
let BY: Record<string, unknown>;
afterEach(tearDown);
beforeEach(() => {
  setUp();
  fake.resetStore();
  __resetSkillNoteVocab();
  fake.attributeSpelling.mockImplementation(async (name: string) => name);
  tom = fake.seed("t:Person", { "a:givenName": "Tom", "a:skill": [{ "@id": NURSING }] });
  ann = fake.seed("t:Person", { "a:givenName": "Ann", "a:skill": [{ "@id": NURSING }] });
  // RuleBaseappSourceIsAdder: the stater is the ADDER's own card in THEIR vault, a card that is not in the vault written to.
  SELF = ADDER_CARD;
  BY = { "a:statedBy": { "@id": SELF } };
});

async function notesOf(person: string, kind: "skill" | "interest" = "skill") {
  return skillNotesAbout(await listHeldNotesAbout(kind, VAULT, uriOf(person)), uriOf(person));
}

/** The skill view of the shared writer, as the skill tests were written (what the write did). */
async function saveSkillNote(a: { vaultId: string; subject: string; skill: string; text: string; existing: readonly HeldSkillNote[]; stater: string; readerPrincipal?: string }) {
  const { skill, ...rest } = a;
  return (await saveHeldNote({ kind: "skill", ...rest, topic: skill })).kind;
}

describe("heldNote (skill)", () => {
  describe("saveSkillNote — the first note on a skill", () => {
    it("makes ONE held claim in the vault holding the record: heldParty → the person, skill → the skill, the note, statedBy → the adder's own card (a card in their own vault, not the vault written to), the self read grant; ⛔ no rung, ⛔ no note tier", async () => {
      const personBefore = JSON.stringify(store.get(tom)!.facts);
      const kind = await saveSkillNote({ vaultId: VAULT, subject: uriOf(tom), skill: NURSING, text: "  ICU night shifts, 8 years  ", existing: [], stater: SELF, readerPrincipal: AGENT });
      expect(kind).toBe("create");
      expect(claims()).toHaveLength(1);
      const [, c] = claims()[0]!;
      expect(c.facts).toEqual({
        "a:heldParty": { "@id": uriOf(tom) },
        "a:skill": { "@id": NURSING },
        "a:skillDepthNote": "ICU night shifts, 8 years",
        "a:statedBy": { "@id": SELF },
        "a:directReader": AGENT,
      });
      expect(fake.createRecord.mock.calls[0]![0]).toBe(VAULT);
      // ⛔ The person's own record is not written: the note is not one of its values.
      expect(JSON.stringify(store.get(tom)!.facts)).toBe(personBefore);
      expect(fake.patchRecord).not.toHaveBeenCalled();
    });

    it("an empty note on a skill with none writes nothing", async () => {
      expect(await saveSkillNote({ vaultId: VAULT, subject: uriOf(tom), skill: NURSING, text: "   ", existing: [], stater: SELF })).toBe("none");
      expect(fake.createRecord).not.toHaveBeenCalled();
    });

    it("refuses with no vault, no person, no skill or no stater, before any write", async () => {
      for (const a of [
        { vaultId: "", subject: uriOf(tom), skill: NURSING, stater: SELF },
        { vaultId: VAULT, subject: "", skill: NURSING, stater: SELF },
        { vaultId: VAULT, subject: uriOf(tom), skill: "", stater: SELF },
        { vaultId: VAULT, subject: uriOf(tom), skill: NURSING, stater: "" },
      ])
        await expect(saveSkillNote({ ...a, text: "x", existing: [] as HeldSkillNote[] })).rejects.toBeInstanceOf(SkillNoteError);
      expect(fake.createRecord).not.toHaveBeenCalled();
    });

    it("⛔ never writes under a guessed key: a term the master does not name refuses the write", async () => {
      fake.attributeSpelling.mockImplementation(async (name: string) => (name === "skillDepthNote" ? null : name) as string);
      await expect(saveSkillNote({ vaultId: VAULT, subject: uriOf(tom), skill: NURSING, text: "x", existing: [], stater: SELF })).rejects.toBeInstanceOf(
        SkillNoteVocabUnavailableError,
      );
      expect(fake.createRecord).not.toHaveBeenCalled();
    });
  });

  describe("saveSkillNote — a skill that has a note", () => {
    it("a changed note amends the SAME claim (no second claim)", async () => {
      await saveSkillNote({ vaultId: VAULT, subject: uriOf(tom), skill: NURSING, text: "first", existing: [], stater: SELF });
      const existing = notesForSkill(await notesOf(tom), NURSING);
      expect(await saveSkillNote({ vaultId: VAULT, subject: uriOf(tom), skill: NURSING, text: "second", existing, stater: SELF })).toBe("patch");
      expect(claims()).toHaveLength(1);
      expect(claims()[0]![1].facts["a:skillDepthNote"]).toBe("second");
      expect(claims()[0]![1].facts["a:skill"]).toEqual({ "@id": NURSING });
    });

    it("emptying the note retracts the NOTE only; the claim and its skill stay", async () => {
      await saveSkillNote({ vaultId: VAULT, subject: uriOf(tom), skill: NURSING, text: "first", existing: [], stater: SELF });
      const existing = notesForSkill(await notesOf(tom), NURSING);
      expect(await saveSkillNote({ vaultId: VAULT, subject: uriOf(tom), skill: NURSING, text: "", existing, stater: SELF })).toBe("clear");
      expect(claims()).toHaveLength(1);
      expect("a:skillDepthNote" in claims()[0]![1].facts).toBe(false);
      expect(claims()[0]![1].facts["a:skill"]).toEqual({ "@id": NURSING });
      expect(fake.deleteRecord).not.toHaveBeenCalled();
    });

    it("the same note again writes nothing", async () => {
      await saveSkillNote({ vaultId: VAULT, subject: uriOf(tom), skill: NURSING, text: "first", existing: [], stater: SELF });
      const existing = notesForSkill(await notesOf(tom), NURSING);
      expect(await saveSkillNote({ vaultId: VAULT, subject: uriOf(tom), skill: NURSING, text: " first ", existing, stater: SELF })).toBe("none");
      expect(fake.patchRecord).not.toHaveBeenCalled();
    });
  });

  describe("listHeldSkillNotesInVault + skillNotesAbout — what a card shows", () => {
    it("only this person's notes: ⛔ not another person's, ⛔ not a claim about two people, ⛔ not a held claim of another field", async () => {
      const mine = fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "Tom's" });
      fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(ann) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "Ann's" });
      fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": [{ "@id": uriOf(tom) }, { "@id": uriOf(ann) }], "a:skill": { "@id": NURSING }, "a:skillDepthNote": "both" });
      fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:email": "tom@example.com" });
      const got = await notesOf(tom);
      expect(got.map((n) => [n.id, n.topic, n.note])).toEqual([[mine, NURSING, "Tom's"]]);
    });

    it("every note about the person is shown whoever stated it (another adder's, an old vault card's, one with no stater); only the VIEWER's own is theirs to change", async () => {
      const mine = fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "mine" });
      const theirs = fake.seed("t:HeldPartyFieldClaim", { "a:statedBy": { "@id": uriOf(ann) }, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "imported" });
      const none = fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "source not recorded" });
      expect((await notesOf(tom)).map((n) => [n.id, n.note])).toEqual([[mine, "mine"], [theirs, "imported"], [none, "source not recorded"]].sort((a, b) => (a[0]! < b[0]! ? -1 : 1)));
      expect(ownHeldNotes(await notesOf(tom), SELF).map((n) => [n.id, n.note])).toEqual([[mine, "mine"]]);
      expect(ownHeldNotes(await notesOf(tom), null)).toEqual([]);
    });

    it("the person is found under both of the IRI's spellings (`/base/e/` and `/vault/e/`)", async () => {
      fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": `https://hytta.platform.example.test/vault/e/${tom}` }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "a" });
      fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": SELL }, "a:skillDepthNote": "b" });
      expect((await notesOf(tom)).map((n) => n.note)).toEqual(["a", "b"]);
    });

    it("⚠ known limit (Delta7 B2): a claim naming the person by the CURIE `base:e/<id>` is not found by the per-person find", async () => {
      // The platform's find matches the stored value exactly; the CURIE carries no host to ask under.
      fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": `base:e/${tom}` }, "a:skill": { "@id": SELL }, "a:skillDepthNote": "b" });
      expect(await notesOf(tom)).toEqual([]);
    });

    // Agent.Scaling Delta8 F6 (Delta7 F3): a claim deleted between the find and its read (the store answers
    // 404, `readRecord` → null) hides ONLY that claim; any other failure still fails the whole read.
    it("a claim gone between the find and its read (404) is skipped: the person's other notes still show", async () => {
      const gone = fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "a" });
      fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": SELL }, "a:skillDepthNote": "b" });
      const impl = fake.readRecord.getMockImplementation()!;
      fake.readRecord.mockImplementation(async (id: string, at: string | null) => (id === gone ? null : impl(id, at)));
      try {
        expect((await notesOf(tom)).map((n) => [n.topic, n.note])).toEqual([[SELL, "b"]]);
      } finally {
        fake.readRecord.mockImplementation(impl);
      }
    });

    it("a claim whose read FAILS (not a 404) fails the read (⛔ never shown as 'no note')", async () => {
      fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "a" });
      fake.readRecord.mockRejectedValueOnce(new Error("503 Service Unavailable"));
      await expect(listHeldNotesAbout("skill", VAULT, uriOf(tom))).rejects.toThrow(/503/);
    });

    it("a claim served with NO facts (a 200 that carries nothing) fails the read", async () => {
      const id = fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "a" });
      fake.readRecord.mockResolvedValueOnce({ id, entityUri: uriOf(id), typeUri: "t:HeldPartyFieldClaim", facts: {}, servedKeys: [], etag: '"1"', served: { facts: {}, context: undefined, etag: '"1"' } });
      await expect(listHeldNotesAbout("skill", VAULT, uriOf(tom))).rejects.toBeInstanceOf(SkillNoteError);
    });

    it("the claim type is a card part, ⛔ not a register row", async () => {
      await listHeldNotesAbout("skill", VAULT, uriOf(tom));
      expect(isCardPartType("t:HeldPartyFieldClaim")).toBe(true);
    });
  });

  describe("removeSkillNotes — the skill left the card", () => {
    it("deletes only the claims named: this person's, this skill's; Ann's and Tom's other skill stay", async () => {
      fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "t-n" });
      const keepSkill = fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": SELL }, "a:skillDepthNote": "t-s" });
      const keepAnn = fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(ann) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "a-n" });
      await removeSkillNotes(VAULT, notesForSkill(await notesOf(tom), NURSING));
      expect(claims().map(([id]) => id).sort()).toEqual([keepSkill, keepAnn].sort());
    });

    it("refuses with no vault", async () => {
      await expect(removeSkillNotes("", [])).rejects.toBeInstanceOf(SkillNoteError);
    });
  });

  describe("planSkillNoteWrite / noteSurvived — the pure rules", () => {
    const claim = { id: "1", uri: "u", heldParties: ["p"], topic: NURSING, note: "a", statedBy: ["s"] };
    it("plans create, patch, clear and none", () => {
      expect(planSkillNoteWrite([], "x").kind).toBe("create");
      expect(planSkillNoteWrite([], "").kind).toBe("none");
      expect(planSkillNoteWrite([claim], "b").kind).toBe("patch");
      expect(planSkillNoteWrite([claim], " ").kind).toBe("clear");
      expect(planSkillNoteWrite([claim], "a ").kind).toBe("none");
    });
    it("a note survived only when the read-back carries it", () => {
      expect(noteSurvived([claim], "a")).toBe(true);
      expect(noteSurvived([claim], "b")).toBe(false);
      expect(noteSurvived([], "b")).toBe(false);
      expect(noteSurvived([], "")).toBe(true);
      expect(noteSurvived([{ ...claim, note: "" }], "")).toBe(true);
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Agent.Scaling Delta7 B2 — the read is per PERSON (the platform's find-by-attribute on a:heldParty),
// narrowed to the card's vault, read 6 at a time; after a write only the claim written is read again.
// ───────────────────────────────────────────────────────────────────────────────────────────────────────
describe("Delta7 B2: the read grows with the person, ⛔ not with the vault", () => {
  /** N held claims about OTHER people in the vault (the cost Delta7 measured). */
  function crowd(n: number) {
    for (let i = 0; i < n; i++) {
      const other = fake.seed("t:Person", { "a:givenName": `P${i}` });
      fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(other) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": `n${i}` });
    }
  }

  it("at N = 100 other notes in the vault, reading Tom's card is 2 finds (both spellings) + 1 read, ⛔ not 5 lists + 100 reads", async () => {
    crowd(100);
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "Tom's" });
    fake.findByAttribute.mockClear();
    fake.readRecord.mockClear();
    const got = await notesOf(tom);
    expect(got.map((n) => n.note)).toEqual(["Tom's"]);
    expect(fake.requestCount()).toEqual({ find: 2, read: 1, list: 0, write: 0 });
  });

  it("the same at N = 10 and N = 1000: the count does not move with the vault", async () => {
    for (const n of [10, 1000]) {
      fake.resetStore();
      __resetSkillNoteVocab();
      tom = fake.seed("t:Person", { "a:givenName": "Tom" });
      SELF = ADDER_CARD;
      BY = { "a:statedBy": { "@id": SELF } };
      crowd(n);
      fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "Tom's" });
      fake.findByAttribute.mockClear();
      fake.readRecord.mockClear();
      expect((await notesOf(tom)).length).toBe(1);
      expect(fake.requestCount()).toMatchObject({ find: 2, read: 1 });
    }
  });

  it("a person with more claims than one page of the find (250) is read whole, page by page", async () => {
    for (let i = 0; i < 250; i++) fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:email": `t${i}@x.no` });
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "last" });
    fake.findByAttribute.mockClear();
    expect((await notesOf(tom)).map((n) => n.note)).toEqual(["last"]);
    // 2 pages for the stored spelling, 1 (empty) for the other.
    expect(fake.findByAttribute.mock.calls.length).toBe(3);
  });

  it("⛔ a claim about Tom held in ANOTHER vault is not this card's (the find spans every readable vault)", async () => {
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "elsewhere" }, undefined, "https://other.platform.example.test/base");
    expect(await notesOf(tom)).toEqual([]);
    expect(fake.readRecord).not.toHaveBeenCalled();
  });

  it("readHeldClaim reads ONE claim: the note as kept, null once deleted", async () => {
    const id = fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "x" });
    fake.readRecord.mockClear();
    expect(await readHeldClaim("skill", VAULT, { id, uri: uriOf(id) })).toMatchObject({ id, topic: NURSING, note: "x" });
    store.delete(id);
    expect(await readHeldClaim("skill", VAULT, { id, uri: uriOf(id) })).toBeNull();
    expect(fake.readRecord).toHaveBeenCalledTimes(2);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Kai, 2026-10-15: "when writing a local card, it is ot shared" — a held claim carries no rung and no claim
// subject, the two things that put a claim into the BaseConnect find index (investigation R2).
// ───────────────────────────────────────────────────────────────────────────────────────────────────────
describe("a held claim is never shared", () => {
  it("every claim written (skill note, interest, interest note) carries ⛔ no a:visibilityTier and ⛔ no a:claimSubject", async () => {
    await saveSkillNote({ vaultId: VAULT, subject: uriOf(tom), skill: NURSING, text: "x", existing: [], stater: SELF, readerPrincipal: AGENT });
    await addHeldTopic({ kind: "interest", vaultId: VAULT, subject: uriOf(tom), topic: PHOTO, existing: [], stater: SELF, readerPrincipal: AGENT });
    const [i] = await notesOf(tom, "interest");
    await saveHeldNote({ kind: "interest", vaultId: VAULT, subject: uriOf(tom), topic: PHOTO, text: "night shots", existing: [i!], stater: SELF });
    expect(claims()).toHaveLength(2);
    for (const [, c] of claims()) {
      expect(Object.keys(c.facts).some((k) => /visibilityTier|claimSubject/.test(k))).toBe(false);
      expect(c.facts["a:heldParty"]).toEqual({ "@id": uriOf(tom) });
    }
  });

  it("the one composer refuses a rung or a claim subject", async () => {
    const v = await resolveHeldNoteVocab("interest");
    expect(() => heldClaimFacts({ ...v, note: "a:visibilityTier" }, { subject: "s", topic: PHOTO, note: "x", stater: SELF })).toThrow(SkillNoteError);
    expect(() => heldClaimFacts({ ...v, statedBy: "a:claimSubject" }, { subject: "s", topic: PHOTO, note: "", stater: SELF })).toThrow(SkillNoteError);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Kai, 2026-10-15 (reverses R153): interests on a held person card, the skill's code with
// a:topicInterest + a:topicInterestNote (Agent.Concept §2b). The claim IS the card's interest: the term
// is not a field of the person, so nothing is written on the person's record.
// ───────────────────────────────────────────────────────────────────────────────────────────────────────
describe("heldNote (interest)", () => {
  it("adding an interest makes ONE held claim: heldParty, topicInterest, statedBy (the adder's own card), the read grant, and NO a:visibilityTier (shared with the vault); no note yet; the person untouched", async () => {
    const before = JSON.stringify(store.get(tom)!.facts);
    const res = await addHeldTopic({ kind: "interest", vaultId: VAULT, subject: uriOf(tom), topic: PHOTO, existing: [], stater: SELF, readerPrincipal: AGENT });
    expect(res.kind).toBe("create");
    expect(claims()).toHaveLength(1);
    expect(claims()[0]![1].facts).toEqual({
      "a:heldParty": { "@id": uriOf(tom) },
      "a:topicInterest": { "@id": PHOTO },
      "a:statedBy": { "@id": SELF },
      "a:directReader": AGENT,
    });
    expect(JSON.stringify(store.get(tom)!.facts)).toBe(before);
    // Adding it again keeps the one claim.
    const again = await addHeldTopic({ kind: "interest", vaultId: VAULT, subject: uriOf(tom), topic: PHOTO, existing: await notesOf(tom, "interest"), stater: SELF });
    expect(again.kind).toBe("none");
    expect(claims()).toHaveLength(1);
  });

  it("the note goes on the SAME claim as a:topicInterestNote; emptying it keeps the interest", async () => {
    await addHeldTopic({ kind: "interest", vaultId: VAULT, subject: uriOf(tom), topic: PHOTO, existing: [], stater: SELF });
    const existing = await notesOf(tom, "interest");
    expect((await saveHeldNote({ kind: "interest", vaultId: VAULT, subject: uriOf(tom), topic: PHOTO, text: " Long exposures ", existing, stater: SELF })).kind).toBe("patch");
    expect(claims()).toHaveLength(1);
    expect(claims()[0]![1].facts["a:topicInterestNote"]).toBe("Long exposures");
    expect("a:skillDepthNote" in claims()[0]![1].facts).toBe(false);
    await saveHeldNote({ kind: "interest", vaultId: VAULT, subject: uriOf(tom), topic: PHOTO, text: "", existing: await notesOf(tom, "interest"), stater: SELF });
    expect(claims()[0]![1].facts["a:topicInterest"]).toEqual({ "@id": PHOTO });
    expect("a:topicInterestNote" in claims()[0]![1].facts).toBe(false);
  });

  it("an interest is ⛔ never read as a skill, and a skill never as an interest", async () => {
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:skill": { "@id": NURSING }, "a:skillDepthNote": "s" });
    fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(tom) }, "a:topicInterest": { "@id": PHOTO }, "a:topicInterestNote": "i" });
    expect((await notesOf(tom, "skill")).map((n) => [n.topic, n.note])).toEqual([[NURSING, "s"]]);
    expect((await notesOf(tom, "interest")).map((n) => [n.topic, n.note])).toEqual([[PHOTO, "i"]]);
  });

  it("removing the interest deletes its claim only", async () => {
    await addHeldTopic({ kind: "interest", vaultId: VAULT, subject: uriOf(tom), topic: PHOTO, existing: [], stater: SELF });
    const keep = fake.seed("t:HeldPartyFieldClaim", { ...BY, "a:heldParty": { "@id": uriOf(ann) }, "a:topicInterest": { "@id": PHOTO } });
    await removeSkillNotes(VAULT, notesForSkill(await notesOf(tom, "interest"), PHOTO), "interest");
    expect(claims().map(([id]) => id)).toEqual([keep]);
  });

  it("a term the master does not name makes INTEREST unavailable and leaves skills working", async () => {
    fake.attributeSpelling.mockImplementation(async (name: string) => (name === "topicInterestNote" ? null : name) as string);
    await expect(addHeldTopic({ kind: "interest", vaultId: VAULT, subject: uriOf(tom), topic: PHOTO, existing: [], stater: SELF })).rejects.toBeInstanceOf(SkillNoteVocabUnavailableError);
    expect(await saveSkillNote({ vaultId: VAULT, subject: uriOf(tom), skill: NURSING, text: "still fine", existing: [], stater: SELF })).toBe("create");
  });
});
