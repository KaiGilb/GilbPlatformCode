// The change between two versions of a record's fields, as the body of a JSON Merge Patch (RFC 7386) for `patchRecord`.

import type { MergePatchValue } from "./records";

/** Options of {@link mergePatch}. Both are keyed by the field name of `before` and `after`. */
export interface MergePatchOptions<T> {
  /** The fact a field is written as, when it is not the field's own name (`movement` is the fact `watchMovement`). */
  names?: { [K in keyof T & string]?: string };
  /** The value a field is written as, when it is not the value itself (a link: `(id) => ({ "@id": iri(id) })`). Called only with a set value; a cleared field is `null`. */
  toFact?: { [K in keyof T]?: (value: NonNullable<T[K]>) => MergePatchValue };
}

const isObject = (v: unknown): v is object => typeof v === "object" && v !== null;

/** Structural equality of two JSON-like values (objects by their members whatever the order, arrays by position). */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!isObject(a) || !isObject(b) || Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((x, i) => same(x, (b as unknown[])[i]));
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/**
 * The JSON Merge Patch that turns the record `before` into `after`: a field whose value changed is given as its new value, a field that was
 * set and is now missing, `undefined` or `null` is given as `null` (the platform deletes that fact), and a field that did not change is left
 * out. So the answer is `{}` when nothing changed, and then no request is needed.
 *
 * Values are compared by what they hold, and a changed object or array is sent whole, not member by member: a fact's value (a link
 * `{ "@id": ... }`, a list) replaces the stored one, as it does in `patchRecord`. A field set to `undefined` in `before` counts as not set.
 */
export function mergePatch<T extends object>(before: T, after: T, o: MergePatchOptions<T> = {}): Record<string, MergePatchValue> {
  const was = before as Record<string, unknown>;
  const is = after as Record<string, unknown>;
  const patch: Record<string, MergePatchValue> = {};
  const fields = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  for (const field of fields) {
    const now = is[field] ?? undefined; // null and undefined both mean no value
    if (same(was[field] ?? undefined, now)) continue;
    const name = (o.names as Record<string, string | undefined> | undefined)?.[field] ?? field;
    const convert = (o.toFact as Record<string, ((v: unknown) => MergePatchValue) | undefined> | undefined)?.[field];
    patch[name] = now === undefined ? null : convert ? convert(now) : (now as MergePatchValue);
  }
  return patch;
}
