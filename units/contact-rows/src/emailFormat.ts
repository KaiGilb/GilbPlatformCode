/**
 * The email format check, name@domain.tld. An email address has something
 * before one "@", and after it a domain with at least one "." and no spaces. Empty is not checked
 * here: an empty row is "no address", which is allowed.
 */
const EMAIL_FORMAT = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function isEmailFormat(value: string): boolean {
  return EMAIL_FORMAT.test(value.trim());
}

/** The words shown under an address that does not fit. */
export const EMAIL_FORMAT_HINT = "That is not an email address. Use name@domain.com.";
