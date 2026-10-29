// Host wiring for the units: origins, the one credential, the sign-in auth object, vault lookup.
import { setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { lwsAuthFromSession, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import {
  checkVaultName,
  prepareVaultName,
  requestSignInCode,
  type SignInApp,
  type SignInAuth,
} from "@kaigilb/gilbplatformcode-signin/core";
import { lwsReadFetch } from "@kaigilb/gilbplatformcode-lws-vault-sets";

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

/** The apex the units treat as the platform (vault hosts are its subdomains). */
export const PLATFORM_ORIGIN = env.VITE_PLATFORM_ORIGIN ?? "https://gilb.com";
/** The identity host: sign-in and the list of vaults a person reaches. */
export const ID_ORIGIN = env.VITE_ID_ORIGIN ?? "https://id.gilb.com";
export const SYSTEM_HOSTS = ["id", "veda", "geo", "kaizen", "connect", "maintain"].map((h) => `${h}.${new URL(PLATFORM_ORIGIN).hostname}`);

export const credential = new SessionCredential({ dpopMintUrl: `${ID_ORIGIN}/base/auth/session/dpop-token` });

/** Called once at start-up (and by tests). */
export function initPlatform(): void {
  setBaseOrigin(PLATFORM_ORIGIN);
  setSystemVaultHosts(SYSTEM_HOSTS);
  setLwsAuth(lwsAuthFromSession(credential));
}

export const signInApp: SignInApp = {
  id: "records-app",
  productName: "Records",
  title: "Sign in to Records",
  origin: ID_ORIGIN,
  returnTo: () => window.location.origin + "/",
};

/** The auth object the SignInCard needs, built from the unit's own HTTP helpers and the credential. */
export const signInAuth: SignInAuth = {
  requestCode: (email, returnTo) => requestSignInCode(ID_ORIGIN, email, returnTo, "Records"),
  verifyCode: async (email, code, name) => {
    const body = await credential.signInWithCode(ID_ORIGIN, email, code, name, "Records");
    return { needsVaultName: body.needsVaultName === true, suggestedName: body.suggestedName };
  },
  prepareName: (email) => prepareVaultName(ID_ORIGIN, email),
  checkName: (name) => checkVaultName(ID_ORIGIN, name),
  // The first vault is made by verify-code with `name` (Dev.Guide.GetStarted.Token); the card calls
  // verifyCode again with the name, so there is nothing more to do here.
  completeNamedVault: async () => undefined,
};

export interface ReachableVault {
  vaultId: string;
  name?: string;
  modes?: string[];
  isLandingVault?: boolean;
}

/** Pick the vault the app uses: the landing vault the person can write to, else the first writable. */
export function pickVault(vaults: ReachableVault[]): ReachableVault | null {
  const writable = vaults.filter((v) => (v.modes ?? []).includes("write"));
  return writable.find((v) => v.isLandingVault) ?? writable[0] ?? null;
}

/** GET {id}/lws/vaults (Dev.Guide.GetStarted.FindVault). */
export async function findMyVault(): Promise<ReachableVault | null> {
  const res = await lwsReadFetch(`${ID_ORIGIN}/lws/vaults`);
  if (!res.ok) throw new Error(`Could not list your vaults (HTTP ${res.status}).`);
  const body = (await res.json()) as { vaults?: ReachableVault[] };
  return pickVault(body.vaults ?? []);
}
