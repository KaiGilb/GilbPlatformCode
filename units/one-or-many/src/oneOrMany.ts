/**
 * A JSON-LD reader often collapses a one-element list into the element itself.
 * Callers that assume a list then drop that single element, or crash.
 *
 * null and undefined become []. An array is returned as the same array, not a
 * copy: changing the result changes the input. Anything else, including one
 * object, becomes a one-element list.
 *
 * Do not use this on a string field. A string is not an array, so it becomes
 * a one-element list of that string. Multi-value strings have their own
 * reader (`string-list`), which also drops blanks.
 */
export function asOneOrMany<T>(value?: T[] | T | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
