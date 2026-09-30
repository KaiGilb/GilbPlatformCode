/**
 * First UTF-16 code unit only. The rest is unchanged, including "McLars".
 * Same rule as `capitalizeFirst` in units/name-from-email. Keep them in agreement.
 * An emoji can be two code units. Only the first unit is passed to `toUpperCase`.
 */
function capitalizeFirst(value: string): string {
  const first = value[0];
  return first === undefined ? value : first.toUpperCase() + value.slice(1);
}

/**
 * Capitalise a given name or a family name. Every other type is returned unchanged.
 * The type match is exact: `given-name` and `family-name`. `Given-name` is not a name field.
 * The value is not trimmed. An empty value stays empty.
 */
export function formatFieldValue(type: string, value: string): string {
  return type === "given-name" || type === "family-name" ? capitalizeFirst(value) : value;
}
