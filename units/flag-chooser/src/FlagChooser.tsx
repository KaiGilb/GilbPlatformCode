/**
 * Cycle214 s8 — "Languages": the choice of a flag for one language entry. Kai, 2026-10-15: "When multiple
 * languages in a country or languages across multiple countries, still pick a flag (maybe user can choose
 * between a few)". The few are the countries the language's catalogue entry names (`a:languageCountry`;
 * `flagChoices`): a short list of flags up to {@link FLAG_SHORT_LIST_MAX}; beyond that, or when the entry
 * names none, a search over all countries (the host's own country search, given as `renderCountrySearch`; with none given there is no
 * search and no "Another country…" button). The pick is
 * saved with the entry by the caller (`a:flagCountry`); "No flag" clears it, and the neutral globe shows.
 *
 * ⛔ No country list is kept here. A name is the flag file's ISO code in the reader's language
 * (`Intl.DisplayNames`), or, when the country has no flag file yet, its local id (the country entity is ⛔ never read).
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { countryNameFromCode, flagChoices } from "@kaigilb/gilbplatformcode-flag-choice";
import { FlagImage, useFlag } from "@kaigilb/gilbplatformcode-flag-image";
import type { LanguageEntryInfo } from "@kaigilb/gilbplatformcode-language-entry";

/**
 * A country's name for the reader: from its flag file's ISO code, else its local id.
 *
 * 🔴 ⛔ NEVER the country entity (Agent.Scaling Languages Delta1 F3): a country entity holds its polygon and is
 * 0.5 to 3.1 MB (Norway 469 KB, the United States 3.1 MB), and a list of twelve would download them all. This reads
 * only the small flag file by the slug rule (`useFlag`); when GilbGeo holds no flag file for the country the row
 * shows the globe and the local id.
 */
function useCountryName(country: string): string {
  const flag = useFlag(country);
  const fromCode = flag?.code ? countryNameFromCode(flag.code) : null;
  return fromCode ?? country.slice(country.lastIndexOf("/") + 1);
}

function CandidateRow({ country, current, onPick }: { country: string; current: boolean; onPick: (c: string) => void }) {
  const name = useCountryName(country);
  return (
    <li>
      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-[15px] text-[var(--ink)] hover:bg-[var(--sel)]"
        aria-label={`Use the flag of ${name}`}
        aria-pressed={current}
        data-testid="flag-choice"
        onClick={() => onPick(country)}
      >
        <FlagImage country={country} />
        <span>{name}</span>
      </button>
    </li>
  );
}

export function FlagChooser({
  languageName,
  info,
  current,
  onPick,
  onClose,
  renderCountrySearch,
}: {
  languageName: string;
  /** The language's catalogue entry, when it could be read. */
  info: LanguageEntryInfo | undefined;
  /** The flag the entry shows now (chosen or default), or null. */
  current: string | null;
  /** The country picked, or `null` for "no flag". */
  onPick: (country: string | null) => void | Promise<void>;
  onClose: () => void;
  /** The host's search over all countries. Absent: no search and no "Another country…" button; the short list and "No flag" stay. */
  renderCountrySearch?: (p: { onPick(country: string): void }) => ReactNode;
}) {
  const choices = flagChoices(info?.countries ?? []);
  const [asked, setAsked] = useState(false);
  // The search over all countries shows when the person asked for it, or when the entry (read) names none to choose between.
  const searching = asked || (info !== undefined && choices.short.length === 0);
  return (
    <div className="mt-1 flex flex-col gap-1 rounded-md border border-[var(--line)] bg-[var(--surface)] p-2" role="group" aria-label={`Choose a flag for ${languageName}`} data-testid="flag-chooser">
      {choices.short.length > 0 ? (
        <ul className="flex flex-col">
          {choices.short.map((c) => (
            <CandidateRow key={c} country={c} current={c === current} onPick={(x) => void onPick(x)} />
          ))}
        </ul>
      ) : null}
      {renderCountrySearch ? (
        searching ? (
          renderCountrySearch({ onPick: (c) => void onPick(c) })
        ) : (
          <button type="button" className="min-h-11 text-left text-[14px] text-[var(--ink-soft)] underline" onClick={() => setAsked(true)} data-testid="flag-another">
            Another country…
          </button>
        )
      ) : null}
      <div className="flex gap-3">
        <button type="button" className="text-xs font-medium text-[var(--ink-faint)] underline" onClick={() => void onPick(null)} data-testid="flag-none">
          No flag (globe)
        </button>
        <button type="button" className="text-xs font-medium text-[var(--ink-faint)] underline" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
