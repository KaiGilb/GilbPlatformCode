// Which vault a record's own address names, answered only when it cannot be wrong. Copied from GilbApp `src/lib/base/recordVault.ts` lines 104-117
// (release a703b3ed), the one function of that file the card reaches; the rest of the file reads the merged list, which this card does not have.
import { vaultNamespaceOfEntityUri } from "@kaigilb/gilbplatformcode-plan-stakeholder-lines";

/**
 * The vault the record's own address names, when that is sure. A nested vault's record names its PARENT (`vaultNamespaceOfEntityUri`'s own
 * warning), so this answers only when it cannot be wrong: the named vault is one this person holds, and no held vault sits under it.
 * Otherwise null ("not known yet").
 */
export function unambiguousVaultOfRecord(
  entityUri: string | null | undefined,
  vaults: readonly { vaultId?: string | null }[],
): string | null {
  if (!entityUri) return null;
  const named = vaultNamespaceOfEntityUri(entityUri);
  if (!named) return null;
  const strip = (v: string) => v.replace(/\/+$/, "");
  const held = vaults.map((v) => (v.vaultId ? strip(v.vaultId) : "")).filter(Boolean);
  const n = strip(named);
  if (!held.includes(n)) return null;
  if (held.some((h) => h !== n && h.startsWith(`${n}/`))) return null;
  return n;
}
