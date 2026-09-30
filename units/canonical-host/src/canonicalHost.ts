/**
 * The address to open when this page is on a host the app does not serve.
 *
 * Pass the hosts. None are built in. `nonCanonicalHosts` is an exact list.
 * The match is case-sensitive and is not a suffix. A port on `hostname` is not
 * removed, so `www.example.test:443` does not match `www.example.test`.
 * The location `hostname` in a browser has no port. Pass that, not `host`.
 *
 * When the hostname is in the list, the result is the same path, query, and
 * hash on `canonicalHost`. `http:` and `https:` are kept. Any other protocol,
 * including a missing colon, becomes `https:`. This function does not add a
 * slash, a question mark, or a hash. If `pathname` is empty, nothing is
 * inserted between the host and `search`. Pass `search` with its `?` and
 * `hash` with its `#`, which is what a location object already has.
 *
 * No match returns null. The page stays. This function does not navigate.
 * When the result is not null, the app replaces the page with it and does not
 * mount. An empty host list always returns null.
 */

export interface PageLocation {
  protocol: string;
  hostname: string;
  pathname: string;
  search: string;
  hash: string;
}

export function canonicalAppUrl(
  loc: PageLocation,
  nonCanonicalHosts: readonly string[],
  canonicalHost: string,
): string | null {
  if (!nonCanonicalHosts.includes(loc.hostname)) return null;
  const protocol = loc.protocol === "http:" || loc.protocol === "https:" ? loc.protocol : "https:";
  return `${protocol}//${canonicalHost}${loc.pathname}${loc.search}${loc.hash}`;
}
