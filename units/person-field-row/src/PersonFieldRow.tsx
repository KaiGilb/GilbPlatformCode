/**
 * A person card's remaining plain field (a time zone, a web address, a level, an interest, ...): the master's label as the
 * sub-label, the value, tap to edit, saved through the CARD'S OWN SAVE (the same draft and versioned save every field of the card
 * uses), ⛔ not a second write path.
 *
 * ⛔ No field is named here. The field is the master's (its label, its spelling). The edit is a choice among members ONLY where
 * the term publishes a closed value set (`a:valueSet` on the attribute or the type it defines, read by term: `termValueSet`);
 * every other field is free text.
 * Three rows are PICKED, never typed, found by the field's TERM: the contact language and the time zone (from the host's pickers,
 * where it supplies them; otherwise a text box) and the birthday (day and month, year optional).
 */
import { useQuery } from "@tanstack/react-query";
import { FieldRow, type FieldPicker } from "@kaigilb/gilbplatformcode-field-row";
import { termValueSet } from "@kaigilb/gilbplatformcode-term-slots";

/** The rows that are picked, ⛔ never typed, by the term they hold. */
const PICKED_BY_TERM: Readonly<Record<string, FieldPicker>> = {
  contactLanguage: "contact-language",
  timeZone: "time-zone",
  birthday: "birthday",
};

export function PersonFieldRow({
  label,
  value,
  termName,
  readOnly,
  onCommit,
}: {
  label: string;
  value: string;
  /** The field's term name, to ask the master for its value set; null when not addressable. */
  termName: string | null;
  readOnly: boolean;
  onCommit: (value: string) => void;
}) {
  const set = useQuery({
    queryKey: ["mynet", "term-value-set", termName ?? ""],
    queryFn: () => termValueSet(termName!),
    enabled: !!termName,
    staleTime: Infinity,
  });
  return (
    <FieldRow
      label={label}
      value={value}
      readOnly={readOnly}
      options={set.data ?? null}
      picker={termName ? (PICKED_BY_TERM[termName] ?? null) : null}
      onCommitValue={onCommit}
    />
  );
}
