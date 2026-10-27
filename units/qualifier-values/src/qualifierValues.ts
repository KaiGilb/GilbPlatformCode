export const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The exact string a level stores for "every value of this qualifier". */
export const ALL_VALUE = "ALL";

/** The values a level holds for one qualifier: [] when unset, one for a single pick, 2+ for a set. */
export function qualifierValues(v: string | string[] | undefined | null): string[] {
  if (Array.isArray(v)) return v.map((x) => x.trim()).filter(Boolean);
  return typeof v === "string" && v.trim() ? [v.trim()] : [];
}

/** The inverse of {@link qualifierValues}: "" for none, a string for one, an array for 2+. ALL is exclusive. */
export function packQualifierValues(list: readonly string[]): string | string[] {
  const seen: string[] = [];
  for (const raw of list) {
    const t = raw.trim();
    if (t && !seen.some((x) => eq(x, t))) seen.push(t);
  }
  const rest = seen.filter((x) => !eq(x, ALL_VALUE));
  if (rest.length !== seen.length && rest.length === 0) return ALL_VALUE;
  if (rest.length !== seen.length) return rest.length > 1 ? rest : rest[0]!;
  return seen.length > 1 ? seen : (seen[0] ?? "");
}
