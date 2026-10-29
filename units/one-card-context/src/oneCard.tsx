/**
 * The merged person card for the rows below it. A person linked to an online card is one card: their online card is the master and the
 * holder adds their own fields to it. This file wires the shared pieces and nothing more.
 *   - The merge is `mergeOneCard` (one-card-merge): which row is theirs, which values are equal, what is hidden. No compare here.
 *   - The rows and marks are drawn by one-card-rows (`TheirRows`, `YourRow`, `OwnBlockMark`, `BothKeptLine`).
 *   - Here: which of the card's OWN groups each merged group is drawn in (`placeOneCard`, by the field's term), and a context the card's
 *     groups and own editors read. The own editors are unchanged: they keep writing exactly as they did; a value of yours equal to theirs
 *     is not drawn twice while the card is presented (the merge folded it into their row, which says "You have the same on your card"),
 *     and in Edit it is there to change, as before.
 *
 * The holder's own values go in as the record's SERVED facts, one value per entry: never a record's joined facts, which join several
 * values with ", ", so "a@x, b@y" would be one value and never match.
 * No request is added: the merge is pure, its inputs are what the card already read. Held claims (interests, a skill's note) are not
 * passed in: their reads stay where they are.
 */
import { createContext, useContext, type ReactNode } from "react";
import { mergeOneCard, type OneCard, type OneCardField, type OneCardGroup, type OneCardRow, type OwnAddress } from "@kaigilb/gilbplatformcode-one-card-merge";
import type { OnlineCard } from "@kaigilb/gilbplatformcode-online-card";
import { YourRow } from "@kaigilb/gilbplatformcode-one-card-rows";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";

/** How a group of the card marks its own rows: each own editor carries its mark ("rows"), one mark for the group's own block ("block"),
 *  or none (My Note and Where / How we met say "Private" themselves). */
export type OwnMarks = "rows" | "block" | "none";

/** The card's group kinds whose own editors carry a mark each (the per-row editors this card draws itself). */
const ROW_MARKED: ReadonlySet<string> = new Set(["name", "record", "time-zone", "details", "email", "phone", "social", "skill"]);
/** Groups that say "Private" themselves and carry no mark (the mockup). */
const UNMARKED: ReadonlySet<string> = new Set(["my-note", "how-we-met"]);

export function ownMarksOf(kind: string): OwnMarks {
  if (UNMARKED.has(kind)) return "none";
  return ROW_MARKED.has(kind) ? "rows" : "block";
}

/** One group of the card as the one card draws it: the merged groups placed in it. */
export interface PlacedGroup {
  /** The card's own group kind ("name", "email", "record" ...), or `theirs:<predicate>` for a field the card draws nowhere else. */
  kind: string;
  groups: OneCardGroup[];
}

/** Where the card draws a field: the card's own group kind for a term, or null (drawn in a group of its own). */
export type GroupOfTerm = (group: OneCardGroup) => string | null;

/**
 * Which of the card's groups each merged group is drawn in, in the merge's order.
 *
 * @param card the merge's output
 * @param groupOf the card's own group for a merged group (by its term), or null: then it gets a group of its own after the card's groups
 * @param skip merged groups the body does not draw (the photo: it is the header's picture)
 * @param order the card's own position of a merged group's field, for a group that holds several fields
 * @returns the placed groups keyed by kind, and the kinds of the groups of their own, in order
 */
export function placeOneCard(
  card: OneCard,
  groupOf: GroupOfTerm,
  skip: (group: OneCardGroup) => boolean = () => false,
  order: (group: OneCardGroup) => number = () => 0,
): { byKind: Map<string, PlacedGroup>; own: string[] } {
  const byKind = new Map<string, PlacedGroup>();
  const own: string[] = [];
  for (const g of card.groups) {
    if (skip(g)) continue;
    let kind = groupOf(g);
    if (!kind) {
      kind = `theirs:${g.field}`;
      // Only a group with a row of theirs needs a group of its own: a value of yours the card draws nowhere is not a card row.
      if (!g.rows.some((r) => r.source === "theirs")) continue;
      if (!byKind.has(kind)) own.push(kind);
    }
    const p = byKind.get(kind) ?? { kind, groups: [] };
    p.groups.push(g);
    byKind.set(kind, p);
  }
  // In a group that holds several fields, their rows follow the card's own order of those fields (the name: given, then family).
  for (const p of byKind.values()) p.groups.sort((a, b) => order(a) - order(b));
  return { byKind, own };
}

export interface OneCardView {
  /** Two sources: draw the marks. */
  marks: boolean;
  byKind: ReadonlyMap<string, PlacedGroup>;
  /** The kinds of the groups of their own (fields of theirs the card draws in no group of its own), in the merge's order. */
  own: readonly string[];
  /** The label a theirs row shows in a group that holds several fields; null: none (the group's title names it). */
  rowLabel(kind: string, group: OneCardGroup): string | null;
  /** A theirs value as the card words it (a skill by its name). */
  valueText(row: OneCardRow): ReactNode;
}

const OneCardContext = createContext<OneCardView | null>(null);

export function OneCardProvider({ view, children }: { view: OneCardView | null; children: ReactNode }) {
  return <OneCardContext.Provider value={view}>{children}</OneCardContext.Provider>;
}

/** The one card, or null outside it (an organization, any other record). A person with no online card has a view with `marks` false. */
export function useOneCard(): OneCardView | null {
  return useContext(OneCardContext);
}

/** The theirs rows of one card group and how its own rows are marked; null outside the one card. */
export function useOneCardGroup(kind: string): { groups: OneCardGroup[]; theirs: boolean; bothKept: boolean; ownMarks: OwnMarks; marks: boolean } | null {
  const view = useOneCard();
  if (!view) return null;
  const groups = view.byKind.get(kind)?.groups ?? [];
  return {
    groups,
    theirs: groups.some((g) => g.rows.some((r) => r.source === "theirs")),
    bothKept: groups.some((g) => g.bothKept),
    ownMarks: ownMarksOf(kind),
    marks: view.marks,
  };
}

/**
 * Is a value of yours folded into a row of theirs (the merge found it equal), so the presented card does not draw it twice?
 * Read from the merge's output only: a group that has a theirs row marked `sameAsTheirs` and no row of yours with this value.
 * No compare here: the merge decided which of your values stand as rows of their own.
 */
export function foldedInto(groups: readonly OneCardGroup[], value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (!groups.some((g) => g.rows.some((r) => r.sameAsTheirs))) return false;
  return !groups.some((g) => g.rows.some((r) => r.source === "yours" && r.value.trim() === v));
}

/** For an own editor: the one card's marks and whether its value is folded into a theirs row; null outside the one card. */
export function useOneCardOwn(kind: string, term?: string | null): { marks: boolean; folded(value: string): boolean } | null {
  const view = useOneCard();
  if (!view) return null;
  const all = view.byKind.get(kind)?.groups ?? [];
  const groups = term ? all.filter((g) => g.term === term) : all;
  return { marks: view.marks, folded: (value: string) => foldedInto(groups, value) };
}

/**
 * One of the card's own field editors in the one card: the Yours · private mark beside it, and not drawn while the card is presented
 * when the merge folded its value into a row of theirs. Outside the one card it is the editor alone.
 */
export function OwnFieldRow({ kind, term, value, fold = true, children }: { kind: string; term?: string | null; value: string; fold?: boolean; children: ReactNode }) {
  const own = useOneCardOwn(kind, term);
  const mode = useCardMode();
  const present = mode.managed && mode.presentation;
  if (!own) return <>{children}</>;
  // An empty value is not drawn while presented (the editor itself draws nothing then): no stray mark either.
  if (present && !value.trim()) return <>{children}</>;
  if (present && fold && own.folded(value)) return null;
  return <YourRow marks={own.marks}>{children}</YourRow>;
}

/**
 * May this group offer "+ Add your own" in place? Only on the one card (their card is read: a merge was
 * made), while the card is presented (in Edit the group's own add control is there), and only when the holder may write here
 * (`canEdit`: a read-only holder sees no add). The editor and the write behind the button are the group's own, unchanged.
 */
export function useAddInPlace(canEdit: boolean): boolean {
  const view = useOneCard();
  const mode = useCardMode();
  // A one card with ONE source (no online card: `marks` false) has nothing of theirs to add "your own" beside; "+ Add Information"
  // and the group's own add in Edit are there, as today.
  return !!view && view.marks && canEdit && mode.managed && mode.presentation;
}

/** The merge's input from what the card already holds. `online` null: no online card, one source, no marks. */
export function oneCardOf(input: {
  online: OnlineCard | null;
  servedFacts: Record<string, unknown>;
  fieldOrder: readonly OneCardField[];
  skillPredicate: string | null;
  /** The address field's write spelling, and the holder's held addresses of this person. */
  addressPredicate?: string | null;
  addresses?: readonly OwnAddress[];
}): OneCard {
  return mergeOneCard({
    online: input.online,
    own: { facts: input.servedFacts, addresses: input.addresses ?? [] },
    fieldOrder: input.fieldOrder,
    skillPredicate: input.skillPredicate,
    addressPredicate: input.addressPredicate ?? null,
  });
}

/**
 * The held claims (by entity) the merge folded into a row of theirs in this group ("You have the same on your card"), so an
 * editor that draws one block per claim (the addresses) does not draw them twice while the card is presented. Read from the merge's
 * output only. Empty outside the one card.
 */
export function useFoldedClaims(kind: string): ReadonlySet<string> {
  const view = useOneCard();
  const groups = view?.byKind.get(kind)?.groups ?? [];
  const out = new Set<string>();
  for (const g of groups) for (const r of g.rows) if (r.source === "theirs" && r.sameAsTheirs) for (const c of r.claims ?? []) out.add(c);
  return out;
}
