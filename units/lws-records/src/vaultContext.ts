/**
 * 🔴 THE VAULT'S OWN `@context`, READ RATHER THAN RE-DECLARED.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────────────────────
 * Base's `@context` does not only PREFIX. It also **RENAMES**. Measured on the live master
 * 2026-09-03 (`GET https://ontology.example.test/base/context.jsonld` → HTTP 200) and in Base's own
 * `src/jsonld/context.ts` `buildContext`:
 *
 *     stored `a:viewShows`   → served wire key `shows`
 *     stored `a:viewTarget`  → served wire key `target`
 *     stored `role:solution` → served wire key `solution`
 *     stored `a:functionOf`  → served wire key `functions`
 *
 * Those wire keys never carried an `a:` to strip, so a caller that re-prefixes every bare served
 * key mints `a:shows` / `a:solution` / `a:functions` — spellings that name **no term at all**.
 * That is the same MANUFACTURE class as the `a:owl:sameAs` double-prefix `S29` repaired, on a
 * second mechanism. ⛔ The repair is to INVERT the rename — ⛔ never to mint the manufactured key.
 *
 * ── WHY THE MAP IS FETCHED AND ⛔ NOT HARDCODED ────────────────────────────────────────────────
 * [[Rule_Code_base-vault-native-derivation#RuleBasepodNoNewEnumeration]] cl.3 — *"A selector reads
 * the vocabulary module or the live term — it does ⛔ not carry its own copy of the set."* A
 * hardcoded alias table in this repo would be a second copy of Base's `buildContext`, would drift
 * the day Base adds a term, and would be exactly the duplicate-enumeration defect that rule
 * exists to stop. The served document names its own `@context` URL; this reads that URL.
 * [[Rule_Code_base-vault-native-data#RuleBasepodSelfDescribes]] — the vault describes itself.
 *
 * ── ⚠ THE `@set` ARM, AND THE MEASUREMENT BEHIND IT ───────────────────────────────────────────
 * A term declaring `"@container": "@set"` is a bucket the vault **ASSEMBLES AT READ TIME**; it is
 * ⛔ never a stored fact. Verified in Base's own source at `origin/main` `98a8dd4`:
 *   · `src/fv-vocab.ts` — `child` / `functionOf` / `valueOf` / `resourceOf` each carry the words
 *     *"wire-only … synthesised"* / *"never stored"* in their own doc comments.
 *   · `src/jsonld/frame.ts:267,273,276` — `valueEstimations` / `constraints` / `stakeholders`
 *     are `pushSet(...)` onto a node during `attachTypedEdges`, and `grep` over `src/write/` and
 *     `src/lws/` finds **0** writes of those keys.
 * ⇒ inverting such a key to its `@id` would STORE A READ-TIME SYNTHESIS as a fact — a
 * fabrication, and strictly worse than the refusal it replaces. So a `@set` term is reported as
 * NOT app-addressable and its key is carried VERBATIM (fail-closed at the term-admission guard),
 * ⛔ never re-prefixed and ⛔ never expanded into its bucket's `@id`.
 *
 * ⚠ The `@set` ⇒ assembled inference is an inference about Base's serve contract, ⛔ not something
 * the `@context` declares. If Base ever ships a STORED `@set` term, this errs toward a refusal
 * (the guard says no) rather than toward a fabricated fact. That direction is deliberate.
 *
 * ── ⚠ WHAT THIS DOES NOT SOLVE, STATED RATHER THAN IMPLIED ────────────────────────────────────
 * A key stored BARE (`c_geometry`, 51,225 live rows on M1) and a key stored `a:`-prefixed
 * (`a:label`) compact to the SAME wire key, because `@vocab` and the `a:` prefix expand to the
 * same IRI. The `@context` therefore cannot tell them apart, and neither can this file. Which of
 * the two spellings a term is BOUND under is an ontology question; it is routed, ⛔ not guessed.
 */

import { atVaultOrigin, vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { isAppAddressableSlug } from "@kaigilb/gilbplatformcode-record-types";

/** One declared term of a vault's `@context`. */
export interface VaultContextTerm {
  /** The stored attribute key the vault compacted FROM — the term's `@id`, verbatim. */
  readonly id: string;
  /**
   * True when the term declares `"@container": "@set"` ⇒ the vault ASSEMBLES this bucket at read
   * time and it names no stored fact. See the `@set` arm above.
   */
  readonly assembled: boolean;
  /**
   * True when the term declares `"@type": "@id"` ⇒ its served value is a REFERENCE, compacted to a
   * bare string CURIE (`"base:e/…"`) rather than `{"@id": …}`. Readers expand it; additive, so
   * existing callers are unaffected (`fvParent` refs read as unexpanded strings).
   */
  readonly idValued?: boolean;
}

/** wire key → the term the vault declares for it. */
export type VaultContextTerms = ReadonlyMap<string, VaultContextTerm>;

/** Keys that are JSON-LD keywords rather than declared terms. */
const KEYWORD = /^@/;

/**
 * Parse a served `@context` document into its term map.
 *
 * Accepts either the served wrapper (`{"@context": {...}}`) or a bare context object. Plain
 * string values are PREFIXES (`"a": "https://…/a/"`), ⛔ not terms — they are skipped, because a
 * prefix is applied by expansion and needs no inversion table.
 *
 * @param doc the parsed JSON of `<vault>/base/context.jsonld`
 * @returns the wire-key → term map; empty when the document declares no terms
 */
export function parseVaultContext(doc: unknown): VaultContextTerms {
  const out = new Map<string, VaultContextTerm>();
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return out;
  const outer = doc as Record<string, unknown>;
  const ctxRaw = outer["@context"] ?? outer;
  if (!ctxRaw || typeof ctxRaw !== "object" || Array.isArray(ctxRaw)) return out;
  for (const [key, def] of Object.entries(ctxRaw as Record<string, unknown>)) {
    if (KEYWORD.test(key)) continue;
    // A bare string value is a PREFIX declaration, not a term rename.
    if (typeof def === "string") continue;
    if (!def || typeof def !== "object" || Array.isArray(def)) continue;
    const d = def as Record<string, unknown>;
    const id = d["@id"];
    if (typeof id !== "string" || !id) continue;
    out.set(key, { id, assembled: d["@container"] === "@set", idValued: d["@type"] === "@id" });
  }
  return out;
}

/**
 * 🔴 ONE read of a context document gives its terms AND its prefixes.
 *
 * `answered` is false when the document could not be read (an error status, no answer within
 * {@link VAULT_CONTEXT_READ_MS}, a body that is not JSON). A caller that needs a term's type to
 * write honestly must then refuse, ⛔ not treat the empty map as "no term is typed".
 */
export interface VaultContextRead {
  readonly terms: VaultContextTerms;
  readonly prefixes: ReadonlyMap<string, string>;
  readonly answered: boolean;
}

/** How long a context read may take before it counts as not answered. A write waits on it, and
 *  a host that does not answer must not hold the write open (VAScaling B1: no limit at 6f2764a). */
export const VAULT_CONTEXT_READ_MS = 5_000;

/** How long a read that was NOT answered is kept before the next write asks again. An answer,
 *  empty or not, is kept for the session (a context is immutable per vault revision). */
export const VAULT_CONTEXT_RETRY_MS = 60_000;

const NOT_ANSWERED: VaultContextRead = { terms: new Map(), prefixes: new Map(), answered: false };

/** Reads by URL: in flight, answered (kept), or not answered (kept until `retryAt`). */
const reads = new Map<string, { read: Promise<VaultContextRead>; retryAt: number }>();

/**
 * Read a context document once, with a time limit, and keep the result — the empty and the failed
 * result included (a failure for {@link VAULT_CONTEXT_RETRY_MS}). Concurrent callers share one
 * request. ⛔ It does not throw.
 *
 * @param url the absolute URL of the context document
 */
export function readVaultContext(url: string): Promise<VaultContextRead> {
  const hit = reads.get(url);
  if (hit && Date.now() < hit.retryAt) return hit.read;
  const entry = { read: fetchContext(url), retryAt: Number.POSITIVE_INFINITY };
  reads.set(url, entry);
  void entry.read.then((r) => {
    if (!r.answered) entry.retryAt = Date.now() + VAULT_CONTEXT_RETRY_MS;
  });
  return entry.read;
}

async function fetchContext(url: string): Promise<VaultContextRead> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<VaultContextRead>((resolve) => {
    timer = setTimeout(() => {
      ctl.abort();
      resolve(NOT_ANSWERED);
    }, VAULT_CONTEXT_READ_MS);
  });
  const read = (async (): Promise<VaultContextRead> => {
    const res = await fetch(url, { headers: { accept: "application/ld+json, application/json" }, signal: ctl.signal });
    if (!res.ok) return NOT_ANSWERED;
    const doc: unknown = await res.json();
    return { terms: parseVaultContext(doc), prefixes: parseVaultPrefixes(doc), answered: true };
  })().catch(() => NOT_ANSWERED);
  try {
    return await Promise.race([read, limit]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Load a vault's `@context` term map from a context URL.
 *
 * ⚠ BEST EFFORT, and the caller must treat it so. A vault that does not serve its context, or a
 * network that will not reach it, yields an EMPTY map — under which the inversion behaves exactly
 * as it did before this repair. ⛔ It does not throw, because a save must not fail on a document
 * the caller already holds. One bounded, kept read ({@link readVaultContext}).
 *
 * @param ref the `@context` value off a framed document — a URL string, or anything else
 * @returns the term map; empty when `ref` is not a URL or the read fails
 */
export async function loadVaultContext(ref: unknown): Promise<VaultContextTerms> {
  if (typeof ref !== "string" || !/^https?:\/\//.test(ref)) return new Map();
  return (await readVaultContext(ref)).terms;
}

/**
 * The PREFIXES a `@context` declares (`"base": "https://<host>/base/"`), the
 * plain-string entries {@link parseVaultContext} skips.
 *
 * @param doc a parsed context document, or a bare context object
 * @returns prefix → namespace IRI; empty when the document declares none
 */
export function parseVaultPrefixes(doc: unknown): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return out;
  const outer = doc as Record<string, unknown>;
  const ctxRaw = outer["@context"] ?? outer;
  if (!ctxRaw || typeof ctxRaw !== "object" || Array.isArray(ctxRaw)) return out;
  for (const [key, def] of Object.entries(ctxRaw as Record<string, unknown>)) {
    if (KEYWORD.test(key)) continue;
    if (typeof def === "string" && /^https?:\/\//.test(def)) out.set(key, def);
  }
  return out;
}

/** Test seam: drop the memoised contexts — and the memoised datom logs with them, so ONE reset
 *  isolates a case from every network reading this module holds. */
export function resetVaultContextCache(): void {
  reads.clear();
  resetStoredSpellingCache();
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 🔴 THE STORED SPELLING COMES FROM THE VAULT'S OWN DATOM LOG.
//
// ── WHAT `S33` SHIPPED, AND WHY IT NEVER FIRED ────────────────────────────────────────────────
// `S33` asked the ontology master `GET <master>/base/a/<slug>` and read `404` as *"the master
// binds no `a:<slug>`"*. A positive control taken from the vault's own `@context` was supposed to
// prove the route could say `bound` as well as `unbound`.
// §3 drove the shipped code against the live vault and measured the arm's population effect:
//
//     368 bound · 32 unknown · ZERO unbound, over 418 wire keys — the arm fired on NONE of them.
//
// The control is the first un-renamed `a:` term of the served `@context`, which on every vault is
// `type → a:type`; `GET https://platform.example.test/base/a/type` is 404, so every `unbound` in every batch
// was downgraded to `unknown` and the app fell back to `a:` + slug. That reading was re-derived
// here, ⛔ not adopted (§7 of the artefact below).
//
// ── ⛔ AND REPAIRING THE CONTROL WOULD HAVE BEEN WORSE THAN THE DEFECT ─────────────────────────
// Of the 32 slugs the master 404s, exactly ONE (`c_geometry`) is bound BARE. NINETEEN are bound
// under `a:` — twelve of them holding live rows on `base` — so a control that merely worked would
// have flipped twelve live-reachable keys to a spelling the door REFUSES.
//
// 🔴 THE CAUSE IS STRUCTURAL, ⛔ NOT A BUG IN THE CONTROL, and it is readable in Base's own
// source. `src/vocab/term-reader.ts` `findTermByAttributeSlug` — the whole body of
// `GET /base/a/:slug` — excludes `base-internal` terms IN SQL before it counts claimants, and
// `src/routes/vocab.ts` states the rule for all four vocab routes: *"`base-internal` terms are
// never served, by any of the four routes"*. Every one of the nineteen is Base's own machinery
// vocabulary. ⇒ `/base/a/<slug>` answers *"is there a PUBLICLY SERVED term binding `a:<slug>`"*,
// which is a DIFFERENT question from *"is `a:<slug>` admitted"*, and no amount of control repair
// can make it the second one. ⛔ It is not the authoritative source and cannot become one.
//
// ── THE AUTHORITATIVE SOURCE, AND WHY IT IS THIS ONE ──────────────────────────────────────────
// `GET <entityUri>/history` — Base's own bitemporal datom log for the very entity being written
// (`src/routes/read.ts`, *"full raw datom log for the entity"*). It returns `datoms[].attribute`
// VERBATIM: the stored spelling, un-compacted, straight out of `base.facts`. It is:
//
//   · SELF-DESCRIBING — the vault states its own stored spellings; nothing is enumerated in this
//     repo and no term list is carried here
//     ([[Rule_Code_base-vault-native-data#RuleBasepodSelfDescribes]] ·
//      [[Rule_Code_base-vault-native-derivation#RuleBasepodNoNewEnumeration]] cl.3).
//   · REACHABLE EXACTLY WHEN THE READ WAS — the same C2b reader gate and the same uniform 404 as
//     the entity read this app already performed to obtain the served keys. An app that could
//     read the document can read its log; one that could not never got here.
//   · THE RIGHT QUESTION — a round-trip write must REPRODUCE the spelling the vault already holds,
//     not re-derive which spelling some registry ought to bind. A spelling that is already a live
//     row on this entity can ⛔ never be a manufacture.
//   · ONE REQUEST PER ENTITY, replacing up to one request PER SLUG.
//
// 🔴 AND THE INSTRUMENT ANSWERS FROM PRESENCE, ⛔ NEVER FROM ABSENCE — which is the whole
// difference from `S33`. A `404`, an offline network, a CORS refusal and a thinned document all
// produce the SAME thing here: no row, therefore `unknown`, therefore today's `a:` + slug. There
// is no reading an instrument failure can forge, because every definite answer requires a datom
// to be THERE ([[Rule_Code_base-evidence-answer#RuleBaseevidStateRowNotExistence]]). `S33` failed
// the other way round: its definite answer (`unbound`) was exactly what a broken origin produced.
//
// ⚠ BOTH SPELLINGS LIVE ON ONE ENTITY ⇒ `unknown`, deliberately. `geo.example.test/base/e/osm-r-406091`
// carries the one `a:c_geometry` row the earlier manufacture already put in production (2026-08-21)
// ALONGSIDE its bare `c_geometry`. The app cannot faithfully reproduce a two-spelling fact from a
// single merged wire key, so it does ⛔ not choose: it keeps today's behaviour on that entity and
// touches the standing row not at all (⛔ no data repair). Named as a residual
// rather than resolved by preference.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** What the VAULT ITSELF stores for the `a:`-ambiguous spelling of one served bare wire key. */
export type StoredSpelling =
  /** A live datom stands under the BARE key and none under `a:<key>` — `c_geometry` is this. */
  | "bare"
  /** A live datom stands under `a:<key>` and none under the bare key — `a:label` is this. */
  | "prefixed"
  /** The vault could not be asked, said nothing about this key, or holds BOTH. ⇒ today's behaviour. */
  | "unknown";

/**
 * True when the VAULT ITSELF declares this served key to be a bucket it ASSEMBLES AT READ TIME —
 * i.e. the key names NO stored fact and belongs in ⛔ no write body, under ⛔ any spelling.
 *
 * 🔴 THAT SENTENCE WAS FALSE WHEN IT FIRST SHIPPED, AND THE CORRECTION IS RECORDED ⛔ NOT SCRUBBED.
 * It was written while only the ONTOLOGY plane consulted this predicate. Independent QA measured
 * that the RECORDS plane did not: `readRecord` copies every served key into `facts` +
 * `servedKeys`, Base serves `GET /lws/r/:id` through the SAME `frameEntity`, and so
 * `replaceRecord` / `retypeRecord` still put `functions` on the wire verbatim — REFUSED-BA200.
 * ⛔ The sentence was NOT narrowed to fit the code; the code was changed to match it
 * (`records.ts` `storedSpellings` now returns `null` for such a key, and all three of its
 * consumers omit). ⚠ The lesson is the general one: **a docblock asserting a property nothing
 * checks is a claim, not a control** — the same defect class `BaseRecord.opaqueFacts` above
 * records being caught THREE times before it was replaced by a type.
 *
 * ── 🔴 WHY THIS IS AN OMISSION AND ⛔ NOT A RETRACTION ─────────────────────────
 * {@link storedSpellingFor} carries an assembled key VERBATIM, which the `S31` comment above
 * calls *"fail-closed at the term-admission guard"*. Fail-closed was the right direction and the
 * wrong resting place: the guard is now ARMED on `base`, so a full-state PUT of ANY ontology / FV
 * document that frames with one of these buckets is refused **whole** — the edit the person came
 * to make does not land. Measured 2026-09-04 against the SHIPPED guard, on a rig whose
 * `admitted_predicate_projection` is byte-identical to production M1 `base` (417 keys, armed):
 * all seven of the live `@context`'s `@set` keys read **REFUSED-BA200**.
 *
 * ⚠ The *"⛔ NO key is dropped"* invariant ({@link storedSpellingFor}, `S29`) is NOT weakened by
 * this. That invariant exists so a full-replace write cannot retract **a fact another writer
 * owns** ([[3P.V.StoredState.DestroyedWithoutHolderAct]]). An assembled bucket is not a fact and
 * cannot be one, so there is nothing here to retract — three independent readings, ⛔ none
 * inherited:
 *   · the VAULT SAYS SO — `"@container": "@set"` in the `@context` it serves about itself
 *     ([[Rule_Code_base-vault-native-data#RuleBasepodSelfDescribes]]);
 *   · BASE'S SOURCE SAYS SO at `origin/main` `02531c5` — `src/fv-vocab.ts:16-33` writes
 *     *"synthesised … never stored"* / *"wire-only"* for `a:fvChild` / `a:functionOf` /
 *     `a:valueHierarchy` / `a:resourceOf`, and `src/jsonld/frame.ts:267,273,276` `pushSet`s
 *     `a:valueEstimations` / `a:constraints` / `a:stakeholders` on during framing;
 *   · THE STORE SAYS SO — on M1, `op = 1 AND tx_to IS NULL`, **ZERO** live rows under all seven
 *     `@id`s, on **BOTH** `base` and `base_vaults`.
 *
 * ⛔ And the `@id` form is never written. Storing `a:functionOf` because the wire showed a
 * `functions` bucket would put a READ-TIME SYNTHESIS into the log as a fact — a fabrication, and
 * strictly worse than the refusal it replaces. That reasoning is unchanged from `S31`; only the
 * disposal of the key changes, from *carry-and-be-refused* to *omit*.
 *
 * 🔴 THAT SENTENCE WAS BRIEFLY FALSE, AND THE CODE — ⛔ NOT THE SENTENCE — WAS PUT BACK.
 * `D` r3 added a third arm that DID write the `@id` when the vault's log held a row under it, as a
 * remedy for a retraction hazard. Independent QA showed the remedy was worse than the disease:
 * the presence check guards the **key**, but the value this app holds is the **synthesis**, so
 * the write did not preserve the fact — it **overwrote the fact with the synthesis** — and,
 * because every `@id` is ADMITTED, it would have **landed** rather than been refused. The arm is
 * gone. See {@link omittableAssembledKeys} for the two answers that remain (omit, or say nothing
 * and let the guard refuse), and for why saying nothing is the only safe response to a bucket the
 * vault really holds.
 *
 * ⚠ FAIL-SAFE DIRECTION, STATED: a vault that will not serve its `@context` yields an EMPTY map,
 * every key answers `false` here, and the body is built exactly as it was before this change.
 * ⚠ This predicate is the `@context` half ONLY. It is ⛔ not sufficient on its own and is never
 * called alone on a write path — {@link omittableAssembledKeys} adds the datom-log half, and
 * that is what a caller must use.
 * The omission requires the vault to have POSITIVELY DECLARED the key assembled
 * ([[Rule_Code_base-evidence-answer#RuleBaseevidStateRowNotExistence]]) — an instrument failure
 * can ⛔ never cause a key to be dropped.
 *
 * ⚠ NAMED RESIDUAL, ⛔ not closed by this: if Base ever ships a STORED `@set` term, this omits a
 * real fact. That is the same inference `S31` already took (`@set` ⇒ assembled) and the same
 * direction it chose; it is now load-bearing rather than merely fail-closed, so it is restated
 * here rather than left in a sibling's comment.
 *
 * @param wireKey one key exactly as the vault served it
 * @param ctx the vault's own declared `@context` terms; an EMPTY map answers `false` for every key
 * @returns true when the vault declares this key an assembled bucket
 */
export function namesNoStoredFact(wireKey: string, ctx: VaultContextTerms): boolean {
  return ctx.get(wireKey)?.assembled === true;
}

/**
 * The stored attribute key for one served wire key — the ONE inversion both write planes use.
 *
 * ⚠ An ASSEMBLED bucket still answers VERBATIM here, and that is deliberate: this function's
 * contract is *"which key would you store this under"*, which has no way to say *"none"*.
 * Whether such a key belongs in the body at all is {@link namesNoStoredFact}'s question, asked
 * by the caller BEFORE this one. Keeping the two apart leaves every existing caller's behaviour
 * byte-identical.
 *
 * @param wireKey one key exactly as the vault served it
 * @param ctx the vault's own declared `@context` terms; an EMPTY map means prefix-only inversion
 * @param spelling what the VAULT'S OWN datom log says — see {@link StoredSpelling}
 * @param servedByVault true when this key came off a document the vault served (a round trip), false
 *   when this app authored the slug itself. Only a served key may be carried verbatim.
 * @returns the attribute key to store
 */
export function storedSpellingFor(
  wireKey: string,
  ctx: VaultContextTerms,
  spelling: StoredSpelling,
  servedByVault: boolean,
): string {
  // Already a storage key in its own right: a full IRI, or any declared/undeclared CURIE.
  // ⚠ The `:` test is what catches `owl:sameAs` — the case that produced `a:owl:sameAs` (`S29`).
  if (/^https?:\/\//.test(wireKey)) return wireKey;
  if (wireKey.includes(":")) return wireKey;
  // 🔴 The vault RENAMED this key on the way out. Invert the rename, never re-prefix the alias.
  const term = ctx.get(wireKey);
  // An ASSEMBLED bucket names no stored fact — carry it verbatim rather than fabricate one.
  if (term) return term.assembled ? wireKey : term.id;
  // Not a slug this app can address at all ⇒ verbatim, ⛔ never re-minted (`S29`).
  if (!isAppAddressableSlug(wireKey)) return wireKey;
  // 🔴 The VAULT ITSELF holds this fact under the BARE key ⇒ the served key IS the stored spelling.
  // `c_geometry` is this arm; `a:c_geometry` is the manufacture it replaces.
  if (servedByVault && spelling === "bare") return wireKey;
  // `prefixed` and `unknown` both land here: this app's `a:` convention, unchanged since `S29`.
  return `a:${wireKey}`;
}

/** The live stored-attribute set of an entity, memoised per entity URI. ⛔ Only a NON-EMPTY
 *  reading is memoised — caching an empty one would pin a network failure for the session and
 *  the next write would inherit it as though it were a reading
 *  ([[Rule_Code_instrument-capability#RuleInstcapReadingCarriesSiteAndInstant]]). */
const liveAttributeCache = new Map<string, ReadonlySet<string>>();

/** Test seam: drop the memoised datom logs. */
export function resetStoredSpellingCache(): void {
  liveAttributeCache.clear();
}

/** One datom as `GET /base/e/:id/history` serves it. Only three members are read here. */
interface HistoryDatom {
  readonly attribute?: unknown;
  readonly op?: unknown;
  readonly tx_to?: unknown;
}

/**
 * The set of attribute keys that stand as LIVE facts on one entity, read from the vault's own log.
 *
 * The predicate is the guard's own: `op = 1 AND tx_to IS NULL` — an assert that has not been
 * superseded. A retracted or superseded spelling is deliberately NOT in this set; it is history,
 * not what the vault holds.
 *
 * ⚠ BEST EFFORT, and every caller must treat it so. An unreachable vault, a 404, a CORS refusal, an
 * unparseable body and an entity whose log this principal may not read ALL yield the EMPTY set,
 * under which every key resolves to `unknown` and the inversion behaves exactly as it did before
 * this repair. ⛔ It does not throw: a save must not fail because the app could not reach a
 * description of the vault.
 *
 * @param entityUri the entity's own absolute URI — the same one the served document carried
 * @returns the live stored-attribute keys, verbatim; EMPTY when the log could not be read
 */
async function liveAttributes(entityUri: string): Promise<ReadonlySet<string>> {
  const hit = liveAttributeCache.get(entityUri);
  if (hit) return hit;
  // The log read carries the DPoP credential: ask only a platform host (Delta10 B1).
  const url = `${atVaultOrigin(entityUri).replace(/\/+$/, "")}/history`;
  let live: Set<string> = new Set();
  try {
    // The SAME credential the write uses, so the log is as reachable as the write target. A
    // signed-out session simply sends no header — a public entity still answers, a private one
    // 404s, and both land in the fail-safe direction. The BEHAVIOUR is what `ontologyHistory.ts`
    // already ships; ⛔ that UI-shaped loader (three-origin fallback, label enrichment, event
    // grouping) is not reused as a call site
    // ([[Rule_Code_reuse-and-parity-guards#RuleReuseguardBehaviourNotFiles]]).
    let auth: Record<string, string> = {};
    try {
      const { dpopReadAuth } = await import("@kaigilb/gilbplatformcode-lws-session-bridge");
      auth = await dpopReadAuth("GET", url);
    } catch {
      /* anonymous is a legitimate posture — a public entity's log is public */
    }
    const res = await fetch(url, { headers: { accept: "application/json", ...auth } });
    if (res.ok) {
      const body = (await res.json()) as { datoms?: readonly HistoryDatom[] };
      for (const d of body?.datoms ?? []) {
        if (d?.op !== 1) continue;
        if (d?.tx_to !== null && d?.tx_to !== undefined) continue;
        if (typeof d?.attribute === "string" && d.attribute !== "") live.add(d.attribute);
      }
    }
  } catch {
    live = new Set();
  }
  if (live.size > 0) liveAttributeCache.set(entityUri, live);
  return live;
}

/**
 * What the VAULT ITSELF stores, for each served wire key of one document.
 *
 * Only keys that could REACH the `a:` arm are answered — a full IRI, a CURIE and a
 * non-addressable slug are all carried verbatim by {@link storedSpellingFor} and need no answer.
 * A key the log does not mention under EITHER spelling, and a key the log mentions under BOTH,
 * are both left absent ⇒ read as `unknown` ⇒ today's `a:` mint.
 *
 * 🔴 THE INSTRUMENT PROVES IT CAN SAY BOTH WORDS, OR IT SAYS NEITHER
 * ([[Rule_Code_guard-scripts-reading-a-verdict#RuleGuardreadProveItCanFail]]). Here that is
 * STRUCTURAL rather than bolted on: `bare` and `prefixed` are read off the SAME response, from
 * rows that are present in it, so a response that can produce one can produce the other. And the
 * failure mode has no verdict at all — an unreadable log yields an empty set and therefore an
 * empty map, ⛔ never a sheet of confident answers. That is the exact trap `S33` fell into, where
 * an origin that 404'd everything was indistinguishable from a master that bound nothing.
 *
 * @param entityUri the entity the served keys came off; a non-absolute value answers nothing
 * @param wireKeys the served wire keys of one document
 * @returns wire key → what the vault stores; keys not answered are absent (⇒ treat as `unknown`)
 */
export async function resolveStoredSpellings(
  entityUri: string | null | undefined,
  wireKeys: Iterable<string>,
): Promise<ReadonlyMap<string, StoredSpelling>> {
  const out = new Map<string, StoredSpelling>();
  if (typeof entityUri !== "string" || !/^https?:\/\//.test(entityUri)) return out;
  const ask = new Set<string>();
  for (const key of wireKeys) {
    if (/^https?:\/\//.test(key) || key.includes(":") || !isAppAddressableSlug(key)) continue;
    ask.add(key);
  }
  if (ask.size === 0) return out;
  const live = await liveAttributes(entityUri);
  if (live.size === 0) return out; // the log said nothing — ⛔ that is not a sheet of `unknown`s
  for (const key of ask) {
    const bare = live.has(key);
    const prefixed = live.has(`a:${key}`);
    // ⛔ Exactly one of the two, or no answer. BOTH ⇒ a two-spelling fact this app cannot
    // reproduce from one merged wire key (see the `osm-r-406091` note above).
    if (bare && !prefixed) out.set(key, "bare");
    else if (prefixed && !bare) out.set(key, "prefixed");
  }
  return out;
}

/**
 * The URL of a VAULT'S OWN `@context`, derived from any URI addressed at that vault.
 *
 * 🔴 MEASURED, ⛔ not assumed: the records plane reads `GET /lws/r/<id>`, whose served
 * `@context` is the **LWS core context** `https://www.w3.org/ns/lws/v1` (Base's own
 * `src/lws/jsonld.ts` swaps it in deliberately, and the URL is **HTTP 404** on the open web).
 * Handing that value to {@link loadVaultContext} yields an EMPTY map, so a repair that simply
 * reused the ontology plane's `loadVaultContext(doc["@context"])` call would be **INERT here**.
 * The vault's own term map lives at `<vault origin>/base/context.jsonld`, and that is what this
 * derives. ⛔ Reuse the BEHAVIOUR (ask the vault), ⛔ never the call site.
 *
 * @param at any absolute URI addressed at the vault (a framed `@id`, a 201 `Location`, an
 *   `entityUri`); a non-absolute value yields the app's configured origin
 * @returns the absolute `context.jsonld` URL
 */
export function vaultContextUrl(at: string | null | undefined): string {
  // The vault's own door, as every other call to the vault reaches it ({@link vaultOriginOf}): on a
  // local rig a `https://<name>.rig.example.test:<port>` vault is served over http, so `new URL(at).origin`
  // failed TLS there and the context was never read.
  return `${vaultOriginOf(at)}/base/context.jsonld`;
}

/**
 * The ASSEMBLED buckets of one document that are SAFE TO OMIT from a write body.
 *
 * ── 🔴 THE ONLY TWO SAFE ANSWERS ARE *OMIT* AND *SAY NOTHING* ───────────────
 * `r3` had a third arm: when the vault's log held a live row under the bucket's `@id`, it wrote
 * the bucket's value under that `@id`. Independent QA showed that is a **FABRICATION**, and a
 * landing one — all seven `@id`s are ADMITTED, so it would not even be refused. The presence
 * check guards the **key**; the hazard is the **VALUE**. Base assembles a bucket's value from
 * rows on OTHER entities (`fv-vocab.ts`; `frame.ts:267,273,276`; `element-vocab.ts:183`), so the
 * value this app holds is a read-time synthesis. Writing it under the `@id` does ⛔ not preserve
 * the fact — it **OVERWRITES the fact with a synthesis**, which is worse than either failure it
 * was trying to avoid. ⇒ arm removed. ⛔ The `@id` form is never written, on any path.
 *
 * ⚠ **AND THAT ALSO ENDS THE CHOOSING.** `r3` picked a winner when two spellings were live; the
 * loser was retracted. That contradicted the standing ruling this file already records for
 * `osm-r-406091` (the app does ⛔ not choose between two live spellings). It no
 * longer chooses, because it no longer writes.
 *
 * ── SO THE POLICY IS, IN FULL ─────────────────────────────────────────────────────────────────
 *   · log READ **and** it holds nothing under the served key, `a:`+key, or the term's `@id`
 *     ⇒ **OMIT** — the bucket is the synthesis the `@context` says it is, and dropping a
 *       synthesis retracts nothing.
 *   · anything else — log unreadable, or ANY live row under ANY of those spellings
 *     ⇒ **SAY NOTHING**, so the caller carries the key verbatim. 🔴 Lossless and fabricating
 *       nothing — the app writes only what the vault served it, under the spelling it served.
 *
 * ⚠ 🔴 AND THE SECOND BRANCH IS *NOT* UNIVERSALLY LOUD — THE SENTENCE IS SCOPED BECAUSE
 * MEASUREMENT CONTRADICTS THE UNSCOPED FORM. It first read *"…and the term-admission guard
 * REFUSES the save"*, full stop. Measured on M1 2026-09-04: the guard is armed on **`base`**
 * (417 projection rows, `term_admission_armed() = t`) and **UNARMED on `base_vaults`** (0 rows,
 * `= f`), where the migration's unseeded-store branch `RETURN NEW`s everything — and `base_vaults`
 * holds the vault-record entities the RECORDS plane writes to. ⇒ on `base` the carried key is
 * refused loudly; on `base_vaults` it is **accepted**, and an unbound bucket key lands as a row.
 * ⛔ Not a regression — that is exactly what happens on `main` today, and the omission arm can
 * only reduce it — but ⛔ not the safety property the unscoped sentence claimed either. The
 * lossless half holds on both stores; only the loudness is store-dependent.
 *
 * That second branch is the direction this file already declared before `D` existed: *"errs
 * toward a refusal (the guard says no) rather than toward a fabricated fact. That direction is
 * deliberate."* `r3` broke it; this restores it.
 *
 * ⚠ MEASURED, so the branch weights are honest: **zero rows all-time** under all seven `@id`s
 * **and** all seven bare keys (QA re-derived on M1 2026-09-04; live controls `a:label` 68,671 and
 * `c_geometry` 51,225 in the same query). The carry branch therefore fires on nothing today — it
 * is a floor, ⛔ not a live behaviour.
 * ⚠ **TWO stores, ⛔ not three.** This reading was first written as *"on `base` / `base_vaults` /
 * `base_geo`"*. `base_geo` holds **0 facts rows** and has no `term_admission_armed()` at all, so
 * a zero from it is a null instrument counted as evidence — the exact `S33` trap this file's own
 * `S35` block was written to stop, and QA falsified its own carry-forward to catch it. The honest
 * scope is `base` and `base_vaults`.
 *
 * @param entityUri the entity the served keys came off; a non-absolute value omits nothing
 * @param ctx the vault's own declared `@context` terms; an EMPTY map omits nothing
 * @param wireKeys the served wire keys of one document
 * @returns the subset safe to OMIT; EMPTY whenever the vault could not be asked
 */
export async function omittableAssembledKeys(
  entityUri: string | null | undefined,
  ctx: VaultContextTerms,
  wireKeys: Iterable<string>,
): Promise<ReadonlySet<string>> {
  const out = new Set<string>();
  const assembled = [...wireKeys].filter((k) => namesNoStoredFact(k, ctx));
  if (assembled.length === 0) return out;
  if (typeof entityUri !== "string" || !/^https?:\/\//.test(entityUri)) return out;
  const live = await liveAttributes(entityUri);
  // ⛔ The log said nothing at all ⇒ we did not ask successfully ⇒ omit NOTHING.
  if (live.size === 0) return out;
  for (const key of assembled) {
    const id = ctx.get(key)?.id;
    // 🔴 ANY live row under ANY spelling ⇒ the vault really holds something here and this app
    // cannot reproduce it from a synthesised wire value. Say nothing; let the guard refuse.
    if (live.has(key)) continue;
    if (live.has(`a:${key}`)) continue;
    if (id && live.has(id)) continue;
    out.add(key);
  }
  return out;
}
