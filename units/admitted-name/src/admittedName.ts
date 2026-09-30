/**
 * A profile field, as far as a published name needs to see it.
 * `unadmitted: true` is the only flag that blocks publication.
 * There is no access rung on this type. Do not add one and then read it here.
 */
export interface AdmittedNameField {
  type: string;
  value: string;
  unadmitted?: true;
}

/**
 * True when this app may publish the field.
 * Only the exact flag `unadmitted: true` returns false.
 * A missing flag is admitted. Any other value is admitted, including false.
 * Do not infer this from the access rung. A closed rung and "nobody admitted this" are different.
 */
export function holderAdmittedField(field: { unadmitted?: true }): boolean {
  return field.unadmitted !== true;
}

/**
 * The given name and the family name that may be published, joined by one space.
 *
 * Pass `model.fields`, not the whole profile.
 * The first admitted field of type `given-name`, then the first admitted field of type `family-name`.
 * The first admitted field wins even when its trimmed value is blank. A later name does not fill that blank.
 * A blank trimmed value is left out of the join, so a missing given name does not leave a leading space.
 * Other types are ignored. The access rung is not read.
 */
export function displayName(fields: readonly AdmittedNameField[]): string {
  const named = (type: string): string =>
    fields.find((f) => f.type === type && holderAdmittedField(f))?.value.trim() ?? "";
  return [named("given-name"), named("family-name")].filter(Boolean).join(" ");
}
