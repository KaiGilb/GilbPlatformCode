/** The little key-value store the app has (for example `localStorage`, or a stand-in): reading a missing key answers null or undefined. */
export interface KeyValueStore {
  get(key: string): string | null | undefined;
  set(key: string, value: string): void;
  remove(key: string): void;
}

const trimSlash = (u: string): string => u.replace(/\/+$/, "");
const same = (a: string, b: string): boolean => trimSlash(a) === trimSlash(b);

/** The key under which the chosen vault is kept: `<appKey>:current`. Put the app and the person in `appKey` (for example `teapots:<principal>`). */
export const currentKey = (appKey: string): string => `${appKey}:current`;
/** The key that holds "this offer was dismissed": `<appKey>:banner:<vaultId>`. */
export const dismissedKey = (appKey: string, vaultId: string): string => `${appKey}:banner:${vaultId}`;

// A store that is blocked or full must never break the app: a read that fails is "nothing kept", a write that fails is "not kept".
function read(store: KeyValueStore, key: string): string | null {
  try {
    return store.get(key) ?? null;
  } catch {
    return null;
  }
}
function attempt(fn: () => void): void {
  try {
    fn();
  } catch {
    /* the choice is simply not kept */
  }
}

/** Keeps the vault the person chose. A store that refuses is ignored. */
export function rememberVault(store: KeyValueStore, appKey: string, vaultId: string): void {
  attempt(() => store.set(currentKey(appKey), vaultId));
}

/** Forgets the chosen vault. */
export function forgetVault(store: KeyValueStore, appKey: string): void {
  attempt(() => store.remove(currentKey(appKey)));
}

/** True when a vault was chosen and kept before (the person's own vault included). */
export function hasChosenVault(store: KeyValueStore, appKey: string): boolean {
  const id = read(store, currentKey(appKey));
  return id !== null && id !== "";
}

/**
 * The remembered vault's id, as `rows` list it, but only while it is still in `rows` (compared without trailing slashes); null when
 * nothing was kept, the store fails, or the vault is no longer reachable.
 */
export function rememberedVault(store: KeyValueStore, appKey: string, rows: readonly { vaultId: string }[]): string | null {
  const id = read(store, currentKey(appKey));
  if (!id) return null;
  return rows.find((r) => same(r.vaultId, id))?.vaultId ?? null;
}

/** Keeps that the person dismissed the "shared with you" offer for this vault. */
export function dismissOffer(store: KeyValueStore, appKey: string, vaultId: string): void {
  attempt(() => store.set(dismissedKey(appKey, vaultId), "1"));
}

/** True when the person dismissed the offer for this vault before. A store that fails answers false. */
export function offerDismissed(store: KeyValueStore, appKey: string, vaultId: string): boolean {
  return read(store, dismissedKey(appKey, vaultId)) !== null;
}

/**
 * The vault to offer in a "shared with you" banner: the first row that is not the person's own (`ownVaultId`, compared without trailing
 * slashes), not marked `yours`, and not dismissed; and none at all when the person has already chosen a vault (`chosen`, from
 * {@link hasChosenVault}), because then they know the list. `dismissed` is a list of vault ids or a function. Null when there is nothing to offer.
 */
export function sharedOffer<T extends { vaultId: string; yours?: boolean }>(
  rows: readonly T[],
  o: { ownVaultId?: string | null; dismissed?: readonly string[] | ((vaultId: string) => boolean); chosen?: boolean },
): T | null {
  if (o.chosen === true) return null;
  const gone = (id: string): boolean =>
    typeof o.dismissed === "function" ? o.dismissed(id) : (o.dismissed ?? []).some((d) => same(d, id));
  return rows.find((r) => r.yours !== true && !(o.ownVaultId && same(r.vaultId, o.ownVaultId)) && !gone(r.vaultId)) ?? null;
}
