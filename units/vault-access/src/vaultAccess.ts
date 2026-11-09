// Whole-vault access: read who holds what on a vault, and grant or revoke one mode.
//
// Every call is signed with the sender-constrained credential from the auth seam, and is asked of the
// vault's own host. The platform re-checks Control on every call. This module does not decide who may
// grant; it only relays the intent.
//
// GET /base/consent/vault-acl is Control-gated. A caller who does not hold Control gets 404
// (non-disclosure: no list, and no signal that the vault exists). fetchVaultAcl maps 200 to
// `{ controlled: true }` and 404 to `{ controlled: false }`. It does not infer Control from a name.

import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { dpopReadAuth, dpopWriteAuth, invalidateDpop } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { serverErrorText } from "@kaigilb/gilbplatformcode-server-error";

/** The four whole-vault access modes. `read` / `write` / `append` are data modes (append is add-only
 *  write). `control` is the authority to grant and revoke onward, and confers no data read or write. */
export type VaultGrantMode = "read" | "write" | "append" | "control";

export const VAULT_GRANT_MODES: readonly VaultGrantMode[] = ["read", "write", "append", "control"] as const;

/** Which register produced an ACL row's `label`. A label with no source is an invented one. */
export type PrincipalLabelSource =
  | "vault-name"
  | "identity-seat"
  | "account-email"
  | "account-email-superseded";

/** How an ACL row relates to the identity the viewer is signed in as. */
export type PrincipalViewerRelation = "self" | "earlier-identity-of-self";

/** One principal's directly-conferred whole-vault levels. */
export interface VaultAclEntry {
  /** The principal or group URI that holds the levels (the authorization key). */
  principal: string;
  /** The levels held — a subset of read | write | append | control. */
  levels: VaultGrantMode[];
  /** Resolved display name when the platform resolved one, else null. Never derived here from the URI. */
  label?: string | null;
  /** Short WebID when known. */
  webId?: string | null;
  /** `grant` = stored; `owner-inferred` = synthesised ownership (there is no revoke for it). */
  kind?: "grant" | "owner-inferred";
  /** Which register produced `label` — non-null exactly when `label` is non-null. */
  labelSource?: PrincipalLabelSource | null;
  /** The register holds an account for this key, even when its name is not published to this viewer. */
  registered?: boolean;
  /** Relation to the viewer's own identity, so a reader can tell their access from someone else's. */
  viewer?: PrincipalViewerRelation | null;
}

/** One vault-to-vault reach edge or public grant into the vault (a second plane; not granted here). */
export interface VaultReachAclEntry {
  sourceVault: string;
  mode: "read" | "write";
  grade: "full" | "scoped";
  kind: "vault-reach" | "public";
}

/** The vault-access read. `controlled` is the platform's Control verdict, surfaced by 200 versus 404. */
export type VaultAclResult =
  | { controlled: true; note: string; acl: VaultAclEntry[]; edges: VaultReachAclEntry[] }
  | { controlled: false };

/** A platform error carrying the HTTP status and the sentence to show. */
export class VaultAccessError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "VaultAccessError";
    this.status = status;
  }
}

/** "view" grants read. "edit" grants write, which also plants read; the read-back checks both. */
export type VaultShareLevel = "view" | "edit";

const SESSION_REAUTH = "Your session needs to re-authorize — try again.";

/** The access list is asked of the vault's own host. The `vault` query still names which vault. */
function vaultAclUrl(vaultId: string): string {
  return `${vaultOriginOf(vaultId)}/base/consent/vault-acl?vault=${encodeURIComponent(vaultId)}`;
}

/** Grant is asked of the vault's own host. The body still names which vault. */
function grantVaultUrl(vaultId: string): string {
  return `${vaultOriginOf(vaultId)}/base/authz/grant-vault`;
}

/** Revoke is asked of the vault's own host. The platform does not forward this act to another store. */
function revokeVaultUrl(vaultId: string): string {
  return `${vaultOriginOf(vaultId)}/base/authz/revoke-vault`;
}

/** Parse a JSON body defensively (platform errors are `{ error }` / `{ message }`). */
async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { message: text };
  }
}

/**
 * Reads the whole-vault access list for `vaultId` — who holds read, write, append and control.
 * A 200 means the viewer holds Control. A 404 means they do not. A 401 drops the credential so the
 * next call signs again. Any other status throws {@link VaultAccessError}.
 */
export async function fetchVaultAcl(vaultId: string): Promise<VaultAclResult> {
  const url = vaultAclUrl(vaultId);
  const res = await fetch(url, {
    method: "GET",
    headers: { ...(await dpopReadAuth("GET", url)), accept: "application/json" },
  });
  if (res.status === 200) {
    const body = await readJson(res);
    const raw = Array.isArray(body.acl) ? (body.acl as VaultAclEntry[]) : [];
    // Normalize optional display fields so a caller can rely on null rather than missing.
    const acl = raw.map((e) => ({
      principal: e.principal,
      levels: e.levels,
      label: typeof e.label === "string" ? e.label : e.label ?? null,
      webId: typeof e.webId === "string" ? e.webId : e.webId ?? null,
      kind: e.kind === "owner-inferred" ? ("owner-inferred" as const) : ("grant" as const),
    }));
    const rawEdges = Array.isArray(body.edges) ? (body.edges as VaultReachAclEntry[]) : [];
    const edges = rawEdges.map((e) => ({
      sourceVault: e.sourceVault,
      mode: e.mode,
      grade: e.grade,
      kind: e.kind === "public" ? ("public" as const) : ("vault-reach" as const),
    }));
    return {
      controlled: true,
      note: typeof body.note === "string" ? body.note : "",
      acl,
      edges,
    };
  }
  // 404 = the viewer does NOT hold Control on this vault (non-disclosure).
  if (res.status === 404) return { controlled: false };
  if (res.status === 401) {
    invalidateDpop();
    throw new VaultAccessError(401, SESSION_REAUTH);
  }
  const body = await readJson(res);
  // Pick the sentence, not the machine token (`BadRequest` lives in `error`, the reason in `message`).
  throw new VaultAccessError(res.status, serverErrorText(res.status, body, "Could not read vault access"));
}

/**
 * POST a grant or revoke. Returns the parsed body on success (the grant echoes the resolved
 * principal in `grantee`). Throws {@link VaultAccessError} when the response is not ok.
 * A 401 drops the credential. A 403 is the fixed Control sentence, not the platform's class name.
 */
async function postGrant(
  url: string,
  vault: string,
  grantee: string,
  mode: VaultGrantMode,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...(await dpopWriteAuth("POST", url)),
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ vault, grantee, mode }),
  });
  if (res.ok) return readJson(res);
  if (res.status === 401) {
    invalidateDpop();
    throw new VaultAccessError(401, SESSION_REAUTH);
  }
  const body = await readJson(res);
  const msg =
    res.status === 403
      ? "You don't hold Control on this vault, so you can't change who can access it."
      : serverErrorText(res.status, body, "Could not change vault access");
  throw new VaultAccessError(res.status, msg);
}

/** Path of a grantee URL, or the raw text when it is not a URL. */
function granteePath(grantee: string): string {
  try {
    return new URL(grantee).pathname;
  } catch {
    return grantee;
  }
}

/** `/base/p/…` and `/base/g/…` are opaque keys the platform has already resolved. */
function isOpaqueKey(grantee: string): boolean {
  const path = granteePath(grantee);
  return path.includes("/base/p/") || path.includes("/base/g/");
}

/** A vault address is the path a person signs in as: `/vault` or `/base`. */
function isVaultAddress(grantee: string): boolean {
  const path = granteePath(grantee);
  return path === "/vault" || path === "/base";
}

/**
 * An https URL with an empty path or "/" is the vault's host. Nobody signs in as that string, so a
 * grant stored under it would never reach them. Refuse before any request. Revoke does not call
 * this: an old grant stored under a host can still be removed.
 */
function refuseBareHost(grantee: string): void {
  let url: URL;
  try {
    url = new URL(grantee);
  } catch {
    return;
  }
  if (url.protocol !== "https:") return;
  if (url.pathname !== "" && url.pathname !== "/") return;
  throw new VaultAccessError(
    400,
    `"${grantee}" is a vault's host, not a person. Use their vault address, for example ${url.origin}/vault.`,
  );
}

/**
 * Grants `grantee` the whole-vault `mode` on `vaultId`. `mode` `control` delegates Control (the
 * grantee may then grant and revoke onward). A caller who does not hold Control gets 403.
 * A grantee that is only the vault's host is refused before any request.
 */
export async function grantVaultAccess(vaultId: string, grantee: string, mode: VaultGrantMode): Promise<void> {
  refuseBareHost(grantee);
  await postGrant(grantVaultUrl(vaultId), vaultId, grantee, mode);
}

/** Revokes `grantee`'s whole-vault `mode` on `vaultId`. Revoking `control` stops that holder's onward grants. */
export async function revokeVaultAccess(vaultId: string, grantee: string, mode: VaultGrantMode): Promise<void> {
  await postGrant(revokeVaultUrl(vaultId), vaultId, grantee, mode);
}

/**
 * Share the whole vault so `grantee` can open it (`view`) or add records in it (`edit`).
 * A grantee that is only the vault's host is refused before any request. `view` grants read.
 * `edit` grants write, then reads the access list back and requires the echoed principal to hold
 * both read and write. The platform resolves a short WebID to an opaque principal and echoes that
 * principal as `grantee`; the read-back matches the echo, not the text that was pasted. An echo
 * that is still an unresolved name (not an opaque key, and not a vault address) throws, because
 * that grant would reach no one.
 */
export async function shareVault(vaultId: string, grantee: string, level: VaultShareLevel): Promise<void> {
  refuseBareHost(grantee);
  if (level === "view") {
    await postGrant(grantVaultUrl(vaultId), vaultId, grantee, "read");
    return;
  }
  if (level !== "edit") {
    throw new VaultAccessError(400, "Vault share level must be view or edit.");
  }
  const body = await postGrant(grantVaultUrl(vaultId), vaultId, grantee, "write");
  const echoed = typeof body.grantee === "string" && body.grantee.trim() !== "" ? body.grantee : grantee;
  // The old read-back compared the access list with this echo. The platform stores the grantee it
  // was given and echoes that same string, so a host or other name nobody signs in as matched
  // itself and the check could not fail.
  if (echoed === grantee && !isOpaqueKey(grantee) && !isVaultAddress(grantee)) {
    throw new VaultAccessError(
      400,
      `The platform did not resolve "${grantee}" to a person, so the grant would reach no one.`,
    );
  }
  const acl = await fetchVaultAcl(vaultId);
  const levels = acl.controlled ? (acl.acl.find((e) => e.principal === echoed)?.levels ?? []) : [];
  const missing: string[] = [];
  if (!levels.includes("read")) missing.push("view (read)");
  if (!levels.includes("write")) missing.push("edit (write)");
  if (missing.length > 0) {
    throw new VaultAccessError(
      acl.controlled ? 200 : 404,
      `The vault share did not give ${missing.join(" and ")}.`,
    );
  }
}

/**
 * Take the whole-vault data grants away: write, then read, then append.
 * A 200 whose body says nothing was revoked is ignored; any other non-ok response throws, and a
 * failure on write stops the later calls.
 *
 * Revoking write leaves the read that a write grant plants beside it. Write alone does not take
 * access away. This is the only full take-away the unit offers. Control is not revoked here.
 */
export async function unshareVault(vaultId: string, grantee: string): Promise<void> {
  await revokeVaultAccess(vaultId, grantee, "write");
  await revokeVaultAccess(vaultId, grantee, "read");
  await revokeVaultAccess(vaultId, grantee, "append");
}
