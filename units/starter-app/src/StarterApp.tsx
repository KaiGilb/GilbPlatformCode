// The starter: sign-in, the person's own vault, the frame for a wide window and a phone, vault choice,
// share and sign-out, joined from the units that do each. A new app passes its settings and its sections.
import { useMemo, type ReactNode } from "react";
import { SignInCard, useLiveStart } from "@kaigilb/gilbplatformcode-signin";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { ActionRow } from "@kaigilb/gilbplatformcode-style-runtime/react";
import "@kaigilb/gilbplatformcode-signin/signin.css";
import "./starterApp.css";
import type { StarterRuntime } from "./start";
import { defaultWords, type StarterWords } from "./words";
import { Workspace } from "./Workspace";

/** The vault a section works in: the person's own, or one another person shared with them. */
export interface StarterVault {
  /** The vault's address. Every record call of a section names it. */
  vaultId: string;
  /** The name to show for it. */
  label: string;
  /** True for the person's own vault for this app. */
  yours: boolean;
  /** False: the vault can be read but not changed. Hide or turn off add, change and delete. */
  canWrite: boolean;
}

/** What every section gets. */
export interface StarterContext {
  /** The open vault. A section is drawn afresh when the person opens another vault. */
  vault: StarterVault;
  /** Who signed in, as the session names them. */
  principal: string;
  /** The person's own address (their landing vault), the source of what they save. */
  actor: string;
  /** Aborts when sign-out starts. Pass it to every read the section starts, and start none once it is aborted. */
  signal: AbortSignal;
  /** The session credential, for a call that signs itself. Most units read it through the credential seam and need nothing passed. */
  credential: SessionCredential;
  /** Call when the platform refuses the open vault (403): the vault is no longer offered and the person's own vault opens. */
  vaultRefused(): void;
}

/** One section of the app: a line in the menu and what the centre shows for it. */
export interface StarterSection {
  /** Unique within the app. */
  id: string;
  /** The line in the menu. */
  label: string;
  /** The centre region. */
  render(ctx: StarterContext): ReactNode;
  /** The right region (a record's detail), when the section has one. */
  detail?(ctx: StarterContext): ReactNode;
}

export interface StarterAppProps {
  /** What `startStarter(settings)` returned. Module level: one per page. */
  runtime: StarterRuntime;
  /** The app's sections, at least one. The first is shown after sign-in. Keep the array stable (a module constant). */
  sections: readonly StarterSection[];
  /** Replace any sentence the starter shows. */
  words?: Partial<StarterWords>;
  /** Drawn above the sign-in card, for example a note in a development mode. */
  signInNote?: ReactNode;
}

/**
 * The whole app around the sections: it restores the sign-in or shows the sign-in card, finds the person's own vault
 * for this app (the first sign-in makes it, once), then draws the frame with the sections, the vault chip, Share and Sign out.
 */
export function StarterApp({ runtime, sections, words, signInNote }: StarterAppProps) {
  if (sections.length === 0) throw new Error("starter-app: pass at least one section");
  const w = useMemo<StarterWords>(() => ({ ...defaultWords, ...words, opening: { ...defaultWords.opening, ...words?.opening } }), [words]);
  const start = useLiveStart({ credential: runtime.credential, idOrigin: runtime.settings.idOrigin, app: runtime.app, vaultConfig: runtime.vaultConfig });

  if (start.stage === "ready" && start.vault && start.principal) {
    return (
      <Workspace
        key={start.principal}
        runtime={runtime}
        sections={sections}
        words={w}
        ownVault={start.vault}
        listed={start.vaults}
        principal={start.principal}
        actor={start.actor ?? start.vault.vaultId}
        signal={start.signal}
        onSignOut={() => void start.signOut()}
      />
    );
  }
  if (start.stage === "signin") {
    return (
      <main className="sa-stage" data-stage="signin">
        {signInNote}
        {start.signOutNotice ? (
          <p className="sa-note" role="status">
            {start.signOutNotice}
          </p>
        ) : null}
        <SignInCard {...start.signInProps} />
      </main>
    );
  }
  if (start.stage === "error") {
    return (
      <main className="sa-stage" data-stage="error">
        <div className="sa-panel" role="alert">
          <h1 className="sa-panel-title">{w.couldNotOpen}</h1>
          <p>{start.error}</p>
          <ActionRow
            cancel={
              <button type="button" className="gs-btn gs-btn--secondary" onClick={() => void start.signOut()}>
                {w.signOut}
              </button>
            }
            primary={
              <button type="button" className="gs-btn" onClick={start.retry}>
                {w.retry}
              </button>
            }
          />
        </div>
      </main>
    );
  }
  return (
    <main className="sa-stage" data-stage={start.stage}>
      <p className="sa-wait" role="status">
        {start.stage === "signing-out" ? w.signingOut : start.step ? w.opening[start.step] : w.checkingSignIn}
      </p>
    </main>
  );
}
