// The app: the starter around the app's own sections. `boot` is called once, before the first render.
import { StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { settingsProblems, StarterApp, startStarter, type StarterSettings } from "@kaigilb/gilbplatformcode-starter-app";
import { SECTIONS } from "./sections";

/** Shown instead of the app while a setting is missing, so a new app says what to set and never starts half set up. */
export function SetupPage({ problems }: { problems: readonly string[] }) {
  return (
    <main className="app-setup" role="alert">
      <h1>This app is not set up yet</h1>
      <p>Set these in src/settings.ts, then load the page again:</p>
      <ul>
        {problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </main>
  );
}

/**
 * Starts the app in `root`: checks the settings, starts the style and the credential (before the first render), then draws.
 *
 * @param settings the app's settings
 * @param root the element to draw in
 * @param signInNote drawn above the sign-in card (the fake mode says how to sign in)
 * @returns the React root, so a test can unmount it
 */
export function boot(settings: StarterSettings, root: HTMLElement, signInNote?: ReactNode): Root {
  const reactRoot = createRoot(root);
  const problems = settingsProblems(settings);
  if (problems.length) {
    reactRoot.render(<SetupPage problems={problems} />);
    return reactRoot;
  }
  const runtime = startStarter(settings);
  reactRoot.render(
    <StrictMode>
      <StarterApp runtime={runtime} sections={SECTIONS} signInNote={signInNote} />
    </StrictMode>,
  );
  return reactRoot;
}
