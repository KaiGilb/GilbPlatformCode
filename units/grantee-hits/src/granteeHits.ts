/**
 * Rows offered while someone types a grantee.
 *
 * The match is the display name, or the one alias the session already holds
 * for the caller's own vault. The address is not a match key. A host fragment
 * matches every vault that lives under that host, which is every vault, and
 * the person asked for a name.
 *
 * This does not decide whether a typed address may be submitted. The field
 * still submits free text. A full vault address skips the typeahead in the
 * app (`vault-address`). That skip is not this function.
 */

export interface GranteeVaultRow {
  vaultId: string;
  /**
   * The name already chosen for the row. Pass the same string you show.
   * This function does not trim it and does not derive it from the address.
   * If you pass the address here, the address becomes the match key again.
   */
  label: string;
}

/** The caller's own vault, and the alias the session was given for it. */
export interface GranteeSessionAlias {
  vaultId: string;
  shortWebId: string;
}

export interface GranteeHit {
  name: string;
  vaultId: string;
  /** The alias that was supplied, or null. Never invented from the address. */
  webId: string | null;
}

/**
 * Reachable vaults whose display name, or own-vault alias, contains the query.
 *
 * The query is trimmed, then `toLowerCase()` with no locale. After trim, an
 * empty query returns `[]`. `" "` matches nothing.
 *
 * `excludeVaultId` of `""`, null, or omitted excludes nobody. Any other
 * string excludes that vault id by exact `===`. No trim.
 *
 * The alias is used only when `sessionAlias.vaultId ===` the row's vault id
 * and `shortWebId.trim()` is not empty. The stored webId is that trim, in
 * the original case. The comparison lowercases it. Every other row gets
 * `webId: null`. No alias is built from the host.
 *
 * Order is the input order. Returned objects are new. The input list is not
 * reordered.
 */
export function localLookupHits(
  vaults: readonly GranteeVaultRow[],
  query: string,
  excludeVaultId: string | null,
  sessionAlias: GranteeSessionAlias | null,
): GranteeHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  const out: GranteeHit[] = [];
  for (const row of vaults) {
    if (excludeVaultId && row.vaultId === excludeVaultId) continue;
    const alias =
      sessionAlias && row.vaultId === sessionAlias.vaultId && sessionAlias.shortWebId.trim() !== ""
        ? sessionAlias.shortWebId.trim()
        : null;
    if (row.label.toLowerCase().includes(q) || (alias !== null && alias.toLowerCase().includes(q))) {
      out.push({ name: row.label, vaultId: row.vaultId, webId: alias });
    }
  }
  return out;
}

export interface RegistryGranteeHit {
  name: string;
  vaultId: string;
  webId?: string | null;
}

/**
 * The offered set is the registry's set. A local hit must not add a vault.
 *
 * Remote rows are copied in order. A repeated vault id keeps the first
 * position and takes the later row's name and webId.
 *
 * `webId` is trimmed. Blank, missing, and null become null. A non-blank
 * webId keeps the trimmed original case.
 *
 * A local row whose vault id is not in the remote list is dropped, even
 * when the name matched. A local row that is in the list does not replace
 * the remote name or webId, and does not move the row.
 */
export function mergeHits(
  remote: readonly RegistryGranteeHit[],
  local: readonly GranteeHit[],
): GranteeHit[] {
  const byId = new Map<string, GranteeHit>();
  for (const hit of remote) {
    const webId = hit.webId?.trim() ? hit.webId.trim() : null;
    byId.set(hit.vaultId, { name: hit.name, vaultId: hit.vaultId, webId });
  }
  for (const hit of local) {
    const admitted = byId.get(hit.vaultId);
    if (admitted === undefined) continue;
    byId.set(hit.vaultId, admitted);
  }
  return [...byId.values()];
}
