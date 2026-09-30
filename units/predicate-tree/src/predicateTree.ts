// The predicate TREE — depth-unbounded walks over the live user-plane catalog.
//
// Cycle192. The user-plane ontology was redesigned on the GilbVeda master 2026-09-18:
// 27 terms / 9 roots / 2 levels → 38 terms / 11 roots / **4 levels**, plus `a:inverseOf`,
// `a:inverseLabel` and `a:composesTo`. `linkPlaneCatalog.ts` already read the catalog and
// computed roots; nothing walked deeper than one level of children and nothing read the
// three new fields. This module is the walking.
//
// 🔴 DEPTH IS NEVER HARDCODED. The live tree is four deep today (`associated-with` →
// `family-of` → `sibling-of` → `brother-of`) and BVedanta may deepen it without telling
// this app. Every function here recurses to fixpoint and terminates on a visited-set, so a
// fifth level renders on the next 60 s cache turn with no code change. A constant `4`
// anywhere in this file would be the defect it exists to avoid.
//
// ⚠ CYCLE SAFETY IS NOT OPTIONAL. RuleBpontAcyclic says hierarchies have no loops, and the
// mint tools enforce it — but this app READS a store it does not control, and an
// unterminated walk is a frozen browser tab, not a wrong answer. Every traversal below
// carries its own `seen` set. That is defence against the data, not distrust of the rule.

import { childrenOf, type LinkPlaneCatalog, type LinkTerm } from "./catalog";

/** The term a curie names, or undefined. */
function term(catalog: LinkPlaneCatalog, curie: string): LinkTerm | undefined {
  return catalog.terms.find((t) => t.curie === curie);
}

/**
 * Every term BELOW `curie`, at any depth, nearest-first. Excludes `curie` itself.
 *
 * Breadth-first so the returned order is a sensible render order (a picker showing a
 * flattened subtree lists closer kin before remoter ones).
 */
export function descendantsOf(catalog: LinkPlaneCatalog, curie: string): LinkTerm[] {
  const out: LinkTerm[] = [];
  const seen = new Set<string>([curie]);
  let frontier = childrenOf(catalog, curie);
  while (frontier.length > 0) {
    const next: LinkTerm[] = [];
    for (const child of frontier) {
      if (seen.has(child.curie)) continue; // cycle or diamond — visit once
      seen.add(child.curie);
      out.push(child);
      next.push(...childrenOf(catalog, child.curie));
    }
    frontier = next;
  }
  return out;
}

/** Every term ABOVE `curie`, nearest-first, up to a root. Excludes `curie` itself. */
export function ancestorsOf(catalog: LinkPlaneCatalog, curie: string): LinkTerm[] {
  const out: LinkTerm[] = [];
  const seen = new Set<string>([curie]);
  let parent = term(catalog, curie)?.parentCurie ?? null;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const t = term(catalog, parent);
    if (!t) break; // parent is outside the user plane — that IS the root boundary
    out.push(t);
    parent = t.parentCurie;
  }
  return out;
}

/** How many levels the subtree under `curie` spans. A leaf is 1. Measured, never assumed. */
export function subtreeDepth(catalog: LinkPlaneCatalog, curie: string): number {
  const kids = childrenOf(catalog, curie);
  if (kids.length === 0) return 1;
  let deepest = 0;
  const seen = new Set<string>([curie]);
  const walk = (c: string, d: number): void => {
    if (d > deepest) deepest = d;
    for (const k of childrenOf(catalog, c)) {
      if (seen.has(k.curie)) continue;
      seen.add(k.curie);
      walk(k.curie, d + 1);
    }
  };
  walk(curie, 1);
  return deepest;
}

/** The whole tree's depth — what the picker must be able to render. */
export function catalogDepth(catalog: LinkPlaneCatalog): number {
  return catalog.roots.reduce((m, r) => Math.max(m, subtreeDepth(catalog, r.curie)), 0);
}

// ── Roll-up: the point of the hierarchy ────────────────────────────────────────────────
//
// Asking for `family-of` must return facts stored as `parent-of`, `sibling-of`,
// `brother-of` and the rest. A specialisation rolls UP to its parent: every `brother-of`
// fact IS a `sibling-of` fact IS a `family-of` fact. The converse is false — asking for
// `brother-of` must NOT return a bare `family-of` fact, because the stored fact does not
// claim that much. Roll-up is therefore strictly downward-closed over `a:subTypeOf`.

/**
 * The stored-predicate curies that answer a query for `curie`: itself plus every
 * descendant. This is the set a relation filter should match against.
 */
export function rollUpSet(catalog: LinkPlaneCatalog, curie: string): string[] {
  return [curie, ...descendantsOf(catalog, curie).map((t) => t.curie)];
}

/** How a stored fact came to answer a query — so the UI can say WHY, not just that. */
export type MatchKind = "exact" | "rollup" | "inverse" | "composed";

export interface PredicateMatch {
  kind: MatchKind;
  /** For `rollup`: the stored predicate's own term. For `composed`: the chain's terms. */
  via: readonly LinkTerm[];
}

/**
 * Does a fact stored as `storedCurie` answer a query for `queriedCurie`?
 *
 * Returns HOW it matched, or null. The `kind` is the honest part: a `rollup` answer is
 * weaker than an `exact` one (a stored `family-of` does not tell you they are siblings),
 * and a surface that renders both identically is overclaiming.
 */
export function matchStoredPredicate(
  catalog: LinkPlaneCatalog,
  queriedCurie: string,
  storedCurie: string,
): PredicateMatch | null {
  if (queriedCurie === storedCurie) return { kind: "exact", via: [] };

  const stored = term(catalog, storedCurie);
  if (stored && rollUpSet(catalog, queriedCurie).includes(storedCurie)) {
    return { kind: "rollup", via: [stored] };
  }

  // `a:inverseOf` — the same fact from the other end. `child-of` answers a `parent-of`
  // query with the ends swapped; the caller is responsible for swapping them.
  const queried = term(catalog, queriedCurie);
  if (queried?.inverseOfCurie === storedCurie) {
    const inv = term(catalog, storedCurie);
    return { kind: "inverse", via: inv ? [inv] : [] };
  }

  return null;
}

// ── a:composesTo — an edge that equals walking other edges ─────────────────────────────

/**
 * The ordered chain `curie` composes to, resolved to terms, or null when it composes to
 * nothing. `grandparent-of` → [`parent-of`, `parent-of`].
 *
 * 🔴 ORDER IS SIGNIFICANT. `[parent-of, parent-of]` is symmetric by accident; a chain like
 * `[parent-of, sibling-of]` (a parent's sibling) is NOT the same as `[sibling-of,
 * parent-of]` (a sibling's parent). The array order is preserved end to end and
 * `composedChainOf` never sorts, dedupes or normalises it.
 *
 * Returns null — not [] — when a step names a term outside the user plane, because a
 * partially-resolvable chain is not a walkable chain and must not read as one.
 */
export function composedChainOf(
  catalog: LinkPlaneCatalog,
  curie: string,
): LinkTerm[] | null {
  const t = term(catalog, curie);
  if (!t || t.composesTo.length === 0) return null;
  const steps: LinkTerm[] = [];
  for (const step of t.composesTo) {
    const s = term(catalog, step);
    if (!s) return null; // unresolvable step ⇒ the whole chain is unusable, honestly
    steps.push(s);
  }
  return steps;
}

/**
 * Walk a composed chain over stored facts.
 *
 * `edges` is every stored fact as (subject, predicate, object). The result is the set of
 * objects reachable from `subject` by walking the chain IN ORDER — so
 * `grandparent-of` over stored `parent-of` facts returns the grandchildren.
 *
 * ⚠ A COMPOSED PREDICATE STAYS DIRECTLY ASSERTABLE. Real data is incomplete: someone may
 * know Ann is Cal's grandparent without knowing the parent in between. So the caller
 * UNIONs this with the directly-stored `grandparent-of` facts — this function answers
 * "what does the chain derive", never "what is true". Deriving is additive, never a
 * replacement for, or a contradiction of, what is stored.
 *
 * Each step rolls up, so a chain step of `parent-of` is satisfied by any descendant of
 * `parent-of` too.
 */
export function walkComposedChain(
  catalog: LinkPlaneCatalog,
  chain: readonly LinkTerm[],
  subject: string,
  edges: readonly { subject: string; predicate: string; object: string }[],
): string[] {
  let frontier = new Set<string>([subject]);
  for (const step of chain) {
    const accepted = new Set(rollUpSet(catalog, step.curie));
    const next = new Set<string>();
    for (const e of edges) {
      if (frontier.has(e.subject) && accepted.has(e.predicate)) next.add(e.object);
    }
    if (next.size === 0) return []; // the chain breaks here — no reachable end
    frontier = next;
  }
  frontier.delete(subject); // a chain that loops back is not an answer about the subject
  return [...frontier];
}

// ── Reading an edge backwards ──────────────────────────────────────────────────────────

/** How the reverse direction of an edge is worded, and where those words came from. */
export interface ReverseReading {
  /** The phrase to show at the object's end. */
  phrase: string;
  /**
   * `paired`   — `a:inverseOf`; the phrase is the PAIRED TERM'S OWN label.
   * `phrase`   — `a:inverseLabel`; a phrase stored on this term for reading it backwards.
   * `symmetric`— neither field, and `a:symmetric`; backwards is the same words.
   */
  source: "paired" | "phrase" | "symmetric";
  /** The paired term, when `source` is `paired`. */
  pairedWith: LinkTerm | null;
}

/**
 * The reverse reading of an edge, or null when the ontology does not supply one.
 *
 * The two fields are COMPLEMENTS and the precedence is the ontology's, not a preference:
 * `a:inverseOf` names a real paired term whose own `a:label` is the right words, so it
 * wins; `a:inverseLabel` is the one-term form used where no pair exists. BVedanta's mint
 * tools refuse to write both on one term, and refuse either on a symmetric one.
 *
 * 🔴 NULL IS A REAL ANSWER AND MUST RENDER AS SILENCE, NOT AS A GUESS. `brother-of` and
 * `sister-of` were REFUSED a phrase with a reason: read backwards, the right word depends
 * on the OTHER person's gender. A caller that invents "has brother" there is fabricating
 * exactly what the refusal was protecting (RuleBaseappAbsenceNotTruth — say what was
 * observed, not what it is presumed to mean).
 */
export function reverseReading(
  catalog: LinkPlaneCatalog,
  curie: string,
): ReverseReading | null {
  const t = term(catalog, curie);
  if (!t) return null;

  if (t.inverseOfCurie) {
    const paired = term(catalog, t.inverseOfCurie);
    // The pair must resolve. A dangling `a:inverseOf` is a half-written pair, which the
    // mint tool fails the run on — if one reaches us anyway, it reads as no reverse at
    // all rather than as the raw curie.
    if (paired) {
      return { phrase: verbOf(paired), source: "paired", pairedWith: paired };
    }
    return null;
  }

  if (t.inverseLabel) {
    return { phrase: t.inverseLabel, source: "phrase", pairedWith: null };
  }

  if (t.symmetric) {
    return { phrase: verbOf(t), source: "symmetric", pairedWith: null };
  }

  return null;
}

// ── Gendered labels — DERIVED, never stored ───────────────────────────────────────────
//
// `a:gender` on a PERSON plus a kinship predicate yields the gendered noun: Mira is
// female and `child-of` Linda, so Mira is Linda's "daughter". The gendered word is never
// a predicate — there is no `daughter-of` term and there must never be one, because
// storing one means "give me Linda's children" misses Mira.

/**
 * Parse a token-keyed `a:genderedLabel` into gender-token → noun.
 *
 * Uses the RuleBpontMultiBinding parse contract: split on `|`, btrim each segment. Each
 * segment is `<genderToken>=<noun>`. A segment without `=` is skipped rather than guessed
 * at — a positional reading would close `a:gender`'s deliberately open token space.
 */
function parseGenderedLabel(raw: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!raw) return out;
  for (const seg of raw.split("|")) {
    const trimmed = seg.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue; // no key ⇒ not a token-keyed segment ⇒ not usable
    const key = trimmed.slice(0, eq).trim();
    const noun = trimmed.slice(eq + 1).trim();
    if (key && noun) out.set(key, noun);
  }
  return out;
}

/**
 * The gendered noun for the SUBJECT of `curie` at `gender`, or null.
 *
 * 🔴 NULL IS THE CORRECT, EXPECTED ANSWER IN THREE DISTINCT CASES, and the caller falls
 * back to the ungendered label in all three. Absence is NOT an error and must NOT be
 * guessed (BVedanta 2026-09-18):
 *   1. the person carries no `a:gender` — most people, most of the time;
 *   2. the predicate carries no `a:genderedLabel` — e.g. `friend-of` has no gendered form;
 *   3. the person's gender token is not one the predicate names — `a:gender`'s token space
 *      is OPEN, so an unrecognised token is ordinary, not invalid.
 * ⚠ Case 3 is the one that invites a bug: treating an unknown token as an error, or
 * coercing it to the nearest known one, would both fabricate. It yields no label.
 */
export function genderedLabel(
  catalog: LinkPlaneCatalog,
  curie: string,
  gender: string | null | undefined,
): string | null {
  if (!gender) return null;
  const t = term(catalog, curie);
  if (!t) return null;
  return parseGenderedLabel(t.genderedLabel).get(gender.trim()) ?? null;
}

/**
 * The gendered noun naming the OBJECT of a stored edge — the "daughter" case.
 *
 * Stored: `Linda parent-of Mira`, and Mira carries `a:gender female`. Mira is the OBJECT,
 * so the word for her is the noun on the INVERSE predicate (`child-of`), whose subject she
 * is. Walking `a:inverseOf` is what makes this work without a `daughter-of` term.
 *
 * Returns null when there is no inverse term, or no gendered noun for that token — the
 * caller then shows the ungendered reverse reading, which is always correct if vaguer.
 */
export function genderedObjectLabel(
  catalog: LinkPlaneCatalog,
  curie: string,
  objectGender: string | null | undefined,
): string | null {
  const t = term(catalog, curie);
  if (!t) return null;
  // A symmetric predicate is its own inverse (`sibling-of` → "sister").
  const inverseCurie = t.inverseOfCurie ?? (t.symmetric ? t.curie : null);
  if (!inverseCurie) return null;
  return genderedLabel(catalog, inverseCurie, objectGender);
}

/**
 * The display verb for a term — the same deterministic normalisation of the term's own
 * stored `a:label` the picker and the edge labeller already use (lowercase, whitespace
 * runs → single hyphen). The app never invents a verb.
 */
export function verbOf(t: LinkTerm): string {
  return t.label.trim().toLowerCase().replace(/\s+/g, "-");
}
