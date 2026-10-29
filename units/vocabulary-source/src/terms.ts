// Reading GilbVeda term documents: the primitives the rest of this unit stands on.
//
// A term document is what the master serves at a term's own address (`GET /base/t/<Type>`, `GET /base/a/<slug>`). Nothing about
// what a stakeholder is, or what it can hold, is typed into this unit: it all comes out of those documents at run time.

/** A served term document, as parsed JSON. */
export type TermDoc = Record<string, unknown>;

/**
 * Thrown when the master cannot be reached, answered with an error, or served something this
 * package cannot read. Callers must treat it as "I could not read the definition", ⛔ never as
 * "there is nothing". The two are different claims: collapsing them turns a cold network into
 * an empty stakeholder list that looks exactly like a person who has recorded no one.
 */
export class VocabularyUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VocabularyUnavailableError";
  }
}

/**
 * A master read that did not end within its bound: one request past
 * `MASTER_REQUEST_TIMEOUT_MS`, or a whole reading or write call past `MASTER_READ_CAP_MS`. It is
 * a `VocabularyUnavailableError`: "not known yet", ⛔ never "there is nothing".
 */
export class MasterTimeoutError extends VocabularyUnavailableError {
  /** The bound that ran out, in ms. */
  readonly ms: number;
  constructor(message: string, ms: number) {
    super(message);
    this.name = "MasterTimeoutError";
    this.ms = ms;
  }
}

/** The host's fetch, injected so this package binds to no app's HTTP stack. `init` carries the
 *  cache mode the read needs (`masterSource` sends `{ cache: "no-cache" }`); pass it on. */
export type TermFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Split a NAME predicate's binding on `|`. Position carries no meaning: the result is a set. */
function splitBinding(token: string): string[] {
  return token
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Strip exactly one leading `a:` / `t:`. The one lawful READ-side reduction: a framed
 *  document may compact `a:fieldOf` to `fieldOf`. ⛔ Never applied on the write leg. */
export function bareForm(segment: string): string {
  return segment.replace(/^[at]:/, "");
}

/** A predicate as the master publishes it: what to read, and what (if anything) to write. */
export interface PredicateSpelling {
  /** The term document's own address, so a claim about a spelling can say where it came from. */
  term: string;
  /** Every key a stored fact may carry: each segment, prefixed and bare, retired ones included. */
  readKeys: string[];
  /** The one current spelling, verbatim as served. `null` when the term offers none or several. */
  writeKey: string | null;
  /** Why `writeKey` is `null`, stated rather than guessed. */
  writeKeyProblem: string | null;
}

/** The meta-keys a term document describes itself with. These are the bootstrap: the one place
 *  a key is named literally, because they are how every other key is found (gilb-photo reads
 *  `a:predicateAttribute` the same way). Both forms are read, since a frame may drop the prefix. */
const SELF_DESCRIPTION = {
  predicateAttribute: ["a:predicateAttribute", "predicateAttribute"],
  deprecatedNotation: ["a:deprecatedNotation", "deprecatedNotation"],
  encoding: ["a:encoding", "encoding"],
  typeAttribute: ["a:typeAttribute", "typeAttribute"],
  cardinality: ["a:cardinality", "cardinality"],
} as const;

function firstString(doc: TermDoc, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = doc[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Derive a predicate's read set and write spelling from its served binding. */
export function spellingFromBinding(
  term: string,
  token: string,
  deprecatedRaw: unknown,
): PredicateSpelling {
  const segments = splitBinding(token);
  const readKeys = new Set<string>();
  for (const seg of segments) {
    readKeys.add(seg);
    readKeys.add(bareForm(seg));
  }
  const retired = new Set<string>();
  const list = Array.isArray(deprecatedRaw) ? deprecatedRaw : deprecatedRaw == null ? [] : [deprecatedRaw];
  for (const v of list) if (typeof v === "string") for (const seg of splitBinding(v)) retired.add(seg);
  const survivors = segments.filter((s) => !retired.has(s));

  let writeKey: string | null = null;
  let writeKeyProblem: string | null = null;
  if (segments.length === 0) writeKeyProblem = `${term} serves an empty binding`;
  else if (survivors.length === 0) writeKeyProblem = `${term} retires every spelling it offers`;
  else if (survivors.length > 1)
    writeKeyProblem = `${term} offers ${survivors.length} current spellings (${survivors.join(", ")}) and retires none; GilbVeda must name one`;
  else writeKey = survivors[0]!;

  return { term, readKeys: [...readKeys], writeKey, writeKeyProblem };
}

/** Read a predicate term document into its spelling. Throws when it names no spelling at all:
 *  a predicate with no spelling cannot be read, and reading nothing would look like "no facts". */
export function spellingOfTermDoc(doc: TermDoc, fallbackTerm: string): PredicateSpelling {
  const term = typeof doc["@id"] === "string" ? (doc["@id"] as string) : fallbackTerm;
  const token = firstString(doc, SELF_DESCRIPTION.predicateAttribute);
  if (!token) {
    throw new VocabularyUnavailableError(`${term} carries no a:predicateAttribute; it names no spelling to read`);
  }
  const deprecated =
    doc[SELF_DESCRIPTION.deprecatedNotation[0]] ?? doc[SELF_DESCRIPTION.deprecatedNotation[1]];
  return spellingFromBinding(term, token, deprecated);
}

/** The term's declared value encoding (`inline-literal:text`, `reference:@id`, …), or null. */
export function encodingOf(doc: TermDoc): string | null {
  return firstString(doc, SELF_DESCRIPTION.encoding);
}

/** The string a writer stamps as a record's type, for the type this term defines
 *  (`a:typeAttribute`, e.g. `t:<Type>`), or null when the term publishes none. */
export function typeAttributeOf(doc: TermDoc): string | null {
  return firstString(doc, SELF_DESCRIPTION.typeAttribute);
}

/** The term's declared cardinality (`single`, `multi`), as served, or null. */
export function cardinalityOf(doc: TermDoc): string | null {
  return firstString(doc, SELF_DESCRIPTION.cardinality);
}

/** Every value stored under any key of the read set, arrays flattened. */
export function valuesUnder(doc: TermDoc, readKeys: readonly string[]): unknown[] {
  const out: unknown[] = [];
  for (const k of readKeys) {
    const v = doc[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) out.push(...v);
    else out.push(v);
  }
  return out;
}

/** The document's own prefix map, from its `@context`, so a CURIE value is expanded by the
 *  document that used it rather than by a namespace this package assumes. */
function prefixesOf(doc: TermDoc): Map<string, string> {
  const map = new Map<string, string>();
  // A context is an object, or a list of them: a page or named-read document serves
  // [the term context, the page grammar] (GilbPlatform `pageContext`). Each object member is read.
  const ctx = doc["@context"];
  for (const part of Array.isArray(ctx) ? ctx : [ctx]) {
    if (!part || typeof part !== "object" || Array.isArray(part)) continue;
    for (const [k, v] of Object.entries(part as Record<string, unknown>)) {
      if (typeof v === "string" && /^https?:\/\//.test(v)) map.set(k, v);
    }
  }
  return map;
}

/** Turn one reference value into an absolute IRI: `{"@id": …}` or a string, a CURIE expanded
 *  through the document's own context. Returns null for a value that is not a reference. */
function refOf(value: unknown, prefixes: Map<string, string>): string | null {
  let raw: unknown = value;
  if (raw && typeof raw === "object" && "@id" in (raw as object)) raw = (raw as { "@id": unknown })["@id"];
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = raw.trim();
  if (/^https?:\/\//.test(s)) return s;
  const m = /^([A-Za-z][\w-]*):(.+)$/.exec(s);
  if (m && prefixes.has(m[1]!)) return prefixes.get(m[1]!)! + m[2]!;
  return null;
}

/** Every reference stored under the read set, as absolute IRIs, deduplicated, in served order. */
export function refsUnder(doc: TermDoc, readKeys: readonly string[]): string[] {
  const prefixes = prefixesOf(doc);
  const out: string[] = [];
  for (const v of valuesUnder(doc, readKeys)) {
    const iri = refOf(v, prefixes);
    if (iri && !out.includes(iri)) out.push(iri);
  }
  return out;
}

/** The first text value under the read set (`"x"` or `{"@value": "x"}`), or null. */
export function textUnder(facts: Record<string, unknown>, readKeys: readonly string[]): string | null {
  for (const v of valuesUnder(facts, readKeys)) {
    const raw = v && typeof v === "object" && "@value" in (v as object) ? (v as { "@value": unknown })["@value"] : v;
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
}

/** A type's bare name, the last path segment of its IRI (`…/t/<Type>` → `<Type>`). This is the
 *  form a typed read's `?type=` takes. */
export function nameOfIri(iri: string): string {
  const tail = iri.replace(/\/+$/, "").split("/").pop() ?? iri;
  try {
    return decodeURIComponent(tail);
  } catch {
    return tail;
  }
}
