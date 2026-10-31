import { createElement, Fragment } from "react";
import { InterestRows } from "@kaigilb/gilbplatformcode-interest-rows";
import { LanguageSection } from "@kaigilb/gilbplatformcode-language-section";
import { SkillRows } from "@kaigilb/gilbplatformcode-skill-rows";
import type { StakeholderRecordCardHost } from "@kaigilb/gilbplatformcode-stakeholder-record-card";
import { createCardVocabularyHost, type StakeholderCardPlatform } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";

/**
 * The host of `stakeholder-record-card`, built from what the provider holds (`useStakeholderCardPlatform()`): the shell, the photo term's keys (async and
 * sync), the vocabulary host (the same factory as the online card's, with the provider's `persistVocabulary`), the label hook, the Languages section
 * (`renderLanguages`: `LanguageSection` of `language-section`, given the slot's props as they are and no country search) and the Skills and Interests
 * (`renderSkillsAndInterests`: `SkillRows` and `InterestRows`, one after the other, each given its half of the slot's props as they are). The other optional
 * pieces of the card (`holdingVaultOf`, the picture editor, the band icon, the type description, attachments, address and employment) are left absent: the
 * card's defaults stand. Like the Languages, the Skills and Interests are drawn only on a record whose field set has a Skill field (the card's own gate).
 */
export function createStakeholderRecordCardHost(platform: StakeholderCardPlatform): StakeholderRecordCardHost {
  return {
    useShell: platform.useShell,
    photoReadKeys: platform.photoReadKeys,
    photoReadKeysSync: platform.photoReadKeysSync,
    vocabulary: createCardVocabularyHost(platform.persistVocabulary ? { persistVocabulary: platform.persistVocabulary } : {}),
    useRefLabel: platform.useRefLabel,
    renderLanguages: (p) => createElement(LanguageSection, p),
    renderSkillsAndInterests: (p) => createElement(Fragment, null, createElement(SkillRows, p.skills), createElement(InterestRows, p.interests)),
  };
}
