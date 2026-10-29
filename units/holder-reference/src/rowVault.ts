// Which vault holds the record of one typed-list row.
//
// The ONE reading of a row's placement in this package: `findInVault` (the reference check) and `findCandidates` (the picker) both
// call `rowPlacement`, so the two can never disagree.
//
// The platform's answer: each row of the vault's records list, live and ended, carries
//   `vault`          the IRI of the vault that holds the record, or `null` when it is held in more than one;
//   `vaultAmbiguous` `true` exactly when `vault` is `null`.
//
// THE TEST: a row is IN vault V exactly when `row.vault === V`, V being the vault the caller named, compared by exact IRI. Every
// other shape fails closed:
//   - no `vault` key at all: a platform that does not name the row's vault. The answer is "not known yet", never "in V" and never
//     "in no other vault";
//   - `vaultAmbiguous: true`: "held in more than one vault", never "in V", even if `vault` were V;
//   - `vault` null without the flag, or not a string: "not known yet";
//   - any other vault (a vault nested in V among them): "another vault".
// The vault is never read off the record's IRI (host or path): a name is not a placement fact. `scannedVaults` is not read here.

/** Where a row's record is held, relative to the vault the caller named. */
export type RowPlacement = "in-vault" | "other-vault" | "more-than-one-vault" | "not-known-yet";

/** The placement of one typed-list row, relative to `vaultId`. Reads `vault` and `vaultAmbiguous`
 *  only. */
export function rowPlacement(row: Readonly<Record<string, unknown>>, vaultId: string): RowPlacement {
  if (!Object.prototype.hasOwnProperty.call(row, "vault")) return "not-known-yet";
  if (row.vaultAmbiguous === true) return "more-than-one-vault";
  const vault = row.vault;
  if (typeof vault !== "string" || vault === "") return "not-known-yet";
  return vault === vaultId ? "in-vault" : "other-vault";
}

/** A row the answer needs does not say which vault holds its record: "not known yet". Nothing is
 *  sent. ⛔ Never rendered as "no such record" or as an empty list. */
export class PlacementUnknownError extends Error {
  /** The record whose row named no vault. */
  readonly record: string;
  readonly vaultId: string;
  constructor(vaultId: string, record: string) {
    super(
      `the typed list of ${vaultId} does not say which vault holds ${record} (the platform names no vault per row before GilbPlatform GAPP214.25c), so whether it is that vault's record is not known yet`,
    );
    this.name = "PlacementUnknownError";
    this.record = record;
    this.vaultId = vaultId;
  }
}
