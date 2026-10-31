/**
 * Which country's flag a language shows, and where that flag's small file is. Pure: no request, no React.
 *
 * A flag is the country's own picture, held by the geo catalogue next to the country. It is found by a rule on the country's
 * address, never by reading the country: `https://<host>/base/e/<local id>` has its flag file at `<host>/files/flag-<local id>`
 * and the file's own entity at `<host>/base/e/flag-<local id>`. A country entity holds its polygon and is 0.5 to 3.1 MB, so it
 * is never asked for.
 */


export const ENTITY_ADDRESS = /^(https:\/\/[^/\s]+)\/base\/e\/([A-Za-z0-9][A-Za-z0-9._-]*)$/;

/** The file id of a country's flag (`flag-` + its local id), or null when it is not a catalogue address. */
export function flagFileId(country: string): string | null {
  const m = ENTITY_ADDRESS.exec((country ?? "").trim());
  return m ? `flag-${m[2]}` : null;
}

/** The SVG as an image address: drawn by `<img>`, so a picture can run ⛔ no script. */
export function flagDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** A country's name in the reader's language, from its ISO 3166 code; null when there is no code or no name. */
export function countryNameFromCode(code: string | null | undefined, locales?: readonly string[]): string | null {
  const c = (code ?? "").trim();
  if (!/^[A-Za-z]{2}$/.test(c)) return null;
  try {
    const name = new Intl.DisplayNames(locales ? [...locales] : undefined, { type: "region", fallback: "none" }).of(c.toUpperCase());
    return name && name !== c.toUpperCase() ? name : null;
  } catch {
    return null;
  }
}

/** The longest list of flags offered as a short list; beyond it the person searches all countries. */
export const FLAG_SHORT_LIST_MAX = 12;

export interface FlagChoices {
  /** The flag shown with no pick: the language's one country. */
  defaultCountry: string | null;
  /** The flags offered to pick between. */
  short: readonly string[];
  /** True when the person is to search all countries (none, or too many to list). */
  needsSearch: boolean;
}

/** Which flags a language offers, from the countries its catalogue entry names. */
export function flagChoices(countries: readonly string[]): FlagChoices {
  if (countries.length === 1) return { defaultCountry: countries[0]!, short: countries, needsSearch: false };
  if (countries.length >= 2 && countries.length <= FLAG_SHORT_LIST_MAX) return { defaultCountry: null, short: countries, needsSearch: false };
  return { defaultCountry: null, short: [], needsSearch: true };
}

/**
 * The flag a language row shows when it has no choice of its own to read.
 *
 * - the claim's own `a:flagCountry`, when it has one (the person chose it);
 * - else the language entry's `a:languageCountry`, when it names exactly one country;
 * - else `null`: no flag, the neutral globe (a language with no country, or in several).
 */
export function viewerFlagCountry(args: { flagCountry?: string | null | undefined; languageCountries: readonly string[] }): string | null {
  const own = (args.flagCountry ?? "").trim();
  if (own !== "") return own;
  return args.languageCountries.length === 1 ? args.languageCountries[0]! : null;
}
