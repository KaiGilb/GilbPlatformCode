// Chooses the screen: Settings (first run, or on request), Sign in, or the Card. It reads and writes nothing itself: the sign-in unit
// signs the person in, and the host unit and the card units read and save.
import { useState } from "react";
import { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import type { Transport } from "@kaigilb/gilbplatformcode-signin";
import { CardScreen } from "./CardScreen";
import { SettingsScreen } from "./SettingsScreen";
import { SignInScreen } from "./SignInScreen";
import { SIGNIN_ORIGIN } from "./config";
import { loadSettings, saveSettings, type AppSettings } from "./settings";

export interface AppSeams {
  /** Makes the credential a sign-in fills. Default: a new `SessionCredential` (key and token in memory only). */
  makeSession?: () => SessionCredential;
  /** The transport of the sign-in's code request. Default: the unit's (`fetch`). */
  transport?: Transport;
  /** Where the sign-in code is asked for and checked. Default: the Gilb sign-in host (`SIGNIN_ORIGIN`), not the vault's. */
  signinOrigin?: string;
}

// No `dpopMintUrl`: the cookie session bridge stays off for a local app (it cannot work across sites), so a reload asks for a new code.
export const newCredential = () => new SessionCredential();

export function App({ makeSession = newCredential, transport, signinOrigin = SIGNIN_ORIGIN }: AppSeams) {
  const [settings, setSettings] = useState<AppSettings | null>(loadSettings);
  const [editingSettings, setEditingSettings] = useState(false);
  const [credential, setCredential] = useState<SessionCredential>(makeSession);
  const [signedIn, setSignedIn] = useState(false);

  const signOut = () => {
    credential.invalidate(true);
    setCredential(makeSession());
    setSignedIn(false);
  };

  return (
    <main>
      <header>
        <h1>Plan cards taking app</h1>
        {settings && !editingSettings && <button type="button" onClick={() => setEditingSettings(true)}>Settings</button>}{" "}
        {signedIn && <button type="button" onClick={signOut}>Sign out</button>}
      </header>
      {!settings || editingSettings ? (
        <SettingsScreen
          initial={settings}
          onCancel={settings ? () => setEditingSettings(false) : undefined}
          onSave={(next) => {
            saveSettings(next);
            // A session belongs to the origin it signed in at.
            if (settings && settings.origin !== next.origin && signedIn) signOut();
            setSettings(next);
            setEditingSettings(false);
          }}
        />
      ) : !signedIn ? (
        <SignInScreen origin={signinOrigin} credential={credential} transport={transport} onSignedIn={() => setSignedIn(true)} />
      ) : (
        <CardScreen settings={settings} session={credential} />
      )}
    </main>
  );
}
