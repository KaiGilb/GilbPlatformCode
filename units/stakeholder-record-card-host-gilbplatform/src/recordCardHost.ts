import type { StakeholderRecordCardHost } from "@kaigilb/gilbplatformcode-stakeholder-record-card";
import { createCardVocabularyHost, type StakeholderCardPlatform } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";

/**
 * The host of `stakeholder-record-card`, built from what the provider holds (`useStakeholderCardPlatform()`): the shell, the photo term's keys (async and
 * sync), the vocabulary host (the same factory as the online card's, with the provider's `persistVocabulary`) and the label hook. The optional pieces of the
 * card (`holdingVaultOf`, the picture editor, the band icon, the type description, attachments, address, employment, languages, skills and interests) are
 * left absent: the card's defaults stand.
 */
export function createStakeholderRecordCardHost(platform: StakeholderCardPlatform): StakeholderRecordCardHost {
  return {
    useShell: platform.useShell,
    photoReadKeys: platform.photoReadKeys,
    photoReadKeysSync: platform.photoReadKeysSync,
    vocabulary: createCardVocabularyHost(platform.persistVocabulary ? { persistVocabulary: platform.persistVocabulary } : {}),
    useRefLabel: platform.useRefLabel,
  };
}
