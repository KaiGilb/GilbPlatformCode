// New. The names of saved places for a list or a card: what the device already knows at once, the rest read one per place for the session.
// For a view that holds catalogue addresses (a country of each saved address) and wants a name to show, without reading a country's whole row.
import { useEffect, useState } from "react";
import { GeoUnavailableError, getPlaceLabel, peekPlace } from "@kaigilb/gilbplatformcode-geo-catalogue";

/** One read per address per session: the promise of the first ask is shared by every later ask, in flight or done. A failed read is forgotten so the next ask can try again. */
const reads = new Map<string, Promise<string | null>>();

/** Test seam: forget the session's reads. Not for product code. */
export function __resetPlaceLabelReads(): void {
  reads.clear();
}

function readOnce(id: string): Promise<string | null> {
  let p = reads.get(id);
  if (!p) {
    p = getPlaceLabel(id).catch((e: unknown) => {
      reads.delete(id);
      if (e instanceof GeoUnavailableError) return null;
      throw e;
    });
    reads.set(id, p);
  }
  return p;
}

/**
 * The names of the given catalogue addresses, keyed by address. What the device knows is there on the first render; the rest arrive as they are read. An
 * address with no name (a 404, a row too large, the catalogue down, an address outside the catalogue) stays absent: the view shows nothing for it and
 * never an address.
 */
export function usePlaceLabels(ids: readonly string[]): ReadonlyMap<string, string> {
  const key = [...new Set(ids)].sort().join("\n");
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    const wanted = key ? key.split("\n") : [];
    const known = new Map<string, string>();
    const missing: string[] = [];
    for (const id of wanted) {
      let label: string | undefined;
      try {
        label = peekPlace(id)?.label;
      } catch {
        label = undefined;
      }
      if (label) known.set(id, label);
      else missing.push(id);
    }
    setNames(known);
    let stopped = false;
    for (const id of missing) {
      void readOnce(id)
        .then((label) => {
          if (stopped || !label) return;
          known.set(id, label);
          setNames(new Map(known));
        })
        .catch(() => {
          /* the name stays unknown */
        });
    }
    return () => {
      stopped = true;
    };
  }, [key]);
  return names;
}
