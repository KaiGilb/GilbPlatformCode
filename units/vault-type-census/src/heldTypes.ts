// What a vault's census of held types means, and which of its names go on the records door: the plane of each held type is learned by dereferencing its term.
// Taken from the app's held-types file, without the two symbols `lws-vault-sets` already holds (`MAX_PARALLEL_DEREFERENCES`, `mapWithConcurrency`).

import { baseOrigin, ontologyApiOriginRaw, vocabTypeBatchRevisions } from "@kaigilb/gilbplatformcode-base-origin";
import { MAX_PARALLEL_DEREFERENCES, mapWithConcurrency, typeLocalName } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import { classifyPlane, isCreatePlane, type VedaPlane } from "./vocabCatalog";

/**
 * The term fetcher and the parent walk of `ontology-reads`, loaded lazily: on the first census, not at module load. That
 * module pulls the ontology-section graph behind it, and importing it statically here would put that whole graph on every
 * path that imports the record hooks (it crashed graph-hook suites that close the record-type registry with a factory mock,
 * suites that never take the census branch). A dereference module that is needed only when a census is served is loaded when
 * a census is served. The functions are the same ones.
 */
type OntologyBrowse = typeof import("@kaigilb/gilbplatformcode-ontology-reads");
let ontologyBrowseInFlight: Promise<OntologyBrowse> | null = null;
function ontologyBrowse(): Promise<OntologyBrowse> {
  ontologyBrowseInFlight ??= import("@kaigilb/gilbplatformcode-ontology-reads");
  return ontologyBrowseInFlight;
}

/** A held type's plane, or `uncatalogued` when its term does not dereference. */
export type HeldTypePlane = VedaPlane | "uncatalogued";

/** The reading one census produced: planes per bare name, plus the request counts the per-view log reports beside the find
 * count. A sweep moved onto `/base/t/*` or `/base/vocab?type=` is invisible to a count of the records door alone, so it is counted
 * here and printed. */
export interface HeldTypePlaneReading {
  planes: Map<string, HeldTypePlane>;
    /**
     * Singular term lookups through the fetcher: one per held name on the singular path. A `termDocCache` hit is COUNTED (the fetcher
     * does not say whether it went to the wire), so this is an upper bound on `GET /base/t/<bare>` requests issued, not the request
     * count itself. The platform's own request log is the instrument for requests actually issued (measured on a rig: cold view,
     * 3 lookups = 3 requests; warm view, 3 lookups = 0 requests). Named `termLookups=` in the per-view log for that reason.
     */
  dereferences: number;
  /** Parent-chain walks issued for kind-absent terms (each is ≥ 1 further dereference). */
  parentWalks: number;
  /** Batched `GET /base/vocab?type=…` requests issued (0 unless the gate is open). */
  batched: number;
}

/** The largest `?type=` union one batched vocabulary read may name. */
const VOCAB_TYPE_BATCH_MAX = 100;

/** Whether a census name on this plane is ISSUED on `?type=`: the create planes (the one predicate `catalogNodeTypeNames` reads,
 * `isCreatePlane`) plus an uncatalogued name, issued un-anchored. Relation and attribute planes are never named on the records door. */
export function isIssuedOnTypeFind(plane: HeldTypePlane | undefined): boolean {
  if (plane === undefined) return false;
  return plane === "uncatalogued" || isCreatePlane(plane);
}

/**
 * The IRI a bare census name is dereferenced at: the term's identity origin, never the app's own origin.
 *
 * The platform apex's `/base/t/*` is host-identity-bound and answers 404 for every term (measured for Person, Task, NoteDocument
 * and CapableOf, four Accept variants; the ontology host's `/base/t/NoteDocument` answers 200). Built on the platform origin,
 * every held type on a served platform would have read `uncatalogued`. A term is identified by its catalog `@id`, so the
 * address comes from the one term-address rule, `defaultTermIri` of `ontology-reads`.
 *
 * The ontology API origin, when one was set (`ontologyApiOriginRaw()`), is honoured VERBATIM as the origin (scheme included),
 * so a local rig serving the terms over plain http can be named; unset in production.
 */
async function termIdentityIri(bareName: string): Promise<string> {
  const override = ontologyApiOriginRaw()?.trim();
  if (override) return `${override.replace(/\/$/, "")}/base/t/${encodeURIComponent(bareName)}`;
  const { defaultTermIri } = await ontologyBrowse();
  return defaultTermIri(bareName);
}

function publicVocabHeaders(): Record<string, string> {
  return { accept: "application/ld+json, application/json" };
}

/**
 * The plane of ONE held type by the singular dereference: the shipped term fetcher (+ its
 * `termDocCache`), then — only for a kind-absent term — the shipped parent-chain walk, then
 * the shipped `classifyPlane` over the term's own facts.
 */
async function singularPlane(
  bareName: string,
  counters: { dereferences: number; parentWalks: number },
): Promise<HeldTypePlane> {
  const iri = await termIdentityIri(bareName);
  const { fetchOntologyTerm } = await ontologyBrowse();
  counters.dereferences += 1;
  const doc = await fetchOntologyTerm(iri);
  if (!doc) return "uncatalogued";
  return planeOfTermFacts(doc.raw, iri, doc.term, counters);
}

/** `classifyPlane` over a term's facts; a kind-absent term walks its parent chain first, so
 * the derivation's `ancestors` argument carries the is-a line (`…/t/Relation`, `…/t/Function`
 * and `…/t/Identity` decide the plane there — the shipped rule, not a new one). */
async function planeOfTermFacts(
  raw: Record<string, unknown>,
  iri: string,
  selfTerm: string,
  counters: { parentWalks: number },
): Promise<VedaPlane> {
  const kind = raw["a:nodeKind"];
  let ancestors: string[] = [];
  if (typeof kind !== "string" || kind.trim() === "") {
    const { fetchParentChain } = await ontologyBrowse();
    counters.parentWalks += 1;
    const chain = await fetchParentChain(iri);
    ancestors = chain.map((d) => d.term).filter((t) => t !== selfTerm && t !== iri);
  }
  return classifyPlane(raw, ancestors);
}

// ── the served-revision gate for the batched read ────────────────────────────────────

function pinnedBatchRevisions(): string[] {
  const raw = vocabTypeBatchRevisions();
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

let servedRevisionInFlight: Promise<string | null> | null = null;

/** The Base revision the served `/version` answers with, read ONCE per session. */
async function servedBaseRevision(): Promise<string | null> {
  if (!servedRevisionInFlight) {
    servedRevisionInFlight = (async () => {
      try {
        const res = await fetch(`${baseOrigin()}/version`, { headers: { accept: "application/json" } });
        if (!res.ok) return null;
        const body = (await res.json()) as { revision?: unknown };
        return typeof body.revision === "string" && body.revision.length > 0 ? body.revision : null;
      } catch {
        return null;
      }
    })();
  }
  return servedRevisionInFlight;
}

/**
 * Is the batched `GET /base/vocab?type=…` read SERVED by the platform this app talks to? TRUE only when a pin names a revision
 * (or a prefix of one) and `/version` answers with it. No pin means false, which means the singular path.
 */
export async function vocabTypeBatchServed(): Promise<boolean> {
  const pins = pinnedBatchRevisions();
  if (pins.length === 0) return false;
  const rev = await servedBaseRevision();
  if (rev === null) return false;
  return pins.some((p) => rev.startsWith(p));
}

/** Test seam — forget the session's `/version` reading. ⛔ Not for production use. */
export function __resetServedRevisionForTest(): void {
  servedRevisionInFlight = null;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The batched form: one `GET /base/vocab?type=a&type=b…` per at most 100 names (the plural of `GET /base/t/:Type`). A term the
 * answer's `@graph` carries is classified over its node; a kind-absent node still needs its parent chain (singular, cached); a
 * name the graph does not carry is `uncatalogued`, read off the graph and not off any face key, so no wire spelling beyond
 * `@graph`/`@id` is assumed. A chunk that fails falls back to the singular path for its names: the plane is never left unknown
 * because a batch failed.
 */
async function batchedPlanes(
  names: readonly string[],
  counters: { dereferences: number; parentWalks: number; batched: number },
): Promise<Map<string, HeldTypePlane>> {
  const out = new Map<string, HeldTypePlane>();
  for (const names100 of chunk(names, VOCAB_TYPE_BATCH_MAX)) {
    const qs = names100.map((n) => `type=${encodeURIComponent(n)}`).join("&");
    let graph: Record<string, unknown>[] | null = null;
    try {
      counters.batched += 1;
      const res = await fetch(`${baseOrigin()}/base/vocab?${qs}`, { headers: publicVocabHeaders() });
      if (res.ok) {
        const doc = (await res.json()) as Record<string, unknown>;
        graph = Array.isArray(doc["@graph"]) ? (doc["@graph"] as Record<string, unknown>[]) : [];
      }
    } catch {
      graph = null;
    }
    if (graph === null) {
      const fallback = await mapWithConcurrency(names100, MAX_PARALLEL_DEREFERENCES, (n) =>
        singularPlane(n, counters),
      );
      names100.forEach((n, i) => out.set(n, fallback[i]!));
      continue;
    }
    const byName = new Map<string, Record<string, unknown>>();
    for (const node of graph) {
      const id = String(node["@id"] ?? "");
      if (id) byName.set(typeLocalName(id), node);
    }
    const planes = await mapWithConcurrency(names100, MAX_PARALLEL_DEREFERENCES, async (n) => {
      const node = byName.get(n);
      if (!node) return "uncatalogued" as const;
      const iri = await termIdentityIri(n);
      return planeOfTermFacts(node, iri, String(node["@id"] ?? iri), counters);
    });
    names100.forEach((n, i) => out.set(n, planes[i]!));
  }
  return out;
}

/**
 * The plane of every census-named type, by dereference. Bounded concurrency; one reading per hydrate; the counts it returns are
 * what the per-view log prints.
 */
export async function heldTypePlanes(bareNames: readonly string[]): Promise<HeldTypePlaneReading> {
  const counters = { dereferences: 0, parentWalks: 0, batched: 0 };
  const names = [...new Set(bareNames.map((n) => n.trim()).filter((n) => n.length > 0))];
  if (names.length === 0) return { planes: new Map(), ...counters };
  if (await vocabTypeBatchServed()) {
    const planes = await batchedPlanes(names, counters);
    return { planes, ...counters };
  }
  const planes = new Map<string, HeldTypePlane>();
  const readings = await mapWithConcurrency(names, MAX_PARALLEL_DEREFERENCES, (n) =>
    singularPlane(n, counters),
  );
  names.forEach((n, i) => planes.set(n, readings[i]!));
  return { planes, ...counters };
}

// ── one derivation of "which of a vault's held types go on `?type=`" ──────────────────────
//
// This block was inline in the hydrate function of the record hooks and nowhere else, so the grid asked the vault which types it
// holds while the search asked the global catalogue which types exist. Those are different questions with different answers, and
// the second one does not work: the opt-in listing is 233 MB / 16,754 terms, which the nodes-view search turned into about 15,000
// `type=` params (376 KB of URI) that the edge dropped outright. Lifted here as the PURE pair `censusBareNames` +
// `classifyCensusNames`, so the grid and the search change together when the plane rules change.
//
// The census itself is deliberately NOT fetched here. `listVaultHeldTypes` (in `lws-vault-sets`) is the caller's to call; the caller
// passes the rows in. The shared thing is the derivation, which is where the two surfaces had drifted.

/** The issued / not-issued / uncatalogued split of one census's names. */
export interface IssuableTypeNames {
  /** Bare local names that ARE issued on `?type=` — entity / function / value planes. */
  issued: string[];
  /** Held names deliberately NOT issued: relation and attribute planes. */
  notIssued: string[];
    /** Issued names whose term did not dereference (issued anyway, un-anchored). */
  uncatalogued: string[];
}

/**
 * A vault census's rows → the distinct BARE local names it holds.
 *
 * The store emits up to three spellings of one type, so names merge by bare local name.
 *
 * @param heldTypes the census's `types` rows (only `typeUri` is read)
 */
export function censusBareNames(heldTypes: readonly { typeUri: string }[]): string[] {
  return [
    ...new Set(heldTypes.map((t) => typeLocalName(t.typeUri).trim()).filter((n) => n.length > 0)),
  ];
}

/**
 * Bare names + their dereferenced planes → which go on `?type=`.
 *
 * PURE, and deliberately so. An earlier draft of this extraction also fetched the planes, which moved the `heldTypePlanes` call
 * inside this module and made it invisible to a spy on `heldTypePlanes`, silently blinding the per-view request-count
 * instrument. The caller keeps making that call, so the instrument still sees it; only the classification is shared.
 *
 * A name whose term does not dereference is STILL issued: it surfaces un-anchored under its own name rather than vanishing.
 */
export function classifyCensusNames(
  bare: readonly string[],
  reading: HeldTypePlaneReading,
): IssuableTypeNames {
  return {
    issued: bare.filter((n) => isIssuedOnTypeFind(reading.planes.get(n))),
    notIssued: bare.filter((n) => !isIssuedOnTypeFind(reading.planes.get(n))),
    uncatalogued: bare.filter((n) => reading.planes.get(n) === "uncatalogued"),
  };
}

// ── the chosen types, narrowed to what the vault's census holds ──────────────────────────
//
// The hydrate function takes the chosen type names and intersects them with the census before it issues `?type=`. Without a
// choice the grid asks for the 100 densest held types, so in a vault holding more than 100 types a type with few records can be
// left out of the ask entirely (a 500-record, 133-type scratch vault listed 0 of 9 seeded stakeholders that way).
//
// Why a chosen relation kind is issued here, when `classifyCensusNames` above never issues one. Measured on a scratch rig for the
// three relation kinds the stakeholder package resolved live: the typed read returned the seeded role record on both address forms
// (6 of 6); the census put the kind under `excludedTypes` in the vault whose relations sit under `/base/r/` (3 of 3), and under
// `types` in the one whose relations sit under `/vault/r/` (3 of 3). Each of those kinds' terms says `a:nodeKind relation`, the
// plane `isIssuedOnTypeFind` refuses. So with no rule here a role record could not be listed on either form. The relation
// exclusion exists for the UNCHOSEN grid, where edges would flood a person's records; the platform scopes its own exclusion the
// same way: with `?type=` it filters by type alone.
//
// And why only the relation plane crosses from `excludedTypes`. That list also carries the door's name-set exclusions, which are
// not records: for example File, Vault, TagHandle and AppUiPreferences. Choosing the File facet must keep listing files through
// the Files read, never as grid rows. The census does not say why a group was excluded, so the term's own plane decides, read by
// the same dereference the grid already uses (`heldTypePlanes`). No list of names here.
// Known limit: an excluded name whose term does not dereference reads `uncatalogued`, is not known to be a relation, and is not
// issued.

/** The census names a person's chosen types select, in the store's own bare spelling. */
export interface ChosenCensusCandidates {
  /** Chosen names the census lists under `types`. */
  held: string[];
  /** Chosen names the census lists only under `excludedTypes` (the door's G7 filter). */
  excluded: string[];
}

/**
 * Split a census into the names a person's chosen types select.
 *
 * PURE, like the pair above, so the `heldTypePlanes` call stays in the caller where the per-view request instrument sees it.
 *
 * @param census the vault's census rows (only `typeUri` is read)
 * @param isChosen whether a type (bare name, CURIE or URI) is one the person chose; the caller builds it from the SAME key the
 *   grid's browser-side type filter compares with
 */
export function chosenCensusCandidates(
  census: {
    types: readonly { typeUri: string }[];
    excludedTypes: readonly { typeUri: string }[];
  },
  isChosen: (typeUri: string) => boolean,
): ChosenCensusCandidates {
  const held = censusBareNames(census.types.filter((t) => isChosen(t.typeUri)));
  const heldSet = new Set(held);
  const excluded = censusBareNames(census.excludedTypes.filter((t) => isChosen(t.typeUri))).filter(
    (n) => !heldSet.has(n),
  );
  return { held, excluded };
}

/**
 * Which chosen census names go on `?type=`.
 *
 * From `types`: whatever the unchosen grid issues (`isIssuedOnTypeFind`), and a relation kind.
 * From `excludedTypes`: a relation kind only.
 *
 * An attribute-plane name stays unissued either way, as it is for the unchosen grid.
 * `relation` names the issued names that are relation kinds.
 *
 * @param candidates the output of {@link chosenCensusCandidates}
 * @param reading the planes of those names, from {@link heldTypePlanes}
 */
export function issueChosenCensusNames(
  candidates: ChosenCensusCandidates,
  reading: HeldTypePlaneReading,
): { issued: string[]; notIssued: string[]; relation: string[] } {
  const isRelation = (n: string) => reading.planes.get(n) === "relation";
  const fromHeld = candidates.held.filter((n) => isIssuedOnTypeFind(reading.planes.get(n)) || isRelation(n));
  const fromExcluded = candidates.excluded.filter(isRelation);
  const issued = [...fromHeld, ...fromExcluded];
  const issuedSet = new Set(issued);
  return {
    issued,
    notIssued: [...candidates.held, ...candidates.excluded].filter((n) => !issuedSet.has(n)),
    // The issued names that are relation kinds. The caller keeps their rows out of the device
    // store, so a later view with no choice is not widened by them.
    relation: issued.filter(isRelation),
  };
}
