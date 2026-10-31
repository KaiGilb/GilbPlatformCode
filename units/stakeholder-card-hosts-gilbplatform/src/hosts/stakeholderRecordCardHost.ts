import type { StakeholderRecordCardHost, StakeholderRecordCardShell } from "@kaigilb/gilbplatformcode-stakeholder-record-card";
import { createCardVocabularyHost, type CardVocabularyHostOptions } from "./cardVocabularyHost";
import { useRefLabel } from "../refLabel";

export interface StakeholderRecordCardHostOptions extends CardVocabularyHostOptions {
  /** A HOOK: the shell (session, vaults, content scope, write guard, the way to open a record). Called first in the card, on every render. */
  useShell(): StakeholderRecordCardShell;
  /** The photo term's read keys, each with its `a:` prefix; resolves when the term is known. */
  photoReadKeys(): Promise<readonly string[]>;
  /** The same, known now; empty while not known. */
  photoReadKeysSync(): readonly string[];
}

/**
 * The host of `stakeholder-record-card`: the shell and the photo term's keys are the provider's, the vocabulary host is the same factory as the online
 * card's, and `useRefLabel` is the `entity-ref-value` example hook (`../refLabel`). The optional pieces (`holdingVaultOf`, the picture editor, the band icon,
 * the type description, attachments, address, employment, languages, skills and interests) are left absent: their defaults stand.
 */
export function createStakeholderRecordCardHost(options: StakeholderRecordCardHostOptions): StakeholderRecordCardHost {
  return {
    useShell: options.useShell,
    photoReadKeys: options.photoReadKeys,
    photoReadKeysSync: options.photoReadKeysSync,
    vocabulary: createCardVocabularyHost(options.persistVocabulary ? { persistVocabulary: options.persistVocabulary } : {}),
    useRefLabel,
  };
}
