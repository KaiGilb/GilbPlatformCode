/**
 * Whether a fact can be shown as one string without dropping part of it.
 *
 * This is a shape test. It does not convert the value. A converter that turns
 * an object with no `@id` into `""`, or joins an array with `", "`, would drop
 * a member this function says is not faithful. Do not show that conversion as
 * the stored fact.
 *
 * Null and undefined are faithful. An empty array is faithful. An object is
 * faithful only when it has an `@id` key, even if that key's value is empty.
 * A function and a symbol are faithful, because they are not objects. Do not
 * "fix" that. A `Date` is an object with no `@id`, so it is not faithful.
 */

/** True when every part of `value` can be carried as text. */
export function isFactStringFaithful(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return true;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isFactStringFaithful);
  if (typeof value !== "object") return true;
  return "@id" in (value as Record<string, unknown>);
}
