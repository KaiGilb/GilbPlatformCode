/**
 * Turns a stored label into one lower-case hyphenated word.
 *
 * Ends are trimmed. Each run of whitespace becomes one hyphen. Letters are
 * lowered with `toLowerCase()`, not `toLocaleLowerCase()`, so this does not
 * follow the machine's locale. Punctuation stays. A hyphen that was already
 * there stays, so `a- b` becomes `a--b`. Existing hyphens are not collapsed.
 *
 * This is not a catalogue of relation verbs, and it does not decide whether a
 * relation is directed. The app keeps that list beside the live catalogue.
 * Pass the label you already have. An empty string stays empty.
 */

export function normalizeLabel(aLabel: string): string {
  return aLabel.trim().toLowerCase().replace(/\s+/g, "-");
}
