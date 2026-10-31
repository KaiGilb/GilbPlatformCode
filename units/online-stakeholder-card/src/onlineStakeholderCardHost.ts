// What the online stakeholder card needs from the app that is in no unit: the app shell, the list refresh and the photo term's read keys,
// plus the three hosts that peers take as an argument. Each member is the call the source made, with the same arguments, at the same place.

import { createContext, useContext } from "react";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import type { StakeholderListDoorsHost } from "@kaigilb/gilbplatformcode-stakeholder-list-doors";
import type { PersonCreateHost } from "@kaigilb/gilbplatformcode-person-create";
import type { CardVocabularyHost } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";

/** What the card reads of the app's shell: the signed-in session, the reachable vaults, the content scope's own row and the way to open a record. */
export interface OnlineStakeholderCardShell {
  /** The signed-in session; the card reads `principal` (the holder) and `vault.entity` (the session vault's entity). Undefined: not signed in. */
  session: { principal: string; vault?: { entity?: string | null } | null } | null | undefined;
  /** Every vault the holder can reach, own vault included. */
  vaults: readonly ReachableVault[];
  /** The content scope; the card reads `reach`, the session vault's row in the reachable set. */
  contentScope: { reach?: { vaultId: string } | null };
  /** Opens a record of the holder's by its id, in the same pane. */
  openRecordFromList(id: string): void;
}

export interface OnlineStakeholderCardHost {
  /**
   * A HOOK: the app shell. Called first in the card's body, on every render, never conditionally; the card calls no other hook before it
   * except the read of this host's context.
   * GilbApp: useShell(), components/ShellContext.ts:412 (called at OnlineStakeholderCard.tsx:86; `session`, `vaults`, `contentScope`,
   * `openRecordFromList`).
   */
  useShell(): OnlineStakeholderCardShell;
  /**
   * Asks every mounted online list to draw again. Sync, no arguments. Called once when an existing card of the person is opened, once after
   * a failed link was cleaned up, and once after a card was made and linked, always before the record is opened.
   * GilbApp: refreshOnlineStakeholders(), components/records/onlineStakeholders.ts:302 (called at OnlineStakeholderCard.tsx:189, :244, :249).
   */
  refreshOnlineStakeholders(): void;
  /**
   * The photo term's read keys as the app has them now ("not known yet" is an empty array, never "no photo"), each one with its `a:` prefix.
   * Sync. Called on every render; the card drops the prefix and does not draw the groups of those keys (the header draws the picture).
   * GilbApp: photoReadKeysSync(), lib/base/photoTerm.ts:74 (called at OnlineStakeholderCard.tsx:136). It reads the app's module memo of the
   * photo term.
   */
  photoReadKeysSync(): readonly string[];
  /**
   * The host of `stakeholder-list-doors`, passed as the first argument of `linkedRecordsOf`, which reads only `heldRecordFreshMs`. The
   * app's `linkedRecordsOf` took none.
   * GilbApp: linkedRecordsOf(holder, vaults, members), lib/base/stakeholderList/listDoors.ts (called at OnlineStakeholderCard.tsx:180).
   */
  doors: StakeholderListDoorsHost;
  /**
   * The host of `person-create`, passed as the first argument of `recordPerson` and `afterRecordPerson`. The app's functions took none.
   * GilbApp: recordPerson(deps, input) and afterRecordPerson(qc, made), lib/base/recordPerson.ts (called at OnlineStakeholderCard.tsx:203, :243
   * and :248).
   */
  person: PersonCreateHost;
  /**
   * The host of `stakeholder-card-vocabulary`, passed as the first argument of `stakeholderCardVocabularyQuery`. The app's function took none.
   * GilbApp: stakeholderCardVocabularyQuery(), lib/base/stakeholderCard.ts (called at OnlineStakeholderCard.tsx:131).
   */
  vocabulary: CardVocabularyHost;
  /**
   * OPTIONAL (since 0.1.5). Remembers the vault that holds an existing record of the holder's, for the session, so that the shell's
   * `openRecordFromList(id)` that follows can hand the vault to the page as the record's door. Called just before `openRecordFromList` when
   * "+ Add your own" finds a record the holder already holds and the vault is known (the store's find names it, or the screen's row does).
   * A host without it opens the id alone, and the held card then refuses to read ("which vault holds this card is not known").
   * GilbApp: none needed; its list caches attribute the record to its vault (`holdingVaultOf`).
   */
  rememberVaultOf?(recordId: string, vaultId: string): void;
}

/** The provider the card reads. With none, the card throws an error that names it. */
export const OnlineStakeholderCardHostContext = createContext<OnlineStakeholderCardHost | null>(null);

export function useOnlineStakeholderCardHost(): OnlineStakeholderCardHost {
  const host = useContext(OnlineStakeholderCardHostContext);
  if (!host) throw new Error("The online stakeholder card needs a OnlineStakeholderCardHostContext.Provider above it.");
  return host;
}
