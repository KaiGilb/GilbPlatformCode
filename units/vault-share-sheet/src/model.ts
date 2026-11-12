// The headless half: nothing here imports React or the dialog unit.
import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { principalRow } from "@kaigilb/gilbplatformcode-principal-row";
import {
  NO_CONTROL,
  VaultAccessError,
  fetchVaultAcl,
  shareVault,
  unshareVault,
  type VaultAclEntry,
} from "@kaigilb/gilbplatformcode-vault-access";
import { vaultAddressFromName, vaultIdProblem, vaultNameProblem } from "@kaigilb/gilbplatformcode-vault-address";

/** "edit" is a whole-vault write (which also reads); "view" is read only. */
export type ShareLevel = "edit" | "view";

export interface AccessRow {
  /** The grantee to unshare: the principal exactly as the access list gave it. */
  principal: string;
  /** Who: the platform's name for the key when it gave one, else what principal-row says the key is. Never the raw key. */
  label: string;
  /** Where that name came from (principal-row's provenance sentence), or null. */
  note: string | null;
  level: ShareLevel;
  /** Holds Control. Such a row is never offered for removal: `unshareVault` does not take Control away. */
  owner: boolean;
}

export type AccessView =
  | { controlled: false }
  | { controlled: true; owner: AccessRow | null; rows: AccessRow[] };

const SOMETHING_WRONG = "Something went wrong. Try again.";
const NOT_A_NAME = "That is not a vault name we can use.";

/**
 * What the person typed to the grantee to send, or the sentence to show. A bare name (`anna`) becomes the address
 * `vaultAddressFromName` answers under the apex (default: the host of the base origin). A full address is kept as typed.
 * An email, a bare host and anything else that is neither a name nor an address is refused with its sentence, before any request.
 * `name` is what to call them afterwards: the lower-cased name, or the address's first host label.
 */
export function granteeFromInput(text: string, o: { apex?: string } = {}): { grantee: string; name: string } | { problem: string } {
  const t = text.trim();
  if (/^https?:\/\//i.test(t) && !t.includes("@")) {
    const problem = vaultIdProblem(t);
    if (problem) return { problem };
    return { grantee: t, name: new URL(t).hostname.split(".")[0] ?? t };
  }
  const problem = vaultNameProblem(t);
  if (problem) return { problem };
  const grantee = vaultAddressFromName(t, o.apex ?? new URL(baseOrigin()).host);
  if (!grantee) return { problem: NOT_A_NAME };
  return { grantee, name: t.toLowerCase() };
}

const holds = (e: VaultAclEntry, mode: string): boolean => (e.levels as readonly string[]).includes(mode);

function rowOf(e: VaultAclEntry, level: ShareLevel, owner: boolean): AccessRow {
  const r = principalRow(e.principal, { label: e.label, webId: e.webId });
  return { principal: e.principal, label: r.title, note: owner ? null : r.provenance, level, owner };
}

/**
 * The access list as rows. The owner is the entry that holds `control`, whatever its `kind` (the live owner row has kind
 * `grant`, not `owner-inferred`), and is returned apart from `rows`. Anyone else who holds Control (a delegate) stays in
 * `rows` with `owner: true`, so a screen shows them and offers no Remove. Level: write is "edit", else read is "view"; an entry
 * with neither (append only) is left out. Only the person list is read: a public grant is in `edges`, never in `acl`.
 */
export function accessRows(acl: readonly VaultAclEntry[]): { owner: AccessRow | null; rows: AccessRow[] } {
  let owner: AccessRow | null = null;
  const rows: AccessRow[] = [];
  for (const e of acl) {
    if (holds(e, "control")) {
      const row = rowOf(e, "edit", true);
      if (owner === null) owner = row;
      else rows.push(row);
      continue;
    }
    const level: ShareLevel | null = holds(e, "write") ? "edit" : holds(e, "read") ? "view" : null;
    if (level) rows.push(rowOf(e, level, false));
  }
  return { owner, rows };
}

/** Read fresh each time; nothing is cached. A person without Control is `{ controlled: false }` (the platform answers 404). */
export async function loadAccessView(vaultId: string): Promise<AccessView> {
  const r = await fetchVaultAcl(vaultId);
  return r.controlled ? { controlled: true, ...accessRows(r.acl) } : { controlled: false };
}

/** The sentence for a failed read, grant or revoke. 403, and 404 (the non-disclosure answer for a person without Control), are NO_CONTROL. */
export function accessFailure(e: unknown): string {
  if (e instanceof VaultAccessError) return e.status === 403 || e.status === 404 ? NO_CONTROL : e.message;
  return e instanceof Error && e.message ? e.message : SOMETHING_WRONG;
}

/** The three calls the sheet makes. Swap any of them (a test, or an app with its own transport). */
export interface ShareApi {
  load(vaultId: string): Promise<AccessView>;
  share(vaultId: string, grantee: string, level: ShareLevel): Promise<void>;
  unshare(vaultId: string, principal: string): Promise<void>;
}

export const defaultShareApi: ShareApi = {
  load: loadAccessView,
  share: shareVault,
  unshare: unshareVault,
};
