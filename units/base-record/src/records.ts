// The record shapes the Plan units read: a record as the app holds it, the served document behind it, and a row of the record list.
// Types only; the vault is the source of truth for every field.

/** A record as the app holds it — the vault is the source of truth for every field. */
export interface BaseRecord {
  /** The opaque record id. */
  id: string;
  /**
   * Canonical entity URI from the framed `@id` (e.g. `https://vault.example.test/base/e/<id>`).
   */
  entityUri?: string;
  /** The absolute type URI (`https://<host>/base/t/<Type>`). */
  typeUri: string;
  /**
   * True when `typeUri` is the app's "unknown" marker `t:Resource`, put there because the document named no type (or a stub awaits
   * hydration), not a claim about the record. The Plan card gates read it: such a record is never a Development Resource card.
   */
  typeSubstituted?: true;
  /** The typed facts, keyed by attribute slug (bare, e.g. `title`). */
  facts: Record<string, string>;
  /**
   * The slugs in {@link facts} that came off the vault's own served document. Absent means no
   * served document stands behind this record (a placeholder row, or a hand-built fixture).
   */
  servedKeys?: readonly string[];
  /**
   * The slugs in {@link facts} whose string is a stand-in, not the value (a value the editor cannot
   * express as a string, such as a language map or a structured scale, is handed over as `""`).
   * Required: a producer must state it on purpose; an empty array means nothing was lost.
   */
  opaqueFacts: readonly string[];
  /** The strong ETag (`"sha256:<hash>"`) — the If-Match token for the next write. */
  etag: string | null;
  /**
   * The facts as the vault served them, before they were flattened for the editor: a link stays
   * `{"@id": …}`, a list stays a list. It describes the document read at `served.etag` only; absent
   * means no served document is in hand.
   */
  served?: ServedDocument;
}

/** The facts of one served record document, unflattened — see {@link BaseRecord.served}. */
export interface ServedDocument {
  /** Bare slug → the served value, verbatim (string, number, boolean, `{"@id"}`, object, array). */
  readonly facts: Readonly<Record<string, unknown>>;
  /** The document's own `@context` as served. */
  readonly context: unknown;
  /** The ETag the document was served with. */
  readonly etag: string | null;
  /** Slugs the document served as `a:<slug>`, not under the term's own name. Absent means none. */
  readonly prefixedKeys?: readonly string[];
}

/**
 * A hydrated record plus its working-set `updatedAt` — a strict superset of BaseRecord (every
 * BaseRecord consumer keeps working unchanged); the grid uses the extra field to
 * merge-sort records against the file register (standalone files) into one recency list.
 */
export interface GridRecord extends BaseRecord {
  updatedAt: number;
  /**
   * True when this row's content was actually read from the vault; false when only its
   * membership is known and the content read failed (the stub path).
   *
   * Why this exists: `facts: {}` is ambiguous. An unnamed record and a record whose read 404'd are
   * byte-identical to every consumer: both render through the display name's entity-URI fallback as
   * the bare record id, and through the detail pane as `Untitled` with every field blank. Optional
   * (absent means unknown, not failed) so no existing consumer changes behaviour until it opts in.
   */
  hydrated?: boolean;
  /** Who ended this node. Present only on the Deleted-nodes list. */
  endingActorKind?: "holder" | "agent";
}

