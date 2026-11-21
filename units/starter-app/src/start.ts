// The once-per-page start of an app built on the starter: the platform origins and the session credential
// (`configureLiveApp`), and the style (`loadStyle`), both before the first render.
import { configureLiveApp } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import type { AppVaultConfig, SignInApp } from "@kaigilb/gilbplatformcode-signin";
import type { SessionCredential, SessionCredentialOptions } from "@kaigilb/gilbplatformcode-signin/session";
import { loadStyle, makeVaultFetchRemote, type LoadStyleResult } from "@kaigilb/gilbplatformcode-style-runtime";
import { settingsProblems, type StarterSettings } from "./settings";

/** What `startStarter` made. Pass it to `<StarterApp runtime={...} />`. Make it once, at module level. */
export interface StarterRuntime {
  settings: StarterSettings;
  /** The one session credential of the page. Every signed call uses it. */
  credential: SessionCredential;
  /** The app's identity on the sign-in card. */
  app: SignInApp;
  /** What the app says about each person's vault: the type, the name suffix and the storage prefix. */
  vaultConfig: AppVaultConfig;
  /** How the style load ended (`source` is `cache`, `remote`, `fallback` or `none`). Never rejects. Do not wait for it before the first render. */
  style: Promise<LoadStyleResult>;
}

export interface StartStarterOptions {
  /** The address put in the sign-in email. Default: the page's own origin. */
  returnTo?: () => string;
  /** Options of the session credential (storage, transport, renewal). */
  credentialOptions?: SessionCredentialOptions;
  /** The page to style. Default: `document`. */
  doc?: Document;
}

/** The style's cache key for an app id. */
export const styleCacheKey = (appId: string): string => `style:${appId}`;

/** The sentence `loadStyle` reports when the app names no saved style. The app's own style file is then used. */
export const NO_SAVED_STYLE = "no saved style address is set";

/**
 * Starts an app built on the starter. Call it once, before the first render.
 *
 * It checks the settings, sets the platform origin and the system vault hosts, makes the session credential and the
 * credential seam, and starts the style load (the cached style is applied before this returns).
 *
 * @param settings the app's settings
 * @param opts the return address for the sign-in email, credential options, the document
 * @returns the runtime for `StarterApp`
 * @throws Error naming every problem `settingsProblems` found
 */
export function startStarter(settings: StarterSettings, opts: StartStarterOptions = {}): StarterRuntime {
  const problems = settingsProblems(settings);
  if (problems.length) throw new Error(`starter-app: the settings cannot be used. ${problems.join(" ")}`);
  const idOrigin = new URL(settings.idOrigin).origin;
  const live = configureLiveApp({
    platformOrigin: new URL(settings.platformOrigin).origin,
    idOrigin,
    systemVaultHosts: [...(settings.systemVaultHosts ?? [])],
    ...(settings.localRigHosts ? { localRigHosts: [...settings.localRigHosts] } : {}),
    ...(opts.credentialOptions ? { credentialOptions: opts.credentialOptions } : {}),
  });
  const style = loadStyle({
    cacheKey: styleCacheKey(settings.appId),
    fetchRemote: settings.styleSheetUrl ? makeVaultFetchRemote(settings.styleSheetUrl) : () => Promise.reject(new Error(NO_SAVED_STYLE)),
    fallbackUrl: settings.styleFallbackUrl ?? "/style.tokens.json",
    ...(opts.doc ? { doc: opts.doc } : {}),
  });
  const app: SignInApp = {
    id: settings.appId,
    productName: settings.appName,
    title: settings.appName,
    origin: idOrigin,
    returnTo: opts.returnTo ?? (() => window.location.origin),
  };
  const vaultConfig: AppVaultConfig = { represents: settings.vaultType, nameSuffix: settings.vaultNameSuffix, storageKey: settings.appId };
  return { settings: { ...settings, idOrigin }, credential: live.credential, app, vaultConfig, style };
}
