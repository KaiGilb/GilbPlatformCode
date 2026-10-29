// ONE shared, cached reader of the stakeholder kind set and its kind words: read from the master in as few requests as it allows,
// kept per master origin across sessions, checked again in the background, and bounded in time.

import {
  MASTER_READ_CAP_MS,
  MASTER_REQUEST_TIMEOUT_MS,
  MasterTimeoutError,
  VocabularyUnavailableError,
  boundSource,
  checkedBound,
  masterSource,
  nameOfIri,
  refsUnder,
  textUnder,
  withDeadline,
  type PredicateSpelling,
  type TermDoc,
  type TermFetch,
  type VocabularySource,
} from "@kaigilb/gilbplatformcode-vocabulary-source";
import { STAKEHOLDER_ROLE_TERM, expandDownIsA, readShortcutSpelling, settleShortcuts, type CreateShortcut, type ShortcutState, type StakeholderKindType, type StakeholderKinds } from "./kinds";
import { resolvePredicate, type StakeholderPredicates } from "./predicates";
import type { VocabularyStore } from "./vocabularyStore";

/** The stakeholder kinds and their words, as one master answered them. Plain data: it is kept in a store as JSON. */
export interface StakeholderKindSet {
  /** The role concept that was read (its address on the master read). */
  role: string;
  /** The role's `a:playableBy`, verbatim and in served order. */
  members: string[];
  /** The role's own word (`a:label`), from the same read as its players: a card needs no read of its own for it. Null when the
   *  role carries none. */
  roleLabel: string | null;
  /** Members plus every transitive is-a child, each once. A type's `label` is the master's word for it, or null when its term
   *  did not answer: ⛔ never a guess. */
  types: StakeholderKindType[];
  /** The bare type names, served order, each once: the form a typed records read's `?type=` takes. */
  names: string[];
  /** The kind words by the type's term address as the master served it. A type with no word is absent. */
  labels: Record<string, string>;
  /** The keys the master serves a word under (the spellings of `a:label`). */
  labelKeys: string[];
  /** The two predicates' spellings this read resolved, so the field-set path reads only the others. */
  spellings: Pick<StakeholderPredicates, "playableBy" | "label">;
  /** False when a children listing said it was not complete: the set is then a floor. */
  complete: boolean;
  incompleteAt: string[];
  /** The role's create shortcuts (`a:createShortcut`), kept to players, each with its word. */
  createShortcuts: CreateShortcut[];
  shortcuts: ShortcutState;
}

export interface ReadKindSetOptions {
  /** Override the role concept's address (a path under `/base/`). */
  roleTerm?: string;
}

/** A read of the set, with the words it could not read. */
interface KindSetRead {
  set: StakeholderKindSet;
  /** The terms in the set whose own word read FAILED (rejected) and that no kept word stood in for. A term that answered with no
   *  word is not here: that is the master's answer. */
  unread: string[];
}

/**
 * The read behind {@link readStakeholderKindSet}. `keptWords` are the words already in hand, by term: a term whose word read
 * fails keeps its kept word, ⛔ never loses it to a failed read.
 */
async function readKindSet(source: VocabularySource, opts: ReadKindSetOptions, keptWords?: ReadonlyMap<string, string>): Promise<KindSetRead> {
  const role = source.termIri(opts.roleTerm ?? STAKEHOLDER_ROLE_TERM);
  // Round 1. Only the two predicates the set uses are read (`resolvePredicates` reads all six, for the field sets).
  const [playableBy, label, roleDoc, shortcutKeys] = await Promise.all([
    resolvePredicate(source, "playableBy"),
    resolvePredicate(source, "label"),
    source.terms ? source.terms([role])[0]! : source.term(role),
    readShortcutSpelling(source),
  ]);
  const members = refsUnder(roleDoc, playableBy.readKeys);
  if (members.length === 0) {
    throw new VocabularyUnavailableError(
      `${role} declares no players under ${playableBy.readKeys.join(" / ")}; the stakeholder kinds cannot be read`,
    );
  }
  const shortcutTerms = shortcutKeys === null ? [] : refsUnder(roleDoc, shortcutKeys);

  // Round 2, beside the walk: the players' and shortcuts' own words in ONE named read. Never rejects: a term that does not answer
  // has no word.
  const wordTerms = [...new Set([...members, ...shortcutTerms])];
  const wordsRead = readWords(source, wordTerms, label.readKeys);
  const { types, incompleteAt } = await expandDownIsA(source, members);
  const { words, failed } = await wordsRead;
  // A failed read stands for "not known", so the word in hand (if any) is kept; an answered term is the master's word, or none.
  const wordOf = (term: string): string | null => (failed.has(term) ? (keptWords?.get(term) ?? null) : (words.get(term) ?? null));

  const labels: Record<string, string> = {};
  for (const k of types) {
    if (k.label === null) k.label = wordOf(k.term);
    if (k.label) labels[k.term] = k.label;
  }
  const names: string[] = [];
  for (const k of types) if (k.name && !names.includes(k.name)) names.push(k.name);

  const { createShortcuts, shortcuts } = settleShortcuts(
    shortcutKeys === null
      ? { state: "unreadable", named: [] }
      : shortcutTerms.length === 0
        ? { state: "none-declared", named: [] }
        : { state: "named", named: shortcutTerms.map((term) => ({ term, name: nameOfIri(term), label: wordOf(term) })) },
    new Set(types.map((k) => k.term)),
  );

  const inSet = new Set([...types.map((k) => k.term), ...createShortcuts.map((c) => c.term)]);
  const unread = [...failed].filter((term) => inSet.has(term) && !keptWords?.has(term));

  const set: StakeholderKindSet = {
    role,
    members,
    roleLabel: textUnder(roleDoc, label.readKeys),
    types,
    names,
    labels,
    labelKeys: [...label.readKeys],
    spellings: { playableBy, label },
    complete: incompleteAt.length === 0,
    incompleteAt,
    createShortcuts,
    shortcuts,
  };
  return { set, unread };
}

/** Each term's own word, read together (one named read on a source that has one). Never rejects: a term whose read failed is in
 *  `failed`, apart from a term that answered with no word. */
async function readWords(
  source: VocabularySource,
  terms: readonly string[],
  labelKeys: readonly string[],
): Promise<{ words: Map<string, string | null>; failed: Set<string> }> {
  const docs: Promise<TermDoc>[] = source.terms ? source.terms(terms) : terms.map((iri) => source.term(iri));
  const settled = await Promise.allSettled(docs);
  const words = new Map<string, string | null>();
  const failed = new Set<string>();
  terms.forEach((term, i) => {
    const s = settled[i]!;
    if (s.status === "fulfilled") words.set(term, textUnder(s.value, labelKeys));
    else failed.add(term);
  });
  return { words, failed };
}

/**
 * The set as the field-set path's `StakeholderKinds` (one kind read in the package; the card, the Records grid
 * and the create dialog read the kinds through the cached reader too, ⛔ never a second walk). A copy: changing it leaves the set
 * in hand alone. Prefer `resolveFieldSets(source, { kindSet })`, which reads the predicates for you.
 *
 * @param set the cached kind set
 * @param predicates the six predicates' spellings (`resolvePredicates`)
 * @returns the kinds, with the set's words on every type
 */
export function stakeholderKindsOf(set: StakeholderKindSet, predicates: StakeholderPredicates): StakeholderKinds {
  return {
    role: set.role,
    members: [...set.members],
    types: set.types.map((k) => ({ ...k, parents: [...k.parents], members: [...k.members] })),
    complete: set.complete,
    incompleteAt: [...set.incompleteAt],
    predicates,
    createShortcuts: set.createShortcuts.map((c) => ({ ...c })),
    shortcuts: set.shortcuts,
  };
}

/** The words a set holds, by term (its types' and its shortcuts'). */
function wordsOf(set: StakeholderKindSet): Map<string, string> {
  const out = new Map<string, string>();
  for (const k of set.types) if (k.label) out.set(k.term, k.label);
  for (const c of set.createShortcuts) if (c.label && !out.has(c.term)) out.set(c.term, c.label);
  return out;
}

/** The longest type `kindLabelOf` reads: 2048 characters. A served type address is well under 100; anything longer is no type,
 *  and a row's type is pod data, so its cost must stay bounded. */
export const KIND_TYPE_MAX_LENGTH = 2048;

/** `s` without its trailing slashes, in time linear in `s` (⛔ not `replace(/\/+$/, "")`: V8 retries that regex from every start
 *  of a slash run, so a long run costs seconds). */
function withoutTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s.charCodeAt(end - 1) === 47 /* "/" */) end--;
  return s.slice(0, end);
}

const TYPE_PATH = "/base/t/";

/**
 * The master's word for a row's type, whichever spelling the vault served (`t:X`, `https://<any host>/base/t/X`, a bare `X`).
 * The type's NAME is the key: the master's names are unique, and a vault may serve the type under its own host.
 *
 * Never throws, whatever it is handed: a value parsed from JSON, or an object whose getters, iterator or Proxy traps throw
 * A row is then drawn without a word rather than not at all. Its time is linear in the type, and a type
 * longer than `KIND_TYPE_MAX_LENGTH` is not read.
 *
 * @param set the kind set, or null while it is read
 * @param type the row's type
 * @returns the word, or null when the set does not know it
 */
export function kindLabelOf(set: Pick<StakeholderKindSet, "types"> | null | undefined, type: string | null | undefined): string | null {
  try {
    return labelOfType(set, type);
  } catch {
    return null;
  }
}

function labelOfType(set: Pick<StakeholderKindSet, "types"> | null | undefined, type: string | null | undefined): string | null {
  if (!set || typeof set !== "object" || typeof type !== "string" || type.length > KIND_TYPE_MAX_LENGTH) return null;
  const types: unknown = set.types;
  if (!Array.isArray(types)) return null;
  // A trailing slash on a served address is the same type.
  const raw = withoutTrailingSlashes(type.trim());
  if (!raw) return null;
  // The name after the LAST `/base/t/`, when nothing after it is a path, a fragment or a query; else the type as served.
  const at = raw.lastIndexOf(TYPE_PATH);
  const tail = at < 0 ? "" : raw.slice(at + TYPE_PATH.length);
  let name = tail && !/[/#?]/.test(tail) ? tail : raw.startsWith("t:") ? raw.slice(2) : raw;
  try {
    name = decodeURIComponent(name);
  } catch {
    // keep the name as served
  }
  for (const k of types as unknown[]) {
    if (k && typeof k === "object" && (k as StakeholderKindType).name === name) {
      const label = (k as StakeholderKindType).label;
      return typeof label === "string" ? label : null;
    }
  }
  return null;
}

/** How long a kept set is used without a check: 10 minutes. A session that starts later checks it in the background. */
export const KIND_SET_MAX_AGE_MS = 10 * 60_000;

/** How long after the first answer a background check starts, so it does not compete with the first screen: 3 seconds. */
export const KIND_SET_CHECK_DELAY_MS = 3000;

/** The store key's head. `v1` is the shape of `StakeholderKindSet`; a change to that shape changes it, and an older entry is
 *  left where it is and not read. */
const STORE_KEY_HEAD = "gilb-stakeholders.kind-set.v1";
/** The same, for a `TypeTree`. */
const TREE_KEY_HEAD = "gilb-stakeholders.type-tree.v1";

interface Stored<T> {
  v: 1;
  origin: string;
  /** When the master last answered this value (ms since the epoch). */
  checkedAt: number;
  set: T;
}

/** How a cached reader keeps, dates and checks its value. Shared by the kind reader and the type-tree reader. */
export interface CacheOptions {
  /** Where the value is kept across sessions. `null`: memory only. Absent: `globalThis.localStorage` when it can be used. */
  store?: VocabularyStore | null;
  maxAgeMs?: number;
  checkDelayMs?: number;
  /** The clock (tests). */
  now?: () => number;
  /** How a background check is put off (tests). Default: `setTimeout`. */
  defer?: (fn: () => void, ms: number) => void;
  /** The cap on one whole reading, in ms. Default `MASTER_READ_CAP_MS`. A finite number above 0, at most
   *  2,147,483,647: anything else is refused with a RangeError when the reader is made, ⛔ never read as "no bound". */
  readCapMs?: number;
  /** Where a subscriber's error goes. Default: the host's `reportError` (a browser's uncaught-error path), else `console.error`.
   *  A subscriber that throws never stops the ones after it, and neither does a handler that throws: its
   *  own error goes to the host. */
  onSubscriberError?: (err: unknown) => void;
}

export interface KindReaderOptions extends CacheOptions {
  /** The master. */
  source: VocabularySource;
  /** The master's origin: the set is kept under it. */
  origin: string;
  /** Override the role concept's address (a path under `/base/`). Each role is kept under its own key. */
  roleTerm?: string;
}

/** The host's own path for an error no caller can catch. Never throws. */
function reportToHost(err: unknown): void {
  try {
    const report = (globalThis as { reportError?: (e: unknown) => void }).reportError;
    if (typeof report === "function") report(err);
    else console.error(err);
  } catch {
    // Nowhere left to report it.
  }
}

/** A cached reading of one value from the master: the set of a role's kinds, or a type tree. */
export interface CachedReader<T> {
  /** The value: the one in hand or kept (0 requests), else read now. A kept value older than the max age is answered at once and
   *  checked in the background. Rejects only when no value is in hand and the master cannot be read. */
  get(): Promise<T>;
  /** The value in hand, or null. ⛔ `null` means "not known yet", NEVER "none". */
  peek(): T | null;
  /** Read the master now. A changed answer is kept and handed to every subscriber. Rejects, keeping the value in hand, when a read
   *  the value needs fails. */
  check(): Promise<T>;
  /** Called with the new value each time a check finds the master's answer changed. Returns the unsubscribe. */
  subscribe(fn: (value: T) => void): () => void;
}

/** The kind reader: for the set, a failed word read keeps the word in hand for that kind. */
export type StakeholderKindReader = CachedReader<StakeholderKindSet>;

/** `globalThis.localStorage` when it can be read, else null (absent, or refused by the browser). */
function defaultStore(): VocabularyStore | null {
  try {
    const s = (globalThis as { localStorage?: VocabularyStore }).localStorage;
    if (!s) return null;
    s.getItem(STORE_KEY_HEAD);
    return s;
  } catch {
    return null;
  }
}

const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isTextList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isText);
const isWord = (v: unknown): v is string | null => v === null || typeof v === "string";
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isSpelling = (v: unknown): v is PredicateSpelling =>
  isRecord(v) && isText(v.term) && isTextList(v.readKeys) && v.readKeys.length > 0 && isWord(v.writeKey) && isWord(v.writeKeyProblem);

/** A kept entry's set has the whole shape the readers use; anything else is ignored, as if nothing were kept. */
function usableSet(x: unknown): x is StakeholderKindSet {
  if (!isRecord(x)) return false;
  const s = x as Record<string, unknown>;
  const typeOk = (k: unknown) =>
    isRecord(k) && isText(k.term) && isText(k.name) && isWord(k.label) && typeof k.isMember === "boolean" && isTextList(k.parents) && isTextList(k.members);
  const shortcutOk = (c: unknown) => isRecord(c) && isText(c.term) && isText(c.name) && isWord(c.label);
  return (
    isText(s.role) &&
    isTextList(s.members) &&
    isWord(s.roleLabel) &&
    Array.isArray(s.types) &&
    s.types.length > 0 &&
    s.types.every(typeOk) &&
    isTextList(s.names) &&
    s.names.length > 0 &&
    isRecord(s.labels) &&
    Object.values(s.labels).every((v) => typeof v === "string") &&
    isTextList(s.labelKeys) &&
    isRecord(s.spellings) &&
    isSpelling(s.spellings.playableBy) &&
    isSpelling(s.spellings.label) &&
    typeof s.complete === "boolean" &&
    Array.isArray(s.incompleteAt) &&
    Array.isArray(s.createShortcuts) &&
    s.createShortcuts.every(shortcutOk)
  );
}

/** What one read of the master gave: the value, and what it needed and could not read (a word, for the kind set). A value with
 *  something unread is answered when nothing is in hand, ⛔ never kept or told. */
interface CacheRead<T> {
  value: T;
  unread: string[];
}

/**
 * THE cache of the package (one, ⛔ not one per kind of value). Keeps one value per key in the store, dates
 * it, answers from it, checks it in the background when it is older than the max age, and tells subscribers when it changed.
 */
function createCachedReader<T>(
  opts: CacheOptions & {
    key: string;
    origin: string;
    usable: (x: unknown) => x is T;
    /** One reading. `bind` gives the source this reading must read through: its requests stop at the reading's cap. */
    read: (inHand: T | null, bind: (source: VocabularySource) => VocabularySource) => Promise<CacheRead<T>>;
  },
): CachedReader<T> {
  const store = opts.store === undefined ? defaultStore() : opts.store;
  const key = opts.key;
  const maxAge = opts.maxAgeMs ?? KIND_SET_MAX_AGE_MS;
  const delay = opts.checkDelayMs ?? KIND_SET_CHECK_DELAY_MS;
  const now = opts.now ?? (() => Date.now());
  const defer = opts.defer ?? ((fn: () => void, ms: number) => void setTimeout(fn, ms));
  const cap = checkedBound("readCapMs", opts.readCapMs, MASTER_READ_CAP_MS);
  const ranOut = () => new MasterTimeoutError(`not known yet: the master did not finish this reading in ${cap} ms`, cap);
  const listeners = new Set<(value: T) => void>();

  let held: T | null = null;
  let heldPrint = "";
  /** When the value in hand was last answered, or last tried in this session (a failed check waits a max age too). */
  let checkedAt = 0;
  let reading: Promise<T> | null = null;
  let checkPending = false;

  // The kept value, read once, at creation: `peek()` answers from it before any `get()`.
  try {
    const raw = store?.getItem(key);
    if (raw) {
      const kept = JSON.parse(raw) as Stored<unknown>;
      if (kept && kept.v === 1 && kept.origin === opts.origin && Number.isFinite(kept.checkedAt) && opts.usable(kept.set)) {
        held = kept.set;
        heldPrint = JSON.stringify(kept.set);
        checkedAt = kept.checkedAt;
      }
    }
  } catch {
    // An unreadable entry or store: as if nothing were kept.
  }

  const keep = (value: T) => {
    try {
      store?.setItem(key, JSON.stringify({ v: 1, origin: opts.origin, checkedAt, set: value } satisfies Stored<T>));
    } catch {
      // A full or refused store costs the warm start of the next session, nothing more.
    }
  };

  /** Each subscriber in its own try; a handler that throws goes to the host and stops nothing. */
  const tell = (value: T) => {
    for (const fn of [...listeners]) {
      try {
        fn(value);
      } catch (err) {
        try {
          (opts.onSubscriberError ?? reportToHost)(err);
        } catch (handlerErr) {
          reportToHost(handlerErr);
        }
      }
    }
  };

  /** Put a check off by the check delay, once: the next one only after it has run. */
  const scheduleCheck = () => {
    checkPending = true;
    defer(() => {
      read()
        .catch(() => {
          // Keep the value in hand; try again after another max age, ⛔ not on every get of this session.
          checkedAt = now();
        })
        .finally(() => {
          checkPending = false;
        });
    }, delay);
  };

  const read = (): Promise<T> => {
    if (reading) return reading;
    const inHand = held;
    // the whole reading ends by the cap. At the cap its signal aborts, so every request of it still in flight is
    // aborted and none is sent after; the reading then fails like any failed read (the set in hand stays).
    reading = withDeadline((signal) => opts.read(inHand, (source) => boundSource(source, signal, ranOut)), { ms: cap, timeoutError: ranOut, abortError: ranOut })
      .then(({ value, unread }) => {
        // A value is adopted, kept and told only when everything it needed was read (or kept from the one in hand).
        if (unread.length > 0) {
          if (inHand !== null) {
            throw new VocabularyUnavailableError(`${unread.join(", ")} could not be read; the value in hand is kept`);
          }
          // Cold: the caller gets the value (a missing word is drawn without it, ⛔ never guessed), but it is not kept in the store
          // and not dated. This read itself schedules the one check for what it missed, ⛔ not the next get.
          held = value;
          heldPrint = JSON.stringify(value);
          if (!checkPending) scheduleCheck();
          return value;
        }
        const print = JSON.stringify(value);
        const changed = held !== null && print !== heldPrint;
        if (held === null || changed) {
          held = value;
          heldPrint = print;
        }
        const answer = held!;
        checkedAt = now();
        keep(answer);
        if (changed) tell(answer);
        return answer;
      })
      .finally(() => {
        reading = null;
      });
    return reading;
  };

  const stale = () => {
    const age = now() - checkedAt;
    return age < 0 || age >= maxAge;
  };

  return {
    peek: () => held,
    get: () => {
      if (held) {
        if (stale() && !checkPending && !reading) scheduleCheck();
        return Promise.resolve(held);
      }
      return read();
    },
    check: read,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}

/** A term path as the readers key it: no leading slash; the default role is no role at all. */
const termPath = (path: string): string => path.replace(/^\/+/, "");
const rolePath = (roleTerm: string | undefined): string | undefined => {
  if (roleTerm === undefined) return undefined;
  const p = termPath(roleTerm);
  return p === STAKEHOLDER_ROLE_TERM ? undefined : p;
};

/**
 * One cached reader of a role's kind set for one master origin. Prefer {@link stakeholderKindReader}, which keeps one per origin
 * and role in the page.
 *
 * @param opts the master, its origin, the role, the store and the clock
 * @returns the reader
 */
export function createStakeholderKindReader(opts: KindReaderOptions): StakeholderKindReader {
  const role = rolePath(opts.roleTerm);
  return createCachedReader<StakeholderKindSet>({
    ...opts,
    key: `${STORE_KEY_HEAD}:${opts.origin}${role ? `|${role}` : ""}`,
    usable: usableSet,
    read: async (inHand, bind) => {
      const { set, unread } = await readKindSet(bind(opts.source), role ? { roleTerm: role } : {}, inHand ? wordsOf(inHand) : undefined);
      return { value: set, unread };
    },
  });
}

/** Every type below one type by is-a, as the master answered it. Plain data: it is kept in a store as JSON. */
export interface TypeTree {
  /** The root's address on the master read. */
  root: string;
  /** Every transitive is-a child of the root, as served, each once, breadth first in served order. The root is not in it. */
  terms: string[];
  /** False when a children listing said it was not complete: the tree is then a floor. */
  complete: boolean;
  /** The types whose listing was not complete. */
  incompleteAt: string[];
}

export type TypeTreeReader = CachedReader<TypeTree>;

export interface TypeTreeReaderOptions extends CacheOptions {
  source: VocabularySource;
  origin: string;
  /** The root type's address (a path under `/base/`, e.g. `t/ContactPoint`). */
  rootTerm: string;
}

function usableTree(x: unknown): x is TypeTree {
  return isRecord(x) && isText(x.root) && isTextList(x.terms) && typeof x.complete === "boolean" && isTextList(x.incompleteAt);
}

/**
 * Read every type below `rootTerm` by is-a: one round of children listings per level (the same walk as the kinds').
 *
 * @throws VocabularyUnavailableError when a listing cannot be read
 */
export async function readTypeTree(source: VocabularySource, rootTerm: string): Promise<TypeTree> {
  const root = source.termIri(termPath(rootTerm));
  const { types, incompleteAt } = await expandDownIsA(source, [root]);
  return { root, terms: types.filter((k) => k.term !== root).map((k) => k.term), complete: incompleteAt.length === 0, incompleteAt };
}

/**
 * One cached reader of the type tree below `rootTerm` for one master origin. Prefer {@link typeTreeReader}.
 */
export function createTypeTreeReader(opts: TypeTreeReaderOptions): TypeTreeReader {
  const root = termPath(opts.rootTerm);
  return createCachedReader<TypeTree>({
    ...opts,
    key: `${TREE_KEY_HEAD}:${opts.origin}|${root}`,
    usable: usableTree,
    read: async (_inHand, bind) => ({ value: await readTypeTree(bind(opts.source), root), unread: [] }),
  });
}

const readersByOrigin = new Map<string, StakeholderKindReader>();
const treesByOrigin = new Map<string, TypeTreeReader>();

export interface SharedKindReaderOptions {
  /** The master's ORIGIN (`https://ontology.example.test`). A trailing slash is fine; a path or a relative address is refused. */
  vedaOrigin: string;
  /** The role, when it is not `t/Stakeholder` (a path under `/base/`). */
  roleTerm?: string;
  /** The host's fetch (see `masterSource`). The first reader made for an origin and role keeps the fetch it was made with. */
  fetchImpl?: TermFetch;
  /** See {@link CacheOptions.store}. */
  store?: VocabularyStore | null;
  /** The bound on each master request, in ms (see `MasterSourceOptions.timeoutMs`). Default `MASTER_REQUEST_TIMEOUT_MS`. */
  timeoutMs?: number;
  /** The cap on one whole reading, in ms (see {@link CacheOptions.readCapMs}). Default `MASTER_READ_CAP_MS`. */
  readCapMs?: number;
}

/** The master source and cache options a shared reader is made with: the fetch, the request bound, the store and the cap. */
function sharedParts(origin: string, opts: Omit<SharedKindReaderOptions, "vedaOrigin" | "roleTerm">) {
  return {
    source: masterSource({
      vedaOrigin: origin,
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
      ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    }),
    origin,
    ...(opts.store !== undefined ? { store: opts.store } : {}),
    ...(opts.readCapMs !== undefined ? { readCapMs: opts.readCapMs } : {}),
  };
}

/** The shared readers' bounds, checked on every call: a bad bound is refused even when the page already has
 *  the reader, which would otherwise keep its own bounds and drop the bad one without a word. */
function checkSharedBounds(opts: { timeoutMs?: number; readCapMs?: number }): void {
  checkedBound("timeoutMs", opts.timeoutMs, MASTER_REQUEST_TIMEOUT_MS);
  checkedBound("readCapMs", opts.readCapMs, MASTER_READ_CAP_MS);
}

/** The bare origin of `vedaOrigin`, or a VocabularyUnavailableError. Linear in its input. */
function masterOrigin(vedaOrigin: string): string {
  try {
    const u = new URL(vedaOrigin);
    // Only a web origin: `file:`, `data:` and the like have the opaque origin "null".
    if ((u.protocol !== "https:" && u.protocol !== "http:") || u.origin === "null") throw new Error("not an http(s) origin");
    if (withoutTrailingSlashes(u.pathname) !== "" || u.search) throw new Error("not a bare origin");
    return u.origin;
  } catch (cause) {
    const shown = vedaOrigin.length > 200 ? `${JSON.stringify(vedaOrigin.slice(0, 200))}…` : JSON.stringify(vedaOrigin);
    throw new VocabularyUnavailableError(`${shown} is not the master's origin: ${String(cause)}`);
  }
}

/**
 * THE kind reader of a master origin and role in this page: every door that asks for the same origin and role gets the same
 * reader, so the set is read once per page and kept once per origin and role.
 *
 * @param opts the master's origin, the role, and the fetch and store of the first reader made for them
 * @returns the reader
 * @throws VocabularyUnavailableError for an address that is not a bare origin (MyNet's dev `/veda` would read `/veda/veda/base/…`)
 * @throws RangeError when `timeoutMs` or `readCapMs` is given and is not a finite number above 0, at most 2,147,483,647
 */
export function stakeholderKindReader(opts: SharedKindReaderOptions): StakeholderKindReader {
  checkSharedBounds(opts);
  const origin = masterOrigin(opts.vedaOrigin);
  const role = rolePath(opts.roleTerm);
  const at = `${origin}|${role ?? ""}`;
  let r = readersByOrigin.get(at);
  if (!r) {
    r = createStakeholderKindReader({ ...sharedParts(origin, opts), ...(role ? { roleTerm: role } : {}) });
    readersByOrigin.set(at, r);
  }
  return r;
}

export interface SharedTypeTreeReaderOptions extends Omit<SharedKindReaderOptions, "roleTerm"> {
  /** The root type (a path under `/base/`). */
  rootTerm: string;
}

/**
 * THE type-tree reader of a master origin and root in this page.
 *
 * @throws VocabularyUnavailableError for an address that is not a bare origin
 * @throws RangeError when `timeoutMs` or `readCapMs` is given and is not a finite number above 0, at most 2,147,483,647
 */
export function typeTreeReader(opts: SharedTypeTreeReaderOptions): TypeTreeReader {
  checkSharedBounds(opts);
  const origin = masterOrigin(opts.vedaOrigin);
  const root = termPath(opts.rootTerm);
  const at = `${origin}|${root}`;
  let r = treesByOrigin.get(at);
  if (!r) {
    r = createTypeTreeReader({ ...sharedParts(origin, opts), rootTerm: root });
    treesByOrigin.set(at, r);
  }
  return r;
}

/** Forget every shared reader, kinds and trees (tests; a page never needs it). */
export function forgetStakeholderKindReaders(): void {
  readersByOrigin.clear();
  treesByOrigin.clear();
}
