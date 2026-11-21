// What a new app tells the starter. Every host, name and type comes from here: this unit holds none.

/** The settings of one app built on the starter. The app keeps them in one file of its own. */
export interface StarterSettings {
  /** The app's short id: lower-case letters, digits and hyphens. It prefixes every key the app keeps in the browser. */
  appId: string;
  /** The app's name: on the sign-in card, in the header and in the email that carries the sign-in code. */
  appName: string;
  /** The platform origin (the apex). Every vault address and every vault call is built from it. No path. */
  platformOrigin: string;
  /** The sign-in origin (the identity host). Codes, accounts, the vault list and making a vault go there. No path. */
  idOrigin: string;
  /** Bare host names of the platform's own system vaults. Default: none. */
  systemVaultHosts?: readonly string[];
  /** Bare host names of a local development rig. Leave out in production. */
  localRigHosts?: readonly string[];
  /** The full address of the GilbVeda type that each person's vault for this app represents. */
  vaultType: string;
  /** Added to the person's own name to name their vault for this app: `plants` names Ann's vault `annplants`. Lower-case letters and digits. */
  vaultNameSuffix: string;
  /** The address of the app's saved style sheet (the App Style Studio shows it after Save). Left out: the app's own style file is used. */
  styleSheetUrl?: string;
  /** The app's own style file, used when no saved style can be read. Default: `/style.tokens.json`. */
  styleFallbackUrl?: string;
}

const APP_ID = /^[a-z][a-z0-9-]*$/;
const SUFFIX = /^[a-z0-9]+$/;
const BARE_HOST = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;

function parse(text: unknown): URL | null {
  if (typeof text !== "string" || !text.trim()) return null;
  try {
    return new URL(text.trim());
  } catch {
    return null;
  }
}

const isHttp = (u: URL): boolean => u.protocol === "http:" || u.protocol === "https:";

function isOrigin(text: unknown): boolean {
  const u = parse(text);
  return u !== null && isHttp(u) && (u.pathname === "/" || u.pathname === "") && !u.search && !u.hash && !u.username && !u.password;
}

/**
 * Checks the settings before anything is started.
 *
 * @param s the app's settings
 * @returns one plain sentence per problem; an empty list means the settings can be used
 */
export function settingsProblems(s: StarterSettings): string[] {
  const p: string[] = [];
  if (typeof s.appId !== "string" || !APP_ID.test(s.appId)) p.push("appId must start with a letter and hold only lower-case letters, digits and hyphens.");
  if (typeof s.appName !== "string" || !s.appName.trim()) p.push("appName is empty.");
  if (!isOrigin(s.platformOrigin)) p.push("platformOrigin must be an http or https origin with no path.");
  if (!isOrigin(s.idOrigin)) p.push("idOrigin must be an http or https origin with no path.");
  const type = parse(s.vaultType);
  if (type === null || !isHttp(type) || type.pathname.length < 2) p.push("vaultType must be the full address of the type each person's vault represents.");
  if (typeof s.vaultNameSuffix !== "string" || !SUFFIX.test(s.vaultNameSuffix)) p.push("vaultNameSuffix must hold only lower-case letters and digits.");
  for (const [key, hosts] of [["systemVaultHosts", s.systemVaultHosts], ["localRigHosts", s.localRigHosts]] as const) {
    if (hosts !== undefined && !hosts.every((h) => typeof h === "string" && (BARE_HOST.test(h) || /^\[[0-9a-f:]+\]$/i.test(h)))) p.push(`${key} must be bare host names, with no scheme, port or path.`);
  }
  if (s.styleSheetUrl !== undefined && s.styleSheetUrl !== "") {
    const sheet = parse(s.styleSheetUrl);
    if (sheet === null || !isHttp(sheet)) p.push("styleSheetUrl must be the http or https address of the saved style sheet, or be left out.");
  }
  if (s.styleFallbackUrl !== undefined && !s.styleFallbackUrl.trim()) p.push("styleFallbackUrl is empty; leave it out to use /style.tokens.json.");
  return p;
}
