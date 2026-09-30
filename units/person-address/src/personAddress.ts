/**
 * Branch a pasted string before any lookup.
 * These functions do not decide that a vault is a person. They only choose a route.
 * A failed URL parse is false. Nothing is fetched.
 */

function pathOf(uri: string): string | null {
  try {
    const path = new URL(uri.trim()).pathname.replace(/\/$/, "") || "/";
    return path;
  } catch {
    return null;
  }
}

/**
 * True when the path is exactly /base.
 * That is a vault namespace. It is not a person paste.
 * /vault is not this. /base/e/… is not this. The host is not inspected.
 */
export function isNamedVaultNamespaceUri(uri: string): boolean {
  return pathOf(uri) === "/base";
}

/**
 * True when there is nothing left to look up: an opaque /base/p/<id>,
 * a /base vault, or a /vault vault.
 * /i is not this. /card is not this.
 * The opaque id allows letters, digits, underscore, and hyphen. It is not a length check.
 */
export function isResolvedPrincipalUri(uri: string): boolean {
  const path = pathOf(uri);
  if (path == null) return false;
  if (/^\/base\/p\/[A-Za-z0-9_-]+$/i.test(path)) return true;
  if (path === "/base" || path === "/vault") return true;
  return false;
}

/**
 * True for a connection-list key that names a person: opaque /base/p/<id>, or a path that is exactly /i.
 * /card is not this. /base and /vault are not this.
 */
export function isPersonConnectionKey(uri: string): boolean {
  const path = pathOf(uri);
  if (path == null) return false;
  if (/^\/base\/p\/[A-Za-z0-9_-]+$/i.test(path)) return true;
  if (path === "/i") return true;
  return false;
}

/**
 * True when the search box should try an address lookup instead of a name lookup.
 * Any http(s) address is true, except a path that is exactly /base.
 * A record address is therefore true. This is not a person test.
 * Without a scheme, only three shapes count, and the opaque id must be 36 hex-or-hyphen characters.
 */
export function looksLikePersonAddress(input: string): boolean {
  const text = input.trim();
  if (!text) return false;
  if (/^https?:\/\//i.test(text)) {
    if (isNamedVaultNamespaceUri(text)) return false;
    return true;
  }
  if (/^\/base\/p\/[0-9a-fA-F-]{36}\/?$/i.test(text)) return true;
  if (/^[a-z0-9.-]+\/(i|card)\/?$/i.test(text)) return true;
  if (/^[a-z0-9.-]+\/base\/p\/[0-9a-fA-F-]{36}\/?$/i.test(text)) return true;
  return false;
}
