// React wrapper over `createLiveStart`. See liveStart.ts for the stages and the rules.
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createLiveStart, type LiveStartOptions, type LiveStartState } from "./liveStart";
import { makeSignInAuth } from "./signInAuth";
import type { SessionCredential } from "./session";
import type { SignInApp, SignInAuth } from "./types";

export interface UseLiveStartOptions extends Omit<LiveStartOptions, "credential"> {
  credential: SessionCredential | LiveStartOptions["credential"];
  /** The app's identity for the sign-in card (`app.productName` also goes in the one-time-code email). */
  app: SignInApp;
  /** Cookie mode for verify-code. Default: decided from the page; see `makeSignInAuth`. */
  credentials?: "include" | "omit";
}

export interface UseLiveStartResult extends LiveStartState {
  retry(): void;
  signOut(): Promise<void>;
  /** Spread onto `<SignInCard {...signInProps} />` while `stage` is "signin". */
  signInProps: { app: SignInApp; auth: SignInAuth; onSignedIn: () => void };
}

/**
 * Start-up of a live app: restore the sign-in or show the card, find or make the person's own app
 * vault, then say "ready". Stages: "signin" | "opening" | "ready" | "error".
 * Pass stable `credential`, `vaultConfig` and `app` (module constants or memoised): a new one restarts the start-up.
 *
 * @param o the credential, the sign-in origin, the app identity and the vault settings
 * @returns the state, `retry`, `signOut` and the props for the sign-in card
 */
export function useLiveStart(o: UseLiveStartOptions): UseLiveStartResult {
  const { credential, idOrigin, app, vaultConfig, transport, store, service, credentials } = o;
  const ctl = useMemo(
    () =>
      createLiveStart({
        credential: credential as LiveStartOptions["credential"],
        idOrigin,
        vaultConfig,
        ...(transport ? { transport } : {}),
        ...(store !== undefined ? { store } : {}),
        ...(service ? { service } : {}),
      }),
    [credential, idOrigin, vaultConfig, transport, store, service],
  );
  useEffect(() => {
    ctl.start();
    return () => ctl.dispose();
  }, [ctl]);
  const state = useSyncExternalStore(ctl.subscribe, ctl.getState, ctl.getState);
  const auth = useMemo(
    () =>
      makeSignInAuth({
        credential: credential as Pick<SessionCredential, "signInWithCode">,
        origin: idOrigin,
        productName: app.productName,
        ...(transport ? { transport } : {}),
        ...(credentials ? { credentials } : {}),
      }),
    [credential, idOrigin, app.productName, transport, credentials],
  );
  const signInProps = useMemo(() => ({ app, auth, onSignedIn: () => ctl.signedIn() }), [app, auth, ctl]);
  return useMemo(
    () => ({ ...state, retry: () => ctl.retry(), signOut: () => ctl.signOut(), signInProps }),
    [state, ctl, signInProps],
  );
}
