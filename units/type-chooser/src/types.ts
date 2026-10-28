/** What the chooser can show. Default is Things (everyday entity types). */
export type CreatePlane = "things" | "function" | "value" | "all";

export type TypeOptionKind = "type" | "function" | "value";

/** One offerable type, as any create surface needs it. */
export interface TypeOption {
  /**
   * The value a chooser round-trips. For a type the host ships this is the host's local id
   * (`note` / `contact` / `task` / `folder`).
   * A live GilbVeda term is namespaced `veda:<TypeName>` so it can never collide with one.
   */
  id: string;
  /** What to show. Never composed from the id — the host's or the ontology's own label. */
  label: string;
  /** The bare GilbVeda type NAME this option anchors to (`NoteDocument`, `Task`, `Rule`, …). */
  typeName: string;
  /**
   * The host's shipped field spec, when it has one. The chooser reads only whether it is there (the "name only" hint).
   *
   * `null` is a REAL and expected value now that the live catalogue is bound: a GilbVeda type
   * with no shipped spec can still be created — with its name and its type and nothing else.
   * It must NOT be given invented fields to look complete. Consumers
   * branch on this, they do not fabricate.
   */
  spec: { id: string } | null;
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
 * rendering the second as the first is exactly what must not happen. The
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
 * with its own short default set but must NEVER answer with a long list,
 * because the control renders what it is given.
 */
export type TypeSearchFn = (query: string) => Promise<TypeSearchResult>;
