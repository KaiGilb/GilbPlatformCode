/**
 * The spellings of an address, ASKED of the ontology master by term name. Taken from GilbApp `src/lib/mynet/place/placeVocab.ts` (commit in the
 * README); the only change is the imports (see "Changes from GilbApp"). The address subset of MyNet's `ResolvedProfileVocab`, with the same field
 * names, so a reader of `vocab.claimSubject` etc. is unchanged.
 *
 * ⛔ No spelling is typed here: each is the master's answer to its term's NAME (`term-slots`: `attributeSpelling` / `typeSpelling`). A term the
 * master does not answer makes the whole vocabulary unavailable (MyNet throws `VedaVocabUnavailableError` the same way): an address is never
 * read or written under a guessed key.
 *
 * ⚠ Not resolved, because GilbApp writes neither: `visibilityTier`.
 */
import { attributeLabel, attributeSpelling, typeSpelling } from "@kaigilb/gilbplatformcode-term-slots";
import { registerCardPartTypes } from "@kaigilb/gilbplatformcode-lws-vault-sets";

export interface ResolvedPlaceVocab {
  /** `a:placeClaimLabel` — the holder's own open-text name for the address (home, work, cabin). */
  placeClaimLabel: string;
  /** `a:streetLine` — the doorstep text. */
  streetLine: string;
  /** `a:addressLine1` / `a:addressLine2` — "Address 1" / "Address 2", free-text lines of ONE address,
   *  each on its own field claim (Cycle214 step 1e; minted by Agent.Concept 2026-10-14). */
  addressLine1: string;
  addressLine2: string;
  /** `a:postalCode` — "Postal Code" on ONE address, the code alone, a string exactly as typed
   *  ("0150"), on its own field claim (Cycle214 step 1e; the master's term, Suggested, REUSED per
   *  Agent.Concept's ruling §5 — ⛔ nothing minted). ⛔ Not a find key in this change. */
  postalCode: string;
  /** The master's own `a:label` for the address-line terms, keyed by TERM NAME (`addressLine1` →
   *  "Address 1"), as MyNet's `ResolvedProfileVocab.termLabels`. ⛔ Never typed into this app; a term
   *  the master gave no label is left out. */
  termLabels: Readonly<Record<string, string>>;
  /** `a:memberOf` — LEGACY: catalogue ids on an un-decomposed composite (read only). */
  memberOf: string;
  /** `a:claimSubject` — the party the claim is about. */
  claimSubject: string;
  /** CREATE form of the address-claim type (`t:PlaceClaim`). */
  placeClaimType: string;
  /** QUERY form of the same (`PlaceClaim`) — the bare local name `?type=` demands. */
  placeClaimTypeQuery: string;
  /** `a:claimPlace` — the catalogue row one field claim names. */
  claimPlace: string;
  /** `a:detailOf` — a field claim's edge to its composite. */
  detailOf: string;
  /** CREATE form of the per-field claim type (`t:SelfAssertedFieldClaim`). */
  fieldClaimType: string;
  /** QUERY form of the same (`SelfAssertedFieldClaim`). */
  fieldClaimTypeQuery: string;
}

export class PlaceVocabUnavailableError extends Error {
  /** CHANGED (new): the terms the master did not answer, as a list, so a view can show a fixed sentence and keep these for the log (the message names term paths). */
  readonly missing: readonly string[];
  constructor(missing: readonly string[]) {
    super(`The ontology did not name ${missing.join(", ")}, so no address can be read or written right now.`);
    this.name = "PlaceVocabUnavailableError";
    this.missing = missing;
  }
}

let cached: Promise<ResolvedPlaceVocab> | null = null;

/** Test seam — ⛔ never called by product code. */
export function __resetPlaceVocab(): void {
  cached = null;
}

const ATTRS = [
  "placeClaimLabel",
  "streetLine",
  "memberOf",
  "claimSubject",
  "claimPlace",
  "detailOf",
  // Cycle214 step 1e — "Address 1" / "Address 2".
  "addressLine1",
  "addressLine2",
  // Cycle214 step 1e — "Postal Code" (the master's a:postalCode, reused).
  "postalCode",
] as const;
/** The address terms whose master `a:label` the editor shows. */
const LABELLED = ["addressLine1", "addressLine2", "postalCode"] as const;
const TYPES = ["PlaceClaim", "SelfAssertedFieldClaim"] as const;

// F20 (Agent.Scaling 6ccd72d): the two types are parts of a person card, not register rows. Registered
// by the term names asked below, and again by the spellings the master answers (`resolvePlaceVocab`).
registerCardPartTypes(TYPES);

/** The address vocabulary, from the master (cached on success only, as MyNet's). */
export function resolvePlaceVocab(): Promise<ResolvedPlaceVocab> {
  cached ??= (async () => {
    const [attrs, types, labels] = await Promise.all([
      Promise.all(ATTRS.map((n) => attributeSpelling(n))),
      Promise.all(TYPES.map((n) => typeSpelling(n))),
      // ⚠ A label that cannot be read is only a missing label (the editor shows the term's name in
      //   words), ⛔ never a failed vocabulary: the SPELLINGS above still block every write.
      Promise.all(LABELLED.map((n) => Promise.resolve().then(() => attributeLabel(n)).catch(() => null))),
    ]);
    const missing = [
      ...ATTRS.filter((_, i) => !attrs[i]).map((n) => `a/${n}`),
      ...TYPES.filter((_, i) => !types[i]).map((n) => `t/${n}`),
    ];
    if (missing.length > 0) throw new PlaceVocabUnavailableError(missing);
    const a = (i: number) => `a:${attrs[i]!}`;
    const placeClaimType = types[0]!;
    const fieldClaimType = types[1]!;
    registerCardPartTypes([placeClaimType, fieldClaimType]);
    return {
      placeClaimLabel: a(0),
      streetLine: a(1),
      memberOf: a(2),
      claimSubject: a(3),
      claimPlace: a(4),
      detailOf: a(5),
      addressLine1: a(6),
      addressLine2: a(7),
      postalCode: a(8),
      termLabels: Object.freeze(
        Object.fromEntries(
          LABELLED.flatMap((n, i) => (labels[i] ? [[n, labels[i] as string]] : [])),
        ) as Record<string, string>,
      ),
      placeClaimType,
      placeClaimTypeQuery: placeClaimType.slice(2),
      fieldClaimType,
      fieldClaimTypeQuery: fieldClaimType.slice(2),
    };
  })().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}
