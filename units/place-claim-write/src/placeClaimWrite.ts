// The WRITE side of an address: the facts of an address, its create, its change and its removal, and the order its field claims are written in. Taken from
// GilbApp `src/lib/mynet/place/placeClaim.ts` (commit in the README), which was copied from MyNet's; the read side of that file is the unit `place-claims`'s.
// The changes are named in the README under "Changes from GilbApp" and each is marked `CHANGED` below.
//
// One address = one `t:PlaceClaim` composite (`a:claimSubject` · `a:placeClaimLabel`) with one `t:SelfAssertedFieldClaim` per field, written in the vault that
// HOLDS the person's record, with `a:claimSubject` = the person's RECORD. GilbApp writes NO rung (`a:visibilityTier`) on any of them.
import { createResource, deleteResource, getResource, patchResource, type FactValue } from "@kaigilb/gilbplatformcode-vault-resources";
import { entityUriInVault } from "@kaigilb/gilbplatformcode-vault-namespace";
import { idFromResourceUri } from "@kaigilb/gilbplatformcode-resource-id";
import { getPlace, resolveGeoGrains } from "@kaigilb/gilbplatformcode-geo-catalogue";
import { needsFieldMigration } from "@kaigilb/gilbplatformcode-place-lines";
import { resolvePlaceVocab, type ResolvedPlaceVocab as ResolvedProfileVocab } from "@kaigilb/gilbplatformcode-place-vocab";
import {
  EMPTY_ADDRESS_MESSAGE,
  PLACE_FIELD_SLOTS,
  PLACE_TEXT_SLOTS,
  PlaceClaimError,
  SharedAddressError,
  claimFieldText,
  claimSubjectsOf,
  listFieldClaimsDetailing,
  placeClaimHasContent,
  placeFieldValuesOf,
  termOfTextSlot,
  type PlaceClaim,
  type PlaceClaimInput,
  type PlaceFieldClaim,
  type PlaceFieldSlot,
  type PlaceTextValues,
} from "@kaigilb/gilbplatformcode-place-claims";
import { assertNotCatalogue, createTarget, resourceTarget } from "./geoFence";
import { DIRECT_READER, assertNoGrantPlane, createPlaceFieldClaim, removePlaceFieldClaim, updatePlaceFieldClaim } from "./placeFieldClaimWrite";

/** CHANGED (new): the sentences a person may be told when a write is refused here. Fixed text: no status, no server text, no term path, no address. */
export const OLDER_SHAPE_MESSAGE =
  "This address was stored in an older shape (its street and places on the address itself), which this screen cannot change without losing them. It can be removed.";
export const REMOVE_NOT_WHOLE_MESSAGE = "This address cannot be removed right now, because not every detail of it could be read. Nothing was removed.";

/** CHANGED (new): a refusal whose `sentence` is fit to be shown to the person as it is. Everything else a write throws is not. */
export class PlaceClaimRefusal extends PlaceClaimError {
  readonly sentence: string;
  constructor(sentence: string) {
    super(0, sentence);
    this.name = "PlaceClaimRefusal";
    this.sentence = sentence;
  }
}

/** CHANGED (new, decision 12): the address was created and one of its details was not. `made` is what exists now; `failure` is the detail's failure (for the log). */
export class PlaceClaimPartialError extends PlaceClaimError {
  readonly made: { id: string; uri: string; fieldIds: string[] };
  readonly failure: unknown;
  constructor(made: { id: string; uri: string; fieldIds: string[] }, failure: unknown) {
    super(0, "The address was saved, but one of its details was not.");
    this.name = "PlaceClaimPartialError";
    this.made = made;
    this.failure = failure;
  }
}

/**
 * CHANGED (new, decision 6): the composite patch of an amend. `{}` when the label stays as it was; the new label when it changed to a non-blank one;
 * `null` for the label ONLY when a non-blank label was cleared. Never `a:claimSubject`.
 */
export function placeClaimLabelPatch(claim: Pick<PlaceClaim, "label">, input: Pick<PlaceClaimInput, "label">, vocab: ResolvedProfileVocab): Record<string, FactValue | null> {
  const was = claim.label.trim();
  const now = input.label.trim();
  if (now === was) return {};
  const patch: Record<string, FactValue | null> = { [vocab.placeClaimLabel]: now === "" ? null : now };
  assertNoGrantPlane(patch, "placeClaimLabelPatch");
  return patch;
}



/** The facts one claim writes, keyed by the SERVED spellings — ⛔ never a guessed slug. */
export function placeClaimFacts(
  input: PlaceClaimInput,
  subject: string,
  vocab: ResolvedProfileVocab,
  /**
   * ⚠ `forAmend` changes ⛔ nothing about which predicates are written — only whether an EMPTIED
   * one is sent as `null` (clear it) or omitted (a CREATE simply has no such fact).
   * 🔴 ⛔ NO AUTHZ ATTRIBUTE MAY EVER ENTER THIS FUNCTION. BVedanta's fence, and it — ⛔ not the
   * read-back — is what makes the amend path safe: the read-back proves reachability-BY-ME and
   * can ⛔ never detect a WIDENED grant, so a grant composed here would fail dangerous. Re-invoke
   * BVedanta before composing one.
   */
): Record<string, FactValue> {
  const facts: Record<string, FactValue> = {
    // Reference-valued: the party the claim is about and by. ⛔ Never a copied-out name.
    [vocab.claimSubject]: { "@id": subject },
  };
  // ⚠ Cycle214 1e (Kai, 2026-10-14): the Location is OPTIONAL. A blank one is ⛔ not written on a
  //   create — an empty label would assert *"this address is named, and the name is nothing"* —
  //   and on an amend it is `null`, which clears a stored one (an ABSENT key would leave it).
  const label = input.label.trim();
  if (label !== "") facts[vocab.placeClaimLabel] = label;
  // ⚠ GilbApp: ⛔ no `a:visibilityTier` — see the header. (`opts.forAmend` otherwise changes
  //   nothing here: with no rung there is nothing else to omit.)
  assertNoGrantPlane(facts, "placeClaimFacts");
  return facts;
}


export async function createPlaceClaim(
  vaultId: string,
  subject: string,
  input: PlaceClaimInput,
  /** The signed-in holder's principal WebID — granted read on the row being minted. */
  readerPrincipal?: string,
): Promise<{ id: string; uri: string; fieldIds: string[] }> {
  if (!vaultId) {
    throw new PlaceClaimError(
      0,
      "Refusing to mint a place claim with no vault partition named — the write would fold onto the deployment's default vault and still answer 201.",
    );
  }
  if (!subject) {
    throw new PlaceClaimError(0, "Refusing to mint a place claim with no claim subject.");
  }
  // ⚠ An address with ANY part is stored (Kai, 2026-10-14); one with none is not an address.
  if (!placeClaimHasContent(input)) {
    throw new PlaceClaimError(0, "Refusing to mint an empty address: it has no Location, no typed line and no place.");
  }
  // CHANGED (new, decision 2b): nothing is written to the place catalogue; asked before the first request, about the URL the composite is POSTed to.
  assertNotCatalogue([createTarget(vaultId)]);
  const vocab = await resolvePlaceVocab();
  const facts = placeClaimFacts(input, subject, vocab);
  const reader = readerPrincipal?.trim();
  if (reader) facts[DIRECT_READER] = reader;
  const created = await createResource(vaultId, {
    // CREATE form — the short CURIE. ⛔ Never the bare query form here.
    type: vocab.placeClaimType,
    facts,
  });
  const uri = compositeEntityUri(created.id, created.location, vaultId);
  // 🔴 THEN ONE ENTITY PER FIELD, EACH WITH ITS OWN RUNG, EACH AT THE EXPLICIT `"private"`
  //    LITERAL unless the holder chose otherwise on that field. ⛔ Never absence — an entity
  //    with no live tier fact gets no projection row, the restrictive conjunct is vacuously
  //    true, and the field is default-permissive.
  // ⚠ The composite is minted FIRST because `a:detailOf` needs its uri. A field that fails to
  //   mint leaves an address whose read-back does not carry that field, so `factsSurvived` says
  //   NOT SAVED and the person keeps their typing — ⛔ nothing is destroyed either way.
  const fieldIds: string[] = [];
  for (const spec of fieldSpecs(input)) {
    try {
      const f = await createPlaceFieldClaim(
        vaultId,
        subject,
        placeFieldValuesOf(spec),
        vocab,
        uri,
        reader,
      );
      fieldIds.push(f.id);
    } catch (cause) {
      // CHANGED (new, decision 12): the address exists and one of its details was not written. GilbApp let the field's error through as if the whole
      // save had failed, with no word that an address was left behind. Not cleaned up (as GilbApp); SAID: `PlaceClaimPartialError` carries what was made.
      throw new PlaceClaimPartialError({ id: created.id, uri, fieldIds }, cause);
    }
  }
  return { id: created.id, uri, fieldIds };
}


/**
 * 🔴 THE ENTITY URI OF A JUST-MINTED COMPOSITE — what `a:detailOf` points at.
 *
 * ⚠ MEASURED ASYMMETRY, ⛔ not a guess: the create answers a `Location` of the **resource**
 * (`/lws/r/<id>`) while the read-back frames the **entity** (`/{vault|base}/e/<id>`). This app
 * already records that gap twice — `usePlaceClaims.save` notes `c.uri === written.uri` is
 * *"dead by construction"*, and `profileStore.ts` `profileEdgeUri` performs exactly this
 * rewrite for the profile pointer edge. ⇒ the same rewrite here, ⛔ not a second convention.
 *
 * ⚠ And nothing downstream trusts the SPELLING: {@link fieldsByComposite} matches on the opaque
 * id via `idFromResourceUri`, which accepts `/lws/r/`, `/base/e/`, `/vault/e/` and `base:e/` alike. A stored
 * edge in any of the three still groups. That belt is deliberate — a grouping that silently
 * matched nothing would render every migrated address as *"no fields"*, which is a false
 * surface, not a missing one.
 *
 * The segment comes FROM `vaultId` (the vault root). ⛔ Never paste `/base/e/` onto a user vault.
 */
export function compositeEntityUri(id: string, location: string, vaultId: string): string {
  if (/\/(?:base|vault)\/e\//.test(location)) return location;
  return entityUriInVault(vaultId, id);
}


/** One field the caller's input asks for.
 *  ⚠ Its value is under its term's name (`streetLine`, `addressLine1`, …) or `placeId` — exactly one. */
interface FieldSpec extends PlaceTextValues {
  readonly slot: PlaceFieldSlot;
  readonly placeId?: string;
}


/**
 * The fields one input asks for. ⚠ A slot with no value produces ⛔ NO entity: an empty field
 * claim would assert *"this address has a street line, and it is nothing"*, which is a fact the
 * person did not state.
 */
export function fieldSpecs(input: PlaceClaimInput): FieldSpec[] {
  const out: FieldSpec[] = [];
  // 🔴 The free-text fields, from the ONE table (street, Address 1, Address 2, Postal Code) — each its own spec.
  for (const { slot, term } of PLACE_TEXT_SLOTS) {
    const text = (input[term] ?? "").trim();
    if (text !== "") out.push({ slot, [term]: text });
  }
  // Coarse→fine, so a partial mint fails on the FINER field and the coarser ones already stand.
  for (const slot of ["country", "region", "city"] as const) {
    const id = input.place[slot]?.id;
    if (typeof id === "string" && id !== "") {
      out.push({ slot, placeId: id });
    }
  }
  return out;
}


/**
 * Which SLOT each stored place-field claim occupies, read off the CATALOGUE.
 *
 * 🔴 The grain is ⛔ never stored in the holder's vault — it is the catalogue term's own
 * `a:placeGrain` (`RuleBasepodFieldsFromFacts`). One place, one grain, one entity, and BaseGeo
 * resolves Oslo ⊂ Norway rather than the vault carrying a copied extent.
 *
 * ⚠ A field whose place will ⛔ not dereference, or whose grain this build cannot classify, gets
 * ⛔ NO slot — it is returned in `unslotted` and every write path refuses to touch that address,
 * because amending around a field you cannot place is how a place gets silently dropped.
 */
export async function slotsForFields(
  fields: readonly PlaceFieldClaim[],
): Promise<{ bySlot: Partial<Record<PlaceFieldSlot, PlaceFieldClaim>>; unslotted: PlaceFieldClaim[] }> {
  const bySlot: Partial<Record<PlaceFieldSlot, PlaceFieldClaim>> = {};
  const unslotted: PlaceFieldClaim[] = [];
  // ⚠ The catalogue is reached ONLY when there is a place to classify. An address with no place
  //   field must not fail because BaseGeo is unreachable — that would make an unrelated outage
  //   look like a defect in the person's own address.
  // ⚠ A free-text field (street, Address 1, Address 2, Postal Code) occupies the slot its own subject names.
  //   A SECOND field at one such slot is unslotted, ⛔ not silently overwritten.
  const slotText = (f: PlaceFieldClaim): boolean => {
    if (f.subject === "place") return false;
    // 🔴 F3 — a field this build cannot read has ⛔ no slot, so every write path refuses the address.
    if (f.subject === "unknown") {
      unslotted.push(f);
      return true;
    }
    if (bySlot[f.subject]) unslotted.push(f);
    else bySlot[f.subject] = f;
    return true;
  };
  if (!fields.some((f) => f.subject === "place")) {
    for (const f of fields) slotText(f);
    return { bySlot, unslotted };
  }
  const grains = await resolveGeoGrains();
  for (const f of fields) {
    if (slotText(f)) continue;
    const place = f.placeId ? await getPlace(f.placeId) : null;
    const slot = place ? grains.rungOf.get(place.type) : undefined;
    if (!slot) {
      unslotted.push(f);
      continue;
    }
    // ⚠ A SECOND field at a slot this editor has ONE control for is unslotted, ⛔ not silently
    //   overwritten: two cities at two rungs is lawful data and this screen cannot express it.
    if (bySlot[slot]) unslotted.push(f);
    else bySlot[slot] = f;
  }
  return { bySlot, unslotted };
}


/** One write the per-field amend will perform. Pure data, so the plan can be asserted without
 *  a store — and so a mutation to the planner goes red by name. */
export type FieldWrite =
  | ({ readonly op: "mint"; readonly slot: PlaceFieldSlot; readonly placeId?: string } & PlaceTextValues)
  | ({ readonly op: "patch"; readonly slot: PlaceFieldSlot; readonly id: string; readonly placeId?: string } & PlaceTextValues)
  | { readonly op: "retract"; readonly slot: PlaceFieldSlot; readonly id: string };


/**
 * 🔴 THE PER-FIELD AMEND PLAN — what changes on WHICH field, and nothing else.
 *
 * ⚠ Every write is scoped to ONE field entity, so amending the street cannot touch the city's
 * rung and choosing a city's rung cannot touch the street's text. That independence is the whole
 * point of the decomposition and it is asserted here rather than hoped for.
 *
 * ⚠ A field the person CLEARED is RETRACTED (its entity deleted), ⛔ not patched to `""`: an
 * empty field claim asserts *"there is a street line, and it is nothing"*, which is a fact the
 * person did not state, and it would still carry a rung nothing governs.
 */
export function planFieldWrites(
  current: Partial<Record<PlaceFieldSlot, PlaceFieldClaim>>,
  input: PlaceClaimInput,
): FieldWrite[] {
  const out: FieldWrite[] = [];
  const desired = new Map<PlaceFieldSlot, PlaceTextValues & { placeId?: string }>();
  for (const spec of fieldSpecs(input)) {
    desired.set(spec.slot, placeFieldValuesOf(spec));
  }
  for (const slot of PLACE_FIELD_SLOTS) {
    const have = current[slot];
    // ⚠ A text field the caller did not NAME (key absent) is left exactly as stored — ⛔ not read
    //   as "cleared". Only the street is always named (`PlaceClaimInput.streetLine` is required).
    const named = termOfTextSlot(slot);
    if (named !== null && input[named] === undefined) continue;
    const want = desired.get(slot);
    if (!want) {
      // 🔴 RETRACTED, ⛔ NOT patched to `""`. A field claim emptied in place KEEPS its entity and
      //    KEEPS its `a:visibilityTier`, so a rung goes on governing a fact the person deleted —
      //    and a row carrying no field reads back as an `"unknown"` child that blocks every later
      //    amend of the address (before F3 it was dropped: INVISIBLE to this app while staying
      //    READABLE in the store). That is the worst state this facet can produce, and it is the same one
      //    `removePlaceClaim`'s fields-first ordering exists to prevent, reached from the other
      //    side. ⚠ An empty field claim would also assert *"there is a street line, and it is
      //    nothing"* — a fact the person did not state.
      if (have) out.push({ op: "retract", slot, id: have.id });
      continue;
    }
    if (!have) {
      out.push({ op: "mint", slot, ...want });
      continue;
    }
    // ⚠ The slot's OWN value only: a text slot compares its term's text, a place slot its id.
    const term = termOfTextSlot(slot);
    const valueChanged =
      (term !== null && want[term] !== undefined && want[term] !== (have[term] ?? "")) ||
      (want.placeId !== undefined && want.placeId !== have.placeId);
    if (!valueChanged) continue;
    out.push({ op: "patch", slot, id: have.id, ...want });
  }
  return out;
}


/**
 * W-FIELD — amend ONE address: the composite's label/rung, and each FIELD independently.
 *
 * Siblings are byte-untouched: every write is a JSON Merge Patch of only the keys that changed on
 * only the entity that changed (`Rule_Code_base-record-io#RuleBaseioNoReadReplaceRoundTrip`).
 *
 * 🔴 IT REFUSES ON AN ADDRESS IT CANNOT PLACE. A field whose catalogue place will not dereference
 * or whose grain this build cannot classify makes the whole plan unsafe — amending around it is
 * how a place gets silently dropped from a person's vault, which is worse than a false message
 * because it rewrites the store.
 */
export async function updatePlaceClaim(
  vaultId: string,
  claim: PlaceClaim,
  subject: string,
  input: PlaceClaimInput,
  /** The holder's principal — granted read on any field entity minted during this amend. */
  readerPrincipal?: string,
): Promise<void> {
  // 🔴 F4 (Agent.Scaling) — THE ANY-PART RULE LIVES HERE TOO, ⛔ not only in the card: the same
  //    rule `createPlaceClaim` applies, so no caller can amend an address into an empty one. A text
  //    field this input does not NAME is left as stored, so it still counts as content.
  const after: { -readonly [K in keyof PlaceClaimInput]: PlaceClaimInput[K] } = { ...input };
  for (const { term } of PLACE_TEXT_SLOTS) {
    if (after[term] === undefined) after[term] = claimFieldText(claim, term);
  }
  if (!placeClaimHasContent(after)) throw new PlaceClaimRefusal(EMPTY_ADDRESS_MESSAGE);
  // 🔴 REFUSES ON AN UN-MIGRATED ADDRESS, and this is the fence that stops a DISPLACEMENT.
  //    A composite still carrying `a:streetLine` / `a:memberOf` has ⛔ no field claims, so every
  //    field this amend wrote would be a MINT — at `{ kind: "new" }`, i.e. `private`. For an
  //    address whose stored rung is `t:PersonalCloseCircleGrantee` (two of Kai's four live ones,
  //    a rung he set HIMSELF) that would narrow his reach without an act of his.
  //    ⇒ the caller migrates first, inheriting the stored rung VERBATIM. See
  //    {@link migratePlaceClaimToFields}.
  if (needsFieldMigration(claim)) {
    throw new PlaceClaimRefusal(OLDER_SHAPE_MESSAGE);
  }
  const compositeUri = compositeEntityUri(claim.id, claim.uri, vaultId);
  // CHANGED (new, decision 2b): nothing is written to the place catalogue. Asked before the first request (the grain and place reads below are GETs), about every
  // URL this change can send a write to: the composite, each field it can patch or retract, and the container a new field is POSTed to.
  assertNotCatalogue([
    createTarget(vaultId),
    resourceTarget(claim.id, vaultId, compositeUri),
    ...claim.fields.map((f) => resourceTarget(f.id, vaultId, f.uri)),
  ]);
  const vocab = await resolvePlaceVocab();
  // Merge-patch takes the ATTRIBUTES directly — ⛔ not a `{ facts: … }` envelope (that is the
  // CREATE body's shape, and sending it here would store a literal `facts` attribute).
  // 🔴 N4 (Agent.Tester, Cycle214 1c): every write names the entity's OWN address, so it reaches
  //    the vault host that holds it. Without it the PATCH went to the main host and answered 404.
  // ⚠ F4 (Agent.Scaling): the slots are checked BEFORE anything is written, so a refused amend
  //   changes nothing — it used to patch the composite (clearing a blanked Location) and THEN refuse.
  const { bySlot, unslotted } = await slotsForFields(claim.fields);
  if (unslotted.length > 0) {
    throw new PlaceClaimRefusal(
      `${unslotted.length === 1 ? "One detail of this address" : `${unslotted.length} details of this address`} cannot be placed on this screen, and changing it here would drop ${unslotted.length === 1 ? "it" : "them"}. Nothing was changed.`,
    );
  }
  // CHANGED (decision 6, the amend wire): ONLY what the act changed. GilbApp patched the composite on every amend, with `a:claimSubject` re-sent and
  // `a:placeClaimLabel` as `null` whenever the label was blank, changed or not. Now: `a:claimSubject` is NEVER sent on an amend (the address is already about
  // this record); the label only when it changed (a value, or `null` ONLY when a non-blank label was cleared); a label that stays as it was sends nothing, and
  // with nothing to say about the composite there is no request for it at all.
  const labelPatch = placeClaimLabelPatch(claim, input, vocab);
  if (Object.keys(labelPatch).length > 0) await patchResource(claim.id, labelPatch, vaultId, compositeUri);
  const uri = compositeUri;
  for (const w of planFieldWrites(bySlot, input)) {
    if (w.op === "retract") await removePlaceFieldClaim(vaultId, w.id, bySlot[w.slot]?.uri);
    else if (w.op === "patch") {
      await updatePlaceFieldClaim(
        vaultId,
        w.id,
        placeFieldValuesOf(w),
        vocab,
        bySlot[w.slot]?.uri,
      );
    } else {
      await createPlaceFieldClaim(
        vaultId,
        subject,
        placeFieldValuesOf(w),
        vocab,
        uri,
        readerPrincipal?.trim(),
      );
    }
  }
}


/**
 * W-END — retract ONE address.
 *
 * ⚠ Retracting one leaves the other N−1 present, labelled and distinguishable, because each is
 * its own entity: the granularity of the write is the granularity of the thing.
 */
export async function removePlaceClaim(
  vaultId: string,
  claim: PlaceClaim,
  /** The record whose card Remove is pressed on. Remove refuses an address that names anyone
   *  else too (Q2). */
  cardSubject: string,
): Promise<void> {
  // 🔴 THE FIELDS GO FIRST, AND THE ORDER IS THE SAFETY PROPERTY — it is the MIRROR of the
  //    migration's, and for the mirror reason.
  //
  // ⚠ Retracting the composite first would leave every field claim ORPHANED: `a:detailOf` would
  //   point at nothing, so `listMyPlaceClaims` would stop grouping them and they would vanish
  //   from every surface — while still existing, still carrying the person's street text, and
  //   still carrying the grants their rungs admit. **A fact that is gone from the screen and
  //   readable in the store is the worst state this facet can produce.** Fields first, composite
  //   last, so a failure part-way leaves an address the person can still see and retry on.
  // 🔴 F3 (Agent.Scaling) — EVERY field record that is part of this address, ⛔ not only the ones
  //    the last read could show: the store is asked again, at Remove, for every record whose
  //    `a:detailOf` names this address, whatever field it holds (a field kind a newer build added,
  //    one this build cannot read, one written since the last read). Each was left orphaned before.
  // 🔴 R1 (Agent.Scaling) — a part is a record whose `a:detailOf` names this address by id (on any
  //    host, as the read groups it) and whose `a:claimSubject` is the address's own, compared by
  //    opaque id exactly as `claimsAbout` does (or names no one, as the read still shows it). N2
  //    compared the subjects as exact strings and added a host rule the read did not have, so a
  //    part under another spelling of the same record, with no subject, or on another host was
  //    left behind, invisible and readable. See `isPartOfAddress`.
  // 🔴 N2 (Kai-Zen's decision) still holds — ⛔ NEVER DELETE ANOTHER PERSON'S DATA. The address's
  //    subject is read fresh off the composite here, ⛔ not taken from the last read. A record that
  //    names this address but is about someone else is left exactly as it is, and a warning is
  //    logged. See `listFieldClaimsDetailing`.
  //    ⚠ Records in the holder's own vault — ⛔ nothing here touches a pod.
  const compositeUri = compositeEntityUri(claim.id, claim.uri, vaultId);
  // CHANGED (new, decision 2b): nothing is written to the place catalogue. Asked before the first request (the read of the address below is a GET), about
  // every URL this remove can send a DELETE to: the composite and each field it is known to have.
  assertNotCatalogue([resourceTarget(claim.id, vaultId, compositeUri), ...claim.fields.map((f) => resourceTarget(f.id, vaultId, f.uri))]);
  const vocab = await resolvePlaceVocab();
  const { doc } = await getResource(claim.id, vaultId, compositeUri);
  const subjects = claimSubjectsOf(doc as Record<string, unknown>, vocab);
  // 🔴 Q2 (Agent.Scaling delta 3, M1; Kai-Zen, option 1) — ONE CARD MAY NOT REMOVE A SHARED
  //    ADDRESS. If the address names anyone besides this card's record (by id, as `claimsAbout`
  //    compares), or a subject this app cannot read (Q1), Remove refuses BEFORE ANY DELETE. Before,
  //    it deleted the address and every part about the other person too, and that person's card
  //    then showed nothing.
  const card = cardSubject ? idFromResourceUri(cardSubject) : "";
  if (!card || subjects === null || subjects.some((s) => idFromResourceUri(s) !== card)) {
    throw new SharedAddressError();
  }
  const detailing = await listFieldClaimsDetailing(vaultId, vocab, { id: claim.id, subjects });
  // CHANGED (F4): a remove that works from an INCOMPLETE listing of the field claims would delete the address and leave the parts it never saw. Nothing is
  // deleted until the listing is whole; GilbApp ended its listing quietly at the ceiling and deleted on.
  if (!detailing.complete) throw new PlaceClaimRefusal(REMOVE_NOT_WHOLE_MESSAGE);
  const { parts, otherSubject } = detailing;
  for (const r of otherSubject) {
    console.warn(
      `Address ${claim.id} removed without record ${r.id}: it details this address but is about ` +
        `${r.subjects === null ? "a subject this app cannot read" : r.subjects.length ? r.subjects.join(", ") : "no one"}, ⛔ not ${subjects.length ? subjects.join(", ") : "no one"}, so it was left as it is.`,
    );
  }
  // CHANGED (new, decision 2b): every part found is checked before the first DELETE, so a part under the catalogue stops the remove with nothing deleted.
  assertNotCatalogue(parts.map((p) => resourceTarget(p.id, vaultId, p.uri)));
  for (const p of parts) {
    await removePlaceFieldClaim(vaultId, p.id, p.uri);
  }
  await deleteResource(claim.id, vaultId, compositeUri);
}
