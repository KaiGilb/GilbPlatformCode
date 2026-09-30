export type OntologyViewMode = "hierarchy" | "search";

export interface OntologyColumns<T> {
  types: readonly T[];
  functions: readonly T[];
  values: readonly T[];
}

export interface OntologyNarrowingOption {
  id: string;
  label: string;
  help?: string;
}

/** `[]` or a missing key means that filter is off. */
export type NarrowingState = Readonly<Record<string, readonly string[]>>;

export type PreparedByFilter = Readonly<Record<string, unknown>>;

/**
 * One filter, as data. This unit does not ship a filter.
 * `prepare` is not called here. The host runs it, then passes the result in `prepared`.
 * A filter that declares `prepare` and has no key in `prepared` is not applied yet.
 */
export interface OntologyNarrowingFilter<T> {
  id: string;
  label: string;
  help?: string;
  control: "toggle" | "multi";
  /** Omit, or use an empty list, to start off. */
  defaultSelection?: readonly string[];
  /** Omit to offer the filter in every view. An empty list offers it in none. */
  offeredIn?: readonly OntologyViewMode[];
  options?: (items: readonly T[], prepared: unknown) => OntologyNarrowingOption[];
  prepare?: (items: readonly T[], selected: readonly string[]) => Promise<unknown>;
  keep: (item: T, selected: readonly string[], prepared: unknown) => boolean;
  describe: (selected: readonly string[], prepared: unknown) => string;
}

export interface NarrowingOutcome<T> {
  columns: { types: T[]; functions: T[]; values: T[] };
  removed: { types: number; functions: number; values: number; total: number };
  /**
   * Rows this filter would remove from the un-narrowed set.
   * Two filters that remove the same row each count it. This is not a cascade.
   * A filter that is off, or not ready, has no key here. It is not zero.
   */
  byFilter: Record<string, number>;
  /** `describe` of each ready filter, in the order of `filters`. */
  notes: string[];
}

/** The selection a toggle stores when it is on. */
export const TOGGLE_ON: readonly string[] = ["on"];

export function filtersForView<T>(
  mode: OntologyViewMode,
  filters: readonly OntologyNarrowingFilter<T>[],
): readonly OntologyNarrowingFilter<T>[] {
  return filters.filter((f) => !f.offeredIn || f.offeredIn.includes(mode));
}

/** True when the selection list has a length greater than 0. A missing key is off. */
export function isFilterActive(state: NarrowingState, id: string): boolean {
  return (state[id]?.length ?? 0) > 0;
}

/**
 * The state a section opens with.
 * A filter with no `defaultSelection`, or with an empty one, is absent. It is not stored as [].
 * The stored list is a copy.
 */
export function defaultNarrowingState<T>(
  filters: readonly OntologyNarrowingFilter<T>[],
): NarrowingState {
  const state: Record<string, readonly string[]> = {};
  for (const f of filters) {
    if (f.defaultSelection && f.defaultSelection.length > 0) {
      state[f.id] = [...f.defaultSelection];
    }
  }
  return state;
}

/** Types, then functions, then values. A new array. The items are the same objects. */
export function flattenColumns<T>(columns: OntologyColumns<T>): T[] {
  return [...columns.types, ...columns.functions, ...columns.values];
}

/**
 * Apply every ready, active filter.
 *
 * Pass the filters yourself. There is no built-in list.
 * A filter whose `prepare` is set, and whose id is not a key of `prepared`, is skipped.
 * Skipping means the rows stay and the filter is absent from `byFilter` and `notes`.
 * It does not mean "keep nothing".
 * A key that is present with the value `undefined` counts as ready, and `keep` receives null.
 *
 * `removed` is the cascade: what is actually gone after every ready filter.
 * `byFilter` is each ready filter alone, against the original rows.
 * The input arrays are not mutated.
 */
export function applyNarrowing<T>(
  columns: OntologyColumns<T>,
  state: NarrowingState,
  prepared: PreparedByFilter,
  filters: readonly OntologyNarrowingFilter<T>[],
): NarrowingOutcome<T> {
  const active = filters.filter((f) => isFilterActive(state, f.id));
  const ready = active.filter((f) => f.prepare === undefined || f.id in prepared);

  const keepAll = (items: readonly T[]): T[] =>
    items.filter((item) => ready.every((f) => f.keep(item, state[f.id] ?? [], prepared[f.id] ?? null)));

  const next = {
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
  for (const f of ready) {
    const sel = state[f.id] ?? [];
    const prep = prepared[f.id] ?? null;
    byFilter[f.id] = all.length - all.filter((i) => f.keep(i, sel, prep)).length;
  }

  return {
    columns: next,
    removed,
    byFilter,
    notes: ready.map((f) => f.describe(state[f.id] ?? [], prepared[f.id] ?? null)),
  };
}
