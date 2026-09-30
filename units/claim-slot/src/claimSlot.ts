/**
 * The claim kinds a profile field can carry.
 *
 * Exact strings. `company` and `job-title` are employment. They are not the
 * field-row types `org` and `title`. See {@link profileFieldClaimKindFromType}.
 */
export const PROFILE_FIELD_CLAIM_KINDS = [
  "email",
  "phone",
  "social",
  "profile-photo",
  "address",
  "company",
  "job-title",
] as const;

export type ProfileFieldClaimKind = (typeof PROFILE_FIELD_CLAIM_KINDS)[number];

/** True only for those seven strings. No trim. No case fold. */
export function isProfileFieldClaimKind(v: unknown): v is ProfileFieldClaimKind {
  return (
    v === "email" ||
    v === "phone" ||
    v === "social" ||
    v === "profile-photo" ||
    v === "address" ||
    v === "company" ||
    v === "job-title"
  );
}

/**
 * The claim kind of a profile field row.
 *
 * Only `email`, `phone`, `social`, and `address`. Exact. No trim.
 *
 * `org` and `title` return null. They are not unenforced. They are not field
 * rows. Employment is addressed by {@link employmentCompanySlot} and
 * {@link employmentJobTitleSlot}, under the kinds `company` and `job-title`.
 * Adding `org` or `title` here would make a field editor look as if it wrote
 * the employment claim. It does not.
 *
 * `company`, `job-title`, `profile-photo`, and `skill` also return null.
 * Photo and skill have their own writers.
 */
export function profileFieldClaimKindFromType(type: string): ProfileFieldClaimKind | null {
  if (type === "email" || type === "phone" || type === "social" || type === "address") {
    return type;
  }
  return null;
}

/**
 * The company slot is the employment key, unchanged.
 *
 * `employmentCompanySlot("emp1")` is `emp1`. `employmentCompanySlot("")` is
 * `""`. Nothing is trimmed and nothing is substituted. An empty key is still
 * returned. Do not build this string at the call site.
 */
export function employmentCompanySlot(empKey: string): string {
  return empKey;
}

/**
 * The job-title slot is `<empKey>:<titleKey>`.
 *
 * The colon is part of the slot. The store keeps the slot as one string. It
 * does not split on `:`. `employmentJobTitleSlot("emp1", "t0")` is `emp1:t0`.
 * Empty pieces are still joined: `employmentJobTitleSlot("", "t0")` is `:t0`.
 * No trim.
 */
export function employmentJobTitleSlot(empKey: string, titleKey: string): string {
  return `${empKey}:${titleKey}`;
}

/**
 * Which employment a claim slot belongs to.
 *
 * The kind is exact.
 *
 * - `company` → the slot itself. `""` becomes null. A slot that contains `:`
 *   is returned whole. It is not split. `"emp1:t0"` as a company slot is the
 *   employment key `emp1:t0`, which is probably a bug in the caller, not a
 *   title.
 * - `job-title` → the text before the first `:`. `emp1:t0` → `emp1`.
 *   `emp1:t0:extra` → `emp1`. `:t0` → null. `emp1:` → `emp1`.
 * - every other kind, including `email` → null. This is not a general slot
 *   parser.
 */
export function employmentKeyFromClaimSlot(
  kind: ProfileFieldClaimKind,
  slot: string,
): string | null {
  if (kind === "company") return slot || null;
  if (kind === "job-title") {
    const head = slot.split(":")[0];
    return head ? head : null;
  }
  return null;
}
