/**
 * The two label catalogues, READ from the ontology master: `t:CircleLabel` (4 entries) and `t:RelationshipKind`
 * (12 entries), minted 2026-10-16. ⛔ No entry, label, order or
 * applicability is typed here. The only literals are the
 * terms' NAMES asked of the master, as `term-slots` asks for any term.
 *
 * HOW THE ENTRIES ARE FOUND (measured live 2026-10-16): the master has no "list the entries of a type" route (`/base/t/<T>/children` lists
 * is-a children, and an entry is an instance), so the entries are asked as a typed search, `GET /base/search?type=<T>&q=<word>` (anonymous,
 * CORS `*`). `q` is required and the search is by word, so the word is the first word of the type's OWN label ("Circle Label" → "circle",
 * "Relationship Kind" → "relationship"), which every entry carries in its text. The ids are then read one by one (about 500 bytes each).
 * The master serves an entry's `a:playableBy` as the entity id of the TYPE (`base:e/<id>`), so each is resolved once to the type's own
 * address (`typeUri` of that entity). Everything is kept for the session (30 minutes), as the type set is.
 *
 * ⚠ A catalogue that could not be read whole says so (`complete: false`): ⛔ never an empty list that reads as "no kinds".
 */
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { orderEntries, type LabelAxis, type KindEntry } from "@kaigilb/gilbplatformcode-contact-kind-model";

/** The catalogue type each axis ranges over: the term NAME asked of the master (`a/circleLabel` → `t/CircleLabel`). */
export const CATALOGUE_TYPE: Readonly<Record<LabelAxis, string>> = { circleLabel: "CircleLabel", relationshipKind: "RelationshipKind" };

export class CatalogueUnavailableError extends Error {
  constructor(axis: LabelAxis, why: string) {
    super(`The ${axis === "circleLabel" ? "circle label" : "relationship kind"} list could not be read from the master (${why}), so none is offered.`);
    this.name = "CatalogueUnavailableError";
  }
}

export interface Catalogue {
  /** The entries, each with its relation fields when the master's entry names them (`KindEntry`). */
  entries: KindEntry[];
  /** False when the master said its listing was not whole or an entry did not read: the entries are a floor. */
  complete: boolean;
}

export interface CatalogueDeps {
  fetchImpl?: typeof fetch;
}

function masterBase(): string {
  return `${termOrigin()}/base`;
}
/** How long the master's part is kept (as the stakeholder type set: 30 minutes). */
export const CATALOGUE_TTL_MS = 30 * 60_000;
const MAX_SEARCH_PAGES = 5;
const MAX_ANCESTRY = 12;

const catalogues = new Map<LabelAxis, { at: number; p: Promise<Catalogue> }>();
const typeOfEntity = new Map<string, Promise<string | null>>();
const ancestries = new Map<string, Promise<Set<string>>>();

const predicateCuries = new Map<string, Promise<string | null>>();

/**
 * The CURIE of the predicate a `kindPredicate` reference names, READ from the predicate's term entity on the master: its own
 * `a:typeAttribute` (`t:CustomerOf`), ⛔ never composed from the address or the entry's label. Kept for the session (a term's binding does not
 * change under a running app); a read that failed is not kept. `null` = the term did not read or names no single `t:` CURIE.
 */
export function readPredicateCurie(ref: string, fetchImpl: typeof fetch = (u, i) => fetch(u, i)): Promise<string | null> {
  let p = predicateCuries.get(ref);
  if (!p) {
    p = getJson(fetchImpl, entityAddress(ref))
      .then((d) => {
        const t = textOf(pickKey(d, "typeAttribute"));
        return t && /^t:[A-Za-z][A-Za-z0-9]*$/.test(t) ? t : null;
      })
      .catch(() => null);
    void p.then((t) => {
      if (t === null && predicateCuries.get(ref) === p) predicateCuries.delete(ref);
    });
    predicateCuries.set(ref, p);
  }
  return p;
}

/** Test seam — ⛔ never called by product code. */
export function __resetCatalogueCache(): void {
  predicateCuries.clear();
  catalogues.clear();
  typeOfEntity.clear();
  ancestries.clear();
  entryNames.clear();
}

/** One entry's NAME as a chip needs it: its words and its order, ⛔ not its applicability (that costs a type read per `a:playableBy`). */
export interface EntryName {
  label: string;
  order: number | null;
  /**
   * The entry's `a:kindPredicate` as served (a reference to the predicate's TERM entity, `base:e/<id>`), or null when the entry
   * names no predicate (a holder's own kind; the master's Competitor, Investor ...). Costs no extra read: it is on the same document.
   */
  predicate: string | null;
}

const entryNames = new Map<string, { at: number; p: Promise<EntryName | null> }>();

/**
 * The name of ONE catalogue entry, read BY ITS ADDRESS and kept 30 minutes (a failed read is not kept). A chip needs only this: a card with
 * three chips costs at most three small reads whatever the size of the lists (the chip of a holder's
 * own kind past the first fifty showed the raw address, and the first card of a session read every entry of both lists). `read` is the one
 * way to fetch the document (the master's address or the holder's own vault), supplied by the caller. `null` = the entry did not read or has no label.
 */
export function readEntryName(id: string, read: () => Promise<Record<string, unknown>>): Promise<EntryName | null> {
  const hit = entryNames.get(id);
  if (hit && Date.now() - hit.at < CATALOGUE_TTL_MS) return hit.p;
  const p = read()
    .then((doc) => {
      const label = textOf(pickKey(doc, "label"));
      if (!label) return null;
      const orderRaw = pickKey(doc, "labelOrder");
      const orderN = typeof orderRaw === "number" ? orderRaw : typeof orderRaw === "string" && orderRaw.trim() !== "" ? Number(orderRaw) : NaN;
      return { label, order: Number.isFinite(orderN) ? orderN : null, predicate: refsOf(pickKey(doc, "kindPredicate"))[0] ?? null };
    })
    .catch(() => null);
  entryNames.set(id, { at: Date.now(), p });
  void p.then((v) => {
    if (v === null && entryNames.get(id)?.p === p) entryNames.delete(id);
  });
  return p;
}

/** The master's entry, by its address (an absolute address on the master). */
export function readMasterEntryName(id: string, fetchImpl: typeof fetch = (u, i) => fetch(u, i)): Promise<EntryName | null> {
  return readEntryName(id, () => getJson(fetchImpl, id));
}

export async function getJson(fetchImpl: typeof fetch, url: string): Promise<Record<string, unknown>> {
  // `no-cache`: a read checks back with the master (as every master read of the package does).
  const res = await fetchImpl(url, { cache: "no-cache", headers: { accept: "application/ld+json, application/json" } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

const pickKey = (doc: Record<string, unknown>, bare: string): unknown => doc[`a:${bare}`] ?? doc[bare];

/** The references under a key, as served: one `{ "@id" }`, an array of them, or bare strings. */
function refsOf(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
  const out: string[] = [];
  for (const x of raw) {
    const id = typeof x === "string" ? x : x && typeof x === "object" && typeof (x as { "@id"?: unknown })["@id"] === "string" ? (x as { "@id": string })["@id"] : null;
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

function textOf(v: unknown): string | null {
  const raw = Array.isArray(v) ? v[0] : v;
  const s = raw && typeof raw === "object" && "@value" in (raw as object) ? (raw as { "@value": unknown })["@value"] : raw;
  return typeof s === "string" && s.trim() ? s.trim() : null;
}

/** `base:e/<id>` → the master's entity address; an absolute address is kept. */
function entityAddress(ref: string): string {
  return ref.startsWith("base:e/") ? `${masterBase()}/e/${ref.slice("base:e/".length)}` : ref;
}

/** The type address a `playableBy` reference names: the master's `typeUri` of that entity (read once), the reference itself when it already is one. */
function resolveTypeRef(fetchImpl: typeof fetch, ref: string): Promise<string | null> {
  if (/\/t\/[^/]+$/.test(ref)) return Promise.resolve(ref);
  let p = typeOfEntity.get(ref);
  if (!p) {
    p = getJson(fetchImpl, entityAddress(ref))
      .then((d) => {
        const t = textOf(d["typeUri"] ?? d["a:typeUri"]);
        return t ?? null;
      })
      .catch(() => null);
    void p.then((t) => {
      if (t === null) typeOfEntity.delete(ref); // not known: ask again next time
    });
    typeOfEntity.set(ref, p);
  }
  return p;
}

/** One catalogue entry as the master serves it → an entry. `null` when it carries no label. */
export async function entryFromDoc(
  fetchImpl: typeof fetch,
  axis: LabelAxis,
  id: string,
  doc: Record<string, unknown>,
  own: boolean,
): Promise<KindEntry | null> {
  const label = textOf(pickKey(doc, "label"));
  if (!label) return null;
  const orderRaw = pickKey(doc, "labelOrder");
  const orderN = typeof orderRaw === "number" ? orderRaw : typeof orderRaw === "string" && orderRaw.trim() !== "" ? Number(orderRaw) : NaN;
  const refs = refsOf(pickKey(doc, "playableBy"));
  const types = await Promise.all(refs.map((r) => resolveTypeRef(fetchImpl, r)));
  // An applicability that could not be resolved is kept as the reference it was: it matches no type, so the kind is not offered
  // by a failed read (⛔ never turned into "offered everywhere").
  const playableBy = types.map((t, i) => t ?? refs[i]!);
  const entry: KindEntry = { id, label, order: Number.isFinite(orderN) ? orderN : null, playableBy, axis, own };
  // Kind-as-relation: the relation the chip stands for (`a:kindPredicate`, its CURIE read from the predicate's own term), and the kinds of
  // vault it may be said toward (`a:kindForVault`). Both read from the master's entry, ⛔ none typed here. An unreadable predicate is `null`, which
  // offers nothing; an unreadable vault type is kept as the reference it was (it matches no type).
  const predRef = refsOf(pickKey(doc, "kindPredicate"))[0];
  if (predRef) {
    const curie = await readPredicateCurie(predRef, fetchImpl);
    entry.kindPredicate = curie ? { curie } : null;
  }
  const vaultRefs = refsOf(pickKey(doc, "kindForVault"));
  if (vaultRefs.length > 0) {
    const vt = await Promise.all(vaultRefs.map((r) => resolveTypeRef(fetchImpl, r)));
    entry.kindForVault = vt.map((t, i) => t ?? vaultRefs[i]!);
  }
  return entry;
}

async function readCatalogue(axis: LabelAxis, fetchImpl: typeof fetch): Promise<Catalogue> {
  const type = CATALOGUE_TYPE[axis];
  // The search word is the first word of the type's own name (`CircleLabel` → "circle", `RelationshipKind` → "relationship"), which every entry
  // carries in its text. It used to be read from the type's document first: one request saved per list.
  const word = (type.match(/[A-Z][a-z0-9]*/g)?.[0] ?? type).toLowerCase();
  const ids: string[] = [];
  let complete = true;
  let cursor: string | null = null;
  for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
    const params = new URLSearchParams({ type, q: word, vault: masterBase() });
    if (cursor) params.set("cursor", cursor);
    let body: Record<string, unknown>;
    try {
      body = await getJson(fetchImpl, `${masterBase()}/search?${params.toString()}`);
    } catch (e) {
      throw new CatalogueUnavailableError(axis, e instanceof Error ? e.message : String(e));
    }
    for (const id of Array.isArray(body["ids"]) ? (body["ids"] as unknown[]) : []) if (typeof id === "string" && !ids.includes(id)) ids.push(id);
    const next = typeof body["next"] === "string" && body["next"] ? (body["next"] as string) : null;
    if (!next) {
      if (body["complete"] === false) complete = false;
      break;
    }
    cursor = next;
    if (page === MAX_SEARCH_PAGES - 1) complete = false;
  }
  const read = await Promise.all(
    ids.map(async (id) => {
      try {
        return await entryFromDoc(fetchImpl, axis, id, await getJson(fetchImpl, id), false);
      } catch {
        complete = false;
        return null;
      }
    }),
  );
  return { entries: orderEntries(read.filter((e): e is KindEntry => e !== null)) as KindEntry[], complete };
}

/** The master's entries of one axis, ordered by `a:labelOrder`. Kept for the session; a failed read is not kept. */
export function readMasterCatalogue(axis: LabelAxis, deps: CatalogueDeps = {}): Promise<Catalogue> {
  const hit = catalogues.get(axis);
  if (hit && Date.now() - hit.at < CATALOGUE_TTL_MS) return hit.p;
  const p = readCatalogue(axis, deps.fetchImpl ?? ((u, i) => fetch(u, i)));
  catalogues.set(axis, { at: Date.now(), p });
  p.catch(() => {
    if (catalogues.get(axis)?.p === p) catalogues.delete(axis);
  });
  return p;
}

/** The type and every type above it by is-a (`a:subTypeOf`), read from the master; the type alone when it did not answer. */
export function typeAncestry(typeIri: string, deps: CatalogueDeps = {}): Promise<Set<string>> {
  const hit = ancestries.get(typeIri);
  if (hit) return hit;
  const fetchImpl: typeof fetch = deps.fetchImpl ?? ((u, i) => fetch(u, i));
  const p = (async () => {
    const out = new Set<string>([typeIri]);
    let at = typeIri;
    for (let i = 0; i < MAX_ANCESTRY; i++) {
      let up: string | undefined;
      try {
        up = refsOf(pickKey(await getJson(fetchImpl, at), "subTypeOf"))[0];
      } catch {
        ancestries.delete(typeIri); // a read that failed is not kept: ask again next time
        break;
      }
      if (!up || out.has(up)) break;
      out.add(up);
      at = up;
    }
    return out;
  })();
  ancestries.set(typeIri, p);
  return p;
}
