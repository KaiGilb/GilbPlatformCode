import { useCallback, useMemo, useState } from "react";
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

  const rows = useMemo<ListedVaultRow[]>(() => {
    const typed = represents
      ? vaultsOfType(
          // the platform answers a type under its own host: compare by bare name
          listed.map((v) => (v.represents && bareName(v.represents) === bareName(represents) ? { ...v, represents } : v)),
          { represents, keepUnknown: false },
        )
      : [...listed];
    return typed.some((v) => same(v.vaultId, ownVaultId)) ? typed : [{ vaultId: ownVaultId, modes: ["read", "write"] }, ...typed];
  }, [listed, ownVaultId, represents]);

  const [gone, setGone] = useState<readonly string[]>([]);
  const [chosen, setChosen] = useState<string>(() => rememberedVault(store, key, rows) ?? ownVaultId);

  const options = useMemo(
    () => vaultChoices(rows, (v) => same(v.vaultId, ownVaultId)).filter((c) => c.yours || !gone.includes(c.vaultId)),
    [rows, ownVaultId, gone],
  );
  const current = options.find((c) => same(c.vaultId, chosen)) ?? options[0]!;

  const switchTo = useCallback(
    (vaultId: string) => {
      const offered = options.find((c) => same(c.vaultId, vaultId));
      if (!offered) return;
      rememberVault(store, key, offered.vaultId);
      setChosen(offered.vaultId);
    },
    [options, store, key],
  );
  const markGone = useCallback(
    (vaultId: string) => {
      if (same(vaultId, ownVaultId)) return;
      setGone((g) => (g.includes(vaultId) ? g : [...g, vaultId]));
      if (rememberedVault(store, key, [{ vaultId }]) !== null) forgetVault(store, key);
    },
    [ownVaultId, store, key],
  );

  const canWrite = current.yours || canWriteVault(rows.find((r) => r.vaultId === current.vaultId) ?? {});
  return { options, current, switchTo, markGone, canWrite };
}
