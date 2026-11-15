// The live-app start-up: restore a sign-in or show the card, find or make the person's own app
// vault, then hand the app its vault. Framework-free: `useLiveStart` (React) is a thin wrapper.
// It reuses `createAppVaultService`, `listVaults`, `checkVaultName` and `createNamedVault`; it adds
// only the order of events and the stage the screen shows.
import { createAppVaultService, type AppVaultConfig, type AppVaultService, type AppVaultStep, type KeyValueStore } from "./appVault";
import { checkVaultName } from "./http";
import type { Transport } from "./transport";
import { createNamedVault, listVaults, type ListedVault, type SignedRequestSource } from "./vaults";

/**
 * What the screen shows: the sign-in card, the vault being found or made, the app, a failure, or
 * the sign-out in progress ("signing-out": the server is being told, nothing new may be read).
 */
export type LiveStage = "signin" | "opening" | "ready" | "error" | "signing-out";

/** What the start-up needs from the session credential (a `SessionCredential` has all of it). */
export interface LiveStartCredential extends SignedRequestSource {
  restore(): Promise<{ principal: string } | null>;
  getSession(): Promise<{ principal: string }>;
  invalidate(dropKey?: boolean): Promise<void>;
  /**
   * Optional: tell the sign-in server the person signed out (`POST {origin}/base/auth/sign-out`, signed
   * with the held token), then drop the key and token locally. A `SessionCredential` has it. When it is
   * absent, sign-out only clears locally, as before. It may resolve `{ serverSignedOut: false }` (the
   * server was not reached or refused): that is reported in `signOutNotice`, and the local sign-out still happens.
   */
  signOut?(origin: string): Promise<{ serverSignedOut: boolean }>;
}

export interface LiveStartOptions {
  /** The session credential the app holds. */
  credential: LiveStartCredential;
  /** The sign-in service origin, no trailing slash. */
  idOrigin: string;
  /** What the app says about its own vault: type IRI, name suffix, storage prefix. */
  vaultConfig: AppVaultConfig;
  /** Optional transport for every call (tests, a native shell). Default: the global fetch. */
  transport?: Transport;
  /** Where own-vault ids are remembered (default: guarded `localStorage`; `null`: nowhere). */
  store?: KeyValueStore | null;
  /** Replaces the vault service (tests). */
  service?: AppVaultService;
}

export interface LiveStartState {
  stage: LiveStage;
  /** The person's own app vault. Set only when `stage` is "ready". */
  vault: ListedVault | null;
  /** A plain sentence. Set only when `stage` is "error". */
  error: string | null;
  /** What the open is doing now, while `stage` is "opening". */
  step: AppVaultStep | null;
  /** The signed-in person, once known. */
  principal: string | null;
  /**
   * The person's own address: their landing vault's id (how their sign-in names them), else the app vault's.
   * Set only when `stage` is "ready".
   */
  actor: string | null;
  /** Every vault the person reaches, as last read. Set only when `stage` is "ready". */
  vaults: ListedVault[];
  /**
   * A plain sentence, set on the "signin" stage that follows a sign-out whose server call did not
   * succeed (the person is signed out on this device; the server was not told). Null otherwise.
   */
  signOutNotice: string | null;
}

/** The sentence for a sign-out the server did not record. Exported so an app can match it in tests. */
export const SIGN_OUT_NOT_RECORDED = "You are signed out on this device, but the sign-in service could not be told. Your sign-in there ends by itself.";

export interface LiveStartController {
  getState(): LiveStartState;
  subscribe(listener: () => void): () => void;
  /** Call once: restores a sign-in (moves to "opening") or shows the card (moves to "signin"). */
  start(): void;
  /** Call when the sign-in card says the person signed in. */
  signedIn(): void;
  /** From "error": tries the open again. Ignored in any other stage. */
  retry(): void;
  /**
   * Tells the server (when the credential can), then clears locally and shows the card again. From the
   * first moment `stage` is "signing-out" and `signal` is aborted; `start`, `signedIn` and `retry` do nothing
   * until the card shows. A second call while one runs joins it.
   */
  signOut(): Promise<void>;
  /**
   * Aborts when a sign-out starts. Pass it to every read the app starts (`fetch(url, { signal })`), so no
   * read starts or finishes after sign-out begins. A fresh, unaborted signal replaces it when the card shows.
   */
  readonly signal: AbortSignal;
  /** Stops all running work; later answers are ignored. `start()` may run again after it. */
  dispose(): void;
}

/**
 * A short name for a header: the vault's short name, else its name, else the first label of its host.
 *
 * @param vault anything with a `vaultId` and maybe a `shortName` or `name`
 * @returns the short name
 */
export function vaultShortName(vault: Pick<ListedVault, "vaultId" | "shortName" | "name">): string {
  const given = (vault.shortName || vault.name || "").trim();
  if (given) return given;
  try {
    return new URL(vault.vaultId).hostname.split(".")[0] || vault.vaultId;
  } catch {
    return vault.vaultId;
  }
}

/**
 * The sentence to show for a failed start: the platform's own words when the error carries them,
 * else the error's message, else a plain fallback.
 *
 * @param err what the start threw
 * @returns a sentence
 */
export function sentenceOfStartError(err: unknown): string {
  const m = (err as { platformMessage?: unknown } | null)?.platformMessage;
  if (typeof m === "string" && m.trim()) return m.trim();
  const s = (err as { platformSentence?: unknown } | null)?.platformSentence;
  if (typeof s === "string" && s.trim()) return s.trim();
  return err instanceof Error && err.message.trim() ? err.message.trim() : "Something went wrong. Try again.";
}

const INITIAL: LiveStartState = { stage: "opening", vault: null, error: null, step: null, principal: null, actor: null, vaults: [], signOutNotice: null };

/**
 * The start-up as a small state machine.
 *
 * @param o the credential, origin and vault settings
 * @returns the controller; nothing runs until `start()`
 */
export function createLiveStart(o: LiveStartOptions): LiveStartController {
  const http = o.transport ? { transport: o.transport } : {};
  const service =
    o.service ??
    createAppVaultService(
      {
        list: () => listVaults(o.idOrigin, { credential: o.credential, ...http }),
        checkName: (n) => checkVaultName(o.idOrigin, n, http),
        create: (body) => createNamedVault(o.idOrigin, body, { credential: o.credential, ...http }),
        ...(o.store !== undefined ? { store: o.store } : {}),
      },
      o.vaultConfig,
    );

  let state: LiveStartState = INITIAL;
  let generation = 0;
  let disposed = false;
  let signingOut: Promise<void> | null = null;
  let abort = new AbortController();
  const listeners = new Set<() => void>();

  const set = (next: LiveStartState): void => {
    state = next;
    for (const l of [...listeners]) l();
  };

  function open(principal: string): void {
    if (signingOut) return;
    const mine = ++generation;
    set({ ...INITIAL, stage: "opening", step: "listing", principal });
    service
      .open(principal, (step) => {
        if (mine === generation && !disposed && state.step !== step) set({ ...state, step });
      })
      .then((r) => {
        if (mine !== generation || disposed) return;
        const landing = r.vaults.find((v) => v.isLandingVault);
        set({ stage: "ready", vault: r.vault, error: null, step: null, principal, actor: landing?.vaultId ?? r.vault.vaultId, vaults: r.vaults, signOutNotice: null });
      })
      .catch((e: unknown) => {
        if (mine !== generation || disposed) return;
        set({ ...INITIAL, stage: "error", error: sentenceOfStartError(e), principal });
      });
  }

  function showCard(): void {
    generation++;
    set({ ...INITIAL, stage: "signin" });
  }

  const self: LiveStartController = {
    getState: () => state,
    subscribe(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    get signal() {
      return abort.signal;
    },
    start() {
      if (signingOut) return;
      disposed = false; // a StrictMode remount starts the same controller again
      const mine = ++generation;
      if (state !== INITIAL) set(INITIAL);
      o.credential.restore().then(
        (s) => {
          if (mine !== generation || disposed) return;
          if (s) open(s.principal);
          else showCard();
        },
        () => {
          if (mine === generation && !disposed) showCard();
        },
      );
    },
    signedIn() {
      if (signingOut) return;
      const mine = ++generation;
      o.credential.getSession().then(
        (s) => {
          if (mine === generation && !disposed) open(s.principal);
        },
        (e: unknown) => {
          if (mine === generation && !disposed) set({ ...INITIAL, stage: "error", error: sentenceOfStartError(e) });
        },
      );
    },
    retry() {
      if (signingOut) return;
      if (state.stage !== "error") return;
      if (state.principal) open(state.principal);
      else self.signedIn(); // the error came before the session was read: read it again
    },
    signOut() {
      if (signingOut) return signingOut;
      generation++;
      abort.abort(); // first: nothing below this line may start a read
      if (!disposed) set({ ...state, stage: "signing-out", step: null });
      const run = async (): Promise<void> => {
        let notice: string | null = null;
        try {
          if (o.credential.signOut) {
            try {
              const r = await o.credential.signOut(o.idOrigin);
              if (!r || r.serverSignedOut !== true) notice = SIGN_OUT_NOT_RECORDED;
            } catch {
              notice = SIGN_OUT_NOT_RECORDED;
              await o.credential.invalidate(true); // the server call failed: still clear locally
            }
          } else {
            await o.credential.invalidate(true);
          }
        } finally {
          service.reset();
          signingOut = null;
          abort = new AbortController();
          if (!disposed) {
            generation++;
            set({ ...INITIAL, stage: "signin", signOutNotice: notice });
          }
        }
      };
      signingOut = run();
      return signingOut;
    },
    dispose() {
      disposed = true;
      generation++;
    },
  };
  return self;
}
