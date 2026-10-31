// What a person needs to tell two same-named places apart: WHAT it is (its kind) and WHERE it is (its container).
// Taken from GilbApp `src/lib/mynet/geo/placeHitDetails.ts` (commit in the README); the changes are named in the README under
// "Changes from GilbApp" and each is marked `CHANGED` below.
//
// Cycle214 s8 "card look" — Kai, 2026-10-16, on the employment Location picker (verbatim): "typing 'Oslo' shows four
// rows 'Oslo / Oslo / Oslo kommune / Oslo Township' with no way to tell them apart: 'need to show the other metadata,
// like what Oslo, the city in Norway or some town in USA'". Every row now reads like "Oslo · municipality · in Norway".
// ONE module for the address pickers (City / Region / Country) and the employment Location box, in both apps.
//
// ── WHAT GILBGEO OFFERS PER HIT (measured 2026-10-16, anonymous GETs of the catalogue) ────────────────────────────
//   • search: `{ ids[] }` only. `q` and `type` are the only parameters (limit, fields, parent, include, labels and
//     hits all answer 400). So a hit carries no label, no type and no parent: nothing small to read it from.
//   • the row (`GET /base/e/<id>`): `@type`, `label`, `memberOf` (one parent, as a string OR `{ "@id": "base:e/…" }`),
//     `c_geometry` (the polygon), `attribution`, `license`; a country adds `countryCallingCode` (+47), and NO ISO code.
//     Row sizes: Oslo 96 KB, Oslo Township 2.7 KB, Oslo kommune 0.2 KB, Norway 469 KB (171 KB br), the United
//     Kingdom 756 KB (277 KB br), the United States 3.1 MB (1.16 MB br). Range reads are ignored; no `fields` /
//     `omit` / `lean` parameter exists (all answer the whole row); a HEAD answers `content-length`, a browser's
//     compressed GET does not.
//   ⇒ the KIND is free: the hit's own type, in the ontology's own words (`GeoGrainMap.kindOf`).
//   ⇒ the CONTAINER costs the parent's row. So it is a BOUNDED, CACHED lookup that DEGRADES TO KIND-ONLY, never a
//   read per hit (the `immediateParent` call this replaces was one whole row per hit, sequential, in front of the list).
//
// ── THE BOUNDS ───────────────────────────────────────────────────────────────────────────────────────────────────
//   1. the list is drawn first, with kinds; each container lands as its row is read (`onUpdate`);
//   2. a container row already known (this tab, or this device's lean copy, `baseGeo` `peekPlace`) costs nothing, and
//      a row is read once however many hits share it (two Oslos, one Norway);
//   3. at most {@link MAX_FRESH_PARENT_READS} rows not yet known are read for one list; a hit whose container is
//      beyond that stays kind-only ("unavailable"), it is not an error and not a guess;
//   4. a container row larger than {@link PARENT_ROW_CEILING_BYTES} is not read (declared size, or cut off while
//      streaming): kind-only;
//   5. the chain is at most {@link MAX_CONTAINER_HOPS} containers and stops at a country: never the walk to the top;
//   6. a failed or absent parent is kind-only, ⛔ never a thrown error in front of the list.
// A new device pays for a country once (Norway 0.17 MB, the United States 1.16 MB over the wire); after that it is
// read from the device's own lean copy (`baseGeo` LEAN_KEY).
import { getPlace, peekPlace, resolveGeoGrains, GeoRowTooLargeError, type GeoPlace } from "@kaigilb/gilbplatformcode-geo-catalogue";

export const MAX_CONTAINER_HOPS = 2;
export const MAX_FRESH_PARENT_READS = 3;
/** The largest container row a name is worth pulling (the biggest country measured is 3.1 MB; Kai's range 0.5 to 3.6 MB). */
export const PARENT_ROW_CEILING_BYTES = 4 * 1024 * 1024;

export interface PlaceHitDetail {
  readonly id: string;
  /** "municipality" · "region" · "city" · "town" · "country" …; null when the ontology cannot classify the hit's type. */
  readonly kind: string | null;
  /** The containers named, nearest first: ["Norway"], ["Greater Manchester", "United Kingdom"]. */
  readonly container: readonly string[];
  /**
   * pending: not read yet · named: at least one container named · none-recorded: the row records no parent ·
   * unavailable: a parent exists and was not named (over the read bound, too large, or it failed).
   */
  readonly state: "pending" | "named" | "none-recorded" | "unavailable";
  /** The chain stopped before a country (the hop limit, a bound, or a failure), so it is not the whole chain. */
  readonly partial: boolean;
  /**
   * CHANGED (name rule): GilbApp carried `tail`, the tail of the row's catalogue address, so that two identical rows could be told apart ("entry
   * osm-r-1"): an id drawn as text. Here a row that is still identical to others carries its place in the list instead: "1 of 2 with this name".
   * Null when the row is alone in its description.
   */
  readonly position: { readonly n: number; readonly of: number } | null;
}

export interface DescribeOptions {
  signal?: AbortSignal;
  /** Called with the whole picture each time something is learned; never after `signal` aborts. */
  onUpdate?: (details: ReadonlyMap<string, PlaceHitDetail>) => void;
}

interface Walk {
  place: GeoPlace;
  chain: GeoPlace[];
  /** The next container to name, or null when the chain has ended. */
  next: string | null;
  /** True once a container could not be named. */
  broken: boolean;
}

function snapshot(
  walks: readonly Walk[],
  kindOf: ReadonlyMap<string, string>,
  settled: ReadonlySet<string>,
): Map<string, PlaceHitDetail> {
  const out = new Map<string, PlaceHitDetail>();
  for (const w of walks) {
    const kind = kindOf.get(w.place.type) ?? null;
    const named = w.chain.map((p) => p.label).filter((l) => l !== "");
    const ended = w.next === null || w.broken;
    const hasParent = w.place.memberOf.length > 0;
    const state: PlaceHitDetail["state"] = !hasParent
      ? "none-recorded"
      : named.length > 0 && (ended || settled.has(w.place.id))
        ? "named"
        : w.broken && named.length === 0
          ? "unavailable"
          : settled.has(w.place.id)
            ? named.length > 0
              ? "named"
              : "unavailable"
            : "pending";
    const lastIsCountry = kindOf.get(w.chain[w.chain.length - 1]?.type ?? "") === "country";
    out.set(w.place.id, {
      id: w.place.id,
      kind,
      container: named,
      state,
      partial: hasParent && state !== "pending" && !lastIsCountry && (w.broken || w.next !== null),
      position: null,
    });
  }
  // A row still identical to another (same name, same kind, same container) is told apart by its place in the list (CHANGED: GilbApp used the
  // tail of its catalogue address).
  const groups = new Map<string, string[]>();
  for (const w of walks) {
    const d = out.get(w.place.id)!;
    if (d.state === "pending") continue;
    const key = [w.place.label, d.kind ?? "", d.container.join(">"), d.state].join("|");
    groups.set(key, [...(groups.get(key) ?? []), w.place.id]);
  }
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    ids.forEach((id, i) => out.set(id, { ...out.get(id)!, position: { n: i + 1, of: ids.length } }));
  }
  return out;
}

/**
 * Describe each hit by its kind and its container. Resolves with the final picture; `onUpdate` sees every step.
 * ⚠ Never rejects for a catalogue problem: a container that cannot be had cheaply is simply not named.
 */
export async function describePlaceHits(
  places: readonly GeoPlace[],
  opts: DescribeOptions = {},
): Promise<ReadonlyMap<string, PlaceHitDetail>> {
  const { signal } = opts;
  let kindOf: ReadonlyMap<string, string> = new Map();
  try {
    kindOf = (await resolveGeoGrains(signal)).kindOf;
  } catch {
    /* the kinds are an addition: without them the rows still read as before */
  }
  const walks: Walk[] = places.map((place) => ({
    place,
    chain: [],
    next: place.memberOf[0] ?? null,
    broken: false,
  }));
  const settled = new Set<string>();
  const emit = () => {
    if (!signal?.aborted) opts.onUpdate?.(snapshot(walks, kindOf, settled));
  };
  emit();

  let fresh = MAX_FRESH_PARENT_READS;
  /** One container row: known for nothing, or one of the few reads the list may make, or not named. */
  const resolve = async (id: string): Promise<GeoPlace | null> => {
    const known = peekPlace(id);
    if (known) return known;
    if (fresh <= 0 || signal?.aborted) return null;
    fresh -= 1;
    try {
      return await getPlace(id, signal, { maxBytes: PARENT_ROW_CEILING_BYTES });
    } catch (e) {
      if (e instanceof GeoRowTooLargeError) return null;
      return null; // a failed parent is not named; ⛔ never thrown in front of the list
    }
  };

  for (let hop = 0; hop < MAX_CONTAINER_HOPS; hop += 1) {
    const wanted = new Map<string, Promise<GeoPlace | null>>();
    for (const w of walks) {
      if (w.next === null || w.broken || wanted.has(w.next)) continue;
      wanted.set(w.next, resolve(w.next));
    }
    if (wanted.size === 0) break;
    await Promise.all(
      [...wanted.entries()].map(async ([id, p]) => {
        const got = await p;
        if (signal?.aborted) return;
        for (const w of walks) {
          if (w.next !== id || w.broken) continue;
          if (!got) {
            w.broken = true;
            settled.add(w.place.id);
          } else {
            w.chain.push(got);
            const isCountry = kindOf.get(got.type) === "country";
            w.next = isCountry ? null : (got.memberOf[0] ?? null);
            if (hop + 1 >= MAX_CONTAINER_HOPS || w.next === null) settled.add(w.place.id);
          }
        }
        emit();
      }),
    );
    if (signal?.aborted) break;
  }
  // Whatever is left was beyond the bounds: it stays as far as it got.
  for (const w of walks) settled.add(w.place.id);
  const final = snapshot(walks, kindOf, settled);
  if (!signal?.aborted) opts.onUpdate?.(final);
  return final;
}

/**
 * The second line of a row: "municipality · in Norway". ⚠ Says only what was learned, ⛔ guesses nothing.
 * CHANGED (honest absence, F12): a container that was NOT read says so ("where: not read"; "and further up: not read" after a partial
 * chain). GilbApp drew the kind alone, which cannot be told from a place with no container. The id tail ("entry <tail>") is replaced by the
 * row's position among identical rows ("1 of 2 with this name").
 */
export function placeHitLine(d: PlaceHitDetail): string {
  const parts: string[] = [];
  if (d.kind) parts.push(d.kind);
  if (d.state === "named") parts.push(`in ${d.container.join(", ")}`);
  else if (d.state === "none-recorded") parts.push("no containing place recorded");
  else if (d.state === "pending") parts.push("…");
  else if (d.state === "unavailable") parts.push("where: not read");
  if (d.state === "named" && d.partial) parts.push("and further up: not read");
  if (d.position) parts.push(`${d.position.n} of ${d.position.of} with this name`);
  return parts.join(" · ");
}
