/**
 * The server's code for "this principal is not a person".
 * Exact. `not-a-person` (a hyphen) is a different code and does not count.
 */
export const NOT_A_PERSON_CODE = "not_a_person";

/**
 * True when this value carries the public-card error name and that code.
 *
 * Both fields are exact. The value does not have to be an `Error` instance.
 * A plain object with those two fields counts. Null does not. A transport
 * failure, a 404, and an unknown principal do not, unless they were already
 * marked with this name and this code.
 *
 * True means the server ruled. It does not mean the read failed. A failed
 * read leaves the question open. Do not treat null from this function's
 * false result as "not a person".
 */
export function isNotAPersonError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const marked = error as { name?: unknown; code?: unknown };
  return marked.name === "PublicCardError" && marked.code === NOT_A_PERSON_CODE;
}
