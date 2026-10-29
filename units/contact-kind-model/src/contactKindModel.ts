/**
 * The kind-of-contact chips' pure rules.
 *
 * Two label axes, neither a grant: a CIRCLE LABEL (`a:circleLabel` over `t:CircleLabel`: Personal / Professional x 1st Connection / Inner
 * Circle) and a RELATIONSHIP KIND (`a:relationshipKind` over `t:RelationshipKind`: Customer, Friend ...). In one app the circle chip means
 * ACCESS (a circle membership); in another it is a LABEL ("what kind of contact this is"). The words and the look are the same; this
 * file knows neither meaning: it only orders, filters and names.
 *
 * ⛔ Nothing here names an entry, a type or a kind: every entry is read from the master (`contactKindCatalogue.ts`).
 */

/** The two label axes: the term NAMES asked of the master (`a/circleLabel`, `a/relationshipKind`). */
export type LabelAxis = "circleLabel" | "relationshipKind";

/** One entry of a catalogue (`t:CircleLabel`, `t:RelationshipKind`): the master's own, or one a holder wrote in their own vault. */
export interface CatalogueEntry {
  /** The entry's address: what a claim's `a:circleLabel` / `a:relationshipKind` references. */
  id: string;
  label: string;
  /** `a:labelOrder`; null when the entry carries none. */
  order: number | null;
  /** `a:playableBy`, as TYPE addresses (`…/base/t/Person`); empty = offered for every record type. */
  playableBy: string[];
  axis: LabelAxis;
  /** True for a kind the holder wrote in their own vault. */
  own: boolean;
}

/** How a chip looks. Only a look: nothing reads it as access. */
export type ChipTone = "personal" | "professional" | "neutral";

/** One chip on a card. */
export interface ContactChip {
  /** Stable key: the claim's id for a stored label, else `axis:entryId`. */
  key: string;
  axis: LabelAxis;
  entryId: string;
  label: string;
  tone: ChipTone;
  /** The claim that stores it. Absent for a circle membership (removed through its own door). */
  claimId?: string;
  /** The viewer did not state this chip (another person, or an old vault card, did): it reads and has no remove. */
  readOnly?: boolean;
}

/** By `a:labelOrder`; entries with none after them, by name (a holder's own kind with no order goes last). Never mutates. */
export function orderEntries(entries: readonly CatalogueEntry[]): CatalogueEntry[] {
  return [...entries].sort((a, b) => {
    if (a.order !== null && b.order !== null && a.order !== b.order) return a.order - b.order;
    if ((a.order === null) !== (b.order === null)) return a.order === null ? 1 : -1;
    return a.label.localeCompare(b.label);
  });
}

/**
 * The entries that fit a record of a type. `types` is the record's type AND every type above it by is-a (the caller expands it:
 * a kind declared for Person is offered on any person sub-type). An entry with no declared type is offered for every record. With NO
 * type known (an empty set) only those are offered: a kind is ⛔ never guessed to fit.
 */
export function offeredFor(entries: readonly CatalogueEntry[], types: ReadonlySet<string>): CatalogueEntry[] {
  return entries.filter((x) => x.playableBy.length === 0 || x.playableBy.some((t) => types.has(t)));
}

/** A label appears at most once on a contact: what is already on it is not offered again. */
export function notYetChosen(entries: readonly CatalogueEntry[], chosen: ReadonlySet<string>): CatalogueEntry[] {
  return entries.filter((x) => !chosen.has(x.id));
}

/** The colour of a circle label: Personal green, Professional blue; anything else neutral. A look only. */
export function toneOfCircleLabel(label: string): ChipTone {
  const word = label.trim().toLowerCase();
  if (word.startsWith("personal")) return "personal";
  if (word.startsWith("professional")) return "professional";
  return "neutral";
}

/** The words on a chip: the middle dot is dropped ("Professional Inner Circle"). */
export function chipText(label: string): string {
  return label.replace(" · ", " ");
}

/** The predicate a kind chip stands for (`a:kindPredicate`): its CURIE, the predicate term's own `a:typeAttribute` (`t:FriendOf`), ⛔ never built from an address. */
export interface KindPredicate {
  curie: string;
}

/**
 * A catalogue entry as the kind-relation code reads it: the entry above, with the two relation fields on top of it.
 */
export type KindEntry = CatalogueEntry & {
  /** `a:kindPredicate`, resolved. `undefined` = the entry names none (a plain label); `null` = it names one that could not be read (offered as nothing). */
  kindPredicate?: KindPredicate | null;
  /** `a:kindForVault`, as TYPE addresses: the kinds of vault this chip may be said toward. Empty or absent = none declared. */
  kindForVault?: string[];
  /** The default tie (associated-with): not a catalogue entry of the master, made here from the user-plane term. */
  defaultTie?: boolean;
};
