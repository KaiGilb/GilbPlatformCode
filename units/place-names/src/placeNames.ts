// The names of catalogue places, one answer per place. Taken from GilbApp `src/lib/mynet/geo/usePlaceNames.ts` (commit in the README), which was copied
// verbatim from MyNet's. The changes are named in the README under "Changes from GilbApp" and each is marked `CHANGED` below.
//
// 🔴 WHY THIS EXISTS (the source's reason, kept): a saved address stores POINTERS to catalogue places, never their names, so a surface that shows the
// address must dereference them. A count is not a name ("2 catalogue places bound" told a person nothing). That is a read, never a copy: no label is
// written back into the vault.
import { useEffect, useState } from "react";
import { GeoUnavailableError, getPlace, type GeoPlace } from "@kaigilb/gilbplatformcode-geo-catalogue";

/**
 * CHANGED (new, F6): what one read of one place came to. GilbApp dropped every place that did not read, whether the catalogue answered 404 or did not
 * answer, and the line showed what was left as if it were all of it.
 *  - `named`: read, and it has a name;
 *  - `missing`: the catalogue answered that there is no such place (404) — an absence;
 *  - `failed`: the place was not read, and nothing is known about it. `reason`: `unreachable` (the read failed), `not-geo` (the address is not the
 *    catalogue's, so nothing was asked), `unnamed` (the row was read and has no name).
 */
export type PlaceRead =
  | { readonly id: string; readonly state: "named"; readonly place: GeoPlace }
  | { readonly id: string; readonly state: "missing" }
  | { readonly id: string; readonly state: "failed"; readonly reason: "unreachable" | "not-geo" | "unnamed" };

/**
 * Read `ids`, in the given order, every one started at once (🔴 2026-09-08: the source awaited one id at a time; a saved address is City + Region +
 * Country, three serial catalogue reads, which is why the rest of the profile painted and the addresses filled in after).
 * Never rejects: each place carries its own answer.
 */
export async function readPlaceNames(ids: readonly string[]): Promise<PlaceRead[]> {
  return Promise.all(
    ids.map(async (id): Promise<PlaceRead> => {
      try {
        const place = await getPlace(id);
        if (place === null) return { id, state: "missing" };
        if (place.label === "") return { id, state: "failed", reason: "unnamed" };
        return { id, state: "named", place };
      } catch (e) {
        return { id, state: "failed", reason: e instanceof GeoUnavailableError && e.reason === "not-geo" ? "not-geo" : "unreachable" };
      }
    }),
  );
}

/** CHANGED (new, F8): some place was not read, so the names it would have given are not known. Carries the places that failed. */
export class PlaceNamesNotReadError extends Error {
  readonly failed: readonly PlaceRead[];
  constructor(failed: readonly PlaceRead[]) {
    super("Some of these places could not be read right now.");
    this.name = "PlaceNamesNotReadError";
    this.failed = failed;
  }
}

/**
 * Dereference `ids` to named catalogue rows, in the given order: the shape the one card's host member takes (`OneCardHost.loadPlaceNames`).
 *
 * CHANGED (F8): REJECTS with {@link PlaceNamesNotReadError} when any place FAILED (was not read), because a caller that compares addresses must never
 * compare half of one. A place the catalogue answered 404 for (`missing`) is an absence and does not reject: it is left out, as it is gone. GilbApp
 * resolved with the readable subset for both.
 */
export async function loadPlaceNames(ids: readonly string[]): Promise<GeoPlace[]> {
  const reads = await readPlaceNames(ids);
  const failed = reads.filter((r) => r.state === "failed");
  if (failed.length > 0) throw new PlaceNamesNotReadError(failed);
  return reads.flatMap((r) => (r.state === "named" ? [r.place] : []));
}

/**
 * The answers for `ids`, coarse→fine as stored.
 *
 * ⚠ Returns `null` while unresolved and `[]` only when there is genuinely nothing to name — the caller must not render "no places" during loading.
 * CHANGED (F6): an element per id, in order, each `named`, `missing` or `failed`. GilbApp returned the named places only ("the caller is told by the
 * shorter list"), which cannot tell a gone place from one that was not read.
 */
export function usePlaceNames(ids: readonly string[]): readonly PlaceRead[] | null {
  const [reads, setReads] = useState<readonly PlaceRead[] | null>(null);
  const key = ids.join("\n");
  useEffect(() => {
    let alive = true;
    if (ids.length === 0) {
      setReads([]);
      return;
    }
    setReads(null);
    void readPlaceNames(ids).then((out) => {
      if (alive) setReads(out);
    });
    return () => {
      alive = false;
    };
    // `key` is the stable identity of the id list; `ids` itself is a new array each render.
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return reads;
}
