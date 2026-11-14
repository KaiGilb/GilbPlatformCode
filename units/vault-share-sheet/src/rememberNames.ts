// Remembering the name an owner typed when sharing, per vault, on this device. The live access list sends no name for most
// people, so without this every row reads "Principal key". No React here.
import type { AccessRow, AccessView } from "./model";
import type { ShareWords } from "./words";

/**
 * The little key-value store the app has (`browserStore`, or a stand-in). Same shape as `vault-list`'s `KeyValueStore`, so
 * one store serves both. A store that fails is "nothing kept"; it never breaks the sheet.
 */
export interface KeyValueStore {
  get(key: string): string | null | undefined;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export type RememberedNames = Record<string, string>;

/** `localStorage` under a prefix of yours (for example `"myapp:"`). Where storage is blocked, reads answer nothing and writes are dropped. */
export function browserStore(prefix: string): KeyValueStore {
  const ls = (): Storage | undefined => {
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  };
  return {
    get(key) {
      try {
        return ls()?.getItem(prefix + key) ?? null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        ls()?.setItem(prefix + key, value);
      } catch {
        // a device that will not store: the name is simply not kept
      }
    },
    remove(key) {
      try {
        ls()?.removeItem(prefix + key);
      } catch {
        // nothing to remove
      }
    },
  };
}

/** One entry per vault (and per signed-in person when `you` is known), holding a map from principal to the name typed. */
export const namesKey = (vaultId: string, you?: string): string => `vss-names:${you ?? ""}:${vaultId}`;

export function readNames(store: KeyValueStore, key: string): RememberedNames {
  try {
    const raw = store.get(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""));
  } catch {
    return {};
  }
}

export function writeNames(store: KeyValueStore, key: string, names: RememberedNames): void {
  try {
    if (Object.keys(names).length === 0) store.remove(key);
    else store.set(key, JSON.stringify(names));
  } catch {
    // not kept
  }
}

/** Every principal in a view (owner first), or null when the view is not a controlled one. */
export function principalsOf(view: AccessView | null): string[] | null {
  if (!view || !view.controlled) return null;
  return [...(view.owner ? [view.owner.principal] : []), ...view.rows.map((r) => r.principal)];
}

/**
 * The rows as the sheet shows them. A row whose principal is exactly `you` (the unit compares principals with ===, as unshare does) reads `words.you`; the owner row is not special.
 * A row the platform left unnamed (`named: false`) shows the name remembered for it, else `words.unnamed` as its note.
 * A row the platform did name is never changed.
 */
export function labelRows(view: AccessView, o: { you?: string | undefined; names: RememberedNames; words: ShareWords }): AccessView {
  if (!view.controlled) return view;
  const { you, names, words } = o;
  const one = (r: AccessRow): AccessRow => {
    if (you !== undefined && r.principal === you) return { ...r, label: words.you, note: null };
    if (r.named) return r;
    const given = names[r.principal];
    if (given) return { ...r, label: given, note: words.remembered(given) };
    return { ...r, note: words.unnamed };
  };
  return { controlled: true, owner: view.owner ? one(view.owner) : null, rows: view.rows.map(one) };
}
