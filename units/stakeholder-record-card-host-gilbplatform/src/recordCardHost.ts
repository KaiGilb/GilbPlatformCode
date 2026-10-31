import { createElement, Fragment } from "react";
import { EmploymentRows } from "@kaigilb/gilbplatformcode-employment-rows";
import { InterestRows } from "@kaigilb/gilbplatformcode-interest-rows";
import { LanguageSection } from "@kaigilb/gilbplatformcode-language-section";
import { findOrganizationRecords } from "@kaigilb/gilbplatformcode-org-hierarchy";
import { SkillRows } from "@kaigilb/gilbplatformcode-skill-rows";
import type { EmploymentSlotProps, StakeholderRecordCardHost } from "@kaigilb/gilbplatformcode-stakeholder-record-card";
import { createCardVocabularyHost, type StakeholderCardPlatform } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";

/**
 * The host of `stakeholder-record-card`, built from what the provider holds (`useStakeholderCardPlatform()`): the shell, the photo term's keys (async and
 * sync), the vocabulary host (the same factory as the online card's, with the provider's `persistVocabulary`), the label hook, the Languages section
 * (`renderLanguages`: `LanguageSection` of `language-section`, given the slot's props as they are and no country search), the Skills and Interests
 * (`renderSkillsAndInterests`: `SkillRows` and `InterestRows`, one after the other, each given its half of the slot's props as they are) and the Employment
 * section (`renderEmployment`: `EmploymentRows` of `employment-rows`, given the slot's props as they are, the finder of organization records of `org-hierarchy`
 * and the name of the holding vault when the shell knows it; the work-place slots are NOT given, so no place is drawn and a stored place is carried). The other
 * optional pieces of the card (`holdingVaultOf`, the picture editor, the band icon, the type description, attachments and address) are left absent: the card's
 * defaults stand. Like the Languages, the Skills and Interests are drawn only on a record whose field set has a Skill field (the card's own gate); the
 * Employment section has a gate of its own: the record's field set holds the `employment` term (the card's own gate, as in GilbApp), whatever it holds of skills.
 */
export function createStakeholderRecordCardHost(platform: StakeholderCardPlatform): StakeholderRecordCardHost {
  /** The Employment section, with the name of the vault that holds the record when the shell lists it (else the section says "this vault"). */
  function EmploymentSection(p: EmploymentSlotProps) {
    const { vaults } = platform.useShell();
    const name = vaults.find((v) => v.vaultId === p.vaultId)?.name?.trim();
    return createElement(EmploymentRows, { ...p, find: findOrganizationRecords, ...(name ? { vaultName: name } : {}) });
  }
  return {
    useShell: platform.useShell,
    photoReadKeys: platform.photoReadKeys,
    photoReadKeysSync: platform.photoReadKeysSync,
    vocabulary: createCardVocabularyHost(platform.persistVocabulary ? { persistVocabulary: platform.persistVocabulary } : {}),
    useRefLabel: platform.useRefLabel,
    renderEmployment: (p) => createElement(EmploymentSection, p),
    renderLanguages: (p) => createElement(LanguageSection, p),
    renderSkillsAndInterests: (p) => createElement(Fragment, null, createElement(SkillRows, p.skills), createElement(InterestRows, p.interests)),
  };
}
