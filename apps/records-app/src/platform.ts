// Host wiring for the units: origins, the one credential, the sign-in auth object, vault lookup.
import { NotSignedInError } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { ownVaultIdOf, vaultRootOf } from "@kaigilb/gilbplatformcode-plan-self-source";
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
import { setSystemHostLabels } from "@kaigilb/gilbplatformcode-own-card";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { lwsReadFetch } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { sameUrl } from "./sameUrl";

/** The apex the units treat as the platform (vault hosts are its subdomains). */
export const PLATFORM_ORIGIN = import.meta.env.VITE_PLATFORM_ORIGIN ?? "https://gilb.com";
/** The identity host: sign-in and the list of vaults a person reaches. */
export const ID_ORIGIN = import.meta.env.VITE_ID_ORIGIN ?? "https://id.gilb.com";
export const VEDA_ORIGIN = import.meta.env.VITE_VEDA_ORIGIN ?? "https://veda.gilb.com";
export const SYSTEM_HOSTS = ["id", "veda", "geo", "kaizen", "connect", "maintain"].map((h) => `${h}.${new URL(PLATFORM_ORIGIN).hostname}`);

// The cookie session bridge works only same-site. From a local dev origin it is cross-site and answers 401
// (RuleRigdevNoCrossSiteCookieBridge), so the dev server signs in cookieless and a reload ends the session by design.
const dev = import.meta.env.DEV === true;
export const credential = new SessionCredential(dev ? {} : { dpopMintUrl: `${PLATFORM_ORIGIN}/base/auth/session/dpop-token` });

/** Called once at start-up (and by tests). */
export function initPlatform(): void {
  setBaseOrigin(PLATFORM_ORIGIN);
  setSystemVaultHosts(SYSTEM_HOSTS);
  setLwsAuth(lwsAuthFromSession(credential));
  setSystemHostLabels(["id", "veda", "geo", "kaizen", "connect", "maintain", "www", "skills", "gilb"]);
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

interface VaultRow {
  "@id"?: string;
  vaultId: string;
  name?: string;
  modes?: string[];
  isLandingVault?: boolean;
}

/** The vault the app works in, plus how many vaults the credential reached (the identity proof: no whoami exists). */
export type AppVault = ReachableVault & { reachCount: number };

/** The pinned vault cannot be used: not reached, or reached without write. Shown as is; never falls back. */
export class VaultNotReachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultNotReachableError";
  }
}

/** The credential is past its lifetime: a different thing from "not signed in". */
export class CredentialExpiredError extends Error {
  constructor() {
    super("Your sign-in has expired. Sign in again.");
    this.name = "CredentialExpiredError";
  }
}

function toVault(row: VaultRow, count: number): AppVault {
  // Only the fields the units read are real; the rest are empty. HOST OBJECT: no unit builds this from /lws/vaults.
  // `@id` is the vault's entity (GilbApp 9a602ea7 src/lib/base/vaultSets.ts:197-201).
  const modes = (row.modes ?? []).filter((m) => m === "read" || m === "write");
  return { vaultId: row.vaultId, entity: row["@id"] ?? null, name: row.name ?? null, isLandingVault: row.isLandingVault === true, modes, parent: null, parentAmbiguous: false, represents: null, reachCount: count } as unknown as AppVault;
}

/**
 * Pick the vault. With a pin (VITE_VAULT_URL) only the row whose vault id or entity root IS the pin;
 * with none, the landing vault the person can write to, else the first writable.
 */
export function pickVault(rows: VaultRow[], pin?: string | null): AppVault | null {
  const withWrite = (r: VaultRow) => (r.modes ?? []).includes("write");
  if (pin) {
    const hit = rows.find((r) => sameUrl(r.vaultId, pin) || sameUrl(vaultRootOf(r["@id"] ?? ""), pin));
    if (!hit) throw new VaultNotReachableError(`The vault ${pin} is not among the ${rows.length} vault(s) this credential reaches.`);
    if (!withWrite(hit)) throw new VaultNotReachableError(`The vault ${pin} is reached with modes [${(hit.modes ?? []).join(", ")}], but this app needs write.`);
    return toVault(hit, rows.length);
  }
  const writable = rows.filter(withWrite);
  const row = writable.find((v) => v.isLandingVault) ?? writable[0];
  return row ? toVault(row, rows.length) : null;
}

/** The two vaults the app works in, named apart: records in the pinned one, the person's own card in their own (landing) vault. */
export interface MyVaults {
  recordsVault: AppVault | null;
  profileVault: AppVault | null;
}

/**
 * The person's OWN vault, chosen by plan-self-source's ownVaultIdOf (the session vault is not known here, so: the row flagged landing).
 * Must be read-capable. No row qualifies: null. Never the pinned vault, never rows[0].
 */
export function pickProfileVault(rows: VaultRow[]): AppVault | null {
  const id = ownVaultIdOf({ reach: null, vaults: rows.map((r) => ({ vaultId: r.vaultId, isLandingVault: r.isLandingVault === true })), sessionVaultEntity: null });
  const hit = id ? rows.find((r) => r.vaultId === id) : undefined;
  if (!hit || !(hit.modes ?? []).includes("read")) return null;
  return toVault(hit, rows.length);
}

/** GET {id}/lws/vaults (Dev.Guide.GetStarted.FindVault). A 401 that names expiry is "expired", not "not signed in". */
export async function findMyVault(pin: string | null | undefined = import.meta.env.VITE_VAULT_URL): Promise<MyVaults> {
  const res = await lwsReadFetch(`${ID_ORIGIN}/lws/vaults`);
  if (res.status === 401) {
    const body = await res.text().catch(() => "");
    throw /expir/i.test(body) ? new CredentialExpiredError() : new NotSignedInError();
  }
  if (!res.ok) throw new Error(`Could not list your vaults (HTTP ${res.status}).`);
  const rows = ((await res.json()) as { vaults?: VaultRow[] }).vaults ?? [];
  if (rows.length === 0) throw new Error("Signed in, but this credential reaches no vault: identity not proven.");
  return { recordsVault: pickVault(rows, pin || null), profileVault: pickProfileVault(rows) };
}
