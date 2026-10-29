// The `auth` the sign-in card takes: every wire call is the sign-in unit's own headless helper, bound to the platform origin the person
// typed, and the code is verified by the session credential itself (it makes its key, sends the public half, and holds the token in memory).
import { checkVaultName, prepareVaultName, requestSignInCode, type SignInAuth, type Transport } from "@kaigilb/gilbplatformcode-signin/core";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";

export const PRODUCT_NAME = "Stakeholder card taking app";

export function makeAuth(session: Pick<SessionCredential, "signInWithCode">, origin: string, transport?: Transport): SignInAuth {
  const http = transport ? { transport } : {};
  return {
    requestCode: (email, returnTo) => requestSignInCode(origin, email, returnTo, PRODUCT_NAME, http),
    verifyCode: async (email, code, name) => {
      const body = await session.signInWithCode(origin, email, code, name, PRODUCT_NAME);
      return { needsVaultName: body.needsVaultName === true, suggestedName: body.suggestedName };
    },
    prepareName: (email) => prepareVaultName(origin, email, http),
    checkName: (name) => checkVaultName(origin, name, http),
    completeNamedVault: () => Promise.reject(new Error(`Creating a new vault is not part of ${PRODUCT_NAME}. Sign in with an account that already has a vault.`)),
  };
}
