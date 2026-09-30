/**
 * The opaque id at the end of a resource address.
 *
 * This is not the id-tail unit. id-tail always returns a last segment.
 * This function returns the whole string when the address is not one of the
 * three shapes below. A query or a hash means it is not that shape, so the
 * whole string comes back, query included.
 *
 * The id is not decoded. Nothing is trimmed.
 */

/**
 * The id, or `uri` unchanged.
 *
 * The three shapes, and the id must be the end of the string:
 * - `/lws/r/<id>`
 * - `/base/e/<id>` or `/vault/e/<id>`
 * - `base:e/<id>` at the start
 *
 * `<id>` is one or more characters that are not `/`, `?`, or `#`.
 * `base:e/abc/extra` does not match, because `extra` is past the id and the
 * id must finish the string. The whole string is returned.
 * `BASE:e/abc` does not match. The prefix is lowercase `base:e/`.
 */
export function idFromResourceUri(uri: string): string {
  const m = /(?:\/lws\/r\/|\/(?:base|vault)\/e\/|^base:e\/)([^/?#]+)$/.exec(uri);
  return m?.[1] ?? uri;
}
