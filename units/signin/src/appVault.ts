// The app's own vault: find the signed-in person's own vault of the app's type, or make it once.
// Framework-free. The network calls, the type IRI and the storage are all passed in; this file
// holds no host and no type IRI. It only decides what to ask and in what order.
//
// The 202 rule: create-named answers 201 (made) or 202 (partly made). Sending the IDENTICAL request
// again finishes a 202. check-name never says "yours": for a name the person holds half-made it
// answers "taken, suggest name2", so after a 202 the name must NOT be checked again, or a second
// vault is made. That is why the chosen name is stored as "pending" before the first POST.

import { normaliseVaultName, sameVaultHost, type CreateNamedVaultBody, type CreatedNamedVault, type ListedVault } from "./vaults";
import { VaultRequestRefusedError } from "./types";
import type { CheckNameResult } from "./types";

/** A tiny key-value store: what `localStorage` offers. Pass `null` for no memory at all. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** What the app says about its own vault. The unit holds no type IRI and no host. */
export interface AppVaultConfig {
  /** The full GilbVeda type IRI the app's vault represents. */
  represents: string;
  /** Appended to the landing vault's name, then normalised: `annhouseplants` for "ann" + "houseplants". */
  nameSuffix: string;
  /** Prefix for what is remembered per person, e.g. `picturerecords7`. */
  storageKey: string;
}

/** The steps {@link ensureAppVault} reports, so the app can show progress. */
export type AppVaultStep = "listing" | "creating" | "finishing";

/** What {@link ensureAppVault} needs from the outside. All of it is passed in. */
export interface AppVaultDeps {
  /** Lists the vaults the person reaches (usually `listVaults` bound to the origin and credential). */
  list(): Promise<ListedVault[]>;
  /** Asks the platform whether a name is free (usually `checkVaultName` bound to the origin). */
  checkName(name: string): Promise<CheckNameResult>;
  /** Makes the vault (usually `createNamedVault` bound to the origin and credential). */
  create(body: CreateNamedVaultBody): Promise<CreatedNamedVault>;
  /** Where to remember things. Absent: the browser's `localStorage`, guarded. `null`: remember nothing. */
  store?: KeyValueStore | null;
  /** Called as the work moves on. */
  onStep?(step: AppVaultStep): void;
  /** Waits. Default: a real timer. Tests pass a fake. */
  sleep?(ms: number): Promise<void>;
}

/** What {@link ensureAppVault} answers. */
export interface AppVaultResult {
  /** The person's own vault of the app's type. */
  vault: ListedVault;
  /** The vault list as last read (after the make, when one was made). */
  vaults: ListedVault[];
  /** true when this call made the vault. */
  created: boolean;
}

/**
 * Thrown when the platform still answers 202 (partly made) after the retries. The name stays
 * remembered as pending, so the next try sends that same name again and does not check it.
 */
export class PartialVaultError extends Error {
  /** The vault name that is half-made. (Not `name`: that is the Error's own field.) */
  readonly vaultName: string;
  /**
   * @param vaultName the half-made vault's name
   */
  constructor(vaultName: string) {
    super(
      `Your vault "${vaultName}" was started but not finished. Wait a moment and try again; it will be finished, not made twice.`,
    );
    this.name = "PartialVaultError";
    this.vaultName = vaultName;
  }
}

const REPOST_DELAY_MS = 2000;
const MAX_REPOSTS = 2;

function defaultStore(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // Safari private mode and blocked storage throw on access
  }
}

function resolveStore(store: KeyValueStore | null | undefined): KeyValueStore | null {
  return store === undefined ? defaultStore() : store;
}

function safeGet(store: KeyValueStore | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(store: KeyValueStore | null, key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    /* storage may be blocked: the vault is found again by name */
  }
}

/** Clearing writes an empty string: the store interface has no remove. An empty value reads as "nothing". */
function safeClear(store: KeyValueStore | null, key: string): void {
  safeSet(store, key, "");
}

const ownKey = (cfg: AppVaultConfig, principal: string): string => `${cfg.storageKey}:own:${principal}`;
const lastKey = (cfg: AppVaultConfig, principal: string): string => `${cfg.storageKey}:last:${principal}`;
const pendingKey = (cfg: AppVaultConfig, principal: string): string => `${cfg.storageKey}:pending:${principal}`;

const sameVault = (a: string, b: string): boolean => a === b || sameVaultHost(a, b);
const writable = (v: ListedVault): boolean => v.modes.includes("write");
const trimSlash = (s: string): string => s.trim().replace(/\/+$/, "");
const labelOf = (v: ListedVault): string => (v.shortName ?? v.name ?? "").toLowerCase();

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

/**
 * The vaults of the app's type, whichever way the type is written: as given, or with or without one
 * trailing "/".
 *
 * @param vaults the vault list
 * @param represents the type IRI
 * @returns the vaults of that type, in list order
 */
export function vaultsOfType(vaults: readonly ListedVault[], represents: string): ListedVault[] {
  const want = trimSlash(represents);
  return vaults.filter((v) => v.represents !== undefined && (v.represents === represents || trimSlash(v.represents) === want));
}

/**
 * The name to ask for a new own vault: the landing vault's short name, else its name, else the first
 * label of its host, then the suffix, then {@link normaliseVaultName}.
 *
 * @param vaults the vault list
 * @param cfg the app's vault settings
 * @param _principal the signed-in person (kept so the call shape matches the other helpers)
 * @returns the wanted name
 * @throws Error in plain words when the list has no landing vault
 */
export function wantedAppVaultName(vaults: readonly ListedVault[], cfg: AppVaultConfig, _principal: string): string {
  const landing = vaults.find((v) => v.isLandingVault);
  if (!landing) {
    throw new Error("We could not find your main vault, so we cannot name your new vault. Sign in again, then try once more.");
  }
  const base = (landing.shortName || landing.name || hostLabel(landing.vaultId)).trim();
  return normaliseVaultName(base + cfg.nameSuffix);
}

/**
 * The person's own vault of the app's type. Only writable vaults of the type count. In order:
 * (1) the vault remembered as own, when still listed; (2) one whose short name (else name) equals
 * the wanted name; (3) a numbered variant: the wanted name followed only by digits ("annhouseplants2",
 * not "annhouseplantsxyz"). When several numbered variants exist, the lowest number wins.
 * Rules 2 and 3 need a landing vault; without one only rule 1 can match.
 *
 * @param vaults the vault list
 * @param cfg the app's vault settings
 * @param principal the signed-in person
 * @param store where own ids are remembered (default: guarded `localStorage`; `null`: none)
 * @returns the own vault, or undefined when there is none
 */
export function findOwnAppVault(
  vaults: readonly ListedVault[],
  cfg: AppVaultConfig,
  principal: string,
  store?: KeyValueStore | null,
): ListedVault | undefined {
  const mine = vaultsOfType(vaults, cfg.represents).filter(writable);
  const remembered = safeGet(resolveStore(store), ownKey(cfg, principal));
  if (remembered) {
    const hit = mine.find((v) => sameVault(v.vaultId, remembered));
    if (hit) return hit;
  }
  if (!vaults.some((v) => v.isLandingVault)) return undefined;
  const wanted = wantedAppVaultName(vaults, cfg, principal);
  const exact = mine.find((v) => labelOf(v) === wanted);
  if (exact) return exact;
  let best: { v: ListedVault; n: number } | undefined;
  for (const v of mine) {
    const label = labelOf(v);
    if (!label.startsWith(wanted)) continue;
    const rest = label.slice(wanted.length);
    if (!/^\d+$/.test(rest)) continue;
    const n = Number(rest);
    if (!best || n < best.n) best = { v, n };
  }
  return best?.v;
}

/**
 * The vault used last by this person, when it is still listed (any mode, any type listed).
 *
 * @param vaults the vault list
 * @param cfg the app's vault settings
 * @param principal the signed-in person
 * @param store where it is remembered (default: guarded `localStorage`; `null`: none)
 * @returns the vault, or undefined
 */
export function lastUsedVault(
  vaults: readonly ListedVault[],
  cfg: AppVaultConfig,
  principal: string,
  store?: KeyValueStore | null,
): ListedVault | undefined {
  const last = safeGet(resolveStore(store), lastKey(cfg, principal));
  return last ? vaults.find((v) => sameVault(v.vaultId, last)) : undefined;
}

/**
 * Remembers the vault the person used last. Never throws: a blocked store is ignored.
 *
 * @param store where to remember (`null`: nowhere)
 * @param cfg the app's vault settings
 * @param principal the signed-in person
 * @param vaultId the vault's id
 */
export function rememberLastVault(store: KeyValueStore | null, cfg: AppVaultConfig, principal: string, vaultId: string): void {
  safeSet(store, lastKey(cfg, principal), vaultId);
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Whether the pending name must survive an error from the create step. The rule: it is cleared ONLY
 * when the error is a {@link VaultRequestRefusedError} with a 4xx status AND no 202 was seen for this
 * name in this call (a definite "no" before anything was made). It is kept for everything else: an
 * unreachable platform, a status of 500 or more, any error at all after a 202, and any unknown error.
 * Why: the platform may have half-made the vault and holds the name for this person. If the name were
 * forgotten, the next check-name would answer "taken, suggest name2" and a second vault would be made.
 *
 * @param e what the create step threw
 * @param saw202 true when this call already got a 202 (partly made) for the name
 * @returns true to keep the pending name, false to clear it
 */
export function keepsPending(e: unknown, saw202: boolean): boolean {
  if (saw202) return true;
  return !(e instanceof VaultRequestRefusedError && e.status >= 400 && e.status <= 499);
}

/**
 * Finds the person's own vault of the app's type, or makes it exactly once. A 202 (partly made) is
 * finished by sending the identical request again, after 2 seconds, at most 2 more times. The name
 * is remembered as pending before the first POST and is not checked again, so a half-made vault is
 * finished and never duplicated.
 *
 * Errors are thrown unchanged. {@link keepsPending} says whether the pending name is kept: cleared only
 * for a 4xx refusal before any 202; kept otherwise. {@link PartialVaultError} keeps it too.
 *
 * @param deps the calls and storage
 * @param cfg the app's vault settings
 * @param principal the signed-in person
 * @returns the own vault, the list, and whether it was made now
 */
export async function ensureAppVault(deps: AppVaultDeps, cfg: AppVaultConfig, principal: string): Promise<AppVaultResult> {
  const store = resolveStore(deps.store);
  deps.onStep?.("listing");
  const vaults = await deps.list();
  const own = findOwnAppVault(vaults, cfg, principal, store);
  if (own) {
    safeSet(store, ownKey(cfg, principal), own.vaultId);
    safeClear(store, pendingKey(cfg, principal));
    return { vault: own, vaults, created: false };
  }

  let name = safeGet(store, pendingKey(cfg, principal)) || "";
  if (!name) {
    const wanted = wantedAppVaultName(vaults, cfg, principal);
    const check = await deps.checkName(wanted);
    name = wanted;
    if (!check.available) {
      if (!check.suggestion) throw new Error(check.message || `The vault name ${wanted} is not available.`);
      name = check.suggestion;
    }
    safeSet(store, pendingKey(cfg, principal), name);
  }

  const body: CreateNamedVaultBody = { name, represents: cfg.represents };
  deps.onStep?.("creating");
  let made: CreatedNamedVault;
  let saw202 = false;
  try {
    made = await deps.create(body);
    for (let again = 0; !made.complete && again < MAX_REPOSTS; again++) {
      saw202 = true;
      deps.onStep?.("finishing");
      await (deps.sleep ?? wait)(REPOST_DELAY_MS);
      made = await deps.create(body);
    }
  } catch (e) {
    if (!keepsPending(e, saw202)) safeClear(store, pendingKey(cfg, principal));
    throw e;
  }
  if (!made.complete) throw new PartialVaultError(name);

  safeClear(store, pendingKey(cfg, principal));
  const after = await deps.list();
  const vault = after.find((v) => sameVault(v.vaultId, made.vaultId)) ?? after.find((v) => (v.shortName ?? v.name) === made.name);
  if (!vault) {
    throw new Error("Your vault was made, but it is not in your vault list yet. Sign in again, then open the app once more.");
  }
  safeSet(store, ownKey(cfg, principal), vault.vaultId);
  return { vault, vaults: after, created: true };
}

/** What {@link createAppVaultService} gives back. */
export interface AppVaultService {
  /**
   * Finds or makes the own vault. Calls made while one is running for the same person share it
   * (React StrictMode runs effects twice). After it settles, success or failure, the next call runs fresh.
   */
  open(principal: string, onStep?: (step: AppVaultStep) => void): Promise<AppVaultResult>;
  /** Forgets every running call. */
  reset(): void;
}

/**
 * One {@link ensureAppVault} per person at a time.
 *
 * @param deps the calls and storage
 * @param cfg the app's vault settings
 * @returns the service
 */
export function createAppVaultService(deps: AppVaultDeps, cfg: AppVaultConfig): AppVaultService {
  let inflight = new Map<string, Promise<AppVaultResult>>();
  return {
    open(principal, onStep) {
      const running = inflight.get(principal);
      if (running) return running;
      const map = inflight;
      const p = ensureAppVault(onStep ? { ...deps, onStep } : deps, cfg, principal).finally(() => {
        if (map.get(principal) === p) map.delete(principal);
      });
      map.set(principal, p);
      return p;
    },
    reset() {
      inflight = new Map();
    },
  };
}
