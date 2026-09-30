/**
 * The separator in front of an instruction body when a tag token was written
 * into the sentence: space, em dash (U+2014), space.
 *
 * A hyphen-minus (` - `) is not this separator. An en dash (U+2013) is not
 * this separator. The role date line uses an en dash. This one does not.
 * Do not "correct" them to match.
 */
export const INSTRUCTION_PREFIX_SEPARATOR = " \u2014 ";

/**
 * Detect a leading token: no whitespace inside it, not starting with `[[`,
 * then `INSTRUCTION_PREFIX_SEPARATOR`.
 *
 * Returns null when that shape is not there. Returns the token and the text
 * after the separator when it is.
 *
 * This does not decide that the token is the record's tag. A screen that
 * shows a tag pill must already have the tag on the record (`unitTag` or
 * `a:unitTag`), and may remove the token from the sentence only when that
 * stored tag is equal to this token. If the record has no tag, keep the
 * whole sentence, including this token. Calling this function and then
 * showing `tag` as the pill invents a tag the record does not have.
 */
export function liftInstructionPrefix(instruction: string): { tag: string; body: string } | null {
  const sepIdx = instruction.indexOf(INSTRUCTION_PREFIX_SEPARATOR);
  if (sepIdx <= 0) return null;
  const candidate = instruction.slice(0, sepIdx);
  if (/\s/.test(candidate) || candidate.startsWith("[[")) return null;
  return { tag: candidate, body: instruction.slice(sepIdx + INSTRUCTION_PREFIX_SEPARATOR.length) };
}
