/**
 * The device key for the cached preferences-row id.
 * The vault id is not trimmed and not lower-cased.
 */
export function prefsRecordIdKey(vaultId: string): string {
  return `baseapp.uiPrefsId:${vaultId}`;
}

/**
 * The row to write, among the rows the vault already holds.
 *
 * The smallest `id` by ordinary code-unit order, not by `updatedAt`, and not by locale.
 * "B" comes before "a". An empty id comes before a letter. Ids are not trimmed.
 * An empty list is null. The input array is not mutated.
 * When two ids are equal, the earlier row in the input is kept. The sort is stable.
 * `updatedAt` is ignored even when it is present.
 */
export function canonicalPrefsRow<T extends { id: string }>(rows: readonly T[]): T | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sorted[0] ?? null;
}
