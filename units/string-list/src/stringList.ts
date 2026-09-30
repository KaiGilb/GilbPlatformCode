/**
 * Read a value that is sometimes one string and sometimes a list of strings.
 *
 * A single string is a one-element list, unless it is blank after trim, in
 * which case the list is empty. A list keeps only real strings that are not
 * blank after trim. The kept string is not trimmed: `" x "` stays `" x "`.
 * Numbers, objects, and nulls inside the list are dropped, not stringified.
 *
 * Anything else — null, a number, an object — is an empty list. It is not an error.
 *
 * Checklist questions pass `checksStandard` through this shape. Any other
 * field that is stored the same way can use it. Do not read that field as
 * one string: the one-string read works on the common case and drops the
 * extra values on the rare case.
 */
export function stringsFromOneOrMany(raw: unknown): string[] {
  if (typeof raw === "string") return raw.trim() === "" ? [] : [raw];
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === "string" && s.trim() !== "");
  return [];
}
