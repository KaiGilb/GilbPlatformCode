/**
 * A kind-of-contact chip on a HELD record: ONE private `t:HeldPartyFieldClaim` per chip, in the vault that holds the record, and nothing else.
 * The shape is the ontology's own, minted and read back from the master.
 *
 *     `a:heldParty`      → { "@id": the contact's record }
 *     `a:circleLabel` | `a:relationshipKind` → { "@id": the catalogue entry }       (the claim's ONE field)
 *     `a:statedBy`       → { "@id": the ADDER's own card, in their own landing vault }   (the source is the adder, ⛔ not a grant)
 *     `a:claimSubject`   → { "@id": the HOLDER (the signed-in principal) }   (the tier row's holder, as t:ContactPrivateNote)
 *     `a:visibilityTier` → "private"
 *
 * 🔴 A LABEL NEVER GRANTS. In a circle app the same words are a circle MEMBERSHIP, which is a grant; here they are a label for the holder's own
 * knowing (not for their access levels, just for knowing what kind of contact they are). By construction:
 *   - the facts are an ALLOWLIST ({@link assertNeutralLabelFacts}), checked on every write: no membership, no reader group, no rung
 *     context or depth, no find key, no a:directReader and no a:directWriter (no grant predicate of any kind), and no tier but `private`;
 *   - NO grant predicate is written. The holder's own find missed a claim that had a private tier and NO `a:claimSubject` (the tier row had
 *     no holder, so it denied everyone). MEASURED on a scratch platform in a four-case table: private + `a:claimSubject` = holder is found,
 *     read, patched (200) and deleted (204) by the holder, and by nobody else. The guard refuses any claimSubject but the holder;
 *   - `a:visibilityTier "private"` is ALWAYS written. A value with no tier gets no projection row, so its reach would be "the vault's
 *     grants alone" and the first read grant on the vault would expose it. `private` is the narrowest
 *     rung and never posts to the find index; neither label term declares a find key.
 *   - this module makes no network call of its own and imports no membership, rung or grant module (a test pins it).
 *
 * Holder-only and never found: the contact's own cards and finds never read these claims, and no label is a find key.
 */
import { createResource, deleteResource, type FactValue } from "@kaigilb/gilbplatformcode-vault-resources";
import { attributeSpelling, typeSpelling } from "@kaigilb/gilbplatformcode-term-slots";
import { registerCardPartTypes } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import type { HeldClaimDoc } from "@kaigilb/gilbplatformcode-held-notes";
import { sameIri } from "@kaigilb/gilbplatformcode-stated-by";
import type { CatalogueEntry, LabelAxis } from "@kaigilb/gilbplatformcode-contact-kind-model";

export class ContactLabelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContactLabelError";
  }
}

export class ContactLabelVocabUnavailableError extends Error {
  constructor(missing: readonly string[]) {
    super(`The ontology did not name ${missing.join(", ")}, so no kind of contact can be read or written right now.`);
    this.name = "ContactLabelVocabUnavailableError";
  }
}

/** The ONE tier a label is written at. */
export const PRIVATE_TIER = "private";

/** The spellings a label claim is written under, ASKED of the master by term name (⛔ none typed here). */
export interface ContactLabelVocab {
  heldParty: string;
  statedBy: string;
  circleLabel: string;
  relationshipKind: string;
  visibilityTier: string;
  /** The tier row's holder (`a:claimSubject`): what lets the private row admit the holder (and nobody else). */
  claimSubject: string;
  heldClaimType: string;
}

/** What READING the chips of a contact needs: no write term. Four attribute documents and the claim type (the find's own `a:heldParty` is shared). */
export type ContactLabelReadVocab = Pick<ContactLabelVocab, "heldParty" | "statedBy" | "claimSubject" | "circleLabel" | "relationshipKind" | "heldClaimType">;

// `claimSubject` is READ too: a chip is private to its claim subject (the principal), and that, not `statedBy`, is whose chip it is to change.
const READ_ATTRS = ["heldParty", "statedBy", "claimSubject", "circleLabel", "relationshipKind"] as const;
const WRITE_ATTRS = ["visibilityTier"] as const;
let cachedHeldType: Promise<string> | null = null;
let cachedRead: Promise<ContactLabelReadVocab> | null = null;
let cached: Promise<ContactLabelVocab> | null = null;

/** Test seam — ⛔ never called by product code. */
export function __resetContactLabelVocab(): void {
  cached = null;
  cachedRead = null;
  cachedHeldType = null;
}

/**
 * The record type a held claim is written under, asked of the master (ONE type document, kept for the session). It is what tells a chip's claim from
 * the note records that carry the same `a:heldParty` WITHOUT reading the label terms first: a card with only a note pays this one read, not seven
 * (so a card pays one read, not seven). A held claim is a part of a person card, ⛔ not a register row, so it is registered as one.
 */
export function resolveHeldClaimType(): Promise<string> {
  cachedHeldType ??= (async () => {
    const t = await typeSpelling("HeldPartyFieldClaim");
    if (!t) throw new ContactLabelVocabUnavailableError(["t/HeldPartyFieldClaim"]);
    registerCardPartTypes([t]);
    return t;
  })().catch((e) => {
    cachedHeldType = null;
    throw e;
  });
  return cachedHeldType;
}

/** The terms a chip is READ with: asked when a claim of the held type exists about the contact, or the chooser is opened. */
export function resolveContactLabelReadVocab(): Promise<ContactLabelReadVocab> {
  cachedRead ??= (async () => {
    const [attrs, heldClaimType] = await Promise.all([Promise.all(READ_ATTRS.map((n) => attributeSpelling(n))), resolveHeldClaimType()]);
    const missing = READ_ATTRS.filter((_, i) => !attrs[i]).map((n) => `a/${n}`);
    if (missing.length > 0) throw new ContactLabelVocabUnavailableError(missing);
    return {
      heldParty: `a:${attrs[0]!}`,
      statedBy: `a:${attrs[1]!}`,
      claimSubject: `a:${attrs[2]!}`,
      circleLabel: `a:${attrs[3]!}`,
      relationshipKind: `a:${attrs[4]!}`,
      heldClaimType,
    };
  })().catch((e) => {
    cachedRead = null;
    throw e;
  });
  return cachedRead;
}

/** The terms a chip is WRITTEN with: the read terms and the two a private row needs. Asked when a chip is added, ⛔ not when a card opens. */
export function resolveContactLabelVocab(): Promise<ContactLabelVocab> {
  cached ??= (async () => {
    const [read, attrs] = await Promise.all([resolveContactLabelReadVocab(), Promise.all(WRITE_ATTRS.map((n) => attributeSpelling(n)))]);
    const missing = WRITE_ATTRS.filter((_, i) => !attrs[i]).map((n) => `a/${n}`);
    if (missing.length > 0) throw new ContactLabelVocabUnavailableError(missing);
    return { ...read, visibilityTier: `a:${attrs[0]!}` };
  })().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}

/** The last segment of a type, however spelled (`t:HeldPartyFieldClaim`, `…/t/HeldPartyFieldClaim`). */
const typeTail = (t: string): string => t.slice(Math.max(t.lastIndexOf("/"), t.lastIndexOf(":")) + 1);

/**
 * The claims among a contact's held records that may be a chip: those the store says are of the held type (or did not say). The note and
 * where-we-met records answer the same find (they carry `a:heldParty`) and are of another type; they are not chips and need no label term.
 */
export function heldTypedClaims(claims: readonly HeldClaimDoc[], heldClaimType: string): HeldClaimDoc[] {
  return claims.filter((c) => !c.typeUri || typeTail(c.typeUri) === typeTail(heldClaimType));
}

/**
 * Is there evidence that the My Note / Where we met records exist for this contact? True when one of the held records is of a type that is NOT the held
 * claim type. The annotations route is asked only then (or when the person opens the group to write): a card with no such record never pays it.
 */
export function hasAnnotationRecord(claims: readonly HeldClaimDoc[], heldClaimType: string): boolean {
  return claims.some((c) => !!c.typeUri && typeTail(c.typeUri) !== typeTail(heldClaimType));
}

const labelKeyOf = (v: Pick<ContactLabelVocab, "circleLabel" | "relationshipKind">, axis: LabelAxis): string => (axis === "circleLabel" ? v.circleLabel : v.relationshipKind);

/** The facts of ONE chip's claim — the ONE composer, so the neutrality rule has one home. Checked before it is returned. */
export function labelClaimFacts(
  vocab: ContactLabelVocab,
  args: { subject: string; entry: Pick<CatalogueEntry, "id" | "axis">; stater: string; holder: string },
): Record<string, FactValue> {
  const facts: Record<string, FactValue> = {
    [vocab.heldParty]: { "@id": args.subject },
    [labelKeyOf(vocab, args.entry.axis)]: { "@id": args.entry.id },
    [vocab.statedBy]: { "@id": args.stater },
    [vocab.claimSubject]: { "@id": args.holder },
    [vocab.visibilityTier]: PRIVATE_TIER,
  };
  assertNeutralLabelFacts(facts, vocab, args.holder);
  return facts;
}

/**
 * 🔴 The neutrality guard: the facts of a label claim are EXACTLY the five above and nothing else. An ALLOWLIST, not a list of what is
 * refused: a grant predicate nobody has thought of is refused too. Throws {@link ContactLabelError}.
 */
export function assertNeutralLabelFacts(facts: Record<string, unknown>, vocab: ContactLabelVocab, holder: string): void {
  const label = [vocab.circleLabel, vocab.relationshipKind].filter((k) => k in facts);
  if (label.length !== 1) throw new ContactLabelError("A kind-of-contact claim carries exactly one label.");
  const allowed = new Set([vocab.heldParty, vocab.statedBy, vocab.visibilityTier, vocab.claimSubject, label[0]!]);
  for (const k of Object.keys(facts)) {
    if (!allowed.has(k)) throw new ContactLabelError(`Refusing to write ${k} on a kind-of-contact label: a label grants no access and carries nothing else.`);
  }
  if (facts[vocab.visibilityTier] !== PRIVATE_TIER) throw new ContactLabelError("A kind-of-contact label is written at the private row, always: without it a first read grant on the vault would expose it.");
  const subject = facts[vocab.claimSubject] as { "@id"?: unknown } | undefined;
  if (!holder || !subject || subject["@id"] !== holder) throw new ContactLabelError("A kind-of-contact label is held by its holder only: a:claimSubject is the signed-in holder, never the contact or a group.");
  for (const k of [vocab.heldParty, vocab.statedBy, label[0]!]) {
    const v = facts[k] as { "@id"?: unknown } | undefined;
    if (!v || typeof v["@id"] !== "string" || !v["@id"]) throw new ContactLabelError(`A kind-of-contact label needs a reference under ${k}.`);
  }
}

/** One stored chip about a contact. */
export interface ContactLabelClaim {
  id: string;
  uri: string;
  axis: LabelAxis;
  /** The catalogue entry's address. */
  entry: string;
  /** Who stated the chip (`a:statedBy`), every value read: the ADDER's card. A source, ⛔ not whose chip it is. */
  statedBy: string[];
  /** Whose chip it is (`a:claimSubject`, the principal who wrote it), every value read. A chip is private to it: only it may remove the chip. */
  claimSubject: string[];
}

const idOf = (u: string) => u.slice(u.lastIndexOf("/") + 1);

function refs(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
  return raw
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" && typeof (x as { "@id"?: unknown })["@id"] === "string" ? (x as { "@id": string })["@id"] : null))
    .filter((x): x is string => x !== null);
}

function pick(doc: Record<string, unknown>, stored: string): unknown {
  return doc[stored] ?? doc[stored.startsWith("a:") ? stored.slice(2) : stored];
}

/**
 * The chips among a contact's held claims: each claim about ONE contact (this one) carrying a label, whoever stated it (the platform enforces who
 * may read a chip: it is written at the private row, so it returns the reader's own). A held skill or interest is not a chip. Which of them the
 * viewer may remove is {@link ownContactLabels}.
 */
export function contactLabelsOf(claims: readonly HeldClaimDoc[], vocab: ContactLabelReadVocab, subject: string): ContactLabelClaim[] {
  if (!subject) return [];
  const out: ContactLabelClaim[] = [];
  for (const c of claims) {
    const parties = refs(pick(c.doc, vocab.heldParty));
    if (parties.length !== 1 || idOf(parties[0]!) !== idOf(subject)) continue;
    const statedBy = refs(pick(c.doc, vocab.statedBy));
    const claimSubject = refs(pick(c.doc, vocab.claimSubject));
    for (const axis of ["circleLabel", "relationshipKind"] as const) {
      const entry = refs(pick(c.doc, labelKeyOf(vocab, axis)))[0];
      if (entry) out.push({ id: c.id, uri: c.uri, axis, entry, statedBy, claimSubject });
    }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The chips THIS viewer owns: `a:claimSubject` is their principal. A relationship-kind chip is always private to its claim subject, so that is the match for
 * remove; ⛔ not `a:statedBy`, which names the source and, on a chip written earlier, is a vault's card.
 */
export function ownContactLabels(labels: readonly ContactLabelClaim[], principal: string | null | undefined): ContactLabelClaim[] {
  return labels.filter((c) => !!principal && c.claimSubject.length === 1 && sameIri(c.claimSubject[0], principal, c.uri));
}

export type ContactLabelWrite = { kind: "none" } | { kind: "create"; claim: { id: string; uri: string } };

/** Add one chip as its own private claim. A label already on the contact is kept (nothing is written twice). */
export async function addContactLabel(args: {
  vaultId: string;
  subject: string;
  entry: Pick<CatalogueEntry, "id" | "axis">;
  existing: readonly ContactLabelClaim[];
  stater: string;
  holder: string;
}): Promise<ContactLabelWrite> {
  const { vaultId, subject, entry, existing, stater, holder } = args;
  if (!vaultId) throw new ContactLabelError("Refusing to write a kind of contact with no vault named.");
  if (!stater) throw new ContactLabelError("Refusing to write a kind of contact with no stater: it would read 'source not recorded'.");
  if (!holder) throw new ContactLabelError("Refusing to write a kind of contact with no signed-in holder.");
  if (!subject) throw new ContactLabelError("Refusing to write a kind of contact about no one.");
  if (existing.some((c) => c.axis === entry.axis && c.entry === entry.id)) return { kind: "none" };
  const vocab = await resolveContactLabelVocab();
  const facts = labelClaimFacts(vocab, { subject, entry, stater, holder });
  const created = await createResource(vaultId, { type: vocab.heldClaimType, facts });
  return { kind: "create", claim: { id: created.id, uri: created.location } };
}

/**
 * A claim the platform has ENDED is still served (200), as a document that says only that it ended (`a:entityLifecycleState` = "ended", and who ended it)
 * and carries none of its facts. MEASURED on a scratch platform: holder DELETE 204, then GET 200 with exactly that
 * body, and the holder's find returns none. A removal is confirmed when the read-back is gone (404) OR is such an ended document.
 */
export function isEndedClaimDoc(doc: Record<string, unknown>): boolean {
  const state = doc["a:entityLifecycleState"] ?? doc["entityLifecycleState"];
  return state === "ended" || (typeof state === "object" && state !== null && (state as { "@id"?: unknown })["@id"] === "ended");
}

/** Remove the chips named: only their own claims, ⛔ never the contact's record and never another chip. */
export async function removeContactLabel(vaultId: string, claims: readonly Pick<ContactLabelClaim, "id" | "uri">[]): Promise<void> {
  if (!vaultId) throw new ContactLabelError("Refusing to remove a kind of contact with no vault named.");
  for (const c of claims) await deleteResource(c.id, vaultId, c.uri);
}
