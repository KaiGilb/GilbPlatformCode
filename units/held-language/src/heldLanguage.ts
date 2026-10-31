/**
 * Cycle214 s8 — "Languages" on a person card HELD in GilbApp: one held claim per (person, language), in the
 * vault that HOLDS the person's record. React-free; `held-languages-state` is its loading state. This is the
 * held card's side of "one shared component and one set of rules"; MyNet's own card writes `t:SelfAssertedFieldClaim`s with a rung (`src/lib/base/languageClaim.ts`).
 *
 * THE SHAPE is Agent.Concept's ruling (`C214-Languages-Ontology-AgentConcept-2026-10-15` §2a, §7 item 2): one
 * `t:HeldPartyFieldClaim` per (person, language), exactly as an interest's (`heldNote.ts`):
 *     `a:heldParty` → { "@id": the person's record }
 *     `a:languageUsed` → { "@id": the catalogue language entry }   (the claim's ONE field)
 *     `a:flagCountry` → { "@id": the GilbGeo country }              (optional: the flag the person chose)
 *     `a:statedBy` → { "@id": the ADDER's own card, in their own landing vault }   (RuleBaseappSourceIsAdder)
 *   and `a:directReader` → the signed-in principal at mint (the self read-back grant).
 *
 * 🔴 NEVER FOUND BY THE NETWORK (Agent.Concept §2a: "Held card: t:HeldPartyFieldClaim with a:heldParty, no rung, never found"). A held
 * claim carries ⛔ no `a:visibilityTier` and ⛔ no `a:claimSubject`: those two are what puts a claim into the BaseConnect find index,
 * and `a:languageUsed` carries the find key. {@link heldLanguageFacts} refuses both, so a local card's language can never be found by the
 * network. With no tier row the claim is SHARED WITH THE VAULT by default (Kai 2026-10-27; the per-detail private switch is a later step).
 * The contact mark is the record's own `a:contactLanguage` (one tag).
 *
 * The read is the interests' (`listHeldClaimsAbout`): the platform's per-person find at the vault's own host,
 * one read per (vault, person) shared by every kind of held claim.
 */
import { DIRECT_READER, isPrivateDoc, refuseGrantKeys } from "@kaigilb/gilbplatformcode-held-notes";
import type { HeldClaimDoc } from "@kaigilb/gilbplatformcode-held-notes";
import { languageEntityPattern } from "@kaigilb/gilbplatformcode-language-search";
import { registerCardPartTypes } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { idFromResourceUri } from "@kaigilb/gilbplatformcode-resource-id";
import { isStatedBy } from "@kaigilb/gilbplatformcode-stated-by";
import { attributeSpelling, typeSpelling } from "@kaigilb/gilbplatformcode-term-slots";
import { createResource, deleteResource, patchResource } from "@kaigilb/gilbplatformcode-vault-resources";
import type { FactValue } from "@kaigilb/gilbplatformcode-vault-resources";

export class HeldLanguageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HeldLanguageError";
  }
}

/** The spellings a held language claim is written under, ASKED of the GilbVeda master by term name. */
export interface ResolvedHeldLanguageVocab {
  heldParty: string;
  statedBy: string;
  languageUsed: string;
  flagCountry: string;
  heldClaimType: string;
}

export class HeldLanguageVocabUnavailableError extends Error {
  constructor(missing: readonly string[]) {
    super(`The ontology did not name ${missing.join(", ")}, so no language can be read or written right now.`);
    this.name = "HeldLanguageVocabUnavailableError";
  }
}

const ATTRS = ["heldParty", "statedBy", "languageUsed", "flagCountry"] as const;
let cached: Promise<ResolvedHeldLanguageVocab> | null = null;

/** Test seam — ⛔ never called by product code. */
export function __resetHeldLanguageVocab(): void {
  cached = null;
}

/** ⛔ No spelling is typed here: each is the master's answer to its term's NAME. Cached on success only. */
export function resolveHeldLanguageVocab(): Promise<ResolvedHeldLanguageVocab> {
  cached ??= (async () => {
    const [attrs, claimType] = await Promise.all([Promise.all(ATTRS.map((n) => attributeSpelling(n))), typeSpelling("HeldPartyFieldClaim")]);
    const missing = [...ATTRS.filter((_, i) => !attrs[i]).map((n) => `a/${n}`), ...(claimType ? [] : ["t/HeldPartyFieldClaim"])];
    if (missing.length > 0) throw new HeldLanguageVocabUnavailableError(missing);
    // A held claim is a part of a person card, ⛔ not a register row (as the interest's).
    registerCardPartTypes([claimType!]);
    return {
      heldParty: `a:${attrs[0]!}`,
      statedBy: `a:${attrs[1]!}`,
      languageUsed: `a:${attrs[2]!}`,
      flagCountry: `a:${attrs[3]!}`,
      heldClaimType: claimType!,
    };
  })().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}

/** One held language claim, as read from the vault. */
export interface HeldLanguage {
  id: string;
  uri: string;
  heldParties: string[];
  /** The catalogue entry (`a:languageUsed`). */
  language: string;
  /** The country whose flag is shown (`a:flagCountry`), null when none was chosen. */
  flagCountry: string | null;
  statedBy: string[];
  /** The adder set it to private (SB1b-1). */
  isPrivate?: boolean;
}

function pick(doc: Record<string, unknown>, stored: string): unknown {
  const wire = stored.startsWith("a:") ? stored.slice(2) : stored;
  return doc[stored] ?? doc[wire];
}

function refs(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
  return raw
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" && typeof (x as { "@id"?: unknown })["@id"] === "string" ? (x as { "@id": string })["@id"] : null))
    .filter((x): x is string => x !== null);
}

/** One served document as a held language, or null when it carries no `a:languageUsed` reference. */
export function toHeldLanguage(id: string, uri: string, doc: Record<string, unknown>, vocab: ResolvedHeldLanguageVocab): HeldLanguage | null {
  // ⛔ A bare string is not a language: the term is a reference.
  const raw = pick(doc, vocab.languageUsed);
  const one = (Array.isArray(raw) ? raw : [raw]).find((x) => x && typeof x === "object" && typeof (x as { "@id"?: unknown })["@id"] === "string");
  const language = one ? (one as { "@id": string })["@id"] : null;
  if (!language) return null;
  return {
    id,
    uri,
    heldParties: refs(pick(doc, vocab.heldParty)),
    language,
    flagCountry: refs(pick(doc, vocab.flagCountry))[0] ?? null,
    statedBy: refs(pick(doc, vocab.statedBy)),
    isPrivate: isPrivateDoc(doc),
  };
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The held languages among a person's held claims (a claim of another kind is ⛔ not one). */
export function heldLanguagesOf(claims: readonly HeldClaimDoc[], vocab: ResolvedHeldLanguageVocab): HeldLanguage[] {
  const out: HeldLanguage[] = [];
  for (const c of claims) {
    const l = toHeldLanguage(c.id, c.uri, c.doc, vocab);
    if (l) out.push(l);
  }
  return out.sort(byId);
}

const sameEntity = (a: string, b: string) => idFromResourceUri(a) === idFromResourceUri(b);

/** Every language claim about ONE record, whoever stated it (as `heldNotesAbout`): the platform enforces who may read. */
export function heldLanguagesAbout(list: readonly HeldLanguage[], subject: string): HeldLanguage[] {
  if (!subject) return [];
  return list.filter((l) => l.heldParties.length === 1 && sameEntity(l.heldParties[0]!, subject));
}

/** The language claims THIS viewer stated (their own card is the one `a:statedBy`): the only ones they may change or remove. */
export function ownHeldLanguages(list: readonly HeldLanguage[], card: string | null | undefined): HeldLanguage[] {
  return list.filter((l) => isStatedBy(l.statedBy, card, l.uri));
}

/**
 * 🔴 ONE ENTRY = ONE ROW (fix round, Agent.Scaling Languages Delta1 F1). Two tabs that add the same language at once
 * can each plan on a read that did not hold it, and write a claim each. The card shows ONE row per language entry (the
 * first claim by id; a held card has no rung to compare); Remove and the flag act on every claim for the entry.
 */
export function dedupeHeldLanguages(list: readonly HeldLanguage[], card?: string | null): HeldLanguage[] {
  const seen = new Set<string>();
  const out: HeldLanguage[] = [];
  // The viewer's own claim for an entry is the row shown (so Remove and the flag act on it), else the first by id.
  const mineFirst = (a: HeldLanguage, b: HeldLanguage) => Number(isStatedBy(b.statedBy, card, b.uri)) - Number(isStatedBy(a.statedBy, card, a.uri));
  for (const l of [...list].sort(byId).sort(mineFirst)) {
    if (seen.has(l.language)) continue;
    seen.add(l.language);
    out.push(l);
  }
  return out;
}

const COUNTRY_ADDRESS = /^https:\/\/[^/\s]+\/base\/e\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * 🔴 The facts of a NEW held language claim — the ONE composer, so the not-shared rule has one home. ⛔ Refuses a
 * rung or a claim subject: either would put a holder's local card into the network find.
 */
export function heldLanguageFacts(
  vocab: ResolvedHeldLanguageVocab,
  args: { subject: string; language: string; flagCountry?: string | null; stater: string; readerPrincipal?: string | null },
): Record<string, FactValue> {
  const language = args.language.trim();
  if (!languageEntityPattern().test(language)) throw new HeldLanguageError(`Refusing to store a language that is not a GilbVeda language entry address: ${JSON.stringify(language)}.`);
  const facts: Record<string, FactValue> = {
    [vocab.heldParty]: { "@id": args.subject },
    [vocab.languageUsed]: { "@id": language },
    [vocab.statedBy]: { "@id": args.stater },
  };
  const flag = (args.flagCountry ?? "").trim();
  if (flag) {
    if (!COUNTRY_ADDRESS.test(flag)) throw new HeldLanguageError(`Refusing to store a flag country that is not a catalogue address: ${JSON.stringify(flag)}.`);
    facts[vocab.flagCountry] = { "@id": flag };
  }
  const reader = args.readerPrincipal?.trim();
  if (reader) facts[DIRECT_READER] = reader;
  refuseGrantKeys(facts, (m) => new HeldLanguageError(m), "a new language is shared with the vault by default and carries no tier (a local card is not shared with the network).");
  return facts;
}

function refuseWithout(vaultId: string, stater: string, subject: string, language: string): void {
  if (!vaultId) throw new HeldLanguageError("Refusing to write a language with no vault named.");
  if (!stater) throw new HeldLanguageError("Refusing to write a language with no stater: it would read 'source not recorded'.");
  if (!subject) throw new HeldLanguageError("Refusing to write a language about no one.");
  if (!language) throw new HeldLanguageError("Refusing to write a language with no language.");
}

/** Add one language to a person card as its own held claim. An existing claim for it is kept (`none`). */
export async function addHeldLanguage(args: {
  vaultId: string;
  subject: string;
  language: string;
  flagCountry?: string | null;
  existing: readonly HeldLanguage[];
  stater: string;
  readerPrincipal?: string | null;
}): Promise<{ kind: "none" } | { kind: "create"; claim: { id: string; uri: string } }> {
  const { vaultId, subject, language, existing, stater } = args;
  refuseWithout(vaultId, stater, subject, language);
  if (existing.some((l) => l.language === language)) return { kind: "none" };
  const vocab = await resolveHeldLanguageVocab();
  const facts = heldLanguageFacts(vocab, { subject, language, flagCountry: args.flagCountry, stater, readerPrincipal: args.readerPrincipal });
  const created = await createResource(vaultId, { type: vocab.heldClaimType, facts });
  return { kind: "create", claim: { id: created.id, uri: created.location } };
}

/** Choose the flag on one held language (`null` retracts the choice and keeps the language). */
export async function setHeldLanguageFlag(vaultId: string, claim: { id: string; uri: string }, flagCountry: string | null): Promise<void> {
  if (!vaultId) throw new HeldLanguageError("Refusing to write a language with no vault named.");
  const vocab = await resolveHeldLanguageVocab();
  const flag = (flagCountry ?? "").trim();
  if (flag && !COUNTRY_ADDRESS.test(flag)) throw new HeldLanguageError(`Refusing to store a flag country that is not a catalogue address: ${JSON.stringify(flag)}.`);
  await patchResource(claim.id, { [vocab.flagCountry]: flag ? { "@id": flag } : null }, vaultId, claim.uri);
}

/** The language left the card: its held claims about this person go (only the ones named). */
export async function removeHeldLanguages(vaultId: string, claims: readonly { id: string; uri: string }[]): Promise<void> {
  if (!vaultId) throw new HeldLanguageError("Refusing to remove a language with no vault named.");
  for (const c of claims) await deleteResource(c.id, vaultId, c.uri);
}
