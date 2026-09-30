/**
 * Is this string a vault address, and if not, what is wrong with it?
 *
 * A vault address is `https://<host>/<segment>` with nothing after the segment.
 * The segment is `base` or `vault`. One vault has one of those, not a choice
 * between them. User vaults use `vault`. Platform vaults use `base`.
 * This check admits both. It does not decide which one a given host uses.
 *
 * A WebID (`…/i`) and a principal (`…/base/p/…` or `…/vault/p/…`) are not vaults.
 * A record (`…/e/…`) is not a vault. A trailing slash is not a vault.
 */

/** Exactly `https://<host>/base` or `https://<host>/vault`. Optional port. Nothing after. */
export const VAULT_ID_RE = /^https:\/\/[a-z0-9.-]+(?::\d+)?\/(?:base|vault)$/i;

const DEFAULT_VAULT_EXAMPLE = "https://<host>/vault";

function webIdToVaultGuess(webId: string): string {
  try {
    return `${new URL(webId).origin}/vault`;
  } catch {
    return DEFAULT_VAULT_EXAMPLE;
  }
}

/**
 * Null when `value` is a vault address. Otherwise a sentence.
 * The WebID sentence names that host's `/vault`, not a copied example.
 */
export function vaultIdProblem(value: string): string | null {
  const v = value.trim();
  if (v === "") return "Enter a vault address.";
  if (VAULT_ID_RE.test(v)) return null;
  if (/\/i\/?$/.test(v)) {
    return `That is a WebID, not a vault. Use the vault itself — e.g. ${webIdToVaultGuess(v)}`;
  }
  if (/\/(?:base|vault)\/p\/[^/]+$/.test(v)) {
    return "That is a principal (a person), not a vault. A reach edge is granted VAULT → VAULT; use the vault address itself — nothing after /vault.";
  }
  if (/^https:\/\//i.test(v)) {
    return "A vault address looks like https://<host>/vault — nothing after it. Platform vaults end in /base instead.";
  }
  return "A vault address must start with https:// and end in /vault (or /base for a platform vault).";
}

/**
 * A grantee for a principal-keyed grant. Null means "plausible enough to send".
 * Empty is rejected. A value that does not start with `https://` is rejected.
 * Any other `https://` value is accepted, including a bad path. This is not
 * {@link vaultIdProblem}. Do not use it to decide that an address is a vault.
 *
 * `example` is the address named in the rejection sentence. The default is
 * `https://<host>/vault`. Pass the app's own example if the sentence must name
 * a real host. This package does not contain one.
 */
export function principalGranteeProblem(
  value: string,
  example = DEFAULT_VAULT_EXAMPLE,
): string | null {
  const v = value.trim();
  if (v === "") return "Enter a WebID, principal, or vault address.";
  if (!/^https:\/\//i.test(v)) {
    return `Use a full https:// vault address — e.g. ${example}.`;
  }
  return null;
}
