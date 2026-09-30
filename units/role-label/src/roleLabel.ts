/**
 * Turn a role token into a short label. Spacing and a capital letter only.
 * It does not look up a meaning. An empty role is the word Member.
 *
 * The prefix `role:` is removed only when those five characters are lowercase
 * and sit at the start. `ROLE:` is not removed.
 * The result is sentence case: the first character upper, the rest lower.
 * It is not title case. `assigned_to` becomes `Assigned to`, not `Assigned To`.
 */
export function roleLabel(role: string): string {
  const bare = role.replace(/^role:/, "").trim();
  if (!bare) return "Member";
  const spaced = bare
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  const first = spaced.charAt(0);
  return first.toUpperCase() + spaced.slice(1);
}
