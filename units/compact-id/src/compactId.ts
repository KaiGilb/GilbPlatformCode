/**
 * The `base:` prefix a relation document uses for a member, expanded with the
 * document's own address. A short form is not an address until this runs.
 *
 * This does not fetch. It does not guess a host. If you do not pass the base
 * taken from the document, a `base:` value stays unresolved and the result
 * is null — not the short string.
 */

/**
 * `https://<host>/base/` taken from a document id of the form
 * `http(s)://<host>/base/e/<one-segment>` or `.../base/r/<one-segment>`.
 *
 * Returns null for anything else, including `/vault/`, a trailing slash,
 * a query, a hash, or an extra path segment. Only the `base` segment is
 * recognised. Do not widen this to `vault`.
 *
 * The returned string ends with `/`. Callers that pass their own base must
 * end it with `/` as well. This function does not add a missing slash, and
 * a missing slash glues the next piece on (`.../base` + `e/id` → `.../basee/id`).
 */
export function vaultBaseFromRelationId(docId: unknown): string | null {
  if (typeof docId !== "string") return null;
  const m = /^(https?:\/\/[^/]+\/base)\/[er]\/[^/?#]+$/.exec(docId);
  const base = m?.[1];
  return base ? `${base}/` : null;
}

/** The first entry of a list, or the value itself when it is not a list. An empty list yields undefined. */
export function firstJsonLdValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * An absolute id from a string or from `{ "@id": string }`.
 *
 * - A string that starts with `http` or `urn:` is returned unchanged.
 *   The check is `startsWith`, not a URL parse. `httpfoo` counts. Do not
 *   tighten that.
 * - A string that starts with `base:` is prefixed with `vaultBase` when
 *   `vaultBase` was passed. The four characters `base:` are removed and the
 *   rest is appended. `vaultBase` is not given a slash here.
 * - Anything else, including `base:` with no vault base, is null.
 *   Null means "not an address you can open". It does not mean "keep the
 *   short form and hope".
 *
 * A list is not unwrapped here. Use `memberAddress` when the value might be
 * a one-element list.
 */
export function absoluteIdFromCompact(value: unknown, vaultBase: string | null = null): string | null {
  const resolve = (s: string): string | null => {
    if (s.startsWith("http") || s.startsWith("urn:")) return s;
    if (vaultBase && s.startsWith("base:")) return `${vaultBase}${s.slice("base:".length)}`;
    return null;
  };
  if (typeof value === "string") return resolve(value);
  if (value && typeof value === "object" && "@id" in value) {
    const id = (value as { "@id": unknown })["@id"];
    return typeof id === "string" ? resolve(id) : null;
  }
  return null;
}

/** `firstJsonLdValue`, then `absoluteIdFromCompact`. */
export function memberAddress(value: unknown, vaultBase: string | null = null): string | null {
  return absoluteIdFromCompact(firstJsonLdValue(value), vaultBase);
}
