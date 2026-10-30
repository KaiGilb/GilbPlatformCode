/**
 * "A vault's own card was just made", said once by the one door that makes it (`ensureVaultSelfCard`), kept for any reader that
 * wants to read a vault's card again. Nothing in the app listens now.
 *
 * WHY AN IN-PAGE SIGNAL: the door is plain async code with no React Query client in reach, and the photo code is shared by screens that
 * have none. A listener set keeps the door free of React; ⛔ it carries no data, only the vault, and every reader reads the card again itself.
 */
type Listener = (vaultId: string) => void;
const listeners = new Set<Listener>();

/**
 * Say that the vault's own card now exists.
 *
 * @param vaultId the vault whose card was made (any spelling the caller holds)
 */
export function announceSelfCardMade(vaultId: string): void {
  for (const l of [...listeners]) {
    try {
      l(vaultId);
    } catch {
      /* a listener's failure never fails the door that made the card */
    }
  }
}

/**
 * Hear every "card made".
 *
 * @param listener called with the vault
 * @returns the function that stops listening
 */
export function onSelfCardMade(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
