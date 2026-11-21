// The one file a new app edits first. Every name, host and type the app uses is here.
import type { StarterSettings } from "@kaigilb/gilbplatformcode-starter-app";

export const SETTINGS: StarterSettings = {
  // RENAME: the app's short id (lower-case letters, digits, hyphens). It prefixes what the app keeps in the browser.
  appId: "starter",
  // RENAME: the app's name, as people read it on the sign-in card, in the header and in the sign-in email.
  appName: "Starter",
  // RENAME: added to a person's own name to name their vault for this app: Ann's vault is `ann` + this.
  vaultNameSuffix: "starter",
  // SET BEFORE THE FIRST LIVE SIGN-IN: the full address of the GilbVeda type each person's vault for this app represents.
  // Agent.Concept gives a new app its type. While it is empty the live app shows a set-up page and makes no vault.
  vaultType: "",

  // GilbPlatform production. The platform origin is the apex: only the apex reaches each vault at its own host.
  // The sign-in origin is the identity host: codes, accounts, the vault list and making a vault live there.
  // A test rig sets the two VITE_ values in its environment instead.
  platformOrigin: import.meta.env.VITE_PLATFORM_ORIGIN ?? "https://gilb.com",
  idOrigin: import.meta.env.VITE_ID_ORIGIN ?? "https://id.gilb.com",
  systemVaultHosts: ["id.gilb.com", "veda.gilb.com", "geo.gilb.com", "kaizen.gilb.com", "connect.gilb.com", "maintain.gilb.com"],

  // The address the App Style Studio shows after Save. Until the app has one, its own public/style.tokens.json is the style.
  styleSheetUrl: "",
};
