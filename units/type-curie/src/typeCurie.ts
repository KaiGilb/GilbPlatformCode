/**
 * The bare name of a type spelling.
 *
 * - `t:Name` → `Name` (the `t:` is removed, nothing else is checked)
 * - `prefix:Name` when the prefix is letters and digits, and the name is
 *   letters, digits, `_`, or `-` → `Name`
 * - an address containing `/base/t/Name` → `Name`, decoded once
 * - anything else → the trimmed input, unchanged
 *
 * This is not `type-name`. That unit returns null when a slash remains, strips
 * a leading `veda:` and a trailing `.png`, and accepts `/t/` on any path.
 * This function does not do those things. A `/vault/t/Name` address is not
 * recognised here: it is returned whole.
 *
 * A broken percent-encoding in the `/base/t/` segment throws.
 */
export function typeLocalName(typeUri: string): string {
  const t = typeUri.trim();
  if (t.startsWith("t:")) return t.slice(2);
  const curie = t.match(/^[a-z][a-z0-9]*:([A-Za-z0-9_-]+)$/i);
  const curieName = curie?.[1];
  if (curieName) return curieName;
  const m = t.match(/\/base\/t\/([^/#?]+)/i);
  const pathName = m?.[1];
  if (pathName) return decodeURIComponent(pathName);
  return t;
}

function firstValue(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * One JSON-LD type value as a string.
 *
 * Accepts a string, a list (the first entry only; the rest are ignored), or
 * `{ "@id": string }`. Blank, missing, and any other shape return null.
 *
 * A value that already starts with `t:` is returned as trimmed, not rebuilt.
 * A value whose bare name differs from the whole string (an address, or a
 * `prefix:Name`) becomes `t:` plus that bare name. A bare word such as
 * `BrotherOf` stays `BrotherOf`. It does not gain a `t:`.
 */
export function typeCurieFromJsonLd(raw: unknown): string | null {
  const first = firstValue(raw);
  let s: string | null = null;
  if (typeof first === "string") s = first;
  else if (first && typeof first === "object" && "@id" in first) {
    const id = (first as { "@id": unknown })["@id"];
    if (typeof id === "string") s = id;
  }
  if (!s?.trim()) return null;
  const trimmed = s.trim();
  if (trimmed.startsWith("t:")) return trimmed;
  const local = typeLocalName(trimmed);
  if (local && local !== trimmed) return `t:${local}`;
  return trimmed;
}
