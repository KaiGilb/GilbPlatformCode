/**
 * The four language activities, in display order.
 * `id` is the term to store. `label` is the words on the button.
 * Do not add a fifth here, and do not store the label in place of the id.
 */
export const LANGUAGE_ACTIVITIES = [
  { id: "t:SpeakOrSignLanguage", label: "Speak or sign" },
  { id: "t:UnderstandSpokenOrSignedLanguage", label: "Understand" },
  { id: "t:ReadLanguage", label: "Read" },
  { id: "t:WriteLanguage", label: "Write" },
] as const;

/**
 * Join activity labels into one sentence.
 * Blank labels (nothing but space) are dropped. Survivors are not trimmed.
 * One label is returned as it was, including its spaces, and its first letter is not lowered.
 * Two or more: every label but the last, separated by a comma and a space, then " and ",
 * then the last label with only its first character lowercased.
 */
export function activityPhrase(labels: readonly string[]): string {
  const words = labels.filter((label) => label.trim() !== "");
  if (words.length === 0) return "";
  if (words.length === 1) return words[0]!;
  const head = words.slice(0, -1).join(", ");
  const last = words[words.length - 1]!;
  const tail = last.charAt(0).toLowerCase() + last.slice(1);
  return `${head} and ${tail}`;
}
