/**
 * Cycle214 s8 — "Languages": picks ONE language from the shared catalogue (GilbVeda `t:HumanLanguage`) to add to
 * the list, and hands back the entry's address and name. ⛔ What was typed is never stored: only a picked entry.
 * The same search and the same box as the contact-language picker it replaces (`ContactLanguagePicker`), minus the
 * tag conversion: the list stores the ENTRY, and the tag is the card's own business (`language-order`).
 * A language already listed is not offered.
 */
import { useCallback } from "react";
import { LANGUAGE_SEARCH_DEBOUNCE_MS, LANGUAGE_SEARCH_LIST_CHARS, searchLanguagesRemote } from "@kaigilb/gilbplatformcode-language-search";
import { PickerBox, type PickerOption } from "@kaigilb/gilbplatformcode-picker-box";

export function LanguageEntryPicker({
  excludeUris,
  onPick,
  onCancel,
}: {
  /** Entries already on the list. */
  excludeUris: readonly string[];
  onPick: (entity: string, label: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const excluded = excludeUris.join("\n");
  const search = useCallback(
    async (q: string, signal: AbortSignal): Promise<PickerOption[]> =>
      (await searchLanguagesRemote(q, { signal })).hits
        .filter((h) => !excluded.split("\n").includes(h.entity))
        .map((h) => ({ id: h.entity, label: h.label })),
    [excluded],
  );
  return (
    <PickerBox
      label="Add a language"
      placeholder="Search for a language"
      current=""
      search={search}
      minChars={LANGUAGE_SEARCH_LIST_CHARS}
      debounceMs={LANGUAGE_SEARCH_DEBOUNCE_MS}
      onChoose={(o) => onPick(o.id, o.label)}
      onCancel={onCancel}
    />
  );
}
