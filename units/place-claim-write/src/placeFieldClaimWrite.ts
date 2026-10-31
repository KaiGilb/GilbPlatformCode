// The WRITE side of an address's field claims: the facts of one field claim, its create, its change and its removal, and the fence that keeps a grant-plane
// attribute out of them. Taken from GilbApp `src/lib/mynet/place/placeFieldClaim.ts` (commit in the README), which was copied from MyNet's; the read side of that
// file is the unit `place-claims`'s. The changes are named in the README under "Changes from GilbApp" and each is marked `CHANGED` below.
import { createResource, deleteResource, patchResource, type FactValue } from "@kaigilb/gilbplatformcode-vault-resources";
import { PLACE_TEXT_SLOTS, type PlaceTextTerm, type PlaceTextValues } from "@kaigilb/gilbplatformcode-place-claims";
import type { ResolvedPlaceVocab as PlaceVocab } from "@kaigilb/gilbplatformcode-place-vocab";
import { assertNotCatalogue, createTarget, resourceTarget } from "./geoFence";



export class PlaceFieldClaimError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(`PlaceFieldClaim ${status}${detail ? ` — ${detail}` : ""}`);
    this.name = "PlaceFieldClaimError";
    this.status = status;
  }
}


/**
 * 🔴 THE GRANT PLANE, BY NAME — the attributes that may ⛔ NEVER be composed by a fact composer.
 *
 * ⚠ Constraint 4 of this dispatch, and the reason it is a LIST rather than a comment: the
 * read-back catches a DROPPED grant and is **structurally blind to a WIDENED one**, and that
 * blindness now has N subjects instead of one. So the cover is ⛔ not a read-back — it is this
 * assertion, run on the output of every composer, plus the fact that `a:directReader` appears in
 * exactly one function in this module.
 */
export const GRANT_PLANE_ATTRIBUTES: readonly string[] = Object.freeze([
  // The grant this facet actually composes — at CREATE, in ⛔ exactly one function.
  "a:directReader",
  "a:directWriter",
  // 🔴 Base's `AUTHZ_CONTAINMENT_EDGE` (`src/authz/grant-cascade.ts`): grants fan out DOWN it, and
  //    on the WRITE path `audienceTierGate` is a literal `TRUE`. BVedanta REFUSED it by name as
  //    this facet's grouping edge; composing one anywhere here would give away every field.
  "a:partOf",
  "a:readerGroup",
]);


/** Throws if any grant-plane attribute reached a composed fact set. ⚠ Called on EVERY composer's
 *  output, ⛔ not only in tests — a test can be deleted; this cannot be, without deleting a line
 *  the write path runs. */
export function assertNoGrantPlane(facts: Record<string, unknown>, where: string): void {
  for (const key of Object.keys(facts)) {
    const bare = key.startsWith("a:") ? key : `a:${key}`;
    if (GRANT_PLANE_ATTRIBUTES.includes(bare)) {
      throw new PlaceFieldClaimError(
        0,
        `A grant-plane attribute (${key}) reached ${where}. The read-back cannot detect a widened grant, so this fails dangerous and is refused at composition.`,
      );
    }
  }
}


/** What one field claim is written from. */
export interface PlaceFieldClaimInput extends PlaceTextValues {
  /** ⚠ EXACTLY ONE field is set — one of the text terms ({@link PLACE_TEXT_SLOTS}: `streetLine`,
   *  `addressLine1`, `addressLine2`, `postalCode`) or `placeId` — and {@link placeFieldClaimFacts} refuses two or
   *  none: invariant 4 — two fields must ⛔ NEVER share an entity, because admission to one would
   *  otherwise admit the other (the street would admit the city; Address 1 would admit the street). */
  readonly placeId?: string;
}


/** The master's spelling for a text term. ⛔ Never a guessed key: a vocabulary that did not name
 *  the term refuses the write (the resolver throws first in production; this is the second fence). */
function spellingOf(vocab: PlaceVocab, term: PlaceTextTerm): string {
  const s = vocab[term];
  if (typeof s !== "string" || s === "") {
    throw new PlaceFieldClaimError(0, `The ontology did not name a/${term}, so this address field cannot be written.`);
  }
  return s;
}


/**
 * The facts ONE field claim writes. ⛔ No grant plane. ⛔ No `a:memberOf`. ⛔ No grain.
 *
 * @param compositeUri the `t:PlaceClaim` this field details — written as `a:detailOf`, whose
 *   served `a:encoding` is `reference:@id`, so it is an `{"@id": …}` reference.
 */
export function placeFieldClaimFacts(
  input: PlaceFieldClaimInput,
  subject: string,
  vocab: PlaceVocab,
  compositeUri: string,
): Record<string, FactValue> {
  const texts = PLACE_TEXT_SLOTS.filter(
    ({ term }) => typeof input[term] === "string" && (input[term] as string).trim() !== "",
  );
  const hasPlace = typeof input.placeId === "string" && input.placeId.trim() !== "";
  // 🔴 INVARIANT 4, ENFORCED RATHER THAN DOCUMENTED. *"This is the one placement error that
  //    silently re-creates the defect the whole ruling exists to remove."*
  // ⚠ Widened in Cycle214 1e from street+place to ANY two fields: Address 1 beside the street on
  //   one entity would share one rung just the same.
  const kinds = [...texts.map(({ term }) => vocab[term] ?? term), ...(hasPlace ? [vocab.claimPlace] : [])];
  if (kinds.length > 1) {
    throw new PlaceFieldClaimError(
      0,
      `Refusing to write ${kinds.join(" and ")} onto ONE field claim: they would then share one rung, and admission to one would admit the other.`,
    );
  }
  if (kinds.length === 0) {
    throw new PlaceFieldClaimError(0, "Refusing to mint a field claim that carries no field.");
  }
  if (!subject) {
    throw new PlaceFieldClaimError(0, "Refusing to mint a field claim with no claim subject.");
  }
  if (!compositeUri) {
    throw new PlaceFieldClaimError(
      0,
      "Refusing to mint a field claim with no a:detailOf edge: a field that names no address is an orphan nothing can group, read or retract with the address.",
    );
  }
  const facts: Record<string, FactValue> = {
    // 🔴 INVARIANT 1. Measured: `syncAudienceTierProjection` derives `holder` from
    //    `a:claimSubject`; with `holder` NULL, `rung_groups` is `[]`, the `atp.holder = requester`
    //    disjunct cannot fire, and THE HOLDER IS LOCKED OUT OF HIS OWN FIELD. That is Kai's
    //    `0 kept` arriving from the other side.
    [vocab.claimSubject]: { "@id": subject },
    [vocab.detailOf]: { "@id": compositeUri },
    // ⚠ GilbApp: ⛔ no `a:visibilityTier` (invariant 2 is MyNet's owner-profile rung) — see the header.
  };
  const text = texts[0];
  if (text) facts[spellingOf(vocab, text.term)] = (input[text.term] as string).trim();
  // ⚠ ONE place, ONE grain, ONE entity — and a SCALAR, ⛔ never a one-element array (a
  //   one-element array is a different jsonb value; `employmentStore.ts` records that mattering
  //   in production).
  else facts[vocab.claimPlace] = { "@id": (input.placeId as string).trim() };
  assertNoGrantPlane(facts, "placeFieldClaimFacts");
  return facts;
}


/**
 * 🔴 SELF READ-BACK GRANT, AT MINT — the `0 kept` fix, now load-bearing on N entities.
 *
 * ⚠ BARE PRINCIPAL STRING, ⛔ never `{"@id":…}`: Base compares that value as raw text
 * (`profileStore.ts:518`). The standing pin's SUBSTANCE binds here even though the pin's own
 * line anchor (`placeClaim.ts:260`) is mis-anchored — re-anchoring it is a standards write owed
 * to Kai / `/vaprocess`, ⛔ not mine.
 */
export const DIRECT_READER = "a:directReader";


/** W-MINT — one more address FIELD. */
export async function createPlaceFieldClaim(
  vaultId: string,
  subject: string,
  input: PlaceFieldClaimInput,
  vocab: PlaceVocab,
  compositeUri: string,
  /** The signed-in holder's principal — granted read on the row being minted. */
  readerPrincipal?: string,
): Promise<{ id: string; uri: string }> {
  if (!vaultId) {
    throw new PlaceFieldClaimError(
      0,
      "Refusing to mint an address field with no vault partition named — the write would fold onto the deployment's default vault and still answer 201.",
    );
  }
  // CHANGED (new, decision 2b): nothing is written to the place catalogue; asked before the first request, about the URL this POST goes to.
  assertNotCatalogue([createTarget(vaultId)]);
  const facts = placeFieldClaimFacts(input, subject, vocab, compositeUri);
  const reader = readerPrincipal?.trim();
  // ⚠ THE ONE PLACE IN THIS MODULE WHERE THE GRANT PLANE IS TOUCHED, and it is a CREATE.
  if (reader) facts[DIRECT_READER] = reader;
  const created = await createResource(vaultId, { type: vocab.fieldClaimType, facts });
  return { id: created.id, uri: created.location || created.id };
}


/** W-FIELD — amend ONE field claim's value. Siblings byte-untouched. */
export async function updatePlaceFieldClaim(
  vaultId: string,
  claimId: string,
  patch: PlaceTextValues & { placeId?: string },
  vocab: PlaceVocab,
  /** The field's own entity URI, so the write reaches the vault host that holds it (N4). */
  entityUri?: string,
): Promise<void> {
  const facts: Record<string, FactValue> = {};
  for (const { term } of PLACE_TEXT_SLOTS) {
    const v = patch[term];
    if (v !== undefined) facts[spellingOf(vocab, term)] = v.trim();
  }
  if (patch.placeId !== undefined) facts[vocab.claimPlace] = { "@id": patch.placeId };
  assertNoGrantPlane(facts, "updatePlaceFieldClaim");
  if (Object.keys(facts).length === 0) return;
  // CHANGED (new, decision 2b): the URL this PATCH goes to is not the catalogue's.
  assertNotCatalogue([resourceTarget(claimId, vaultId, entityUri)]);
  await patchResource(claimId, facts, vaultId, entityUri);
}


/** W-END — retract ONE field. ⚠ Clearing a field is the holder's own act; the other fields and
 *  the composite are byte-untouched, because the granularity of the write is the thing. */
export async function removePlaceFieldClaim(
  vaultId: string,
  claimId: string,
  /** The field's own entity URI, so the retract reaches the vault host that holds it (N4). */
  entityUri?: string,
): Promise<void> {
  // CHANGED (new, decision 2b): the URL this DELETE goes to is not the catalogue's.
  assertNotCatalogue([resourceTarget(claimId, vaultId, entityUri)]);
  await deleteResource(claimId, vaultId, entityUri);
}
