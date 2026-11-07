import { StrictMode, useMemo, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SignInCard, requestSignInCode, type SignInApp, type SignInAuth } from "@kaigilb/gilbplatformcode-signin";
import { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import "@kaigilb/gilbplatformcode-signin/signin.css";
import { lwsAuthFromSession, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { writableVaults } from "@kaigilb/gilbplatformcode-vault-list";
import { enablePictureDeviceCache } from "@kaigilb/gilbplatformcode-signed-picture";
import { App, forgetEverything } from "./App";
import { PictureEngine } from "./engine";
import { configureApp, deviceCacheName } from "./setup";
import type { Session } from "./types";

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

async function sessionFromVaultList(): Promise<Session> {
  const who = await credential.getSession();
  // The sign-in's own vault set (vaultId + modes). reachable-vaults would add names and parents but its peer chain is ~50 units.
  const vault = writableVaults(who.vaults)[0];
  if (!vault) throw new Error("This person has no vault they can write to.");
  return { principal: who.principal, vaultOrigin: new URL(vault.vaultId).origin, vaultRoot: vault.vaultId };
}

function Root() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const engine = useMemo(() => (session ? new PictureEngine(session) : null), [session]);
  useEffect(() => {
    if (!engine || !session) return;
    enablePictureDeviceCache({ name: deviceCacheName(session.principal) });
    void engine.start();
    return () => engine.dispose();
  }, [engine, session]);
  const signOut = () => {
    engine?.release();
    credential.invalidate(true);
    void forgetEverything();
    setSession(null);
  };
  if (!engine) {
    return (
      <>
        <SignInCard app={app} auth={auth} onSignedIn={() => void sessionFromVaultList().then(setSession, (e: Error) => setError(e.message))} />
        {error ? <p role="alert">{error}</p> : null}
      </>
    );
  }
  return <App engine={engine} onSignOut={signOut} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
