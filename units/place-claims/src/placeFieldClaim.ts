// The address field claims, READ side: the free-text slots of an address (one table), the shape of one field claim, how a stored document is turned
// into one, and the listing of all of them in a vault. Taken from GilbApp `src/lib/mynet/place/placeFieldClaim.ts` (commit in the README), which was copied
// from MyNet's; the write side of that file (the facts of a field claim, its create, update and remove, the grant-plane fence) is the unit
// `place-claim-write`'s and is not here. What is here is shared by both sides: the slot tables and `placeFieldValuesOf` are pure. The changes are named in
// the README under "Changes from GilbApp" and each is marked `CHANGED` below.
//
// Each field of an address is its OWN `t:SelfAssertedFieldClaim` about the person's record, with `a:detailOf` pointing at the address (`t:PlaceClaim`):
// one of `a:streetLine`, `a:addressLine1`, `a:addressLine2`, `a:postalCode` (text) or `a:claimPlace` (a catalogue place), and no more than one.
import { getListedResource, listRecordsOfType } from "@kaigilb/gilbplatformcode-vault-records-of-type";
import { idFromResourceUri } from "@kaigilb/gilbplatformcode-resource-id";
import type { ResolvedPlaceVocab as PlaceVocab } from "@kaigilb/gilbplatformcode-place-vocab";

/**
 * 🔴 THE FREE-TEXT FIELDS OF AN ADDRESS — one row per field, and the ONE place they are listed.
 *
 * Each row is a slot this app's editor has one text box for, and the master TERM whose spelling
 * the field is written under (`vocab[term]`, resolved live in `placeVocab.ts`). The value travels under
 * the term's name everywhere in this facet (`streetLine`, `addressLine1`, `addressLine2`,
 * `postalCode`), so a
 * reader, a writer and a planner need ⛔ no branch per field.
 *
 * Every row is treated exactly as the street: its OWN field claim (GilbApp: no rung, see the header), cleared by
 * retracting its entity, and ⛔ never a find input (none of these terms declares
 * `a:networkFindKey`; {@link findablePlaceFacts} reads places only).
 *
 * ⚠ Adding a free-text field is ONE row here, its binding in `placeVocab.ts`, and its box in the
 * editor. `postalCode` was added exactly so (Agent.Concept's ruling §5; Kai 2026-10-14, option 1).
 */
export const PLACE_TEXT_SLOTS = Object.freeze([
  { slot: "street", term: "streetLine" },
  // Cycle214 step 1e — "Address 1" / "Address 2" (Agent.Concept, 2026-10-14).
  { slot: "line1", term: "addressLine1" },
  { slot: "line2", term: "addressLine2" },
  // Cycle214 step 1e — "Postal Code" (Kai, 2026-10-14: option 1, "a typed field now"). The master's
  // `a:postalCode` (Suggested), REUSED per Agent.Concept's ruling §5 — ⛔ nothing minted. The code
  // alone, kept as a STRING exactly as typed (trimmed): "0150" is ⛔ never 150. ⛔ No format check —
  // postal codes differ by country. ⛔ Never a find input in this change (network search on postal
  // codes is a separate, later decision). Picking a code from GilbGeo later fills this same field.
  { slot: "postal", term: "postalCode" },
] as const);
export type PlaceTextSlot = (typeof PLACE_TEXT_SLOTS)[number]["slot"];
/** The term (= vocabulary key = value key) a free-text field is written under. */
export type PlaceTextTerm = (typeof PLACE_TEXT_SLOTS)[number]["term"];

/** The fields of an address, each its own entity: the free-text ones, then the places. */
export const PLACE_FIELD_SLOTS = ["street", "line1", "line2", "postal", "country", "region", "city"] as const;
export type PlaceFieldSlot = (typeof PLACE_FIELD_SLOTS)[number];

/** The free text of each text field, keyed by its term. An absent key is "not given". */
export type PlaceTextValues = { readonly [K in PlaceTextTerm]?: string };

/** The text slot a term fills. */
export function textSlotOfTerm(term: PlaceTextTerm): PlaceTextSlot {
  return PLACE_TEXT_SLOTS.find((r) => r.term === term)!.slot;
}

/** The term a text slot is written under, or `null` for a place slot. */
export function termOfTextSlot(slot: string): PlaceTextTerm | null {
  return PLACE_TEXT_SLOTS.find((r) => r.slot === slot)?.term ?? null;
}

/** Only the value keys of `x` — the text terms and `placeId` — for handing one field's value on. */
export function placeFieldValuesOf(x: PlaceTextValues & { readonly placeId?: string }): PlaceTextValues & { placeId?: string } {
  const out: { -readonly [K in PlaceTextTerm]?: string } & { placeId?: string } = {};
  for (const { term } of PLACE_TEXT_SLOTS) if (x[term] !== undefined) out[term] = x[term];
  if (x.placeId !== undefined) out.placeId = x.placeId;
  return out;
}

/**
 * What a stored field claim is ABOUT, as read off its own facts.
 *
 * ⚠ `"place"` and ⛔ not `"city" | "region" | "country"`, deliberately: the GRAIN is ⛔ not
 * stored here. It is read off the catalogue term's own `a:placeGrain`
 * (`Rule_Code_base-vault-native-derivation#RuleBasepodFieldsFromFacts`) — one place, one grain, one
 * entity — and BaseGeo resolves Oslo ⊂ Norway. ⛔ Copying an extent into the holder's vault is the
 * thing the whole BaseGeo binding exists to stop.
 *
 * 🔴 `"unknown"` (Agent.Scaling F3, Cycle214 1e): a record that details an address (`a:detailOf`)
 * but holds no field this build can read — a field kind a newer client added, or a malformed record
 * holding two. ⛔ It is NOT dropped: it stays a child of its address, so Remove retracts it with the
 * address and an amend refuses rather than writing around it. ⛔ Never shown, ⛔ never a slot.
 */
export type PlaceFieldSubject = PlaceTextSlot | "place" | "unknown";

/** One address field a person keeps, as its own entity with its own rung. */
export interface PlaceFieldClaim {
  /** Opaque `/lws/r/<id>` segment — the write target. */
  readonly id: string;
  /** Absolute entity URI. */
  readonly uri: string;
  /** The composite `t:PlaceClaim` this field is a detail of — `a:detailOf`. */
  readonly detailOf: string;
  readonly subject: PlaceFieldSubject;
  /** Doorstep text. `""` unless {@link subject} is `"street"`. ⛔ Never a find input. */
  readonly streetLine: string;
  /** "Address 1" text. `""`/absent unless {@link subject} is `"line1"`. ⛔ Never a find input. */
  readonly addressLine1?: string;
  /** "Address 2" text. `""`/absent unless {@link subject} is `"line2"`. ⛔ Never a find input. */
  readonly addressLine2?: string;
  /** "Postal Code" text, as typed ("0150" stays "0150"). `""`/absent unless {@link subject} is
   *  `"postal"`. ⛔ Never a find input. */
  readonly postalCode?: string;
  /** Absolute BaseGeo catalogue id. `null` unless {@link subject} is `"place"`. */
  readonly placeId: string | null;
  /** The record's `a:claimSubject` values as stored (WHOM it is about; ⚠ ⛔ not {@link subject},
   *  which is the field slot). `null` when a value is present but cannot be read (Q1). The read
   *  shows the field under an address only when {@link subjectsBelongToAddress} holds. Absent on a
   *  hand-built field: read as "names no one". */
  readonly claimSubjects?: readonly string[] | null;
  readonly etag: string | null;
}

/** ⚠ Returns `""` for an ABSENT fact — the same flattening `placeClaim.firstString` documents.
 *  Every caller here guards the empty case at its own call site. */
function firstString(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    const s = v.find((x) => typeof x === "string");
    return typeof s === "string" ? s : "";
  }
  return "";
}

function firstRefId(v: unknown): string | null {
  const one = (x: unknown): string | null => {
    if (typeof x === "string") return x;
    if (x && typeof x === "object" && typeof (x as { "@id"?: unknown })["@id"] === "string") {
      return (x as { "@id": string })["@id"];
    }
    return null;
  };
  const raw = Array.isArray(v) ? v : [v];
  for (const x of raw) {
    const id = one(x);
    if (id !== null) return id;
  }
  return null;
}

/** Reads BOTH the served spelling (`a:streetLine`) and the framed wire key (`streetLine`) —
 *  a reader handling only one loses the fact SILENTLY, and an empty answer then wears a settled
 *  fact's clothes. Same rule `listMyPlaceClaims` documents. */
function picker(doc: Record<string, unknown>) {
  return (served: string): unknown => {
    const wire = served.startsWith("a:") ? served.slice(2) : served;
    return doc[served] ?? doc[wire];
  };
}

/**
 * Turns one framed document into a field claim — or `null` if it is not one of ours.
 *
 * ⚠ A `t:SelfAssertedFieldClaim` carrying ⛔ no `a:detailOf` is ⛔ not an address field: this
 * type is the app-wide per-field claim type and other facets may use it. The `a:detailOf` edge is
 * what makes a row ours, so this is a **type-and-edge** narrowing and ⛔ never a guess at an id.
 */
export function toPlaceFieldClaim(
  id: string,
  uri: string,
  doc: Record<string, unknown>,
  etag: string | null,
  vocab: PlaceVocab,
): PlaceFieldClaim | null {
  const pick = picker(doc);
  const detailOf = firstRefId(pick(vocab.detailOf));
  if (detailOf === null || detailOf === "") return null;
  // ⚠ A spelling a partial vocabulary does not carry reads as absent, ⛔ never as a crash.
  const text = Object.fromEntries(
    PLACE_TEXT_SLOTS.map(({ term }) => [term, vocab[term] ? firstString(pick(vocab[term])) : ""]),
  ) as Record<PlaceTextTerm, string>;
  const filled = PLACE_TEXT_SLOTS.filter(({ term }) => text[term] !== "");
  const placeId = firstRefId(pick(vocab.claimPlace));
  // 🔴 INVARIANT 4 ON THE READ SIDE TOO — EXACTLY ONE FIELD. A row carrying two is malformed — from
  //    a foreign client, or from a defect. ⛔ It is not silently bucketed as one of them: silently
  //    picking a side is how a street ends up rendered under a place's rung.
  // ⚠ Cycle214 1e: this used to keep only a street or a place, so a row holding Address 1 or
  //   Address 2 alone was DROPPED — every saved line would have vanished on read.
  // 🔴 F3 (Agent.Scaling): and a row this build cannot read at all (no known field, or two) is
  //    kept as `"unknown"`, ⛔ not returned as `null`. Dropped, it was invisible to Remove, which
  //    then left it pointing at nothing — gone from the screen, readable in the store.
  const count = filled.length + (placeId !== null ? 1 : 0);
  const subject: PlaceFieldSubject = count !== 1 ? "unknown" : placeId !== null ? "place" : filled[0]!.slot;
  return {
    id,
    uri,
    detailOf,
    subject,
    streetLine: text.streetLine,
    addressLine1: text.addressLine1,
    addressLine2: text.addressLine2,
    postalCode: text.postalCode,
    placeId,
    claimSubjects: claimSubjectsOf(doc, vocab),
  etag,
  };
}

/** Every `t:SelfAssertedFieldClaim` record in the vault, by type. */
async function listFieldClaimRecords(vaultId: string, vocab: PlaceVocab) {
  // ⚠ GilbApp: the typed read only (see the header).
  return listRecordsOfType(vaultId, vocab.fieldClaimTypeQuery);
}

/**
 * The `a:claimSubject` a stored document names — trimmed, each once, sorted. `[]` when it names
 * none (absent, `null`, `""`, `[]`).
 *
 * 🔴 Q1 (Agent.Scaling delta 3, P1): `null` when a value is PRESENT but cannot be read as a
 * reference (no string `@id`: `{"@value": …}`, `42`, …). ⛔ It is NOT "names no one": a part whose
 * subject is unreadable may be about anyone, so it fails closed, as MyNet's `ownClaimSubjectTest`
 * does: not shown, not deleted, warned about. Before, the unreadable value was dropped, and the
 * part was shown on this card and deleted with the address.
 */
export function claimSubjectsOf(doc: Record<string, unknown>, vocab: PlaceVocab): string[] | null {
  const v = picker(doc)(vocab.claimSubject);
  if (v === undefined || v === null) return [];
  const out = new Set<string>();
  for (const x of Array.isArray(v) ? v : [v]) {
    const id = typeof x === "string" ? x : x && typeof x === "object" ? (x as { "@id"?: unknown })["@id"] : undefined;
    if (typeof id !== "string") return null;
    if (id.trim() !== "") out.add(id.trim());
  }
  return [...out].sort();
}

/**
 * The opaque id of the address an `a:detailOf` edge names, in any spelling `compositeEntityUri`
 * documents (`/lws/r/`, `/base/e/`, `/vault/e/`, `base:e/`, a bare id), on ANY host.
 *
 * 🔴 R1 (Agent.Scaling, Cycle214 1e; MyNet d14b693): this is the ONE edge rule. The read groups
 * fields under an address by it (`fieldsByComposite`) and Remove deletes by it
 * ({@link listFieldClaimsDetailing}). ⚠ There is ⛔ no host rule, on purpose. N2 added one (the
 * edge's host had to be the vault's or the read-back's) and the read never had it, so Remove left
 * behind parts the person could see, such as an edge on the deployment's owner host. The host rule
 * also stopped no forger: a bare id always passed. The record is listed from this vault, and its
 * `a:claimSubject` must still be the address's.
 */
export function addressIdOfEdge(edge: string): string {
  return idFromResourceUri(edge);
}

/**
 * 🔴 THE ONE SUBJECT RULE for "is this field record about the same person as its address", used
 * by the read (`listPlaceClaimsInVault`, which shows the field under the address) AND by Remove
 * ({@link isPartOfAddress}, which deletes it). Kai-Zen, option 1 (2026-10-14): two rules for "is
 * this part of this address" drift, which is what R1 was.
 *
 * True when the field names ⛔ no one, or when EVERY subject it names is one of the address's own,
 * compared by opaque id (`idFromResourceUri`), exactly as `claimsAbout` compares. ⚠ EVERY, ⛔ not
 * some: a field about this person AND another is also the other person's, so it is neither shown
 * as this address's nor deleted with it.
 *
 * @param fieldSubjects the field's `a:claimSubject` values, or `null` when one cannot be read
 * @param addressSubjects the address's own `a:claimSubject` values
 */
export function subjectsBelongToAddress(fieldSubjects: readonly string[] | null, addressSubjects: readonly string[]): boolean {
  // Q1 — a subject that is present but unreadable fails closed: ⛔ never "no one".
  if (fieldSubjects === null) return false;
  const own = new Set(addressSubjects.map(idFromResourceUri));
  return fieldSubjects.every((s) => own.has(idFromResourceUri(s)));
}

/**
 * What a read of the vault's records came to (see `RecordListing` of `vault-records-of-type`): whole, or incomplete with the reason, `capped` at the page
 * ceiling or `stalled` by a door that could not advance. CHANGED (new, F4): an incomplete read is never to be taken as "there are no more".
 */
export type ReadMarker = { readonly complete: true } | { readonly complete: false; readonly reason: "capped" | "stalled" };

/**
 * Every field claim of the address facet in the vault, read once (see {@link listPlaceClaimsInVault}'s account of why the whole vault).
 * CHANGED (F4): answers `{ fields, ...ReadMarker }`, not the bare array: the fields read are ALWAYS returned, and the marker says whether it was
 * the whole vault.
 */
export async function listMyPlaceFieldClaims(
  vaultId: string,
  vocab: PlaceVocab,
): Promise<{ readonly fields: PlaceFieldClaim[] } & ReadMarker> {
  if (!vaultId) return { fields: [], complete: true };
  const listing = await listFieldClaimRecords(vaultId, vocab);
  const out: PlaceFieldClaim[] = [];
  for (const ref of listing.records) {
    const id = idFromResourceUri(ref.entity);
    const { doc, etag } = await getListedResource(ref, vaultId);
    const field = toPlaceFieldClaim(id, ref.entity, doc as Record<string, unknown>, etag, vocab);
    if (field) out.push(field);
  }
  return listing.complete ? { fields: out, complete: true } : { fields: out, complete: false, reason: listing.reason };
}

// ── the read the REMOVE of an address rests on (moved here from the write side's file because it reads, and uses this file's private helpers) ──


/** A record Remove deletes with its address: its own id and entity URI. */
export interface AddressPartRef {
  readonly id: string;
  readonly uri: string;
}


/**
 * 🔴 WHAT REMOVE MAY DELETE, AND WHAT IT MUST LEAVE (Agent.Scaling N2 and R1, Cycle214 1e).
 * `parts` are deleted with the address. `otherSubject` are ⛔ NEVER deleted.
 */
export interface AddressParts {
  /** Records that are part of this address ({@link isPartOfAddress}): deleted with it. */
  readonly parts: AddressPartRef[];
  /** `a:detailOf` names this address, but the record is about someone the address is ⛔ not about
   *  (another person's record). Left as it is; the caller logs a warning. */
  readonly otherSubject: (AddressPartRef & { readonly subjects: readonly string[] | null })[];
}


/**
 * 🔴 IS THIS STORED FIELD RECORD A PART OF THE ADDRESS? The rule Remove deletes by (Agent.Scaling
 * R1, Cycle214 1e):
 *   1. its `a:detailOf` names the address by id ({@link addressIdOfEdge}), as the read groups it;
 *   2. it names ⛔ no one, or every `a:claimSubject` it names is one of the address's own, compared
 *      by opaque id with `idFromResourceUri`, exactly as `claimsAbout` picks a card's addresses.
 *      A record IRI may come back as `/base/e/`, `/vault/e/` or `base:e/`, or on another host.
 * ⚠ Before R1, Remove compared the subjects as exact strings. An amend re-stamps the composite's
 *   subject and ⛔ not its parts', so an address amended under another spelling of the same record
 *   lost its parts on Remove: gone from the screen, still in the store. A record about ANOTHER
 *   person has another id and still never passes.
 *
 * @param address the address's opaque id and its own `a:claimSubject` values, as stored now
 * @returns `"part"` (delete with the address), `"other"` (names the address, about someone else:
 *   keep and warn) or `null` (does not name the address)
 */
export function isPartOfAddress(
  doc: Record<string, unknown>,
  vocab: PlaceVocab,
  address: { readonly id: string; readonly subjects: readonly string[] },
): "part" | "other" | null {
  // (Q1: `claimSubjectsOf` answers `null` for an unreadable subject, which makes this "other".)
  const detailOf = firstRefId(picker(doc)(vocab.detailOf));
  if (detailOf === null || !address.id || addressIdOfEdge(detailOf) !== address.id) return null;
  return subjectsBelongToAddress(claimSubjectsOf(doc, vocab), address.subjects) ? "part" : "other";
}


/**
 * 🔴 EVERY FIELD RECORD THAT IS PART OF ONE ADDRESS — read off the store at the moment of Remove,
 * whatever field it holds (Agent.Scaling F3, Cycle214 1e).
 *
 * ⚠ Remove must ⛔ not trust only the last read's `claim.fields`: a record written since (another
 * tab, a newer client adding a field kind) would be left behind with `a:detailOf` pointing at
 * nothing — gone from every screen, still readable in the store. ⇒ the store is listed again here.
 *
 * 🔴 A record is a part, and Remove deletes it, by {@link isPartOfAddress} (Agent.Scaling R1).
 *    ⛔ NEVER DELETE ANOTHER PERSON'S DATA (N2, Kai-Zen's decision): a record that names this
 *    address but is about another person is returned in `otherSubject`, left exactly as it is, and
 *    the caller logs a warning. Leaving it costs, at worst, a record that details nothing; deleting
 *    it would destroy a fact about someone who did not ask for it.
 * ⚠ These are records in the holder's own vault. ⛔ Nothing here touches a pod.
 *
 * @param address the address's opaque id and its own `a:claimSubject` values, as stored now
 */
export async function listFieldClaimsDetailing(
  vaultId: string,
  vocab: PlaceVocab,
  address: { readonly id: string; readonly subjects: readonly string[] },
): Promise<AddressParts & ReadMarker> {
  const out: AddressParts = { parts: [], otherSubject: [] };
  if (!vaultId || !address.id) return { ...out, complete: true };
  const listing = await listFieldClaimRecords(vaultId, vocab);
  for (const ref of listing.records) {
    const id = idFromResourceUri(ref.entity);
    const { doc } = await getListedResource(ref, vaultId);
    const facts = doc as Record<string, unknown>;
    const verdict = isPartOfAddress(facts, vocab, address);
    if (verdict === "part") out.parts.push({ id, uri: ref.entity });
    else if (verdict === "other") out.otherSubject.push({ id, uri: ref.entity, subjects: claimSubjectsOf(facts, vocab) });
  }
  // CHANGED (F4): whether the listing was the whole vault. A remove that works from an incomplete one would leave parts behind.
  return listing.complete ? { ...out, complete: true } : { ...out, complete: false, reason: listing.reason };
}
