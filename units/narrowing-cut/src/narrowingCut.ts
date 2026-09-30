/**
 * The filter mechanism for a three-column list the host already holds.
 *
 * This unit does not know which filters exist. The host passes them.
 * A lifecycle filter and a "used in apps" filter stay in the app, because
 * those are registry entries, not the mechanism.
 *
 * Offering and cutting are the same list. Pass `filtersForView` into the
 * bar and into `applyNarrowing`. A different list for each is a cut with
 * no control, or a control that does not cut.
 */

export type NarrowingView = "hierarchy" | "search";

export type NarrowingState = Readonly<Record<string, readonly string[]>>;

export type PreparedByFilter = Readonly<Record<string, unknown>>;

export interface NarrowingColumns<T> {
  types: T[];
  functions: T[];
  values: T[];
}

export interface NarrowingOption {
  id: string;
  label: string;
  help?: string;
}

/**
 * One filter, as data.
 *
 * `prepare` is one batch for the whole displayed set. There is no per-row
 * fetch here. Omit `prepare` when the row already carries what `keep` needs.
 *
 * `defaultSelection` omitted, or empty, means the filter starts off.
 * A default that is on is a cut nobody clicked. The disclosure still has
 * to say so. This unit does not render that sentence. `describe` returns it.
 */
export interface NarrowingFilter<T> {
  id: string;
  label: string;
  help?: string;
  control: "toggle" | "multi";
  defaultSelection?: readonly string[];
  /** Omit means every view. An empty list means no view. */
  offeredIn?: readonly NarrowingView[];
  options?: (items: readonly T[], prepared: unknown) => NarrowingOption[];
  prepare?: (items: readonly T[]) => Promise<unknown>;
  keep: (item: T, selected: readonly string[], prepared: unknown) => boolean;
  describe: (selected: readonly string[], prepared: unknown) => string;
}

export interface NarrowingOutcome<T> {
  columns: NarrowingColumns<T>;
  removed: { types: number; functions: number; values: number; total: number };
  /**
   * Rows this filter would remove from the uncut list.
   * Two filters that remove the same row each count it.
   * This is not a cascade.
   */
  byFilter: Record<string, number>;
  notes: string[];
}

/** The selection a toggle stores when it is on. A toggle has no option list. */
export const TOGGLE_ON: readonly string[] = ["on"];

/**
 * True when this filter id has a selection of length greater than 0.
 * A missing id is off. `[]` is off. `[""]` is on. Blank text is not special.
 */
export function isFilterActive(state: NarrowingState, id: string): boolean {
  return (state[id]?.length ?? 0) > 0;
}

/**
 * Filters offered in this view.
 * A filter with no `offeredIn` is offered in every view.
 * The objects are the same objects. This does not copy them.
 */
export function filtersForView<T>(
  mode: NarrowingView,
  filters: readonly NarrowingFilter<T>[],
): readonly NarrowingFilter<T>[] {
  return filters.filter((filter) => !filter.offeredIn || filter.offeredIn.includes(mode));
}

/**
 * The state the view opens with.
 * Only a filter whose `defaultSelection` has length greater than 0 is present.
 * A filter without a default is absent, not present-and-empty, so
 * `isFilterActive` still reads it as off.
 * Each selection is a new array.
 */
export function defaultNarrowingState<T>(filters: readonly NarrowingFilter<T>[]): NarrowingState {
  const state: Record<string, readonly string[]> = {};
  for (const filter of filters) {
    if (filter.defaultSelection && filter.defaultSelection.length > 0) {
      state[filter.id] = [...filter.defaultSelection];
    }
  }
  return state;
}

/** Types, then functions, then values. A new array. */
export function flattenColumns<T>(columns: NarrowingColumns<T>): T[] {
  return [...columns.types, ...columns.functions, ...columns.values];
}

/**
 * Apply the active filters that are ready.
 *
 * A filter is active when its selection length is greater than 0.
 * A filter is ready when it has no `prepare`, or `prepared` has that id
 * (`id in prepared`, which counts an inherited key). A value of `null`
 * still counts as ready. The row list is not emptied while a prepare
 * has not landed.
 *
 * `keep` is called with `prepared[id]`, or `null` when that value is
 * null or undefined. `0` and `""` are passed through.
 *
 * The input columns are not mutated. Removal counts are the difference
 * in length. `byFilter` counts each ready filter against the uncut list.
 * `notes` is `describe` for each ready filter, in the order of `filters`.
 */
export function applyNarrowing<T>(
  columns: NarrowingColumns<T>,
  state: NarrowingState,
  prepared: PreparedByFilter,
  filters: readonly NarrowingFilter<T>[],
): NarrowingOutcome<T> {
  const active = filters.filter((filter) => isFilterActive(state, filter.id));
  const ready = active.filter((filter) => filter.prepare === undefined || filter.id in prepared);

  const keepAll = (items: readonly T[]): T[] =>
    items.filter((item) =>
      ready.every((filter) => filter.keep(item, state[filter.id] ?? [], prepared[filter.id] ?? null)),
    );

  const next: NarrowingColumns<T> = {
    types: keepAll(columns.types),
    functions: keepAll(columns.functions),
    values: keepAll(columns.values),
  };

  const removed = {
    types: columns.types.length - next.types.length,
    functions: columns.functions.length - next.functions.length,
    values: columns.values.length - next.values.length,
    total: 0,
  };
  removed.total = removed.types + removed.functions + removed.values;

  const all = flattenColumns(columns);
  const byFilter: Record<string, number> = {};
  for (const filter of ready) {
    const selected = state[filter.id] ?? [];
    const prep = prepared[filter.id] ?? null;
    byFilter[filter.id] = all.length - all.filter((item) => filter.keep(item, selected, prep)).length;
  }

  return {
    columns: next,
    removed,
    byFilter,
    notes: ready.map((filter) => filter.describe(state[filter.id] ?? [], prepared[filter.id] ?? null)),
  };
}
