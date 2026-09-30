/**
 * The wire key for a slug this app itself minted.
 *
 * `attrKey("name")` is `a:name`. Nothing is checked. `attrKey("a:name")` is
 * `a:a:name`, which is a different attribute. `attrKey("")` is `a:`.
 * Trimming is not done. Call {@link isAppAddressableSlug} first when the slug
 * came off a record you did not mint.
 */
export function attrKey(slug: string): string {
  return `a:${slug}`;
}

/**
 * Whether `attrKey` would name the same attribute the vault served.
 *
 * True only for a slug that starts with an ASCII letter and then has at most
 * 63 more characters from ASCII letters, digits, `_`, and `-`. Length is 1 to
 * 64. No trim. No case fold.
 *
 * False for a full address, a CURIE (`owl:sameAs`, `role:source`), a colon,
 * a space, an empty string, a leading digit, or a letter outside A–Z.
 * False does not mean the fact is absent. It means this app must not render
 * it as its own field, edit it, or retract it by prefixing `a:`.
 */
export function isAppAddressableSlug(slug: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(slug);
}
