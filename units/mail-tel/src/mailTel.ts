/**
 * Add or remove a mailto: or tel: prefix.
 * The prefix match is case-sensitive. "Mailto:" is not "mailto:".
 * Nothing is trimmed, except the spaces removed inside toTel when the prefix is added.
 */

/** Keep a value that already starts with mailto:. Otherwise put mailto: in front, even when empty. */
export function toMailto(email: string): string {
  return email.startsWith("mailto:") ? email : `mailto:${email}`;
}

/** Drop one leading mailto:. Undefined stays undefined. Any other string is returned as passed. */
export function fromMailto(value: string | undefined): string | undefined {
  return value?.startsWith("mailto:") ? value.slice("mailto:".length) : value;
}

/**
 * Keep a value that already starts with tel:.
 * Otherwise remove every whitespace character, then put tel: in front.
 */
export function toTel(phone: string): string {
  return phone.startsWith("tel:") ? phone : `tel:${phone.replace(/\s+/g, "")}`;
}

/** Drop one leading tel:. Spaces that were stored after the prefix stay. Undefined stays undefined. */
export function fromTel(value: string | undefined): string | undefined {
  return value?.startsWith("tel:") ? value.slice("tel:".length) : value;
}
