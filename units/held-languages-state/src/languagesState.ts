/**
 * Cycle214 s8 — "Languages": what the Languages card needs from the app behind it. TYPES ONLY, so the card
 * is ONE component with ONE set of rules in both apps:
 * MyNet gives it claims with a rung each (`useLanguages`), GilbApp gives it held claims with no rung
 * (`useHeldLanguages`).
 */
import type { LanguageEntryInfo } from "@kaigilb/gilbplatformcode-language-entry";

/** One listed language. */
export interface LanguageRow {
  /** The claim's id. */
  id: string;
  /** The catalogue entry's address (`a:languageUsed`). */
  language: string;
  /** The flag the person chose (`a:flagCountry`); null = none chosen (the language's own default, or the globe). */
  flagCountry: string | null;
  /** The entry's rung, as the app names it; `null` on a held card (no rung, never found). */
  access: string | null;
  /**
   * GilbApp (RuleBaseappSourceIsAdder): false when this viewer did not state the claim (another person, or an old vault card, did): it is
   * shown but has no remove and no flag change for them. Absent = theirs (MyNet's own card).
   */
  own?: boolean;
  /** GilbApp (SB1b-2): the claim's own address and whether it names a source, for the "Added by" line. Absent on MyNet's own card. */
  uri?: string;
  hasSource?: boolean;
  /** GilbApp (SB1b-1): the adder set this language to private; only they see it. Absent = shared with the vault. */
  private?: boolean;
}

export interface LanguagesState {
  rows: readonly LanguageRow[];
  loading: boolean;
  /** The read failed: said, ⛔ never shown as "no languages". */
  error: string | null;
  /** A neutral sentence for a reader (not an alert): shown when set and there is no error. */
  notice?: string | null;
  /** The stored contact language (`a:contactLanguage`, one BCP-47 tag), "" for none. */
  contactTag: string;
  /** True when each entry has its own rung (MyNet); false on a held card. */
  hasRungs: boolean;
  errorFor: (language: string) => string | null;
  savingFor: (language: string) => boolean;
  /** Add one catalogue language (a new entry starts Public on a card with rungs). TRUE only when the read-back carries it. */
  add: (info: LanguageEntryInfo) => Promise<boolean>;
  /** List the stored contact language that no entry matches yet, at the rung it had (never a wider one). */
  listLegacy: (info: LanguageEntryInfo) => Promise<boolean>;
  /**
   * Remove the entry; when it was the marked one (`marked`) the mark is cleared too, by one write of `a:contactLanguage`
   * — but ONLY if the mark is still that entry's when the removal has finished (a mark moved meanwhile is left alone).
   * Removing takes away EVERY claim for the entry (a second device may have added a duplicate).
   */
  remove: (row: LanguageRow, marked: boolean) => Promise<boolean>;
  /** Choose the flag (`null` clears the choice). */
  setFlag: (row: LanguageRow, country: string | null) => Promise<boolean>;
  /** GilbApp (SB1b-1): set the viewer's own claim for this entry private (`true`) or back to shared; one PATCH with If-Match. Refuses a claim the viewer did not add. */
  setPrivate?: (row: LanguageRow, makePrivate: boolean) => Promise<boolean>;
  /**
   * Move the mark to this entry: ONE write of `a:contactLanguage`. `listed` = the infos of every listed entry:
   * when another one shares this entry's primary subtag, the entry's own three-letter code is written so the mark
   * names this entry and no other (`contactTagForMark`).
   */
  markContact: (row: LanguageRow, info: LanguageEntryInfo, listed?: readonly LanguageEntryInfo[]) => Promise<boolean>;
  /** Drop a stored contact language that no entry matches. */
  clearContact: () => Promise<boolean>;
  /**
   * Move one entry to a rung (cards with rungs only); the mark, when it is still this entry's when the move has
   * finished, takes the same rung. Every claim for the entry moves (a duplicate is never left at the old rung).
   */
  setAccess?: (row: LanguageRow, access: string, marked: boolean) => Promise<boolean>;
}
