/**
 * The origin an entity address is served on.
 *
 * When the address names the same host the caller is already using, the
 * caller's origin is returned unchanged, scheme included. The address's own
 * scheme is not trusted in that case. A mint can say `https` while the rig
 * the caller is on is plain `http` on the same host and port.
 *
 * This is not vault-namespace. That unit returns the vault root, path
 * included. This unit returns an origin, path not included.
 */

/**
 * `baseOrigin` when the address is missing, not an absolute http(s) URL, or
 * already on `baseOrigin`'s host. Otherwise the address's origin.
 *
 * Host compare includes the port. The URL parser lowercases the hostname.
 * The same host returns `baseOrigin` verbatim, not the address's origin.
 * A different host returns `u.origin`: scheme, host, and a non-default port.
 * The path is dropped. A default port is dropped by the parser, not by an
 * extra rule here.
 *
 * This function does not trim. A bad address returns `baseOrigin`. A bad
 * `baseOrigin` is returned as itself when parsing it throws.
 */
export function vaultOriginOf(entityUri: string | null | undefined, baseOrigin: string): string {
  if (!entityUri) return baseOrigin;
  try {
    const u = new URL(entityUri);
    if (u.protocol !== "https:" && u.protocol !== "http:") return baseOrigin;
    if (u.host === new URL(baseOrigin).host) return baseOrigin;
    return u.origin;
  } catch {
    return baseOrigin;
  }
}
