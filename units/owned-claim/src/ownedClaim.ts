/**
 * Which already-read claims belong to one employment.
 * This does not mint a slot and it does not move a claim.
 * Slot spelling is the job of the claim-slot unit. These two functions
 * only select and slice.
 */

export interface OwnedClaim {
  kind: string;
  slot: string;
}

/**
 * The claims one employment owns.
 *
 * A company claim matches only when `slot` is exactly `empKey`.
 * A job-title claim matches when `slot` starts with `empKey` and a colon.
 * Every other kind is ignored, even when the slot text is the same.
 *
 * No trim. Order is kept. The returned objects are the same objects
 * that were passed in.
 */
export function claimsForEmployment<T extends OwnedClaim>(
  claims: readonly T[],
  empKey: string,
): T[] {
  return claims.filter(
    (claim) =>
      (claim.kind === "company" && claim.slot === empKey) ||
      (claim.kind === "job-title" && claim.slot.startsWith(`${empKey}:`)),
  );
}

/**
 * The title token inside a job-title slot.
 *
 * Everything after `empKey` and the one colon that follows it.
 * `emp1` and `emp1:t0:extra` yield `t0:extra`. A later colon stays.
 * This does not check that the slot actually starts with `empKey`.
 * A wrong key still slices at `empKey.length + 1`.
 */
export function titleTokenOfSlot(slot: string, empKey: string): string {
  return slot.slice(empKey.length + 1);
}
