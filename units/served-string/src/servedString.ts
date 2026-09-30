/**
 * A string fact, or undefined when it is absent.
 * Absent means: the key is missing, the value is not a string, or the trimmed
 * value is empty. The returned string is NOT trimmed. Spaces around a real
 * word are kept. Use this when blank must not look like a stored value.
 */
export function servedString(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  if (typeof value !== "string") return undefined;
  return value.trim() === "" ? undefined : value;
}

/**
 * The steward note, from `appliesTo` or `a:appliesTo`.
 * The framed key wins. The result is trimmed. Blank is undefined, not "".
 * This does not decide who the steward is. It only reads the note that is there.
 */
export function documentAppliesTo(source: Record<string, unknown>): string | undefined {
  const raw = servedString(source, "appliesTo") ?? servedString(source, "a:appliesTo");
  if (raw === undefined) return undefined;
  const note = raw.trim();
  return note === "" ? undefined : note;
}
