// The vault a principal can reach, with the modes it holds; and the read-mode test.
// Taken from the app's types file: the symbols `heldVaultIds` reaches.

// ── The reachable vault set (over the platform's `GET /lws/vaults`) ──
//
// Vocabulary fence: nothing here is called "entitlement". On the platform that word names the vault on/off KILL-SWITCH plane, and the two
// come apart exactly where it matters: a vault that is GRANTED but switched off would otherwise be listed while every request into it is
// refused. This is the GRANT plane: the reachable vault set.

/** One access mode on a vault. The wire carries a SET of these, never a scalar. */
export type VaultMode = "read" | "write";

/** The vault-hierarchy parent of a reachable vault, as `partOf` carries it. */
export interface ReachableVaultParent {
  /** The parent vault ENTITY URI. */
  entity: string;
  /** The parent vault's `vault_id` NAMESPACE. */
  vaultId: string;
}

/**
 * One vault the signed-in principal can reach, as `GET /lws/vaults` reports it.
 *
 * ⚠ `podId` — the `vault_id` NAMESPACE (`https://<host>/base/p<hex>`) — is the identity the
 * SERVER honours when a request names a vault, so it is what `?vault=` carries and what a vault
 * path segment will carry when vault-targeting lands. It is NOT `VaultInfo.id` (the vault ENTITY
 * id tail, which is what `/lws/r/<id>` is keyed on). Two different ids for two different
 * jobs; conflating them is the failure this comment exists to prevent.
 */
export interface ReachableVault {
  vaultId: string;
  /** The vault ENTITY URI, or null for a bare granted namespace with no vault entity minted.
   * Such a vault is genuinely reachable — the grant is real — so it is listed rather than
   * dropped; it simply has no entity, name or parent to report. */
  entity: string | null;
  /** The vault's display name, or null when it has none. NEVER substituted with a guess:
   * a null name renders as the vault's own id, never as an invented label. */
  name: string | null;
  /** The vault-hierarchy parent, or null for a root vault / an ambiguous parent. */
  parent: ReachableVaultParent | null;
  /** TRUE when the vault carries more than one parent — the parent is genuinely AMBIGUOUS
   * and is reported as unknown rather than silently first-picked. */
  parentAmbiguous: boolean;
  /** The mode SET held on this vault. NEVER collapsed to a "highest mode" scalar: read and
   * write grants are DISJOINT in Base's model, so a write-only vault is representable and a
   * scalar would HIDE a vault the person can write. */
  modes: VaultMode[];
    /**
     * What this vault is: the `a:podRepresents` type URI it was created with, or null when unset.
     *
     * A vault typed as a *banana* showed NAME / VAULT ID / WHO CAN FIND / ACCESS RIGHTS in its detail pane and no type at all. The type was
     * never missing from the system: `GET /lws/vaults` has carried `represents` on its wire node since the vault-enumeration gate (the
     * existing term, not a new mint). The client parsed every other key and dropped that one, so the create path wrote a type the read path
     * could not see. Nothing new is minted here either: the field is read, not invented.
     *
     * null means "the vault reported none", never "the vault has none": the two are the same on this wire and a caller must not render the
     * absence as a fact.
     */
  represents: string | null;
  /** TRUE on the ONE member that is the principal's own personal / landing vault — a FLAG on
   * a member, never an appended extra element. When the landing vault is not reachable, NO
   * member carries it and none is substituted. */
  isLandingVault: boolean;
}

/** True when the principal holds the read mode on this vault. */
export function canReadVault(vault: ReachableVault): boolean {
  return vault.modes.includes("read");
}
