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
import { configureApp, deviceCacheName } from "./setup";
import type { Session } from "./types";
import { VaultGate } from "./vaultChoice";

// dev:live (http://localhost:5251): sign in at the identity host, read the vault root from the vault list.
// NOT RUN by the author of this file. See "Not yet proven live" in the README.
const ID_ORIGIN = "https://id.gilb.com";
configureApp(ID_ORIGIN);

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
}

async function readSignIn(): Promise<SignedIn> {
  const who = await credential.getSession();
  // The sign-in's own vault set (vaultId + modes). reachable-vaults would add names and parents but its peer chain is ~50 units.
  return { principal: who.principal, vaults: (who.vaults ?? []) as VaultListItem[] };
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
    <VaultGate vaults={signedIn.vaults} search={window.location.search} onSignOut={signOut}>
      {(vault, name) => <ChosenVault signedIn={signedIn} vault={vault} name={name} onSignOut={signOut} />}
    </VaultGate>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
