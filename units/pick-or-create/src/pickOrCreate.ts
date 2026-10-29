// Pick-or-create: finds a holder's existing record of a person in one named vault, or makes one.
//
// THE HOLDER'S RECORD, BY CONSTRUCTION. Every function here that returns a record returns an id the platform gave back from a
// read SCOPED TO THE NAMED VAULT (the typed record list, or the vault-scoped tag resolve), or the id a create minted INTO that
// vault. No function returns a party's own identity, and a create writes no REFERENCE to one: a field whose term declares a
// reference encoding is refused, whatever it is given, UNLESS it is one of the references `holder-reference` checks: then each
// target must be a record found in the named vault's typed list, of a type the ontology admits for that field and this kind,
// and is checked before anything is written. Every other reference field is refused. The one reference a create takes from its
// caller unchecked is `holder`, the stater. Text is text: an IRI typed into a text field is stored as that text, not as a
// reference. `agent` is also an IRI from the caller; it is sent as the writer and is not a fact on the record.
//
// HOLDER-ONLY VISIBILITY. A record has no audience fact of its own: its audience is the reader set of the vault it is written
// into. So the vault is NAMED by the caller on every call; there is no default vault. A create writes the record, the facts the
// caller gave and the stater. The record's tag is the PLATFORM's: it makes the master at create, and this module reads it back
// (and asks the platform to make it when it has none). It works out and registers no tag of its own, makes no grant, writes no
// audience fact and calls no sharing route. Writing into a vault other people read is the caller choosing those readers.
//
// THE SOURCE. `a:statedBy` is the holder, given by the caller as an IRI. Never defaulted, never taken from the writing
// credential. It is the self card of the vault the record is written into, not the account principal. `agent` is a different
// thing: the principal of the writing token, recorded by the store as who WROTE each fact. Never the holder's card.
//
// A FIELD THAT HOLDS A RECORD OF ITS OWN. Where a field's term carries `a:fieldRecordType`, each entry is a separate record of
// that type, made with the entry, in the same vault, stated by the same holder, and the carrier holds a reference to it. It is
// written first, then the carrier with the reference; the platform makes the tag.
//
// NOTHING HERE NAMES A KIND OR A FIELD. The kind is one of the kinds read from the master; a field is one the kind's field set
// offers, written under the spelling its own term publishes.
import {
  expectStatus,
  isAbsoluteIri,
  locate,
  originHostMismatch,
  PlatformError,
  request,
  routeUrl,
  vaultSegment,
  walkRecordPages,
  type PlatformClient,
} from "@kaigilb/gilbplatformcode-record-sync";
import {
  bareForm,
  checkedBound,
  MASTER_READ_CAP_MS,
  MASTER_REQUEST_TIMEOUT_MS,
  spellingOfTermDoc,
  VocabularyUnavailableError,
  type PredicateSpelling,
  type VocabularySource,
} from "@kaigilb/gilbplatformcode-vocabulary-source";
import type { FieldRecord, RecordField, StakeholderFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import {
  assertTagString,
  checkNewTagString,
  lookupTagString,
  readTagGrammar,
  readTagWriteRule,
  TagRefusedError,
  tagRefusalSentence,
  type TagGrammar,
  type TagWriteRule,
} from "@kaigilb/gilbplatformcode-tag-grammar";
import { ensureMasterTag, NoTagRoutesError, readMasterTag } from "@kaigilb/gilbplatformcode-tag-client";
import {
  checkReference,
  openWriteCall,
  PlacementUnknownError,
  readReferenceVocabulary,
  referenceFieldFor,
  rowPlacement,
  type ReferenceReading,
  type ReferenceReadingOptions,
} from "@kaigilb/gilbplatformcode-holder-reference";

/** The stater predicate's address on the master. */
export const STATED_BY_TERM = "a/statedBy";

/** What the picker needs to have read before it can act. Plain data: it can be kept and reused. */
export interface PickerReading {
  fieldSets: StakeholderFieldSets;
  grammar: TagGrammar;
  statedBy: PredicateSpelling;
  /** The reference reading for display. Absent: every reference field is refused at create. Present: a reference
   *  field goes to the write-time check, which reads its sets live. */
  references?: ReferenceReading;
  /** The write limits for a new tag string, read beside the grammar. Absent when that record could not be read:
   *  the platform is the gate, and a missing rule does not block the write. */
  tagWriteRule?: TagWriteRule;
}

/** Read the grammar and the stater's spelling, beside a field-set reading already in hand. With `references`, the reference
 *  reading too, at the same time, through the cached readers `opts` names.
 *  @throws RangeError when `opts.timeoutMs` or `opts.readCapMs` is given and is not a finite number above 0, at most
 *  2,147,483,647, before anything is read, with `references` or without */
export async function readPickerVocabulary(
  source: VocabularySource,
  fieldSets: StakeholderFieldSets,
  opts: { references?: boolean } & ReferenceReadingOptions = {},
): Promise<PickerReading> {
  // Checked here, not only in `readReferenceVocabulary`: the grammar and the stater's term start beside it, so a bad bound
  // checked there would be refused only after those requests were sent.
  checkedBound("timeoutMs", opts.timeoutMs, MASTER_REQUEST_TIMEOUT_MS);
  checkedBound("readCapMs", opts.readCapMs, MASTER_READ_CAP_MS);
  const statedByIri = source.termIri(STATED_BY_TERM);
  // The write rule is loaded here, beside the grammar: `readTagWriteRule` follows `a:writeRule` from `a:tagString`.
  // A record that cannot be read is "not known yet". It is left off the reading, and a write is not blocked on it.
  const [grammar, statedByDoc, references, tagWriteRule] = await Promise.all([
    readTagGrammar(source),
    source.term(statedByIri),
    opts.references ? readReferenceVocabulary(source, fieldSets, opts) : undefined,
    readTagWriteRule(source).then(
      (rule) => rule,
      (err: unknown) => {
        if (err instanceof VocabularyUnavailableError) return undefined;
        throw err;
      },
    ),
  ]);
  const reading: PickerReading = { fieldSets, grammar, statedBy: spellingOfTermDoc(statedByDoc, statedByIri) };
  if (references) reading.references = references;
  if (tagWriteRule) reading.tagWriteRule = tagWriteRule;
  return reading;
}

export interface Picker {
  platform: PlatformClient;
  reading: PickerReading;
  /** The master. Every write-time reference rule reads its sets from it live, in the write call;
   *  with none, a reference field is "not known yet". */
  master?: VocabularySource;
}

// ── Find and pick ────────────────────────────────────────────────────────────────────────

/** One of the holder's records, as the named vault's typed list returned it. */
export interface Candidate {
  /** The record's IRI. */
  record: string;
  /** The vault that holds the record: the named vault, which its row named. */
  vaultId: string;
  /** The record's type, as served (`t:<Type>`). */
  type: string;
  /** The list's own display label for the row, or `null`. */
  label: string | null;
}

export interface FindResult {
  candidates: Candidate[];
  /** False when the walk stopped before the list said it had no more. The candidates are then
   *  a floor. ⛔ Never rendered as "no such stakeholder". */
  complete: boolean;
  pages: number;
}

/** The bare type names of the kinds, the form the typed list's `?type=` takes. */
function kindNames(reading: PickerReading): string[] {
  return reading.fieldSets.kinds.types.map((t) => t.name);
}

/**
 * The holder's stakeholder records in one vault: the typed list for the kinds read from the
 * master, walked to its end. `text` keeps the rows whose label holds it, ignoring case.
 *
 * ONLY THE NAMED VAULT'S OWN RECORDS ARE OFFERED. The typed list of V also lists the records of every vault nested in V, and each row
 * names the vault that holds its record (`rowPlacement`, the same test the reference check uses):
 *   - a row whose `vault` is V is offered;
 *   - a row of another vault (a nested one included) is not offered: every reference to it would
 *     be refused;
 *   - a row held in more than one vault (`vaultAmbiguous: true`) is not offered;
 *   - a row that would be offered and names no vault (a platform that names no vault per row)
 *     makes the whole answer "not known yet": `PlacementUnknownError` is thrown, ⛔ never an empty
 *     or partial list read as "no one".
 */
export async function findCandidates(
  picker: Picker,
  query: { vaultId: string; text?: string; maxPages?: number },
): Promise<FindResult> {
  requireVault(query.vaultId);
  const names = kindNames(picker.reading);
  // An empty `?type=` would list the whole vault, and an empty answer would read as "no one".
  if (names.length === 0) throw new VocabularyUnavailableError("the vocabulary reading holds no stakeholder kinds");
  const wanted = new Set(names);
  const needle = query.text === undefined ? null : query.text.trim().toLocaleLowerCase();
  const maxPages = query.maxPages ?? 200;
  // Full-row pages of 100, walked by the list's own `nextOffset` (`walkRecordPages`), ⛔ not 20 ids a page by rows added.
  const walk = await walkRecordPages(picker.platform, query.vaultId, names, { maxPages });
  const candidates: Candidate[] = [];
  for (const { entity, typeUri, label, row } of walk.rows) {
    if (typeUri === null) continue;
    // The server filtered by type. This is the second check, not the first.
    if (!wanted.has(bareForm(typeUri))) continue;
    if (needle !== null && needle !== "" && !(label ?? "").toLocaleLowerCase().includes(needle)) continue;
    // Placement last: a row the type or the text leaves out is not offered whatever its vault.
    const placement = rowPlacement(row, query.vaultId);
    if (placement === "not-known-yet") throw new PlacementUnknownError(query.vaultId, entity);
    if (placement !== "in-vault") continue;
    candidates.push({ record: entity, vaultId: query.vaultId, type: typeUri, label });
  }
  const { complete, pages } = walk;
  return { candidates, complete, pages };
}

/** What a vault-scoped tag lookup found. */
type TagPick =
  | { status: "stakeholder"; pick: PickResult }
  /** The tag names something in the vault that is not a record of a stakeholder kind (the tag
   *  plane is shared by every tagged thing in a vault). */
  | { status: "other"; record: string; type: string | null }
  | { status: "miss" };

async function lookUpStakeholderByTag(picker: Picker, vaultId: string, tag: string): Promise<TagPick> {
  const hit = await lookupTagString(picker.platform, { tag, vaultId });
  if (hit.status !== "resolved") return { status: "miss" };
  // The tag route says which record. What KIND of record it is, the record says.
  const opened = expectStatus(await request(picker.platform, "GET", locate(picker.platform, hit.record)), "GET", [200]);
  const served = opened.json?.["@type"];
  const types = (Array.isArray(served) ? served : [served]).filter((t): t is string => typeof t === "string");
  const wanted = new Set(kindNames(picker.reading));
  const type = types.find((t) => wanted.has(bareForm(t)));
  if (type === undefined) return { status: "other", record: hit.record, type: types[0] ?? null };
  return { status: "stakeholder", pick: { created: false, record: hit.record, vaultId, type } };
}

/** The holder's stakeholder record a tag names in one vault. `null` when the tag names none
 *  there, or names something that is not a stakeholder record. */
export async function pickByTag(picker: Picker, query: { vaultId: string; tag: string }): Promise<PickResult | null> {
  requireVault(query.vaultId);
  const tag = assertTagString(query.tag, picker.reading.grammar);
  const found = await lookUpStakeholderByTag(picker, query.vaultId, tag);
  return found.status === "stakeholder" ? found.pick : null;
}

export interface PickResult {
  created: false;
  record: string;
  vaultId: string;
  /** The record's type, as served (`t:<Type>`). */
  type: string;
}

/** Choose a candidate the find returned. The result is the holder's record: the candidate came
 *  from a read scoped to the holder's named vault. */
export function pick(candidate: Candidate): PickResult {
  return { created: false, record: candidate.record, vaultId: candidate.vaultId, type: candidate.type };
}

// ── Create ───────────────────────────────────────────────────────────────────────────────

export type CreateRefusal =
  | "no-vault"
  | "no-holder"
  | "no-agent"
  | "unknown-kind"
  | "kind-offers-no-name"
  | "no-name"
  | "field-not-offered"
  | "field-ambiguous"
  | "field-not-writable"
  | "field-value"
  | "tag-refused"
  | "origin-not-vault-host";

/** Refused before anything was written. */
export class CreateRefusedError extends Error {
  readonly reason: CreateRefusal;
  constructor(reason: CreateRefusal, message: string) {
    super(message);
    this.name = "CreateRefusedError";
    this.reason = reason;
  }
}

/** Something WAS written and a later step failed. It says what exists, so nothing is lost
 *  silently. ⛔ Nothing is deleted. */
export class PartialCreateError extends Error {
  /** The party record, when it was written; `null` when the failure came before it. An address
   *  the create answered with, when the record could not be read back to learn its own IRI. */
  readonly record: string | null;
  /** Everything this create wrote before it failed, in order (records a field holds, then the
   *  party record). */
  readonly written: string[];
  readonly vaultId: string;
  readonly cause: unknown;
  constructor(message: string, at: { record: string | null; written: string[]; vaultId: string; cause: unknown }) {
    super(message);
    this.name = "PartialCreateError";
    this.record = at.record;
    this.written = at.written;
    this.vaultId = at.vaultId;
    this.cause = at.cause;
  }
}

/** A reference to another record. */
export interface Ref {
  "@id": string;
}
/** One entry of a field that holds a record of its own: that record's facts, keyed like
 *  `fields` (by a field's term IRI or by one of its spellings). */
export interface RecordEntry {
  record: Record<string, string | Ref | (string | Ref)[]>;
}
export type FieldValue = string | Ref | RecordEntry | (string | Ref | RecordEntry)[];

export interface CreateInput {
  /** The vault the record is written into: a `vaultId` from the platform's vault list. */
  vaultId: string;
  /** The holder, as an IRI: the value of `a:statedBy`. It is the self card of the vault named
   *  above (see the file header). */
  holder: string;
  /** The writer: the principal of the token the writes are made with. The platform records it
   *  on each fact as who wrote it. ⛔ Not the holder's card. */
  agent: string;
  /** The kind's IRI: a key of the field-set reading's `byKind`. */
  kind: string;
  name: string;
  /** Other facts, keyed by a field's term IRI or by one of its spellings. A field that holds a
   *  record of its own takes `{ record: { … } }`, that record's facts keyed the same way. */
  fields?: Record<string, FieldValue>;
}

/** What {@link pickOrCreate} takes: a create's input, and a tag to look up first. The tag is ONLY looked up (it names the record to pick); it is never
 *  registered, because the platform makes every record's tag. */
export interface PickOrCreateInput extends CreateInput {
  /** A tag to look up in the named vault before creating: a stakeholder record it names is picked instead. */
  tag?: string;
}

export interface CreateResult {
  created: true;
  record: string;
  vaultId: string;
  /** The master tag the platform made for the record, or `null` when the platform would not say (an anomaly, or a tag this caller cannot read). */
  tag: string | null;
  tagHandle: string | null;
  /** The records a field holds that were written with this one (empty when there were none). */
  held: string[];
}

function requireVault(vaultId: unknown): asserts vaultId is string {
  if (!isAbsoluteIri(vaultId))
    throw new CreateRefusedError("no-vault", "name the vault: a vaultId from the platform's vault list. There is no default vault");
}

/** The field a caller's key names: by term IRI, or by any spelling the term publishes. */
function fieldFor<F extends RecordField>(fields: readonly F[], on: string, key: string): F {
  const hits = fields.filter((f) => f.term === key || f.writeKey === key || f.readKeys.includes(key));
  if (hits.length === 0)
    throw new CreateRefusedError("field-not-offered", `${JSON.stringify(key)} is not a field the master offers on ${on}`);
  if (hits.length > 1)
    throw new CreateRefusedError("field-ambiguous", `${JSON.stringify(key)} names ${hits.length} fields of ${on}: ${hits.map((f) => f.term).join(", ")}`);
  return hits[0]!;
}

const isRecordEntry = (v: unknown): v is RecordEntry =>
  !!v && typeof v === "object" && !Array.isArray(v) && "record" in v && !!(v as RecordEntry).record && typeof (v as RecordEntry).record === "object";

/** Shape one value for one field, by the encoding the field's own term declares. */
function encode(field: RecordField, value: string | Ref | RecordEntry | (string | Ref | RecordEntry)[], key: string): unknown {
  const encoding = field.encoding ?? "";
  // First, and whatever shape was given (a reference, text, a list):
  if (encoding.startsWith("reference"))
    // A reference to a party must point at the HOLDER'S OWN record of that party, never at the
    // party's identity (HolderRecord). Nothing here writes what it has not checked. The references `holderReference.ts` checks never reach this line: the create
    // routes them there first. Any other reference field is refused here.
    throw new CreateRefusedError("field-not-writable", `${key} is a reference (its term declares ${encoding}); this create writes no reference it cannot check is the holder's own record`);
  const one = (v: string | Ref | RecordEntry): unknown => {
    if (isRecordEntry(v))
      throw new CreateRefusedError("field-value", `${key} does not hold a record of its own (its term carries no record type)`);
    if (encoding.startsWith("inline-literal")) {
      if (typeof v !== "string" || v.trim() === "")
        throw new CreateRefusedError("field-value", `${key} takes text (its term declares ${encoding})`);
      return v;
    }
    // An encoding this module does not know how to write (none declared, or a reified form).
    // ⛔ Not guessed at: a value written in the wrong shape is unreadable to every other app.
    throw new CreateRefusedError("field-not-writable", `${key} declares encoding ${JSON.stringify(field.encoding)}, which this create does not write`);
  };
  if (!Array.isArray(value)) return one(value);
  // A list is checked as a list, not only item by item: an empty one holds no value, and a field
  // whose term does not declare it multi holds one value.
  if (value.length === 0) throw new CreateRefusedError("field-value", `${key} was given an empty list`);
  if (!field.many) throw new CreateRefusedError("field-value", `${key} holds one value (its term does not declare it multi), and a list was given`);
  return value.map(one);
}

/**
 * Record a party in the holder's vault: one record, the holder as its stater. The record's tag is the platform's (it makes the master at create): after the
 * platform's 201 the master is READ (`GET /base/tag/master?targetEntity=`), and when the platform says there is none it is asked to make one ONCE
 * (`POST /base/tag/ensure`) and read again. A platform without those routes is a hard `NoTagRoutesError` (a `PlatformError`), ⛔ never an older derivation.
 * Refuses, before writing, anything the master does not offer.
 */
export async function createRecord(picker: Picker, input: CreateInput): Promise<CreateResult> {
  const { reading, platform } = picker;

  // 1 · Everything that can be refused is refused before the first write.
  requireVault(input.vaultId);
  // The vault's own host, as for every writer here (from another origin the
  // create was written and its read-back failed, a `PartialCreateError`). Refused before any request.
  const hostMismatch = originHostMismatch(platform, input.vaultId);
  if (hostMismatch !== null) throw new CreateRefusedError("origin-not-vault-host", hostMismatch);
  if (!isAbsoluteIri(input.holder))
    throw new CreateRefusedError("no-holder", "name the holder as an IRI: it is written as the record's stater and is never guessed");
  if (typeof input.agent !== "string" || input.agent.trim() === "")
    throw new CreateRefusedError("no-agent", "name the agent the writes are made as");
  // A field-set reading that is not whole is "not known yet", ⛔ never "unknown kind" or "field not
  // offered": the sets are then a floor.
  if (!reading.fieldSets.complete)
    throw new VocabularyUnavailableError(
      `the stakeholder field sets are not known yet (${reading.fieldSets.incompleteAt.join("; ") || "reading not whole"}), so a record cannot be checked before it is written`,
    );
  const set = reading.fieldSets.byKind[input.kind];
  if (!set) throw new CreateRefusedError("unknown-kind", `${JSON.stringify(input.kind)} is not a stakeholder kind in the vocabulary reading`);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name === "") throw new CreateRefusedError("no-name", "a record needs a name");

  const namePredicate = reading.fieldSets.kinds.predicates.name;
  if (namePredicate.writeKey === null)
    throw new CreateRefusedError("field-not-writable", namePredicate.writeKeyProblem ?? "the name predicate names no spelling to write");
  // A kind that does not offer a name is not a party record this create can write (the
  // membership relations offer none: they are written as relation nodes, by the step that
  // writes roles).
  if (!set.fields.some((f) => f.readKeys.includes(namePredicate.writeKey!)))
    throw new CreateRefusedError("kind-offers-no-name", `${set.name} does not offer a name on the master, so it is not a record this create writes`);
  if (reading.statedBy.writeKey === null)
    throw new CreateRefusedError("field-not-writable", reading.statedBy.writeKeyProblem ?? "the stater predicate names no spelling to write");

  const statedByKey = reading.statedBy.writeKey;
  const facts: Record<string, unknown> = { [namePredicate.writeKey]: name };
  /** Records a field holds, to be written before the party record that points at them. */
  const held: { key: string; writeKey: string; type: string; facts: Record<string, unknown> }[] = [];
  /** References to check against the named vault before anything is written. */
  const pending: { key: string; writeKey: string; many: boolean; targets: string[] }[] = [];
  for (const [key, value] of Object.entries(input.fields ?? {})) {
    const field = fieldFor(set.fields, set.name, key);
    if (field.writeKey === null)
      throw new CreateRefusedError("field-not-writable", field.writeKeyProblem ?? `${field.term} names no spelling to write`);
    if (field.writeKey in facts || held.some((h) => h.writeKey === field.writeKey) || pending.some((p) => p.writeKey === field.writeKey))
      throw new CreateRefusedError("field-ambiguous", `${JSON.stringify(key)} is given twice (it is written as ${field.writeKey})`);
    const checked = (field.encoding ?? "").startsWith("reference") && reading.references ? referenceFieldFor(reading.references, field.writeKey) : null;
    if (checked) {
      pending.push({ key, writeKey: field.writeKey, many: field.many, targets: referenceTargets(field.many, value, key) });
    } else if (field.record) {
      for (const entry of recordEntries(field.record, value, key)) {
        held.push({ key, writeKey: field.writeKey, type: field.record.typeName!, facts: { ...entry, [statedByKey]: { "@id": input.holder } } });
      }
    } else {
      facts[field.writeKey] = encode(field, value, key);
    }
  }
  // The line after this one sets the stater from `holder` whatever `fields` held, so the stored
  // stater is the holder either way. This guard turns that silent overwrite into a refusal: a
  // caller who passed a stater as a field is told it was not used.
  if (statedByKey in facts)
    throw new CreateRefusedError("field-ambiguous", "the stater is set from `holder`, not from `fields`");
  facts[statedByKey] = { "@id": input.holder };

  // Each reference is checked against the named vault before the first write. A refusal or a
  // "not known yet" throws here, and nothing has been sent but reads. One write call for the whole
  // create: every target of every reference field shares its live reads of the master.
  const call = openWriteCall(picker);
  for (const p of pending) {
    const checkedRefs: Ref[] = [];
    for (const target of p.targets) {
      const ok = await checkReference(picker, { vaultId: input.vaultId, field: p.writeKey, carrierType: set.name, carrierFacts: facts, target }, call);
      checkedRefs.push(ok.value);
    }
    // One entry as a single reference, several as a list: the shape `a:employment` is stored in.
    facts[p.writeKey] = checkedRefs.length === 1 ? checkedRefs[0]! : checkedRefs;
  }

  // 2 · The records a field holds, then the party record that points at them: all into the
  //     named vault. Once anything is written, a failure says what exists.
  const written: string[] = [];
  const partial = (message: string, record: string | null, cause: unknown) =>
    new PartialCreateError(message, { record, written: [...written], vaultId: input.vaultId, cause });
  const mintInto = async (type: string, body: Record<string, unknown>, what: string): Promise<string> => {
    let minted: Minted;
    try {
      minted = await mint(platform, input.vaultId, type, body, input.agent);
    } catch (cause) {
      if (cause instanceof UnreadNewRecordError) {
        written.push(cause.resource);
        throw partial(`${what} was created at ${cause.resource} and could not be read back`, what === "the record" ? cause.resource : null, cause.cause);
      }
      // The create itself was refused: this call wrote nothing. Earlier ones may have.
      if (written.length > 0) throw partial(`${what} could not be created after ${written.length} record(s) a field holds were written`, null, cause);
      throw cause;
    }
    written.push(minted.record);
    return minted.record;
  };

  const references = new Map<string, Ref[]>();
  for (const h of held) {
    const id = await mintInto(h.type, h.facts, `the ${h.key} record`);
    references.set(h.writeKey, [...(references.get(h.writeKey) ?? []), { "@id": id }]);
  }
  // One entry is written as a single reference, several as a list (the shape the shipped
  // writer of this field stores).
  for (const [writeKey, refs] of references) facts[writeKey] = refs.length === 1 ? refs[0]! : refs;

  const record = await mintInto(`t:${set.name}`, facts, "the record");

  // 3 · Its tag: the platform's. Read the master it made; when it says there is none, ask it to make one once and read again.
  let made: { tag: string | null; tagHandle: string | null };
  try {
    made = await masterOfNewRecord(platform, record, input.agent);
  } catch (cause) {
    if (cause instanceof NoTagRoutesError) {
      // The record exists. The error stays a PlatformError (the sentence is the platform's lack), and says what was written.
      cause.created = { record, written: [...written], vaultId: input.vaultId };
      throw cause;
    }
    throw partial(`${record} was created and its tag could not be read or made`, record, cause);
  }
  return { created: true, record, vaultId: input.vaultId, tag: made.tag, tagHandle: made.tagHandle, held: written.slice(0, -1) };
}

/**
 * The master tag of a record the platform has just created. Reads it; on `none` asks the platform to make one ONCE (`ensure`) and reads again.
 * A platform without the master route is asked to `ensure`; without that route too it is a `NoTagRoutesError`. An anomaly, a hidden handle or an unreadable
 * answer is no tag (`null`), ⛔ never a guess.
 */
async function masterOfNewRecord(platform: PlatformClient, record: string, agent: string): Promise<{ tag: string | null; tagHandle: string | null }> {
  let read;
  try {
    read = await readMasterTag(platform, record);
  } catch (err) {
    if (!(err instanceof NoTagRoutesError)) throw err;
    // Neither route is on this platform when ensure is missing too: that rethrows as the hard error.
    const ensured = await ensureMasterTag(platform, record, agent);
    return { tag: ensured.tagString, tagHandle: ensured.tagHandle };
  }
  if (read.status === "master") return { tag: read.tag, tagHandle: read.tagHandle };
  if (read.status === "unknown" && read.reason === "none") {
    const ensured = await ensureMasterTag(platform, record, agent);
    const again = await readMasterTag(platform, record);
    return again.status === "master" ? { tag: again.tag, tagHandle: again.tagHandle } : { tag: ensured.tagString, tagHandle: ensured.tagHandle };
  }
  return { tag: null, tagHandle: null };
}

/** The targets a reference field was given: `{ "@id": … }` or an IRI string, one or (for a field
 *  whose term declares `multi`) a non-empty list. The values are checked later, not here. */
function referenceTargets(many: boolean, value: FieldValue, key: string): string[] {
  const list = Array.isArray(value) ? value : [value];
  if (list.length === 0) throw new CreateRefusedError("field-value", `${key} was given an empty list`);
  if (Array.isArray(value) && !many) throw new CreateRefusedError("field-value", `${key} holds one value (its term does not declare it multi), and a list was given`);
  return list.map((v) => {
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && !isRecordEntry(v) && typeof (v as Ref)["@id"] === "string") return (v as Ref)["@id"];
    throw new CreateRefusedError("field-value", `${key} takes a reference: { "@id": <the holder's record> }`);
  });
}

/** The entries of a field that holds a record of its own, each shaped as that record's facts. */
function recordEntries(shape: FieldRecord, value: FieldValue, key: string): Record<string, unknown>[] {
  if (shape.typeName === null)
    throw new CreateRefusedError("field-not-writable", `${key} holds a record of type ${shape.type}, whose term publishes no type name to write`);
  const entries = Array.isArray(value) ? value : [value];
  if (entries.length === 0) throw new CreateRefusedError("field-value", `${key} was given no entry`);
  if (entries.length > 1 && !shape.many)
    throw new CreateRefusedError("field-value", `${key} holds one record (its term does not declare it multi), and ${entries.length} were given`);
  return entries.map((entry) => {
    // Its value is a record made with the entry, ⛔ never an existing record picked from
    // elsewhere (the served `a/fieldRecordType`).
    if (!isRecordEntry(entry))
      throw new CreateRefusedError("field-value", `${key} holds a record of its own: give its facts as { record: { … } }, not a value or a reference`);
    const facts: Record<string, unknown> = {};
    for (const [subKey, subValue] of Object.entries(entry.record)) {
      const sub = fieldFor(shape.fields, `${key}'s record`, subKey);
      if (sub.writeKey === null)
        throw new CreateRefusedError("field-not-writable", sub.writeKeyProblem ?? `${sub.term} names no spelling to write`);
      if (sub.writeKey in facts)
        throw new CreateRefusedError("field-ambiguous", `${JSON.stringify(subKey)} is given twice in ${key}'s record (it is written as ${sub.writeKey})`);
      facts[sub.writeKey] = encode(sub, subValue, `${key}.${subKey}`);
    }
    if (Object.keys(facts).length === 0) throw new CreateRefusedError("field-value", `${key} was given a record with no facts`);
    return facts;
  });
}

interface Minted {
  record: string;
}

/** The create answered, and the new record could not be read back to learn its own IRI. */
class UnreadNewRecordError extends Error {
  readonly resource: string;
  readonly cause: unknown;
  constructor(resource: string, cause: unknown) {
    super(`a record was created at ${resource} and could not be read back`);
    this.name = "UnreadNewRecordError";
    this.resource = resource;
    this.cause = cause;
  }
}

/** Create one record in the named vault and read its own IRI back. Throws `PlatformError` when
 *  the create was refused (nothing written), `UnreadNewRecordError` when it was not. */
async function mint(platform: PlatformClient, vaultId: string, type: string, facts: Record<string, unknown>, agent: string): Promise<Minted> {
  const createUrl = routeUrl(platform, `lws/vault/${vaultSegment(vaultId)}/c`);
  const made = expectStatus(await request(platform, "POST", createUrl, { type, facts, agent }), "POST", [201]);
  const resource = made.headers.get("location") ?? (typeof made.json?.["@id"] === "string" ? (made.json["@id"] as string) : null);
  if (!resource) throw new PlatformError(`POST ${createUrl} named no resource`, made.status, createUrl, made.text);
  // The create answers with the resource's address. The record's identity is what that
  // resource says it is: read it, ⛔ never work one address out of the other.
  try {
    const opened = expectStatus(await request(platform, "GET", locate(platform, resource)), "GET", [200]);
    const id = opened.json?.["@id"];
    if (typeof id !== "string") throw new PlatformError(`GET ${opened.url} served no @id`, 200, opened.url, opened.text);
    return { record: id };
  } catch (cause) {
    throw new UnreadNewRecordError(resource, cause);
  }
}

/**
 * Pick the record a tag names in the vault, or create a new one when the tag names none (the new record gets the platform's own tag; the typed one is only
 * ever looked up). With no tag given there is nothing to pick by, and this creates: two people may share a name,
 * so a name alone is never treated as the same party.
 */
export async function pickOrCreate(picker: Picker, input: PickOrCreateInput): Promise<PickResult | CreateResult> {
  if (input.tag !== undefined) {
    requireVault(input.vaultId);
    const rule = picker.reading.tagWriteRule;
    // The rule speaks first when this string cannot be a stored tag (the grammar refuses it too).
    // A string the grammar accepts is looked up even when a new write would refuse it: a stored
    // "Ann Lee" is still a pick. The create path then checks the rule again.
    if (rule && typeof input.tag === "string") {
      const verdict = checkNewTagString(input.tag, rule);
      if (!verdict.ok) {
        let grammarRefused = false;
        try {
          assertTagString(input.tag, picker.reading.grammar);
        } catch (err) {
          if (!(err instanceof TagRefusedError)) throw err;
          grammarRefused = true;
        }
        if (grammarRefused) throw new CreateRefusedError("tag-refused", tagRefusalSentence(verdict.reason, rule));
      }
    }
    let tag: string;
    try {
      tag = assertTagString(input.tag, picker.reading.grammar);
    } catch (err) {
      if (err instanceof TagRefusedError) throw new CreateRefusedError("tag-refused", err.message);
      throw err;
    }
    // Only a stakeholder record the tag names is picked. A tag that names something else, or nothing, picks nothing: the create then makes a new record with the
    // tag the PLATFORM gives it (this module registers no tag, so the typed one is not claimed and cannot collide).
    const found = await lookUpStakeholderByTag(picker, input.vaultId, tag);
    if (found.status === "stakeholder") return found.pick;
  }
  const { tag: _lookedUp, ...toCreate } = input;
  void _lookedUp;
  return createRecord(picker, toCreate);
}
