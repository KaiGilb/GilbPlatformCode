export interface OntologyStatusLevel {
  value: string;
  label: string;
  admitsNewBinding: boolean;
  /** Omitted means ordinary ink. A blank string is also ordinary ink. */
  tone?: string;
  help?: string;
}

/**
 * Fallback levels when the store has not answered.
 * Order is the order a person reads: Suggested, then Approved, then Deprecated.
 * Approved has no tone on purpose. Colouring it would tint most of the page.
 * The Deprecated help must not contain the word the app was told to stop displaying.
 */
export const STATUS_SEED: readonly OntologyStatusLevel[] = [
  {
    value: "Suggested",
    label: "Suggested",
    admitsNewBinding: true,
    tone: "ok",
    help: "Added and usable, but not yet reviewed by a person. New data may be attached to it.",
  },
  {
    value: "Approved",
    label: "Approved",
    admitsNewBinding: true,
    help: "Reviewed by a person and accepted. New data may be attached to it.",
  },
  {
    value: "Deprecated",
    label: "Deprecated",
    admitsNewBinding: false,
    tone: "bad",
    help:
      "No longer current, but kept findable at the same address for good, so you can " +
      "still look it up and see that it was deprecated. New data must not be attached to it.",
  },
];

/** The seed's values, in seed order. */
export const SEED_STATUS_VALUES: readonly string[] = STATUS_SEED.map((s) => s.value);

/** Every level that admits new binding, in the order given. Not unique. Not lower-cased. */
export function bindableValues(levels: readonly OntologyStatusLevel[]): readonly string[] {
  return levels.filter((l) => l.admitsNewBinding).map((l) => l.value);
}

/**
 * The CSS variable for a status, or null for ordinary ink.
 * Omit `levels` to use the seed. An empty list is not the seed: every status is then null.
 * Match is case-insensitive. The level's own value is not trimmed.
 * A blank `tone` is ordinary ink, the same as a missing tone.
 */
export function statusTone(
  status: string | null | undefined,
  levels: readonly OntologyStatusLevel[] = STATUS_SEED,
): string | null {
  const s = (status || "").trim();
  if (!s) return null;
  const hit = levels.find((l) => l.value.toLowerCase() === s.toLowerCase());
  return hit?.tone ? `var(--${hit.tone})` : null;
}

export type NarrowingState = Readonly<Record<string, readonly string[]>>;

/**
 * Whether one row stays visible under the lifecycle cut.
 *
 * - Blank or whitespace status: shown. Not a hidden row.
 * - A status that is not in `knownValues` (case-insensitive): shown.
 * - Otherwise shown only when `selected` contains it, case-insensitive.
 *
 * The row status is trimmed. The selection strings are not.
 * An empty `knownValues` recognises nothing, so every row is shown.
 * Pass the seed values, or the live values. Do not pass [] to mean "use the seed".
 */
export function keepLifecycleStatus(
  status: string | null | undefined,
  selected: readonly string[],
  knownValues: readonly string[],
): boolean {
  const s = (status || "").trim();
  if (!s) return true;
  const recognised = knownValues.some((v) => v.toLowerCase() === s.toLowerCase());
  if (!recognised) return true;
  return selected.some((sel) => sel.toLowerCase() === s.toLowerCase());
}

/**
 * The disclosure sentence for the lifecycle cut.
 * `selected` is printed as given. `knownValues` supplies the hidden list, in that order.
 * When nothing is hidden, the sentence does not mention unrecorded standing.
 */
export function describeLifecycle(selected: readonly string[], knownValues: readonly string[]): string {
  const shown = selected.length > 0 ? selected.join(", ") : "none";
  const hidden = knownValues.filter(
    (v) => !selected.some((sel) => sel.toLowerCase() === v.toLowerCase()),
  );
  if (hidden.length === 0) {
    return `Lifecycle: showing every standing (${shown}).`;
  }
  return (
    `Lifecycle: showing ${shown}. ` +
    `${hidden.join(", ")} ${hidden.length === 1 ? "is" : "are"} hidden. ` +
    "Terms with no recorded standing are still listed."
  );
}

/**
 * Fold live levels into an existing lifecycle selection.
 *
 * - A missing key means the filter is off. The same state object is returned.
 *   This does not switch the filter on.
 * - An empty list is not a missing key. Levels the seed has not heard of are appended to it.
 * - Spellings are rewritten to the live level's value. The first live level that matches
 *   case-insensitively wins. A selection the live list does not know is kept as written.
 * - Nothing is removed.
 * - A level in `levels` whose value is not in `seedValues` (case-insensitive), and not
 *   already in the rewritten selection, is appended. `seedValues` defaults to the seed.
 *   Pass the seed list there, not the live list. If you pass the live list, nothing is new.
 * - When the rewritten list is byte-for-byte the current list, the same state object is returned.
 *
 * `filterId` defaults to `lifecycle`.
 */
export function reconcileLifecycleSelection(
  state: NarrowingState,
  levels: readonly OntologyStatusLevel[],
  seedValues: readonly string[] = SEED_STATUS_VALUES,
  filterId = "lifecycle",
): NarrowingState {
  const current = state[filterId];
  if (!current) return state;
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  const canonical = current.map((sel) => levels.find((l) => eq(l.value, sel))?.value ?? sel);
  const unknownToSeed = levels
    .map((l) => l.value)
    .filter((v) => !seedValues.some((s) => eq(s, v)))
    .filter((v) => !canonical.some((c) => eq(c, v)));

  const next = [...canonical, ...unknownToSeed];
  const unchanged = next.length === current.length && next.every((v, i) => v === current[i]);
  return unchanged ? state : { ...state, [filterId]: next };
}
