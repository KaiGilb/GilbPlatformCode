/**
 * What the contact-rows section needs from the app that is in no unit: one hook, one writer and its note, and six components.
 * Each member replaces one import of the app's `ContactRows.tsx`, used at the same place with the same arguments.
 *
 *   - `useHomeDial` is REQUIRED: the section calls it on every render, as the source did.
 *   - `saveRecordSidecar` (a writer) is OPTIONAL: without it the section is read-only (no edit control is drawn and nothing is saved).
 *     `noteServedVersion` goes with it (it tells the writer the version a card read); without it nothing is noted.
 *   - The six components are OPTIONAL. When one is absent, the part it draws is not drawn (see each member).
 *
 * The host reaches the section through `ContactRowsHostProvider`. Without one, the section throws an error that names it.
 *
 * Module state: `ContactRowsHostContext` is one React context. A provider from another installed copy of this unit is not seen.
 */
import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import type { ThinSkill } from "./thinSkills";

/** A home-address claim, as the app's `useHomeDial` reads it (a structural copy of its `HomeDialClaim`). */
export interface HomeDialClaim {
  label: string;
  uri: string;
  placeIds: readonly string[];
}

/** What a rebase gets after a 412: the record as served now. Only the fields the section reads. */
export interface SidecarFresh {
  served?: { facts: Record<string, unknown> } | null;
}

export interface PhoneValueProps {
  value: string;
  suggestedDial?: string;
  onCommit: (value: string) => void;
  /** The person changed the code. Not called for a prefill. */
  onDialSet?: (dial: string) => void;
  ariaLabel: string;
  /** A row just added opens straight into editing, with the cursor in the country-code box. */
  startEditing?: boolean;
}

export interface SkillPickerSheetProps {
  onPick: (skill: ThinSkill) => void;
  onClose: () => void;
  excludeUris?: string[];
  noun?: "skill" | "interest";
}

export interface SkillDepthNoteProps {
  skillName: string;
  /** The stored note ("" for none), or null while it is not read. */
  note: string | null;
  readOnly: boolean;
  saving: boolean;
  error: string | null;
  /** Save the note; resolves TRUE only when the store kept it. */
  onCommit: (next: string) => Promise<boolean>;
  noun?: "skill" | "interest";
}

export interface HeldVisibilitySwitchProps {
  isPrivate: boolean;
  /** The card is being edited: the switch is a control only then. */
  editing: boolean;
  busy?: boolean;
  onSet: (makePrivate: boolean) => void;
  noun: string;
}

export interface AddedByLineProps {
  /** The detail's own address (the claim). Empty: nothing is drawn. */
  item: string;
  /** The viewer's own card is the claim's one source. */
  own: boolean;
  /** False when the claim names no source at all. */
  hasSource?: boolean;
}

export interface ContactRowsHost {
  /**
   * A HOOK: the digits of the home address country's calling code, or "". Called on every render, unconditionally, at the place the
   * source called it, with the one constant empty list of claims.
   * Replaces `useHomeDial(claims)` of GilbApp `src/lib/mynet/phone/useHomeDial.ts` line 34 (imported at `src/components/records/ContactRows.tsx` line 44, called at line 113).
   */
  useHomeDial(claims: readonly HomeDialClaim[]): string;
  /**
   * OPTIONAL WRITER. Queue one save of the section on the record's one versioned serial save. `build` makes the patch from the sidecar as
   * stored now (called again for the resend after a 412); `rebase` gets the fresh record after a 412, before the resend. Resolves when
   * stored; rejects with the writer's error (shown as "could not be saved").
   * Replaces `saveRecordSidecar(...)` of GilbApp `src/lib/base/recordSidecarSave.ts` line 75 (imported at `ContactRows.tsx` line 39, called at line 198).
   * Absent: the section is read-only.
   */
  saveRecordSidecar?(
    recordId: string,
    recordEntityUri: string | null,
    metaKey: string,
    build: (storedMeta: unknown) => { patch: Record<string, unknown>; meta: Record<string, unknown> },
    rebase: (fresh: SidecarFresh) => void,
  ): Promise<unknown>;
  /**
   * OPTIONAL. Tells the writer the version and sidecar a card read carried; called from an effect whenever the served rows change.
   * Replaces `noteServedVersion(recordId, etag, meta)` of GilbApp `src/lib/base/recordSidecarSave.ts` line 50 (imported at `ContactRows.tsx` line 39, called at line 147).
   * Absent: nothing is noted.
   */
  noteServedVersion?(recordId: string, etag: string | null, meta: unknown): void;
  /**
   * OPTIONAL COMPONENT. A phone's value editor (country code + number). Replaces `PhoneValue` of GilbApp `src/components/mynet/PhoneValue.tsx`
   * (imported at `ContactRows.tsx` line 40, used at line 550). Absent: a phone row shows the plain phone text.
   */
  PhoneValue?: ComponentType<PhoneValueProps>;
  /**
   * OPTIONAL COMPONENT. The skill picker sheet, drawn into the document body when the add control is pressed. Replaces `SkillPickerSheet`
   * of `src/components/mynet/SkillPickerSheet.tsx` (imported at `ContactRows.tsx` line 45, used at line 411). Absent: the picker is not drawn.
   */
  SkillPickerSheet?: ComponentType<SkillPickerSheetProps>;
  /**
   * OPTIONAL COMPONENT. The "About this skill" note under a picked skill. Replaces `SkillDepthNote` of `src/components/mynet/SkillDepthNote.tsx`
   * (imported at `ContactRows.tsx` line 47, used at lines 430 and 526). Absent: the note is not drawn.
   */
  SkillDepthNote?: ComponentType<SkillDepthNoteProps>;
  /**
   * OPTIONAL COMPONENT. The platform's small logo in front of a social row's name. Replaces `SocialLogo` of `src/components/mynet/SocialLogo.tsx`
   * (imported at `ContactRows.tsx` line 49, used at lines 506 and 679). Absent (or `socialPlatformName` absent): the logo is not drawn and the label still shows.
   */
  SocialLogo?: ComponentType<{ platform: string | null; className?: string }>;
  /**
   * OPTIONAL. The name of the platform a Social row is about: the platform its address says, else the label it was stored with when the
   * logo table holds it, else none. Replaces `socialPlatformName(platformOfValue, label)` of `src/lib/base/socialLogos.ts` (it reads the
   * app's logo table), imported at `ContactRows.tsx` line 50 and used at lines 506 and 679. Goes with `SocialLogo`: the logo is drawn only when both are given.
   */
  socialPlatformName?(platformOfValue: string | null, label: string): string | null;
  /**
   * OPTIONAL COMPONENT. The "who sees this note" switch on a note the viewer added. Replaces `HeldVisibilitySwitch` of
   * `src/components/records/HeldVisibilitySwitch.tsx` (imported at `ContactRows.tsx` line 58, used at lines 441 and 539). Absent: not drawn.
   */
  HeldVisibilitySwitch?: ComponentType<HeldVisibilitySwitchProps>;
  /**
   * OPTIONAL COMPONENT. The "Added by" line under a note. Replaces `AddedByLine` of `src/components/records/AddedByLine.tsx` (imported at
   * `ContactRows.tsx` line 59, used at lines 439 and 536). Absent: not drawn.
   */
  AddedByLine?: ComponentType<AddedByLineProps>;
}

export const ContactRowsHostContext = createContext<ContactRowsHost | null>(null);

export function ContactRowsHostProvider({ host, children }: { host: ContactRowsHost; children: ReactNode }) {
  return <ContactRowsHostContext.Provider value={host}>{children}</ContactRowsHostContext.Provider>;
}

/** The host's members. Throws an error that names the provider when there is none, or when the required hook is missing. */
export function useContactRowsHost(): ContactRowsHost {
  const host = useContext(ContactRowsHostContext);
  if (!host) throw new Error("contact-rows: wrap the card in <ContactRowsHostProvider host={...}>");
  if (typeof host.useHomeDial !== "function") throw new Error("contact-rows: the host given to <ContactRowsHostProvider> has no useHomeDial");
  return host;
}
