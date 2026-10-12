import { PHOTO_TERM_SNAPSHOT } from "./termSnapshot";

// The photo predicate's spellings, resolved from the GilbVeda master at RUN TIME.
//
// ── WHY THIS FILE IS THE POINT OF THE UNIT ───────────────────────────────────────────────
//
// Two apps once each held a hand-typed list of the photo's key names
// (`["profilePhoto", "hasPhoto"]`). That is the defect twice over:
//
//   1. A hand-kept read set DRIFTS the moment the master gains a spelling, and it drifts
//      SILENTLY — the reader simply does not see data that exists, with no error and an empty
//      state indistinguishable from "there is genuinely nothing there".
//   2. Two apps agreeing on a constant is NOT interoperability. The cross-app requirement is
//      that app B reads app A's data WITHOUT app A's key names. "We both typed the same
//      string" is the failure, not the pass. Both apps asking the same AUTHORITY is the pass.
//
// So nothing here is a key name that two apps agreed on. The only literal is the term's own
// slug on the master, which is where its meaning is published and where any uncoordinated app
// would look. The spellings come back from that document.
//
// ⛔ Do not add a spelling to a list in this file. If a spelling is missing, it is missing from
//    the master, and that is the ontology's to place — not this file's to patch around.

/** Thrown when the master cannot be reached or served something unusable. Callers must treat
 *  this as "I could not reach the definition" — NEVER as "there is no definition". Those are
 *  different claims and collapsing them is how a cold cache becomes data loss on screen. */
export class PhotoTermUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoTermUnavailableError";
  }
}

/** The resolved photo predicate: every spelling to READ, and the one spelling to WRITE. */
export interface PhotoTerm {
  /** Every spelling a stored fact may legally carry, prefixed (`a:profilePhoto`) AND bare
   *  (`profilePhoto`) — a framed JSON-LD document compacts the prefix away, so a reader that
   *  knows only one of the two forms misses half the documents it is handed.
   *  INCLUDES retired spellings: deprecation retires the WRITE spelling, never the READ.
   *  Data written before a deprecation still carries the old spelling and is not rewritten. */
  readKeys: readonly string[];
  /** The ONE spelling this app may write, VERBATIM as the master serves it, prefix included
   *  (`a:profilePhoto`). This is the string that belongs in a stored fact key. */
  writeKey: string;
  /**
   * The same write spelling with its one leading prefix removed (`profilePhoto`).
   *
   * ⚠ NOT a convenience. Some host write helpers take a BARE slug and mint the `a:` themselves;
   * others take the key verbatim. Handing a prefixed key to a prefixing helper produces
   * `a:a:profilePhoto` — a manufactured key that names no term, written without complaint, and
   * invisible until another app fails to find the photo. Both forms are published here so a
   * caller picks the one its helper wants deliberately instead of guessing.
   * ⛔ Never send this bare form to a store that keeps body keys verbatim.
   */
  writeKeyBare: string;
  /** The term document's own address — carried so a claim about a photo can name where its
   *  spellings came from, rather than asserting them from memory. */
  termUrl: string;
}

/** Split a NAME predicate's multi-binding on `|`. Position carries NO meaning: the survivors
 *  are a SET, and a first-wins reader is wrong even when it happens to be right. */
function splitBinding(token: string): string[] {
  return token
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The retired spellings, normalised EXACTLY as the segments are.
 *  The two normalisations must move together: if one side split on `|` and the other did not,
 *  a term like `a:postalAddress|a:address` would fail to match its retired `a:address`, read as
 *  TWO current spellings, and throw on every save — a loud failure, but the wrong one. */
function deprecatedSet(raw: unknown): Set<string> {
  const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const out = new Set<string>();
  for (const v of list) {
    if (typeof v !== "string") continue;
    for (const seg of splitBinding(v)) out.add(seg);
  }
  return out;
}

/** Strip exactly ONE leading `a:` / `t:`. This is the one lawful READ-side reduction — a framed
 *  document compacts `a:profilePhoto` to `profilePhoto`. ⛔ Never apply it on the write leg:
 *  the store keeps the body key VERBATIM, so a reduced key reaches the store as a manufactured
 *  key that names no term. That exact mistake put 21 unresolvable keys on a live store. */
function bareForm(segment: string): string {
  return segment.replace(/^[at]:/, "");
}

/**
 * The single spelling this app may write — or a loud, deliberate failure.
 *
 * Survivors = segments MINUS the segments named in `a:deprecatedNotation`. Both throws below
 * are load-bearing and must not be softened into a fallback:
 *
 *  - ALL RETIRED -> writing any of them would hand the store a retired spelling, which is one
 *    rung worse than not writing at all.
 *  - SEVERAL CURRENT, NONE RETIRED -> a legitimate ontology shape (two real spellings, one
 *    meaning). Order carries no meaning, so this app has NO lawful basis to pick one. The
 *    remedy is an ontology adjudication naming the preferred write spelling; it is not this
 *    file's to invent by picking the first.
 */
function writeSpellingFrom(url: string, token: string, deprecatedRaw: unknown): string {
  const segments = splitBinding(token);
  if (segments.length === 0) {
    throw new PhotoTermUnavailableError(
      `${url} served an empty binding (${JSON.stringify(token)})`,
    );
  }
  const retired = deprecatedSet(deprecatedRaw);
  const survivors = segments.filter((s) => !retired.has(s));

  if (survivors.length === 0) {
    throw new PhotoTermUnavailableError(
      `${url} retired every spelling it offers (${JSON.stringify(token)} all named in ` +
        `a:deprecatedNotation) — no spelling is safe to write`,
    );
  }
  if (survivors.length > 1) {
    throw new PhotoTermUnavailableError(
      `${url} offers ${survivors.length} current spellings (${survivors.join(", ")}) and marks ` +
        `none retired — this app cannot choose a write spelling; GilbVeda must name one`,
    );
  }
  return survivors[0]!;
}

/** Build the read set from the served binding: every segment, in BOTH prefixed and bare form,
 *  retired ones included. Deduped, order-insensitive. */
export function readKeysFrom(token: string, deprecatedRaw: unknown): string[] {
  const segments = splitBinding(token);
  // Retired segments are READ. They are listed here deliberately: `deprecatedRaw` is consulted
  // ONLY by the write-spelling computation above.
  void deprecatedRaw;
  const out = new Set<string>();
  for (const seg of segments) {
    out.add(seg);
    out.add(bareForm(seg));
  }
  return [...out];
}

/** Shape of the host's fetch. Injected so this package binds to no app's HTTP stack. */
export type TermFetch = (url: string) => Promise<Response>;

export interface ResolvePhotoTermOptions {
  /** Set false to refuse the cold-start seed — used by tests that must prove the live read is
   *  what produced an answer, rather than the seed happening to agree with it. */
  useSeed?: boolean;
  /** Origin serving the GilbVeda master. Injected by the host; this unit names no host. */
  vedaOrigin: string;
  /** The term's slug on the master. Defaults to the profile-photo term's published slug.
   *  This is the term's own name in the ontology, not a key two apps agreed on. */
  slug?: string;
  fetchImpl?: TermFetch;
}

/**
 * Dereference the photo term and derive its read set and write spelling.
 *
 * The master served, for this term (measured 2026-09-16, control `a/zzqqnotaterm` -> 404):
 *   a:predicateAttribute = "a:profilePhoto|a:hasPhoto"
 *   a:deprecatedNotation = "a:hasPhoto"
 * => READ {a:profilePhoto, a:hasPhoto, profilePhoto, hasPhoto}; WRITE "a:profilePhoto".
 *
 * Those values are NOT baked in here. They are what this function returns TODAY because that is
 * what the master says today; when the master changes, this returns the new answer with no code
 * change, which is the entire reason it does a network read instead of holding a list.
 */
export async function resolvePhotoTerm(opts: ResolvePhotoTermOptions): Promise<PhotoTerm> {
  const slug = opts.slug ?? "profilePhoto";
  const termUrl = `${opts.vedaOrigin.replace(/\/+$/, "")}/base/a/${encodeURIComponent(slug)}`;
  const doFetch = opts.fetchImpl ?? ((u: string) => fetch(u));

  let res: Response;
  try {
    res = await doFetch(termUrl);
  } catch (cause) {
    throw new PhotoTermUnavailableError(`${termUrl} could not be reached: ${String(cause)}`);
  }
  if (!res.ok) {
    throw new PhotoTermUnavailableError(`${termUrl} answered ${res.status}`);
  }

  let doc: Record<string, unknown>;
  try {
    doc = (await res.json()) as Record<string, unknown>;
  } catch (cause) {
    throw new PhotoTermUnavailableError(`${termUrl} served unparseable JSON: ${String(cause)}`);
  }

  const token = doc["a:predicateAttribute"];
  if (typeof token !== "string" || !token.trim()) {
    throw new PhotoTermUnavailableError(
      `${termUrl} carries no a:predicateAttribute — it names no spelling this app could read or write`,
    );
  }
  const deprecated = doc["a:deprecatedNotation"];

  const writeKey = writeSpellingFrom(termUrl, token, deprecated);
  return {
    readKeys: readKeysFrom(token, deprecated),
    writeKey,
    writeKeyBare: bareForm(writeKey),
    termUrl,
  };
}

// ── Caching ──────────────────────────────────────────────────────────────────────────────
//
// A term resolution is a network read, and a network read fails. What it must NEVER do is turn
// a failure into "this person has no photo" — "I could not reach the definition" is a claim
// about THIS REQUEST; "there is no photo" is a claim about the DATA. Collapsing them turns a
// cold cache into a face the holder's own data no longer shows.
//
// So: resolve once, keep the answer, and on a later failure keep serving the last answer that
// worked. Only a resolver that has NEVER succeeded fails, and it fails loudly rather than
// answering with a guess.

/** Where a last-known-good resolution is kept across reloads. `localStorage` satisfies it. */
export interface PhotoTermStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PhotoTermResolver {
  /** The resolved term. Resolves once; later calls reuse it. On a failed refresh, returns the
   *  last good answer and reports it stale rather than failing or guessing. */
  get(): Promise<PhotoTerm>;
  /** The resolved term if one is already in hand, else null. For synchronous paint paths that
   *  must not block — a null here means "not known yet", NEVER "no photo". */
  peek(): PhotoTerm | null;
}

/** The store key. Kept as the original package wrote it, so a cache an app already holds still warms. */
const STORE_KEY = "gilb-photo.term.v1";

/** The cold-start seed, built from the recorded reading of the master in `termSnapshot.ts`.
 *  Used ONLY when nothing better is in hand, and replaced by the first successful live read.
 *  It is a reading of ONE term, so it is used only when the resolver asks for that term's slug. */
function seedTerm(opts: ResolvePhotoTermOptions): PhotoTerm | null {
  const snap = PHOTO_TERM_SNAPSHOT;
  if ((opts.slug ?? "profilePhoto") !== snap.slug) return null;
  const termUrl = `${opts.vedaOrigin.replace(/\/+$/, "")}/base/a/${encodeURIComponent(snap.slug)}`;
  const writeKey = writeSpellingFrom(termUrl, snap.predicateAttribute, snap.deprecatedNotation);
  return {
    readKeys: readKeysFrom(snap.predicateAttribute, snap.deprecatedNotation),
    writeKey,
    writeKeyBare: bareForm(writeKey),
    termUrl,
  };
}

export function createPhotoTermResolver(
  opts: ResolvePhotoTermOptions & { store?: PhotoTermStore },
): PhotoTermResolver {
  let inFlight: Promise<PhotoTerm> | null = null;
  let settled: PhotoTerm | null = null;

  const readStore = (): PhotoTerm | null => {
    try {
      const raw = opts.store?.getItem(STORE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PhotoTerm;
      // A stored answer is only usable if it still carries the two things callers rely on.
      if (!Array.isArray(parsed.readKeys) || typeof parsed.writeKey !== "string") return null;
      if (!parsed.readKeys.length || !parsed.writeKey) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  // Precedence, worst case last: a live read (set below) beats a stored last-known-good, which
  // beats the dated seed. The seed exists so a cold or blocked master can never present itself
  // as "this person has no photo" — it is superseded the instant a real read lands.
  settled = readStore() ?? (opts.useSeed === false ? null : seedTerm(opts));

  return {
    peek: () => settled,
    get: () => {
      if (inFlight) return inFlight;
      inFlight = resolvePhotoTerm(opts)
        .then((term) => {
          settled = term;
          try {
            opts.store?.setItem(STORE_KEY, JSON.stringify(term));
          } catch {
            // A full or unavailable store costs us the cross-reload warm start, nothing more.
          }
          return term;
        })
        .catch((err: unknown) => {
          inFlight = null;
          // Last-known-good beats both failing and guessing.
          if (settled) return settled;
          throw err;
        });
      return inFlight;
    },
  };
}

/** Read the photo reference off a record's facts using a RESOLVED read set.
 *  Accepts both a plain string value and a `{"@id": ...}` reference node, because the master
 *  binds this term `inline-literal:text` while some stored rows carry the node shape. */
export function photoRefFromFacts(
  facts: Record<string, unknown>,
  term: Pick<PhotoTerm, "readKeys">,
): string | null {
  for (const key of term.readKeys) {
    const raw = facts[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (raw && typeof raw === "object" && "@id" in raw) {
      const id = (raw as { "@id": unknown })["@id"];
      if (typeof id === "string" && id.trim()) return id.trim();
    }
  }
  return null;
}
