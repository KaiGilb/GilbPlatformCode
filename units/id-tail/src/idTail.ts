/**
 * Two ways to take the last segment of an id. They are not the same function.
 *
 * slashTail — the last slash, and nothing else. A query stays glued on.
 *   A trailing slash yields "". Percent-encoding is not decoded.
 *   This is what the app calls entityIdTail, idFromUri, and idFromEntityUri.
 *
 * uriTail — strip the query and the hash, strip trailing slashes, then decode.
 *   This is what the app calls uriTail and opaqueIdFromUri. Those two are the
 *   same function. opaqueIdFromUri is not a second rule.
 */

/** Last segment after the final `/`. No query strip, no decode. No slash → the whole string. */
export function slashTail(value: string): string {
  const marker = value.lastIndexOf("/");
  return marker === -1 ? value : value.slice(marker + 1);
}

/** Same function as {@link slashTail}. The name used on a process or standards id. */
export const entityIdTail = slashTail;

/** Same function as {@link slashTail}. The name used on a vault-set URI. */
export const idFromUri = slashTail;

/** Same function as {@link slashTail}. The name used on a fan-out entity URI. */
export const idFromEntityUri = slashTail;

/**
 * Last segment after removing `?…` and `#…` and trailing slashes, then percent-decoded.
 * A failed decode returns the encoded segment. An empty segment returns `uri` unchanged.
 */
export function uriTail(uri: string): string {
  const clean = uri.split(/[?#]/)[0]?.replace(/\/+$/, "") ?? "";
  const seg = clean.slice(clean.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(seg) || uri;
  } catch {
    return seg || uri;
  }
}

/** Same function as {@link uriTail}. Not a different cut. */
export function opaqueIdFromUri(uri: string): string {
  return uriTail(uri);
}
