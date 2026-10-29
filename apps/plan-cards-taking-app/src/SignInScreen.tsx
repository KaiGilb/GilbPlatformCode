import { useMemo } from "react";
import { SignInCard, type SignInApp, type Transport } from "@kaigilb/gilbplatformcode-signin";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { makeAuth, PRODUCT_NAME } from "./auth";

export function SignInScreen({ origin, credential, transport, onSignedIn }: { origin: string; credential: SessionCredential; transport?: Transport; onSignedIn: () => void }) {
  // `app` and `auth` keep one identity while the origin and the credential stay the same (the card resets its fields when `auth` changes).
  const app = useMemo<SignInApp>(() => ({ id: "plancardstakingapp", productName: PRODUCT_NAME, title: "Sign in", origin, returnTo: () => window.location.href }), [origin]);
  const auth = useMemo(() => makeAuth(credential, origin, transport), [credential, origin, transport]);
  return <SignInCard app={app} auth={auth} onSignedIn={onSignedIn} />;
}
