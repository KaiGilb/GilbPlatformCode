import { minOntologyQuery } from "@kaigilb/gilbplatformcode-base-origin";
import { PLAN_ONLY_TYPE_IDS } from "@kaigilb/gilbplatformcode-plan-kinds";
import { RECORD_TYPES, type RecordTypeSpec } from "@kaigilb/gilbplatformcode-record-types";
import { corpusApiOrigin } from "./termSearch";

export type TypeOptionKind = "type" | "function" | "value";

/**
 * Map a stored `a:nodeKind` onto a create-option kind.
 * Relation / attribute / scale are not things you mint a node as — `null`.
 * Absent or `type`/`entity` → a Thing.
 */
export function kindFromNodeKind(nodeKind: string | undefined | null): TypeOptionKind | null {
  const k = (nodeKind ?? "").trim().toLowerCase();
  if (k === "function") return "function";
  if (k === "value") return "value";
  if (k === "relation" || k === "attribute" || k === "scale") return null;
  return "type";
}

/** One offerable type, as any create surface needs it. */
export interface TypeOption {
  /**
   * The value a chooser round-trips. For a shipped type this is the RECORD_TYPES local id
   * (`note` / `contact` / `task` / `folder`) — the same key `resolveType` and the icons take.
   * A live BaseVeda term is namespaced `veda:<TypeName>` so it can never collide with one.
   */
  id: string;
  /** What to show. Never composed from the id — the registry's or the ontology's own label. */
  label: string;
  /** The bare BaseVeda type NAME this option anchors to (`NoteDocument`, `Task`, `Rule`, …). */
  typeName: string;
  /**
   * The shipped field spec, when the app has one.
   *
   * `null` is a REAL and expected value now that the live catalogue is bound: a BaseVeda type
   * with no shipped spec can still be created — with its name and its type and nothing else.
   * It must NOT be given invented fields to look complete (3P.C.RealityDisclosure). Consumers
   * branch on this, they do not fabricate.
   */
  spec: RecordTypeSpec | null;
  /**
   * Plane of the term. Things (`type`) are the default create-target. Functions and
   * Values are offered only when the person opens that filter or All.
   * Relations / attributes / scales never become a TypeOption.
   */
  kind: TypeOptionKind;
  /** `a:does` when the search hit carried it. Absence is real — do not invent a gloss. */
  definition?: string | null;
}

/**
 * What a search answered, and how far the answer actually reached.
 *
 * The reach travels WITH the options because an empty list has two completely different
 * meanings — "the ontology has no such term" and "the ontology could not be asked" — and
 * rendering the second as the first is exactly what RuleBaseappAbsenceNotTruth forbids. The
 * chooser renders `reach` verbatim and branches its empty state on `degraded`.
 */
export interface TypeSearchResult {
  options: readonly TypeOption[];
  /** One sentence naming what was searched. Shown ALWAYS, not only on a miss. */
  reach: string;
  /** True when the live catalogue could not be reached, so an empty list is NOT an absence. */
  degraded: boolean;
}

/**
 * The seam. `query` is what the person typed, verbatim and untrimmed; the implementation
 * decides matching. An empty query means "nothing typed yet" — an implementation may answer
 * with its own short default set (the registry does) but must NEVER answer with a long list,
 * because the control renders what it is given.
 */
export type TypeSearchFn = (query: string) => Promise<TypeSearchResult>;

/** One registry entry as a create option — the shape both choosers hand to TypeChooser. */
export function typeOptionFromSpec(t: RecordTypeSpec): TypeOption {
  return {
    id: t.id,
    label: t.label,
    typeName: t.typeName,
    spec: t,
    kind: "type",
  };
}

/** Every registry type the Records chooser offers, in registry order.
 *  Plan-only ids are left out so a blank query still answers with the same four types. */
export const BUILTIN_TYPE_OPTIONS: readonly TypeOption[] = RECORD_TYPES.filter(
  (t) => !PLAN_ONLY_TYPE_IDS.has(t.id),
).map(typeOptionFromSpec);

/** The id namespace for a live BaseVeda term, so it can never collide with a shipped id. */
export const VEDA_ID_PREFIX = "veda:";

/**
 * Every bare type name a shipped spec already answers for — its current `typeName` PLUS its
 * `aliasTypeNames` (Note→NoteDocument, Contact→Person). Without the aliases the live
 * catalogue would offer `NoteDocument` a second time as a spec-less row, so the person would
 * see two "Note"-ish choices where only one carries the note fields.
 */
const SHIPPED_TYPE_NAMES: ReadonlySet<string> = new Set(
  // Plan-only names stay out of this set. They are not in the Records chooser, so treating them
  // as already-shipped would drop the master's t:Function from a Records search and replace it
  // with nothing.
  RECORD_TYPES.filter((t) => !PLAN_ONLY_TYPE_IDS.has(t.id)).flatMap((t) => [t.typeName, ...(t.aliasTypeNames ?? [])])
    // ⚠ The `typeof` guard is load-bearing, not defensive noise. This runs at MODULE LOAD, so
    // an entry without a `typeName` does not degrade one search — it throws during import and
    // takes down every module that transitively imports the chooser. That is exactly what it
    // did: five RecordGraph suites went from failing-a-test to collecting ZERO tests, because
    // their `vi.mock` of RECORD_TYPES supplies `{id,label,nameField}` and no `typeName`.
    // A registry entry is data; code that runs at import time does not get to assume its shape.
    .filter((n): n is string => typeof n === "string" && n.length > 0)
    .map((n) => n.toLowerCase()),
);

/**
 * Lowercase a value that SHOULD be a string. Same reason as the guard on SHIPPED_TYPE_NAMES:
 * these read registry data, and a registry entry missing a field must cost one unmatched row,
 * never an exception out of the search.
 */
function lower(v: string | undefined | null): string {
  return typeof v === "string" ? v.toLowerCase() : "";
}

function matches(label: string, name: string, q: string): boolean {
  return lower(label).includes(q) || lower(name).includes(q);
}

/** One hit as `GET /base/terms` serves it. Only the fields this surface actually uses are
 *  named; the route also carries `entity`, `rank`, `module` and `planguageType`. */
interface WireTerm {
  /** The identity IRI — `https://<ontology host>/base/t/<Name>`. The type a create anchors to. */
  term: string;
  label: string;
  /** `a:ontologyStatus` verbatim, ABSENT when the term carries none. Never defaulted. */
  status?: string;
  does?: string;
  /** `a:nodeKind` when the route projects it (function | value | …). */
  nodeKind?: string;
}

/**
 * ⭐ THE DEFAULT BINDING — the server-side term search (`GET /base/terms`, Base b24aa37).
 *
 * ── WHAT THIS REPLACES, AND WHY IT HAD TO ────────────────────────────────────────────
 * The previous binding downloaded `/base/vocab` and searched it in the browser. Kai reported
 * on 2026-08-08 that typing `pod` answered "No type or function matches" while the ontology
 * viewer showed a screen full of Vault terms. Measured cause — TWO independent filters, either
 * of which alone would have hidden almost everything:
 *
 *   1. STATUS. `/base/vocab` publishes **Approved only** (828 of 1,257). Of 35 vault-named
 *      terms in the store, **34 are Suggested** — not filtered from the search, ABSENT from
 *      the document the app downloads. It could not see them at any query.
 *   2. PLANE. The single Approved survivor, `SignInVault`, classifies as an ATTRIBUTE, and the
 *      old client fence offered only entities and functions.
 *
 * 35 → 1 → 0. This binding removes both: the route serves every adjudication state except
 * Deprecated (Kai: *"all types, functions, values, all of it, minus Deprecated"*), and the
 * plane fence is gone with the client-side classification that produced it.
 *
 * ── AND IT IS WHAT MAKES THE SURFACE SURVIVE THE CORPUS ──────────────────────────────
 * The whole-document fetch was capped at the document: measured 1,479,098 bytes for 826 types
 * and 21.8 MB / 2,557 ms on a corpus grown to 51k. Kai's stated horizon is ~15k then hundreds
 * of thousands. The response here is bounded by `pageSize` no matter how large the ontology
 * grows, because the ranking happens in Postgres against its BM25 index.
 *
 * ⚠ WHAT IS DELIBERATELY NOT INFERRED. The route does not (yet) emit `a:nodeKind`, so this
 * cannot honestly say whether a term is a THING or a FUNCTION — every option is reported as
 * `kind: "type"`. It would be easy to guess from `planguageType`, and BVedanta ruled against
 * exactly that at the 2026-08-08 gate: it is present on 709 of 816 terms with 100+ uncontrolled
 * free-text values (`System Property`, `Quantification Parameter`, …), so a substring guess
 * "ages into the next defect". A wrong label is worse than an absent one. When `matchTier` and
 * `nodeKind` reach the wire (both are minted and live), this reads them instead of guessing.
 */
export const searchLiveTerms: TypeSearchFn = async (query) => {
  const q = query.trim();
  if (!q) return { options: BUILTIN_TYPE_OPTIONS, reach: blankQueryReach(), degraded: false };

  const shipped = BUILTIN_TYPE_OPTIONS.filter(
    (o) => matches(o.label, o.typeName, q.toLowerCase()) || lower(o.id).includes(q.toLowerCase()),
  );
  if (q.length < minOntologyQuery()) {
    return { options: shipped, reach: shortQueryReach(q), degraded: false };
  }

  let body: { terms?: WireTerm[]; complete?: boolean; pageSize?: number };
  try {
    // No credentials, by design: the published vocabulary is public, and the route's CORS
    // preflight allows only `accept`/`if-none-match` — a Bearer here makes every non-apex
    // origin get zero terms, the same silent-empty shape as the original defect.
    //
    // ── CORPUS HOST (2026-08-12) ────────────────────────────────────────────────
    // Use corpusApiOrigin(), not the platform origin alone. Local Base often holds a thin
    // ontology (0 hits for "operate forklift") while production serves ~15k terms.
    // Ontology browse + TypeChooser must see the real BaseVeda index.
    const res = await fetch(
      `${corpusApiOrigin()}/base/terms?q=${encodeURIComponent(q)}&limit=${LIVE_TERM_LIMIT}`,
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) return { options: shipped, reach: DEGRADED_REACH, degraded: true };
    body = await res.json();
  } catch {
    // A failed fetch is REACH, never absence — the whole point of carrying `degraded`.
    return { options: shipped, reach: DEGRADED_REACH, degraded: true };
  }

  const hits = Array.isArray(body.terms) ? body.terms : [];
  const live = hits
    // The shipped four already appear above WITH their field specs; the same term arriving
    // from the ontology would be a duplicate that creates with no fields.
    .filter((h) => !SHIPPED_TYPE_NAMES.has(lower(typeNameOf(h))))
    .map((h): TypeOption | null => {
      const name = typeNameOf(h);
      const kind = kindFromNodeKind(h.nodeKind);
      if (!kind) return null;
      return {
        id: `${VEDA_ID_PREFIX}${name}`,
        label: typeof h.label === "string" && h.label.trim() !== "" ? h.label : name,
        typeName: name,
        spec: null,
        kind,
        definition: typeof h.does === "string" && h.does.trim() ? h.does.trim() : null,
      };
    })
    .filter((o): o is TypeOption => o !== null);

  return {
    options: [...shipped, ...live],
    // `complete` is the route's own truncation signal — reported, never re-derived from
    // `terms.length`, which is exactly the conflation the route removed `count` to prevent.
    reach: body.complete === false ? liveReachTruncated(q) : liveReach(q, live.length),
    degraded: false,
  };
};

/** The bare type NAME from a hit's identity IRI (`…/base/t/Rule` → `Rule`). The IRI is the
 *  anchor a create writes, so the name is taken from it rather than from the label — a label
 *  is human text and may be spaced or renamed ("Specification Rule" vs `SpecificationRule`). */
function typeNameOf(h: WireTerm): string {
  return String(h.term ?? "").split("/").pop() ?? "";
}

/** How many hits to ask for. Kai, 2026-08-08: *"even 20 is a bit too much, the ideal search
 *  result is 1-3 hits the user is actually looking for"* — so this is a ceiling on what a
 *  person is asked to read, not a page size to be paged through. There is no paging. */
/** Ceiling the live search asks for — the “keep typing” note is about THIS number. */
export const LIVE_TERM_LIMIT = 20;

const liveReach = (q: string, n: number) =>
  n === 0
    ? `GilbVeda has no term matching “${q}”.`
    : `Searching all of GilbVeda — every type, function and value except deprecated ones.`;

const liveReachTruncated = (q: string) =>
  `More than ${LIVE_TERM_LIMIT} GilbVeda terms match “${q}” — keep typing to narrow it.`;

/** Nothing typed yet: say what typing will reach, so the short list is not read as the whole.
 *  The number is INTERPOLATED, never spelled — a sentence that says "3" while the floor is 4
 *  is the same class of stale record as a comment that outlives its code. */
export const blankQueryReach = (): string =>
  minOntologyQuery() > 0
    ? `The types GilbApp ships with fields. Type at least ${minOntologyQuery()} letters to search all of GilbVeda.`
    : "The types GilbApp ships with fields. Type to search all of GilbVeda.";

/**
 * Said out loud while the query is too short — never silence, and never an empty result.
 *
 * An empty list with no sentence reads as "BaseVeda has nothing matching that", which is the
 * absence-is-not-truth failure this surface keeps having to defend against
 * (RuleBaseappAbsenceNotTruth). The person is told the ontology has not been asked yet, and
 * exactly what will make it answer.
 */
export function shortQueryReach(q: string): string {
  const need = minOntologyQuery() - q.length;
  return `Type ${need} more letter${need === 1 ? "" : "s"} to search all of GilbVeda — showing only the types GilbApp ships.`;
}

/**
 * The catalogue could not be reached. This sentence exists so an empty result is never read
 * as "that type does not exist" — RuleBaseappAbsenceNotTruth: a failed fetch is a transport
 * state, not a truth about the data.
 */
export const DEGRADED_REACH =
  "GilbVeda's catalogue could not be reached — showing only the types GilbApp ships. This is not a statement that other types do not exist.";

