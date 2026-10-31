// State the tests share with the harness, kept apart from `app.tsx` so that the set-up file can reach it without loading the card (a test file's
// `vi.mock` of a peer must come before the card is first imported).
import type { StakeholderRecordCardHost } from "../src/stakeholderRecordCardHost";
import type { createPhotoTermResolver } from "@kaigilb/gilbplatformcode-photo-term";

/** Test seams a test sets before it mounts. */
export const seam = {
  recordPicture: undefined as StakeholderRecordCardHost["renderRecordPicture"],
  attachments: undefined as StakeholderRecordCardHost["renderAttachments"],
  address: undefined as StakeholderRecordCardHost["renderAddress"],
  employment: undefined as StakeholderRecordCardHost["renderEmployment"],
  languages: undefined as StakeholderRecordCardHost["renderLanguages"],
  skillsAndInterests: undefined as StakeholderRecordCardHost["renderSkillsAndInterests"],
  bandIcon: undefined as StakeholderRecordCardHost["renderBandIcon"],
  typeDescription: undefined as StakeholderRecordCardHost["renderTypeDescription"],
  holdingVaultOf: undefined as StakeholderRecordCardHost["holdingVaultOf"],
  /** True: the host gives no `holdingVaultOf` at all (the card's default stands). */
  omitHolding: false,
  /** Finds the holder's vault picture. Default: none (the initials are drawn), as the source tests that do not test the picture. */
  discover: undefined as undefined | ((...a: never[]) => Promise<{ profileId: string | null; photoRef: string | null }>),
  /** The calls the shell made, for tests that count hook order. */
  useShellCalls: 0,
  reset() {
    seam.recordPicture = seam.attachments = seam.address = seam.employment = seam.languages = seam.skillsAndInterests = seam.bandIcon = seam.typeDescription = seam.holdingVaultOf = seam.discover = undefined;
    seam.omitHolding = false;
    seam.useShellCalls = 0;
  },
};

export const resolvers = new Map<string, ReturnType<typeof createPhotoTermResolver>>();
export function resetResolvers() {
  resolvers.clear();
}

/** The address the own-card band links to ("Edit in MyNet"): a setting of `own-card-state`, set before each test. */
export const MYNET_PROFILE_URL = "https://mynet.example.test/profile";
