import { StrictMode, useMemo, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SignInCard, requestSignInCode, type SignInApp, type SignInAuth } from "@kaigilb/gilbplatformcode-signin";
import { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import "@kaigilb/gilbplatformcode-signin/signin.css";
import { lwsAuthFromSession, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import type { VaultListItem } from "@kaigilb/gilbplatformcode-vault-list";
import { enablePictureDeviceCache } from "@kaigilb/gilbplatformcode-signed-picture";
import { App, forgetEverything } from "./App";
import { PictureEngine } from "./engine";
import { configureApp, deviceCacheName, identityOrigin, PLATFORM_ORIGIN } from "./setup";
import type { Session } from "./types";
import { VaultGate } from "./vaultChoice";

// dev:live (http://localhost:5251): units address each vault at its own host (apex base origin).
// Sign-in, create-named and the vault list stay on the identity host. NOT RUN against a live platform. See the README.
configureApp(PLATFORM_ORIGIN);
const ID_ORIGIN = identityOrigin();

const credential = new SessionCredential({});
setLwsAuth(lwsAuthFromSession(credential));

const app: SignInApp = {
  id: "pictures-example",
  productName: "Pictures",
  title: "Pictures",
  origin: ID_ORIGIN,
  returnTo: () => window.location.origin,
};

const auth: SignInAuth = {
  requestCode: (email, returnTo) => requestSignInCode(ID_ORIGIN, email, returnTo, "Pictures"),
  verifyCode: async (email, code) => {
    await credential.signInWithCode(ID_ORIGIN, email, code);
    return { needsVaultName: false };
  },
  prepareName: async () => ({ isReturning: true }),
  checkName: async (name) => ({ available: false, reserved: false, name }),
  completeNamedVault: async () => undefined,
};

interface SignedIn {
  principal: string;
  vaults: VaultListItem[];
  /** Set when the vault list could not be read, or is only partial. */
  vaultsProblem?: string;
}

async function readSignIn(): Promise<SignedIn> {
  const who = await credential.getSession();
  // Not only the set verify-code returned (that answer has none). signInWithCode fills vaults
  // from GET /lws/vaults. A list that could not be read, or that is partial, is vaultsProblem.
  return { principal: who.principal, vaults: (who.vaults ?? []) as VaultListItem[], vaultsProblem: who.vaultsProblem };
}

/** Starts the engine only for the vault the owner chose in ?vault=. */
function ChosenVault({ signedIn, vault, name, onSignOut }: { signedIn: SignedIn; vault: VaultListItem; name: string; onSignOut: () => void }) {
  const session: Session = { principal: signedIn.principal, vaultOrigin: new URL(vault.vaultId).origin, vaultRoot: vault.vaultId };
  const engine = useMemo(() => new PictureEngine(session), [session.principal, session.vaultRoot]);
  useEffect(() => {
    enablePictureDeviceCache({ name: deviceCacheName(session.principal) });
    void engine.start();
    return () => engine.dispose();
  }, [engine]);
  const out = () => {
    engine.release();
    onSignOut();
  };
  return <App engine={engine} onSignOut={out} vaultLine={`Vault: ${name} (${vault.vaultId})`} />;
}

function Root() {
  const [signedIn, setSignedIn] = useState<SignedIn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signOut = () => {
    credential.invalidate(true);
    void forgetEverything();
    setSignedIn(null);
  };
  if (!signedIn) {
    return (
      <>
        <SignInCard app={app} auth={auth} onSignedIn={() => void readSignIn().then(setSignedIn, (e: Error) => setError(e.message))} />
        {error ? <p role="alert">{error}</p> : null}
      </>
    );
  }
  return (
    <VaultGate vaults={signedIn.vaults} problem={signedIn.vaultsProblem} search={window.location.search} onSignOut={signOut}>
      {(vault, name) => <ChosenVault signedIn={signedIn} vault={vault} name={name} onSignOut={signOut} />}
    </VaultGate>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
