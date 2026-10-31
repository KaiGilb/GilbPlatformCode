/**
 * The spellings a holder's held claim about one generic category of a person
 * (a skill, or an interest) and its free-text note are written under, ASKED of the ontology master by
 * term name. ONE module for both kinds: a skill the person has and an interest the person has connect to the same ontology.
 *
 * The ontology owner's ruling:
 *   §2a skill    — `a:skill`         + `a:skillDepthNote`   on a `t:HeldPartyFieldClaim`
 *   §2b interest — `a:topicInterest` + `a:topicInterestNote` on the same claim type
 * each with `a:heldParty` → the person's record and `a:statedBy` → the ADDER's own card, in their own landing vault.
 *
 * ⛔ No spelling is typed here: each is the master's answer to its term's NAME (`termSlots.ts`). A term
 * the master does not answer makes THAT KIND unavailable (the other kind is not touched): a note is
 * ⛔ never written under a guessed key.
 *
 * ⚠ Not resolved, because GilbApp writes neither on a held claim: `a:visibilityTier` and
 * `a:claimSubject`: when writing a local card, it is not shared. A held claim stays in
 * the holder's vault, readable only by those the vault lets in; with no rung and no claim subject it can
 * never enter the BaseConnect find index (`heldNote.ts` pins it).
 */
import { attributeSpelling, typeSpelling } from "@kaigilb/gilbplatformcode-term-slots";
import { registerCardPartTypes } from "@kaigilb/gilbplatformcode-lws-vault-sets";

/** The two kinds of held category a person card carries a note on. */
export type HeldNoteKind = "skill" | "interest";

/** Each kind's two terms, by NAME (the question asked of the master). */
export const HELD_NOTE_TERMS: Readonly<Record<HeldNoteKind, { topic: string; note: string }>> = {
  skill: { topic: "skill", note: "skillDepthNote" },
  interest: { topic: "topicInterest", note: "topicInterestNote" },
};

export interface ResolvedHeldNoteVocab {
  kind: HeldNoteKind;
  /** `a:heldParty` — the person's record the claim is about (reference). */
  heldParty: string;
  /** `a:statedBy` — who stated the claim: the ADDER's own card, in their own landing vault, ⛔ not the holding vault's (reference). */
  statedBy: string;
  /** The claim's one field: `a:skill` or `a:topicInterest` (reference to the catalogue term). */
  topic: string;
  /** The holder's free text on that field: `a:skillDepthNote` or `a:topicInterestNote`. */
  note: string;
  /** CREATE form of the claim type (`t:HeldPartyFieldClaim`). */
  heldClaimType: string;
  /** QUERY form of the same (`HeldPartyFieldClaim`). */
  heldClaimTypeQuery: string;
}

export class HeldNoteVocabUnavailableError extends Error {
  constructor(kind: HeldNoteKind | "held", missing: readonly string[]) {
    super(`The ontology did not name ${missing.join(", ")}, so no ${kind} note can be read or written right now.`);
    this.name = "HeldNoteVocabUnavailableError";
  }
}

const TYPES = ["HeldPartyFieldClaim"] as const;

// A held claim is a part of a person card, ⛔ not a register row (F20, as the address claims). At MODULE
// LOAD, so a register opened before any person card already hides it.
registerCardPartTypes(TYPES);

const cached = new Map<HeldNoteKind, Promise<ResolvedHeldNoteVocab>>();
let heldPartyCached: Promise<string> | null = null;

/** Test seam — ⛔ never called by product code. */
export function __resetHeldNoteVocab(): void {
  cached.clear();
  heldPartyCached = null;
}

/**
 * The ONE spelling the shared per-person read needs (`a:heldParty`), apart from
 * either kind's terms: a card's Skills and Interests share one read, and a kind whose own terms the master
 * does not name must not stop the other kind's read. Cached on success only.
 */
export function resolveHeldPartyAttr(): Promise<string> {
  if (!heldPartyCached) {
    heldPartyCached = (async () => {
      const spelled = await attributeSpelling("heldParty");
      if (!spelled) throw new HeldNoteVocabUnavailableError("held", ["a/heldParty"]);
      return `a:${spelled}`;
    })().catch((e) => {
      heldPartyCached = null;
      throw e;
    });
  }
  return heldPartyCached;
}

/** One kind's vocabulary, from the master (cached on success only). */
export function resolveHeldNoteVocab(kind: HeldNoteKind): Promise<ResolvedHeldNoteVocab> {
  let p = cached.get(kind);
  if (!p) {
    const t = HELD_NOTE_TERMS[kind];
    const ATTRS = ["heldParty", "statedBy", t.topic, t.note] as const;
    p = (async () => {
      const [attrs, types] = await Promise.all([
        Promise.all(ATTRS.map((n) => attributeSpelling(n))),
        Promise.all(TYPES.map((n) => typeSpelling(n))),
      ]);
      const missing = [
        ...ATTRS.filter((_, i) => !attrs[i]).map((n) => `a/${n}`),
        ...TYPES.filter((_, i) => !types[i]).map((n) => `t/${n}`),
      ];
      if (missing.length > 0) throw new HeldNoteVocabUnavailableError(kind, missing);
      const heldClaimType = types[0]!;
      registerCardPartTypes([heldClaimType]);
      return {
        kind,
        heldParty: `a:${attrs[0]!}`,
        statedBy: `a:${attrs[1]!}`,
        topic: `a:${attrs[2]!}`,
        note: `a:${attrs[3]!}`,
        heldClaimType,
        heldClaimTypeQuery: heldClaimType.slice(2),
      };
    })().catch((e) => {
      cached.delete(kind);
      throw e;
    });
    cached.set(kind, p);
  }
  return p;
}
