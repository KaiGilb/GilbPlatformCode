/**
 * Clears place rungs on a draft the person is still editing.
 *
 * This does not save, does not search, and does not decide who can see the
 * address. Access, the default rung, and the list of rungs a person may pick
 * stay in the app. Pass the draft you already have. Extra fields are copied
 * through and left alone.
 *
 * `clearFinerOnCountryChange` clears city and region only. Country stays,
 * including a country the cascade filled. A divergence notice stays only when
 * it describes the country. Any other notice is dropped, because it named a
 * city or region that is now gone.
 *
 * `clearRung` clears that one rung and its cascaded flag. The notice is dropped
 * only when it describes that same rung. Comparison is exact. `"Country"` is
 * not `"country"`.
 *
 * Neither function changes the draft you passed. The place object and the
 * cascaded object are new. A notice that is kept is the same object.
 */

export type PlaceRung = "city" | "region" | "country";

export interface PlaceClearDraft {
  place: { city: unknown; region: unknown; country: unknown };
  cascaded: { city: boolean; region: boolean; country: boolean };
  divergence: { rung: string } | null;
}

export function clearFinerOnCountryChange<T extends PlaceClearDraft>(draft: T): T {
  return {
    ...draft,
    place: { ...draft.place, city: null, region: null },
    cascaded: { ...draft.cascaded, city: false, region: false },
    divergence: draft.divergence && draft.divergence.rung !== "country" ? null : draft.divergence,
  } as T;
}

export function clearRung<T extends PlaceClearDraft>(draft: T, rung: PlaceRung): T {
  return {
    ...draft,
    place: { ...draft.place, [rung]: null },
    cascaded: { ...draft.cascaded, [rung]: false },
    divergence: draft.divergence?.rung === rung ? null : draft.divergence,
  } as T;
}
