// What the provider holds that a card HOSTED BY ANOTHER UNIT needs to read, without that unit reaching into this one's private files: the shell, the photo
// term's read keys, the label hook of the fields that point at records, and the vocabulary setting. The held stakeholder card's host unit
// (`stakeholder-record-card-host-gilbplatform`) builds the card's host from it. One context, filled by `StakeholderCardGilbPlatformProvider`.

import { createContext, useContext } from "react";
import type { UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import type { PlatformShell } from "./shell";

export interface StakeholderCardPlatform {
  /** A HOOK: the shell (session with `shortWebId`, vault list, content scope with `readVault`, `writeGuard`, `openRecordFromList`). Same hook as the online card's. */
  useShell(): PlatformShell;
  /** The photo term's read keys, each with its `a:` prefix; resolves when the term is known (one shared ask for 60 s). */
  photoReadKeys(): Promise<readonly string[]>;
  /** The same, known now; empty while not known. */
  photoReadKeysSync(): readonly string[];
  /** A HOOK: the label of an entity address shown in a field (the `entity-ref-value` example hook). Also mounted as `RefLabelContext`. */
  useRefLabel: UseRefLabel;
  /** The provider's `persistVocabulary` prop, read at each call; absent when none was given. */
  persistVocabulary?(): boolean;
}

export const StakeholderCardPlatformContext = createContext<StakeholderCardPlatform | null>(null);

/** The platform pieces of the provider above. With none, throws an error that names the provider. */
export function useStakeholderCardPlatform(): StakeholderCardPlatform {
  const v = useContext(StakeholderCardPlatformContext);
  if (!v) throw new Error("useStakeholderCardPlatform needs a StakeholderCardGilbPlatformProvider above it.");
  return v;
}
