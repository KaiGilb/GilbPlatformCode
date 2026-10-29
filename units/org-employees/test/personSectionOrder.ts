// Test support: a copy of the person card's section order (the app's personName.ts, which is in no unit), kept so the organization order can be shown to differ from it.
export function personSectionOrder<T extends { slug: string }, S extends { slug: string }>(
  ordered: readonly T[],
  sections: readonly S[],
  nicknameSlug?: string | null,
): (T | S)[] {
  const lead = nicknameSlug ? 3 : 2;
  const taken = new Set(sections.map((s) => s.slug));
  return [...ordered.slice(0, lead), ...sections, ...ordered.slice(lead).filter((f) => !taken.has(f.slug))];
}
