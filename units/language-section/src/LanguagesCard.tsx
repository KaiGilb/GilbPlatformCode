// Cycle214 s8 — the LANGUAGES card on a person's profile. Kai, 2026-10-15, verbatim: "for contact language.
// Change it to be languages, and then one can be contact language, placed at top. Each with a country flag.
// When multiple languages in a country or languages accross multiple countries, still pick a flag (maybe user
// can choose between a few)"; "yes, make language global searchable. It is of interest to find someone who
// speaks french etc."
//
// ONE card and ONE set of rules: what differs between hosts is only what is behind `state` (a claim per language at its own
// rung, or a held card's: no rung) and the CSS tokens. It is the Interests card's shape: each language is a row with the red round (−) at the LEFT (in edit
// mode, as every row), its own rung on the right (`renderAccess`), and "Add languages" under the list.
//   - the language that is the contact language is MARKED and always shown FIRST; another entry's "Contact
//     language" button moves the mark with ONE write (`state.markContact`), so there is never a second mark;
//   - each entry shows a country flag (`FlagImage`): the language's own country by default; when the language
//     names several countries a short choice is offered, and the pick is saved with the entry; a language with
//     no country shows the neutral globe;
//   - a stored contact language that matches no entry is shown as the marked row, never dropped; "Add to my
//     languages" lists it at the rung it had and never a wider one.
// Presentation (the card's mode): the languages as text with their flag; no (−), no "Add languages", no "Make contact language"; a card with no language is not drawn.
// A row with `own === false` (stated by someone else) has no remove and no flag button.
import { useMemo, useState, type ReactNode } from "react";
import { CardGroup } from "@kaigilb/gilbplatformcode-card-group";
import { useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import { flagChoices } from "@kaigilb/gilbplatformcode-flag-choice";
import { FlagChooser } from "@kaigilb/gilbplatformcode-flag-chooser";
import { FlagImage } from "@kaigilb/gilbplatformcode-flag-image";
import type { LanguageRow, LanguagesState } from "@kaigilb/gilbplatformcode-held-languages-state";
import { readLanguageEntry, useLanguageInfos } from "@kaigilb/gilbplatformcode-language-entry";
import type { LanguageEntryInfo } from "@kaigilb/gilbplatformcode-language-entry";
import { contactLanguageDisplay, orderLanguages } from "@kaigilb/gilbplatformcode-language-order";
import { LANGUAGE_READING_TEXT, LANGUAGE_UNNAMED_TEXT, languageNameOf } from "@kaigilb/gilbplatformcode-language-row";
import { findEntryForLegacyTag } from "@kaigilb/gilbplatformcode-language-search";
import { RemoveControl } from "@kaigilb/gilbplatformcode-remove-control";
import { LanguageEntryPicker } from "./LanguageEntryPicker";

export function LanguagesCard({
  state,
  editMode,
  renderAccess,
  renderCountrySearch,
}: {
  state: LanguagesState;
  editMode: boolean;
  /** The rung control of one entry (MyNet); a card with no rungs passes none. */
  renderAccess?: (row: LanguageRow, marked: boolean) => ReactNode;
  /** The host's search over all countries, for the flag choice. Absent: the choice offers the language's own countries and "No flag" only. */
  renderCountrySearch?: (p: { onPick(country: string): void }) => ReactNode;
}) {
  const { infos, ready, failed, retry } = useLanguageInfos(state.rows.map((r) => r.language));
  const ordered = useMemo(() => orderLanguages(state.rows, infos, state.contactTag), [state.rows, infos, state.contactTag]);
  /** A stored contact language no entry matches is called "unmatched" only when the list AND every entry was read (⛔ not while reading, ⛔ not when a read failed). */
  const legacyTag = ready && failed.length === 0 && !state.loading ? ordered.legacyTag : null;
  const [picking, setPicking] = useState(false);
  /** The entry (by address) whose flag choice is open. */
  const [choosing, setChoosing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [legacyBusy, setLegacyBusy] = useState(false);
  /** An add that did not happen has no row to carry its reason, so the reason is said here, ⛔ never lost. */
  const [failedAdd, setFailedAdd] = useState<{ uri: string; label: string } | null>(null);

  const addPicked = async (entity: string, label: string) => {
    setMessage(null);
    let info;
    try {
      info = await readLanguageEntry(entity);
    } catch {
      throw new Error(`${label} could not be read from the language list right now, so nothing was added.`);
    }
    setPicking(false);
    setFailedAdd(null);
    const ok = await state.add(info);
    if (!ok) setFailedAdd({ uri: info.uri, label: info.label });
    // A language spoken in several countries: "still pick a flag" — the choice opens at once.
    if (ok && flagChoices(info.countries).defaultCountry === null && info.countries.length > 1) setChoosing(info.uri);
  };

  const listLegacy = async (tag: string) => {
    setMessage(null);
    setLegacyBusy(true);
    try {
      const info = await findEntryForLegacyTag(tag);
      if (!info) {
        setMessage("This contact language could not be matched to one language in the language list, so it stays as it is.");
        return;
      }
      setFailedAdd(null);
      if (!(await state.listLegacy(info))) setFailedAdd({ uri: info.uri, label: info.label });
    } catch {
      setMessage("The language list could not be searched right now. Nothing was changed.");
    } finally {
      setLegacyBusy(false);
    }
  };

  const mode = useCardMode();
  const present = mode.managed && mode.presentation;
  /** The (−) is an editing control: it shows only in edit mode (and never in presentation, whatever the host passed). */
  const canRemove = editMode && !present;
  const empty = ordered.views.length === 0 && ordered.legacyTag === null;
  /**
   * The name shown for an entry: its own name once read; "…" while it is read; "A language" when it could not be read or has no name of its own.
   * ⛔ Never its address, ⛔ never the last part of it (the entry's `label` falls back to that last part when the catalogue gives none).
   */
  const nameOf = (uri: string, info: LanguageEntryInfo): string =>
    infos.has(uri) ? (languageNameOf(info) ?? LANGUAGE_UNNAMED_TEXT) : failed.includes(uri) ? LANGUAGE_UNNAMED_TEXT : LANGUAGE_READING_TEXT;
  return (
    <CardGroup
      kind="language"
      testId="languages-section"
      title="Languages"
      icon="language"
      empty={empty && !state.loading && !state.error && !state.notice && failed.length === 0 && !failedAdd && !message}
    >
      {state.error ? (
        <p role="alert" className="text-[12.5px] text-[var(--bad)]" data-testid="languages-read-error">
          {state.error}
        </p>
      ) : state.notice ? (
        <p className="py-1 text-[12.5px] text-[var(--ink-soft)]" data-testid="languages-notice">
          {state.notice}
        </p>
      ) : (
        <>
          {empty && !state.loading ? <p className="py-1 text-sm text-[var(--ink-faint)]">Share the languages you use</p> : null}
          {failed.length > 0 ? (
            <p role="alert" className="text-[12.5px] text-[var(--bad)]" data-testid="languages-catalogue-error">
              {failed.length === 1 ? "A language name" : "Some language names"} could not be read from the language list right now.{" "}
              <button type="button" className="underline" onClick={retry} data-testid="languages-catalogue-retry">
                Try again
              </button>
            </p>
          ) : null}
          {legacyTag !== null ? (
            <div className="flex items-start gap-2 py-2" data-testid="language-legacy-row" data-marked="true">
              {canRemove ? <RemoveControl className="mt-1" label={`Remove contact language ${contactLanguageDisplay(legacyTag)}`} onClick={() => void state.clearContact()} /> : null}
              <FlagImage country={null} className="mt-1" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] text-[var(--ink)]" data-testid="language-row-value">
                  {contactLanguageDisplay(legacyTag)}
                </p>
                <p className="text-[12px] text-[var(--ink-soft)]" data-testid="language-contact-mark">
                  Contact language
                </p>
                {present ? null : (
                  <button
                    type="button"
                    className="mt-0.5 min-h-10 text-[13px] text-[var(--ink-soft)] underline disabled:opacity-50"
                    disabled={legacyBusy || state.loading}
                    onClick={() => void listLegacy(legacyTag)}
                    data-testid="language-legacy-list"
                  >
                    Add to my languages
                  </button>
                )}
              </div>
            </div>
          ) : null}
          {ordered.views.map(({ entry, info, marked }) => {
            const flagFor = entry.flagCountry ?? flagChoices(info.countries).defaultCountry;
            const error = state.errorFor(entry.language);
            const shown = nameOf(entry.language, info);
            // RuleBaseappSourceIsAdder (GilbApp): a language another person (or an old vault card) stated is shown, with no remove and no flag change.
            const theirs = entry.own === false;
            return (
              <div key={entry.id} className="py-2" data-testid="language-row" data-marked={marked ? "true" : "false"}>
                <div className="flex items-start gap-2">
                  {canRemove && !theirs ? <RemoveControl className="mt-1" label={`Remove language ${shown}`} onClick={() => void state.remove(entry, marked)} /> : null}
                  {present || theirs ? (
                    <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded text-[var(--ink-soft)]" data-testid="language-flag">
                      <FlagImage country={flagFor} />
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="mt-1 flex size-6 shrink-0 items-center justify-center rounded text-[var(--ink-soft)]"
                      aria-label={`Change the flag for ${shown}`}
                      aria-expanded={choosing === entry.language}
                      data-testid="language-flag-button"
                      onClick={() => setChoosing(choosing === entry.language ? null : entry.language)}
                    >
                      <FlagImage country={flagFor} />
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    {present && mode.canEdit ? (
                      <button
                        type="button"
                        className="block min-h-10 w-full rounded-[var(--r-sm)] text-left text-[15px] text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                        aria-label={`Edit language ${shown}`}
                        data-testid="language-row-value"
                        onClick={mode.enter}
                      >
                        {shown}
                      </button>
                    ) : (
                      <p className="text-[15px] text-[var(--ink)]" data-testid="language-row-value">
                        {shown}
                      </p>
                    )}
                    {marked ? (
                      <p className="text-[12px] text-[var(--ink-soft)]" data-testid="language-contact-mark">
                        Contact language
                      </p>
                    ) : info.tag && !present ? (
                      <button
                        type="button"
                        className="min-h-10 text-[12px] text-[var(--ink-soft)] underline"
                        aria-label={`Make ${shown} the contact language`}
                        data-testid="language-make-contact"
                        onClick={() => void state.markContact(entry, info, ordered.views.map((v) => v.info))}
                      >
                        Make contact language
                      </button>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {renderAccess ? renderAccess(entry, marked) : null}
                    {state.savingFor(entry.language) ? <span className="text-[11px] text-[var(--ink-faint)]">Saving…</span> : null}
                  </div>
                </div>
                {choosing === entry.language ? (
                  <FlagChooser
                    languageName={shown}
                    info={info}
                    current={flagFor}
                    onPick={async (country) => {
                      setChoosing(null);
                      await state.setFlag(entry, country);
                    }}
                    onClose={() => setChoosing(null)}
                    renderCountrySearch={renderCountrySearch}
                  />
                ) : null}
                {error ? (
                  <p role="alert" className="text-[12.5px] text-[var(--bad)]" data-testid="language-error">
                    {error}
                  </p>
                ) : null}
              </div>
            );
          })}
          {present ? null : (
            <button
              type="button"
              className="min-h-11 self-start text-[14px] text-[var(--accent)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              data-testid="language-add"
              data-card-add=""
              disabled={state.loading}
              onClick={() => setPicking(true)}
            >
              Add languages
            </button>
          )}
        </>
      )}
      {failedAdd && !state.rows.some((r) => r.language === failedAdd.uri) ? (
        <p role="alert" className="text-[12.5px] text-[var(--bad)]" data-testid="language-error">
          {state.errorFor(failedAdd.uri) ?? `${failedAdd.label} was not added. Try again.`}
        </p>
      ) : null}
      {message ? (
        <p role="alert" className="text-[12.5px] text-[var(--bad)]" data-testid="languages-message">
          {message}
        </p>
      ) : null}
      {picking ? <LanguageEntryPicker excludeUris={state.rows.map((r) => r.language)} onPick={addPicked} onCancel={() => setPicking(false)} /> : null}
    </CardGroup>
  );
}
