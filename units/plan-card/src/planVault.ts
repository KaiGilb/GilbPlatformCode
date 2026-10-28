// The vault a Plan record lives in: the vault its entity address names, else the screen vault.

/** The vault an entity IRI belongs to (`https://h/base/e/x` → `https://h/base`), or null. */
export function vaultIdOfEntity(entity: string): string | null {
  const i = entity.lastIndexOf("/e/");
  return i > 0 ? entity.slice(0, i) : null;
}

/** Its entity address wins; the screen vault is only the fallback. */
export function planVaultOf(record: { entityUri?: string | null }, fallbackVaultId: string): string {
  const fromEntity = record.entityUri ? vaultIdOfEntity(record.entityUri) : null;
  return fromEntity || fallbackVaultId;
}
