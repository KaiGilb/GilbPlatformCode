/**
 * Whether an error must be shown to the person, instead of being turned into
 * a shorter public list.
 *
 * Five names, exact. A different error, including "this principal is not a
 * person", is not one of them. That ruling has its own unit. Do not add it here.
 */

const SURFACE_NAMES = new Set([
  "NotSignedInError",
  "CredentialRefusedError",
  "CredentialExpiredError",
  "PublicCardViewerMismatchError",
  "OriginNotAllowedError",
]);

/**
 * True only when `error` is an object whose `name` is one of the five strings.
 *
 * A string, null, undefined, and an object with no `name` are false.
 * The name is not trimmed and not folded. `notsignedinerror` is false.
 */
export function isCredentialSurfaceError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("name" in error)) return false;
  const name = (error as { name: unknown }).name;
  return typeof name === "string" && SURFACE_NAMES.has(name);
}
