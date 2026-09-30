/**
 * The vault root an entity address belongs to, and an entity address under a root.
 *
 * A user vault's root ends in `/vault`. A platform vault's root ends in `/base`.
 * This unit does not decide which one a host is. It only reads the segment that
 * is already in the address, and it only writes `/e/` under the root it was given.
 *
 * It does not fetch, and it does not invent a second address such as `/i`.
 */

/**
 * The vault root inside an entity address, or undefined when the address is not one.
 *
 * The match is case-sensitive. `https://` and `http://` are lowercase only.
 * The host must not contain `/`, `?`, or `#`.
 * After the host the next segment must be exactly `base` or `vault`.
 * That segment must be the end of the address, or it must be followed by `/e/`.
 *
 * `https://h.example/vault/e/abc` returns `https://h.example/vault`.
 * `https://h.example/base` returns `https://h.example/base`.
 * `https://h.example/vault/` returns undefined. A trailing slash after the root
 * is not the end, and it is not `/e/`.
 * `https://h.example/vault/e` returns undefined. `/e` without the following slash
 * is not `/e/`.
 * `https://h.example/base/p/x` returns undefined. A principal is not an entity.
 * `HTTP://h.example/vault` returns undefined.
 * A query after the id is ignored: `https://h.example/vault/e/abc?x` still
 * returns `https://h.example/vault`. The `$` alternative is only for a bare root.
 * Nothing is trimmed.
 */
export function namespaceFromVaultEntity(entity: string): string | undefined {
  const m = /^(https?:\/\/[^/?#]+\/(?:base|vault))(?:\/e\/|$)/.exec(entity);
  return m?.[1];
}

/**
 * An entity address under a vault root the caller already has.
 *
 * One trailing slash on the root is removed. A second trailing slash is kept,
 * so `https://h.example/vault//` becomes `https://h.example/vault//e/<id>`.
 * The id is not encoded and not trimmed. An empty id still produces `/e/`.
 * This function does not check that the root ends in `/base` or `/vault`.
 * Do not paste `/base/e/` onto a root that already ends in `/vault`.
 */
export function entityUriInVault(vaultId: string, id: string): string {
  return `${vaultId.replace(/\/$/, "")}/e/${id}`;
}
