/**
 * The pure rules that turn a language catalogue entry into the tag, the name and the countries a list needs.
 *
 * The catalogue gives each entry an ISO 639-3 code (`nor`), not the BCP-47 tag a card stores (`no`). The browser converts it with
 * `Intl.getCanonicalLocales`, so no code table is kept here: `nor` gives `no`, `nob` gives `nb`, and a language with no two-letter
 * code keeps its three letters (`non`), which is still a valid BCP-47 tag.
 */

/**
 * The ISO 639-3 code a catalogue entry carries, or null when it carries none.
 *
 * @param doc a `t:HumanLanguage` entry as the catalogue serves it
 * @returns the three-letter code in lower case, or null
 */
export function iso6393CodeOf(doc: unknown): string | null {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  const d = doc as Record<string, unknown>;
  // The served entry frames the code under its bare key; a prefixed spelling is read too.
  const raw = d["iso6393Code"] ?? d["a:iso6393Code"];
  const value =
    typeof raw === "string"
      ? raw
      : raw && typeof raw === "object" && typeof (raw as { "@value"?: unknown })["@value"] === "string"
        ? ((raw as { "@value": string })["@value"])
        : null;
  const code = value?.trim().toLowerCase() ?? "";
  return /^[a-z]{3}$/.test(code) ? code : null;
}

/**
 * The BCP-47 tag the browser makes from an ISO 639-3 code (`nor` → `no`), or null.
 *
 * @param iso6393 a three-letter ISO 639-3 code
 * @returns the canonical tag, or null when the code is not three letters or the browser refuses it
 */
export function contactLanguageTagFor(iso6393: string): string | null {
  if (!/^[a-z]{3}$/i.test(iso6393)) return null;
  try {
    return Intl.getCanonicalLocales(iso6393.toLowerCase())[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * The name of a stored tag in the reader's languages ("Norwegian" for `no`), or null when the
 * browser has no name for it. ⚠ Only for showing: the stored value is always the tag itself.
 *
 * @param tag the stored BCP-47 tag
 * @param locales the languages to name it in; the browser's own when absent
 */
export function contactLanguageName(tag: string, locales?: readonly string[]): string | null {
  if (!tag.trim()) return null;
  try {
    const name = new Intl.DisplayNames(locales ? [...locales] : undefined, { type: "language", fallback: "none" }).of(tag.trim());
    return name && name !== tag.trim() ? name : null;
  } catch {
    return null;
  }
}

/**
 * Where one catalogue entry is read: the entry's own address.
 *
 * @param entity the entry's address, as the language search returned it
 */
export function languageEntryReadUrl(entity: string): string {
  return entity;
}
