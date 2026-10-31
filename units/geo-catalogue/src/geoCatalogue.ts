// The catalogue client of the shared place catalogue (GilbGeo): search, one row, the ancestry walk, and the ontology's grain map.
// Taken from GilbApp `src/lib/mynet/geo/baseGeo.ts` (commit in the README). The code is GilbApp's; the changes are listed in
// the README under "Changes from GilbApp" and each one is marked `CHANGED` below.
//   - The catalogue's origin is `geoOrigin()` (unit `geo-origin`), the ontology's is `termOrigin()` (unit `term-origin`): the app sets
//     both once at start-up. GilbApp read a constant from its configuration for each.
//   - FENCE: every read of the catalogue first asks `isGeoUrl` and makes NO request for an address outside it.
//   - The catalogue is READ ONLY from here: the only requests are GET, and no credential is sent to the catalogue.

// 🔴 THE BASEGEO CATALOGUE CLIENT — the ONLY place a place value may come from.
//
// ── What this is, in one sentence ────────────────────────────────────────────────────────────
// A person searching for "Oslo" gets rows out of the SHARED world catalogue at
// the catalogue's origin, never out of a list this app keeps — so two people who both live
// in Oslo hold a pointer to the SAME row, and the app owns no place data at all.
//
// ── 🔴 COUNT OF MYNET-PRIVATE PLACE LISTS THIS MODULE CREATES = 0 ───────────────────────────
// There is no seed array, no fallback list, no "common cities" shortcut and no offline copy in
// this file, and there must never be one. If BaseGeo cannot answer, the surface says so and the
// person records no place — it does ⛔ NOT fall back to typing one, because a typed place is
// exactly the free-text path VDS-MNB168.15 exists to remove. A hardcoded list here would also be
// an app-private enumeration of a vocabulary the app does not own
// (`Rule_Code_base-vault-native-derivation#RuleBasepodNoNewEnumeration`).
//
// ── ⚠ THE SERVING SURFACE, AS MEASURED — ⛔ not as documented ────────────────────────────────
// Probed live 2026-09-04T22:57Z and 2026-09-04T23:0xZ against the catalogue at `<origin>/base`:
//   • `GET /base/search?q=<text>&type=<BareLocalName>` → `{ total, count, ids[] }`
//     🔴 `type` takes the BARE LOCAL NAME. `type=t:City` is REFUSED by the server with
//     `type_token_unresolved` naming the prefix as the fault — the wire-level statement of
//     `Rule_Code_base-record-io#RuleBaseioBareTypeName`. Measured, not assumed.
//     ⛔ `q` and `type` are the ONLY accepted parameters: `limit`, `page`, `parent`, `memberOf`,
//     `within`, `cursor`, `offset` and `fields` each answer
//     `400 querystring must NOT have additional properties`. So there is ⛔ NO server-side
//     parent filter and ⛔ NO paging — the country cascade below is therefore done client-side,
//     and that is a measured constraint rather than a design preference.
//   • `GET /base/e/<id>` → JSON-LD carrying `@type`, `label` and `memberOf`.
//     ⚠ The search route returns IDS ONLY — no labels — so a picker MUST hydrate each hit.
//     That N+1 is the shape of the live surface, and {@link placeCache} is why it is paid once.
//   • Negative controls discriminate: `q=zzqqnotaplace12345` → `total 0`;
//     `/base/e/zzqq-not-a-place-12345` → `404`. ⇒ a `total 0` here means "no such place",
//     ⛔ not "the probe is broken".
//   • CORS: the server answers the first-party origins, so the rig reaches it directly with no proxy.
//
// ── ⚠ TWO MEASURED FACTS THE CASCADE MUST SURVIVE ───────────────────────────────────────────
//   1. **`a:memberOf` is NOT transitive** and the walk to Country is ⛔ not implemented server-
//      side (Cycle168 MNB168.12 census §4, and the BaseGeo ingest handoff says so by name). The
//      walk in {@link resolveAncestry} is THIS CLIENT'S instrument. It is bounded at
//      {@link MAX_MEMBER_OF_HOPS} hops because an unbounded walk over a cyclic edge would hang
//      the surface, and a cycle in ingested OSM data is not hypothetical.
//   2. **173 `t:GeoAdminArea` rows (5.48%) reach no Country** (same census). ⇒ a resolved
//      ancestry with `country: null` is a REAL, EXPECTED answer over live data — ⛔ never an
//      error, and ⛔ never a reason to invent a country. The surface shows what was found and
//      leaves the rest empty.

import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { geoOrigin, isGeoUrl } from "@kaigilb/gilbplatformcode-geo-origin";

// CHANGED: `GEO_ORIGIN`, `GEO_ENTITY_PREFIX` and `isGeoEntityId` (GilbApp lines 60-84) are the unit `geo-origin`'s (`geoOrigin()`,
// `isGeoEntityId`): the origin is a setting, read at each use.

/**
 * 🔴 THE THREE RUNGS KAI NAMED — City, Region, Country — RESOLVED FROM THE ONTOLOGY, ⛔ NOT
 * HARDCODED HERE.
 *
 * ⚠ THIS FILE USED TO CARRY A `const` LISTING `["City","Municipality","Town"]`, AND BVEDANTA'S
 * TYPING GATE FAILED IT (Cycle168 MNB168.15, `baseGeo.ts:84-88`). My defence was that every name
 * is BaseGeo's own type and the mapping is never persisted. **Both halves were rejected, and the
 * rejection is right:**
 *   • `RuleBasepodNoNewEnumeration`'s harm is the **COPY**, ⛔ not the invention — the 21
 *     duplicated enumerations that produced the rule all had legitimate members too.
 *   • "Never persisted" is true of the strings and **FALSE OF THE CONSEQUENCE**: this list feeds
 *     `rungOfType` → `resolveAncestry` → `boundPlaceIds` → the `a:memberOf` facts that ARE
 *     written. Drop `Municipality` from it and picking Oslo writes **no membership fact at all**.
 *   • The collision neither defence reached: the product word "City" would denote
 *     {City ∪ Municipality ∪ Town} while the placed term `t:City` denotes City alone — one word,
 *     two extensions, one of them an already-placed term.
 *
 * 🔴 **BVedanta authored the remedy (BVGATE_04) rather than waiving anything**: `t/PlaceGrain` ·
 * `a:placeGrain`, one additive fact on each of the five catalogue types. **The grain names
 * deliberately diverge from the product words — that divergence IS the collision remedy.**
 * Verified live 2026-09-04: `a/placeGrain` and `t/PlaceGrain` both 200 (control
 * `a/zzqqnotaterm` → 404); `City`/`Municipality`/`Town` = `settlement`,
 * `GeoAdminArea` = `administrativeArea`, `Country` = `country`.
 *
 * ⇒ **This module now ASKS.** The app holds no list of catalogue types; it reads
 * `t/GeoRegion`'s children and each child's `a:placeGrain`. Adding a sixth grain to the
 * catalogue changes this app's behaviour with ⛔ no code change here — which is the property a
 * copied list can never have.
 */

/** The product's three words. ⚠ These are DISPLAY strings, ⛔ not terms — BVedanta ruled the UI
 *  labels out of the term plane explicitly. The grain each maps to is the ontology's word. */
export type GeoRung = "city" | "region" | "country";

/** Rung → the `a:placeGrain` value that defines it. ⚠ ⛔ NOT a list of catalogue types: one
 *  ontology-owned grain word per rung, and the catalogue decides which types carry it. */
export const RUNG_GRAIN: Readonly<Record<GeoRung, string>> = Object.freeze({
  city: "settlement",
  region: "administrativeArea",
  country: "country",
});

/**
 * 🔴 WHICH GRAINS A BOX SEARCHES — deliberately WIDER than the rung a picked row occupies.
 *
 * ⚠ THE DEFECT THIS CLOSES IS KAI'S OWN ACCEPTANCE TEST. His words: *"If you choose a detailed
 * place like a city, like New York, it automatically fills in the country etc."* Measured live:
 * **New York exists in the catalogue ONLY as a `t:GeoAdminArea`** — at ⛔ no settlement grain at
 * all. So a City box that searched only `settlement` told a person *"no matches"* for New York.
 * That is the third time this build has told someone a real place does not exist, and it is the
 * one Kai will type first.
 *
 * 🔴 THE ROOT CAUSE, NAMED: **the catalogue does not classify real cities consistently** — Oslo
 * is a `Municipality`, Manchester a `City`, New York a `GeoAdminArea`. ⇒ **grain cannot be the
 * thing a person searches by**, because no person knows or should know which one their city got.
 *
 * ⇒ The City box searches settlement grains **and** administrative areas. ⚠ It does ⛔ NOT
 * thereby call an administrative area a city: the rung a picked row occupies is still read from
 * the ONTOLOGY via {@link GeoGrainMap.rungOf}, so picking New York fills the **Region** slot and
 * the cascade fills Country — which is exactly the behaviour Kai described. The box is a place
 * to *look*; the ontology still decides what the thing *is*.
 *
 * ── ⚠ THE PRICE OF THIS WIDENING, MEASURED AND CARRIED ⛔ NOT DROPPED (VATester NEW-5) ────────
 * The City box now issues a **fourth** grain query per keystroke. VATester measured the cost at
 * `3611f5f` against `dec5748`, same instrument, live: `q="New York"` **17 req · 4.70 MB → 18 req ·
 * 4.93 MB** (+1 req, +0.23 MB); `q="Springfield"` **17 → 18 req**, bytes unchanged.
 *
 * 🔴 This is a REAL breach of `Rule_Code_mobile-first` on the cost axis and it is **CARRIED, not
 * closed**, because the trade is the increment's whole purpose: without the fourth query the City
 * box tells a New Yorker their city does not exist. ⛔ It must not be described as a cost
 * improvement anywhere. The compounding defect **D4 / D-N10** (unbounded fan-out on the pinned
 * path) remains OPEN and is marginally worse at this SHA than at the last.
 */
export const RUNG_SEARCH_GRAINS: Readonly<Record<GeoRung, readonly string[]>> = Object.freeze({
  city: ["settlement", "administrativeArea"],
  region: ["administrativeArea"],
  country: ["country"],
});

/** The product's own word for a grain, where the ontology's type label is not one a person says. DISPLAY strings,
 *  ⛔ not terms (BVedanta ruled the UI labels out of the term plane, see {@link RUNG_GRAIN}). */
const GRAIN_KIND_WORD: Readonly<Record<string, string>> = Object.freeze({ administrativeArea: "region" });

/** Where the vocabulary lives: the ontology master's origin, read at each use. CHANGED: GilbApp read a constant for the master (its `VEDA_BASE`);
 *  here it is `termOrigin()`, the origin the app set for every ontology read. */
const vedaBase = (): string => termOrigin();

/** The catalogue types carrying each grain, as the ontology declares them. */
export interface GeoGrainMap {
  readonly byRung: Readonly<Record<GeoRung, readonly string[]>>;
  /** Bare type name → the rung it occupies. */
  readonly rungOf: ReadonlyMap<string, GeoRung>;
  /**
   * Bare type name → the word a person reads for what the row IS ("municipality", "town", "region", "country"),
   * s8 card look (Kai 2026-10-16: "show … its kind"). ⚠ The ontology's own label for the type
   * (`GET /base/t/GeoRegion/children` serves one per child), lower-cased; the one type whose label is not a
   * word a person says ("Geo Admin Area") is read through its GRAIN (`administrativeArea`) as the product's
   * own word "region" ({@link GRAIN_KIND_WORD}). ⛔ No type name is listed here.
   */
  readonly kindOf: ReadonlyMap<string, string>;
  /**
   * 🔴 Catalogue types the ontology declared but this map could NOT classify — a read that
   * failed, or a `200` carrying no `a:placeGrain`.
   *
   * ⚠ IT IS A THIRD STATE, and inventing it is the whole point. Previously a child that would
   * not classify was `continue`d (⇒ a rung silently emptied, memoized as success, permanent for
   * the tab — VATester N7) and then, over-correcting, thrown (⇒ ONE bad child killed ALL THREE
   * rungs — N8). Neither is right, because ⛔ **we cannot know which rung the unreadable child
   * belonged to.** So the rungs that DID resolve stay usable, and the not-knowing travels with
   * the answer instead of being resolved by guess in either direction.
   */
  readonly unclassified: readonly string[];
}

/** `GeoAdminArea` → "Geo Admin Area": only the fallback when the ontology served no label for a type. */
function humaniseTypeName(bare: string): string {
  return bare.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

let grainCache: Promise<GeoGrainMap> | null = null;

/** Test seam — ⛔ never called by product code. */
export function __resetGeoGrainCache(): void {
  grainCache = null;
}

/**
 * Read the grain map off BaseVeda.
 *
 * ⚠ Memoized per tab, and **cleared on failure** so the next attempt re-asks — the same
 * cache-on-success-only discipline `resolveProfileVocab` uses. ⛔ There is no baked-in fallback
 * map: a fallback would be the copied enumeration this whole change removes, and it would go
 * stale silently. If the ontology cannot be reached the surface says so and offers no places.
 */
export async function resolveGeoGrains(signal?: AbortSignal): Promise<GeoGrainMap> {
  grainCache ??= (async () => {
    const res = await vedaFetch(`${vedaBase()}/base/t/GeoRegion/children`, signal);
    if (!res.ok) throw new GeoUnavailableError(res.status, "GeoRegion children");
    const body = (await res.json()) as { children?: Array<{ name?: string; label?: string }> };
    const names = (body.children ?? [])
      .map((c) => c.name)
      .filter((n): n is string => typeof n === "string" && n !== "");
    const labelOfType = new Map<string, string>();
    for (const c of body.children ?? [])
      if (typeof c.name === "string" && typeof c.label === "string" && c.label.trim() !== "") labelOfType.set(c.name, c.label.trim());
    if (names.length === 0) throw new GeoUnavailableError(null, "GeoRegion declares no children");

    const byRung: Record<GeoRung, string[]> = { city: [], region: [], country: [] };
    const rungOf = new Map<string, GeoRung>();
    const kindOf = new Map<string, string>();
    const unclassified: string[] = [];
    for (const name of names) {
      const r = await vedaFetch(`${vedaBase()}/base/t/${encodeURIComponent(name)}`, signal);
      // 🔴 A PARTIAL OUTAGE IS A FAILURE, ⛔ NOT AN EMPTY ANSWER. This used to `continue`, so if
      //    the grain reads failed the map came back EMPTY, was memoized as a SUCCESS, and every
      //    search then answered "no such place" — for the rest of the tab, even after the
      //    ontology recovered. ⚠ The two independent gates on this increment both flagged this
      //    exact shape: it fails QUIET, in the user-visible direction.
      if (!r.ok) {
        // ⚠ Recorded, ⛔ not thrown (N8) and ⛔ not swallowed (N7).
        unclassified.push(name);
        continue;
      }
      const doc = (await r.json()) as Record<string, unknown>;
      const grain = typeof doc["a:placeGrain"] === "string" ? doc["a:placeGrain"] : null;
      if (!grain) {
        // 🔴 A `200` WITHOUT A GRAIN IS THE SUBTLER HALF OF THE SAME HOLE, and it is the one
        //    that survived the last round: the read succeeds, so nothing looks wrong, and the
        //    rung just quietly loses a grain. It is recorded exactly like a failed read.
        unclassified.push(name);
        continue;
      }
      for (const rung of ["city", "region", "country"] as const) {
        if (RUNG_GRAIN[rung] === grain) {
          byRung[rung].push(name);
          rungOf.set(name, rung);
        }
      }
      // The word for what the row IS: the grain's product word where it has one, else the type's own label.
      kindOf.set(name, GRAIN_KIND_WORD[grain] ?? (labelOfType.get(name) ?? humaniseTypeName(name)).toLowerCase());
    }
    // ⚠ A map that classifies NOTHING cannot be a success: it is indistinguishable at every call
    //   site from "the catalogue holds no places", which is false and unrecoverable once cached.
    if (rungOf.size === 0) {
      throw new GeoUnavailableError(null, "no catalogue grain could be classified");
    }
    return { byRung, rungOf, kindOf, unclassified };
  })().catch((e) => {
    grainCache = null;
    throw e;
  });
  return grainCache;
}

/** One catalogue row, reduced to what a picker and a claim need. ⛔ Geometry is dropped. */
export interface GeoPlace {
  /** Absolute catalogue URI — the value a claim stores. */
  readonly id: string;
  readonly label: string;
  /** Bare type name as the catalogue declared it (`City`, `GeoAdminArea`, `Country`, …). */
  readonly type: string;
  /** Parent extents this row declares, absolute and de-duplicated. May be empty. */
  readonly memberOf: readonly string[];
}

/** The three rungs a picked place resolves to. Any of them may be null — see census note 2. */
export interface GeoAncestry {
  readonly city: GeoPlace | null;
  readonly region: GeoPlace | null;
  readonly country: GeoPlace | null;
}

/** Why a read gave no row, for the view to name. `not-geo`: the address is not inside the catalogue, so NO request was made (the fence). */
export type GeoFailReason = "unreachable" | "not-geo";

export class GeoUnavailableError extends Error {
  readonly status: number | null;
  /** CHANGED (new): why. A failed read is `unreachable`; an address outside the catalogue is `not-geo` and made no request. */
  readonly reason: GeoFailReason;
  constructor(status: number | null, detail?: string, reason: GeoFailReason = "unreachable") {
    super(
      reason === "not-geo"
        ? // CHANGED (new): the fence's own sentence. It names no address.
          "This place is not in the place catalogue this app uses, so it cannot be looked up. Your other details are unaffected."
        : // ⚠ Said plainly, because the correct behaviour when the catalogue is down is that the
          //   person records NO place — never that they type one. The message must not invite that.
          "The place catalogue could not be reached, so places cannot be looked up right now. " +
            "Your other details are unaffected.",
    );
    this.name = "GeoUnavailableError";
    this.status = status;
    this.reason = reason;
    if (detail) this.cause = detail;
  }
}

/** Absolute form of whatever shape the catalogue used for a reference.
 *
 * ⚠ Measured: the SAME field arrives in three shapes across live rows — a plain absolute string
 * (`osm-r-406091` → Norway), and a compact object `{ "@id": "base:e/osm-r-161648" }` (New York's
 * `memberOf`). A reader that handles only one shape silently loses the other's parent and the
 * cascade goes quiet rather than wrong — which is worse. So all three are normalised here. */
function absoluteGeoId(raw: unknown): string | null {
  const v =
    typeof raw === "string"
      ? raw
      : raw && typeof raw === "object" && typeof (raw as { "@id"?: unknown })["@id"] === "string"
        ? ((raw as { "@id": string })["@id"])
        : null;
  if (!v) return null;
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  // Compact `base:e/<id>` against the catalogue's own JSON-LD context.
  const compact = /^base:e\/(.+)$/.exec(v);
  if (compact) return `${geoOrigin()}/base/e/${compact[1]}`;
  return null;
}

/** Bare local name of a `t:City` / absolute type URI / bare string, or "" when unreadable. */
function bareTypeName(raw: unknown): string {
  const v = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.find((x) => typeof x === "string") : null;
  if (typeof v !== "string") return "";
  const afterSlash = v.slice(v.lastIndexOf("/") + 1);
  return afterSlash.includes(":") ? afterSlash.slice(afterSlash.lastIndexOf(":") + 1) : afterSlash;
}

/**
 * Hydrated rows, keyed by absolute id, for the life of the tab.
 *
 * ⚠ This is a CACHE OF THE CATALOGUE'S OWN ANSWERS, ⛔ not a place list: it holds only rows the
 * catalogue already returned for a query this person made, it seeds empty on every load, and it
 * can answer nothing the catalogue did not just say. It exists because a country row is ~166 KB
 * over the wire (measured on Norway, brotli) and a cascade would otherwise re-fetch it per
 * keystroke.
 */
const placeCache = new Map<string, GeoPlace>();
/** In-flight coalescer — two address cards mounting together must not fetch Norway twice. */
const placeInflight = new Map<string, Promise<GeoPlace | null>>();

// ── THE DEVICE'S LEAN COPY OF WHAT THE CATALOGUE ALREADY SAID (s8 card look, Kai 2026-10-16) ─────────────────────
// A row is read whole (its polygon too: Oslo 96 KB, Norway 469 KB, the United States 3.1 MB, measured 2026-10-16)
// because GilbGeo offers no field projection, no range read and no parent label on a search hit. The four facts a
// picker and the cascade use (label, type, parents) are tiny, so they are kept on THIS device after the first read:
// the second search for "Oslo", in this tab or a later session, reads no row at all.
//
// ⚠ Still a CACHE OF THE CATALOGUE'S OWN ANSWERS, ⛔ not a place list: it holds only rows the catalogue returned for
// something this person looked at, it is written by nothing else, expires, is bounded, and a read that fails or
// is refused is never stored. ⛔ No geometry is kept.
const LEAN_KEY = "base:geo:lean-rows:v1";
const LEAN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LEAN_MAX_ROWS = 400;
type LeanRow = { l: string; t: string; m: string[]; s: number };
let leanMem: Record<string, LeanRow> | null = null;
function leanLoad(): Record<string, LeanRow> {
  if (leanMem) return leanMem;
  let out: Record<string, LeanRow> = {};
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LEAN_KEY) : null;
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === "object") out = parsed as Record<string, LeanRow>;
  } catch {
    out = {};
  }
  leanMem = out;
  return out;
}
function leanGet(id: string): GeoPlace | null {
  const row = leanLoad()[id];
  if (!row || typeof row.l !== "string" || row.l === "" || !Array.isArray(row.m) || Date.now() - row.s > LEAN_TTL_MS) return null;
  return { id, label: row.l, type: row.t, memberOf: row.m };
}
function leanPut(place: GeoPlace): void {
  if (place.label === "") return;
  const all = leanLoad();
  all[place.id] = { l: place.label, t: place.type, m: [...place.memberOf], s: Date.now() };
  const ids = Object.keys(all);
  if (ids.length > LEAN_MAX_ROWS) {
    ids.sort((a, b) => all[a]!.s - all[b]!.s);
    for (const old of ids.slice(0, ids.length - LEAN_MAX_ROWS)) delete all[old];
  }
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(LEAN_KEY, JSON.stringify(all));
  } catch {
    /* a full or blocked store only means the next session reads the row again */
  }
}

/** Test seam — ⛔ never called by product code. */
export function __resetGeoCache(): void {
  placeCache.clear();
  placeInflight.clear();
  leanMem = null;
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(LEAN_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Test seam — ⛔ never called by product code. A new tab / session: memory gone, the device's lean copy kept. */
export function __resetGeoMemoryOnly(): void {
  placeCache.clear();
  placeInflight.clear();
  leanMem = null;
}

/**
 * The one request to the CATALOGUE. CHANGED (new): the fence and the credential.
 *  - FENCE: an address outside the catalogue (`isGeoUrl`, by parsed origin) throws `GeoUnavailableError` with reason `not-geo` BEFORE
 *    any request. GilbApp fetched whatever address it was handed.
 *  - `credentials: "omit"`: the catalogue is public, so nothing of the person (cookie, sign-in) goes to it.
 * The method is GET and only GET: the catalogue is never written from here.
 */
async function geoFetch(url: string, signal?: AbortSignal): Promise<Response> {
  if (!isGeoUrl(url)) throw new GeoUnavailableError(null, "outside the catalogue", "not-geo");
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers: { accept: "application/ld+json, application/json" }, credentials: "omit", signal });
  } catch (cause) {
    if ((cause as { name?: string })?.name === "AbortError") throw cause;
    throw new GeoUnavailableError(null, String(cause));
  }
  return res;
}

/** A read of the ONTOLOGY master (the grain map). As GilbApp's `geoFetch` was; the master is not the catalogue, so no fence applies. */
async function vedaFetch(url: string, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers: { accept: "application/ld+json, application/json" }, signal });
  } catch (cause) {
    if ((cause as { name?: string })?.name === "AbortError") throw cause;
    throw new GeoUnavailableError(null, String(cause));
  }
  return res;
}

/**
 * SEARCH THE CATALOGUE at one rung.
 *
 * @param q what the person typed. Blank yields no query at all — ⛔ the catalogue has no
 *   "list everything" route, and inventing one by searching for `""` would be a fabricated
 *   browse surface.
 * @param rung which grain to search
 * @returns catalogue ids, most-relevant order as the server ranked them. ⛔ Not re-ranked here:
 *   this app has no relevance authority over a catalogue it does not own.
 */
/** What a search could and could not establish. ⚠ `incomplete` is ⛔ never "no such place". */
export interface PlaceSearch {
  readonly total: number;
  readonly ids: string[];
  /**
   * 🔴 TRUE WHEN THIS ANSWER IS NOT THE WHOLE ANSWER — and it has TWO measured causes, which is
   * why the previous single-cause version was wrong (VATester N6).
   *   1. the ontology could not classify every catalogue type ({@link GeoGrainMap.unclassified});
   *   2. 🔴 **the server truncates `ids` at 20 per grain regardless of `total`** — measured
   *      2026-09-05: `New York|Municipality` total **55** → **20** ids; `oblast|GeoAdminArea`
   *      total **70** → **20** ids. The old cap modelled only this app's own ceiling of 24, so a
   *      server-truncated scan reported `capped: false` and the surface said *"no matches"* with
   *      50 of 70 rows never looked at.
   * ⇒ a caller that renders an empty list MUST consult this before calling it an absence.
   */
  readonly incomplete: boolean;
}

export async function searchPlaceIds(
  q: string,
  rung: GeoRung,
  signal?: AbortSignal,
): Promise<PlaceSearch> {
  const query = q.trim();
  if (query === "") return { total: 0, ids: [], incomplete: false };
  const map = await resolveGeoGrains(signal);
  // Search breadth is by GRAIN WORD, so a grain the ontology adds later is picked up here too.
  const grains = [...map.rungOf.entries()]
    .filter(([, r]) => RUNG_SEARCH_GRAINS[rung].includes(RUNG_GRAIN[r]))
    .map(([name]) => name);
  // ⚠ An unclassified catalogue type could have belonged to THIS rung — we cannot know, so the
  //   not-knowing is disclosed rather than resolved by guess in either direction.
  let incomplete = map.unclassified.length > 0;
  if (grains.length === 0) {
    if (incomplete) throw new GeoUnavailableError(null, "the place catalogue could not be classified");
    return { total: 0, ids: [], incomplete: false };
  }

  // 🔴 2026-09-08: each grain was a serial round trip. Typing "Oslo" searches
  // City + Municipality + Town (and region grains) one after another — the picker
  // and the address cascade paid that sum. Same answers, in parallel.
  const grainPages = await Promise.all(
    grains.map(async (bare) => {
      const url =
        `${geoOrigin()}/base/search?q=${encodeURIComponent(query)}` +
        // 🔴 BARE local name. `t:City` is refused by the server — see the module header.
        `&type=${encodeURIComponent(bare)}`;
      const res = await geoFetch(url, signal);
      if (!res.ok) throw new GeoUnavailableError(res.status, await res.text().catch(() => ""));
      const body = (await res.json()) as { total?: { value?: number }; ids?: unknown };
      const got = Array.isArray(body.ids)
        ? body.ids.filter((x): x is string => typeof x === "string")
        : [];
      const grainTotal = typeof body.total?.value === "number" ? body.total.value : got.length;
      return { got, grainTotal };
    }),
  );
  const perGrain: string[][] = [];
  let total = 0;
  for (const page of grainPages) {
    total += page.grainTotal;
    // 🔴 THE SERVER'S OWN TRUNCATION — read off `total` vs `ids.length`, ⛔ not assumed absent.
    if (page.got.length < page.grainTotal) incomplete = true;
    perGrain.push(page.got);
  }

  // 🔴 ROUND-ROBIN, ⛔ NOT CONCATENATION. Concatenating let the FIRST grain monopolise the result
  // cap: measured live, "New York" at the city rung filled all 8 offered rows from one grain
  // while New York itself — held at a DIFFERENT grain — never appeared. Interleaving also removes
  // any need for this app to rank grains over a catalogue it does not own.
  const seen = new Set<string>();
  const ids: string[] = [];
  const widest = Math.max(0, ...perGrain.map((g) => g.length));
  for (let i = 0; i < widest; i += 1) {
    for (const g of perGrain) {
      const id = g[i];
      if (id === undefined || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return { total, ids, incomplete };
}

/** A row this lookup refused to read because it is larger than the ceiling it was given. ⚠ Not a failure of the
 *  catalogue and not an absence: the row exists and was not read ({@link getPlace} `maxBytes`). */
export class GeoRowTooLargeError extends Error {
  readonly bytes: number | null;
  constructor(bytes: number | null) {
    super("The place row is larger than this lookup reads.");
    this.name = "GeoRowTooLargeError";
    this.bytes = bytes;
  }
}

/** Reads a JSON body, stopping (and cancelling the transfer) once it passes `maxBytes`. */
async function readJsonWithin(res: Response, maxBytes: number): Promise<unknown> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    void res.body?.cancel().catch(() => {});
    throw new GeoRowTooLargeError(declared);
  }
  const reader = res.body?.getReader?.();
  if (!reader) return res.json();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      void reader.cancel().catch(() => {});
      throw new GeoRowTooLargeError(total);
    }
    parts.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(all));
}

/** What is already known of a row WITHOUT asking the catalogue (this tab, then this device's lean copy); null otherwise. */
export function peekPlace(id: string): GeoPlace | null {
  if (!isGeoUrl(id)) return null; // CHANGED (new): the fence; an address outside the catalogue is known to nobody here
  const cached = placeCache.get(id);
  if (cached) return cached;
  const lean = leanGet(id);
  if (lean) {
    placeCache.set(id, lean);
    return lean;
  }
  return null;
}

/**
 * Dereference ONE catalogue row. Cached (this tab, then this device's lean copy); geometry discarded on the way in.
 *
 * @param opts.maxBytes refuse to read a row larger than this (declared or streamed): throws {@link GeoRowTooLargeError}.
 *   Used where a row is only wanted for its NAME (a hit's container), so a country's polygon is never pulled to name it.
 */
export async function getPlace(id: string, signal?: AbortSignal, opts?: { maxBytes?: number }): Promise<GeoPlace | null> {
  // CHANGED (new): the fence, before the caches and before any request. Throws `GeoUnavailableError` with reason `not-geo`.
  if (!isGeoUrl(id)) throw new GeoUnavailableError(null, "outside the catalogue", "not-geo");
  const cached = placeCache.get(id);
  if (cached) return cached;
  const lean = leanGet(id);
  if (lean) {
    placeCache.set(id, lean);
    return lean;
  }
  const flight = opts?.maxBytes ? `${id}|<=${opts.maxBytes}` : id;
  const pending = placeInflight.get(flight);
  if (pending) return pending;
  const work = (async () => {
    const res = await geoFetch(id, signal);
    // 🔴 404 is an ANSWER — "no such place" — and the negative control proves the route
    //    discriminates. ⛔ Never coerced into an empty-but-present row.
    if (res.status === 404) return null;
    if (!res.ok) throw new GeoUnavailableError(res.status, await res.text().catch(() => ""));
    const doc = (opts?.maxBytes ? await readJsonWithin(res, opts.maxBytes) : await res.json()) as Record<string, unknown>;
    const parents = (Array.isArray(doc.memberOf) ? doc.memberOf : [doc.memberOf])
      .map(absoluteGeoId)
      .filter((x): x is string => x !== null);
    const place: GeoPlace = {
      // CHANGED: the row's own `@id` is taken only when it is inside the catalogue (the id feeds later reads, such as the flag).
      id: typeof doc["@id"] === "string" && isGeoUrl(doc["@id"]) ? doc["@id"] : id,
      label:
        typeof doc.label === "string" ? doc.label : typeof doc.title === "string" ? doc.title : "",
      type: bareTypeName(doc["@type"]),
      // De-duplicated: live rows repeat a parent (Oslo's geometry field repeats too).
      memberOf: [...new Set(parents)],
    };
    placeCache.set(id, place);
    leanPut(place);
    return place;
  })();
  placeInflight.set(flight, work);
  try {
    return await work;
  } finally {
    placeInflight.delete(flight);
  }
}

/** Hop ceiling on the parent walk. The deepest real chain measured is far shorter; this bound
 *  exists so an ingest cycle cannot hang the surface, ⛔ not because 5 is a semantic depth. */
export const MAX_MEMBER_OF_HOPS = 5;

/**
 * 🔴 THE CASCADE, BOTH DIRECTIONS' SHARED HALF — walk `a:memberOf` up from one picked row and
 * report which of City / Region / Country were reached.
 *
 * ⚠ `a:memberOf` IS NOT TRANSITIVE and no server route does this walk (measured — module header
 * note 1). This function IS the walk, and it is therefore an instrument this app owns and must
 * be honest about: a rung it did not reach comes back `null` and the surface leaves that box
 * empty. ⛔ It never guesses, and ⛔ it never fills a rung from a string match on a label.
 *
 * The picked row itself occupies its own rung, so picking Oslo (a `GeoAdminArea`) fills REGION
 * and walks on for COUNTRY; picking a `City` fills CITY and walks for both others.
 */
export async function resolveAncestry(startId: string, signal?: AbortSignal): Promise<GeoAncestry> {
  const found: { city: GeoPlace | null; region: GeoPlace | null; country: GeoPlace | null } = {
    city: null,
    region: null,
    country: null,
  };
  const grains = await resolveGeoGrains(signal);
  const seen = new Set<string>();
  let frontier: string[] = [startId];

  for (let hop = 0; hop <= MAX_MEMBER_OF_HOPS && frontier.length > 0; hop += 1) {
    const batch: string[] = [];
    for (const id of frontier) {
      if (seen.has(id)) continue; // ⚠ cycle guard — ingested data is not guaranteed acyclic
      seen.add(id);
      batch.push(id);
    }
    // One hop is a frontier of siblings — serial getPlace stacked City then Region
    // then Country on every saved address (~200 ms each on the live catalogue).
    const places = await Promise.all(batch.map((id) => getPlace(id, signal)));
    const next: string[] = [];
    for (const place of places) {
      if (!place) continue;
      const rung = grains.rungOf.get(place.type) ?? null;
      // First reached wins: the nearest ancestor at a rung is the right one.
      if (rung !== null && found[rung] === null) found[rung] = place;
      // Country is the root rung — nothing above it to walk to.
      if (rung === "country") continue;
      // CHANGED: a parent outside the catalogue is not followed (the fence would refuse it): the rung above it stays unreached, as for any
      // row whose parents do not lead to a country. GilbApp followed it with a request.
      next.push(...place.memberOf.filter((m) => isGeoUrl(m)));
    }
    frontier = next;
  }
  return found;
}

// CHANGED: `immediateParent` (GilbApp) is not taken: nothing calls it.

/** Search, then hydrate each hit so the person sees LABELS rather than ids.
 *  Sequential-with-cache rather than a burst: the catalogue is a shared service and a keystroke
 *  must not fan out unboundedly against it. */
async function hydrate(ids: readonly string[], limit: number, signal?: AbortSignal): Promise<GeoPlace[]> {
  const out: GeoPlace[] = [];
  for (const id of ids.slice(0, limit)) {
    const place = await getPlace(id, signal);
    // ⚠ A hit whose row will not dereference is DROPPED, not rendered as a blank option: an
    //   unlabelled row a person cannot read is not a choice they can make.
    if (place && place.label !== "") out.push(place);
  }
  return out;
}

/**
 * 🔴 THE ORDER A BOX LISTS ITS HITS IN (s8 city fix, Kai 2026-10-16: "Oslo does not come up as a city").
 *
 * ⚠ GilbGeo types the city of Oslo (and Bergen, and Stockholm) as a MUNICIPALITY, a type the ontology gives the grain
 * `settlement`, so the City box has always ACCEPTED it. What failed Kai was the order: the search merges the grains round-robin in the
 * order the ontology lists its types, which puts the administrative area "Oslo" (a region, "goes in your Region field, not City")
 * ABOVE the municipality. A person reading the top row concluded the city was not there.
 *
 * ⇒ Three tiers, then the catalogue's own order: (0) a hit of THIS box's own rung, (1) a hit whose type the ontology could not classify
 *   (it will be filed under this box, and says so), (2) a hit that belongs in another field. Inside a tier a hit that RECORDS a containing
 *   place goes before one that does not ("Oslo kommune", a point row with no `memberOf`, stays in the list, below the rows that say where
 *   they are). The rung of each type is the ONTOLOGY's (`rungOf`), ⛔ never a list of type names kept here, so a type the ontology later
 *   gives the grain `settlement` (a village, a locality) is a city from that moment with no change in this file.
 *
 * ⛔ Not a relevance ranking and not a filter: nothing is dropped, nothing is scored by its name, and the server's order decides every
 * tie (this app has no relevance authority over a catalogue it does not own). Stable; does not mutate `places`.
 */
export function rankHitsForRung(
  places: readonly GeoPlace[],
  rung: GeoRung,
  rungOf: ReadonlyMap<string, GeoRung>,
): GeoPlace[] {
  const tier = (p: GeoPlace) => {
    const r = rungOf.get(p.type);
    return r === rung ? 0 : r === undefined ? 1 : 2;
  };
  const recordsContainer = (p: GeoPlace) => (p.memberOf.length > 0 ? 0 : 1);
  return places
    .map((place, at) => ({ place, at }))
    .sort((a, b) => tier(a.place) - tier(b.place) || recordsContainer(a.place) - recordsContainer(b.place) || a.at - b.at)
    .map((x) => x.place);
}

export async function searchPlaces(
  q: string,
  rung: GeoRung,
  limit = 8,
  signal?: AbortSignal,
): Promise<GeoPlace[]> {
  const { ids } = await searchPlaceIds(q, rung, signal);
  const hits = await hydrate(ids, limit, signal);
  return rankHitsForRung(hits, rung, (await resolveGeoGrains(signal)).rungOf);
}

/**
 * 🔴 KAI'S SECOND DIRECTION — "if selecting a country, it only looks up cities from that country."
 *
 * There is ⛔ NO server-side parent filter (measured — every candidate parameter is refused), so
 * the restriction is applied HERE by resolving each hit's own ancestry and keeping only hits that
 * reach `countryId`. ⚠ This is a real narrowing of what the person is offered, ⛔ not a re-rank:
 * a city outside the chosen country is not shown at all.
 *
 * ⚠ A hit whose country cannot be resolved is EXCLUDED when a country is pinned. That is the
 * fail-closed direction and it is deliberate: including an unresolvable row would show a person
 * a city that may well be in another country, under a control that promised it was not. The cost
 * is that the 5.48% of rows with no country reach are unreachable while a country is pinned, and
 * that cost is stated on the surface rather than hidden.
 *
 * @param countryId absolute catalogue id of the pinned country, or null for no restriction
 */
/**
 * 🔴 THE CANDIDATE CEILING ON THE PINNED PATH — a measured defect fix, ⛔ not a tuning knob.
 *
 * ⚠ VATester measured ONE keystroke on the unbounded version: pinned "New York" issued
 * **994 requests / 158.27 MB / 4,744 ms** and returned **0 rows**. The cause is structural, not
 * incidental: the catalogue serves whole rows including `c_geometry` (the United States row is
 * **3.13 MB**) and offers ⛔ no field projection and ⛔ no parent filter, so resolving ancestry
 * for every hit drags megabytes per candidate. This module's own header promised *"a keystroke
 * must not fan out unboundedly against it"* — the comment contradicted the code, which is
 * escalated rather than reworded (`Rule_Code_commenting#RuleCommentAdjudicateFirst`).
 */
export const MAX_RESTRICTED_CANDIDATES = 24;

/**
 * 🔴 KAI'S SECOND DIRECTION — "if selecting a country, it only looks up cities from that country."
 *
 * There is ⛔ NO server-side parent filter (measured — every candidate parameter is refused), so
 * the restriction is applied HERE by resolving each hit's own ancestry and keeping only hits that
 * reach `countryId`. ⚠ This is a real narrowing of what the person is offered, ⛔ not a re-rank.
 *
 * ⚠ **The scan is CAPPED at {@link MAX_RESTRICTED_CANDIDATES} candidates, and the cap can hide a
 * real match.** That cost is stated rather than hidden: {@link RestrictedSearch.capped} is true
 * when the cap was reached, and the surface must say so instead of rendering an empty list as
 * "no such place". ⛔ An unbounded scan is not the safer choice — it was measured at 158 MB.
 *
 * ⚠ A hit whose country cannot be resolved is EXCLUDED while a country is pinned. That is the
 * fail-closed direction: including an unresolvable row would show a person a city that may well
 * be in another country, under a control that promised it was not.
 */
export interface RestrictedSearch {
  readonly hits: GeoPlace[];
  /** True when the candidate ceiling was hit — ⇒ an empty `hits` is ⛔ NOT "no such place". */
  readonly capped: boolean;
  /**
   * CHANGED (new, F13): how many scanned candidates were left out because NO country could be reached from them (the catalogue records
   * none, or a parent could not be read). They are not "other countries": the view must say they were not listed, and an empty `hits`
   * with `unplaced > 0` is ⛔ not "no such place". Always 0 when no country is pinned.
   */
  readonly unplaced: number;
}

export async function searchPlacesInCountryDetailed(
  q: string,
  rung: GeoRung,
  countryId: string | null,
  limit = 8,
  signal?: AbortSignal,
): Promise<RestrictedSearch> {
  if (!countryId) {
    const open = await searchPlaceIds(q, rung, signal);
    const rungOf = (await resolveGeoGrains(signal)).rungOf;
    return { hits: rankHitsForRung(await hydrate(open.ids, limit, signal), rung, rungOf), capped: open.incomplete, unplaced: 0 };
  }
  const { ids, incomplete } = await searchPlaceIds(q, rung, signal);
  const scanned = ids.slice(0, MAX_RESTRICTED_CANDIDATES);
  const out: GeoPlace[] = [];
  let unplaced = 0;
  for (const id of scanned) {
    if (out.length >= limit) break;
    const place = await getPlace(id, signal);
    if (!place || place.label === "") continue;
    const ancestry = await resolveAncestry(id, signal);
    if (ancestry.country === null) unplaced += 1;
    if (ancestry.country?.id === countryId) out.push(place);
  }
  // 🔴 THREE causes of "not the whole answer", ⛔ not one: this app's candidate ceiling, the
  //    SERVER's 20-per-grain truncation, and an unclassifiable catalogue type. Modelling only
  //    the first is what made a truncated scan render as "no matches" (VATester N6).
  return {
    hits: rankHitsForRung(out, rung, (await resolveGeoGrains(signal)).rungOf),
    capped: incomplete || (out.length < limit && ids.length > scanned.length),
    unplaced,
  };
}

// CHANGED: `searchPlacesInCountry` (GilbApp, a wrapper that drops `capped`) is not taken: nothing calls it.
