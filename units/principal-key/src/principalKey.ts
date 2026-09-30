/**
 * Card and connect addresses that name a principal.
 * No origin is built in. The host passes the base path and its own origin.
 */

export const VAULT_HOST_CARD_ALIAS_PATHS = ["/i", "/base", "/vault", "/card"] as const;

/** URL-safe base64 of the principal, with the padding removed. Does not trim. */
export function encodePrincipalKey(principal: string): string {
  const bytes = new TextEncoder().encode(principal);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === undefined) continue;
    bin += String.fromCharCode(byte);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Inverse of encodePrincipalKey.
 * Null when the key is not base64url, or the text does not start with http:// or https://.
 * The match is case-sensitive, after trim.
 */
export function decodePrincipalKey(key: string): string | null {
  try {
    const pad = key.length % 4 === 0 ? "" : "=".repeat(4 - (key.length % 4));
    const b64 = key.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const principal = new TextDecoder().decode(bytes).trim();
    if (!principal.startsWith("http://") && !principal.startsWith("https://")) return null;
    return principal;
  } catch {
    return null;
  }
}

/**
 * Path only, no origin. A trailing slash on the base path is removed.
 * "" and "/" both produce "/card/<key>".
 */
export function opaqueCardPath(basename: string, principal: string): string {
  const base = basename.replace(/\/$/, "");
  return `${base}/card/${encodePrincipalKey(principal)}`;
}

/**
 * The friendly card address when the input is one of the four vault-host paths.
 * Null otherwise. The result is scheme, host, and /card. Query and fragment are dropped.
 */
export function friendlyCardUrl(shortWebId: string | null | undefined): string | null {
  if (!shortWebId || typeof shortWebId !== "string") return null;
  try {
    const url = new URL(shortWebId);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if ((VAULT_HOST_CARD_ALIAS_PATHS as readonly string[]).includes(path)) {
      return `${url.protocol}//${url.host}/card`;
    }
  } catch {
    return null;
  }
  return null;
}

/** The first candidate that is a vault-host card address, unchanged. Never a composed address. */
export function vaultHostCardAlias(
  ...candidates: (string | null | undefined)[]
): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && friendlyCardUrl(candidate)) return candidate;
  }
  return null;
}

/**
 * A connect `to` value: a full http(s) address on /i or /base/p/, or an opaque principal key.
 * Anything else is null. The returned full address is the trimmed input, not a rebuilt URL.
 */
export function parseConnectTarget(to: string): string | null {
  const raw = to.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" || url.protocol === "http:") {
      if (/\/base\/p\//.test(url.pathname) || url.pathname === "/i" || url.pathname.endsWith("/i")) {
        return raw;
      }
      if (url.pathname.includes("/base/p/")) return raw;
    }
  } catch {
    /* not a full URL — try the key */
  }
  const fromKey = decodePrincipalKey(raw);
  if (fromKey) return fromKey;
  return null;
}
