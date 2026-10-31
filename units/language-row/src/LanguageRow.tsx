/**
 * One language, drawn by its name with its country flag, never by its address. New code (the source draws a language only inside the
 * languages section of a held card).
 *
 * `language` is the language catalogue entry's address, as a card holds it (`a:languageUsed`). The name is the entry's own `label`,
 * read once through `language-entry`. The flag is the claim's own country when the caller has one (`flagCountry`); else the entry's
 * one country; else the neutral globe (`viewerFlagCountry`). While the entry is being read the row shows the globe and a quiet "…".
 * When the entry cannot be read, or has no name of its own, it shows the globe and the words "A language". It never shows the
 * address and never the last part of it. A value that is not an address (a language typed as text) is shown as the text it is.
 */
import { FlagImage } from "@kaigilb/gilbplatformcode-flag-image";
import { viewerFlagCountry } from "@kaigilb/gilbplatformcode-flag-choice";
import { useLanguageInfos, type LanguageEntryInfo } from "@kaigilb/gilbplatformcode-language-entry";

/** What the row says while the entry is read. */
export const LANGUAGE_READING_TEXT = "…";
/** What the row says when the entry cannot be read, or carries no name. */
export const LANGUAGE_UNNAMED_TEXT = "A language";

const IS_ADDRESS = /^https?:\/\//i;

/** The name to show for a read entry, or null when it has no name of its own (the entry's label then falls back to its address tail). */
export function languageNameOf(info: Pick<LanguageEntryInfo, "uri" | "label">): string | null {
  const label = info.label.trim();
  if (label === "" || label.includes("://")) return null;
  const tail = info.uri.slice(info.uri.lastIndexOf("/") + 1);
  return label === tail ? null : label;
}

export interface LanguageRowProps {
  /** The language entry's address (`a:languageUsed`). */
  language: string;
  /** The country whose flag the person chose for this language (`a:flagCountry`), when the caller has it. */
  flagCountry?: string | null | undefined;
  className?: string | undefined;
}

export function LanguageRow({ language, flagCountry, className }: LanguageRowProps) {
  const text = language.trim();
  const isAddress = IS_ADDRESS.test(text);
  const { infos, failed } = useLanguageInfos(isAddress ? [text] : []);
  const info = isAddress ? infos.get(text) : undefined;
  const failedRead = isAddress && failed.includes(text);
  let state: "text" | "reading" | "read" | "failed";
  let name: string;
  if (!isAddress) {
    state = "text";
    name = text;
  } else if (info) {
    const named = languageNameOf(info);
    state = named === null ? "failed" : "read";
    name = named ?? LANGUAGE_UNNAMED_TEXT;
  } else if (failedRead) {
    state = "failed";
    name = LANGUAGE_UNNAMED_TEXT;
  } else {
    state = "reading";
    name = LANGUAGE_READING_TEXT;
  }
  const country = info && state === "read" ? viewerFlagCountry({ flagCountry, languageCountries: info.countries }) : null;
  return (
    <span className={["inline-flex items-center gap-2", className].filter(Boolean).join(" ")} data-testid="language-row" data-language-state={state}>
      <FlagImage country={country} />
      <span data-testid="language-row-name">{name}</span>
    </span>
  );
}
