import type { AdderCardHost } from "@kaigilb/gilbplatformcode-adder-card";
import type { AddedByHost } from "@kaigilb/gilbplatformcode-added-by";
import type { OtherLinkedRecordsHost } from "@kaigilb/gilbplatformcode-other-linked-records";

/** The host of `adder-card`: the session the shell already holds, read passively (`useSession({ enabled: false })`). */
export function createAdderCardHost(useSession: AdderCardHost["useSession"]): AdderCardHost {
  return { useSession };
}

/** The host of `added-by`: how the "Added by" line opens the adder's card, the shell's `openRecordFromList`. */
export function createAddedByHost(useShell: AddedByHost["useShell"]): AddedByHost {
  return { useShell };
}

/** The host of `other-linked-records`: the shell's vault list, to name each linked record's vault. */
export function createOtherLinkedRecordsHost(useShell: OtherLinkedRecordsHost["useShell"]): OtherLinkedRecordsHost {
  return { useShell };
}
