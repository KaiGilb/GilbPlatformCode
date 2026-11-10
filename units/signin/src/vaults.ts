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
  /**
   * The vault's namespace id, exactly as `GET /lws/vaults` sends it (`https://<slug>.<domain>/vault`
   * on production). Do not assume `/base` or `/vault`.
   */
  vaultId: string;
  modes: VaultMode[];
  name?: string;
  /** The GilbVeda type IRI the vault represents, whichever wire form it came in. */
  represents?: string;
  isLandingVault: boolean;
  /** The parent vault's id, when this vault sits under one. */
  partOf?: string;
  /**
   * The parent vault's entity URI (`partOf["@id"]` on the node, GilbPlatform `ReachableVaultNode.partOf`,
   * src/lws/vaults.ts:143). Absent when the platform sent none. Usable as `createNamedVault`'s `parentVault`.
   */
  partOfEntity?: string;
  /**
   * The vault's entity URI: the `@id` of its node in `GET /lws/vaults` (GilbPlatform
   * `ReachableVaultNode["@id"]`, src/lws/vaults.ts). Pass this as `createNamedVault`'s `parentVault`.
   * Absent when the platform sent no `@id` (a bare namespace with no vault entity); such a vault
   * cannot be a parent.
   */
  entity?: string;
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
    if (typeof v["@id"] === "string" && v["@id"]) item.entity = v["@id"];
    const partNode = v.partOf as { vaultId?: unknown; "@id"?: unknown } | null | undefined;
    const part = partNode?.vaultId;
    if (typeof part === "string" && part) item.partOf = part;
    const partEnt = partNode?.["@id"];
    if (typeof partEnt === "string" && partEnt) item.partOfEntity = partEnt;
    out.push(item);
  }
  return out;
}

/** The body of `POST /base/vault/create-named`. */
export interface CreateNamedVaultBody {
  name: string;
  /** REQUIRED. A full, live GilbVeda type IRI the vault represents. */
  represents: string;
  /**
   * Make it under this vault: the `entity` of a vault from {@link listVaults} (its `@id`), exact.
   * Not its `vaultId`: the platform refuses that ("parentVault is not a known vault entity").
   */
  parentVault?: string;
}

/** What the platform answers (201, or 202 when partial) when it made the vault. */
export interface CreatedNamedVault {
  /**
   * The vault's id as create-named answers it: `https://<slug>.<domain>` plus a segment the platform
   * chooses (`/vault` on production, `/base` on a single-store setup; GilbPlatform
   * `newUserVaultSegmentPath`). This code assumes neither. To find the made vault in
   * {@link listVaults}, match its normalised name or use {@link sameVaultHost}, not the full string.
   */
  vaultId: string;
  /** The new vault's entity URI. Absent when the answer did not carry it. */
  vault?: string;
  /**
   * true on 201. false on 202: the mint was partial (the vault's facts are committed, the register
   * commit did not happen). Send the same request again to finish it; this kit never retries.
   */
  complete: boolean;
  /** The normalised name the platform saved. */
  name: string;
  parent?: string;
  represents: string;
}

/**
 * True when both parse as URLs with the same host. False on unparsable input.
 * Use it to match a vault id from create-named with the list's whatever segment (`/base` or `/vault`) each carries.
 */
export function sameVaultHost(a: string, b: string): boolean {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return false;
  }
}

/**
 * Makes a named vault. Posts once and never retries: the platform has no idempotency, so a retry
 * could make a second vault or fail on the first.
 *
 * @param origin the vault server origin the app signed in at
 * @param body name, `represents` (required) and optional `parentVault`
 * @param opts the credential that signs the request, and an optional transport
 * @throws Error before any network call when `represents` is empty
 * @returns `complete: false` on 202 (partial mint): send the same request again to finish it
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
    const entity = typeof b.vault === "string" ? b.vault : "";
    const found = (await listVaults(origin, opts)).find(
      (v) => v.name === wanted || (entity !== "" && sameVaultHost(v.vaultId, entity)),
    );
    if (!found) {
      throw new VaultRequestRefusedError(
        "Making the vault",
        res.status,
        "The vault was made, but the answer named no vaultId and it is not in your vault list yet. Sign in again, then look for it.",
      );
    }
    // The entity URI is unknown on this path: leave `vault` out, never invent one.
    return { vaultId: found.vaultId, name: wanted, represents: body.represents, complete: res.status === 201 };
  }
  const out: CreatedNamedVault = {
    vaultId: b.vaultId,
    name: String(b.name ?? ""),
    represents: iri(b.represents) ?? body.represents,
    complete: res.status === 201,
  };
  if (typeof b.vault === "string" && b.vault) out.vault = b.vault;
  const parent = iri(b.parent);
  if (parent) out.parent = parent;
  return out;
}
