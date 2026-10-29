// Reads the vaults the signed-in person can reach, with their names, parents and landing flag (`GET /lws/vaults`), and decorates the
// session's vault set with them. The session's set is the membership; this answer only decorates it (names, parent, landing flag, type,
// short name), so a failed or slow decoration leaves lean rows and never fewer vaults.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { NotSignedInError, bearerHeaderFor, dpopReadAuth, invalidateDpop } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { serverErrorText } from "@kaigilb/gilbplatformcode-lws-records";
import { narrowVaultModes, type VaultMode } from "@kaigilb/gilbplatformcode-vault-modes";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";

/**
 * The reachable-vault enumeration surface: one GET returns every vault the authenticated principal can reach, derived from the grant plane
 * at request time, each with its vault-id namespace, name, `partOf` parent, mode set and the `isLandingVault` flag. The route takes no
 * principal parameter, so no principal can enumerate another's reach. GilbApp: `LWS_VAULTS_URL`, `lib/base/config.ts:430`, a constant
 * built from the base origin when the module loaded. Here it is built from the base-origin setting at each call.
 */
export function lwsVaultsUrl(): string {
  return `${baseOrigin()}/lws/vaults`;
}

// ── the credential and the error mapper (private to GilbApp's vaultSets.ts; the same two as `lws-vault-sets` holds privately) ──

// /lws/* is the Bearer conformance floor (lwsPrincipal). DPoP is an optional upgrade.
// Apex multi-vault (example.test → Worker → kaizen Host) often 401s DPoP on long encoded
// `/lws/vault/<url-encoded-namespace>/…` paths when htu percent-encoding disagrees.
// Prefer Bearer first (same as reverse-lookup / entity hydrate); fall back to DPoP.

async function lwsReadAuth(method: string, url: string): Promise<Record<string, string>> {
  try {
    const bearer = await bearerHeaderFor(url, method);
    // 🔴 A CREDENTIAL WE CANNOT FORM IS NOT A CREDENTIAL, SO TAKE THE FALLBACK.
    //
    // Measured: a bridge answering 2xx WITHOUT `access_token` made `getToken()` RESOLVE
    // `undefined`. Because nothing threw, this function composed the literal header
    // `Authorization: Bearer undefined`, the `catch` below never ran, and the documented
    // DPoP fallback sitting right there was never taken. Every vault read then 401'd, and
    // `throwForStatus` mapped that to `NotSignedInError` and invalidated the DPoP token —
    // which was never the credential at fault. The person got a "not signed in" dead end
    // and a re-sign-in that changed nothing, while a working DPoP path was available the
    // whole time. Falling back on a falsy token is what makes the documented fallback real.
    // The header is formed by `bearer.ts` `bearerHeaderFor`, the one credential seam. It answers
    // `{}` for a credential we cannot form (the case above) AND for a host outside this build's platform
    // family; the DPoP seam answers `{}` for the second too, so the fallback is correct for both.
    if (!bearer.authorization) return dpopReadAuth(method, url);
    return bearer;
  } catch {
    return dpopReadAuth(method, url);
  }
}

/** Maps a non-ok vault-set response to a typed error. A 401 drops the DPoP token so the next
 * call re-mints off the live Base cookie (a broken proof also surfaces here as a 401). */
async function throwForStatus(res: Response): Promise<never> {
  if (res.status === 401) {
    invalidateDpop();
    throw new NotSignedInError();
  }
  const detail = await res.text().catch(() => "");
  throw new Error(serverErrorText(res.status, detail, "Vault listing failed"));
}

/** The reachable-vault query key. Scoped to the PRINCIPAL, so a different sign-in can never
 * be served the previous principal's reach out of cache. */
export function vaultsKey(principal: string | undefined) {
  return ["base", "vaults", principal ?? "anonymous"] as const;
}

// ── the reachable vault set ────────────────────────────────────────────────────────────

/** The `GET /lws/vaults` wire node. Mirrors Base's `ReachableVaultNode` EXACTLY — the four
 * corrected keys (`@id`, `podId`, `partOf`, `isLandingVault`) are adjudicated, so this reader must not
 * rename or re-shape them on the way in beyond the documented app-side mapping. */
interface ReachableVaultWire {
  /** ABSENT (not null) for a bare granted namespace with no vault entity. */
  "@id"?: string;
  vaultId?: string;
  name?: string | null;
  partOf?: { "@id"?: string; vaultId?: string } | null;
  parentAmbiguous?: boolean;
  modes?: string[];
  /** `a:podRepresents`, the vault's TYPE. Base has emitted this key all along
   * (`src/lws/vaults.ts` `ReachableVaultNode.represents`); this reader was the only step in the
   * chain that dropped it, which is why a vault typed as a banana displayed no type. */
  represents?: string | null;
  isLandingVault?: boolean;
  /**
   * Registered short name. Wire key `podName` (GilbPlatform `VAULT_NAME_QUERY_KEY`). ⛔ Not `name`. Read only together with `podNameKnown`.
   * (Salvaged from GilbApp PR #367, with credit.)
   */
  podName?: string | null;
  /** TRUE when this node read the name register. FALSE, or a missing key, means the short name is not known (`podNameKnown`). */
  podNameKnown?: boolean;
}

/** Short name off one vault node. Missing flag = not known. Known + null = none registered. */
function readVaultShortName(node: ReachableVaultWire): { shortName: string | null; shortNameKnown: boolean } {
  if (node.podNameKnown !== true) return { shortName: null, shortNameKnown: false };
  if (typeof node.podName === "string") {
    const name = node.podName.trim();
    if (name !== "") return { shortName: name, shortNameKnown: true };
  }
  return { shortName: null, shortNameKnown: true };
}

interface ReachableVaultsWire {
  total?: number;
  vaults?: ReachableVaultWire[];
}

/**
 * The DECORATION source behind the multi-vault nav — asked of Base, never of the browser.
 *
 * DERIVED-NOT-CONFIGURED: the principal's real reach, computed server-side from the grant plane
 * at request time. The app ships no vault roster and caches none.
 *
 * ⚠ This is the nav's DECORATION source, NOT its membership source: the
 * reachable SET is `session.vaults` (the VDS-3 session mint), and this `GET /lws/vaults` answer —
 * the SAME derivation, with names + hierarchy — only supplies name/parent/isLandingVault for a
 * vaultId already in that set (useVaults merges by vaultId). Modes are narrowed with the shared
 * `narrowVaultModes` (single-source with the session reader), so an unknown mode is dropped.
 */
export async function listReachableVaults(): Promise<ReachableVault[]> {
  const res = await fetch(lwsVaultsUrl(), {
    method: "GET",
    headers: { ...(await lwsReadAuth("GET", lwsVaultsUrl())), accept: "application/ld+json, application/json" },
  });
  if (!res.ok) await throwForStatus(res);
  const body = (await res.json()) as ReachableVaultsWire;
  const vaults: ReachableVault[] = [];
  for (const node of body.vaults ?? []) {
    // A node with no `podId` cannot be named, selected or targeted, so it is not a vault this
    // surface can honestly offer. Dropped rather than rendered as a nameless row.
    if (!node.vaultId) continue;
    const parent =
      node.partOf && node.partOf["@id"] && node.partOf.vaultId
        ? { entity: node.partOf["@id"], vaultId: node.partOf.vaultId }
        : null;
    vaults.push({
      vaultId: node.vaultId,
      entity: node["@id"] ?? null,
      name: node.name ?? null,
      parent,
      parentAmbiguous: node.parentAmbiguous === true,
      modes: narrowVaultModes(node.modes),
      // Read, never composed: a missing/blank key stays null rather than becoming a guessed type.
      represents: typeof node.represents === "string" && node.represents.trim() !== ""
        ? node.represents.trim()
        : null,
      isLandingVault: node.isLandingVault === true,
      ...readVaultShortName(node),
    });
  }
  return vaults;
}

// ── the merge: the session's set decorated by the answer ──

/** One vault of the session's set: its id and the modes it holds (the lean row the session mint returns). */
export interface SessionVaultRow {
  vaultId: string;
  modes: VaultMode[];
}

/**
 * The session's vault set, each row decorated by the `GET /lws/vaults` answer when it has the vault, else lean. The session set is the
 * membership: the answer can never add or remove a member and never redefines the modes. The one exception is an empty session set
 * with a non-empty answer that did not fail: then the answer's set is used (the recovery of GilbApp's `useVaults`).
 *
 * GilbApp: the body of the `useMemo` in `useVaults`, `lib/base/hooks.ts:98-131`, taken out as a function. `set` is `session?.vaults ?? []`,
 * `richList` is `enrich.data ?? []` and `enrichFailed` is `enrich.isError`.
 *
 * @param set the session's lean rows
 * @param richList the rows `listReachableVaults` answered (empty while loading or after a failure)
 * @param enrichFailed whether the decoration read failed
 */
export function decorateSessionVaults(
  set: readonly SessionVaultRow[],
  richList: ReachableVault[],
  enrichFailed: boolean,
): ReachableVault[] {
  const richByVaultId = new Map(richList.map((p) => [p.vaultId, p]));
  // Recovery: if the session mint returned an empty `vaults` array (stale bridge,
  // mid-flight session-token change, owner-bridge edge) but GET /lws/vaults answered with a
  // non-empty set, use that set rather than painting an honest-but-wrong "no vaults" shell.
  // Session remains preferred when non-empty (VDS-4 membership source).
  if (set.length === 0 && richList.length > 0 && !enrichFailed) {
    return richList;
  }
  // Render exactly the session set (source of truth), each row decorated by its /lws/vaults
  // match when available, else lean (its own id-label + modes).
  return set.map((sp) => {
    const rich = richByVaultId.get(sp.vaultId);
    return {
      vaultId: sp.vaultId,
      // The SESSION set's modes are authoritative — /lws/vaults (same derivation) decorates,
      // it never redefines what the principal may do.
      modes: sp.modes,
      entity: rich?.entity ?? null,
      name: rich?.name ?? null,
      parent: rich?.parent ?? null,
      parentAmbiguous: rich?.parentAmbiguous ?? false,
      // the vault's type (`a:podRepresents`) is DECORATION, exactly like
      // `name`: the session set is the membership source and carries none, so an undecorated
      // row reports null rather than a guess.
      represents: rich?.represents ?? null,
      isLandingVault: rich?.isLandingVault ?? false,
      // The short name is decoration from GET /lws/vaults, like `name`. An undecorated row has not read the register: not known,
      // never a guess from the host. (Salvaged from GilbApp PR #367, with credit.)
      shortName: rich?.shortName ?? null,
      shortNameKnown: rich?.shortNameKnown === true,
    };
  });
}

/** What `useVaults` hands the shell: the reachable set plus its own honest load state, so a
 * still-loading list is never rendered as "you can reach no vaults". */
export interface ReachableVaultsView {
  vaults: ReachableVault[];
  isPending: boolean;
  error: Error | null;
  refetch: () => void;
}

/** What `useVaults` reads of the session: the principal and its lean vault rows (the sign-in unit's `GilbSession` has both). */
export interface ReachableVaultsSession {
  principal?: string;
  vaults?: readonly SessionVaultRow[];
}

/**
 * The vaults the signed-in principal can REACH — SOURCED FROM THE SESSION SET,
 * decorated by `GET /lws/vaults`.
 *
 * ── The source of truth is the session, not the /lws/vaults call ─────────
 * The session mint now returns the principal's FULL reachable set (`session.vaults` — lean
 * `{vaultId, modes}`, derived from the grant plane at mint time). THAT is the authoritative list
 * of which vaults this nav shows and what the principal may do in each. `GET /lws/vaults` — the
 * SAME derivation, but with names/hierarchy — is asked ONLY to DECORATE those entries; it can
 * never add or remove a member, and if it is pending or fails the nav degrades to the lean set
 * rather than showing fewer vaults (or none). Before VDS-4 the app made `/lws/vaults` the SET
 * source; making the session the source is what "one sign-in yields all your vaults" means here.
 *
 * ⚠ THIS LIST IS NOT THE CONTENT SCOPE. It says which vaults are reachable; the shell still
 * derives the CONTENT vault (which vault a read names) from the selection / landing vault, never
 * from `vaults[0]`.
 */
export function useVaults(session: ReachableVaultsSession | undefined): ReachableVaultsView {
  // DECORATION ONLY — never the membership source. Enabled once there IS a principal; its
  // answer supplies name/parent/isLandingVault for a vaultId already in `session.vaults`.
  const enrich = useQuery<ReachableVault[], Error>({
    queryKey: vaultsKey(session?.principal),
    queryFn: listReachableVaults,
    enabled: !!session?.principal,
    staleTime: 60_000,
    retry: (failureCount, error) => !(error instanceof NotSignedInError) && failureCount < 2,
  });

  const vaults = useMemo<ReachableVault[]>(
    () => decorateSessionVaults(session?.vaults ?? [], enrich.data ?? [], enrich.isError),
    [session?.vaults, enrich.data],
  );

  return {
    vaults,
    // Pending only while signed-in AND we still have no vault set to paint:
    //   • session.vaults non-empty → paint immediately (lean ok; names fill in from enrich)
    //   • session.vaults empty → wait for /lws/vaults recovery path (or its failure) so we do not
    //     flash a false "no vaults" before the decoration answer lands
    // Never gate a non-empty session set on enrich.isLoading forever (DPoP/host glitches used
    // to leave the shell on a permanent loading state).
    isPending:
      !!session?.principal &&
      (session.vaults?.length ?? 0) === 0 &&
      enrich.isLoading &&
      !enrich.isFetched,
    // A failed DECORATION is not a failed enumeration — the set came from the session, so it
    // still renders (lean). No error is surfaced; the nav degrades rather than blanks.
    error: enrich.isError && (session?.vaults?.length ?? 0) === 0 ? enrich.error : null,
    refetch: () => void enrich.refetch(),
  };
}
