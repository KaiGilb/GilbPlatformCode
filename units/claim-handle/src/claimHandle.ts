/**
 * Two kinds of employment and title token, which must never be the same string.
 *
 * A positional token is derived from a slot number: emp1, emp2, t0, t1.
 * A minted token is not derived from a number: it starts with empx- or ttlx-.
 * The title minter is not in this unit. ttlx- is recognised so a title token
 * from another writer is still refused as a position.
 */

export class DisjointTokenSpaceViolation extends Error {
  constructor(token: string, detail: string) {
    super(
      `Disjoint token space VIOLATED — the token ${JSON.stringify(token)} is a lawful value of ` +
        `both the claim-slot-key type and the positional-handle type. ${detail}`,
    );
    this.name = "DisjointTokenSpaceViolation";
  }
}

const POSITIONAL_EMPLOYMENT_HANDLE = /^emp\d+$/;
const POSITIONAL_TITLE_HANDLE = /^t\d+$/;
const MINTED_EMPLOYMENT_PREFIX = "empx-";
const MINTED_TITLE_PREFIX = "ttlx-";

/** True for emp1, emp12, t0, t1. Not for empx- or ttlx-. Not for emp or t alone. */
export function isPositionalHandle(token: string): boolean {
  return POSITIONAL_EMPLOYMENT_HANDLE.test(token) || POSITIONAL_TITLE_HANDLE.test(token);
}

/** True when the token starts with empx- or ttlx-. The rest is not checked. */
export function isMintedHandle(token: string): boolean {
  return token.startsWith(MINTED_EMPLOYMENT_PREFIX) || token.startsWith(MINTED_TITLE_PREFIX);
}

/** Throws when one token is in both spaces. Does not return false. */
export function assertDisjointSpaces(token: string): void {
  if (isPositionalHandle(token) && isMintedHandle(token)) {
    throw new DisjointTokenSpaceViolation(
      token,
      "It matches a positional pattern AND carries a minted prefix.",
    );
  }
}

/** Throws unless the token is minted and not positional. */
export function assertMintedHandle(token: string): void {
  assertDisjointSpaces(token);
  if (!isMintedHandle(token)) {
    throw new DisjointTokenSpaceViolation(
      token,
      "It is not in the minted space at all, so it may not be stored as an a:claimSlotKey.",
    );
  }
  if (isPositionalHandle(token)) {
    throw new DisjointTokenSpaceViolation(
      token,
      "A positional derivation can produce it, so minting it as an a:claimSlotKey would let a " +
        "later read name a slot the store already minted.",
    );
  }
}

/** Throws unless the token is positional and not minted. */
export function assertPositionalHandle(token: string): void {
  assertDisjointSpaces(token);
  if (isMintedHandle(token)) {
    throw new DisjointTokenSpaceViolation(
      token,
      "A positional derivation produced a token in the MINTED space, which is the collision " +
        "arriving from the other direction.",
    );
  }
}

/** Supplies the random tail of a minted employment handle. Tests pass their own. */
export type TokenSource = () => string;

const defaultTokenSource: TokenSource = () => {
  const bytes = new Uint8Array(9);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += byte.toString(36).padStart(2, "0");
  return out.slice(0, 12);
};

/** An employment identity. Always starts with empx-. Never emp plus a number. */
export function mintEmploymentHandle(source: TokenSource = defaultTokenSource): string {
  const handle = `${MINTED_EMPLOYMENT_PREFIX}${source()}`;
  assertMintedHandle(handle);
  return handle;
}

function assertWholeIndex(index: number, min: number): void {
  if (!Number.isInteger(index) || index < min) {
    throw new DisjointTokenSpaceViolation(
      String(index),
      `A positional index must be a whole number >= ${min}; a fractional or non-finite index ` +
        `yields a token in neither token space, which could then be stored as an identity.`,
    );
  }
}

/** emp1, emp2, … Index 1 is the first. 0, 1.5, and NaN throw. */
export function positionalEmploymentHandle(index1Based: number): string {
  assertWholeIndex(index1Based, 1);
  const handle = `emp${index1Based}`;
  assertPositionalHandle(handle);
  return handle;
}

/** t0, t1, … Index 0 is the first title. A negative or fractional index throws. */
export function positionalTitleHandle(index0Based: number): string {
  assertWholeIndex(index0Based, 0);
  const handle = `t${index0Based}`;
  assertPositionalHandle(handle);
  return handle;
}

/**
 * The next empN that is in neither set.
 * `reserved` is every key a failed delete may still be holding. Do not omit it.
 */
export function nextFreeEmploymentHandle(
  used: ReadonlySet<string>,
  reserved: ReadonlySet<string> = new Set(),
): string {
  let n = 1;
  while (used.has(positionalEmploymentHandle(n)) || reserved.has(positionalEmploymentHandle(n))) n += 1;
  return positionalEmploymentHandle(n);
}

/** The next tN that is not already used. Starts at t0. */
export function nextFreeTitleHandle(used: ReadonlySet<string>): string {
  let n = 0;
  while (used.has(positionalTitleHandle(n))) n += 1;
  return positionalTitleHandle(n);
}
