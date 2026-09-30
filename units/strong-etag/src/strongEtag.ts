/**
 * The validator to send back with a later write.
 *
 * Null, undefined, and a blank string become null. One leading weak marker
 * `W/` or `w/` is removed, then the rest is trimmed. Quotes are kept. A second
 * `W/` is kept. A `W/` that is not at the start is kept. The marker match is
 * only those two letters and the slash. `WW/` is not a weak marker.
 *
 * Nothing else is changed. The result is not lower-cased, not unquoted, and
 * not checked for a hash shape. An empty result after the strip is null.
 */

export function normalizeStrongEtag(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const strong = /^[Ww]\//.test(trimmed) ? trimmed.slice(2).trim() : trimmed;
  return strong === "" ? null : strong;
}
