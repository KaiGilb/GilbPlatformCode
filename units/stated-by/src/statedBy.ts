/**
 * The edit and delete match for "who added this", pure and light so every held-claim module can use it without
 * pulling in the session or the vault list.
 *
 * THE COMPARISON IS OF THE FULL ADDRESS, not of the id tail: two cards that happen to share an id in two different vaults are two
 * different people. For `a:statedBy` the match is EXACT ({@link isStatedBy}); the lenient {@link sameIri} below stays for the contact-label
 * chips' `a:claimSubject` only (a different field, not a source).
 */
import { canonicalEntity } from "@kaigilb/gilbplatformcode-contact-kind-model";
import { expandRelationRef } from "@kaigilb/gilbplatformcode-kind-relation";

/**
 * One address in its comparable form.
 *
 * @param value the address as stored or served
 * @param docUri the address of the claim that carries it, to expand a compact `base:` form against (optional)
 */
export function comparableIri(value: string, docUri?: string | null): string {
  const t = value.trim();
  const expanded = t.startsWith("base:") && docUri ? (expandRelationRef(t, docUri) ?? t) : t;
  return canonicalEntity(expanded).replace("/vault/e/", "/base/e/");
}

/** True when two addresses are the same one (full address, normalised). */
export function sameIri(a: string | null | undefined, b: string | null | undefined, docUri?: string | null): boolean {
  return !!a?.trim() && !!b?.trim() && comparableIri(a, docUri) === comparableIri(b, docUri);
}

/**
 * The ONE place the app decides a held detail is the viewer's own: the claim's ONE `a:statedBy` is BYTE-EQUAL to the viewer's own card
 * address as the app knows it (the form it read from the card and writes under `a:statedBy`). No trimming, no slash, fragment or query
 * stripping, no host-case folding, no `/vault/e/` = `/base/e/` mapping, no `base:` expansion: a value in any other spelling is NOT the viewer's
 * (a spelling another person stored must never make the viewer see "Added by you" and a "Make private to me only" switch on that person's detail). Every held-detail
 * "own" (edit, delete, the private switch, "Added by you", who is asked about in the source-name batch) goes through here.
 *
 * A claim stated by a vault's card (an old one) or by another person is READ, never changed, by this viewer.
 *
 * @param statedBy every `a:statedBy` value the claim carries
 * @param card the viewer's own card IRI, or null when not known (then nothing is theirs)
 * @param _docUri unused (kept so callers need not change); no spelling is expanded any more
 */
export function isStatedBy(statedBy: readonly string[], card: string | null | undefined, _docUri?: string | null): boolean {
  return !!card && statedBy.length === 1 && statedBy[0] === card;
}
