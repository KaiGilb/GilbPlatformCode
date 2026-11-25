/**
 * The fields of one GilbVeda type, read from the ontology master: what a table draws as columns and a card as rows.
 *
 * An attribute term declares `a:fieldOf <Type>`. This unit reads every such declaration once (the master's carrier read, one request),
 * reads which slots each type requires (a second request), and derives one type's fields from the two. Nothing about what a type or a
 * field is, is typed in here: the label, the value kind, one-or-many, the value set, the record type a link points at and the status all
 * come out of the field's own term document. The keys below are only the ontology's self-description (how a term says what it is).
 */

import {
  CarrierSelectorMissingError,
  MasterTimeoutError,
  VocabularyUnavailableError,
  cardinalityOf,
  encodingOf,
  masterSource,
  nameOfIri,
  refsUnder,
  spellingOfTermDoc,
  textUnder,
  valuesUnder,
  type TermDoc,
  type TermFetch,
} from "@kaigilb/gilbplatformcode-vocabulary-source";

/** How a term says which type it is a field of, prefixed and bare (a framed document may drop the prefix). */
const FIELD_OF_KEYS = ["a:fieldOf", "fieldOf"] as const;
/** How a type term says which slots a record of it must carry. */
const REQUIRED_SLOT_KEYS = ["a:requiredSlot", "requiredSlot"] as const;
const LABEL_KEYS = ["a:label", "label"] as const;
const STATUS_KEYS = ["a:ontologyStatus", "ontologyStatus"] as const;
const ENCODING_KEYS = ["a:encoding", "encoding"] as const;
const VALUE_SET_KEYS = ["a:valueSet", "valueSet"] as const;
const VALUE_SET_CLOSURE_KEYS = ["a:valueSetClosure", "valueSetClosure"] as const;
const FIELD_RECORD_TYPE_KEYS = ["a:fieldRecordType", "fieldRecordType"] as const;
const ENDPOINT_KEYS = ["a:endpoint", "endpoint"] as const;
const ENDPOINT_ROLE_KEYS = ["a:role", "role"] as const;
const ENDPOINT_TYPE_KEYS = ["a:endpointType", "endpointType"] as const;
const SLOT_KEYS = ["a:slot", "slot"] as const;
const CARD_KEYS = ["a:card", "card"] as const;
const NOTE_KEYS = ["a:note", "note"] as const;

/** One page holds every field declaration of the master (847 terms when this unit was written); more pages are followed. */
export const FIELD_DECLARATIONS_PAGE_SIZE = 1000;

/** A bare type name as the master's `/base/t/<Name>` path takes it. */
const TYPE_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;

/**
 * What a field's value is, from the term's declared encoding.
 * `reference`: the value is a link to another record or term (`{"@id": …}`). `unknown`: the term declares no encoding, or one this
 * unit does not know; the encoding as served is kept beside it, so nothing is guessed.
 */
export type FieldKind = "text" | "token" | "integer" | "decimal" | "boolean" | "date" | "uri" | "json" | "reference" | "unknown";

/** A field's fixed list of values, as its term declares it. */
export interface FieldValueSet {
  /** The values, in served order. */
  values: string[];
  /** The term's own closure word, as served (`closed`, `closed-forward`, …), or null when it states none. */
  closure: string | null;
}

/** One slot a type requires of every record of it, as the type term states it. */
export interface RequiredSlot {
  /** The slot's key as served (`a:label`). */
  slot: string;
  /** The count as served (`1`, `1..*`), or null. */
  card: string | null;
  note: string | null;
}

/** One field of a type: one column of its table. */
export interface TypeField {
  /** The field's anchor, `a:<slug>`: the one current spelling its term publishes, or the first spelling when the term offers several. */
  anchor: string;
  /** The one spelling a writer may use, or null when the term offers none or several (a reader is not stopped by that). */
  writeKey: string | null;
  /** Every key a stored fact of this field may carry: each spelling, prefixed and bare. */
  readKeys: string[];
  /** The field term's own address. */
  term: string;
  /** The field term's document as served, for `readList(record, field.doc)`. */
  doc: TermDoc;
  label: string;
  kind: FieldKind;
  /**
   * The encoding as served: one text (`inline-literal:text`, `reference`), or a list of texts when the term serves a list (one live
   * term does: `["reference-valued:@id", "inline-literal:text"]`), or null when it serves none. Kept as served, a list as a list.
   */
  encoding: string | readonly string[] | null;
  /** `single` or `multi`; null when the term states neither (see `cardinalityAsServed`). */
  cardinality: "single" | "multi" | null;
  /** The cardinality token as served, or null when the term carries none. */
  cardinalityAsServed: string | null;
  /** The field's fixed list of values, or null when it has none. */
  valueSet: FieldValueSet | null;
  /** The address of the type a link in this field points at, or null when the term names none. */
  recordType: string | null;
  /** True when the type's own term requires this field of every record. */
  required: boolean;
  /** The term's status as served (`Approved`, `Suggested`, `Deprecated`), or null. */
  status: string | null;
}

/** A declaration that names the type but cannot be read as a field. Stated, never dropped. */
export interface FieldProblem {
  term: string;
  why: string;
}

/** The fields of one type. */
export interface TypeFields {
  /** The type's address on the master. */
  type: string;
  typeName: string;
  /** The type's anchor, `t:<Type>`. */
  typeAnchor: string;
  /** Sorted by label, then by term address, so two readings compare equal. */
  fields: TypeField[];
  /** Every slot the type's own term requires, whether or not it is one of `fields`. */
  requiredSlots: RequiredSlot[];
  /** Declarations naming this type that could not be read as a field. */
  unreadable: FieldProblem[];
  /** False when the master did not list every declaration: `fields` is then a floor, not the whole set. */
  complete: boolean;
  incompleteAt: string[];
}

/** Every field declaration of the master, and every term that states required slots: two requests, good for every type. */
export interface FieldDeclarations {
  /** The master's origin these were read from. */
  origin: string;
  /** Every term that declares `a:fieldOf`. */
  fieldTerms: TermDoc[];
  /** Every term that states `a:requiredSlot`. */
  requiredTerms: TermDoc[];
  complete: boolean;
  incompleteAt: string[];
}

/**
 * Why a type's fields are not known. `kind`:
 * - `not-found`: the master answered 404 for a read.
 * - `forbidden`: it answered 401 or 403.
 * - `server`: it answered another error status.
 * - `network`: it could not be reached.
 * - `timeout`: it gave no answer in time.
 * - `not-narrowed`: it does not serve the carrier read (an older master); the whole listing is not walked.
 * - `unknown-type`: the name is not a type on this master, or is not a type name at all.
 * - `unreadable`: it answered something this unit cannot read.
 * None of them means "this type has no fields".
 */
export type TypeFieldsErrorKind = "not-found" | "forbidden" | "server" | "network" | "timeout" | "not-narrowed" | "unknown-type" | "unreadable";

/** A read of fields that failed. `kind` says how; it is never to be shown as "this type has no fields". */
export class TypeFieldsError extends Error {
  readonly kind: TypeFieldsErrorKind;
  /** The HTTP status the master answered, when it answered. */
  readonly status: number | null;
  constructor(kind: TypeFieldsErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "TypeFieldsError";
    this.kind = kind;
    this.status = status;
  }
}

/** Where and how to read the master. */
export interface ReadOptions {
  /** The ontology master's origin, a bare origin. Never a default: the host passes the one it keeps. */
  vedaOrigin: string;
  /** The host's fetch, when it has its own HTTP stack or wants to test. It is called with `{ cache: "no-cache", signal }`. */
  fetchImpl?: TermFetch;
  signal?: AbortSignal;
  /** Rows a page of the carrier read asks for. Default {@link FIELD_DECLARATIONS_PAGE_SIZE}. */
  pageSize?: number;
}

function firstString(doc: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = doc[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * The value kind an encoding names. Only the encoding's own words are read.
 *
 * @param encoding the term's encoding as served: a text, a list of texts, or null
 * @returns the kind; `unknown` for no encoding, one this unit does not know, or forms that are not all one kind
 */
export function fieldKindOf(encoding: string | readonly string[] | null): FieldKind {
  const served = typeof encoding === "string" ? [encoding] : (encoding ?? []);
  // An encoding may name several forms: as a list, or inside one text (`a|b`, `a,b`). They are one kind only when every form is that
  // kind; a term that allows a link or a text is not read as either, and its value is then shown as it is stored.
  const forms = served.flatMap((text) => text.split(/[|,]/)).filter((part) => part.trim() !== "");
  if (forms.length === 0) return "unknown";
  const kinds = [...new Set(forms.map((part) => oneKindOf(part)))];
  return kinds.length === 1 ? (kinds[0] as FieldKind) : "unknown";
}

/**
 * A term's encoding as it is served: the one text, or the list of texts when the term serves a list, or null when it serves none.
 * A list is kept a list: joined into one text it would read as an encoding the master never served.
 *
 * @param doc the term's document
 */
export function encodingAsServed(doc: Record<string, unknown>): string | readonly string[] | null {
  const one = encodingOf(doc);
  if (one !== null) return one;
  for (const key of ENCODING_KEYS) {
    const v = doc[key];
    if (Array.isArray(v)) {
      const texts = v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
      if (texts.length > 0) return texts;
    }
  }
  return null;
}

/** The kind one form of an encoding names. */
function oneKindOf(part: string): FieldKind {
  const e = part.trim().toLowerCase();
  if (e.startsWith("reference") || e.startsWith("node-reference")) return "reference";
  if (!e.startsWith("inline-literal:")) return "unknown";
  // `text[]` is text, held several times: how many is the term's cardinality, not its kind.
  const literal = e.slice("inline-literal:".length).replace(/\[\]$/, "");
  if (literal === "text" || literal === "string") return "text";
  if (literal === "token" || literal === "enum") return "token";
  if (literal === "integer") return "integer";
  if (literal === "decimal") return "decimal";
  if (literal === "boolean") return "boolean";
  if (literal === "date" || literal === "datetime") return "date";
  if (literal === "uri" || literal === "uri-or-uri-array") return "uri";
  if (literal === "json") return "json";
  return "unknown";
}

function valueSetOf(doc: TermDoc): FieldValueSet | null {
  const values = valuesUnder(doc, VALUE_SET_KEYS).filter((v): v is string => typeof v === "string");
  if (values.length === 0) return null;
  return { values, closure: firstString(doc, VALUE_SET_CLOSURE_KEYS) };
}

/** The type a link in this field points at: the term's own record type, else the type of its `reference` end. */
function recordTypeOf(doc: TermDoc): string | null {
  const own = refsUnder(doc, FIELD_RECORD_TYPE_KEYS)[0];
  if (own) return own;
  for (const end of valuesUnder(doc, ENDPOINT_KEYS)) {
    if (!end || typeof end !== "object" || Array.isArray(end)) continue;
    const e = end as Record<string, unknown>;
    if (firstString(e, ENDPOINT_ROLE_KEYS) !== "reference") continue;
    // The end is a part of the term's document: lend it the document's context, so a short form is expanded by its own document.
    const type = refsUnder({ ...e, "@context": doc["@context"] }, ENDPOINT_TYPE_KEYS)[0];
    if (type) return type;
  }
  return null;
}

function requiredSlotsOf(doc: TermDoc): RequiredSlot[] {
  const out: RequiredSlot[] = [];
  for (const raw of valuesUnder(doc, REQUIRED_SLOT_KEYS)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    const slot = firstString(r, SLOT_KEYS);
    if (!slot) continue;
    out.push({ slot, card: firstString(r, CARD_KEYS), note: firstString(r, NOTE_KEYS) });
  }
  return out;
}

function checkTypeName(typeName: string): string {
  const name = typeName.trim().replace(/^t:/, "");
  if (!TYPE_NAME.test(name)) throw new TypeFieldsError("unknown-type", `${JSON.stringify(typeName)} is not a type name`);
  return name;
}

/**
 * One term as a field, or the reason it cannot be read as one.
 *
 * @param doc the field term's document
 * @param requiredSlots the slots the type in question requires (none when the field is not read for one type)
 */
function fieldOfTerm(doc: TermDoc, requiredSlots: readonly RequiredSlot[]): { field: TypeField } | { problem: FieldProblem } {
  const term = typeof doc["@id"] === "string" ? (doc["@id"] as string) : "(a term with no address)";
  let spelling;
  try {
    spelling = spellingOfTermDoc(doc, term);
  } catch (e) {
    return { problem: { term, why: e instanceof Error ? e.message : String(e) } };
  }
  const anchor = spelling.writeKey ?? spelling.readKeys[0];
  if (!anchor) return { problem: { term, why: `${term} names no spelling to read` } };
  const encoding = encodingAsServed(doc);
  const served = cardinalityOf(doc);
  return {
    field: {
      anchor,
      writeKey: spelling.writeKey,
      readKeys: spelling.readKeys,
      term,
      doc,
      label: textUnder(doc, LABEL_KEYS) ?? nameOfIri(term),
      kind: fieldKindOf(encoding),
      encoding,
      cardinality: served === "single" || served === "multi" ? served : null,
      cardinalityAsServed: served,
      valueSet: valueSetOf(doc),
      recordType: recordTypeOf(doc),
      required: requiredSlots.some((s) => spelling.readKeys.includes(s.slot)),
      status: firstString(doc, STATUS_KEYS),
    },
  };
}

/**
 * Every field the master declares, by each key a stored fact of it may carry (prefixed and bare). Pure; no request.
 *
 * A table uses it to head and read a fact a record holds outside its type's own fields, for example a field declared on a type above.
 * It does not say which types a field belongs to: `required` is false on every entry, because that is a fact about one type. When two
 * terms publish the same key, the term whose address sorts first is kept, so two readings agree. A host builds it once per reading of
 * the declarations and keeps it beside them.
 *
 * @param declarations what {@link readFieldDeclarations} returned
 * @returns the index; a term that cannot be read as a field is not in it
 */
export function fieldIndex(declarations: FieldDeclarations): Map<string, TypeField> {
  const index = new Map<string, TypeField>();
  const terms = [...declarations.fieldTerms].sort((a, b) => String(a["@id"] ?? "").localeCompare(String(b["@id"] ?? ""), "en"));
  for (const doc of terms) {
    const read = fieldOfTerm(doc, []);
    if (!("field" in read)) continue;
    for (const key of read.field.readKeys) if (!index.has(key)) index.set(key, read.field);
  }
  return index;
}

/**
 * One type's fields, from declarations already read. Pure.
 *
 * A field is a term whose `a:fieldOf` names exactly this type's address on the declarations' master. Fields declared on a type above
 * this one are not added: the caller that wants them derives each type above and joins them.
 *
 * @param declarations what {@link readFieldDeclarations} returned
 * @param typeName the bare type name (`Person`) or its anchor (`t:Person`)
 * @throws TypeFieldsError `unknown-type` when the name is not a type name
 */
export function fieldsOfType(declarations: FieldDeclarations, typeName: string): TypeFields {
  const name = checkTypeName(typeName);
  const type = `${declarations.origin}/base/t/${name}`;
  const requiredSlots = declarations.requiredTerms.filter((d) => d["@id"] === type).flatMap(requiredSlotsOf);
  const fields: TypeField[] = [];
  const unreadable: FieldProblem[] = [];
  for (const doc of declarations.fieldTerms) {
    if (!refsUnder(doc, FIELD_OF_KEYS).includes(type)) continue;
    const read = fieldOfTerm(doc, requiredSlots);
    if ("field" in read) fields.push(read.field);
    else unreadable.push(read.problem);
  }
  fields.sort((a, b) => a.label.localeCompare(b.label, "en") || a.term.localeCompare(b.term, "en"));
  return {
    type,
    typeName: name,
    typeAnchor: `t:${name}`,
    fields,
    requiredSlots,
    unreadable,
    complete: declarations.complete,
    incompleteAt: declarations.incompleteAt,
  };
}

/** The master source for one read, with the status of every answer kept so a failure can say what the master said. */
function watchedSource(opts: ReadOptions) {
  const answered: { status: number | null }[] = [];
  const inner: TermFetch = opts.fetchImpl ?? ((u: string, init?: RequestInit) => fetch(u, init));
  const fetchImpl: TermFetch = async (url, init) => {
    const seen: { status: number | null } = { status: null };
    answered.push(seen);
    const res = await inner(url, init);
    seen.status = res.status;
    return res;
  };
  const source = masterSource({
    vedaOrigin: opts.vedaOrigin,
    fetchImpl,
    carrierPageSize: opts.pageSize ?? FIELD_DECLARATIONS_PAGE_SIZE,
  });
  /** One failed read as a {@link TypeFieldsError}: the first refusing status of this source's answers decides. */
  const failure = (e: unknown): TypeFieldsError => {
    if (e instanceof TypeFieldsError) return e;
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof CarrierSelectorMissingError) return new TypeFieldsError("not-narrowed", message);
    if (e instanceof MasterTimeoutError) return new TypeFieldsError("timeout", message);
    const refused = answered.find((a) => a.status !== null && (a.status < 200 || a.status > 299));
    if (refused) {
      const status = refused.status as number;
      const kind: TypeFieldsErrorKind = status === 404 ? "not-found" : status === 401 || status === 403 ? "forbidden" : "server";
      return new TypeFieldsError(kind, message, status);
    }
    if (answered.some((a) => a.status === null)) return new TypeFieldsError("network", message);
    if (e instanceof VocabularyUnavailableError) return new TypeFieldsError("unreadable", message);
    return new TypeFieldsError("unreadable", message);
  };
  return { source, failure };
}

/**
 * Read every field declaration and every required-slot statement of the master: two requests, made at the same time, good for every type.
 * A host keeps the answer (its own cache) and derives each type's fields from it with {@link fieldsOfType}.
 *
 * @throws TypeFieldsError when the master cannot be read. It never answers an empty list for a failed read.
 */
export async function readFieldDeclarations(opts: ReadOptions): Promise<FieldDeclarations> {
  const { source, failure } = watchedSource(opts);
  try {
    const [fields, required] = await Promise.all([source.carriersOf(FIELD_OF_KEYS, opts.signal), source.carriersOf(REQUIRED_SLOT_KEYS, opts.signal)]);
    return {
      origin: opts.vedaOrigin.replace(/\/+$/, ""),
      fieldTerms: fields.terms,
      requiredTerms: required.terms,
      complete: fields.complete && required.complete,
      incompleteAt: [...fields.incompleteAt, ...required.incompleteAt],
    };
  } catch (e) {
    throw failure(e);
  }
}

/**
 * The fields of one type: its columns.
 *
 * Two requests when `declarations` is not given (see {@link readFieldDeclarations}); none when it is. A type that comes out with no field
 * costs one more: its own term is read, so that "this type has no fields" (it answers) is told apart from "there is no such type" (404).
 *
 * @param opts the master's origin and, when the host already holds them, the declarations
 * @param typeName the bare type name (`Person`) or its anchor (`t:Person`)
 * @throws TypeFieldsError see {@link TypeFieldsErrorKind}
 */
export async function readTypeFields(opts: ReadOptions & { declarations?: FieldDeclarations }, typeName: string): Promise<TypeFields> {
  const name = checkTypeName(typeName);
  const declarations = opts.declarations ?? (await readFieldDeclarations(opts));
  const out = fieldsOfType(declarations, name);
  if (out.fields.length > 0 || out.requiredSlots.length > 0) return out;
  const { source, failure } = watchedSource(opts);
  try {
    await source.term(out.type, opts.signal);
  } catch (e) {
    const f = failure(e);
    if (f.kind === "not-found") throw new TypeFieldsError("unknown-type", `t:${name} is not a type on ${declarations.origin}`, 404);
    throw f;
  }
  return out;
}
