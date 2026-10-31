// The address claims, READ side: what one address is, how a vault's addresses are listed and which are about one record, and the small pure reads
// of an address (its heading, its text lines, whether it has content). Taken from GilbApp `src/lib/mynet/place/placeClaim.ts` (commit in the README), which
// was copied from MyNet's; the write side of that file (the facts of an address, create, change, remove, the order of field writes) is the unit
// `place-claim-write`'s and is not here. The changes are named in the README under "Changes from GilbApp" and each is marked `CHANGED` below.
//
// One address = one `t:PlaceClaim` composite (`a:claimSubject` · `a:placeClaimLabel`) with one `t:SelfAssertedFieldClaim` per field (`placeFieldClaim.ts`),
// held in the vault that HOLDS the person's record, with `a:claimSubject` = the person's RECORD (its entity IRI). GilbApp writes NO rung
// (`a:visibilityTier`) on any of them.
import { getListedResource, listRecordsOfType } from "@kaigilb/gilbplatformcode-vault-records-of-type";
import { idFromResourceUri } from "@kaigilb/gilbplatformcode-resource-id";
import { resolvePlaceVocab } from "@kaigilb/gilbplatformcode-place-vocab";
import type { GeoAncestry } from "@kaigilb/gilbplatformcode-geo-catalogue";
import { boundPlaceIds } from "@kaigilb/gilbplatformcode-place-lines";
import {
  PLACE_TEXT_SLOTS,
  addressIdOfEdge,
  listMyPlaceFieldClaims,
  subjectsBelongToAddress,
  textSlotOfTerm,
  type PlaceFieldClaim,
  type PlaceTextTerm,
  type PlaceTextValues,
} from "./placeFieldClaim";

/** The catalogue rungs a claim may bind. ⛔ Street is NOT one — see {@link findablePlaceFacts}. */
export const PLACE_CLAIM_BOUND_RUNGS = ["city", "region", "country"] as const;

/** One address a person keeps, as this app reads it back off the vault. */
export interface PlaceClaim {
  /** Opaque `/lws/r/<id>` segment — the write target. */
  readonly id: string;
  /** Absolute entity URI. */
  readonly uri: string;
  /** The holder's OWN open text: `home`, `work`, `home2`, `cabin`, … ⛔ Never an enumeration. */
  readonly label: string;
  /**
   * ⚠ **LEGACY** — the doorstep text still stored ON THE COMPOSITE, from before MNB168.21
   * decomposed the address. `""` on every claim this build mints and on every migrated one.
   * ⛔ Read {@link claimFieldText}(claim, "streetLine"), ⛔ never this field: it is the *un-migrated* half only.
   * ⛔ Never indexed, posted, completed or searched, at any rung including Public.
   */
  readonly streetLine: string;
  /**
   * ⚠ **LEGACY** — catalogue ids still stored ON THE COMPOSITE as `a:memberOf`, from before
   * MNB168.21. `[]` on every claim this build mints and on every migrated one.
   * ⛔ Read `claimPlaceIds` of `place-lines`, ⛔ never this field.
   */
  readonly memberOf: readonly string[];
  /**
   * 🔴 THE FIELDS, EACH ITS OWN ENTITY AND ITS OWN RUNG — Kai: *"each filed needs to have its
   * own access rung … one for city, another one for country etc."*
   *
   * ⚠ An EMPTY array on a claim that still carries {@link streetLine} / {@link memberOf} means
   * *"not migrated yet"*, ⛔ not *"this address has no fields"*. The two are different facts and
   * `needsFieldMigration` of `place-lines` is what tells them apart — this is the one place on this facet
   * where an empty list would otherwise wear a settled answer's clothes.
   */
  readonly fields: readonly PlaceFieldClaim[];
  /** 🔴 GilbApp: the `a:claimSubject` references as stored (the record the address is about). */
  readonly subjects: readonly string[];
  /**
   * CHANGED (new, F5): how many field records point at this address and were LEFT OUT of {@link fields} because their subjects are not this address's
   * (they are about someone else) or cannot be read. A detail that exists and is not drawn: a view says so ("1 detail of this address is not shown").
   * GilbApp left them out and wrote a `console.warn`, so nothing on the screen said so.
   */
  readonly hiddenFieldCount: number;
  readonly etag: string | null;
}

/** What a caller hands in to mint or amend one address. */
export interface PlaceClaimInput extends PlaceTextValues {
  /** Open text the holder typed. ⛔ Never validated against a list. */
  readonly label: string;
  readonly streetLine: string;
  /** "Address 1" / "Address 2" — open text, each its own field claim (Cycle214 1e).
   *  `""` (or blank) = clear it: an existing one is retracted on amend. ⚠ An ABSENT key = leave it
   *  as stored: a caller that does not know the lines must ⛔ never delete them. */
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  /** "Postal Code" — the code alone, a STRING exactly as typed ("0150" stays "0150"; ⛔ never a
   *  number), trimmed; ⛔ no format check. Same `""` = clear / ABSENT = leave rule as the lines. */
  readonly postalCode?: string;
  /** The resolved catalogue rungs. Any may be null — 5.48% of regions reach no country. */
  readonly place: GeoAncestry;
}
/** What a person is told when a change would leave an address holding nothing (Agent.Scaling F4). */
export const EMPTY_ADDRESS_MESSAGE = "An address needs at least one part. Use Remove to delete it.";

/** Q2 — what the person is told when Remove refuses an address that also names someone else. */
export const SHARED_ADDRESS_MESSAGE =
  "This address is also about someone else, so it cannot be removed from this card. Nothing was removed.";

export class PlaceClaimError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(`PlaceClaim ${status}${detail ? ` — ${detail}` : ""}`);
    this.name = "PlaceClaimError";
    this.status = status;
  }
}

/**
 * 🔴 Q2 (Agent.Scaling delta 3, M1; Kai-Zen, option 1) — Remove on a card refused, before any
 * delete, because the address names someone besides that card's record. The message is
 * {@link SHARED_ADDRESS_MESSAGE}.
 */
export class SharedAddressError extends PlaceClaimError {
  constructor() {
    super(0, SHARED_ADDRESS_MESSAGE);
    this.name = "SharedAddressError";
  }
}

/**
 * 🔴 WHAT MAKES AN ADDRESS WORTH STORING — Kai, 2026-10-14: *"make it save in both apps"*.
 *
 * An address is stored as soon as ANY of its parts holds something: the Location (the holder's
 * label), the Street, Address 1, Address 2, the Postal Code, or a City / Region / Country picked from the
 * catalogue. ⚠ Location is optional and a catalogue place is optional — an address of typed lines
 * only is a whole address. ⛔ Before this an address needed a Location AND a catalogue place, so
 * a typed Street alone was dropped on leaving the field and nothing said so.
 *
 * ⛔ An input holding NOTHING is not an address: minting it would assert a place the person never
 * named. The one rule for the add form, the amend path and {@link createPlaceClaim}.
 */
export function placeClaimHasContent(input: PlaceClaimInput): boolean {
  if (input.label.trim() !== "") return true;
  for (const { term } of PLACE_TEXT_SLOTS) {
    if ((input[term] ?? "").trim() !== "") return true;
  }
  return boundPlaceIds(input.place).length > 0;
}

/**
 * The name an address is shown under: the holder's Location, else the first line they typed
 * (Street, then Address 1, then Address 2, then the Postal Code — the table's order), else `""`.
 *
 * ⚠ Cycle214 1e (Kai, 2026-10-14): Location is optional, so a stored address may carry none.
 * ⛔ No English placeholder word is put in its place — the person's own words, or nothing.
 */
export function placeClaimHeading(claim: PlaceClaim): string {
  const label = claim.label.trim();
  if (label !== "") return label;
  for (const { term } of PLACE_TEXT_SLOTS) {
    const text = claimFieldText(claim, term).trim();
    if (text !== "") return text;
  }
  return "";
}

/**
 * The free text of ONE text field of an address (street, Address 1, Address 2, Postal Code), wherever it is
 * stored — the field claim, else (street only) the composite's legacy value. `""` when none.
 * ⛔ Never a find input — see {@link findablePlaceFacts}.
 */
export function claimFieldText(claim: PlaceClaim, term: PlaceTextTerm): string {
  const field = claim.fields.find((f) => f.subject === textSlotOfTerm(term));
  if (field) return field[term] ?? "";
  // ⚠ Only the street ever lived on the composite (before MNB168.21); the lines never did.
  return term === "streetLine" ? claim.streetLine : "";
}

/**
 * ⚠ RETURNS `""` FOR AN ABSENT FACT, SO *no fact* AND *empty fact* ARE THE SAME SHAPE HERE.
 *
 * 🔴 BVedanta named this the FIFTH surface on this lane where absence and value are
 * indistinguishable — the same class as every blocker since round 4 (*"that place does not
 * exist"*, the 2xx that kept nothing, the entity with no grant, the cleared field never sent,
 * and the rung that was never set reading as one that cannot be named).
 *
 * ⚠ IT IS DELIBERATELY NOT FIXED HERE, and the scope is NARROWER than it looks — VATester
 * measured each reader rather than assuming:
 *   • `streetLine` — absence == empty is the **CORRECT** semantics: after the D-N8 fix a cleared
 *     street IS an absent key. ⛔ Nothing to change.
 *   • `label` — absence == empty is the **CORRECT** semantics since Cycle214 1e (Kai,
 *     2026-10-14): the Location is optional, a blank one is ⛔ not written on create and is
 *     cleared (`null`) on amend, so an address with no Location reads `""` — and `factsSurvived`
 *     compares `""` with the `""` that was sent. ⛔ Nothing to change.
 *   • `visibilityTier` — the ONE field where absence is meaningful, and it is **already handled**
 *     at its call site (`placeClaimFacts` treats `""` as absent, ⛔ not as unnameable).
 * ⇒ the durable item is *"facts where absence is meaningful"*, which today is **the rung alone**,
 * ⛔ NOT "three fields". A reader who prices this as a three-field change prices two they do not
 * need.
 *
 * ⚠ THE REFRAME THAT EARNS IT ITS OWN STEP (BVedanta): the **vault plane already distinguishes
 * absent from empty** — that is what `op=1 AND tx_to IS NULL` means, and it is the same
 * distinction that makes a retracted `a:memberOf` lawful and `[]` unlawful. **The app flattens it
 * at the READ boundary.** ⇒ this is a **read-fidelity** item on the vault plane, ⛔ not type
 * cosmetics — which is also why `string | null` is the right shape when it is done: it is the
 * shape the store already has.
 *
 * 🔴 EXPIRY IS A NEW CONSUMER, ⛔ NOT A DATE. This is safe only while every reader guards the
 * empty case at its own call site. ⚠ **Adding a reader without that guard makes the class live
 * again silently, and nothing measures it.**
 */
function firstString(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    const s = v.find((x) => typeof x === "string");
    return typeof s === "string" ? s : "";
  }
  return "";
}

function refIds(v: unknown): string[] {
  const one = (x: unknown): string | null => {
    if (typeof x === "string") return x;
    if (x && typeof x === "object" && typeof (x as { "@id"?: unknown })["@id"] === "string") {
      return (x as { "@id": string })["@id"];
    }
    return null;
  };
  const raw = Array.isArray(v) ? v : [v];
  return raw.map(one).filter((x): x is string => x !== null);
}

/**
 * F-LIVE — every address this holder currently keeps, read off the store.
 *
 * ⚠ Read back through the WIRE keys, not the stored keys: the server frames the document with
 * one `a:` reduction, so `a:placeClaimLabel` arrives as `placeClaimLabel`. Both spellings are
 * accepted here because a reader that handles only one loses the fact silently, and an empty
 * answer is indistinguishable from "this holder keeps no address" — which reads as a settled
 * fact rather than a bug.
 *
 * ⛔ HOLDER'S OWN DATA ONLY. A read of another person's addresses is not client-addressed; the
 * server crosses for those and applies each claim's own rung.
 */
export async function listPlaceClaimsInVault(vaultId: string): Promise<PlaceClaim[]> {
  if (!vaultId) return [];
  const vocab = await resolvePlaceVocab();
  // Server-side type filter — the bare local name, which is what `?type=` validates.
  // ⚠ GilbApp: the typed read only (see the header).
  const records = await listRecordsOfType(vaultId, vocab.placeClaimTypeQuery);
  // 🔴 THE FIELD CLAIMS ARE READ ONCE FOR THE WHOLE VAULT AND GROUPED, ⛔ not re-listed per
  //    address: N addresses × M fields would otherwise be N list calls, and a partial failure
  //    would leave some addresses looking decomposed and others not.
  const allFields = await listMyPlaceFieldClaims(vaultId, vocab);
  const grouped = fieldsByComposite(allFields);
  const out: PlaceClaim[] = [];
  for (const ref of records) {
    const id = idFromResourceUri(ref.entity);
    const { doc, etag } = await getListedResource(ref, vaultId);
    const pick = (served: string): unknown => {
      const wire = served.startsWith("a:") ? served.slice(2) : served;
      return doc[served] ?? doc[wire];
    };
    const subjects = refIds(pick(vocab.claimSubject));
    // 🔴 R1 follow-on (Kai-Zen, option 1): a field is shown under this address only when Remove
    //    would delete it with the address — the SAME subject rule, `subjectsBelongToAddress`. A
    //    field about another person that points here is ⛔ not this address's: it is not shown,
    //    ⛔ not deleted (Remove leaves it too), and a warning names it once per read.
    const fields: PlaceFieldClaim[] = [];
    // CHANGED (F5): a field left out is COUNTED (GilbApp: a `console.warn` naming it, and nothing else).
    let hiddenFieldCount = 0;
    for (const f of grouped.get(id) ?? []) {
      // ⚠ `undefined` (a hand-built field) names no one; `null` (Q1: unreadable) fails closed.
      const fieldSubjects = f.claimSubjects === undefined ? [] : f.claimSubjects;
      if (subjectsBelongToAddress(fieldSubjects, subjects)) fields.push(f);
      else hiddenFieldCount += 1;
    }
    out.push({
      // 🔴 GilbApp: whom the claim is about, so a card keeps only its own ({@link claimsAbout}).
      subjects,
      fields,
      id,
      uri: ref.entity,
      label: firstString(pick(vocab.placeClaimLabel)),
      streetLine: firstString(pick(vocab.streetLine)),
      memberOf: refIds(pick(vocab.memberOf)),
      hiddenFieldCount,
      etag,
    });
  }
  /*
   * 🔴 D-K6 — THE ORDER IS THIS CLIENT'S, ⛔ NEVER THE STORE'S LIST ORDER.
   *
   * ⚠ WHAT KAI WALKED on production at `8a652c8`: *"When adding a new address, it is below the
   *   first address, as soon as it is fully filled out, about 2-3 seconds later it jumps to the
   *   top address. It should just stay in the order they are created."*
   *
   * 🔴 MEASURED CAUSE, read in Base's own source and ⛔ not inferred from the symptom: this
   *    function used to `return out` in the order `GET /lws/vault/<vault>/records` listed the
   *    entities, and that route orders `ORDER BY mx.updated_at DESC NULLS LAST, es.entity` where
   *    `mx.updated_at` is `max(f.tx_from)` over the entity's OPEN facts — i.e. MOST RECENTLY
   *    WRITTEN FIRST. A freshly minted address is the newest write, so the re-read after its save
   *    hoisted it to the top — the jump. And so did every later AMEND of any address, which is
   *    the same defect wearing a second face.
   *    ⚠ CITED AGAINST A PINNED REF, ⛔ never a working tree — Base `origin/main` at `0f31483`,
   *      which is what M1 runs: `src/lws/records.ts:418` (the `ORDER BY`), `:412`
   *      (`max(f.tx_from) AS updated_at`), `:190` (the field's own docstring, *"the entity's most
   *      recent OPEN assert"*). 🔴 An earlier draft of this comment cited `:328–330` / `:165–169`,
   *      which resolve only against ONE developer's local checkout — a reader on any other Base
   *      sha lands on unrelated lines and concludes the reading was invented. The SUBSTANCE
   *      verified at both; the ANCHOR did not. Corrected after BVedanta measured it.
   *
   * 🔴 THE KEY IS THE ENTITY ID, and its two properties are measured separately:
   *    • STABLE — an id is assigned once at mint and ⛔ never changes, so ⛔ no later write can
   *      reorder the list. This alone is what Kai asked for: *"stay in the order they are
   *      created"* is a demand that the order stop MOVING.
   *    • CREATION-ORDERED on this facet's mint path — `createPlaceClaim` calls `createResource`
   *      with ⛔ no `Slug`, so `POST /lws/vault/:vaultId/c` mints
   *      `slugPrefix(undefined) + uuidToBase32(uuidv7())` = a bare 26-char id (`crud.ts:141–142`
   *      at that same pinned ref). `uuidToBase32` is big-endian over a fixed 16 bytes onto the
   *      Crockford alphabet `0123456789abcdefghjkmnpqrstvwxyz` (`write/mint.ts:22, 81–96`), which
   *      is ASCII-ASCENDING across its whole index ⇒ code-unit order on the string IS numeric
   *      order on the uuid IS uuidv7 time order. Base's own header says it: *"a uuidv7 base32 …
   *      sorts by creation"*.
   *
   * ⚠ RESIDUAL, STATED WHERE THE CODE IS RATHER THAN ONLY IN A REPORT: the second property is
   *   the mint path's, ⛔ not the id type's. `mint.ts` documents a second, TIME-FREE form
   *   (`mintShortEntityId`, 12 CSPRNG chars), and a `Slug` prefix displaces a bare id in the sort.
   *   If either ever reaches this facet the order degrades to ARBITRARY-BUT-STABLE — which still
   *   satisfies the thing Kai reported (⛔ no jump on save) and ⛔ no longer matches mint order.
   *   🔴 THE DIRECTION, MEASURED BY VATESTER AND CORRECTED HERE — an earlier draft of this line
   *      said a slug would sort *"ahead of"* a bare id, and that is BACKWARDS. `slugPrefix`
   *      (`crud.ts:79–87`) lower-cases to `[a-z0-9-]` and strips leading hyphens, so a slug id
   *      begins with a letter or a digit and ⛔ never below `0` (0x30) — while a bare uuidv7
   *      base32 id begins with a digit. ⇒ a LETTER-initial slug sorts LAST; a DIGIT-initial slug
   *      INTERLEAVES. ⚠ The consequence above was right either way; the direction was not, and a
   *      comment that contradicts the code is corrected rather than waved through.
   *   ⛔ Nothing measures the degradation today.
   *
   * ⛔ NOT `updatedAt` ASCENDING. That is the same last-write key with its sign flipped: it puts
   *    a freshly amended address LAST instead of first, which is the identical defect.
   * ⚠ Code-unit comparison, ⛔ never `localeCompare` — a locale collation would make the order a
   *   property of the reader's device.
   */
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/**
 * 🔴 GilbApp — the claims ABOUT ONE RECORD, out of a vault that holds many people's records.
 * Compared by opaque id (the record's IRI may come back as `/base/e/`, `/vault/e/` or `base:e/`),
 * the same rule {@link fieldsByComposite} uses for `a:detailOf`. Pure; order kept.
 */
export function claimsAbout(claims: readonly PlaceClaim[], subject: string): PlaceClaim[] {
  if (!subject) return [];
  const want = idFromResourceUri(subject);
  return claims.filter((c) => c.subjects.some((s) => idFromResourceUri(s) === want));
}

/** Groups field claims by the opaque id of the composite they detail. ⚠ Keyed on the ID, ⛔ not
 *  on the URI spelling — see {@link compositeEntityUri}. */
export function fieldsByComposite(
  fields: readonly PlaceFieldClaim[],
): Map<string, PlaceFieldClaim[]> {
  const out = new Map<string, PlaceFieldClaim[]>();
  for (const f of fields) {
    // ⚠ The ONE edge rule, shared with Remove (R1): `addressIdOfEdge`.
    const key = addressIdOfEdge(f.detailOf);
    const list = out.get(key);
    if (list) list.push(f);
    else out.set(key, [f]);
  }
  return out;
}
