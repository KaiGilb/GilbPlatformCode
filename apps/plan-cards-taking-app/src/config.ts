// The ONE place a host lives. Nothing else in src/ may name one (check-host-agnostic exempts this file only).

/**
 * Where the sign-in code is asked for and checked. Always the Gilb sign-in host, never the vault's own host: a vault host
 * accepts the request for a code and then refuses it. The vault's host is only where records are read and written (the
 * `origin` setting).
 */
export const SIGNIN_ORIGIN = "https://id.gilb.com";
