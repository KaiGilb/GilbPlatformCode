/**
 * True when the app's host and the vault server's host differ.
 * Host includes a non-default port. The scheme is ignored.
 * An address that cannot be read returns false: this function will not claim the cookie may fail
 * when it could not read the two addresses.
 */
export function bridgeMayNotApply(appOrigin: string, baseOrigin: string): boolean {
  try {
    return new URL(appOrigin).host !== new URL(baseOrigin).host;
  } catch {
    return false;
  }
}
