// The kind and container of each place a picker lists, as they are learned (`describePlaceHits`). Nothing is asked
// while there is nothing listed, and a new list or an unmount stops the lookup. Taken from GilbApp (commit in the README); only the import changed.
import { useEffect, useMemo, useState } from "react";
import type { GeoPlace } from "@kaigilb/gilbplatformcode-geo-catalogue";
import { describePlaceHits, type PlaceHitDetail } from "./placeHitDetails";

const NONE: ReadonlyMap<string, PlaceHitDetail> = new Map();

export function usePlaceHitDetails(places: readonly GeoPlace[]): ReadonlyMap<string, PlaceHitDetail> {
  const key = places.map((p) => p.id).join("\n");
  // The places are stable for as long as the ids are: the lookup is keyed by the ids, not by the array.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => places, [key]);
  const [details, setDetails] = useState<ReadonlyMap<string, PlaceHitDetail>>(NONE);
  useEffect(() => {
    if (stable.length === 0) {
      setDetails(NONE);
      return;
    }
    const ac = new AbortController();
    void describePlaceHits(stable, { signal: ac.signal, onUpdate: setDetails }).catch(() => {});
    return () => ac.abort();
  }, [stable]);
  return details;
}
