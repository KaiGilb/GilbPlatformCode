/**
 * Cycle214 s8 — a held person card's Languages (Kai, 2026-10-15: "Change it to be languages, and then one can
 * be contact language, placed at top. Each with a country flag."; "yes, make language global searchable").
 *
 * The Languages card (`LanguagesCard`) over the held
 * store (`useHeldLanguages`): one held claim per language in the vault that holds the record, `a:heldParty`,
 * `a:languageUsed`, optional `a:flagCountry`, `a:statedBy` (the card of the person who ADDED it, RuleBaseappSourceIsAdder), with ⛔ NO rung (its
 * languages are never found by the network; Agent.Concept §2a; shared with the vault by default). The contact language is the record's own `a:contactLanguage`
 * (one tag) written through the card's own save, so a move of the mark is one write.
 *
 * It replaces the contact-language row (`PersonFieldRow` + `ContactLanguagePicker`) on a person card; the old
 * name-storing `LanguageRows.tsx` stays unused.
 */
import type { ReactNode } from "react";
import { AddedByLine, HeldVisibilitySwitch } from "@kaigilb/gilbplatformcode-added-by";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import { useHeldLanguages } from "@kaigilb/gilbplatformcode-held-languages-state";
import type { LanguageRow } from "@kaigilb/gilbplatformcode-held-languages-state";
import { LanguagesCard } from "./LanguagesCard";

export function LanguageSection({
  vaultId,
  principal,
  recordEntityUri,
  canEdit,
  contactTag,
  writeContact,
  renderCountrySearch,
}: {
  /** The vault that HOLDS the person's record. */
  vaultId: string | null;
  /** The signed-in principal, granted read on each claim at mint. */
  principal: string | null;
  /** The person's record: every claim's `a:heldParty`. */
  recordEntityUri: string;
  canEdit: boolean;
  /** The record's stored `a:contactLanguage` ("" for none). */
  contactTag: string;
  /** Writes the record's contact language (the card's own save); null when the card has no such field. */
  writeContact: ((tag: string) => void) | null;
  /** The host's search over all countries, for the flag choice. Absent: no country search. */
  renderCountrySearch?: (p: { onPick(country: string): void }) => ReactNode;
}) {
  const state = useHeldLanguages(vaultId, recordEntityUri, principal, { tag: contactTag, write: canEdit ? writeContact : null });
  // s8 card look: the (−) shows only while the card is being edited.
  const mode = useCardMode();
  // A person with no landing vault of their own cannot add (the language would have no source): for a person who may edit the card the group
  // is not drawn (the card says why once, where the kinds of contact sit). A reader sees every language the platform returns.
  if (state.noOwnVault && canEdit) return null;
  const editMode = canEdit && !(mode.managed && mode.presentation);
  // SB1b-1: the "who sees this" switch on a language the viewer added (a language another adder or an old vault card stated has none).
  // SB1b-2: "Added by <name>" on every language row (another adder's, an old vault card's too: the platform says whether a name may be shown).
  const renderAccess = (row: LanguageRow) => (
    <>
      {row.uri ? <AddedByLine item={row.uri} own={row.own === true} hasSource={row.hasSource !== false} /> : null}
      {row.own === true && state.setPrivate ? (
        <HeldVisibilitySwitch
          isPrivate={row.private === true}
          editing={editMode}
          busy={state.savingFor(row.language)}
          noun="language"
          onSet={(makePrivate) => void state.setPrivate!(row, makePrivate)}
        />
      ) : null}
    </>
  );
  return <LanguagesCard state={state} editMode={editMode} renderAccess={renderAccess} renderCountrySearch={renderCountrySearch} />;
}
