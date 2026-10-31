/**
 * A holder's held claim about one generic category of a person (a skill or an
 * interest) and its free-text note: the store, React-free, ONE module for both kinds. `useHeldNotes.ts` is its loading state.
 * The skill and the interest share every rule.
 *
 * THE SHAPE is the ontology owner's ruling (skill, interest):
 *   one `t:HeldPartyFieldClaim` per (person, category), in the vault that HOLDS the person's record, with
 *     `a:heldParty` → { "@id": the person's record }
 *     `a:skill` | `a:topicInterest` → { "@id": the catalogue term }   (the claim's ONE field)
 *     `a:skillDepthNote` | `a:topicInterestNote` → "the holder's free text"   (a qualifier, ⛔ not a 2nd field)
 *     `a:statedBy` → { "@id": the ADDER's own card, in their own landing vault }   (the source is the adder)
 *   and `a:directReader` → the signed-in principal at mint (the self read-back grant).
 *
 * 🔴 NOT FOUND BY THE NETWORK. A held claim carries ⛔ no `a:visibilityTier` and ⛔ no `a:claimSubject`: those two are
 * what puts a claim into the BaseConnect find index (the global-search investigation). {@link heldClaimFacts} refuses
 * both. With no tier row the claim is SHARED WITH THE VAULT by default (held details are shared with everyone who can read
 * the vault; the per-detail private switch is a later step). `a:statedBy` names the source and grants nothing.
 *
 * READ: ⛔ no longer the whole vault, one GET at a time. The platform's
 * per-person find (`GET /base/find-by-attribute?attr=a:heldParty&value={"@id":…}`, the grant plane:
 * signed-in, only what the reader may read) names the claims about THIS person; only the ones in the
 * card's vault are kept; they are read 6 at a time (`readResources`). After a write only the claim
 * written is read again ({@link readHeldClaimDoc}).
 *   - 🔴 the find is asked at the CARD'S VAULT HOST (`vaultOriginOf`), ⛔ never the apex. The
 *     route has no crossing; at the apex it reads only the `base` DB, and every vault minted since
 *     2026-08-20 is in `base_pods`, so the apex answered "none" with no error.
 *   - ONE read per (vault, person) for both kinds ({@link listHeldClaimsAbout}); each kind keeps
 *     its own claims from it ({@link heldNotesOfKind}).
 *   - a claim deleted between the find and its read (404) is skipped; any other failure, or a
 *     document served with nothing, still fails the read.
 */
import { pageAllByAttribute } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { idFromResourceUri } from "@kaigilb/gilbplatformcode-resource-id";
import { isStatedBy } from "@kaigilb/gilbplatformcode-stated-by";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import {
  createResource,
  deleteResource,
  getResource,
  patchResource,
  readResources,
  type FactValue,
  type ReadResource,
} from "@kaigilb/gilbplatformcode-vault-resources";
import { DIRECT_READER } from "./directReader";
import { isPrivateDoc, refuseGrantKeys } from "./heldDetailMark";
import { resolveHeldNoteVocab, resolveHeldPartyAttr, type HeldNoteKind, type ResolvedHeldNoteVocab } from "./heldNoteVocab";

/** One held claim carrying a category (and perhaps its note), as read from the vault. */
export interface HeldNote {
  /** The opaque record id. */
  id: string;
  /** The entity URI. */
  uri: string;
  /** Whom the claim is about (`a:heldParty`), every value read. */
  heldParties: string[];
  /** The category (`a:skill` / `a:topicInterest`): the reference's IRI, or a literal another app wrote. */
  topic: string;
  /** The note, "" when the claim carries none. */
  note: string;
  /** Who stated the claim (`a:statedBy`), every value read. */
  statedBy: string[];
  /** The adder set it to private: `a:visibilityTier` = `private`. Only they see it. */
  isPrivate?: boolean;
}

export class HeldNoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HeldNoteError";
  }
}

function firstString(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    const s = v.find((x) => typeof x === "string");
    return typeof s === "string" ? s : "";
  }
  return "";
}

function refOrText(v: unknown): string[] {
  const one = (x: unknown): string | null => {
    if (typeof x === "string") return x;
    if (x && typeof x === "object" && typeof (x as { "@id"?: unknown })["@id"] === "string") return (x as { "@id": string })["@id"];
    return null;
  };
  const raw = Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
  return raw.map(one).filter((x): x is string => x !== null);
}

/** A served document's value under a stored key, read under either spelling (Base frames one `a:` off). */
function pick(doc: Record<string, unknown>, stored: string): unknown {
  const wire = stored.startsWith("a:") ? stored.slice(2) : stored;
  return doc[stored] ?? doc[wire];
}

/** One served document as a held note of this kind, or null when it carries no such category. */
export function toHeldNote(id: string, uri: string, doc: Record<string, unknown>, vocab: ResolvedHeldNoteVocab): HeldNote | null {
  const topic = refOrText(pick(doc, vocab.topic))[0];
  if (!topic) return null;
  return {
    id,
    uri,
    heldParties: refOrText(pick(doc, vocab.heldParty)),
    topic,
    note: firstString(pick(doc, vocab.note)),
    statedBy: refOrText(pick(doc, vocab.statedBy)),
    isPrivate: isPrivateDoc(doc),
  };
}

/** The two spellings a person's record IRI is stored under (`/base/e/` and `/vault/e/`): the platform's
 *  find matches the stored value EXACTLY, so both are asked. */
export function subjectSpellings(subject: string): string[] {
  const out = [subject];
  if (subject.includes("/base/e/")) out.push(subject.replace("/base/e/", "/vault/e/"));
  else if (subject.includes("/vault/e/")) out.push(subject.replace("/vault/e/", "/base/e/"));
  return out;
}

/** The page the per-person find is asked in (the platform's cap is 200, `ATTR_FIND_PAGE_MAX`). */
export const HELD_FIND_PAGE = 200;
/** Pages read before the read FAILS (⛔ never a silent cut). */
export const HELD_FIND_MAX_PAGES = 10;

function hostOf(uri: string): string | null {
  try {
    return new URL(uri).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Is this entity held in this vault? Under OwnNameOwnHost a vault is its host. */
export function inVault(entity: string, vaultId: string): boolean {
  const a = hostOf(entity);
  return a !== null && a === hostOf(vaultId);
}

/** Every entity the per-person find names for one spelling of the person, page by page, asked at `origin`. */
async function findAbout(attr: string, subject: string, origin: string): Promise<string[]> {
  const cap = HELD_FIND_MAX_PAGES * HELD_FIND_PAGE;
  const page = await pageAllByAttribute(attr, { "@id": subject }, origin, { pageSize: HELD_FIND_PAGE, cap });
  if (page.capped) {
    throw new HeldNoteError(`There are more held claims about this person than can be read (${cap}); none is shown rather than some.`);
  }
  return page.ids;
}

/** One held claim about the person as the vault served it, of ANY kind (the shared read's row). */
export type HeldClaimDoc = Pick<ReadResource, "id" | "uri" | "doc" | "typeUri">;

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * EVERY held claim about ONE person in ONE vault, of every kind, read off the store ONCE (the
 * Skills and Interests sections share it). The find is asked at the vault's own host. A claim
 * the store answers 404 for was deleted since the find and is skipped; any other failed read,
 * or a document served with no facts, FAILS the read (⛔ never shown as "no note").
 */
export async function listHeldClaimsAbout(vaultId: string, subject: string): Promise<HeldClaimDoc[]> {
  if (!vaultId || !subject) return [];
  const heldParty = await resolveHeldPartyAttr();
  const origin = vaultOriginOf(vaultId);
  const found = new Set<string>();
  for (const spelling of subjectSpellings(subject)) for (const id of await findAbout(heldParty, spelling, origin)) found.add(id);
  const mine = [...found].filter((e) => inVault(e, vaultId));
  const read = await readResources(mine, vaultId);
  const out: HeldClaimDoc[] = [];
  for (const r of read) {
    if (r.gone) continue;
    if (Object.keys(r.doc).length === 0) throw new HeldNoteError(`A held note (${r.id}) did not read.`);
    out.push({ id: r.id, uri: r.uri, doc: r.doc, ...(r.typeUri ? { typeUri: r.typeUri } : {}) });
  }
  // Stable by id (mint order), ⛔ never the find's order.
  return out.sort(byId);
}

/** The held notes of ONE kind among a person's held claims (a claim of another kind is ⛔ not one). */
export function heldNotesOfKind(claims: readonly HeldClaimDoc[], vocab: ResolvedHeldNoteVocab): HeldNote[] {
  const out: HeldNote[] = [];
  for (const c of claims) {
    const n = toHeldNote(c.id, c.uri, c.doc, vocab);
    if (n) out.push(n);
  }
  return out.sort(byId);
}

/** The held claims of ONE kind about ONE person in ONE vault (the shared read, kept to this kind). */
export async function listHeldNotesAbout(kind: HeldNoteKind, vaultId: string, subject: string): Promise<HeldNote[]> {
  if (!vaultId || !subject) return [];
  const vocab = await resolveHeldNoteVocab(kind);
  return heldNotesOfKind(await listHeldClaimsAbout(vaultId, subject), vocab);
}

/**
 * Read ONE claim again after a write (⛔ not the whole person, ⛔ not the vault), as served.
 * `null` when the store no longer holds it (a delete, confirmed) or serves nothing of it.
 */
export async function readHeldClaimDoc(vaultId: string, claim: { id: string; uri: string }): Promise<HeldClaimDoc | null> {
  const { doc, typeUri } = await getResource(claim.id, vaultId, claim.uri);
  if (Object.keys(doc).length === 0) return null;
  return { id: claim.id, uri: claim.uri, doc, ...(typeUri ? { typeUri } : {}) };
}

/**
 * {@link readHeldClaimDoc} as ONE kind's note: `null` when gone; the note otherwise; `"other"` when the
 * document carries no category of this kind (the store kept something else).
 */
export async function readHeldClaim(
  kind: HeldNoteKind,
  vaultId: string,
  claim: { id: string; uri: string },
): Promise<HeldNote | null | "other"> {
  const vocab = await resolveHeldNoteVocab(kind);
  const got = await readHeldClaimDoc(vaultId, claim);
  if (!got) return null;
  return toHeldNote(got.id, got.uri, got.doc, vocab) ?? "other";
}

const sameEntity = (a: string, b: string) => idFromResourceUri(a) === idFromResourceUri(b);

/**
 * Every claim about ONE record, whoever stated it: the platform decides who may read a claim, so the card shows
 * what it returns. A claim about two parties is ⛔ not this card's. Which of them the viewer may change is {@link ownHeldNotes}.
 */
export function heldNotesAbout(notes: readonly HeldNote[], subject: string): HeldNote[] {
  if (!subject) return [];
  return notes.filter((n) => n.heldParties.length === 1 && sameEntity(n.heldParties[0]!, subject));
}

/**
 * The claims THIS viewer stated (their own card is the one `a:statedBy`): the only ones they may edit or delete, so one adder never
 * changes another's. A claim an old vault card stated, or another person, is read and never changed here.
 */
export function ownHeldNotes(notes: readonly HeldNote[], card: string | null | undefined): HeldNote[] {
  return notes.filter((n) => isStatedBy(n.statedBy, card, n.uri));
}

/** The claims for one category out of a card's claims (the first is the one edited). */
export function notesForTopic(notes: readonly HeldNote[], topic: string): HeldNote[] {
  return notes.filter((n) => n.topic === topic);
}

/** What one save will do, decided from what the vault holds (pure, so the rule is tested alone). */
export type HeldNoteWrite =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "patch"; claim: HeldNote }
  | { kind: "clear"; claim: HeldNote };

export function planHeldNoteWrite(existing: readonly HeldNote[], text: string): HeldNoteWrite {
  const next = text.trim();
  const claim = existing[0];
  if (!claim) return next === "" ? { kind: "none" } : { kind: "create" };
  if (claim.note.trim() === next) return { kind: "none" };
  // Emptying the note retracts the NOTE only. ⛔ The claim is not deleted for it: its field is the category.
  return next === "" ? { kind: "clear", claim } : { kind: "patch", claim };
}

/**
 * 🔴 The facts of a NEW held claim — the ONE composer, so the not-shared rule has one home. ⛔ Refuses a
 * rung or a claim subject: either would make a holder's local card findable by the network.
 */
export function heldClaimFacts(
  vocab: ResolvedHeldNoteVocab,
  args: { subject: string; topic: string; note: string; stater: string; readerPrincipal?: string | null },
): Record<string, FactValue> {
  const facts: Record<string, FactValue> = {
    [vocab.heldParty]: { "@id": args.subject },
    [vocab.topic]: { "@id": args.topic },
    [vocab.statedBy]: { "@id": args.stater },
  };
  if (args.note) facts[vocab.note] = args.note;
  const reader = args.readerPrincipal?.trim();
  if (reader) facts[DIRECT_READER] = reader;
  refuseGrantKeys(facts, (m) => new HeldNoteError(m), "a new note is shared with the vault by default and carries no tier.");
  return facts;
}

function refuseWithout(kind: HeldNoteKind, vaultId: string, stater: string, subject: string, topic: string): void {
  if (!vaultId) throw new HeldNoteError(`Refusing to write a ${kind} note with no vault named.`);
  if (!stater) throw new HeldNoteError(`Refusing to write a ${kind} note with no stater: it would read 'source not recorded'.`);
  if (!subject) throw new HeldNoteError(`Refusing to write a ${kind} note about no one.`);
  if (!topic) throw new HeldNoteError(`Refusing to write a ${kind} note with no ${kind}.`);
}

/** What a write did, and which claim it touched (so only THAT claim is read again). */
export type HeldNoteWriteResult =
  | { kind: "none" }
  | { kind: "create" | "patch" | "clear"; claim: { id: string; uri: string } };

/**
 * Write the holder's note on one category of one person. Creates the claim on the first note, amends it
 * after, retracts the note when it is emptied. ⛔ Refuses without a vault, a stater, a person or a category.
 */
export async function saveHeldNote(args: {
  kind: HeldNoteKind;
  vaultId: string;
  subject: string;
  topic: string;
  text: string;
  existing: readonly HeldNote[];
  stater: string;
  readerPrincipal?: string | null;
}): Promise<HeldNoteWriteResult> {
  const { kind, vaultId, subject, topic, text, existing, stater } = args;
  refuseWithout(kind, vaultId, stater, subject, topic);
  const plan = planHeldNoteWrite(existing, text);
  if (plan.kind === "none") return { kind: "none" };
  const vocab = await resolveHeldNoteVocab(kind);
  const note = text.trim();
  if (plan.kind === "create") {
    const facts = heldClaimFacts(vocab, { subject, topic, note, stater, readerPrincipal: args.readerPrincipal });
    const created = await createResource(vaultId, { type: vocab.heldClaimType, facts });
    return { kind: "create", claim: { id: created.id, uri: created.location } };
  }
  await patchResource(plan.claim.id, { [vocab.note]: plan.kind === "clear" ? null : note }, vaultId, plan.claim.uri);
  return { kind: plan.kind, claim: { id: plan.claim.id, uri: plan.claim.uri } };
}

/**
 * Add one category to a person card as its own held claim, with no note yet (interests: the claim IS the
 * card's value, since `a:topicInterest` is not a field of the person). An existing claim for it is kept.
 */
export async function addHeldTopic(args: {
  kind: HeldNoteKind;
  vaultId: string;
  subject: string;
  topic: string;
  existing: readonly HeldNote[];
  stater: string;
  readerPrincipal?: string | null;
}): Promise<HeldNoteWriteResult> {
  const { kind, vaultId, subject, topic, existing, stater } = args;
  refuseWithout(kind, vaultId, stater, subject, topic);
  if (notesForTopic(existing, topic).length > 0) return { kind: "none" };
  const vocab = await resolveHeldNoteVocab(kind);
  const facts = heldClaimFacts(vocab, { subject, topic, note: "", stater, readerPrincipal: args.readerPrincipal });
  const created = await createResource(vaultId, { type: vocab.heldClaimType, facts });
  return { kind: "create", claim: { id: created.id, uri: created.location } };
}

/**
 * The category left the card: its held claims about this person go. Only the claims NAMED (the caller
 * hands {@link notesForTopic} of {@link heldNotesAbout}); ⛔ never another person's, ⛔ never another's.
 */
export async function removeHeldNotes(vaultId: string, claims: readonly HeldNote[], kind: HeldNoteKind = "skill"): Promise<void> {
  if (!vaultId) throw new HeldNoteError(`Refusing to remove a ${kind} note with no vault named.`);
  for (const c of claims) await deleteResource(c.id, vaultId, c.uri);
}

/** Did the store keep what the save asked for? */
export function heldNoteSurvived(after: readonly HeldNote[], text: string): boolean {
  const next = text.trim();
  const claim = after[0];
  if (!claim) return next === "";
  return claim.note.trim() === next;
}
