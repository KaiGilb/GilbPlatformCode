// Test-only: the host of the unit, as a recording fake. `adderCardOf` answers the card it was made with when the list holds a landing vault, and refuses
// as the app's does when it holds none; `rememberCreatedIn` keeps the calls.
import type { QueryClient } from "@tanstack/react-query";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import type { PersonCreateHost } from "../src/recordPerson";

/** Said where a person adds something and has no landing vault in the list. */
export const NO_OWN_VAULT_SAYS = "Your own vault could not be found, so what you add would have no source. Nothing was saved.";

export interface HostLog {
  adder: { vaults: readonly ReachableVault[] | null | undefined; qc: QueryClient; opts: { email?: string | null } }[];
  remembered: { qc: QueryClient; recordId: string; vaultId: string }[];
  /** Every host call, in order. */
  order: string[];
}

export function fakeHost(adderCard: string): PersonCreateHost & { log: HostLog } {
  const log: HostLog = { adder: [], remembered: [], order: [] };
  return {
    log,
    adderCardOf: async (vaults, qc, opts) => {
      log.adder.push({ vaults, qc, opts });
      log.order.push("adderCardOf");
      if (!(vaults ?? []).some((v) => v.isLandingVault)) throw new Error(NO_OWN_VAULT_SAYS);
      return adderCard;
    },
    rememberCreatedIn: (qc, recordId, vaultId) => {
      log.remembered.push({ qc, recordId, vaultId });
      log.order.push("rememberCreatedIn");
    },
  };
}
