/** Bare type name from a short name, a CURIE, or an address. Does not fetch. */
export function normalizeTypeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  if (s.startsWith("veda:")) s = s.slice(5);
  const slashT = s.lastIndexOf("/t/");
  if (slashT >= 0) s = s.slice(slashT + 3);
  if (s.startsWith("t:")) s = s.slice(2);
  s = s.replace(/\.png$/i, "");
  if (!s || s.includes("/")) return null;
  return s;
}
