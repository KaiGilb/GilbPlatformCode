/**
 * One vCard text value, and one folded line.
 *
 * This is not a card builder. It does not choose EMAIL, TEL, or ADR.
 * It does not decide WORK or HOME. That purpose token is contact-purpose.
 *
 * Escape order is fixed: backslash, then newline, then comma, then semicolon.
 * A backslash inserted by an earlier step is not escaped again.
 * Only a real newline (U+000A) becomes a backslash and the letter n.
 * A carriage return is left as a carriage return. The two characters
 * backslash and n that were already in the text are not a newline.
 *
 * Folding uses JavaScript string length, which counts UTF-16 code units.
 * It does not count UTF-8 octets, and it does not count graphemes.
 * A comment in the app said "75 octets". The code uses `.length`.
 * Do not switch it to an octet counter. A line of 75 code units is not folded.
 * The first piece is 75. Each continuation is a space plus 74 code units.
 * The pieces are joined with CR LF.
 */

/** Escape backslash, newline, comma, and semicolon. Other characters stay. */
export function escapeVCardText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/**
 * Fold a line at 75 code units.
 * A line of length 75 or less is returned unchanged, with no CR LF added.
 * A longer line is cut, and each following piece starts with one space.
 */
export function foldVCardLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}
