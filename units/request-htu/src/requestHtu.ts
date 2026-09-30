/**
 * The address bound into a proof. The query and the fragment are not part of it.
 * A mismatch fails the proof even when the key is fine. Pass the URL you already
 * have. This does not fetch, and it does not hold a default host.
 *
 * `canonicalHtu` keeps the scheme and the host the URL parsed, including a port.
 * A user name and password are dropped. `https://example.test` becomes
 * `https://example.test/` because the path of a URL with no path is `/`.
 * An address that cannot be parsed throws. This function does not force https.
 *
 * `proofHtu` is what you sign for a request whose fetch target is `fetchUrl`.
 * With no `explicitOrigin`, the scheme is forced to https and the host and path
 * come from `fetchUrl`. An http fetch still signs https. The port stays.
 * With `explicitOrigin` set, that origin replaces the scheme and host, and the
 * path still comes from `fetchUrl`. The explicit origin's own path, query, and
 * fragment are not used. Null and undefined mean there is no override.
 * A string, including an empty string, is an override: an empty string throws
 * because it is not an address. Do not pass "" to mean "no override".
 */

export function canonicalHtu(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
}

export function proofHtu(fetchUrl: string, explicitOrigin?: string | null): string {
  const target = new URL(fetchUrl);
  if (explicitOrigin != null) {
    return `${new URL(explicitOrigin).origin}${target.pathname}`;
  }
  return `https://${target.host}${target.pathname}`;
}
