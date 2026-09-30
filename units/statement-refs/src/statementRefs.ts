/** One span of statement text. `ref` is a token a reader may follow. This module does not resolve it. */
export interface StatementSegment {
  kind: "text" | "ref";
  value: string;
}

/**
 * Split statement text into plain spans and reference spans.
 *
 * Two forms, and no third:
 *
 * - `[[Some.Target]]` becomes `{ kind: "ref", value: "Some.Target" }`.
 *   The brackets are not part of the value. An empty `[[]]` is not a ref.
 * - A bare `http://` or `https://` address becomes a ref of that address.
 *   Trailing sentence punctuation `.,;:!?) ] }` is left in the following
 *   text span, not glued onto the address.
 *
 * `javascript:`, `data:`, and `vbscript:` are not addresses here. They stay
 * inside a text span. This function never returns something to navigate to.
 * The screen that opens a ref decides that, after this split.
 *
 * A `javascript:` string written inside `[[ ]]` is still a ref, because the
 * brackets matched. Do not open it just because the kind is `ref`.
 */
export function parseStatementRefs(raw: string): StatementSegment[] {
  const segments: StatementSegment[] = [];
  if (raw === "") return segments;
  const pattern = /\[\[([^\]]*)\]\]|(https?:\/\/[^\s<>"'`]+)/gi;
  let cursor = 0;
  for (let m = pattern.exec(raw); m !== null; m = pattern.exec(raw)) {
    let value = m[1] !== undefined ? m[1] : (m[2] ?? "");
    let end = m.index + m[0].length;
    if (m[1] === undefined) {
      const trimmed = value.replace(/[.,;:!?)\]}]+$/, "");
      end -= value.length - trimmed.length;
      value = trimmed;
    }
    if (m.index > cursor) segments.push({ kind: "text", value: raw.slice(cursor, m.index) });
    if (value !== "") segments.push({ kind: "ref", value });
    cursor = end;
    pattern.lastIndex = end;
  }
  if (cursor < raw.length) segments.push({ kind: "text", value: raw.slice(cursor) });
  return segments;
}
