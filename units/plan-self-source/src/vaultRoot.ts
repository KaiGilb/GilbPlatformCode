// A vault's root as the platform stores and hashes it, and the attribute of a vault's entity that points at the person's profile card.

import { vaultSegmentOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";

/** MyNetBase vault-entity edge to the Person profile resource. */
export const PROFILE_POINTER_ATTR = "mnbProfile";

/**
 * The vault ROOT exactly as the platform stores and hashes it: `https://<host>/base` or
 * `https://<host>/vault`. ⛔ The segment is read off the address in hand, never assumed, so the root this derives and the
 * address a card is written to cannot drift apart.
 */
export function vaultRootOf(vaultNamespace: string): string | null {
  try {
    const u = new URL(vaultNamespace);
    return `${u.protocol}//${u.host}${vaultSegmentOf(u.href)}`;
  } catch {
    return null;
  }
}
