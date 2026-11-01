// Finest first, within the places of one address: the more of those places a place sits in (through its parents' parents
// too), the finer it is. The first is the city, a country-typed last one is the country, and the ones between are the
// regions. A place with an empty label is dropped first. Shared by the holder's addresses and the addresses of theirs.
import type { GeoPlace } from "./oneCardHost";

export function orderPlaces(places: readonly GeoPlace[]): { city: GeoPlace | null; regions: GeoPlace[]; country: GeoPlace | null } {
  const bound = places.filter((p) => p.label.trim() !== "");
  const byId = new Map(bound.map((p) => [p.id, p]));
  const depth = (p: GeoPlace): number => {
    const seen = new Set<string>();
    const walk = (q: GeoPlace) => {
      for (const up of q.memberOf) {
        const parent = byId.get(up);
        if (parent && !seen.has(up)) {
          seen.add(up);
          walk(parent);
        }
      }
    };
    walk(p);
    return seen.size;
  };
  const fine = [...bound].sort((a, b) => depth(b) - depth(a));
  const country = fine.length > 0 && /country/i.test(fine[fine.length - 1]!.type) ? fine.pop()! : null;
  const city = fine.shift() ?? null;
  return { city, regions: fine, country };
}
