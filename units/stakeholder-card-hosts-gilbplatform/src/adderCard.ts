// "The adder's card", the find half only. GilbApp's `adderCardOf` (lib/base/adderCard.ts:98) finds the signed-in person's own card in their
// landing vault and, when they have none, MAKES a basic one (`ensureVaultSelfCard`, then `ensureSelfCardRecord`: `POST …/selfcard`). The make
// half is in no unit, so this version does not make a card: when the person has none it rejects with {@link NO_OWN_CARD_SAYS}, before any
// write. Each line below is copied from that file and cited.

import type { QueryClient } from "@tanstack/react-query";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { ownCardFindingKey, ownCardFindingQuery } from "@kaigilb/gilbplatformcode-plan-self-source";

/** Said where a person adds something and has no landing vault in the list. GilbApp: `NO_OWN_VAULT_SAYS`, adderCard.ts:29. */
export const NO_OWN_VAULT_SAYS = "Your own vault could not be found, so what you add would have no source. Nothing was saved.";

/** Said where a person adds something and has no card of their own in their vault yet (this unit does not make one). New in this unit; the GilbApp made the card. */
export const NO_OWN_CARD_SAYS = "You have no card of your own in your vault yet, so make your own card there first, then add this person.";

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

/** The cards being found: one finding per (query client, landing vault), so three adds at once read the finding once. GilbApp: adderCard.ts:57-58 (`making`). */
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
 * The find half of GilbApp's `findOrMake` (adderCard.ts:68-88): the card when there is one. Where GilbApp made a basic card, this refuses with
 * {@link NO_OWN_CARD_SAYS}, and forgets the finding as GilbApp did after it made one (adderCard.ts:86), so that the person who then makes their card
 * is not told again that they have none: the finding is otherwise kept for the session.
 */
async function findOwnCard(landing: ReachableVault, qc: QueryClient): Promise<string> {
  const finding = await readFinding(landing, qc);
  if (finding.cardUri) return finding.cardAtId || finding.cardUri;
  void qc.invalidateQueries({ queryKey: ownCardFindingKey(landing.vaultId) });
  throw new Error(NO_OWN_CARD_SAYS);
}

/**
 * The signed-in person's own card IRI: the `a:statedBy` of whatever they add. Refuses with {@link NoOwnVaultError} when the list holds no
 * landing vault, and with {@link NO_OWN_CARD_SAYS} when the landing vault holds no card of theirs, in both cases before anything is written.
 * GilbApp: `adderCardOf`, adderCard.ts:98-110. The `email` option only names a basic card, which this version never makes, so it is not read.
 */
export function adderCardOf(vaults: readonly ReachableVault[] | null | undefined, qc: QueryClient, _opts: { email?: string | null } = {}): Promise<string> {
  const landing = landingVaultOf(vaults);
  if (!landing) return Promise.reject(new NoOwnVaultError());
  let byVault = making.get(qc);
  if (!byVault) making.set(qc, (byVault = new Map()));
  const running = byVault.get(landing.vaultId);
  if (running) return running;
  const p = findOwnCard(landing, qc).finally(() => {
    if (byVault!.get(landing.vaultId) === p) byVault!.delete(landing.vaultId);
  });
  byVault.set(landing.vaultId, p);
  return p;
}
