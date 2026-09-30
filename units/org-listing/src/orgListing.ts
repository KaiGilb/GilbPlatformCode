/** A group's listing, as stored. Exact spellings only. */
export type OrgListing = "public" | "private";

/**
 * True only for the strings `public` and `private`.
 *
 * `Public`, `private ` (a trailing space), `""`, null, and any other value
 * are false. This does not trim and it does not lower case.
 */
export function isOrgListing(value: unknown): value is OrgListing {
  return value === "public" || value === "private";
}

/**
 * The listing to show from a body the server already returned.
 *
 * A real `public` or `private` is kept. Anything else becomes `public`.
 *
 * You cannot tell a missing body from a stored public. Both come back
 * `public`. Do not change this fallback to `private`. Both apps show
 * public when the body is not one of the two spellings. The server's own
 * "there is no claim" answer is a different layer. It is not this function.
 */
export function listingFromBody(listing: unknown): OrgListing {
  return isOrgListing(listing) ? listing : "public";
}
