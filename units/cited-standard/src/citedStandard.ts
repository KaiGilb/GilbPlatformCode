/**
 * Every standard one checklist question cites.
 *
 * The field is multiple. A question that cites one standard often arrives as
 * a string, and a question that cites two arrives as a list. Reading the field
 * as only a string drops the second citation. This is the one reader.
 *
 * Only `checksStandard` is read. `a:checksStandard` is not read. If the
 * document still has the raw key, the host maps it onto `checksStandard`
 * before calling this, or this returns an empty list.
 */

/**
 * The cited standards, in served order. `[]` when the question cites none.
 *
 * A string that is empty after trim is `[]`. Any other string is one entry,
 * and that entry is not trimmed. `"  a  "` is `["  a  "]`.
 * A list keeps strings that are not empty after trim, in order, and does not
 * trim them. A number, null, a missing field, and an object are `[]`.
 * A nested list is dropped, because it is not a string.
 */
export function checkedStandards(question: { checksStandard?: unknown }): string[] {
  const raw = question.checksStandard;
  if (typeof raw === "string") return raw.trim() === "" ? [] : [raw];
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === "string" && s.trim() !== "");
  return [];
}
