/**
 * The line for one unit's declared role.
 *
 * Three states, and they are not interchangeable:
 *
 * - `undefined` — this family has no role field. Draw nothing.
 * - `null` — this family has roles, and this unit declared none. The line is
 *   exactly "Role not declared".
 * - a string — the vault holds that token. Four tokens have a display spelling.
 *   Any other string is shown as stored.
 *
 * The role is not inferred from a heading or from a filled-in body.
 * An absent role is not the token `blank`.
 */

/** The absence line. Do not rephrase it. */
export const UNIT_ROLE_NOT_DECLARED = "Role not declared";

/**
 * Display spelling of four tokens.
 * `counterExample` is the only one that changes: it is shown as `counter-example`.
 * This map does not decide whether a token is legal. A token that is not here is
 * still shown. Adding a key here does not make a token legal in the vault.
 */
export const SPECIMEN_ROLE_LABELS: Readonly<Record<string, string>> = {
  blank: "blank",
  example: "example",
  counterExample: "counter-example",
  guidance: "guidance",
};

/** The display spelling of a token. Unknown tokens are returned unchanged. Case-sensitive. */
export function specimenRoleLabel(level: string): string {
  return SPECIMEN_ROLE_LABELS[level] ?? level;
}

/**
 * The line to draw, or `null` when nothing should be drawn.
 *
 * - `undefined` → `null` (the family has no role field).
 * - `null` → `"Role not declared"`.
 * - `""` → `""`. An empty string is a stored token, not an absence. It is not the absence line.
 * - any other string → {@link specimenRoleLabel}. Not trimmed.
 */
export function specimenRoleLine(role: string | null | undefined): string | null {
  if (role === undefined) return null;
  if (role === null) return UNIT_ROLE_NOT_DECLARED;
  return specimenRoleLabel(role);
}
