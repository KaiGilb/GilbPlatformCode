import { useCallback, useMemo, useRef, useState } from "react";
import {
  canWriteVault,
  forgetVault,
  rememberVault,
  rememberedVault,
  vaultChoices,
  vaultsOfType,
  type KeyValueStore,
  type VaultChoice,
} from "@kaigilb/gilbplatformcode-vault-list";

/** The part of a listed vault (signin's `ListedVault`, or any row of `GET /lws/vaults`) this hook reads. */
export interface ListedVaultRow {
  vaultId: string;
  modes?: readonly string[] | undefined;
  name?: string | null | undefined;
  shortName?: string | null | undefined;
  represents?: string | null | undefined;
}

export interface UseVaultChoiceOptions {
  /** Every vault the platform lists for this person. */
  listed: readonly ListedVaultRow[];
  /** The person's own vault for this app. It is always offered, listed or not, and is never dropped. */
  ownVaultId: string;
  /** The signed-in person; the choice is kept per person, so two people on one browser never share it. */
  principal: string;
  /** The app's own key, for example `teapots`. The choice is kept under `<appKey>:<principal>:current`. */
  appKey: string;
  /** The type the app's vaults represent. Only vaults of that type (compared by its bare name) are offered; a vault that says nothing about itself is not. Omit for no filter. */
  represents?: string;
  /**
   * Reads the vault list again, for `refresh()`: the same call you made to get `listed` (the platform's `GET /lws/vaults`). Omit it and
   * `refresh()` does nothing; then pass a new `listed` array when the list changes, which `options` follows at once.
   */
  load?: () => Promise<readonly ListedVaultRow[]>;
  /** Where the choice is kept; defaults to `localStorage`. A browser that refuses storage keeps nothing and the own vault opens. */
  store?: KeyValueStore;
}

export interface VaultChoiceState {
  /** The vaults to offer, the person's own first (`yours`), without the ones marked gone. */
  options: VaultChoice[];
  /** The open vault: the one chosen last, else the person's own. Never missing. */
  current: VaultChoice;
  /** Opens another of `options` and keeps the choice. An id that is not offered is ignored. */
  switchTo(vaultId: string): void;
  /** The platform refused this vault: drop it from `options` until the page is loaded again, and forget it if it was the kept choice. The own vault is never dropped. */
  markGone(vaultId: string): void;
  /** The open vault is the person's own, or it lists `write`. False: read only. */
  canWrite: boolean;
  /**
   * Reads the list again with `load` and shows it without a remount: a vault shared since the page opened appears in `options`, one the platform
   * no longer lists leaves it (and if it was open, `current` is the person's own). Answers the `options` now offered. A vault marked gone stays
   * out until the page loads again. If `load` fails, the list stays as it was and the failure is thrown. An answer that arrives after a newer
   * `refresh` was started is not shown. Without `load` it answers the current `options` and reads nothing.
   */
  refresh(): Promise<VaultChoice[]>;
}

const bareName = (iri: string): string => iri.replace(/[#/]+$/, "").split(/[/#]/).pop() ?? iri;
const same = (a: string, b: string): boolean => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

/** localStorage as the three-function store; a browser that refuses it keeps nothing. */
function browserStore(): KeyValueStore {
  const s = (): Storage | null => {
    try {
      return typeof window === "undefined" ? null : window.localStorage;
    } catch {
      return null;
    }
  };
  return {
    get: (k) => s()?.getItem(k) ?? null,
    set: (k, v) => s()?.setItem(k, v),
    remove: (k) => s()?.removeItem(k),
  };
}

/**
 * Which vault is open, for an app whose person may reach several: the options (own first), the open one (the last chosen, else the person's
 * own), `switchTo`, `markGone` for a vault the platform stopped serving, and whether the person may write in the open one. The choice is kept
 * per person and app. Render `options` with `VaultSwitcher` (`load` can answer them) and key the app's screens by `current.vaultId` so each
 * vault starts with fresh state.
 */
export function useVaultChoice(o: UseVaultChoiceOptions): VaultChoiceState {
  const { listed, ownVaultId, principal, appKey, represents } = o;
  const store = useMemo(() => o.store ?? browserStore(), [o.store]);
  const key = `${appKey}:${principal}`;

  // What `refresh` read, valid only while `listed` is the array it was read against: a new `listed` from the host is newer and wins.
  const [fresh, setFresh] = useState<{ against: readonly ListedVaultRow[]; rows: readonly ListedVaultRow[] } | null>(null);
  const source = fresh && fresh.against === listed ? fresh.rows : listed;

  const rowsOf = useCallback(
    (from: readonly ListedVaultRow[]): ListedVaultRow[] => {
      const typed = represents
        ? vaultsOfType(
            // the platform answers a type under its own host: compare by bare name
            from.map((v) => (v.represents && bareName(v.represents) === bareName(represents) ? { ...v, represents } : v)),
            { represents, keepUnknown: false },
          )
        : [...from];
      return typed.some((v) => same(v.vaultId, ownVaultId)) ? typed : [{ vaultId: ownVaultId, modes: ["read", "write"] }, ...typed];
    },
    [ownVaultId, represents],
  );
  const rows = useMemo<ListedVaultRow[]>(() => rowsOf(source), [rowsOf, source]);

  const [gone, setGone] = useState<readonly string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  // The vault opened last time counts as soon as the list carries it, also when it arrives after the first render (a refresh, a later `listed`).
  const chosen = picked ?? rememberedVault(store, key, rows) ?? ownVaultId;

  const offered = useCallback((from: readonly ListedVaultRow[], goneIds: readonly string[]) => vaultChoices(from, (v) => same(v.vaultId, ownVaultId)).filter((c) => c.yours || !goneIds.includes(c.vaultId)), [ownVaultId]);
  const options = useMemo(() => offered(rows, gone), [offered, rows, gone]);
  const current = options.find((c) => same(c.vaultId, chosen)) ?? options[0]!;

  const switchTo = useCallback(
    (vaultId: string) => {
      const pick = options.find((c) => same(c.vaultId, vaultId));
      if (!pick) return;
      rememberVault(store, key, pick.vaultId);
      setPicked(pick.vaultId);
    },
    [options, store, key],
  );
  const markGone = useCallback(
    (vaultId: string) => {
      if (same(vaultId, ownVaultId)) return;
      setGone((g) => (g.includes(vaultId) ? g : [...g, vaultId]));
      setPicked((p) => (p !== null && same(p, vaultId) ? null : p));
      if (rememberedVault(store, key, [{ vaultId }]) !== null) forgetVault(store, key);
    },
    [ownVaultId, store, key],
  );

  const loadRef = useRef(o.load);
  loadRef.current = o.load;
  const latest = useRef({ listed, gone, offered, rowsOf });
  latest.current = { listed, gone, offered, rowsOf };
  const refreshSeq = useRef(0);
  const refresh = useCallback(async (): Promise<VaultChoice[]> => {
    const load = loadRef.current;
    if (!load) return offered(rows, gone);
    const mine = ++refreshSeq.current;
    const against = latest.current.listed;
    const got = await load();
    const asked = latest.current;
    if (mine !== refreshSeq.current) return asked.offered(asked.rowsOf(got), asked.gone);
    if (asked.listed === against) setFresh({ against, rows: got });
    return asked.offered(asked.rowsOf(got), asked.gone);
  }, [offered, rows, gone]);

  const canWrite = current.yours || canWriteVault(rows.find((r) => r.vaultId === current.vaultId) ?? {});
  return { options, current, switchTo, markGone, canWrite, refresh };
}
