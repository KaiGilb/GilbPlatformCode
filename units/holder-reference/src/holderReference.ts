// Writing a reference only to the holder's own record, after a check made live on the ontology master.
//
// THE RULE: every reference this module writes to a record points at a record IN THE CARRIER'S OWN VAULT, found through that
// vault's typed list.
//   Never into another vault, including another vault the same holder holds.
//   Never a party's identity anchor, a principal, or a self card from another vault.
//   Never anything the check did not find.
// A target the check cannot place is refused and NOTHING is sent. When a live set cannot be read, or reads `complete: false`, the
// answer is "not known yet" (`ReferenceUnknownError`). It is never treated as "admits nothing", and never answered from a stored copy.
//
// WRITE TIME vs DISPLAY:
//   - The WRITE-TIME check (`checkReference`, and through it `addReference` and the create's reference fields; `writeRoleRecord`)
//     admits or refuses ONLY on what it READS LIVE FROM THE MASTER (`picker.master`) WITHIN THAT WRITE CALL: the four field terms
//     (the one that spells the key gives the rule, spellings and cardinality; two spell it: refused `field-ambiguous`; any of the
//     four fails to answer: "not known yet"), the carrier (whether its type is a stakeholder kind and whether a declaration of the
//     field names it or a type above it), the role relations and their reference ends, the kinds of the one role the reference
//     needs, the types under `t/ContactPoint`, and every predicate spelling those reads use. Nothing from a stored or kept set
//     admits or refuses; the cached readers are not asked and nothing is read from or written to the store. The page's reading is
//     used for one thing only: extra type names for the vault's typed list read, so a refusal can name the target's type. Within
//     ONE write call the live reads are shared (`WriteCall`); the next call reads again. Master unreachable, no master on the
//     picker, or a live listing not complete: `ReferenceUnknownError`, "not known yet", nothing sent.
//   - DISPLAY reads (`readReferenceVocabulary`, `readPickerVocabulary`) use the cached readers (`stakeholderKindReader` with a
//     role, `typeTreeReader`). What they offer is a choice; the write-time check decides.
//
// WHAT EACH REFERENCE MAY POINT AT. Every type set is READ from the master: "kinds of R" is R's `a:playableBy` and every type under
// those by is-a. No type list is written here. The package names only TERM ADDRESSES:
//   - a ROLE RECORD (`role:source` the player, `role:target` the group). The relation is chosen by the group's EXACT type: the
//     role relation whose reference end (`a:endpoint`) is that type. The player's type must be among the kinds of that relation.
//   - `a:memberOf` (rule `membership`): the plain edge is admitted exactly where the role record would be.
//   - `a:heldParty` (rule `held-party`): a record of one of the kinds of `t/PartyMemberOf`, or a `t/PartyMemberOf` role record.
//   - `a:actsOnBehalfOf` (rule `party`): a record of one of the kinds of `t/PartyMemberOf`. Not a role record.
//   - `a:preferredChannel` (rule `contact-term`): NOT a record. The target is an attribute term on the master, under
//     `t/ContactPoint` by is-a, whose `a:fieldOf` names the carrier's type, and under which the carrier holds a value.
// Every other reference field stays refused at create.
//
// WHAT IS LITERAL HERE: term addresses on the master, which ruled check each of the four predicates takes (a predicate not paired
// is refused), the platform's relation route contract (`relationUriInVault`, the body keys, the role keys `role:source` and
// `role:target`), and the slot keys inside an `a:endpoint` value (`a:role`, `a:endpointType`, role tokens `subject` and `reference`).
import {
  expectStatus,
  isAbsoluteIri,
  locate,
  originHostMismatch,
  PlatformError,
  request,
  routeUrl,
  RecordListError,
  walkRecordPages,
  type PlatformClient,
  type RecordRow,
  type RecordWalk,
} from "@kaigilb/gilbplatformcode-record-sync";
import {
  bareForm,
  cardinalityOf,
  nameOfIri,
  refsUnder,
  spellingOfTermDoc,
  typeAttributeOf,
  MasterTimeoutError,
  VocabularyUnavailableError,
  MASTER_READ_CAP_MS,
  MASTER_REQUEST_TIMEOUT_MS,
  checkedBound,
  withDeadline,
  type ChildrenPage,
  type PredicateSpelling,
  type TermDoc,
  type TermFetch,
  type VocabularySource,
} from "@kaigilb/gilbplatformcode-vocabulary-source";
import { PlacementUnknownError, rowPlacement, type RowPlacement } from "./rowVault";
import type { StakeholderFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import {
  expandDownIsA,
  STAKEHOLDER_ROLE_TERM,
  PREDICATE_TERMS,
  createStakeholderKindReader,
  createTypeTreeReader,
  readTypeTree,
  stakeholderKindReader,
  typeTreeReader,
  type StakeholderKindReader,
  type StakeholderKindSet,
  type TypeTreeReader,
  type VocabularyStore,
} from "@kaigilb/gilbplatformcode-stakeholder-kinds";

/** The party role: the kinds of this relation are the party kinds. */
export const PARTY_ROLE_TERM = "t/PartyMemberOf";
/** The root of the contact-point types a preferred channel may name. */
export const CONTACT_POINT_TERM = "t/ContactPoint";
/** The predicate that declares a relation's two ends. */
export const ENDPOINT_TERM = "a/endpoint";

/** Which ruled check each reference predicate takes, by the predicate's term address. */
export type ReferenceRule = "membership" | "held-party" | "party" | "contact-term";
export const REFERENCE_RULES: Readonly<Record<string, ReferenceRule>> = {
  "a/memberOf": "membership",
  "a/heldParty": "held-party",
  "a/actsOnBehalfOf": "party",
  "a/preferredChannel": "contact-term",
};

/** The platform's relation route contract (GilbPlatform `src/relation-vocab.ts`). */
const ROLE_SOURCE = "role:source";
const ROLE_TARGET = "role:target";

// ── The reading ──────────────────────────────────────────────────────────────────────────

/** A role relation, as its own term declares it. */
export interface RoleRelation {
  /** The relation's term IRI, as served. */
  term: string;
  /** Its bare name. */
  name: string;
  /** The type string a role record of it is written with (`a:typeAttribute`), or `null` when the
   *  term publishes none: a role record of it is then refused, ⛔ never written with a guess. */
  writeType: string | null;
  /** The reference end's type (the group), as served, and its bare name. */
  groupType: string;
  groupName: string;
  /** The bare names of the relation's kinds: who may be the player. */
  playerNames: string[];
  complete: boolean;
}

export interface ReferenceField {
  /** The predicate's term IRI on the master. */
  term: string;
  rule: ReferenceRule;
  spelling: PredicateSpelling;
  /** True when the predicate's term declares cardinality `multi`. */
  many: boolean;
}

export interface ReferenceReading {
  relations: RoleRelation[];
  /** The bare names of the kinds of `t/PartyMemberOf`, and the name of that relation's own type. */
  party: { names: string[]; roleRecordName: string; complete: boolean };
  /** Every type under `t/ContactPoint` by is-a, as served. */
  contactTypes: { terms: string[]; complete: boolean };
  fields: ReferenceField[];
  /** False when any set above was not read whole. Every check then answers "not known yet". */
  complete: boolean;
  incompleteAt: string[];
}

const pathOf = (iri: string): string => {
  const at = iri.indexOf("/base/");
  if (at < 0) throw new VocabularyUnavailableError(`${iri} is not a term address under /base/`);
  return iri.slice(at + "/base/".length);
};

/** The slots of an `a:endpoint` value: an array of objects, or that array as JSON text. */
function endpointSlots(doc: TermDoc, readKeys: readonly string[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const k of readKeys) {
    let v = doc[k];
    if (typeof v === "string") {
      try {
        v = JSON.parse(v);
      } catch {
        continue;
      }
    }
    for (const slot of Array.isArray(v) ? v : v ? [v] : []) if (slot && typeof slot === "object") out.push(slot as Record<string, unknown>);
  }
  return out;
}

const slotValue = (slot: Record<string, unknown>, key: string): unknown => slot[`a:${key}`] ?? slot[key];

/** The type of the relation's reference end, or null when it declares none. */
function referenceEnd(doc: TermDoc, endpointKeys: readonly string[]): string | null {
  for (const slot of endpointSlots(doc, endpointKeys)) {
    if (slotValue(slot, "role") !== "reference") continue;
    const ty = slotValue(slot, "endpointType");
    const iri = refsUnder({ "@context": doc["@context"], x: ty } as TermDoc, ["x"])[0];
    if (iri) return iri;
  }
  return null;
}

/** Where the reference reading takes its cached sets from. */
export interface ReferenceReadingOptions {
  /** The kind reader of a role (a path under `/base/`, e.g. `t/PartyMemberOf`). A page passes its shared readers. */
  kindReaderFor?: (roleTerm: string) => StakeholderKindReader;
  /** The type-tree reader of a root type (`t/ContactPoint`). */
  typeTreeReaderFor?: (rootTerm: string) => TypeTreeReader;
  /** The master's origin: the page's shared readers for it (`stakeholderKindReader`, `typeTreeReader`) fill whichever reader
   *  above is not given. */
  vedaOrigin?: string;
  /** The fetch, the store and the bounds of a shared reader first made here (see `stakeholderKindReader`). */
  fetchImpl?: TermFetch;
  store?: VocabularyStore | null;
  timeoutMs?: number;
  readCapMs?: number;
}

/** The readers one reading uses. With neither readers nor an origin: memory-only readers over `source` for this call alone, so an
 *  agent or a command-line run reads through the same code and keeps nothing (⛔ no background check either). */
function readersOf(source: VocabularySource, opts: ReferenceReadingOptions) {
  const local = { source, origin: source.termIri(""), store: null, defer: () => {} };
  const shared = opts.vedaOrigin
    ? {
        vedaOrigin: opts.vedaOrigin,
        ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
        ...(opts.store !== undefined ? { store: opts.store } : {}),
        ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
        ...(opts.readCapMs !== undefined ? { readCapMs: opts.readCapMs } : {}),
      }
    : null;
  const kinds = new Map<string, StakeholderKindReader>();
  const kindReaderFor =
    opts.kindReaderFor ??
    (shared
      ? (roleTerm: string) => stakeholderKindReader({ ...shared, roleTerm })
      : (roleTerm: string) => {
          let r = kinds.get(roleTerm);
          if (!r) kinds.set(roleTerm, (r = createStakeholderKindReader({ ...local, roleTerm })));
          return r;
        });
  const typeTreeReaderFor =
    opts.typeTreeReaderFor ??
    (shared ? (rootTerm: string) => typeTreeReader({ ...shared, rootTerm }) : (rootTerm: string) => createTypeTreeReader({ ...local, rootTerm }));
  return { kindReaderFor, typeTreeReaderFor };
}

/**
 * Read, from the master, what a page shows and offers for references: the role relations among
 * the stakeholder kinds and their kinds, the party kinds, the contact-point types, and the
 * spelling of each reference predicate this module writes. DISPLAY only: the
 * write-time check reads its own sets live and takes nothing from this reading that admits or
 * refuses.
 *
 * The kinds of each role and the contact types come from
 * the cached readers (`opts`), so a warm page sends no children listing. The players' own terms are
 * read in ONE named read, and everything that does not wait on another read is read at the same
 * time: the relations' kinds start together once the players' terms are in. Live on 2026-10-19 the
 * old path was 78 requests in 37 rounds.
 *
 * @param source the master
 * @param fieldSets the field sets (their kinds' players and predicates)
 * @param opts the cached readers, or the master's origin for the page's shared ones
 * @returns the reading
 * @throws VocabularyUnavailableError when a term, a role's kinds or a listing cannot be read
 * @throws RangeError when `opts.timeoutMs` or `opts.readCapMs` is given and is not a finite number above 0, at most 2,147,483,647
 */
export async function readReferenceVocabulary(
  source: VocabularySource,
  fieldSets: StakeholderFieldSets,
  opts: ReferenceReadingOptions = {},
): Promise<ReferenceReading> {
  // A bad bound is refused before anything is read, even when the readers given would not use it.
  checkedBound("timeoutMs", opts.timeoutMs, MASTER_REQUEST_TIMEOUT_MS);
  checkedBound("readCapMs", opts.readCapMs, MASTER_READ_CAP_MS);
  const predicates = fieldSets.kinds.predicates;
  const members = fieldSets.kinds.members;
  const readers = readersOf(source, opts);
  const kindsOf = (roleTerm: string): Promise<StakeholderKindSet> => readers.kindReaderFor(roleTerm).get();
  const endpointIri = source.termIri(ENDPOINT_TERM);
  const partyRoleIri = source.termIri(PARTY_ROLE_TERM);

  // Round 1, all at once: the endpoint term, the players' terms (one named read), the party kinds, the contact types and the four
  // reference predicates.
  const [endpointDoc, memberDocs, partyKinds, contact, fields] = await Promise.all([
    source.term(endpointIri),
    Promise.all(source.terms ? source.terms(members) : members.map((m) => source.term(m))),
    kindsOf(PARTY_ROLE_TERM),
    readers.typeTreeReaderFor(CONTACT_POINT_TERM).get(),
    Promise.all(
      Object.entries(REFERENCE_RULES).map(async ([path, rule]): Promise<ReferenceField> => {
        const iri = source.termIri(path);
        const doc = await source.term(iri);
        return { term: iri, rule, spelling: spellingOfTermDoc(doc, iri), many: cardinalityOf(doc) === "multi" };
      }),
    ),
  ]);
  const endpoint = spellingOfTermDoc(endpointDoc, endpointIri);

  // The role relations: stakeholder kinds whose own term declares players and a reference end. Their kinds, at the same time.
  const found: { member: string; doc: TermDoc; group: string }[] = [];
  members.forEach((member, i) => {
    const doc = memberDocs[i]!;
    if (refsUnder(doc, predicates.playableBy.readKeys).length === 0) return;
    const group = referenceEnd(doc, endpoint.readKeys);
    if (group !== null) found.push({ member, doc, group });
  });
  const relationKinds = await Promise.all(found.map((f) => kindsOf(pathOf(f.member))));

  const incompleteAt: string[] = [];
  const relations: RoleRelation[] = found.map(({ member, doc, group }, i) => {
    const kinds = relationKinds[i]!;
    if (!kinds.complete) incompleteAt.push(...kinds.incompleteAt.map((at) => `kinds of ${member}: ${at}`));
    return {
      term: member,
      name: nameOfIri(member),
      writeType: typeAttributeOf(doc),
      groupType: group,
      groupName: nameOfIri(group),
      playerNames: kinds.types.map((t) => t.name),
      complete: kinds.complete,
    };
  });
  if (!partyKinds.complete) incompleteAt.push(...partyKinds.incompleteAt.map((at) => `kinds of ${PARTY_ROLE_TERM}: ${at}`));
  incompleteAt.push(...contact.incompleteAt.map((at) => `children of ${at}`));

  return {
    relations,
    party: { names: partyKinds.types.map((t) => t.name), roleRecordName: nameOfIri(partyRoleIri), complete: partyKinds.complete },
    contactTypes: { terms: [...contact.terms], complete: contact.complete },
    fields,
    complete: incompleteAt.length === 0,
    incompleteAt,
  };
}

// ── Refusals ─────────────────────────────────────────────────────────────────────────────

export type ReferenceRefusal =
  | "no-vault"
  | "no-agent"
  | "not-a-reference-field"
  | "not-an-iri"
  | "not-in-vault"
  | "type-not-admitted"
  | "carrier-type-not-admitted"
  | "not-a-contact-term"
  | "not-a-field-of-carrier"
  | "carrier-holds-no-value"
  | "no-write-type"
  | "relation-ambiguous"
  | "field-ambiguous"
  | "carrier-not-addressable"
  | "origin-not-vault-host"
  | "held-party-not-written"
  | "in-more-than-one-vault";

/** Refused before anything was sent. */
export class ReferenceRefusedError extends Error {
  readonly reason: ReferenceRefusal;
  constructor(reason: ReferenceRefusal, message: string) {
    super(message);
    this.name = "ReferenceRefusedError";
    this.reason = reason;
  }
}

/** A set the check needs could not be read whole: the answer is "not known yet". Nothing sent.
 *  ⛔ Never a refusal of the target, and ⛔ never "admits nothing". */
export class ReferenceUnknownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceUnknownError";
  }
}

/** A role record was written, and reading it back failed. It names what exists. ⛔ Nothing is deleted. */
export class PartialReferenceError extends Error {
  readonly written: string;
  readonly cause: unknown;
  constructor(message: string, written: string, cause: unknown) {
    super(message);
    this.name = "PartialReferenceError";
    this.written = written;
    this.cause = cause;
  }
}

// ── Reading a served document ────────────────────────────────────────────────────────────

/** Remote contexts already read, by their URL. A context is the platform's own published prefix
 *  map; it does not change within a run. */
const remoteContexts = new Map<string, Record<string, unknown>>();

/**
 * The document with its prefix map in hand. The platform serves some documents with `@context`
 * as a URL (GET /base/r/<id> answers `"@context": "https://<host>/base/context.jsonld"` and its
 * references as CURIEs, `base:e/<id>`: read on the scratch rig, 2026-10-02). A CURIE is expanded
 * by the context the document names, read from the platform, ⛔ never by a prefix assumed here.
 * When the context cannot be read the document is returned as it is, and a CURIE in it stays
 * unreadable: the caller then fails to match, which is a refusal or an error, never a pass.
 */
async function withOwnContext(platform: PlatformClient, doc: TermDoc): Promise<TermDoc> {
  const ctx = doc["@context"];
  const urls = (Array.isArray(ctx) ? ctx : [ctx]).filter((c): c is string => typeof c === "string");
  if (urls.length === 0) return doc;
  const merged: Record<string, unknown> = {};
  for (const c of Array.isArray(ctx) ? ctx : [ctx]) if (c && typeof c === "object") Object.assign(merged, c as Record<string, unknown>);
  for (const url of urls) {
    let read = remoteContexts.get(url);
    if (!read) {
      let answer;
      try {
        answer = await request(platform, "GET", locate(platform, url));
      } catch {
        continue;
      }
      const inner = answer.status === 200 ? answer.json?.["@context"] : undefined;
      if (!inner || typeof inner !== "object") continue;
      read = {};
      for (const part of Array.isArray(inner) ? inner : [inner]) if (part && typeof part === "object") Object.assign(read, part as Record<string, unknown>);
      remoteContexts.set(url, read);
    }
    Object.assign(merged, read);
  }
  return { ...doc, "@context": merged };
}

// ── The vault check ──────────────────────────────────────────────────────────────────────

export interface ReferencePicker {
  platform: PlatformClient;
  /** The page's reading. For DISPLAY only: the write-time check takes nothing from it that admits or refuses. */
  reading: { fieldSets: StakeholderFieldSets; references?: ReferenceReading };
  /** The master. Every write-time rule reads its sets from it live, in the write call. With none, every
   *  write-time answer is "not known yet". */
  master?: VocabularySource;
  /** The cap on one write call's live master reads, in ms. Default `MASTER_READ_CAP_MS`. Each request is
   *  also bounded by the master source itself (`masterSource` `timeoutMs`). A finite number above 0, at most 2,147,483,647: anything
   *  else makes every write call over this picker throw a RangeError before it reads or sends anything. */
  masterReadCapMs?: number;
}

// ── The write-time sets, read live ──────────────────────────────────
//
// EVERYTHING the write-time check uses to admit a write is read live from the master within that
// write call. Within ONE call the live reads are shared: a 412 retry inside one `addReference`, and the K
// targets of one create, read each set once. The next call reads again.

/** The address a term is fetched at, as the memo's key: a term asked by its identity (`https://ontology.example.test/base/t/X`) and by
 *  the master's own address for it (`termIri`) is the same read. */
const readKeyOf = (iri: string): string => {
  try {
    const u = new URL(iri);
    return `${u.pathname}${u.search}`;
  } catch {
    return iri;
  }
};

/** A promise that never reaches the runtime as unhandled: whoever needs it awaits it and sees the rejection. */
function kept<T>(p: Promise<T>): Promise<T> {
  p.catch(() => {});
  return p;
}

function attempt<T>(read: () => Promise<T>): Promise<T> {
  try {
    return read();
  } catch (cause) {
    return Promise.reject(cause);
  }
}

/**
 * One write call's reads of the master: each term, listing and set read once in the call, ⛔ never kept past it.
 *
 * The call's master reads are capped together. The cap (`capMs`) starts at the call's first master read, and
 * every read of the call ends by it, as `MasterTimeoutError`, which the write-time check answers as "not known yet"
 * (`ReferenceUnknownError`) with nothing sent. At the cap the call's signal aborts what is in flight (each read is handed it;
 * `masterSource` passes it to its fetch), and a read asked for after it is refused at once, ⛔ never sent. That holds also when
 * the cap's time has passed but its timer has not yet run (a thread busy past the cap): the read is refused
 * `MasterTimeoutError` before any timer is set, ⛔ never a RangeError, since the caller's bound was valid. Each read has its own
 * timer, cleared when it ends, so a finished call leaves no timer behind.
 */
class LiveMaster {
  readonly source: VocabularySource;
  private readonly docs = new Map<string, Promise<TermDoc>>();
  private readonly kids = new Map<string, Promise<ChildrenPage>>();
  private readonly sets = new Map<string, Promise<unknown>>();
  readonly master: VocabularySource;
  private readonly stop = new AbortController();
  private readonly capMs: number;
  private deadline: number | null = null;
  constructor(master: VocabularySource, capMs: number) {
    this.capMs = capMs;
    this.master = master;
    this.source = {
      termIri: (path) => master.termIri(path),
      term: (iri) => this.term(iri),
      terms: (iris) => this.terms(iris),
      children: (iri) => this.children(iri),
      carriersOf: (keys) => this.once(`carriers:${keys.join("|")}`, () => this.bounded(() => this.master.carriersOf(keys, this.stop.signal))),
    };
  }
  private ranOut(): MasterTimeoutError {
    return new MasterTimeoutError(`not known yet: the master did not finish this write call's reads in ${this.capMs} ms`, this.capMs);
  }
  /** Time left in the call's cap; the cap starts at the first master read. */
  private left(): number {
    if (this.deadline === null) this.deadline = Date.now() + this.capMs;
    return this.deadline - Date.now();
  }
  /** The cap has run out: stop every read of the call, and answer the error a read ends with. */
  private stopAll(): MasterTimeoutError {
    const err = this.ranOut();
    this.stop.abort(err);
    return err;
  }
  /** One master read, ended by the call's cap. With no time left, `run` is never called (nothing is sent). */
  private bounded<T>(run: () => Promise<T>): Promise<T> {
    const ms = this.left();
    // ⚠ Not `withDeadline` with 0 or less: that is a RangeError for a caller's bad bound, and this bound was valid.
    if (ms <= 0) return Promise.reject(this.stopAll());
    return withDeadline(() => run(), {
      ms,
      parents: [this.stop.signal],
      // The cap is the call's, not this read's: stop every read of the call.
      timeoutError: () => this.stopAll(),
      abortError: () => this.ranOut(),
    });
  }
  termIri(path: string): string {
    return this.master.termIri(path);
  }
  term(iri: string): Promise<TermDoc> {
    const key = readKeyOf(iri);
    let p = this.docs.get(key);
    if (!p) this.docs.set(key, (p = kept(this.bounded(() => this.master.term(iri, this.stop.signal)))));
    return p;
  }
  /** Several terms in one named read, where the master has one; a term already read in this call is not read again. */
  terms(iris: readonly string[]): Promise<TermDoc>[] {
    const missing: string[] = [];
    for (const iri of iris) if (!this.docs.has(readKeyOf(iri)) && !missing.some((m) => readKeyOf(m) === readKeyOf(iri))) missing.push(iri);
    if (missing.length > 0) {
      let read: Promise<TermDoc>[];
      if (!this.master.terms) read = missing.map((iri) => this.bounded(() => this.master.term(iri, this.stop.signal)));
      else if (this.left() <= 0) read = missing.map(() => this.bounded<TermDoc>(() => Promise.reject(this.ranOut())));
      else {
        let sent: Promise<TermDoc>[];
        try {
          sent = this.master.terms(missing, this.stop.signal);
        } catch (cause) {
          sent = missing.map(() => Promise.reject(cause));
        }
        // ⚠ The cap may run out while the named read is sent (an unproven risk): `bounded` then never awaits `p`, so
        // each is kept first, and its rejection never reaches the runtime as unhandled.
        read = sent.map((p) => (kept(p), this.bounded(() => p)));
      }
      missing.forEach((iri, i) => this.docs.set(readKeyOf(iri), kept(read[i]!)));
    }
    return iris.map((iri) => this.docs.get(readKeyOf(iri))!);
  }
  children(iri: string): Promise<ChildrenPage> {
    const key = readKeyOf(iri);
    let p = this.kids.get(key);
    if (!p) this.kids.set(key, (p = kept(this.bounded(() => this.master.children(iri, this.stop.signal)))));
    return p;
  }
  once<T>(key: string, read: () => Promise<T>): Promise<T> {
    let p = this.sets.get(key) as Promise<T> | undefined;
    if (!p) this.sets.set(key, (p = kept(attempt(read))));
    return p;
  }
}

/**
 * One write call: the live reads it shares. `addReference` and `createRecord` open one for the whole call;
 * `checkReference` and `writeRoleRecord` open their own when none is passed.
 */
export class WriteCall {
  /** @internal */
  readonly live: LiveMaster | null;
  /**
   * @param master the master the call reads live, or none ("not known yet" for every write-time answer)
   * @param opts `readCapMs`: the cap on the call's master reads (default `MASTER_READ_CAP_MS`)
   * @throws RangeError when `readCapMs` is given and is not a finite number above 0, at most 2,147,483,647, ⛔ never read as "no bound"
   */
  constructor(master: VocabularySource | undefined, opts: { readCapMs?: number } = {}) {
    const capMs = checkedBound("readCapMs", opts.readCapMs, MASTER_READ_CAP_MS);
    this.live = master ? new LiveMaster(master, capMs) : null;
  }
}

/** A write call over the picker's master, with the picker's cap.
 *  @throws RangeError when `picker.masterReadCapMs` is given and is not a finite number above 0, at most 2,147,483,647 */
export const openWriteCall = (picker: ReferencePicker): WriteCall =>
  new WriteCall(picker.master, { readCapMs: checkedBound("masterReadCapMs", picker.masterReadCapMs, MASTER_READ_CAP_MS) });

function liveMaster(call: WriteCall, what: string): LiveMaster {
  if (!call.live) throw new ReferenceUnknownError(`${what}: the master is not reachable from this picker, so what it admits cannot be read live`);
  return call.live;
}

/** A failed live read is "not known yet", ⛔ never a refusal and ⛔ never answered from a kept set. */
async function live<T>(what: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (cause) {
    if (cause instanceof ReferenceUnknownError || cause instanceof ReferenceRefusedError) throw cause;
    throw new ReferenceUnknownError(`${what}: the master could not be read live, so what it admits is not known: ${String(cause)}`);
  }
}

const is404 = (cause: unknown): boolean => cause instanceof VocabularyUnavailableError && / answered 404$/.test(cause.message);

/** A predicate's spellings, read live from its own term (⛔ never the kept `kindSet.spellings`). */
const liveSpelling = (lm: LiveMaster, path: string): Promise<PredicateSpelling> =>
  lm.once(`spelling:${path}`, async () => {
    const iri = lm.termIri(path);
    return spellingOfTermDoc(await lm.term(iri), iri);
  });

/** A role's players (its `a:playableBy`), read live. None: "not known yet". */
const livePlayers = (lm: LiveMaster, roleIri: string, what: string): Promise<string[]> =>
  live(what, () =>
    lm.once(`players:${readKeyOf(roleIri)}`, async () => {
      const [doc, playableBy] = await Promise.all([lm.term(roleIri), liveSpelling(lm, PREDICATE_TERMS.playableBy)]);
      const members = refsUnder(doc, playableBy.readKeys);
      if (members.length === 0) throw new ReferenceUnknownError(`${what}: ${roleIri} names no players on the master, so its kinds are not known`);
      return members;
    }),
  );

/**
 * The bare names of a role's kinds, READ LIVE: the role's own term (its `a:playableBy`, under the spelling `a/playableBy`
 * serves), then every type below its players by is-a. ⛔ No cached reader, ⛔ no store. A listing that is not complete is "not
 * known yet".
 */
const liveKindNames = (lm: LiveMaster, roleIri: string, what: string): Promise<string[]> =>
  live(what, () =>
    lm.once(`kinds:${readKeyOf(roleIri)}`, async () => {
      const { types, incompleteAt } = await expandDownIsA(lm.source, await livePlayers(lm, roleIri, what));
      if (incompleteAt.length > 0)
        throw new ReferenceUnknownError(`${what}: the kinds of ${roleIri} are not known yet (children of ${incompleteAt.join(", ")} not complete)`);
      return [...new Set(types.map((k) => k.name))];
    }),
  );

/** Every type under `t/ContactPoint` by is-a, READ LIVE. Incomplete: "not known yet". */
const liveContactTypes = (lm: LiveMaster, what: string): Promise<string[]> =>
  live(what, () =>
    lm.once("contact-types", async () => {
      const tree = await readTypeTree(lm.source, CONTACT_POINT_TERM);
      if (!tree.complete) throw new ReferenceUnknownError(`${what}: the types under ${CONTACT_POINT_TERM} are not known yet (children of ${tree.incompleteAt.join(", ")})`);
      return tree.terms;
    }),
  );

/** A role relation as the master serves it now. */
interface LiveRelation {
  term: string;
  name: string;
  writeType: string | null;
  groupName: string;
}

/**
 * The role relations, READ LIVE: the players of `t/Stakeholder` whose own term carries `a:playableBy` and an
 * `a:endpoint` with a reference slot, and each one's reference end. One named read of the players' terms, so a relation's term
 * is then in hand for its kinds.
 */
const liveRelations = (lm: LiveMaster, what: string): Promise<LiveRelation[]> =>
  live(what, () =>
    lm.once("relations", async () => {
      const [members, playableBy, endpoint] = await Promise.all([
        livePlayers(lm, lm.termIri(STAKEHOLDER_ROLE_TERM), what),
        liveSpelling(lm, PREDICATE_TERMS.playableBy),
        liveSpelling(lm, ENDPOINT_TERM),
      ]);
      const docs = await Promise.all(lm.terms(members));
      const out: LiveRelation[] = [];
      members.forEach((member, i) => {
        const doc = docs[i]!;
        if (refsUnder(doc, playableBy.readKeys).length === 0) return;
        const group = referenceEnd(doc, endpoint.readKeys);
        if (group !== null) out.push({ term: member, name: nameOfIri(member), writeType: typeAttributeOf(doc), groupName: nameOfIri(group) });
      });
      return out;
    }),
  );

/**
 * The types above `name` by is-a (`a:subTypeOf`, under the spelling `a/subTypeOf` serves), READ LIVE one level at a time, by bare
 * name: level 0 is the type itself (nothing read), level i+1 the parents of level i not seen before (one named read). A caller
 * stops at the first level that answers it, so a type that is its own answer costs no read. A term the master does not serve
 * (404) has no parents. `null`: the walk has ended. Past 64 levels: "not known yet".
 */
function liveLevel(lm: LiveMaster, name: string, depth: number, what: string): Promise<{ names: string[]; iris: string[] } | null> {
  if (depth === 0) return Promise.resolve({ names: [name], iris: [lm.termIri(`t/${name}`)] });
  return live(what, () =>
    lm.once(`up:${name}:${depth}`, async () => {
      if (depth > 64) throw new ReferenceUnknownError(`${what}: the is-a walk up from ${name} did not end within 64 levels`);
      const below = await liveLevel(lm, name, depth - 1, what);
      if (below === null) return null;
      const seen = new Set<string>();
      for (let d = 0; d < depth; d++) for (const n of (await liveLevel(lm, name, d, what))!.names) seen.add(n);
      const [subTypeOf, docs] = await Promise.all([
        liveSpelling(lm, PREDICATE_TERMS.subTypeOf),
        Promise.all(lm.terms(below.iris).map((p) => p.then((doc): TermDoc | null => doc, (cause) => (is404(cause) ? null : Promise.reject(cause))))),
      ]);
      const names: string[] = [];
      const iris: string[] = [];
      for (const doc of docs)
        for (const iri of doc ? refsUnder(doc, subTypeOf.readKeys) : []) {
          const n = nameOfIri(iri);
          if (seen.has(n) || names.includes(n)) continue;
          names.push(n);
          iris.push(iri);
        }
      return names.length === 0 ? null : { names, iris };
    }),
  );
}

/**
 * Is `name` a stakeholder kind on the master NOW? The stakeholder kinds are `t/Stakeholder`'s players and every
 * type below them in the master's children listings. Read live, and only along the type's own is-a line: the walk up stops at
 * the first level that holds a player; from those players the listings down, through the type's own line only, must list it.
 * (The children route walks `a:subTypeOf`, so no other line can reach it.) Not reached: the walk goes on up. A listing on the
 * line that is not complete, with the type never reached: "not known yet".
 */
const liveIsStakeholderKind = (lm: LiveMaster, name: string, what: string): Promise<boolean> =>
  live(what, () =>
    lm.once(`stakeholder:${name}`, async () => {
      const members = await livePlayers(lm, lm.termIri(STAKEHOLDER_ROLE_TERM), what);
      const line = new Set<string>();
      const notWhole: string[] = [];
      for (let depth = 0; ; depth++) {
        const level = await liveLevel(lm, name, depth, what);
        if (level === null) break;
        level.names.forEach((n) => line.add(n));
        if (depth === 0 && members.some((m) => nameOfIri(m) === name)) return true;
        let down = members.filter((m) => level.names.includes(nameOfIri(m)));
        const seen = new Set<string>();
        while (down.length > 0) {
          const fresh = down.filter((iri) => !seen.has(nameOfIri(iri)));
          fresh.forEach((iri) => seen.add(nameOfIri(iri)));
          const pages = await Promise.all(fresh.map((iri) => lm.children(iri)));
          const next: string[] = [];
          for (const [i, page] of pages.entries()) {
            if (!page.complete) notWhole.push(nameOfIri(fresh[i]!));
            for (const child of page.children) {
              const n = nameOfIri(child.term);
              if (n === name) return true;
              if (line.has(n)) next.push(child.term);
            }
          }
          down = next;
        }
      }
      if (notWhole.length > 0)
        throw new ReferenceUnknownError(`${what}: whether ${name} is a stakeholder kind is not known yet (children of ${notWhole.join(", ")} not complete)`);
      return false;
    }),
  );

/** Is one of `declared` the type `name` or a type above it, read up live only as far as the answer needs. */
async function liveOnLine(lm: LiveMaster, name: string, declared: ReadonlySet<string>, what: string): Promise<boolean> {
  for (let depth = 0; ; depth++) {
    const level = await liveLevel(lm, name, depth, what);
    if (level === null) return false;
    if (level.names.some((n) => declared.has(n))) return true;
  }
}

/** A field declaration, read live: an attribute whose term carries `a:fieldOf`. */
interface LiveDeclaration {
  term: string;
  spelling: PredicateSpelling;
  /** The bare names of the types its `a:fieldOf` names. */
  fieldOf: string[];
}

/** Every `a:fieldOf` declaration, READ LIVE through the master's carrier selector (one request), as the field sets read them. */
const liveDeclarations = (lm: LiveMaster, what: string): Promise<LiveDeclaration[]> =>
  live(what, () =>
    lm.once("declarations", async () => {
      const fieldOf = await liveSpelling(lm, PREDICATE_TERMS.fieldOf);
      const list = await lm.source.carriersOf(fieldOf.readKeys);
      if (!list.complete || list.incompleteAt.length > 0 || list.terms.length === 0)
        throw new ReferenceUnknownError(`${what}: the field declarations are not known yet (${list.incompleteAt.join("; ") || "no declaration read"})`);
      const out: LiveDeclaration[] = [];
      for (const doc of list.terms) {
        const term = doc["@id"];
        if (typeof term !== "string") continue;
        let spelling: PredicateSpelling;
        try {
          spelling = spellingOfTermDoc(doc, term);
        } catch {
          continue;
        }
        out.push({ term, spelling, fieldOf: refsUnder(doc, fieldOf.readKeys).map(nameOfIri) });
      }
      return out;
    }),
  );

/** Does the master offer a field spelled `readKeys` on `carrier` now: a declaration of it names the carrier or a type above it. */
async function liveOffers(lm: LiveMaster, carrier: string, readKeys: readonly string[], what: string): Promise<boolean> {
  const declarations = await liveDeclarations(lm, what);
  const declared = new Set(declarations.filter((d) => d.spelling.readKeys.some((k) => readKeys.includes(k))).flatMap((d) => d.fieldOf));
  return declared.size > 0 && liveOnLine(lm, carrier, declared, what);
}

/**
 * The reference field a caller's key names, READ LIVE from the four field terms: all four are read at once, once per write call, and the key is matched against what each one serves now (its address,
 * its served `@id`, its spellings). ⛔ The page's reading is not asked. Then:
 *   – any of the four could not be read: "not known yet", nothing sent, EVEN when another term names the key: the failed term
 *     might name it too, and a key two terms name has no settled rule (strict);
 *   – exactly one names the key: that term's rule, spellings and cardinality;
 *   – two or more name it: refused `field-ambiguous`, ⛔ never a pick by order;
 *   – none names it: `null` (not a reference field).
 */
async function liveField(lm: LiveMaster, key: string, what: string): Promise<{ field: ReferenceField; served: string } | null> {
  const paths = Object.keys(REFERENCE_RULES);
  const read = (path: string) =>
    live(what, () =>
      lm.once(`field:${path}`, async () => {
        const iri = lm.termIri(path);
        const doc = await lm.term(iri);
        const field: ReferenceField = { term: iri, rule: REFERENCE_RULES[path]!, spelling: spellingOfTermDoc(doc, iri), many: cardinalityOf(doc) === "multi" };
        return { field, served: typeof doc["@id"] === "string" ? doc["@id"] : iri };
      }),
    );
  const names = ({ field, served }: { field: ReferenceField; served: string }) =>
    key === field.term || key === served || field.spelling.writeKey === key || field.spelling.readKeys.includes(key);
  const settled = await Promise.allSettled(paths.map(read));
  const failed = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
  if (failed) throw failed.reason;
  const hits = settled.flatMap((s) => (s.status === "fulfilled" && names(s.value) ? [s.value] : []));
  if (hits.length > 1)
    throw new ReferenceRefusedError(
      "field-ambiguous",
      `${what}: the master spells ${key} under more than one reference field (${hits.map((h) => h.field.term).join(", ")}), so which rule it takes is not known`,
    );
  return hits[0] ?? null;
}

function requireVault(vaultId: unknown): asserts vaultId is string {
  if (!isAbsoluteIri(vaultId))
    throw new ReferenceRefusedError("no-vault", "name the vault: a vaultId from the platform's vault list. There is no default vault");
}

/** Where a record was found: its exact type's bare name. */
interface Placed {
  record: string;
  typeName: string;
}

/** A target's row on the named vault's typed list, and where that row says the record is held. */
interface Found {
  placed: Placed;
  placement: RowPlacement;
}

/**
 * Walk the NAMED vault's typed list, read for `names`, until `record`'s row is found or the list
 * says it is complete. Exact IRI equality. A walk that cannot end, or an answer other than 200,
 * throws `ReferenceUnknownError` ("not known yet"), ⛔ never "not in the vault".
 * One list per check (one walk per page of at most `LIST_TYPES_MAX` names): ⛔ no other vault's list is asked.
 */
async function walkList(platform: PlatformClient, vaultId: string, record: string, names: readonly string[]): Promise<Found | null> {
  // Full-row pages of 100, walked by the list's own `nextOffset` (`walkRecordPages`), ⛔ not 20 ids a page by rows added.
  const hit = (r: RecordRow) => r.entity === record && r.typeUri !== null;
  let walk: RecordWalk;
  try {
    walk = await walkRecordPages(platform, vaultId, names, { until: (rows) => rows.some(hit) });
  } catch (e) {
    if (e instanceof RecordListError)
      throw new ReferenceUnknownError(`the typed list of ${vaultId} answered ${e.status}, so whether it holds ${record} is not known`);
    throw e;
  }
  const row = walk.rows.find(hit);
  if (row) return { placed: { record, typeName: bareForm(row.typeUri!) }, placement: rowPlacement(row.row, vaultId) };
  if (walk.complete) return null;
  throw new ReferenceUnknownError(`the typed list of ${vaultId} could not be read to its end, so whether it holds ${record} is not known`);
}

/**
 * Find `record` IN the named vault, read for `typeNames`. Returns the row, `null` when it is not
 * a record of that vault, and throws `ReferenceRefusedError` (`in-more-than-one-vault`) or
 * `ReferenceUnknownError` otherwise.
 *
 * The typed list of vault V also lists the records of every vault nested in V that the caller
 * reaches. Each row names the vault that holds its record, so the
 * record is in V exactly when its row's `vault` is V, by exact IRI (`rowPlacement`):
 *   - another vault, a nested one included: `null` (refused by the caller, `not-in-vault`);
 *   - more than one vault: refused, `in-more-than-one-vault`, ⛔ never "in the vault";
 *   - a row with no `vault` (a platform that names no vault per row): "not known yet".
 * ⛔ The vault is never read off the record's IRI. ⛔ No nested vault's list is walked: the proof
 *   by exclusion over `scannedVaults` is removed, and with it its cost of one walk
 *   per nested vault per check.
 */
async function findInVault(platform: PlatformClient, vaultId: string, record: string, typeNames: readonly string[], what: string): Promise<Placed | null> {
  const names = [...new Set(typeNames)];
  // An empty `?type=` would list the whole vault. Nothing is admitted, so nothing can be found.
  if (names.length === 0) return null;
  // At most `LIST_TYPES_MAX` names a request: more are read in pages of names, one walk each, until the record's row is found.
  let found: Found | null = null;
  for (let at = 0; at < names.length && found === null; at += LIST_TYPES_MAX) found = await walkList(platform, vaultId, record, names.slice(at, at + LIST_TYPES_MAX));
  if (found === null) return null;
  switch (found.placement) {
    case "in-vault":
      return found.placed;
    case "other-vault":
      return null;
    case "more-than-one-vault":
      throw new ReferenceRefusedError(
        "in-more-than-one-vault",
        `${what}: the typed list of ${vaultId} says ${record} is held in more than one vault, so it is not a record of that vault alone`,
      );
    case "not-known-yet":
      throw new ReferenceUnknownError(`${what}: ${new PlacementUnknownError(vaultId, record).message}`);
  }
}

/**
 * A write goes to the vault's OWN host. A user vault has one address, at `/vault`, and its `/base`
 * spelling answers 404 on purpose (GilbPlatform `src/uri/vault-segment.ts`);
 * every LWS route is routed by host. So the origin the package is given must have the same host as
 * the vault it writes in; otherwise refused, with nothing sent. A system vault on the node's own host passes: there the hosts are equal.
 */
function requireVaultHost(platform: PlatformClient, vaultId: string): void {
  const why = originHostMismatch(platform, vaultId);
  if (why !== null) throw new ReferenceRefusedError("origin-not-vault-host", why);
}

/** The platform's typed list takes a `type` only of this form, and at most `LIST_TYPES_MAX` distinct a request; otherwise it
 *  answers 400 (GilbPlatform `src/lws/records.ts`). */
const LIST_TYPE_TOKEN = /^[A-Za-z0-9_-]{1,64}$/;
const LIST_TYPES_MAX = 100;

/** Every bare type name the check reads a list for: the admitted ones (read live), then, from the page's reading, the stakeholder
 *  kinds and every role relation's players and group, so a record that IS in the vault under a type the rule refuses is told
 *  apart from one that is not. (Either way it is refused and nothing is sent.) The reading's names decide nothing: only well-formed ones are added, and only while the list stays within one request of `LIST_TYPES_MAX` names. ⛔ An
 *  admitted name is never dropped: more than `LIST_TYPES_MAX` of them are read in pages (`findInVault`). */
function lookupNames(picker: ReferencePicker, admitted: readonly string[]): string[] {
  const relations = picker.reading.references?.relations ?? [];
  const out = new Set(admitted);
  const extras = [...picker.reading.fieldSets.kinds.types.map((t) => t.name), ...relations.flatMap((r) => [...r.playerNames, r.groupName])];
  for (const name of extras) {
    if (out.size >= LIST_TYPES_MAX) break;
    if (typeof name === "string" && LIST_TYPE_TOKEN.test(name)) out.add(name);
  }
  return [...out];
}

async function placeTarget(picker: ReferencePicker, vaultId: string, target: string, admitted: readonly string[], what: string): Promise<Placed> {
  if (!isAbsoluteIri(target)) throw new ReferenceRefusedError("not-an-iri", `${what}: ${JSON.stringify(target)} is not a record address`);
  const placed = await findInVault(picker.platform, vaultId, target, lookupNames(picker, admitted), what);
  if (placed === null)
    throw new ReferenceRefusedError(
      "not-in-vault",
      `${what}: ${target} is not a record the typed list of ${vaultId} holds. A reference points only at the holder's own record in the carrier's vault, never at an identity, a principal or a record of another vault`,
    );
  if (!admitted.includes(placed.typeName))
    throw new ReferenceRefusedError("type-not-admitted", `${what}: ${target} is a ${placed.typeName}, which this reference does not admit (admitted: ${admitted.join(", ")})`);
  return placed;
}

/**
 * The carrier of an `addReference`: a record of the named vault, of a type that is a stakeholder kind on the master NOW (read
 * live). The vault's typed list is read for the reading's names (`lookupNames`); those names only widen the list
 * read, ⛔ they never admit. A carrier that list does not hold is asked once more under the type its own document names, so a
 * kind the reading does not know yet is not refused for that.
 */
async function placeCarrier(picker: ReferencePicker, lm: LiveMaster, vaultId: string, carrier: string): Promise<Placed> {
  const what = "the carrier";
  if (!isAbsoluteIri(carrier)) throw new ReferenceRefusedError("not-an-iri", `${what}: ${JSON.stringify(carrier)} is not a record address`);
  const names = lookupNames(picker, []);
  let placed = await findInVault(picker.platform, vaultId, carrier, names, what);
  if (placed === null) {
    const own = await request(picker.platform, "GET", locate(picker.platform, carrier), undefined, undefined, "no-store");
    const type = own.status === 200 && typeof own.json?.["@type"] === "string" ? bareForm(own.json["@type"] as string) : null;
    if (type !== null && !names.includes(type)) placed = await findInVault(picker.platform, vaultId, carrier, [type], what);
  }
  if (placed === null)
    throw new ReferenceRefusedError(
      "not-in-vault",
      `${what}: ${carrier} is not a record the typed list of ${vaultId} holds. A reference points only at the holder's own record in the carrier's vault, never at an identity, a principal or a record of another vault`,
    );
  if (!(await liveIsStakeholderKind(lm, placed.typeName, what)))
    throw new ReferenceRefusedError("type-not-admitted", `${what}: ${carrier} is a ${placed.typeName}, which is not a stakeholder kind on the master (read live)`);
  return placed;
}

/** The reference field a caller's key names: its term IRI, or any spelling it publishes. */
export function referenceFieldFor(reading: ReferenceReading, key: string): ReferenceField | null {
  return reading.fields.find((f) => f.term === key || f.spelling.writeKey === key || f.spelling.readKeys.includes(key)) ?? null;
}

export interface ReferenceCheck {
  vaultId: string;
  /** The reference field: its term IRI on the master or one of its spellings. */
  field: string;
  /** The carrier's type, as its bare name (`Person`) or served (`t:Person`). */
  carrierType: string;
  /** The facts the carrier holds (or is about to be written with), any spelling. Read by
   *  `a:preferredChannel`'s check (c); ignored by the others. */
  carrierFacts?: Record<string, unknown>;
  target: string;
}

export interface CheckedReference {
  field: ReferenceField;
  /** The spelling to write the reference under. */
  writeKey: string;
  value: { "@id": string };
  /** The target's exact type (bare), or the contact type it was admitted under. */
  targetType: string;
}

/**
 * Check one reference. Resolves when the target may be written under the field on a carrier of
 * that type in that vault; throws `ReferenceRefusedError` or `ReferenceUnknownError` otherwise.
 * It writes nothing.
 *
 * Every set it admits or refuses on is READ LIVE from `picker.master` in this call: the field's
 * own term, the carrier's kind and whether the master offers the field on it, the role relations and their ends, the role's
 * kinds, the contact types, and every predicate spelling those reads use. `call` shares those reads with the rest of one write
 * call (`addReference`, a create); without it the check reads for itself.
 */
export async function checkReference(picker: ReferencePicker, input: ReferenceCheck, call: WriteCall = openWriteCall(picker)): Promise<CheckedReference> {
  requireVault(input.vaultId);
  const lm = liveMaster(call, `${input.field}`);
  // The reads every rule needs, started at once: they do not wait on the field. (`a/subTypeOf` is read only when the carrier's
  // walk up has to leave the carrier itself.)
  for (const path of [PREDICATE_TERMS.playableBy, PREDICATE_TERMS.fieldOf]) kept(liveSpelling(lm, path));
  kept(livePlayers(lm, lm.termIri(STAKEHOLDER_ROLE_TERM), `${input.field}`));
  const hit = await liveField(lm, input.field, `${input.field}`);
  if (!hit) throw new ReferenceRefusedError("not-a-reference-field", `${input.field} is not a reference this function writes`);
  const { field, served } = hit;
  if (field.spelling.writeKey === null)
    throw new ReferenceRefusedError("not-a-reference-field", field.spelling.writeKeyProblem ?? `${field.term} names no spelling to write`);
  const { name: carrier, absolute } = carrierNameOf(lm, served, input.carrierType, field);
  const what = `${field.spelling.writeKey} on a ${carrier}`;
  const done = (targetType: string): CheckedReference => ({ field, writeKey: field.spelling.writeKey!, value: { "@id": input.target }, targetType });
  kept(liveDeclarations(lm, what));
  if (field.rule === "membership") kept(liveRelations(lm, what));

  // THE CARRIER FIRST, READ LIVE. A record of a
  // stakeholder kind may carry the field only when the master offers it on that kind: a declaration of the field (`a:fieldOf`)
  // names the kind or a type above it by is-a, the reading the field sets make, made here on the live master.
  // ⛔ No carrier list in code. A carrier that is not a stakeholder kind: `a:memberOf` and `a:actsOnBehalfOf` declare stakeholder
  //   kinds only, so it is refused; `a:heldParty` declares no carrier on the master today (its carriers are named only in its
  //   text: holder-authored records about a party), so on such a carrier ONLY THE TARGET IS CHECKED. That limit is stated in the
  //   README; the claim writer stamps the claim's type.
  // The preferred-channel rule checks its carrier itself, as (b) below.
  // An absolute IRI names a stakeholder kind's own term or nothing, read live.
  if (absolute && !(await liveIsStakeholderKind(lm, carrier, what)))
    throw new ReferenceRefusedError("carrier-type-not-admitted", `${what}: an absolute carrier type must be a stakeholder kind's own term address on the master`);
  if (field.rule !== "contact-term") {
    const offered = await liveOffers(lm, carrier, field.spelling.readKeys, what);
    if (field.rule === "held-party") {
      if (!offered && (await liveIsStakeholderKind(lm, carrier, what)))
        throw new ReferenceRefusedError("carrier-type-not-admitted", `${what}: the master does not offer ${field.spelling.writeKey} as a field of ${carrier}`);
    } else if (!offered) {
      throw new ReferenceRefusedError("carrier-type-not-admitted", `${what}: the master does not offer ${field.spelling.writeKey} as a field of ${carrier}`);
    } else if (!(await liveIsStakeholderKind(lm, carrier, what))) {
      throw new ReferenceRefusedError("carrier-type-not-admitted", `${what}: ${carrier} is not a stakeholder kind on the master, and ${field.spelling.writeKey} is a field of stakeholder kinds only`);
    }
  }

  switch (field.rule) {
    case "membership": {
      // The group first, among every role relation's reference end; then the kinds of ONLY the relation(s) whose end is that
      // group's exact type. All read live: ⛔ the reading's relations, ends and players never admit or refuse.
      const relations = await liveRelations(lm, what);
      if (relations.length === 0)
        throw new ReferenceRefusedError("carrier-type-not-admitted", `${what}: the master declares no role relation, so a ${carrier} is a member of nothing`);
      const placed = await placeTarget(picker, input.vaultId, input.target, relations.map((r) => r.groupName), what);
      const byGroup = relations.filter((r) => r.groupName === placed.typeName);
      const players = await Promise.all(byGroup.map((r) => liveKindNames(lm, r.term, what)));
      if (!players.some((names) => names.includes(carrier)))
        throw new ReferenceRefusedError(
          "type-not-admitted",
          `${what}: ${input.target} is a ${placed.typeName}, and no role relation with that end admits a ${carrier} as a member (read live from the master)`,
        );
      return done(placed.typeName);
    }
    case "held-party": {
      const partyRole = lm.termIri(PARTY_ROLE_TERM);
      const party = await liveKindNames(lm, partyRole, what);
      const placed = await placeTarget(picker, input.vaultId, input.target, [...party, nameOfIri(partyRole)], what);
      return done(placed.typeName);
    }
    case "party": {
      const placed = await placeTarget(picker, input.vaultId, input.target, await liveKindNames(lm, lm.termIri(PARTY_ROLE_TERM), what), what);
      return done(placed.typeName);
    }
    case "contact-term":
      return done(await checkContactTerm(lm, carrier, input, what));
  }
}

/**
 * The carrier's type as a bare name, by its FORM only; what the master says of that type is
 * read live by the caller:
 *   - a bare name (`Person`) or a `t:` CURIE (`t:Person`) gives its name;
 *   - an absolute IRI must be a type's own term address on this master (`/base/t/<Name>`, on the master's own origin or the
 *     identity origin its terms are served under), and the caller then reads live that it is a stakeholder kind's own; any other absolute IRI is refused, ⛔ never cut to its last segment
 *     (`http://schema.org/Person` is not `Person`);
 *   - any other form is refused.
 */
function carrierNameOf(lm: LiveMaster, served: string, carrierType: string, field: ReferenceField): { name: string; absolute: boolean } {
  const refuse = (why: string): never => {
    throw new ReferenceRefusedError("carrier-type-not-admitted", `${field.spelling.writeKey} on ${JSON.stringify(carrierType)}: ${why}`);
  };
  if (typeof carrierType !== "string") return refuse("the carrier type is not a type name");
  if (isAbsoluteIri(carrierType)) {
    const name = /^\/base\/t\/([A-Za-z][A-Za-z0-9_-]*)$/.exec(new URL(carrierType).pathname)?.[1];
    const origins = [new URL(lm.termIri("")).origin, new URL(served).origin];
    if (!name || !origins.includes(new URL(carrierType).origin) || new URL(carrierType).search || new URL(carrierType).hash)
      return refuse("an absolute carrier type must be a stakeholder kind's own term address on the master; it is not read by its last segment");
    return { name, absolute: true };
  }
  if (!/^(t:)?[A-Za-z][A-Za-z0-9_-]*$/.test(carrierType)) return refuse("the carrier type is named as a bare type name or a t: CURIE only");
  return { name: bareForm(carrierType), absolute: false };
}

/** Row 7: the target is an attribute term on the master, not a record. It is dereferenced on the
 *  master, and its own document says which type it defines (`a:typeUri`). */
async function checkContactTerm(lm: LiveMaster, carrier: string, input: ReferenceCheck, what: string): Promise<string> {
  if (!isAbsoluteIri(input.target)) throw new ReferenceRefusedError("not-an-iri", `${what}: ${JSON.stringify(input.target)} is not a term address`);
  let doc: TermDoc;
  try {
    doc = await lm.term(input.target);
  } catch (cause) {
    if (is404(cause)) throw new ReferenceRefusedError("not-a-contact-term", `${what}: ${input.target} is not a term on the master (404)`);
    throw new ReferenceUnknownError(`${what}: ${input.target} could not be read: ${String(cause)}`);
  }
  // The value written is the term's own address, so the document must name it as its own.
  const typeUri = refsUnder(doc, ["a:typeUri", "typeUri"])[0];
  if (doc["@id"] !== input.target || !typeUri || !doc["a:predicateAttribute"])
    throw new ReferenceRefusedError("not-a-contact-term", `${what}: ${input.target} is not the address of an attribute term`);
  // The ONLY form is the attribute's address on the attribute route, as the term's own a:example
  // gives it. The master serves one term at its type
  // address too (`t/Email` answers as itself), and one channel stored in two forms is two values to
  // every reader. So the address is DERIVED from the term's own facts: its `a:predicateAttribute`
  // (`a:email`) expanded by the document's own `@context` (`a:` → the master's `/base/a/`), and the
  // target must be exactly that. ⛔ No list of contact addresses, ⛔ no prefix assumed here.
  // ⛔ A target equal to the term's own `a:typeUri` is never a value.
  const attributeAddress = refsUnder(doc, ["a:predicateAttribute", "predicateAttribute"])[0] ?? null;
  if (input.target === typeUri || attributeAddress === null || input.target !== attributeAddress)
    throw new ReferenceRefusedError(
      "not-a-contact-term",
      `${what}: a preferred channel is written as the attribute's own address${attributeAddress ? ` (${attributeAddress})` : ""}, ⛔ not ${input.target}`,
    );
  // (a) the type it defines is under t/ContactPoint, read live.
  if (!(await liveContactTypes(lm, what)).includes(typeUri))
    throw new ReferenceRefusedError("not-a-contact-term", `${what}: ${input.target} defines ${typeUri}, which is not under ${CONTACT_POINT_TERM}`);
  // (b) its a:fieldOf names the carrier's type or a type above it, and the carrier is a stakeholder kind: it is one of the
  // carrier kind's own fields. Read live: ⛔ never the reading's field sets.
  const declared = (await liveDeclarations(lm, what)).find((d) => d.term === typeUri);
  if (!declared || !(await liveOnLine(lm, carrier, new Set(declared.fieldOf), what)) || !(await liveIsStakeholderKind(lm, carrier, what)))
    throw new ReferenceRefusedError("not-a-field-of-carrier", `${what}: ${input.target} is not a field of ${carrier}`);
  // (c) the carrier holds a value under that attribute, in any spelling.
  const facts = input.carrierFacts ?? {};
  const held = declared.spelling.readKeys.some((k) => {
    const v = facts[k];
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  });
  if (!held) throw new ReferenceRefusedError("carrier-holds-no-value", `${what}: the ${carrier} holds no value under ${declared.spelling.writeKey ?? declared.term}`);
  return nameOfIri(typeUri);
}

// ── Writing ──────────────────────────────────────────────────────────────────────────────

export interface RoleRecordInput {
  vaultId: string;
  /** The writer: the principal of the writing token. ⛔ Not the holder's card. */
  agent: string;
  /** The holder's record of the player. */
  player: string;
  /** The holder's record of the group. */
  group: string;
}

export interface RoleRecordResult {
  record: string;
  vaultId: string;
  relation: string;
  writeType: string;
  player: string;
  group: string;
}

/**
 * Write one role record in the holder's vault: `role:source` the player, `role:target` the group,
 * both found in that vault's typed list, the relation chosen by the group's exact type.
 */
export async function writeRoleRecord(picker: ReferencePicker, input: RoleRecordInput, call: WriteCall = openWriteCall(picker)): Promise<RoleRecordResult> {
  requireVault(input.vaultId);
  if (typeof input.agent !== "string" || input.agent.trim() === "") throw new ReferenceRefusedError("no-agent", "name the agent the write is made as");
  requireVaultHost(picker.platform, input.vaultId);
  const what = "a role record";
  const lm = liveMaster(call, what); // no master: "not known yet" before any vault read
  // The relations and their ends, read live: ⛔ never the reading's relations.
  const live = await liveRelations(lm, what);
  const groupPlaced = await placeTarget(picker, input.vaultId, input.group, live.map((r) => r.groupName), `${what}'s group`);
  const relations = live.filter((r) => r.groupName === groupPlaced.typeName);
  if (relations.length !== 1)
    throw new ReferenceRefusedError("relation-ambiguous", `${groupPlaced.typeName} is the reference end of ${relations.length} role relations; the relation cannot be chosen`);
  const relation = relations[0]!;
  if (relation.writeType === null) throw new ReferenceRefusedError("no-write-type", `${relation.term} publishes no type to write a role record with`);
  // The relation's kinds, read live in this call: ⛔ never the reading's kept players.
  const playerWhat = `${what}'s player (${relation.name})`;
  await placeTarget(picker, input.vaultId, input.player, await liveKindNames(lm, relation.term, playerWhat), playerWhat);

  const id = `sh-${globalThis.crypto.randomUUID()}`;
  // The relation route at the vault's own address: the vault id followed by `/r/<id>`, the
  // platform's own expression of a relation's address (`relationUriInVault`, GilbPlatform
  // `src/write/mint.ts`). On a user vault that is `/vault/r/<id>`, which the platform rewrites to
  // its route; ⛔ never `/base/r/<id>` on every host (404 on a user-vault host).
  const url = locate(picker.platform, `${input.vaultId.replace(/\/+$/, "")}/r/${encodeURIComponent(id)}`);
  const answer = expectStatus(
    await request(picker.platform, "PUT", url, {
      type: relation.writeType,
      vault: input.vaultId,
      agent: input.agent,
      facts: { [ROLE_SOURCE]: { "@id": input.player }, [ROLE_TARGET]: { "@id": input.group } },
    }),
    "PUT",
    [201],
  );
  const record = answer.json?.entity;
  if (typeof record !== "string") throw new PlatformError(`PUT ${url} named no entity`, answer.status, url, answer.text);
  // Read back AT THE RETURNED ENTITY, ON ITS OWN HOST: the stored role ends must be the two records
  // that were checked. An entity minted on another host than the vault's cannot be read through
  // this origin, and is reported as written and unread (the read-back answers 404).
  try {
    if (new URL(record).host !== new URL(input.vaultId).host)
      throw new PlatformError(`${record} is not on the vault's own host, so it is not read back through this origin`, 201, url, answer.text);
    const opened = expectStatus(await request(picker.platform, "GET", locate(picker.platform, record)), "GET", [200]);
    const doc = await withOwnContext(picker.platform, opened.json ?? {});
    const end = (k: string) => refsUnder(doc, [k, k.replace(/^role:/, "")])[0];
    if (end(ROLE_SOURCE) !== input.player || end(ROLE_TARGET) !== input.group)
      throw new PlatformError(`GET ${opened.url}: the stored ends are not the checked records`, 200, opened.url, opened.text);
  } catch (cause) {
    throw new PartialReferenceError(`${record} was written and could not be read back as written`, record, cause);
  }
  return { record, vaultId: input.vaultId, relation: relation.term, writeType: relation.writeType, player: input.player, group: input.group };
}

/**
 * The LWS address a merge patch of `carrier` is sent to, PROVEN before use: the address must
 * answer a GET with the carrier's own `@id`. Tried in order: an `a:lwsSelf` that is an LWS
 * address; then `lws/r/<id>`, the platform's own route contract (GilbPlatform `src/lws/routes.ts`
 * resolves `/lws/r/:id` to the entity of that id on the routed host). Measured on the rig
 * (2026-10-02): a record's `a:lwsSelf` names its entity IRI, not an LWS
 * address, and `PATCH /base/e/<id>` has no route. ⛔ An address that does not answer with the
 * carrier's `@id` is never written to.
 */
async function lwsAddressOf(platform: PlatformClient, carrier: string, doc: TermDoc): Promise<string> {
  const candidates: string[] = [];
  const self = refsUnder(doc, ["a:lwsSelf", "lwsSelf"])[0];
  if (self && /\/lws\/r\/[^/]+$/.test(new URL(self).pathname)) candidates.push(locate(platform, self));
  const id = new URL(carrier).pathname.split("/").pop();
  if (id) candidates.push(routeUrl(platform, `lws/r/${id}`));
  for (const url of candidates) {
    const answer = await request(platform, "GET", url);
    if (answer.status === 200 && answer.json?.["@id"] === carrier) return url;
  }
  throw new ReferenceRefusedError("carrier-not-addressable", `no LWS address answers as ${carrier}, so it is not written to`);
}

export interface AddReferenceInput {
  vaultId: string;
  agent: string;
  /** The holder's record that carries the reference. It must be in the named vault. */
  carrier: string;
  /** The reference field: its term IRI or one of its spellings. */
  field: string;
  target: string;
}

/**
 * The most merge patches one `addReference` call sends: the first, and one more after each 412,
 * each from a fresh read and a fresh check. The README states this bound.
 */
export const ADD_REFERENCE_ATTEMPTS = 3;

/**
 * The `If-Match` a read's ETag gives, or `null` when it gives none.
 * GilbPlatform serves a record's ETag strong, as `"sha256:<64 hex>"` (`etagFor(state_hash)`), and
 * compares If-Match with that exact string. The production edge (Cloudflare) WEAKENS it when it
 * compresses the answer: measured 2026-10-02T19:22:29Z on `GET https://ontology.example.test/base/e/…`,
 * `W/"sha256:62ac…"` with gzip and `"sha256:62ac…"` with identity, the same tag. A browser cannot
 * ask for identity (`Accept-Encoding` is a forbidden header), so the weak form is what it reads.
 *   - a strong tag is sent as it is;
 *   - `W/` before the platform's OWN tag form is the edge's mark, and the platform's tag under it is
 *     sent;
 *   - any other weak tag, or anything else, gives `null`: "not known yet", nothing sent.
 */
export function conditionFromEtag(etag: string): string | null {
  if (/^"[^"]*"$/.test(etag)) return etag;
  const edge = /^W\/("sha256:[0-9a-f]{64}")$/.exec(etag);
  return edge ? edge[1]! : null;
}

/**
 * The carrier changed elsewhere on every attempt: each of the `attempts` merge patches was refused
 * 412 because the record moved after the read it was built from. Nothing was written by this call.
 * ⛔ Not a refusal of the target, and ⛔ not "not known yet": the caller may try again later.
 */
export class ReferenceChangedElsewhereError extends Error {
  readonly carrier: string;
  readonly attempts: number;
  constructor(carrier: string, attempts: number) {
    super(`${carrier} changed elsewhere after each of ${attempts} reads, so the reference was not written`);
    this.name = "ReferenceChangedElsewhereError";
    this.carrier = carrier;
    this.attempts = attempts;
  }
}

/**
 * Add one checked reference to an existing record of the holder's, by a merge patch of that one
 * field. A field that holds one value is set; a field that holds several gains the target, and
 * keeps the values it had under every spelling the term binds.
 *
 * The patch is CONDITIONAL on the read it was built from. The carrier's GET answers
 * with an ETag; the patch sends it as `If-Match`, so a platform that checks If-Match inside the write's
 * transaction refuses it 412, with nothing
 * written, when the record changed after that read. On 412 the whole attempt runs again: the
 * carrier is placed again, re-read, the reference is re-checked against the new read, and the value
 * is rebuilt from it. A target that no longer passes is refused as any refusal is. After
 * `ADD_REFERENCE_ATTEMPTS` patches refused 412 the answer is `ReferenceChangedElsewhereError`.
 * ⚠ A platform that lacks that check ignores If-Match on PATCH and answers 200 either way, so
 *   against it two writers adding to one multi field at one instant can still lose one addition.
 *   This package cannot tell the two platforms apart.
 * A carrier GET that names no ETag, or one `conditionFromEtag` cannot read, answers "not known yet",
 * with nothing sent: an unconditional patch is ⛔ never sent in its place.
 */
export async function addReference(picker: ReferencePicker, input: AddReferenceInput): Promise<CheckedReference & { carrier: string }> {
  requireVault(input.vaultId);
  if (typeof input.agent !== "string" || input.agent.trim() === "") throw new ReferenceRefusedError("no-agent", "name the agent the write is made as");
  requireVaultHost(picker.platform, input.vaultId);
  // One write call: every live read is shared by the attempts, and made again by the next call.
  const call = openWriteCall(picker);
  const lm = liveMaster(call, "the carrier"); // no master: "not known yet" before any vault read
  let url: string | null = null;
  for (let attempt = 1; attempt <= ADD_REFERENCE_ATTEMPTS; attempt++) {
    const carrier = await placeCarrier(picker, lm, input.vaultId, input.carrier);
    // The read the value is built from, ⛔ never answered from a cache: its ETag is the condition.
    const opened = expectStatus(await request(picker.platform, "GET", locate(picker.platform, input.carrier), undefined, undefined, "no-store"), "GET", [200]);
    const served = opened.headers.get("etag");
    const etag = served === null ? null : conditionFromEtag(served);
    if (!etag)
      throw new ReferenceUnknownError(
        `GET ${opened.url} named ${served === null ? "no ETag" : `the ETag ${served}, which is not the platform's own`}, so a patch of ${input.carrier} cannot be conditioned on what was read; nothing was sent`,
      );
    const doc = await withOwnContext(picker.platform, opened.json ?? {});
    const checked = await checkReference(picker, { vaultId: input.vaultId, field: input.field, carrierType: carrier.typeName, carrierFacts: doc, target: input.target }, call);
    // `a:heldParty` is CHECKED here and never written by this package: the record-and-claims door
    // sets it to the record the request names and refuses any other value; a writer reaches it
    // through the package by calling that door. A carrier that passed
    // the check is still refused here, with nothing sent.
    if (checked.field.rule === "held-party")
      throw new ReferenceRefusedError("held-party-not-written", `${checked.writeKey} is checked by this package and written only by the record-and-claims door`);
    url ??= await lwsAddressOf(picker.platform, input.carrier, doc);
    let value: unknown = checked.value;
    if (checked.field.many) {
      // The values it had under every spelling the term binds, as absolute addresses: a CURIE the record
      // was served with is expanded by its own context, so what is written back is what is stored.
      const ids = refsUnder(doc, checked.field.spelling.readKeys);
      const list: unknown[] = ids.map((id) => ({ "@id": id }));
      const next = ids.includes(input.target) ? list : [...list, checked.value];
      // One entry as a single reference, several as a list (the create writes the same shape).
      value = next.length === 1 ? next[0] : next;
    }
    const answer = await request(
      picker.platform,
      "PATCH",
      url,
      { [checked.writeKey]: value },
      { "content-type": "application/merge-patch+json", "x-base-agent": input.agent, "if-match": etag },
    );
    // 412: the record changed after `opened`, and the platform wrote nothing. Read and check again.
    if (answer.status === 412) continue;
    expectStatus(answer, "PATCH", [200, 201]);
    return { ...checked, carrier: input.carrier };
  }
  throw new ReferenceChangedElsewhereError(input.carrier, ADD_REFERENCE_ATTEMPTS);
}
