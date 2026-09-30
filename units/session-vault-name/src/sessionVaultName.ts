/**
 * What to show for the vault the session signed into.
 *
 * A usable name wins. Otherwise the words `Unnamed vault` and the id.
 * This is not vault-list's `vaultLabel`. That function reads a hostname when
 * the path is `/base`, then a last path segment, then `Vault` and the last
 * eight characters. The comment beside this function in the app says it is
 * the same rule. The code is not the same rule. Do not make them the same.
 */

/**
 * The trimmed name when it is not empty. Otherwise `Unnamed vault ${id}`.
 *
 * The id is not trimmed. An empty id still produces the words, then a space,
 * then nothing: `Unnamed vault `.
 * A number is not accepted as a name. This function does not treat it as missing.
 */
export function sessionVaultLabel(vault: { name?: string | null; id: string }): string {
  const name = vault.name?.trim();
  if (name) return name;
  return `Unnamed vault ${vault.id}`;
}
