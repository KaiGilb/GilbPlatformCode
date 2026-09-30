/**
 * The two searchable name fields. Exactly these two words.
 * A third field is not added here. Organisation, title, email, and skill
 * are not name fields, even when a profile screen shows them beside a name.
 */

export const NAME_FIELDS = ["given-name", "family-name"] as const;

/** The wire spelling of a searchable name field. Exactly two. */
export type NameFieldKey = (typeof NAME_FIELDS)[number];

/**
 * True only for the two words, by exact equality.
 * Not a prefix. Not a trim. Not a case fold.
 */
export function isNameFieldKey(value: unknown): value is NameFieldKey {
  return value === "given-name" || value === "family-name";
}

/**
 * Profile field type to the wire name-claim field.
 * Only the two words. Every other type returns null, which means
 * "do not publish a name claim", not "this profile has no name".
 */
export function nameFieldKeyFromProfileType(type: string): NameFieldKey | null {
  return isNameFieldKey(type) ? type : null;
}
