// Vault helpers for a signed-in app: normalise a name, list the vaults the person reaches, make
// a named vault. Framework-free; the origin is always passed in.
//
// Signing: the SAME pattern `SessionCredential.loadReachableVaults` uses in ./session. The caller
// passes the credential; this file asks it for `authHeaders(method, url)` (one fresh DPoP proof
// per request) and sends through the injected transport. There is no second auth path here.

import { fetchTransport, type Transport, type TransportResponse } from "./transport";
import { REACHABLE_VAULTS_PATH, narrowVaultModes, type VaultMode } from "./session";
import { SignInUnreachableError, VaultRequestRefusedError } from "./types";

/** `POST /base/vault/create-named`. A wire path: do not rename. */
export const CREATE_NAMED_VAULT_PATH = "/base/vault/create-named";

/** Anything that signs a request: a `SessionCredential`, or a host's own holder with the same method. */
export interface SignedRequestSource {
  authHeaders(method: string, url: string): Promise<{ Authorization: string; DPoP: string }>;
}

/** Options for {@link listVaults} and {@link createNamedVault}. */
export interface SignedVaultOptions {
  /** Signs each request. Pass the `SessionCredential` the app signed in with. */
  credential: SignedRequestSource;
  /** Defaults to {@link fetchTransport}. */
  transport?: Transport;
}

/**
 * The platform's vault-name rule: lower-case, keep only a-z and 0-9, and fall back to "user" when
 * nothing is left. Same as GilbPlatform `normalizeName` in `src/auth/reserved-names.ts`.
 * `johndeveloper-sailboats` becomes `johndevelopersailboats`.
 *
 * @param raw the name as typed
 * @returns the name the platform will save
 */
export function normaliseVaultName(raw: string): string {
  const slug = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return slug.length > 0 ? slug : "user";
}

/** One vault from `GET /lws/vaults`, with what the session list drops. */
export interface ListedVault {
  vaultId: string;
  modes: VaultMode[];
  name?: string;
  /** The GilbVeda type IRI the vault represents, whichever wire form it came in. */
  represents?: string;
  isLandingVault: boolean;
  /** The parent vault's id, when this vault sits under one. */
  partOf?: string;
}

function join(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, "")}${path}`;
}

function iri(v: unknown): string | undefined {
  if (typeof v === "string" && v) return v;
  if (v && typeof v === "object") {
    const id = (v as { "@id"?: unknown })["@id"];
    if (typeof id === "string" && id) return id;
  }
  return undefined;
}

async function signedSend(
  method: "GET" | "POST",
  url: string,
  opts: SignedVaultOptions,
  body?: string,
): Promise<TransportResponse> {
  const proof = await opts.credential.authHeaders(method, url);
  const send = opts.transport ?? fetchTransport;
  try {
    return await send(url, {
      method,
      credentials: "omit",
      headers: {
        ...proof,
        Accept: "application/ld+json, application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body,
      timeoutMs: 15000,
    });
  } catch {
    throw new SignInUnreachableError();
  }
}

async function platformMessage(res: TransportResponse): Promise<string> {
  try {
    const b = (await res.json()) as { message?: unknown; error?: unknown } | null;
    if (typeof b?.message === "string" && b.message) return b.message;
    if (typeof b?.error === "string") return b.error;
  } catch {
    /* no readable body */
  }
  return "";
}

/**
 * Lists the vaults the signed-in person reaches, keeping name, represents, landing flag and parent.
 *
 * @param origin the vault server origin the app signed in at
 * @param opts the credential that signs the read, and an optional transport
 * @returns the vaults; an entry without a `vaultId` is dropped
 * @throws {@link VaultRequestRefusedError} on a non-2xx answer; {@link SignInUnreachableError} when unreachable
 */
export async function listVaults(origin: string, opts: SignedVaultOptions): Promise<ListedVault[]> {
  const res = await signedSend("GET", join(origin, REACHABLE_VAULTS_PATH), opts);
  if (res.status < 200 || res.status > 299) {
    throw new VaultRequestRefusedError("Listing vaults", res.status, await platformMessage(res));
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new VaultRequestRefusedError("Listing vaults", res.status, "The vault list answer could not be read.");
  }
  const raw = (body as { vaults?: unknown } | null)?.vaults;
  if (!Array.isArray(raw)) {
    throw new VaultRequestRefusedError("Listing vaults", res.status, "The vault list answer could not be read.");
  }
  const out: ListedVault[] = [];
  for (const v of raw as Array<Record<string, unknown> | null>) {
    if (!v || typeof v.vaultId !== "string" || !v.vaultId) continue;
    const item: ListedVault = {
      vaultId: v.vaultId,
      modes: narrowVaultModes(Array.isArray(v.modes) ? (v.modes as string[]) : undefined),
      isLandingVault: v.isLandingVault === true,
    };
    if (typeof v.name === "string") item.name = v.name;
    const rep = iri(v.represents);
    if (rep) item.represents = rep;
    const part = (v.partOf as { vaultId?: unknown } | null | undefined)?.vaultId;
    if (typeof part === "string" && part) item.partOf = part;
    out.push(item);
  }
  return out;
}

/** The body of `POST /base/vault/create-named`. */
export interface CreateNamedVaultBody {
  name: string;
  /** REQUIRED. A full, live GilbVeda type IRI the vault represents. */
  represents: string;
  /** Make it under this vault (its id). */
  parentVault?: string;
}

/** What the platform answers (201) when it made the vault. */
export interface CreatedNamedVault {
  vaultId: string;
  vault: string;
  /** The normalised name the platform saved. */
  name: string;
  parent?: string;
  represents: string;
}

/**
 * Makes a named vault. Posts once and never retries: the platform has no idempotency, so a retry
 * could make a second vault or fail on the first.
 *
 * @param origin the vault server origin the app signed in at
 * @param body name, `represents` (required) and optional `parentVault`
 * @param opts the credential that signs the request, and an optional transport
 * @throws Error before any network call when `represents` is empty
 * @throws {@link VaultRequestRefusedError} (status + the platform's `message ?? error`) on non-2xx
 */
export async function createNamedVault(
  origin: string,
  body: CreateNamedVaultBody,
  opts: SignedVaultOptions,
): Promise<CreatedNamedVault> {
  if (!body.represents || !body.represents.trim()) {
    throw new Error(
      "create-named needs the vault's type IRI: pass `represents`, a full GilbVeda type IRI for a type that exists (the platform refuses a vault without one).",
    );
  }
  const payload: CreateNamedVaultBody = { name: body.name, represents: body.represents };
  if (body.parentVault) payload.parentVault = body.parentVault;
  const res = await signedSend("POST", join(origin, CREATE_NAMED_VAULT_PATH), opts, JSON.stringify(payload));
  if (res.status < 200 || res.status > 299) {
    throw new VaultRequestRefusedError("Making the vault", res.status, await platformMessage(res));
  }
  let b: Record<string, unknown> = {};
  try {
    const parsed = await res.json();
    if (parsed && typeof parsed === "object") b = parsed as Record<string, unknown>;
  } catch {
    /* unreadable 2xx body: fall through to the vault-list lookup below */
  }
  if (typeof b.vaultId !== "string" || !b.vaultId) {
    // The vault was made but the answer names no id. Never re-post: find it in the list, once.
    const wanted = normaliseVaultName(body.name);
    const found = (await listVaults(origin, opts)).find((v) => v.name === wanted);
    if (!found) {
      throw new VaultRequestRefusedError(
        "Making the vault",
        res.status,
        "The vault was made, but the answer named no vaultId and it is not in your vault list yet. Sign in again, then look for it.",
      );
    }
    // The list carries no vault address; the address is the origin's vault path for that id.
    return { vaultId: found.vaultId, vault: join(origin, `/lws/vaults/${found.vaultId}`), name: wanted, represents: body.represents };
  }
  const out: CreatedNamedVault = {
    vaultId: b.vaultId,
    vault: String(b.vault ?? ""),
    name: String(b.name ?? ""),
    represents: iri(b.represents) ?? body.represents,
  };
  const parent = iri(b.parent);
  if (parent) out.parent = parent;
  return out;
}
