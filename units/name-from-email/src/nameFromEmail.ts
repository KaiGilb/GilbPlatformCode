/**
 * A display name guessed from the local part of an email, for a signup that
 * has no name yet.
 *
 * Only two shapes are accepted. Everything else is `{}`. Do not fill the
 * gap with the mailbox, the domain, or the first word you can see.
 */

/** Upper-cases the first character only. The rest is left as typed. */
export function capitalizeFirst(value: string): string {
  const first = value[0];
  return first ? first.toUpperCase() + value.slice(1) : value;
}

/**
 * First and last from the local part (the text before `@`).
 *
 * - Exactly two tokens of letters, split by `.` or `_` or `-`, tried in
 *   that order: first separator that yields two letter-only tokens wins.
 *   `lars.larson` → Lars / Larson. The tokens are lowercased, then the
 *   first letter of each is uppercased.
 * - One token of letters only: first name, and no last name key.
 *   `lars` → `{ firstName: "Lars" }`. A last name is not invented.
 * - More than two pieces, a digit, or any other character: `{}`.
 *
 * The domain is ignored. `undefined` and a missing local part are `{}`.
 * There is no `lastName` key when there is no last name. Do not treat a
 * missing key as an empty string you then save.
 */
export function nameFromEmail(email: string | undefined): { firstName?: string; lastName?: string } {
  const local = (email ?? "").split("@")[0] ?? "";
  if (!local) return {};
  for (const sep of [".", "_", "-"] as const) {
    if (!local.includes(sep)) continue;
    const tokens = local.split(sep);
    if (tokens.length !== 2) continue;
    const [a, b] = tokens;
    if (!a || !b) continue;
    if (!/^[A-Za-z]+$/.test(a) || !/^[A-Za-z]+$/.test(b)) continue;
    return {
      firstName: capitalizeFirst(a.toLowerCase()),
      lastName: capitalizeFirst(b.toLowerCase()),
    };
  }
  if (/^[A-Za-z]+$/.test(local)) {
    return { firstName: capitalizeFirst(local.toLowerCase()) };
  }
  return {};
}
