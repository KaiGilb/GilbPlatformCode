// One term of the ontology, read by its address (`/base/t/<Name>`) with the session's short-lived cache, and the walk up its is-a parents.
// Taken from the app's ontology browse file: only what `fetchOntologyTerm` and `fetchParentChain` reach.

import { defaultOntologyHost } from "./ontologyBrowse";

export type OntologyKind = "type" | "function" | "value";

export interface OntologyTermDoc {
  term: string;
  name: string;
  label: string;
  does: string;
  status: string;
  module: string;
  kind: OntologyKind;
  parentTerm: string | null;
  /** Type → functions (class-level capability-at-will). */
  capableOf: string[];
  /** Type/instance → functions (affordance / instance capability). */
  providesFunction: string[];
  /** Function/type → values that quantify it. */
  hasValue: string[];
  measures: string | null;
  endpointSubject: string | null;
  /**
   * Non-null when this document could NOT be resolved to a term-plane identity — it holds
   * the ref we were handed instead. `term`/`name` then describe a STORE LOCATION, not a
   * concept, and no navigation surface may present them as an opener.
   *
   * ⚠ Kept as a field rather than inferred at each render site: "is this thing openable"
   * is a property of the document, and the defect this repairs was every call site
   * separately assuming the answer was yes.
   */
  unresolvedRef: string | null;
  raw: Record<string, unknown>;
}

const PARENT_CHAIN_MAX = 24;

// is-a children: direct only — click a child to open the next level (no multi-depth flood).

function publicHeaders(): Record<string, string> {
  return { accept: "application/json, application/ld+json" };
}

/**
 * HTTP hops need a SINGLE `/base/t/:Name` token.
 *
 * 🔴 Named cause (2026-09-15): some Function documents declare
 * `a:typeUri` as pipe-joined aliases. `fetchLiveChildren` used to concatenate
 * that whole string + `/children`. Live: the first alias's `/children` is 200
 * with the real is-a kids; the joined string (even percent-encoded) is 404
 * Fastify "Route GET:… not found". Encoding is not the fix. The stored join
 * is an ontology identity defect; this client hops each token.
 *
 * A token is hop-able when it is one term-plane IRI — scheme, host, `/base/t/`,
 * local name, nothing else. ⛔ Do not "fix" this by encoding the pipe.
 */
const HOPABLE_TERM_IRI = /^https?:\/\/[^/?#]+\/base\/t\/[^/?#|]+$/;

/**
 * Split a declared identity into hop-able term IRIs.
 *
 * @param identity - A term IRI, or a pipe-joined `a:typeUri`
 * @returns Each `/base/t/:Name` token, in declaration order, de-duplicated
 */
export function hopableTermIris(identity: string): string[] {
  const hops: string[] = [];
  const seen = new Set<string>();
  for (const part of identity.split("|")) {
    const iri = part.trim().replace(/\/$/, "");
    if (!HOPABLE_TERM_IRI.test(iri)) continue;
    if (seen.has(iri)) continue;
    seen.add(iri);
    hops.push(iri);
  }
  return hops;
}

function hopableTermIri(identity: string, preferred?: string): string | null {
  const hops = hopableTermIris(identity);
  if (!hops.length) return null;
  if (preferred) {
    const pref = hopableTermIris(preferred)[0] ?? preferred.replace(/\/$/, "");
    const hit = hops.find((h) => h === pref);
    if (hit) return hit;
  }
  return hops[0];
}

function typeNameFromIri(iri: string): string {
  const hop = hopableTermIris(iri)[0] ?? iri;
  const tail = hop.split("/").pop() ?? "";
  return decodeURIComponent(tail.split("#").pop() ?? tail);
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/**
 * The `@id` of a node ref (or the ref itself when given as a bare string).
 *
 * ⚠ ABSOLUTE-ONLY, and that is a MEASURED choice, not an oversight. The entity plane does
 * serve compact CURIEs (`{"@id": "base:e/7s3t4nmegdc5"}`), and an earlier cut of this fix
 * expanded them, on the theory that dropping them truncated the ancestor walk a second way.
 * ⛔ THAT THEORY WAS FALSIFIED HERE: with refs dereferenced through `fetchTermAtRef`, every
 * ref this client consumes comes off the TERM plane, which serves them absolute — measured
 * 15,888 node refs across 250 term documents, of which 3 are non-http and all 3 are
 * external `urn:planguage:` IRIs that must NOT be rewritten. Disabling CURIE expansion left
 * the guard fully GREEN, so the expansion was code no test could fail on. It is not here.
 */
/**
 * An OPAQUE STORE ID, as opposed to a term NAME.
 *
 * 🔴 Measured, not guessed (2026-08-20). The predicate below was run against every
 * one of the **15,906** term names in `public/ontology-neighbourhood.json`: **0** of them match.
 * It does match the store ids this app actually meets — `3ehvnp0kqwha`, `7s3t4nmegdc5` — and
 * principal UUIDs.
 *
 * ⚠ Why it is this shape and not something simpler. Exactly 7 corpus names do not begin with an
 * uppercase letter: `3DBodyScanningTechnologies`, `3DLighting`, `3DModelling`, `3DPrintingProcess`,
 * `3DTexturing`, `5SMethodology`, `improvement`. So "starts with a digit ⇒ id" would break five
 * real terms, and "is all lowercase ⇒ id" would break `improvement`. Requiring **a digit AND no
 * uppercase AND ≥10 chars** clears all seven. ⛔ Do not "simplify" this without re-running the
 * corpus check — the names that defeat the simple rules are real and live.
 */
const STORE_ID_RE = /^(?=.*[0-9])[0-9a-z]{10,}$/;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function looksLikeStoreId(ref: string): boolean {
  return STORE_ID_RE.test(ref) || UUID_RE.test(ref);
}

/**
 * Expand a stored ref to an ABSOLUTE IRI on the correct plane.
 *
 * 🔴 This is the ONE address rule for the whole Ontology section. Both panes used to build
 * `https://<host>/base/t/<whatever>` unconditionally, which is why `?oc=3ehvnp0kqwha` asked the
 * single address of the three that 404s (measured 2026-08-20 — see ontologyAddress.test.ts).
 *
 * Accepts: an absolute IRI (passed through — identity, not location),
 * a CURIE (`base:e/…`, `base:t/…`, `base:p/…`), a bare store id, or a bare term name.
 */
export function ontologyRefIri(ref: string, host = defaultOntologyHost()): string {
  const r = ref.trim();
  if (!r) return r;
  if (r.startsWith("http://") || r.startsWith("https://")) return r;
  // CURIE — `base:e/7s3t4nmegdc5`, `base:t/Chair`, `base:p/veda-system`.
  const curie = /^base:([a-z]+)\/(.+)$/.exec(r);
  if (curie) return `https://${host}/base/${curie[1]}/${encodeURIComponent(curie[2])}`;
  // A bare opaque id lives on the ENTITY plane; a bare name lives on the TYPE plane.
  const plane = looksLikeStoreId(r) ? "e" : "t";
  return `https://${host}/base/${plane}/${encodeURIComponent(r)}`;
}

/**
 * ⚠ Was: `return v.startsWith("http") ? v: null` — which SILENTLY DROPPED every CURIE.
 * The entity plane serves `subTypeOf: {"@id": "base:e/7s3t4nmegdc5"}`, so a term reached by its
 * store id lost its parent, its is-a chain and every connected edge, and the columns rendered
 * "No connected …". Expanding the CURIE is what fills TYPES / FUNCTIONS / VALUES.
 */
function refIdOf(v: unknown): string | null {
  const asRef = (s: string): string | null => {
    if (s.startsWith("http")) return s;
    if (/^base:[a-z]+\//.test(s)) return ontologyRefIri(s);
    return null;
  };
  if (typeof v === "string") return asRef(v);
  if (v && typeof v === "object" && "@id" in v) {
    const id = (v as { "@id": unknown })["@id"];
    if (typeof id === "string") return asRef(id);
  }
  return null;
}

function pickId(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const id = refIdOf(obj[k]);
    if (id) return id;
  }
  return null;
}

function pickIds(obj: Record<string, unknown>, ...keys: string[]): string[] {
  const out: string[] = [];
  for (const k of keys) {
    const v = obj[k];
    if (v == null) continue;
    const items = Array.isArray(v) ? v : [v];
    for (const item of items) {
      const id = refIdOf(item);
      if (id) out.push(id);
    }
  }
  return [...new Set(out)];
}

/**
 * BaseAppVeda plane rule: nodeKind function | value; else type.
 * Accepts framed `a:nodeKind` and bare `nodeKind` (entity plane).
 */
export function kindFromRaw(raw: Record<string, unknown>): OntologyKind {
  const nk = pickString(raw, "a:nodeKind", "nodeKind").toLowerCase();
  if (nk === "function") return "function";
  if (nk === "value") return "value";
  // Retired @type t:Function / t:Value still appear on some fixtures.
  const t = raw["@type"];
  const types = Array.isArray(t) ? t : t != null ? [t] : [];
  for (const x of types) {
    const s = typeof x === "string" ? x : "";
    if (s === "t:Function" || /\/t\/Function$/.test(s)) return "function";
    if (s === "t:Value" || /\/t\/Value$/.test(s)) return "value";
  }
  return "type";
}

async function fetchOntologyEntityAsTerm(
  entityIri: string,
  termIriHint: string,
): Promise<OntologyTermDoc | null> {
  try {
    const res = await fetch(entityIri, { headers: publicHeaders() });
    if (!res.ok) return null;
    const raw = (await res.json()) as Record<string, unknown>;
    return docFromRaw(termIriHint || entityIri, raw);
  } catch {
    return null;
  }
}

/**
 * The CANONICAL term identity a document declares for itself.
 *
 * 🔴 THE NAMED CAUSE, in one function. Identity is a property the document STATES; the IRI
 * we happened to fetch through is a LOCATION. Base stamps the stated one into `a:typeUri`
 * (term plane) / `typeUri` (entity plane) on every node — measured present on every entity
 * sampled — and it always names the term plane: `/base/e/7s3t4nmegdc5` declares
 * `typeUri: https://ontology.example.test/base/t/Furnishing`.
 *
 * Reading identity off the fetch location instead is what turned a hierarchy parent into
 * the bare string `7s3t4nmegdc5`, which then reached `?oc=` and `/base/t/<that>` — a route
 * that resolves by NAME and 404s on a store id. Every downstream surface inherited it.
 *
 * Order: declared `typeUri` → a term-plane `@id` → a term-plane fetch IRI → UNRESOLVED.
 *
 * A pipe-joined declared typeUri is still THAT document's identity, but it is
 * not a hop-able URL. Prefer the IRI we fetched through when it is one of the
 * declared aliases; otherwise the first hop-able token. Downstream `/children`
 * and `?oc=` must receive a single `/base/t/:Name`.
 */
function canonicalIdentity(
  raw: Record<string, unknown>,
  fetchedIri: string,
): { term: string; unresolvedRef: string | null } {
  const declared = pickString(raw, "a:typeUri", "typeUri");
  const fromDeclared = hopableTermIri(declared, fetchedIri);
  if (fromDeclared) return { term: fromDeclared, unresolvedRef: null };
  const id = raw["@id"];
  if (typeof id === "string") {
    const fromId = hopableTermIri(id, fetchedIri);
    if (fromId) return { term: fromId, unresolvedRef: null };
  }
  const fromFetched = hopableTermIri(fetchedIri);
  if (fromFetched) return { term: fromFetched, unresolvedRef: null };
  if (fetchedIri.includes("/base/t/")) return { term: fetchedIri, unresolvedRef: null };
  // ⛔ No guess. An unresolvable ref is reported as absent, never dressed up as a name.
  return { term: fetchedIri, unresolvedRef: fetchedIri };
}

function docFromRaw(termIri: string, raw: Record<string, unknown>): OntologyTermDoc {
  const { term, unresolvedRef } = canonicalIdentity(raw, termIri);
  const name = typeNameFromIri(term);
  return {
    term,
    name,
    // An unresolved node still has a human label — show THAT, never the store id.
    label: pickString(raw, "a:label", "label") || (unresolvedRef ? "" : name),
    does: pickString(raw, "a:does", "does"),
    status: pickString(raw, "a:ontologyStatus", "ontologyStatus", "status"),
    module: pickString(raw, "a:module", "module"),
    kind: kindFromRaw(raw),
    // Parent may be /base/t/… or /base/e/… — dereferenced by fetchTermAtRef, the only
    // place that crosses the planes.
    parentTerm: pickId(raw, "a:subTypeOf", "subTypeOf"),
    capableOf: pickIds(raw, "a:capableOf", "capableOf"),
    providesFunction: pickIds(raw, "a:providesFunction", "providesFunction"),
    hasValue: pickIds(raw, "a:hasValue", "hasValue"),
    // Values often use a:value-of (legacy) rather than a:measures — both mean "Function quantified".
    measures:
      pickId(raw, "a:measures", "measures") ||
      pickId(raw, "a:value-of", "value-of", "valueOf"),
    endpointSubject: pickId(raw, "a:endpointSubject", "endpointSubject"),
    unresolvedRef,
    raw,
  };
}

/** In-memory term cache — avoids re-fetching the same /base/t/… within a session. */
const termDocCache = new Map<string, { at: number; doc: OntologyTermDoc | null }>();

/**
 * In-flight reads, keyed `<termIri>|<cache mode>`. `revalidate` deletes the shared `termDocCache` entry, so two callers asking for
 * the same term at the same moment (a pane and the focus loader) would otherwise issue two requests where the cached path
 * issues one. Concurrent identical reads therefore await ONE request. This holds for every mode: two callers asking the
 * same question at the same instant have one answer.
 */
const termDocInFlight = new Map<string, Promise<OntologyTermDoc | null>>();

/** Monotonic tiebreaker so a `bust` url is unique even for several busts inside one millisecond. */
let bustSeq = 0;

const TERM_CACHE_TTL_MS = 5 * 60_000;

export async function fetchOntologyTerm(
  termIri: string,
  opts?: {
    /** Bypass in-memory + CDN-ish cache after hierarchy/content edits. */
    bust?: boolean;
    /**
     * Force a CONDITIONAL re-read (`If-None-Match` → 304) instead of trusting the door's
     * `max-age`. Use on any read that must be TRUTHFUL about a term a user can edit —
     * `bust` is the heavier hammer for the moment straight after a write.
     */
    revalidate?: boolean;
  },
): Promise<OntologyTermDoc | null> {
  if (!termIri) return null;
  const hop = hopableTermIris(termIri)[0] ?? termIri;
  if (!hop.includes("/base/t/")) return null;
  termIri = hop;

  // `bust` is never coalesced. It mints a unique url (`?_=<time>-<counter>`) precisely so that no cache anywhere can answer it; keying
  // the in-flight map on `termIri` would throw that uniqueness away, and a second blur-save landing inside one round-trip would join the
  // first save's request and render the pre-second-save body (an edit that "snapped back"). `bust` means "answer me from the origin,
  // now, alone": two busts are two questions. Do not fold bust back into the coalescing path.
  if (opts?.bust) return fetchOntologyTermOnce(termIri, opts);

  // Coalesce concurrent identical reads onto ONE request — see `termDocInFlight`.
  const mode = opts?.revalidate ? "revalidate" : "default";
  const key = `${termIri}|${mode}`;
  const inFlight = termDocInFlight.get(key);
  if (inFlight) return inFlight;
  const pending = fetchOntologyTermOnce(termIri, opts).finally(() => {
    // Delete only your own entry. An unconditional `delete(key)` collides with the eviction in `invalidateOntologyTermCache`: after a write
    // invalidates mid-flight, a second reader installs a new entry under this same key, and the first reader's `finally`, arriving
    // later, would drop the second reader's entry, so a third reader opens a third request instead of joining the second. The
    // extra request is fresher, never staler.
    if (termDocInFlight.get(key) === pending) termDocInFlight.delete(key);
  });
  termDocInFlight.set(key, pending);
  return pending;
}

/** The single un-coalesced read. ⛔ Call `fetchOntologyTerm`, never this. */
async function fetchOntologyTermOnce(
  termIri: string,
  opts?: { bust?: boolean; revalidate?: boolean },
): Promise<OntologyTermDoc | null> {
  if (!termIri) return null;
  // Only dereference vocabulary type IRIs here; entities use fetchOntologyEntityAsTerm.
  if (!termIri.includes("/base/t/")) return null;
  if (opts?.bust || opts?.revalidate) termDocCache.delete(termIri);
  else {
    const cached = termDocCache.get(termIri);
    if (cached && Date.now() - cached.at < TERM_CACHE_TTL_MS) return cached.doc;
  }

  // The ontology host serves public max-age=3600, so a bust query makes parent moves visible. `Date.now()` alone is not unique (four
  // busts in one tick gave one distinct url), and uniqueness is the rationale for never coalescing `bust`, so the url also carries a
  // monotonic counter.
  const buster = `${Date.now()}-${++bustSeq}`;
  const url =
    opts?.bust && !termIri.includes("?")
      ? `${termIri}?_=${buster}`
      : opts?.bust
        ? `${termIri}&_=${buster}`
        : termIri;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: publicHeaders(),
      // `"default"` here is why a saved edit came back old after a refresh. The ontology door serves `cache-control: public,
      // max-age=3600`, and `"default"` lets the browser answer from its own HTTP cache for a full hour without asking the origin, so a
      // reload re-rendered the pre-edit document. `invalidateOntologyTermCache` reaches the in-memory `termDocCache` only, not the
      // browser's HTTP cache. `"no-cache"` is not `"no-store"`: it keeps the cache and forces revalidation (`If-None-Match`, answered 304 with
      // an empty body), so correctness is restored without paying for the body.
      cache: opts?.bust ? "no-store" : opts?.revalidate ? "no-cache" : "default",
    });
  } catch {
    termDocCache.set(termIri, { at: Date.now(), doc: null });
    return null;
  }
  if (!res.ok) {
    termDocCache.set(termIri, { at: Date.now(), doc: null });
    return null;
  }
  let raw: Record<string, unknown>;
  try {
    raw = (await res.json()) as Record<string, unknown>;
  } catch {
    termDocCache.set(termIri, { at: Date.now(), doc: null });
    return null;
  }
  // Always store under the canonical term IRI (no cache-buster query).
  const doc = docFromRaw(termIri, raw);
  termDocCache.set(termIri, { at: Date.now(), doc });
  return doc;
}

/**
 * Dereference ANY ontology node ref to the published TERM document it identifies.
 *
 * 🔴 THE ONE PLACE THE PLANES ARE CROSSED. `/base/t/<Name>` resolves by NAME and is the
 * identity surface; `/base/e/<storeId>` is the store location. 12,597 of 12,601 stored
 * `a:subTypeOf` values point at the entity plane, so a client that never crosses back
 * cannot open a hierarchy parent at all.
 *
 * Entity ref → read the entity document → take the `typeUri` IT declares → load the
 * PUBLISHED term at that identity. The term document is what carries the definition,
 * status and alignment the viewer renders; the entity document is a projection of the
 * same node and would put a store ULID in `PERMANENT URI`.
 *
 * ⚠ Falls back to the entity document — LABEL intact, `unresolvedRef` set — rather than
 * returning null: an ancestor we can name but not open is information, and hiding it
 * would restore the silent truncation this repairs.
 */
export async function fetchTermAtRef(
  ref: string,
  opts?: { bust?: boolean; revalidate?: boolean },
): Promise<OntologyTermDoc | null> {
  if (!ref) return null;
  // ⚠ A ref reaching here may be BARE — `?oc=` carries a name or a store id, not an IRI — or a
  // CURIE from the entity plane. Resolve to an absolute IRI on the right plane FIRST; before this
  // a bare store id fell through to `return null` and the pane said "Could not load this term."
  const iri = ontologyRefIri(ref);
  if (iri.includes("/base/t/")) return fetchOntologyTerm(iri, opts);
  if (!iri.includes("/base/e/")) return null;

  const entity = await fetchOntologyEntityAsTerm(iri, iri);
  if (!entity) return null;
  if (entity.unresolvedRef === null && entity.term !== ref) {
    const published = await fetchOntologyTerm(entity.term, opts);
    if (published) return published;
  }
  return entity;
}

/**
 * is-a ancestor chain, leaf→root then reversed to root→leaf.
 *
 * Live /base/t/ walk only. ⛔ Snapshot is not a fallback.
 *
 * Every hop goes through fetchTermAtRef, so a chain that dips onto the entity plane comes
 * back with term-plane identity and KEEPS WALKING. Before this it stopped dead at the
 * first entity hop and the level above it silently vanished.
 */
export async function fetchParentChain(
  startIri: string,
  opts?: { sameKindOnly?: boolean; bust?: boolean },
): Promise<OntologyTermDoc[]> {
  const chain: OntologyTermDoc[] = [];
  const seen = new Set<string>();
  let current: string | null = startIri;
  let focusKind: OntologyKind | null = null;

  while (current && chain.length < PARENT_CHAIN_MAX && !seen.has(current)) {
    seen.add(current);
    // Bust only the focus hop when requested; ancestors are rarely the edited edge.
    const bust = Boolean(opts?.bust && chain.length === 0);
    const doc = await fetchTermAtRef(current, bust ? { bust: true } : undefined);
    if (!doc) break;
    if (focusKind === null) focusKind = doc.kind;
    if (opts?.sameKindOnly && doc.kind !== focusKind) break;
    // A ref and the identity it resolves to are ONE node — mark both, or an entity ref
    // whose term re-declares the same parent would walk itself forever.
    //
    // 🔴 The cycle test asks "is this node ALREADY IN THE CHAIN?", not "have I seen this
    // address?". It used to read `seen.has(doc.term)`, but `current` is added to `seen` at the
    // top of this same iteration — and for an ordinary term-plane ref `doc.term === current`,
    // so the condition was true on the SECOND hop of every walk and the loop broke there.
    // Measured on the live master before this repair: fetchParentChain(/base/t/Chair) returned
    // ["Chair"] and fetchParentChain(/base/t/RockingChair) returned ["RockingChair"] — the leaf
    // and nothing else, which is what rendered "No connected …" under TYPES/FUNCTIONS/VALUES.
    if (chain.some((d) => d.term === doc.term)) break;
    seen.add(doc.term);
    chain.push(doc);
    current = doc.parentTerm;
  }

  if (chain.length > 0) return chain.reverse();
  // ⛔ No snapshot fallback. A live miss is honest empty, not the 2026-08-12 picture.
  return [];
}

/** Test seam: forget the session's term cache and the reads in flight. Not for production use. */
export function __resetOntologyTermsForTest(): void {
  termDocCache.clear();
  termDocInFlight.clear();
}
