/**
 * The public address of a seat.
 *
 * A server-declared absolute URL wins as-is, including one that ends in `/i`.
 * This function never composes `/i` itself. When nothing declared is a URL,
 * the vault address is used, if that is a URL. Otherwise undefined.
 * Undefined means "do not show an address". It does not mean "build one".
 */

/** True when the trimmed value starts with `http://` or `https://`. A bare word is false. */
export function isAbsoluteHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

/**
 * The address to display, and to store as the subject's address.
 *
 * `shortWebId` is preferred over `aliasUri` with `??`. An empty string is
 * not missing, so `shortWebId: ""` blocks `aliasUri`. The vault address is
 * still tried after a declared value that is not a URL.
 *
 * A declared URL is returned trimmed, whatever path it has. `/i` stays `/i`
 * when the server stored `/i`. `/base` stays `/base`. Nothing here appends
 * `/i` to a `/base` address.
 *
 * null, a bare token with no vault URL, and two empty strings are undefined.
 */
export function seatPublicAddress(
  vault:
    | {
        shortWebId?: string | null;
        aliasUri?: string | null;
        vaultId?: string | null;
      }
    | null
    | undefined,
): string | undefined {
  if (!vault) return undefined;
  const declared = (vault.shortWebId ?? vault.aliasUri)?.trim();
  if (isAbsoluteHttpUrl(declared)) return declared;
  const ns = vault.vaultId?.trim();
  if (isAbsoluteHttpUrl(ns)) return ns;
  return undefined;
}
