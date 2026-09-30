/**
 * Whether a reachable vault is a group, and the word for what it represents.
 *
 * The three type addresses are passed in. This unit does not know them.
 * Comparison is exact. A person address you did not pass is not a person
 * here. Pass the same three strings the vault stored, or a person seat
 * under another spelling is listed as a group.
 */

export interface VaultKindAddresses {
  organization: string;
  project: string;
  person: string;
}

export interface GroupVaultRow {
  represents?: string | null;
  isLandingVault?: boolean;
  name?: string | null;
  modes: readonly string[];
  "@id"?: string | null;
}

/**
 * `Organization`, `Project`, or `Person` when `uri` is exactly one of the
 * addresses you passed. Otherwise the last slash segment. A blank segment
 * returns the uri unchanged. Null, undefined, and `""` return null.
 *
 * The last segment is not decoded and not trimmed. Do not use this word as
 * a type check. A different host can end in the letters `Person`.
 */
export function vaultRepresentsLabel(
  uri: string | null | undefined,
  kinds: VaultKindAddresses,
): string | null {
  if (!uri) return null;
  if (uri === kinds.organization) return "Organization";
  if (uri === kinds.project) return "Project";
  if (uri === kinds.person) return "Person";
  const tail = uri.split("/").pop();
  return tail && tail.length > 0 ? tail : uri;
}

/** True when `represents` is exactly the organization address or the project address. */
export function isOrgOrProjectVault(
  vault: { represents?: string | null },
  kinds: VaultKindAddresses,
): boolean {
  return vault.represents === kinds.organization || vault.represents === kinds.project;
}

/**
 * Vaults a member should see as groups.
 *
 * A typed organization or project is a group even when this session cannot
 * read it, and even when it is the landing vault. That check is first.
 *
 * A vault whose `represents` is exactly the person address is not a group.
 * A landing vault that is not an organization or a project is not a group.
 * `isLandingVault` must be `true`. Any other value does not count.
 *
 * Anything else is a group only when the trimmed name is non-empty and
 * `modes` contains the element `read`. `Read` does not count. `write`
 * alone does not count. The name is trimmed. The modes are not.
 */
export function isGroupVault(vault: GroupVaultRow, kinds: VaultKindAddresses): boolean {
  if (isOrgOrProjectVault(vault, kinds)) return true;
  if (vault.represents === kinds.person) return false;
  if (vault.isLandingVault === true) return false;
  const named = (vault.name ?? "").trim();
  return named.length > 0 && vault.modes.includes("read");
}

/**
 * Vaults that may be a parent of a new vault: `modes` contains `write`,
 * and `@id` is truthy. Order is kept. The list is not sorted. A whitespace
 * `@id` is kept, because it is not trimmed. A missing `@id` is dropped.
 * This does not check the group rules.
 */
export function writableParentVaults<T extends { modes: readonly string[]; "@id"?: string | null }>(
  vaults: readonly T[],
): T[] {
  return vaults.filter((row) => row.modes.includes("write") && !!row["@id"]);
}
