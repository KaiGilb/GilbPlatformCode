import type { ContactRowsHost } from "@kaigilb/gilbplatformcode-contact-rows";
import { AddedByLine, HeldVisibilitySwitch } from "@kaigilb/gilbplatformcode-added-by";
import { useHomeDial } from "@kaigilb/gilbplatformcode-home-dial";
import { PhoneValue } from "@kaigilb/gilbplatformcode-phone-value";
import { noteServedVersion, saveRecordSidecar } from "@kaigilb/gilbplatformcode-record-sidecar-save";
import { SkillDepthNote, SkillPickerSheet } from "@kaigilb/gilbplatformcode-skill-picker-sheet";
import { SocialLogo, socialPlatformName } from "@kaigilb/gilbplatformcode-social-logo";

/**
 * The host of `contact-rows` (the value of `ContactRowsHostProvider`): every member is a unit's. The held card's rows save through the one versioned
 * serial save (`saveRecordSidecar`), prefill a phone's code from the home address (`useHomeDial`) and draw the phone, skill, social-logo, visibility
 * and "Added by" pieces of the units that hold them.
 */
export function createContactRowsHost(): ContactRowsHost {
  return {
    useHomeDial,
    saveRecordSidecar,
    noteServedVersion,
    PhoneValue,
    SkillPickerSheet,
    SkillDepthNote,
    SocialLogo,
    socialPlatformName,
    HeldVisibilitySwitch,
    AddedByLine,
  };
}
