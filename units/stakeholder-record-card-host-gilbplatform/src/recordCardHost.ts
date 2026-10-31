import { createElement, Fragment } from "react";
import { AddressRows } from "@kaigilb/gilbplatformcode-address-rows";
import { EmploymentRows } from "@kaigilb/gilbplatformcode-employment-rows";
import { InterestRows } from "@kaigilb/gilbplatformcode-interest-rows";
import { geoOrigin } from "@kaigilb/gilbplatformcode-geo-origin";
import { LanguageSection } from "@kaigilb/gilbplatformcode-language-section";
import { findOrganizationRecords } from "@kaigilb/gilbplatformcode-org-hierarchy";
import { SkillRows } from "@kaigilb/gilbplatformcode-skill-rows";
import { WorkLocationField } from "@kaigilb/gilbplatformcode-work-location-field";
import { WorkPlaceName } from "@kaigilb/gilbplatformcode-work-place-name";
import type { AddressSlotProps, EmploymentSlotProps, StakeholderRecordCardHost } from "@kaigilb/gilbplatformcode-stakeholder-record-card";
import { createCardVocabularyHost, type StakeholderCardPlatform } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";
import { employmentWritesRefused } from "./geoWriteGuard";

/**
 * The host of `stakeholder-record-card`, built from what the provider holds (`useStakeholderCardPlatform()`): the shell, the photo term's keys (async and
 * sync), the vocabulary host (the same factory as the online card's, with the provider's `persistVocabulary`), the label hook, the Languages section
 * (`renderLanguages`: `LanguageSection` of `language-section`, given the slot's props as they are and no country search), the Skills and Interests
 * (`renderSkillsAndInterests`: `SkillRows` and `InterestRows`, one after the other, each given its half of the slot's props as they are) and the Employment
 * section (`renderEmployment`: `EmploymentRows` of `employment-rows`, given the slot's props as they are, the finder of organization records of `org-hierarchy`
 * the name of the holding vault when the shell knows it, and (since 0.5.0) the work place: the Location box (`work-location-field`), the read-only place name
 * (`work-place-name`) and the catalogue's origin; a section one of whose write targets is the place catalogue is held read-only), and (since 0.6.0) the Address section (`renderAddress`: `AddressRows` of `address-rows`). The other
 * optional pieces of the card (`holdingVaultOf`, the picture editor, the band icon, the type description and attachments) are left absent: the card's
 * defaults stand. Like the Languages, the Skills and Interests are drawn only on a record whose field set has a Skill field (the card's own gate); the
 * Employment section has a gate of its own: the record's field set holds the `employment` term (the card's own gate, as in GilbApp), whatever it holds of skills.
 */
/** Drawn under an Employment section that is held read-only by the write guard. */
export const GEO_WRITE_REFUSED_SAYS = "This section cannot be changed here: it is stored in the place catalogue, which is read only.";

export function createStakeholderRecordCardHost(platform: StakeholderCardPlatform): StakeholderRecordCardHost {
  /**
   * The Employment section, with the name of the vault that holds the record when the shell lists it (else the section says "this vault"), the work
   * place (0.5.0: the Location box and the read-only place name, and the catalogue's origin, so a place stored as a compact id reads as an address),
   * and the write guard: a section one of whose targets is the place catalogue is drawn read-only and says why.
   */
  function EmploymentSection(p: EmploymentSlotProps) {
    const { vaults } = platform.useShell();
    const name = vaults.find((v) => v.vaultId === p.vaultId)?.name?.trim();
    const refused = employmentWritesRefused(p);
    // The catalogue's origin is the provider's (`geoOrigin` prop). Never set: no catalogue is known, and a compact place id reads as none.
    let catalogue: string | undefined;
    try {
      catalogue = geoOrigin();
    } catch {
      catalogue = undefined;
    }
    const rows = createElement(EmploymentRows, {
      ...p,
      canEdit: p.canEdit && !refused,
      find: findOrganizationRecords,
      ...(name ? { vaultName: name } : {}),
      renderWorkLocation: (wp: { placeId: string; placeLabel: string; onChange: (next: { placeId: string; placeLabel: string }) => void }) =>
        createElement(WorkLocationField, { placeId: wp.placeId, label: wp.placeLabel, onChange: wp.onChange }),
      renderPlaceName: (pp: { placeId: string; placeLabel: string }) => createElement(WorkPlaceName, { placeId: pp.placeId, label: pp.placeLabel }),
      ...(catalogue !== undefined ? { catalogueOrigin: catalogue } : {}),
    });
    if (!refused) return rows;
    return createElement(
      Fragment,
      null,
      rows,
      createElement("p", { role: "status", "data-testid": "employment-geo-refused", className: "text-xs text-[var(--ink-faint)]" }, GEO_WRITE_REFUSED_SAYS),
    );
  }
  /**
   * The Address section (0.6.0): `AddressRows` of `address-rows`, given the slot's props as they are (the vault is the one that holds the RECORD, the card's own,
   * never the viewer's) and the name of that vault when the shell lists it, for "Not every address in <name> was read." Its place reads and writes are the
   * units' own: the catalogue is only ever read, and an address is written only in the record's vault.
   */
  function AddressSection(p: AddressSlotProps) {
    const { vaults } = platform.useShell();
    const name = vaults.find((v) => v.vaultId === p.vaultId)?.name?.trim();
    return createElement(AddressRows, { ...p, ...(name ? { vaultName: name } : {}) });
  }
  return {
    useShell: platform.useShell,
    photoReadKeys: platform.photoReadKeys,
    photoReadKeysSync: platform.photoReadKeysSync,
    vocabulary: createCardVocabularyHost(platform.persistVocabulary ? { persistVocabulary: platform.persistVocabulary } : {}),
    useRefLabel: platform.useRefLabel,
    renderAddress: (p) => createElement(AddressSection, p),
    renderEmployment: (p) => createElement(EmploymentSection, p),
    renderLanguages: (p) => createElement(LanguageSection, p),
    renderSkillsAndInterests: (p) => createElement(Fragment, null, createElement(SkillRows, p.skills), createElement(InterestRows, p.interests)),
  };
}
