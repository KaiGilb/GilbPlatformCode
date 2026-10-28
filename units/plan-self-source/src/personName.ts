// A person's name as MyNet builds it from the given and the family name.

/** The person's name as MyNet builds it: given, a space, family; either may be empty. */
export function joinPersonName(given: string, family: string): string {
  return [given.trim(), family.trim()].filter(Boolean).join(" ");
}
