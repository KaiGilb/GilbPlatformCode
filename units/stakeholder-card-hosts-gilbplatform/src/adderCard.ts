// "The adder's card": GilbApp's `adderCardOf` (lib/base/adderCard.ts:98) finds the signed-in person's own card in their landing vault and, when
// they have none, MAKES a basic one (`ensureVaultSelfCard` of `vault-profile-photo`, which posts `…/selfcard`), then reads it back. Each line
// below is copied from that file and cited; `findOrMake` is the source's with the names of the units for the functions the source imports.

import type { QueryClient } from "@tanstack/react-query";
import { readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { ownCardFindingKey, ownCardFindingQuery } from "@kaigilb/gilbplatformcode-plan-self-source";
import { vaultLabel } from "@kaigilb/gilbplatformcode-vault-list";
import { ensureVaultSelfCard, vaultRootOf } from "@kaigilb/gilbplatformcode-vault-profile-photo";

/** Said where a person adds something and has no landing vault in the list. GilbApp: `NO_OWN_VAULT_SAYS`, adderCard.ts:29. */
export const NO_OWN_VAULT_SAYS = "Your own vault could not be found, so what you add would have no source. Nothing was saved.";

/** The person has no landing vault in the list: nothing may be written, as it would have no source. GilbApp: adderCard.ts:31-37. */
export class NoOwnVaultError extends Error {
  constructor() {
    super(NO_OWN_VAULT_SAYS);
    this.name = "NoOwnVaultError";
  }
}

/** The person's own vault: the landing vault of the reachable list, or undefined. GilbApp: adderCard.ts:39-41. */
export const landingVaultOf = (vaults: readonly ReachableVault[] | null | undefined): ReachableVault | undefined =>
  (vaults ?? []).find((v) => v.isLandingVault);

/**
 * A name guessed from a sign-in email: `petter.hansen@example.test` is "Petter Hansen", `kai@example.test` is "Kai". GilbApp: `nameFromEmail`, adderCard.ts:43-55.
 */
export function nameFromEmail(email: string | null | undefined): string | null {
  const local = (email ?? "").trim().split("@")[0]?.split("+")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

/** The cards being made: one making per (query client, landing vault), so three adds at once make ONE card. GilbApp: adderCard.ts:57-58 (`making`). */
const making = new WeakMap<QueryClient, Map<string, Promise<string>>>();

/** GilbApp: `readFinding`, adderCard.ts:60-66. */
async function readFinding(landing: ReachableVault, qc: QueryClient) {
  try {
    return await qc.fetchQuery(ownCardFindingQuery(landing));
  } catch (e) {
    throw new Error(`Your own card could not be read, so what you add would have no source. Nothing was saved. (${e instanceof Error ? e.message : String(e)})`);
  }
}

/**
 * GilbApp: `findOrMake`, adderCard.ts:68-88. The card when there is one; else the basic one, made in the LANDING vault only and read back where the
 * door says it is. The sentences are the source's. The finding is dropped after a card was made (adderCard.ts:86), so the next ask finds it.
 */
async function findOrMake(landing: ReachableVault, qc: QueryClient, email: string | null | undefined): Promise<string> {
  const finding = await readFinding(landing, qc);
  if (finding.cardUri) return finding.cardAtId || finding.cardUri;
  const root = vaultRootOf(landing.vaultId);
  if (!root) throw new Error("Your own vault could not be addressed, so what you add would have no source. Nothing was saved.");
  let made: { id: string };
  try {
    made = await ensureVaultSelfCard(landing.vaultId, {}, nameFromEmail(email) ?? vaultLabel(landing));
  } catch (e) {
    throw new Error(`Your own card could not be made, so what you add would have no source. Nothing was saved. (${e instanceof Error ? e.message : String(e)})`);
  }
  const back = await readRecord(made.id, `${root.replace(/\/+$/, "")}/e/${made.id}`);
  if (!back?.entityUri) {
    throw new Error("Your own card was made but could not be read back, so what you add would have no source. Nothing was saved.");
  }
  void qc.invalidateQueries({ queryKey: ownCardFindingKey(landing.vaultId) });
  return back.entityUri;
}

/**
 * The signed-in person's own card IRI: the `a:statedBy` of whatever they add. Refuses with {@link NoOwnVaultError} when the list holds no landing
 * vault, before anything is written. A person with no card yet gets a basic one in the landing vault. GilbApp: `adderCardOf`, adderCard.ts:98-110.
 */
export function adderCardOf(vaults: readonly ReachableVault[] | null | undefined, qc: QueryClient, opts: { email?: string | null } = {}): Promise<string> {
  const landing = landingVaultOf(vaults);
  if (!landing) return Promise.reject(new NoOwnVaultError());
  let byVault = making.get(qc);
  if (!byVault) making.set(qc, (byVault = new Map()));
  const running = byVault.get(landing.vaultId);
  if (running) return running;
  const p = findOrMake(landing, qc, opts.email).finally(() => {
    if (byVault!.get(landing.vaultId) === p) byVault!.delete(landing.vaultId);
  });
  byVault.set(landing.vaultId, p);
  return p;
}
