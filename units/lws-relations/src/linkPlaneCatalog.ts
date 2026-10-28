// Live link-plane catalog — Cycle140.
//
// RuleBpontLinkPlaneDeclared: the live master is the SSoT for which predicates a person
// may pick. ⛔ NEVER a hardcoded OFFERABLE_PREDICATES table as the catalog.
//
// Command (agents): GET /base/vocab?status=all → filter a:linkPlane.
// App path (same SSoT, SpeedGate-safe): GET /base/vocab?status=all&linkPlane=user
// — server-side filter of that same listing. The unfiltered status=all document is
// 218 MB on M1 (2026-08-15); a person-picker must not download it.
//
// Absence of a:linkPlane is fail-safe: the term is simply not returned.

import { corpusApiOrigin } from "@kaigilb/gilbplatformcode-ontology-reads";

export const LINK_PLANES = ["user", "process", "grant", "classification"] as const;
export type LinkPlaneName = (typeof LINK_PLANES)[number];

export interface LinkTerm {
  iri: string;
  /** Wire `@type` CURIE. Prefer `a:typeAttribute`; else `t:` + IRI tail. */
  curie: string;
  label: string;
  /**
   * Cycle214 S5c: false when the term carries NO `a:label` (then `label` above is the IRI tail). The contact header shows such a term by its
   * own name, its CURIE, never a made-up word (design note C214-OneCard section 2). Absent on catalogs built before S5c (tests): read as labelled.
   */
  labelled?: boolean;
  parentIri: string | null;
  parentCurie: string | null;
  plane: LinkPlaneName;
  directed: boolean;
  symmetric: boolean;
  typeAttribute: string | null;
  /** `a:does` when the vocab graph carried it. Absence is real. */
  does: string | null;
  /** `a:transitive` — closure is legal along this edge (part-of chains, ancestor-of). */
  transitive: boolean;
  /**
   * `a:inverseOf` — the PAIRED predicate that states the identical fact with the ends
   * swapped (`parent-of` → `child-of`). Reading this edge backwards uses the paired
   * term's OWN label, not a phrase stored here.
   */
  inverseOfCurie: string | null;
  /**
   * `a:inverseLabel` — the phrase for reading THIS term backwards without a second
   * term (`part-of` → "has part").
   *
   * ⚠ `a:inverseOf` and `a:inverseLabel` are COMPLEMENTS, never both on one term, and a
   * symmetric predicate carries neither by design (backwards is the same words). The
   * mint tools refuse the illegal combinations; `reverseReading` does not assume they
   * succeeded — it reports what it actually found.
   */
  inverseLabel: string | null;
  /**
   * `a:composesTo` — an ORDERED predicate chain meaning "this edge equals walking those
   * edges in this order". `grandparent-of` → [`parent-of`, `parent-of`].
   *
   * 🔴 ORDER IS SIGNIFICANT and this array preserves it. A composed predicate stays
   * DIRECTLY ASSERTABLE — real data is incomplete, so a stored `grandparent-of` fact is
   * a first-class fact, not a derivation error.
   */
  composesTo: readonly string[];
  /**
   * `a:genderedLabel` — the noun for this predicate's SUBJECT at a given gender, in
   * TOKEN-KEYED form: `"female=daughter|male=son"`.
   *
   * 🔴 TOKEN-KEYED, ⛔ NEVER POSITIONAL. `a:gender`'s token space is deliberately open
   * (*"DELIBERATELY NOT A CLOSED ENUM… absence is not an error"*), so
   * a fixed `[female, male]` order would close that enum through the back door. Segments
   * are parsed by key and an unknown key is simply not matched.
   *
   * Raw as served; `genderedLabel` in predicateTree.ts does the parsing.
   */
  genderedLabel: string | null;
}

export interface LinkPlaneCatalog {
  plane: LinkPlaneName;
  terms: readonly LinkTerm[];
  /** User-plane roots: parent is the Relation category, or parent is not itself user-plane. */
  roots: readonly LinkTerm[];
  stale: boolean;
  /**
   * Terms the catalog could not give a single writable type string (dead-bound or
   * ambiguous `a:typeAttribute`). Empty on every measured pull to date — carried so the
   * condition is REPORTABLE rather than inferred from a shorter list
   * (RuleBaseappAbsenceNotTruth: a dropped term and an absent term are different claims).
   */
  excludedUnwritable: readonly string[];
}

const RELATION_TAIL = "/t/Relation";
const TTL_MS = 60_000;

let cached: LinkPlaneCatalog | null = null;
let cachedAt = 0;
let inFlight: Promise<LinkPlaneCatalog> | null = null;
const byCurie = new Map<string, LinkTerm>();

function publicHeaders(): Record<string, string> {
  // Same CORS fence as vocabCatalog.ts — no authorization on the public vocab surface.
  return { accept: "application/ld+json, application/json" };
}

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (v && typeof v === "object") {
    if ("@value" in v) {
      const inner = (v as { "@value": unknown })["@value"];
      if (typeof inner === "string" && inner.trim()) return inner.trim();
    }
    if ("@id" in v) {
      const id = (v as { "@id": unknown })["@id"];
      return typeof id === "string" ? id : null;
    }
  }
  return null;
}

/**
 * Read an ORDERED reference list (`a:composesTo`). JSON-LD plain arrays carry no order
 * guarantee in the abstract model, but the Gilb serve layer emits and preserves authored
 * order, and `a:composesTo`'s whole meaning is the sequence — so served order IS the
 * chain. A single (non-array) value is a one-step chain.
 */
function asOrderedIris(v: unknown): string[] {
  const items = Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
  return items.map(asString).filter((x): x is string => !!x);
}

function iriTail(iri: string): string {
  return iri.includes("/") ? iri.slice(iri.lastIndexOf("/") + 1) : iri.replace(/^t:/, "");
}

/**
 * Split a NAME predicate into its segments per the RuleBpontMultiBinding parse contract:
 * split on `|`, btrim each segment, and strip the CURIE prefix PER SEGMENT (each segment
 * carries its own namespace). Order is NOT authoritative — first-wins is refused.
 */
function bindingSegments(nameValue: string | null): string[] {
  if (!nameValue) return [];
  return nameValue
    .split("|")
    .map((seg) => seg.trim())
    .filter((seg) => seg.length > 0);
}

/**
 * The type CURIE this app WRITES for a term — `a:typeAttribute` is the NAME predicate that
 * declares it byte-identically (RuleBpontCodeBinding).
 *
 * 🔴 The raw `|`-joined string is NEVER a key (RuleBpontMultiBinding cl.6). The previous
 * implementation returned `typeAttribute` whole after a `/^t:/` test, so a future
 * multi-bound term would have written `t:File|t:FileThing` into a vault as a type URI.
 * Measured 2026-09-18: ZERO user-plane terms carry a pipe today, so this is a LATENT
 * defect closed, not an observed one — stated plainly rather than claimed as a live fix.
 *
 * Returns "" when the survivor set is empty (dead-bound) or ambiguous; `catalogFromGraph`
 * turns that into a recorded exclusion rather than a guess.
 */
function curieOf(iri: string, typeAttribute: string | null, deprecated: string | null = null): string {
  const declared = bindingSegments(typeAttribute);
  if (declared.length > 0) {
    const retired = new Set(bindingSegments(deprecated));
    const survivors = declared.filter((seg) => !retired.has(seg) && /^t:[A-Za-z]/.test(seg));
    // Exactly one survivor is the only case that names a single string to write.
    if (survivors.length === 1) return survivors[0]!;
    // 🔴 ZERO SURVIVORS IS DEAD-BOUND AND MUST NOT FALL THROUGH TO THE IRI TAIL.
    // Corrected 2026-09-18 — the typing gate measured this branch with a negative control and
    // three positive ones and found it handed back the RETIRED spelling: the tail below
    // can equal a segment the master has declared retired, so the "fail loud" this
    // docblock promised was not what the code did. RuleBpontMultiBinding cl.5 forbids
    // exactly that — "⛔ falling back to first-wins and handing the caller a known-retired
    // spelling to WRITE". Two of the four sites in this class were on the write path.
    //
    // ⚠ The docblock was RIGHT and the code was WRONG, so the CODE is what changed
    // (RuleCommentAdjudicateFirst cl.2 — both outcomes are real; adjudicate, then fix the
    // false one). More than one survivor is ambiguous and excluded for the same reason:
    // position is not authoritative (cl.4).
    //
    // The IRI tail is reached ONLY when `a:typeAttribute` is absent altogether. A term
    // that DECLARES a binding is taken at its word, including when that word is "nothing
    // usable" — a declared-but-unusable binding is a fact about the ontology, not an
    // invitation for the client to compute one.
    return "";
  }
  const tail = iriTail(iri);
  return tail ? `t:${tail}` : "";
}

function parentIriOf(t: Record<string, unknown>): string | null {
  return asString(t["a:subTypeOf"]);
}

function truthy(v: unknown): boolean {
  return v === true || v === "true";
}

function falsey(v: unknown): boolean {
  return v === false || v === "false";
}

/** Pure: build a catalog from a served `@graph`. Exported for tests. */
export function catalogFromGraph(
  graph: readonly Record<string, unknown>[],
  plane: LinkPlaneName,
  stale = false,
): LinkPlaneCatalog {
  const terms: LinkTerm[] = [];
  /** IRIs dropped because `a:typeAttribute` named no single writable string. */
  const excludedUnwritable: string[] = [];
  /** Raw term-to-term references, held for the second pass. */
  const refs = new Map<
    string,
    { parentIri: string | null; inverseOfIri: string | null; composesToIris: string[] }
  >();
  for (const t of graph) {
    const iri = asString(t["@id"]) ?? "";
    if (!iri.includes("/t/")) continue;
    const lp = asString(t["a:linkPlane"]);
    if (lp !== plane) continue;
    const typeAttribute = asString(t["a:typeAttribute"]);
    const curie = curieOf(iri, typeAttribute, asString(t["a:deprecatedNotation"]));
    // "" means the NAME predicate was dead-bound or ambiguous (see curieOf). Excluding the
    // term is the fail-safe: it is not offered and not written. It is NOT silent — absence
    // of a writable name is a real ontology state, reported by `excludedUnwritable`.
    if (!curie) {
      excludedUnwritable.push(iri);
      continue;
    }
    const parentIri = parentIriOf(t);
    const inverseOfIri = asString(t["a:inverseOf"]);
    const composesToIris = asOrderedIris(t["a:composesTo"]);
    const directedFlag = t["a:directed"];
    const symmetricFlag = t["a:symmetric"];
    const symmetric = truthy(symmetricFlag);
    const directed = truthy(directedFlag) || (falsey(symmetricFlag) && !symmetric);
    terms.push({
      iri,
      curie,
      label: asString(t["a:label"]) ?? iriTail(iri),
      labelled: asString(t["a:label"]) !== null,
      parentIri,
      // Resolved in the SECOND PASS below — a reference to another term must be answered
      // by THAT term's own declared binding, which is not known until every term is read.
      parentCurie: null,
      plane,
      directed,
      symmetric,
      typeAttribute,
      does: asString(t["a:does"]),
      transitive: truthy(t["a:transitive"]),
      inverseOfCurie: null,
      inverseLabel: asString(t["a:inverseLabel"]),
      composesTo: [],
      genderedLabel: asString(t["a:genderedLabel"]),
    });
    refs.set(iri, { parentIri, inverseOfIri, composesToIris });
  }

  // ── SECOND PASS: resolve every term-to-term reference through the term's OWN curie ────
  //
  // 🔴 A REFERENCE IS RESOLVED BY LOOKUP, ⛔ NEVER BY RE-DERIVING THE TARGET'S NAME.
  // Corrected 2026-09-18 . Each of `a:subTypeOf`, `a:inverseOf` and
  // `a:composesTo` used to call `curieOf(iri, null)` — which discards the second argument
  // and therefore forces the IRI-TAIL FALLBACK, the one derivation the master says no app
  // may rely on. It agreed with the declared binding only because every user-plane term
  // currently spells `a:typeAttribute` as `t:` + its own tail. The moment one does not:
  // its parent link drops out of the tree, its inverse stops rendering, and any chain
  // step naming it silently returns null — all without an error.
  //
  // ⚠ The shipped fixture could not catch this: all 38 rows hold that key CONSTANT, so a
  // tail-derived answer and a declared answer are the same string in every row
  // (RuleBasetestFixtureDiscriminates cl.1 — a fixture where two distinct things hold the
  // same value cannot detect them being swapped).
  const curieByIri = new Map(terms.map((t) => [t.iri, t.curie]));
  /** A reference the catalog cannot resolve is null, ⛔ never a guessed curie. */
  const resolve = (iri: string | null): string | null => (iri ? curieByIri.get(iri) ?? null : null);
  for (const t of terms) {
    const r = refs.get(t.iri);
    if (!r) continue;
    t.parentCurie = resolve(r.parentIri);
    t.inverseOfCurie = resolve(r.inverseOfIri);
    // A chain is only walkable if EVERY step resolves; one unresolvable step voids it
    // rather than silently shortening it.
    const steps = r.composesToIris.map(resolve);
    t.composesTo = steps.every((x): x is string => !!x) ? (steps as string[]) : [];
  }

  terms.sort((a, b) => a.label.localeCompare(b.label));

  const userIris = new Set(terms.map((t) => t.iri));
  const roots = terms.filter((t) => {
    if (!t.parentIri) return true;
    if (t.parentIri.endsWith(RELATION_TAIL)) return true;
    return !userIris.has(t.parentIri);
  });

  return { plane, terms, roots, stale, excludedUnwritable };
}

function remember(cat: LinkPlaneCatalog): void {
  byCurie.clear();
  for (const t of cat.terms) byCurie.set(t.curie, t);
}

export function liveIsOfferable(curie: string | null | undefined): boolean {
  return !!curie && byCurie.has(curie);
}

export async function readUserLinkPlaneCatalog(): Promise<LinkPlaneCatalog> {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;
  if (inFlight) return inFlight;
  const run = loadUserCatalog();
  inFlight = run;
  try {
    return await run;
  } finally {
    if (inFlight === run) inFlight = null;
  }
}

async function loadUserCatalog(): Promise<LinkPlaneCatalog> {
  try {
    // Same host rule as TypeChooser: a local baseOrigin is a thin vault, not the
    // published user-plane catalog. Asking rig.example.test produced an empty list that
    // rendered as a one-pixel border under How related.
    const url = `${corpusApiOrigin()}/base/vocab?status=all&linkPlane=user`;
    const res = await fetch(url, { headers: publicHeaders() });
    if (!res.ok) {
      return cached ?? emptyStale();
    }
    const doc = (await res.json()) as Record<string, unknown>;
    const graph = Array.isArray(doc["@graph"])
      ? (doc["@graph"] as Record<string, unknown>[])
      : [];
    const cat = catalogFromGraph(graph, "user", false);
    cached = cat;
    cachedAt = Date.now();
    remember(cat);
    return cat;
  } catch {
    return cached ? { ...cached, stale: true } : emptyStale();
  }
}

function emptyStale(): LinkPlaneCatalog {
  return { plane: "user", terms: [], roots: [], stale: true, excludedUnwritable: [] };
}

/** Test-only: inject a catalog (and the sync overlay) without fetching. */
export function __setCatalogForTest(cat: LinkPlaneCatalog | null): void {
  // ⚠ `inFlight` is cleared too — but ⛔ NOT for the reason first written here.
  //
  // 🔴 CORRECTED 2026-09-18 (QA F8, and the correction is the finding). This comment
  // claimed "`readUserLinkPlaneCatalog` returns the in-flight promise BEFORE it consults
  // the cache, so an injected catalog is silently ignored". Read the function: the CACHE
  // IS CHECKED FIRST. That rationale was false, and the test I wrote to defend it could
  // not fail — QA deleted this line and all 3202 tests stayed green.
  //
  // What clearing it ACTUALLY does, and the only thing it does: after
  // `__setCatalogForTest(null)` the cache guard no longer fires, so `if (inFlight) return
  // inFlight` DOES — and a caller asking for a fresh read gets a stale promise from a
  // previous test instead of a new one. Clearing it makes "inject null" mean "forget
  // everything", which is what a caller passing null is asking for.
  inFlight = null;
  cached = cat;
  cachedAt = cat ? Date.now() : 0;
  byCurie.clear();
  if (cat) remember(cat);
}
