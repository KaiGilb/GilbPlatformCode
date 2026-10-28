// Where term documents come from. The readers use only this interface, so a test hands them served documents and an app hands
// them the live master.

import { MasterTimeoutError, VocabularyUnavailableError, type TermDoc, type TermFetch } from "./terms";
import { checkedBound, withDeadline } from "./deadline";

/** One entry of `GET /base/t/<Type>/children`, as the master serves it. */
export interface ChildEntry {
  term: string;
  name?: string;
  label?: string;
}

/** A children page. `complete: false` means the master did not list every child. */
export interface ChildrenPage {
  children: ChildEntry[];
  complete: boolean;
}

/** The term documents that carry a given predicate, and whether the list is known complete. */
export interface CarrierList {
  terms: TermDoc[];
  complete: boolean;
  /** Where completeness was lost, stated rather than dropped. */
  incompleteAt: string[];
  /** How the list was read. `selector`: the master narrowed it (`?status=all&carries=<name>`), and
   *  every page said so on its face. `whole-walk`: the whole `?status=all` listing was walked and
   *  filtered here. Absent from a source that does not say. */
  read?: "selector" | "whole-walk";
}

/**
 * The master did not narrow a carrier read: the answer to `?status=all&carries=<name>` came back
 * without `carries` and `carriesSpellings` on its face, which is what a master without the
 * selector sends (it ignores a query key it does not know and serves the whole listing).
 *
 * It is a `VocabularyUnavailableError`: the field set is NOT KNOWN YET. ⛔ It never means "no
 * fields". A page-load path stops here rather than walk the whole listing (about 237 MB on
 * 2026-09-30). An agent or a command-line run that can afford the walk asks for it with
 * `masterSource({ carriers: "walk" })`.
 */
export class CarrierSelectorMissingError extends VocabularyUnavailableError {
  readonly url: string;
  constructor(url: string, why: string) {
    super(
      `not known yet: ${url} ${why}, so this master did not narrow the carrier read. ` +
        `A page-load path does not walk the whole listing; an agent or a command-line run may ask for it with carriers: "walk"`,
    );
    this.name = "CarrierSelectorMissingError";
    this.url = url;
  }
}

export interface VocabularySource {
  /** The address of a term on this master: `termIri("t/Stakeholder")`. */
  termIri(path: string): string;
  /** Dereference a term by its IRI. Throws `VocabularyUnavailableError` on anything but a document. */
  term(iri: string, signal?: AbortSignal): Promise<TermDoc>;
  /** Dereference several terms at once: one promise per IRI, in order, each settling as `term`
   *  would. Optional; a resolver without it reads one term at a time. */
  terms?(iris: readonly string[], signal?: AbortSignal): Promise<TermDoc>[];
  /** The direct is-a children of a type (one reverse hop). */
  children(typeIri: string, signal?: AbortSignal): Promise<ChildrenPage>;
  /** Every term document that carries a fact under any key of `readKeys`. */
  carriersOf(readKeys: readonly string[], signal?: AbortSignal): Promise<CarrierList>;
  // `signal`: the reading's or the write call's. When it aborts, a request of the read still in flight is aborted
  // and none is sent after. A source that ignores it is still bounded: the readers race its reads (`boundSource`).
}

/**
 * How long one master request may take before it is aborted and read as "not known yet": 10 s.
 *
 * Why 10 s. On the live master (2026-10-19) a whole cold kind read was 22 requests in 1,199 ms, and the card's heaviest path 37
 * requests in 3,231 ms; the largest single answers (a named read, `t/Person` with its thousands of refs) are about 1 MB. A
 * request still silent after 10 s, about 8 times a whole cold reading, is a master that is down for the person waiting, and
 * 10 s is still short enough that the list says "not known yet" before the person gives up on the page.
 */
export const MASTER_REQUEST_TIMEOUT_MS = 10_000;

/**
 * How long one whole reading may take (a kind set, a type tree, or one write call's live reads), however many rounds it needs:
 * 20 s. A reading is several rounds one after another (the role, then the
 * players, then one round per is-a level), so the request bound alone would let a slow master hold a reading for minutes.
 *
 * What 20 s lets finish (the recorded live answers, every answer equally slow):
 * - a cold kind reading is 4 rounds, so it finishes only when each round answers in about 5 s or less (4,990 ms a round
 *   finishes at 19,960 ms; 5,010 ms is cut at 20,000 ms);
 * - one write call's reads are 6 rounds, so it finishes only when each round answers in about 3.3 s or less (3,330 ms is
 *   written; 3,340 ms is not).
 * A master slower than that, even one whose every answer comes inside the 10 s request bound, is cut at the cap: display
 * answers the set in hand or kept ("not known yet" with none), and a write call is "not known yet" with nothing sent.
 *
 * Why 20 s anyway: a master that slow is down for the person waiting. Live (2026-10-19) a whole cold kind reading was 22
 * requests in 1,199 ms. What is in flight at the cap is aborted, and no request is sent after it.
 */
export const MASTER_READ_CAP_MS = 20_000;

export interface MasterSourceOptions {
  /** Origin serving the GilbVeda master, e.g. `https://ontology.example.test`. */
  vedaOrigin: string;
  /** The host's fetch. It is called with `{ cache: "no-cache" }` on every read and must pass that
   *  on: the master answers `cache-control: public, max-age=3600`, and a browser fetch in the
   *  default mode would answer a reload inside the hour from its own cache, so a field added on
   *  the master would not show. `no-cache` makes the browser check back each time (a 304 when
   *  nothing changed, so the check is small). */
  fetchImpl?: TermFetch;
  /** How `carriersOf` reads. `selector` (the default, for a page load): one narrowed request,
   *  `?status=all&carries=<name>`; an answer that was not narrowed is refused with
   *  `CarrierSelectorMissingError` ("not known yet"), ⛔ never walked. `walk`: the whole
   *  `?status=all` listing, filtered here: fit for an agent, a command-line run or a measurement. */
  carriers?: "selector" | "walk";
  /** Page size for the narrowed carrier read. One page holds every carrier while there are no
   *  more than this many; past it the read follows `next`. Kept small because a master without the
   *  selector answers this request with this many nodes of the WHOLE listing before the refusal
   *  can be read. */
  carrierPageSize?: number;
  /** Page size for the listing walk. The master refuses a size over its cap (2000 when read). */
  pageSize?: number;
  /** A ceiling on listing pages, so a server that never says `complete` cannot loop forever.
   *  Reaching it is reported as incompleteness, ⛔ never as the end of the list. */
  maxPages?: number;
  /** The bound on each request, in ms: past it the request is aborted and rejects `MasterTimeoutError`
   *  ("not known yet"). Default `MASTER_REQUEST_TIMEOUT_MS`. A finite number above 0, at most 2,147,483,647: anything else (0, a negative
   *  number, NaN, Infinity, a number above setTimeout's limit) is refused with a RangeError when the source is made, ⛔ never read as "no bound". */
  timeoutMs?: number;
}

/** The most type names one named read may carry: GilbPlatform's `MAX_TYPES`
 *  (`src/read/type-name-selector.ts`, 100 at `eda13db1`). Past it the door refuses the whole call. */
export const NAMED_READ_MAX = 100;

/** A type's bare name, as the named read takes it (GilbPlatform `TYPE_NAME`). */
const NAMED_TYPE = /^\/base\/t\/([A-Za-z0-9_-]{1,64})$/;

/** The request init every master read is sent with: check back, never answer from a cache. A
 *  fresh object per call, so a host fetch that writes onto the init it is handed changes nothing
 *  another read sends. */
const checkBack = (): RequestInit => ({ cache: "no-cache" });

/**
 * The live master.
 *
 * Every IRI the master serves is an identity (`https://ontology.example.test/base/t/…`). It is fetched
 * from `vedaOrigin` with the same path, so a local rig serving the same vocabulary answers the
 * same question.
 *
 * `carriersOf` asks the master's predicate-carrier selector in one request (
 * the selector is the platform's: `GET /base/vocab?status=all&
 * carries=<CURIE>`). The name asked is the predicate's first served spelling, `readKeys[0]`, which
 * is a segment of its own `a:predicateAttribute` (`spellingFromBinding` puts the segments first).
 * The answer is trusted as narrowed only when EVERY page repeats `carries` as asked and carries a
 * `carriesSpellings` list. A master without the selector ignores the key and serves the whole
 * listing; that answer is refused (`CarrierSelectorMissingError`), ⛔ never walked on a page load.
 * The package still keeps only the nodes that carry a fact under one of `readKeys`.
 *
 * ⚠ What the selector matches is the master's set of stored spellings (`carriesSpellings`: each
 *   binding segment, each retired one, the full IRI). A fact stored under a key outside that set
 *   (a bare `fieldOf`, say) is found by the whole walk and not by the selector. On 2026-10-01 the
 *   two agreed on production, 20 = 20.
 *
 * `carriers: "walk"` walks the whole `?status=all` listing instead. On 2026-09-30 that was about
 * 17,250 term nodes and 236,926,794 bytes. Complete but heavy: for an agent, a command-line run or
 * a measurement, ⛔ not for a page load.
 *
 * `terms` reads several type terms in one request through the opt-in listing's named read,
 * `GET /base/vocab?status=all&type=<Name>&type=<Name>…` (the platform's opt-in listing; at most
 * `NAMED_READ_MAX` names a request), which serves each term as the same projection the
 * per-term route serves (on a copy of the production vocabulary, 25 terms in
 * 44 ms against 2,296 ms read one at a time, the facts this package reads equal for every one).
 * Each node is matched to the IRI asked by its `/base/t/<Name>` path. An IRI of another form, or
 * one the answer does not carry (named in `absent`, or a door that ignored `type`), is read on its
 * own through `term`, so it fails or succeeds exactly as `term` would.
 *
 * Every request is sent with `cache: "no-cache"`, so a reload checks back with the master, and
 * with a signal: it is aborted, and rejects `MasterTimeoutError` ("not known yet"), when it has not
 * answered within `timeoutMs` (default `MASTER_REQUEST_TIMEOUT_MS`), or when the reading it belongs
 * to is stopped (the `signal` each read takes).
 *
 * @throws RangeError when `timeoutMs` is given and is not a finite number above 0, at most 2,147,483,647
 */
export function masterSource(opts: MasterSourceOptions): VocabularySource {
  const timeoutMs = checkedBound("timeoutMs", opts.timeoutMs, MASTER_REQUEST_TIMEOUT_MS);
  const origin = opts.vedaOrigin.replace(/\/+$/, "");
  const doFetch: TermFetch = opts.fetchImpl ?? ((u: string, init?: RequestInit) => fetch(u, init));
  const pageSize = opts.pageSize ?? 2000;
  const carrierPageSize = opts.carrierPageSize ?? 100;
  const maxPages = opts.maxPages ?? 200;
  const mode = opts.carriers ?? "selector";

  // An absolute IRI keeps its path and query; a relative one (a server may hand back
  // `next` as `/base/vocab?…`) is read against the origin. Either way the request goes to the
  // origin. Something that is not an address at all is a VocabularyUnavailableError, like every
  // other way this source can fail to read, ⛔ never a raw TypeError.
  const locate = (iri: string): string => {
    let u: URL;
    try {
      u = new URL(iri, `${origin}/`);
    } catch (cause) {
      throw new VocabularyUnavailableError(`${JSON.stringify(iri)} is not an address: ${String(cause)}`);
    }
    return `${origin}${u.pathname}${u.search}`;
  };

  // Every request is bounded: the answer AND its body must come within `timeoutMs`, or the request is aborted
  // and read as "not known yet". The reading's signal stops it too, and a request asked for after that is not sent.
  const getJson = (url: string, stop?: AbortSignal): Promise<Record<string, unknown>> =>
    withDeadline(
      async (signal) => {
        let res: Response;
        try {
          // Check back with the master on every read: never a stale answer from an HTTP cache.
          res = await doFetch(url, { ...checkBack(), signal });
        } catch (cause) {
          throw new VocabularyUnavailableError(`${url} could not be reached: ${String(cause)}`);
        }
        if (!res.ok) throw new VocabularyUnavailableError(`${url} answered ${res.status}`);
        try {
          return (await res.json()) as Record<string, unknown>;
        } catch (cause) {
          throw new VocabularyUnavailableError(`${url} served unparseable JSON: ${String(cause)}`);
        }
      },
      {
        ms: timeoutMs,
        parents: stop ? [stop] : [],
        timeoutError: () => new MasterTimeoutError(`not known yet: ${url} gave no answer in ${timeoutMs} ms`, timeoutMs),
        abortError: () => new MasterTimeoutError(`not known yet: ${url} was stopped, its reading ran out of time`, timeoutMs),
      },
    );

  return {
    termIri: (path) => `${origin}/base/${path.replace(/^\/+/, "")}`,

    term: async (iri, signal) => getJson(locate(iri), signal),

    terms(iris, signal) {
      // async, so an IRI that is not an address rejects this term, ⛔ never throws out of the batch.
      const one = async (iri: string): Promise<TermDoc> => getJson(locate(iri), signal);
      const nameOf = (iri: string): string | null => {
        let path: string;
        try {
          path = new URL(locate(iri)).pathname;
        } catch {
          return null;
        }
        return NAMED_TYPE.exec(path)?.[1] ?? null;
      };
      const named = [...new Set(iris.map(nameOf).filter((n): n is string => n !== null))];
      // One request per chunk of names. Each node is kept under its own /base/t/<Name> path,
      // with the page's @context lent to it, as a listing page's nodes are.
      const chunks: Promise<Map<string, TermDoc> | MasterTimeoutError>[] = [];
      const chunkOf = new Map<string, number>();
      for (let at = 0; at < named.length; at += NAMED_READ_MAX) {
        const names = named.slice(at, at + NAMED_READ_MAX);
        names.forEach((n) => chunkOf.set(n, chunks.length));
        const url = `${origin}/base/vocab?status=all&${names.map((n) => `type=${encodeURIComponent(n)}`).join("&")}`;
        chunks.push(
          getJson(url, signal).then((page) => {
            const found = new Map<string, TermDoc>();
            const graph = page["@graph"];
            if (!Array.isArray(graph)) return found;
            for (const node of graph) {
              if (!node || typeof node !== "object" || typeof (node as TermDoc)["@id"] !== "string") continue;
              const n = nameOf((node as TermDoc)["@id"] as string);
              if (n === null || found.has(n)) continue;
              const doc = node as TermDoc;
              found.set(n, page["@context"] && !doc["@context"] ? { ...doc, "@context": page["@context"] } : doc);
            }
            return found;
          }, (cause: unknown) => {
            // A named read that ran out of time: every term in it is "not known yet" with that same error. ⛔ Not read one by one:
            // that would turn one silent request into one per term on a master that is already not answering.
            if (cause instanceof MasterTimeoutError) return cause;
            return new Map<string, TermDoc>(); // a refused or failed named read: each term is read on its own
          }),
        );
      }
      return iris.map((iri) => {
        const n = nameOf(iri);
        if (n === null) return one(iri);
        return chunks[chunkOf.get(n)!]!.then((found) => {
          if (found instanceof MasterTimeoutError) throw found;
          return found.get(n) ?? one(iri);
        });
      });
    },

    children: async (typeIri, signal) => {
      const url = `${locate(typeIri).replace(/\/+$/, "")}/children`;
      const doc = await getJson(url, signal);
      const raw = doc["children"];
      if (!Array.isArray(raw)) throw new VocabularyUnavailableError(`${url} served no children list`);
      const children: ChildEntry[] = [];
      for (const c of raw) {
        if (c && typeof c === "object" && typeof (c as ChildEntry).term === "string") {
          const e = c as ChildEntry;
          children.push({ term: e.term, name: e.name, label: e.label });
        }
      }
      // Only an explicit `true` is complete. An absent flag is not evidence the list is whole.
      return { children, complete: doc["complete"] === true };
    },

    carriersOf: async (readKeys, signal) => {
      const terms: TermDoc[] = [];
      const incompleteAt: string[] = [];
      const name = readKeys[0];
      if (mode === "selector" && !name) throw new VocabularyUnavailableError("carriersOf was given no spelling to ask the master for");
      let url: string | null =
        mode === "selector"
          ? `${origin}/base/vocab?status=all&carries=${encodeURIComponent(name!)}&limit=${carrierPageSize}`
          : `${origin}/base/vocab?status=all&limit=${pageSize}`;
      let pages = 0;
      let complete = false;
      while (url) {
        if (pages >= maxPages) {
          incompleteAt.push(`stopped after ${maxPages} pages at ${url}`);
          break;
        }
        const page = await getJson(url, signal);
        pages += 1;
        if (mode === "selector") {
          // Narrowed only if this page says so. Checked on EVERY page, before its nodes are kept.
          if (page["carries"] !== name)
            throw new CarrierSelectorMissingError(
              url,
              page["carries"] === undefined ? "answered without `carries` on its face" : `answered carries=${JSON.stringify(page["carries"])}, not ${JSON.stringify(name)}`,
            );
          if (!Array.isArray(page["carriesSpellings"])) throw new CarrierSelectorMissingError(url, "answered without a `carriesSpellings` list");
        }
        const graph = page["@graph"];
        if (!Array.isArray(graph)) throw new VocabularyUnavailableError(`${url} served no @graph`);
        for (const node of graph) {
          if (!node || typeof node !== "object") continue;
          const doc = node as TermDoc;
          if (readKeys.some((k) => doc[k] !== undefined && doc[k] !== null)) {
            // A page node carries no @context of its own; lend it the page's, so a CURIE value
            // is expanded by the document that served it.
            terms.push(page["@context"] && !doc["@context"] ? { ...doc, "@context": page["@context"] } : doc);
          }
        }
        if (page["complete"] === true) {
          complete = true;
          break;
        }
        const next = page["next"];
        if (typeof next !== "string" || !next) {
          incompleteAt.push(`${url} said complete=false and gave no next page`);
          break;
        }
        url = locate(next);
      }
      return {
        terms,
        complete: complete && incompleteAt.length === 0,
        incompleteAt,
        read: mode === "selector" ? "selector" : "whole-walk",
      };
    },
  };
}
