const CODE = /^\+\d{1,3}$/;

/** Codes on a country document. One code may arrive as a string. Two stay an array. */
export function callingCodesOf(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string" || !CODE.test(item)) continue;
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

/** Split a stored phone at the first space. No space means the code is not guessed. */
export function splitPhone(value: string): { dial: string; national: string } {
  const trimmed = value.trim().replace(/^tel:/i, "");
  if (!trimmed.startsWith("+")) return { dial: "", national: trimmed };
  const body = trimmed.slice(1);
  const space = body.search(/\s/);
  if (space < 1) return { dial: "", national: trimmed };
  const dial = body.slice(0, space).replace(/\D/g, "");
  if (!dial) return { dial: "", national: trimmed };
  return { dial, national: body.slice(space + 1).trim() };
}

export function joinPhone(dial: string, national: string): string {
  const d = dial.replace(/\D/g, "");
  const n = national.trim();
  if (!d && !n) return "";
  if (!d) return n;
  return n ? `+${d} ${n}` : `+${d}`;
}

export function claimLabeledHome<T extends { label: string }>(claims: readonly T[]): T | null {
  return claims.find((c) => c.label.trim().toLowerCase() === "home") ?? null;
}

/**
 * Which address may prefill a phone.
 * Home wins. One address is used even without that label. Several, and no home, is not a guess.
 */
export function claimForPhonePrefill<T extends { label: string }>(claims: readonly T[]): T | null {
  const home = claimLabeledHome(claims);
  if (home) return home;
  if (claims.length === 1) {
    const only = claims[0];
    return only ?? null;
  }
  return null;
}
