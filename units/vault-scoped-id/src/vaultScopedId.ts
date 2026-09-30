/**
 * The vault id inside `/lws/vault/<id>/…`.
 *
 * The match is case-sensitive and requires the slash after the id. An address
 * that ends at the id, with no further slash, is null. `vaults` is not `vault`.
 * The first match wins. The id is decoded once. A broken `%` is null, not the
 * encoded text. That is not `uriTail` in id-tail, which returns the encoded
 * segment when decoding fails. A `%2F` is one id that contains a slash after
 * decoding. The id is not lower-cased. The host is ignored.
 */

export function vaultIdFromVaultScopedUrl(url: string): string | null {
  const matched = /\/lws\/vault\/([^/?#]+)\//.exec(url);
  if (!matched) return null;
  const id = matched[1];
  if (id === undefined) return null;
  try {
    return decodeURIComponent(id);
  } catch {
    return null;
  }
}
