// What the record card needs from the app that is in no unit: the shell, the photo term's read keys, the card vocabulary host, the label of an
// address in a field, and the pieces that are MyNet's or the file library's (drawn by the host when it has them, not drawn when it has not).
// ONE context. Each member says what it is (R read, W write, N navigation) and where the source called it.

import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import type { CardVocabularyHost } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";
import type { UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import type { ContactRows } from "@kaigilb/gilbplatformcode-contact-rows";

/** What the card reads of the app's shell. */
export interface StakeholderRecordCardShell {
  /** The signed-in session: `principal` (the holder), `vault.entity` and `vault.shortWebId` (the keys a framed grant is matched against). Undefined: not signed in. */
  session: { principal: string; vault?: { entity?: string | null; shortWebId?: string | null } | null } | null | undefined;
  /** Every vault the holder can reach, own vault included. */
  vaults: readonly ReachableVault[];
  /** The content scope; the card reads `reach`, the session vault's row in the reachable set (null: the landing row of `vaults` is used). */
  contentScope: { reach?: { vaultId: string } | null };
  /** Whether the pane may write at all, and why not (non-null exactly when `allowed` is false). Every edit control is gated on it. */
  writeGuard: { allowed: boolean; reason: string | null };
  /** N. Opens a record of the holder's by its id, in the same pane. */
  openRecordFromList(id: string): void;
}

/** The picture editor of the record's photo, drawn by the host. `onSaved` is to be called when the photo was set or cleared; the card then reads the record again. */
export interface RecordPictureProps {
  vault: ReachableVault;
  size: number;
  /** Given by the wide header only. */
  shape?: string;
  cssSize?: number | string;
  initials?: string;
  person: { id: string; entityUri: string | null; photoRef: string | null; name: string; canEdit: boolean };
  onSaved(): void;
}

export interface BandIconProps {
  typeId: string;
  typeName: string;
  /** The record's facts (the host may read the record's own picture from them). */
  facts: Readonly<Record<string, string>>;
  className: string;
}

export interface TypeDescriptionProps {
  ownDoes: string | undefined;
  typeUri: string;
  specTypeName: string | undefined;
}

export interface AttachmentsProps {
  recordId: string;
  vaultId: string;
  recordEntityUri: string | null;
  canWrite: boolean;
  recordFacts: Record<string, string> | null;
}

export interface AddressSlotProps {
  title: string;
  /** The text the record's own address fact holds. */
  legacyText: string;
  vaultId: string | null;
  recordEntityUri: string;
  principal: string | null;
  canEdit: boolean;
}

export interface EmploymentSlotProps {
  title: string;
  recordId: string;
  recordEntityUri: string;
  vaultId: string | null;
  /** The slug the record's employment edges are held under. */
  edgeKey: string;
  servedEdges: unknown;
  servedReady: boolean;
  canEdit: boolean;
  /** Call it after the section wrote; the card reads the record again. */
  onSaved(): void;
}

export interface LanguagesSlotProps {
  vaultId: string | null;
  principal: string | null;
  recordEntityUri: string;
  canEdit: boolean;
  /** The record's contact-language tag as the card holds it now. */
  contactTag: string;
  /** Writes the contact-language tag through the card's own save; null when the record has no such field. */
  writeContact: ((tag: string) => void) | null;
}

export type SkillRowsProps = Omit<ComponentProps<typeof ContactRows>, "kind" | "skillNotes" | "recordEntityUri"> & {
  vaultId: string | null;
  principal: string | null;
  recordEntityUri: string;
};

export interface SkillsAndInterestsSlotProps {
  /** The props of the skills section (`ContactRows` with `kind="skill"`), as the card would draw it. */
  skills: SkillRowsProps;
  interests: { vaultId: string | null; principal: string | null; recordEntityUri: string; canEdit: boolean };
}

export interface StakeholderRecordCardHost {
  /**
   * R, N. A HOOK: the app shell. The first hook the card calls, on every render, never conditionally.
   * Source: `useShell()` at RecordDetail.tsx:197 (outer) and :498 (body).
   */
  useShell(): StakeholderRecordCardShell;
  /** R. The photo term's read keys, each with its `a:` prefix. Source: `photoReadKeys()` at :505. */
  photoReadKeys(): Promise<readonly string[]>;
  /** R. The same, known now ("not known yet" is an empty array, never "no photo"). Sync. Source: `photoReadKeysSync()` at :502. */
  photoReadKeysSync(): readonly string[];
  /**
   * R. OPTIONAL. The vault the holder's merged list attributes a record to. Absent: `createdInVaultOf` of `record-detail-reads` (the vault a create
   * wrote into, this session); the card's `vaultId` prop is the next fallback. Source: `holdingVaultOf(qc, id)` at :679 and :739.
   */
  holdingVaultOf?(qc: QueryClient, recordId: string): string | null;
  /** R. The card vocabulary host, the first argument of `stakeholderCardVocabularyQuery`. Source: `stakeholderCardVocabularyQuery()` at :530. */
  vocabulary: CardVocabularyHost;
  /**
   * R. A HOOK: the label of an entity address shown in a field. The card mounts it as `RefLabelContext` of `entity-ref-value`.
   * Source: `useResolvedRefLabel` inside `EntityRefValue`, drawn by `FieldEditor` and `ExtraFact`.
   */
  useRefLabel: UseRefLabel;

  // ---- optional pieces; absent, the part is not drawn (the four sections have their own rule) ----
  /** W (sets, replaces, clears the record's photo). Absent: the header shows their photo or the initials. Source: `VaultAvatar` at :1698 and :1747. */
  renderRecordPicture?(p: RecordPictureProps): ReactNode;
  /** R. The non-wide header band's type icon. Absent: none. Source: `TypeIcon` at :1765. */
  renderBandIcon?(p: BandIconProps): ReactNode;
  /** R. The non-wide header band's type description. Absent: none. Source: `TypeDescription` at :1791. */
  renderTypeDescription?(p: TypeDescriptionProps): ReactNode;
  /** W (upload, remove). Absent: not drawn. Source: `Attachments` at :2021. */
  renderAttachments?(p: AttachmentsProps): ReactNode;
  /** W (place claims). Absent: not drawn. Source: `AddressRows` at :1449. */
  renderAddress?(p: AddressSlotProps): ReactNode;
  /** W (employment entities and edges). Absent: not drawn. Source: `EmploymentRows` at :1470. */
  renderEmployment?(p: EmploymentSlotProps): ReactNode;
  /** W (held language claims, and the contact-language tag through `writeContact`). Absent: not drawn, and the contact-language row stays. Source: `LanguageSection` at :1519. */
  renderLanguages?(p: LanguagesSlotProps): ReactNode;
  /** W (held notes). Absent: the plain skills section, `ContactRows kind="skill"`, with no notes and no interests. Source: `SkillRows` + `InterestRows` at :1493-1516. */
  renderSkillsAndInterests?(p: SkillsAndInterestsSlotProps): ReactNode;
}

/** The provider the card reads. With none, the card throws an error that names it. */
export const StakeholderRecordCardHostContext = createContext<StakeholderRecordCardHost | null>(null);

export function useStakeholderRecordCardHost(): StakeholderRecordCardHost {
  const host = useContext(StakeholderRecordCardHostContext);
  if (!host) throw new Error("The stakeholder record card needs a StakeholderRecordCardHostContext.Provider above it.");
  return host;
}
