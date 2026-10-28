// Copied from GilbApp src/lib/base/ruleHooks.ts: the vault namespace an entity address names.

/**
 * The vault namespace named by a record's address, or `null` when the address is not a vault or base entity address.
 * The returned namespace carries the segment the address carries (`/vault` or `/base`), never a fixed one.
 * @param entityUri the record's framed `@id`, e.g. `https://vault.example.test/base/e/abc`
 */
export function vaultNamespaceOfEntityUri(entityUri: string): string | null {
  // Both segments, and the answer carries the one it found. The returned namespace must be the segment the address carries,
  // never a fixed `/base`: pairing a `/vault` entity with a `/base` namespace would be a half-derived identity.
  for (const segment of ["vault", "base"]) {
    const marker = `/${segment}/e/`;
    const at = entityUri.indexOf(marker);
    if (at === -1) continue;
    const origin = entityUri.slice(0, at);
    if (origin === "") return null;
    return `${origin}/${segment}`;
  }
  return null;
}
