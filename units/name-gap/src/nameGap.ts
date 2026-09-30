/**
 * Whether a found person is still missing a given name or a family name.
 *
 * This is not an access decision. It only says whether asking the card might
 * still add a name. The card, not this function, decides what the viewer may see.
 *
 * A name is a string that is not empty after trim. A space is not a name.
 * Either side missing is enough. The other side being present does not save it.
 */

function present(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * True when `given` or `family` is not a non-blank string.
 *
 * A number is not a name. Null and undefined are not names.
 * Both sides present is false. Do not also require that the person was found
 * by skill. That older test skipped people who already had one name.
 */
export function needsNameRecovery(person: { given?: unknown; family?: unknown }): boolean {
  return !present(person.given) || !present(person.family);
}
