// `makeSignInAuth`: the `auth` the sign-in card takes, built once here. Five apps each kept a copy
// of these 15 lines (speed-lab, plan-cards-taking-app, pictures-example, and two EESpeed runs).
// Every wire call is this unit's own helper, bound to the origin the host passes. The code is
// verified by the session credential itself (it makes its key, sends the public half, and holds
// the token). Nothing here names a host.
import { checkVaultName, prepareVaultName, requestSignInCode } from "./http";
import type { Transport } from "./transport";
import type { SessionCredential } from "./session";
import type { SignInAuth } from "./types";

export interface MakeSignInAuthOptions {
  /** The session credential the app holds; only its `signInWithCode` is used. */
  credential: Pick<SessionCredential, "signInWithCode">;
  /** The vault-server origin the person signs in at, no trailing slash. */
  origin: string;
  /** The product name in the one-time-code email and in the refusal sentences. */
  productName: string;
  /** Optional transport for every call (tests, a native shell). Default: the global fetch. */
  transport?: Transport;
  /**
   * true when the app makes the person's first vault: `completeNamedVault` then resolves, because
   * `verifyCode` already sent the chosen name. Default false: `completeNamedVault` rejects with a
   * sentence saying that making a vault is not part of the app.
   */
  createsVault?: boolean;
}

/**
 * The `auth` for `SignInCard`: request code, verify code (through `credential.signInWithCode`),
 * prepare a name, check a name, and complete the vault.
 *
 * @param o the credential, the origin, the product name, and optionally a transport and `createsVault`
 * @returns a {@link SignInAuth}; the one-time-code error stays `CodeRejectedError` from `./types`
 */
export function makeSignInAuth(o: MakeSignInAuthOptions): SignInAuth {
  const { credential, origin, productName } = o;
  const http = o.transport ? { transport: o.transport } : {};
  return {
    requestCode: (email, returnTo) => requestSignInCode(origin, email, returnTo, productName, http),
    verifyCode: async (email, code, name) => {
      const body = await credential.signInWithCode(origin, email, code, name, productName);
      return { needsVaultName: body.needsVaultName === true, suggestedName: body.suggestedName };
    },
    prepareName: (email) => prepareVaultName(origin, email, http),
    checkName: (name) => checkVaultName(origin, name, http),
    completeNamedVault: o.createsVault
      ? () => Promise.resolve()
      : () =>
          Promise.reject(
            new Error(
              `Creating a new vault is not part of ${productName}. Sign in with an account that already has a vault.`,
            ),
          ),
  };
}
