/**
 * The rules of a person's language list, pure: which listed language the contact-language tag marks, the list with
 * the marked one first, the tag that moving the mark writes, the rung a legacy value takes when it is listed, and how
 * a stored tag reads.
 *
 * - The listed entry whose tag, or whose own three-letter ISO 639-3 code, EQUALS the stored value (case aside) is
 *   marked, the first such in list order; else the first listed entry with the SAME PRIMARY SUBTAG (`pt-BR` marks
 *   Portuguese).
 * - Moving the mark writes the entry's tag; when ANOTHER listed entry shares its primary subtag, the entry's own
 *   three-letter code is written instead, so the rule finds exactly that entry.
 * - A stored value that matches no listed entry is shown as the marked row and is never dropped, hidden or rewritten.
 */
import { contactLanguageName, sameLanguageTag } from "@kaigilb/gilbplatformcode-language-entry";
import type { LanguageEntryInfo } from "@kaigilb/gilbplatformcode-language-entry";

/** An entry of a person's list, as far as the rules need it. */
export interface ListedEntry {
  id: string;
  language: string;
}

export interface LanguageView<E extends ListedEntry> {
  entry: E;
  info: LanguageEntryInfo;
  /** This entry is the contact language. At most one view is marked. */
  marked: boolean;
}

export interface OrderedLanguages<E extends ListedEntry> {
  /** The marked entry first, the rest in the order given. */
  views: LanguageView<E>[];
  /** The stored contact language when NO listed entry matches it: shown as the marked row, never dropped. */
  legacyTag: string | null;
}

/**
 * Which listed entry the stored contact language marks, or -1. Pure. The rule (see the header): the FIRST entry
 * whose tag or three-letter code equals the stored value; else the first with the same primary subtag.
 */
export function markedIndex(infos: readonly LanguageEntryInfo[], contactTag: string): number {
  const tag = contactTag.trim().toLowerCase();
  if (tag === "") return -1;
  const exact = infos.findIndex((i) => (i.tag !== null && i.tag.toLowerCase() === tag) || (i.code !== null && i.code === tag));
  if (exact >= 0) return exact;
  return infos.findIndex((i) => i.tag !== null && sameLanguageTag(i.tag, tag));
}

/**
 * The list as it is shown: the entry the contact language marks comes first. Pure.
 *
 * @param list the person's entries, in the order to keep for the unmarked ones
 * @param infos what each entry's catalogue document said; an entry with none is listed unmarked, by address
 * @param contactTag the stored `a:contactLanguage` ("" for none)
 */
export function orderLanguages<E extends ListedEntry>(
  list: readonly E[],
  infos: ReadonlyMap<string, LanguageEntryInfo>,
  contactTag: string,
): OrderedLanguages<E> {
  const tag = contactTag.trim();
  const views: LanguageView<E>[] = list.map((entry) => ({
    entry,
    info: infos.get(entry.language) ?? { uri: entry.language, label: entry.language.slice(entry.language.lastIndexOf("/") + 1), tag: null, code: null, countries: [] },
    marked: false,
  }));
  // ONE mark (the term is single-valued, so two marks are never stored). The rule is `markedIndex`'s.
  const at = markedIndex(views.map((v) => v.info), tag);
  if (at >= 0) views[at]!.marked = true;
  const marked = views.filter((v) => v.marked);
  const rest = views.filter((v) => !v.marked);
  return { views: [...marked, ...rest], legacyTag: tag !== "" && at < 0 ? tag : null };
}

/**
 * What moving the mark to an entry writes: the entry's tag (its own three-letter code when ANOTHER listed entry
 * shares its primary subtag, so the mark names this entry and no other), at the entry's own rung (the card shows
 * the mark only to a reader who can also read the marked entry). `null` when the entry has no tag (it cannot be
 * marked). A held card has no rung, so its mark carries none.
 *
 * @param others the infos of the person's OTHER listed entries (the entry itself may be among them: it is skipped by address)
 */
export function contactTagForMark(
  info: LanguageEntryInfo,
  access: string | null,
  others: readonly LanguageEntryInfo[] = [],
): { tag: string; access: string | null } | null {
  if (!info.tag) return null;
  const shared = others.some((o) => o.uri !== info.uri && o.tag !== null && sameLanguageTag(o.tag, info.tag!));
  return { tag: shared && info.code ? info.code : info.tag, access };
}

/**
 * The rung a legacy contact language takes when it is listed: the rung the field carries, ⛔ never a wider
 * one. A rung that cannot be told is Private.
 */
export function legacyListingAccess(access: string | null | undefined): string {
  return access && access.trim() ? access : "private";
}

/**
 * How a stored contact language reads on the card: "Norwegian (no)", or the stored value as it is
 * when the browser cannot name it (a value another app wrote is ⛔ never hidden or changed).
 */
export function contactLanguageDisplay(value: string, locales?: readonly string[]): string {
  const tag = value.trim();
  const name = contactLanguageName(tag, locales);
  return name ? `${name} (${tag})` : value;
}
