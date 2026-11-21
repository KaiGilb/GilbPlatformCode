// The open section and the open vault are kept in the page's address (`?section=`, `?vault=`), not on the device:
// a reload or a copied link opens the same place, and nothing a person chose is held where only this browser has it.
import type { UseVaultChoiceOptions } from "@kaigilb/gilbplatformcode-vault-switcher";

export type AddressPart = "section" | "vault";

/**
 * Reads one part from the page's address.
 *
 * @param part `section` or `vault`
 * @returns the value, or null when the address has none or cannot be read
 */
export function readAddress(part: AddressPart): string | null {
  try {
    return new URLSearchParams(window.location.search).get(part) || null;
  } catch {
    return null;
  }
}

/**
 * Writes one part into the page's address, in place (no new history entry). An address that cannot be written is not kept.
 *
 * @param part `section` or `vault`
 * @param value the value, or null to take the part out
 */
export function writeAddress(part: AddressPart, value: string | null): void {
  try {
    const url = new URL(window.location.href);
    if (value === null || value === "") url.searchParams.delete(part);
    else url.searchParams.set(part, value);
    window.history.replaceState(window.history.state, "", url);
  } catch {
    /* the choice is simply not kept */
  }
}

/** Takes both parts out of the address, at sign-out, so the next person starts at their own vault. */
export function clearAddress(): void {
  writeAddress("section", null);
  writeAddress("vault", null);
}

/** The store `useVaultChoice` keeps the chosen vault in: the address. The key it is asked for is not used; the address holds one vault. */
export const vaultAddressStore: NonNullable<UseVaultChoiceOptions["store"]> = {
  get: () => readAddress("vault"),
  set: (_key, vaultId) => writeAddress("vault", vaultId),
  remove: () => writeAddress("vault", null),
};
