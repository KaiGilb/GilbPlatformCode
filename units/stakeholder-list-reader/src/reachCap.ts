// The reach cap of the one stakeholder list: one copy for every host.

/**
 * 🔴 THE REACH CAP: until the platform has a bulk route for links, ONE reach of the end of the list brings AT MOST 20 records,
 * counted across ALL held vaults together.
 *
 * Why: a screen that reaches an end costs about (held vaults with a next page) + (linked records in that reach) + (names in the
 * window). Measured: 1 vault × 20 linked records = 37-38 requests; 2 × 20 = 54-59; 3 × 20 = 77-80. The Tolerable
 * of `List.RequestsPerScreen` is 40, so a reach may bring at most about 20 linked records. Each linked record costs one resolver
 * request (no bulk route yet). When one exists, the resolves become one request per page and this cap can go.
 *
 * ⚠ Known edge: with more than 20 held vaults each vault still gets 1 record, so one reach brings one record per vault.
 */
export const STAKEHOLDER_LIST_REACH_CAP = 20;

/**
 * The page size of one held vault, so that one reach across all held vaults brings {@link STAKEHOLDER_LIST_REACH_CAP} records:
 * 20 split as evenly as it goes, the first vaults (the holder's own first) taking the remainder. 3 vaults: 7, 7, 6.
 *
 * @param index the vault's place in the held list (0 = the holder's own)
 * @param count how many vaults are held
 * @returns the `?limit=` for that vault's pages, at least 1
 */
export function pageLimitFor(index: number, count: number): number {
  const n = Math.max(1, count);
  const share = Math.floor(STAKEHOLDER_LIST_REACH_CAP / n);
  const extra = index < STAKEHOLDER_LIST_REACH_CAP % n ? 1 : 0;
  return Math.max(1, share + extra);
}

/**
 * The page size of each vault for ONE reach, shared over the vaults still OPEN: the cap is split
 * as {@link pageLimitFor} splits it, but only over the vaults that still have a page to read, so a finished vault's share goes to
 * the others. 3 open: 7, 7, 6; once one is finished: 10, 10; one left: 20. The reader passes the share as `listRecords`' `limit`.
 *
 * Why not inside the same reach: the reader reads one page per vault per reach, and a vault is known to be finished only when its
 * page answers `next: null`; so what a vault leaves unused in one reach goes to the others from the next reach on.
 *
 * @param vaults the held vaults, the holder's own first: the order of the shares
 * @param open the vaults that still have a page to read (any order; a vault not in `vaults` is ignored)
 * @returns each open vault's limit, in held order; empty when none is open
 */
export function reachShares(vaults: readonly string[], open: Iterable<string>): Map<string, number> {
  const isOpen = new Set(open);
  const list = [...new Set(vaults)].filter((v) => isOpen.has(v));
  return new Map(list.map((v, i) => [v, pageLimitFor(i, list.length)]));
}

/**
 * The page size by vault id, as a records door asks it: each vault keyed by its place in the held list.
 * ⚠ The static split: a door should page by the `limit` the reader passes ({@link reachShares}) and keep this only
 * for a reader that passes none.
 *
 * @param vaults the held vaults, the holder's own first (the reader's `vaults`)
 * @returns the `?limit=` of a vault; a vault not in the list is read as the first
 */
export function pageLimitOfVault(vaults: readonly string[]): (vaultId: string) => number {
  const list = [...vaults];
  return (vaultId) => pageLimitFor(Math.max(0, list.indexOf(vaultId)), list.length);
}
