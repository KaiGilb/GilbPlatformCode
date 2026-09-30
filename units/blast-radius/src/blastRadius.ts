/**
 * Who depends on one term, from a hierarchy index you already loaded.
 *
 * This does not fetch the index. Pass null when the load failed. Pass the
 * object when the load succeeded, even if every list is empty. Those two
 * inputs produce different notes. Do not pass `{}` for a failed load.
 */

export type BlastKind = "type" | "function" | "value";

export interface BlastTermMeta {
  /** `f` function, `v` value, anything else (including missing) is type. */
  k?: string;
  /** Blank or missing becomes the term name. */
  l?: string;
}

export interface BlastIndex {
  terms: Readonly<Record<string, BlastTermMeta>>;
  children: Readonly<Record<string, readonly string[]>>;
  /** value name → function name. */
  measures: Readonly<Record<string, string>>;
  /** function name → value names. */
  valuesByFunction: Readonly<Record<string, readonly string[]>>;
  /** function name → type names that provide it. */
  typesByFunction: Readonly<Record<string, readonly string[]>>;
  /** function name → type names that list capableOf. */
  capableOfByFunction: Readonly<Record<string, readonly string[]>>;
}

export interface BlastHit {
  name: string;
  label: string;
  kind: BlastKind;
  role: string;
}

export interface BlastRadius {
  focusName: string;
  isAChildren: BlastHit[];
  valuesMeasuring: BlastHit[];
  typesProviding: BlastHit[];
  typesCapable: BlastHit[];
  total: number;
  note: string;
}

const UNAVAILABLE = "Hierarchy index unavailable \u2014 blast radius incomplete.";
const NONE = "No reverse dependents in the hierarchy index (live edges may still exist).";

function kindOf(meta: BlastTermMeta | undefined): BlastKind {
  if (meta?.k === "f") return "function";
  if (meta?.k === "v") return "value";
  return "type";
}

function hit(name: string, label: string | undefined, kind: BlastKind, role: string): BlastHit {
  return { name, label: label || name, kind, role };
}

/**
 * Dependents of `termName`.
 *
 * `termName` is not trimmed. The index is read with that exact key.
 *
 * `kindHint` wins when it is truthy. Null and omitted both mean "read the
 * term's own `k`". `f` is function, `v` is value, every other `k` is type.
 *
 * Only the "values that measure this" list is gated. It is filled when the
 * kind is function, or when no hint was passed. A hint of `type` or `value`
 * leaves that list empty even if the index names this term. The is-a list,
 * the providing list, and the capableOf list are filled for every kind.
 * Do not add a gate to those three.
 *
 * Values come from `measures` first (object order), then from
 * `valuesByFunction`, skipping a name already kept. One name, one hit.
 *
 * capableOf is cut to the first 80 before the hits are built. The other
 * lists are not cut. `total` adds the four lists after that cut. A longer
 * capableOf list cannot be recovered from `total`.
 *
 * The note joins the non-zero counts with a middle dot (U+00B7). The words
 * are not pluralised: one child is still `1 is-a children`. The capableOf
 * clause says `capped display` whenever that list is non-empty, including
 * when the index had fewer than 80. Do not say it only past 80.
 *
 * A null index returns the unavailable sentence and empty lists. An index
 * with no dependents returns the sentence that live edges may still exist.
 * The shorter sentence `No reverse dependents in the hierarchy index.` is
 * not a result. It is written in the app and then thrown away. Do not
 * return it.
 */
export function blastRadiusFromIndex(
  termName: string,
  index: BlastIndex | null | undefined,
  kindHint?: BlastKind | null,
): BlastRadius {
  const emptyLists = {
    focusName: termName,
    isAChildren: [] as BlastHit[],
    valuesMeasuring: [] as BlastHit[],
    typesProviding: [] as BlastHit[],
    typesCapable: [] as BlastHit[],
    total: 0,
  };
  if (!index) return { ...emptyLists, note: UNAVAILABLE };

  const meta = index.terms[termName];
  const kind: BlastKind = kindHint || kindOf(meta);

  const isAChildren = (index.children[termName] ?? []).map((name) => {
    const row = index.terms[name];
    return hit(name, row?.l, kindOf(row), "is-a child");
  });

  const valuesMeasuring: BlastHit[] = [];
  if (kind === "function" || !kindHint) {
    for (const [valueName, functionName] of Object.entries(index.measures)) {
      if (functionName === termName) {
        const row = index.terms[valueName];
        valuesMeasuring.push(hit(valueName, row?.l, "value", "measures this function"));
      }
    }
    for (const valueName of index.valuesByFunction[termName] ?? []) {
      if (!valuesMeasuring.some((row) => row.name === valueName)) {
        const row = index.terms[valueName];
        valuesMeasuring.push(hit(valueName, row?.l, "value", "measures this function"));
      }
    }
  }

  const typesProviding = (index.typesByFunction[termName] ?? []).map((name) => {
    const row = index.terms[name];
    return hit(name, row?.l, "type", "providesFunction");
  });

  const typesCapable = (index.capableOfByFunction[termName] ?? []).slice(0, 80).map((name) => {
    const row = index.terms[name];
    return hit(name, row?.l, "type", "capableOf");
  });

  const total = isAChildren.length + valuesMeasuring.length + typesProviding.length + typesCapable.length;
  const noteParts = [
    isAChildren.length ? `${isAChildren.length} is-a children` : null,
    valuesMeasuring.length ? `${valuesMeasuring.length} values measure it` : null,
    typesProviding.length ? `${typesProviding.length} types provide it` : null,
    typesCapable.length ? `${typesCapable.length} types capableOf (capped display)` : null,
  ].filter((part): part is string => part !== null);

  return {
    focusName: termName,
    isAChildren,
    valuesMeasuring,
    typesProviding,
    typesCapable,
    total,
    note: noteParts.length > 0 ? noteParts.join(" \u00b7 ") : NONE,
  };
}
