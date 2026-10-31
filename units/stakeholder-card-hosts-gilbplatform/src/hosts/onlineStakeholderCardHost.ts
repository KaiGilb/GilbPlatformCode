import type { OnlineStakeholderCardHost, OnlineStakeholderCardShell } from "@kaigilb/gilbplatformcode-online-stakeholder-card";
import { createCardVocabularyHost, type CardVocabularyHostOptions } from "./cardVocabularyHost";
import { createPersonCreateHost } from "./personCreateHost";
import { createStakeholderListDoorsHost } from "./stakeholderListDoorsHost";

export interface OnlineStakeholderCardHostOptions extends CardVocabularyHostOptions {
  /** A HOOK: the shell (session, vaults, content scope, the way to open a record). Called first in the card, on every render. */
  useShell(): OnlineStakeholderCardShell;
  /** Asks the online lists to draw again. Default (when the provider is used): nothing. */
  refreshOnlineStakeholders(): void;
  /** The photo term's read keys now, each with its `a:` prefix; empty while not known. */
  photoReadKeysSync(): readonly string[];
  /** Remembers the vault of an existing record before the card opens it (the card's optional `rememberVaultOf`). Absent: the card gets none. */
  rememberVaultOf?(recordId: string, vaultId: string): void;
}

/** The host of the online stakeholder card: the three own members from `options`, and the three pass-through hosts from their factories. */
export function createOnlineStakeholderCardHost(options: OnlineStakeholderCardHostOptions): OnlineStakeholderCardHost {
  return {
    useShell: options.useShell,
    refreshOnlineStakeholders: options.refreshOnlineStakeholders,
    photoReadKeysSync: options.photoReadKeysSync,
    ...(options.rememberVaultOf ? { rememberVaultOf: options.rememberVaultOf } : {}),
    doors: createStakeholderListDoorsHost(),
    person: createPersonCreateHost(),
    vocabulary: createCardVocabularyHost(options.persistVocabulary ? { persistVocabulary: options.persistVocabulary } : {}),
  };
}
