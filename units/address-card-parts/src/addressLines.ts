// The address lines below Street, the names the text fields are shown under, and the compact lines of a stored address.
// Taken from GilbApp `src/components/mynet/PlaceClaimsCard.tsx` (commit in the README). Changes are marked CHANGED.
import { PLACE_TEXT_SLOTS, type PlaceTextTerm } from "@kaigilb/gilbplatformcode-place-claims";
import type { PlaceClaimDraft } from "@kaigilb/gilbplatformcode-place-draft";
import { roleLabel } from "@kaigilb/gilbplatformcode-role-label";

/** The address lines below Street: every free-text slot but the street itself, from the one table. */
export const LINE_SLOTS = PLACE_TEXT_SLOTS.filter((r) => r.slot !== "street");

/** The term name in words (`addressLine1` -> "Address line1"). The same sentence-case split the app uses for any role (`role-label`), not a copy of it. */
export function termWords(term: string): string {
  return roleLabel(term);
}

/**
 * The name a free-text field is shown under: the master's own label ("Address 1"), never a string typed here. Until the vocabulary has
 * resolved it falls back to the term's own name split into words, so the box is never unlabelled.
 */
export function textFieldLabel(term: PlaceTextTerm, labels: Readonly<Record<string, string>> | undefined): string {
  return labels?.[term] ?? termWords(term);
}

export interface CompactLine {
  readonly key: string;
  readonly text: string;
  /** The picked country's catalogue id, on the "Region, Country" line only (its flag is drawn from it). */
  readonly countryId?: string;
}

/**
 * The filled parts of an address as compact lines, in the editor's order: Street, Address 1, Address 2, then "Postal Code City", then
 * "Region, Country". An empty part adds nothing: no line, no box, no label.
 */
export function compactLines(draft: PlaceClaimDraft): CompactLine[] {
  const out: CompactLine[] = [];
  const add = (key: string, parts: (string | null | undefined)[], sep: string, countryId?: string) => {
    const text = parts.map((x) => (x ?? "").trim()).filter((x) => x !== "").join(sep);
    if (text) out.push(countryId ? { key, text, countryId } : { key, text });
  };
  add("street", [draft.streetLine], "");
  add("line1", [draft.addressLine1], "");
  add("line2", [draft.addressLine2], "");
  add("postal-city", [draft.postalCode, draft.place.city?.label], " ");
  add("region-country", [draft.place.region?.label, draft.place.country?.label], ", ", draft.place.country?.id);
  return out;
}
