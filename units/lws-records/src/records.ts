import { LWS_RESOURCE_URL, LWS_VAULT_CONTAINER_URL } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { NotSignedInError, bearerHeaderFor, dpopWriteAuth, invalidateDpop, tokenManager } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { attrKey, normalizeTypeUri, typeUri } from "@kaigilb/gilbplatformcode-record-types";
import {
  loadVaultContext,
  omittableAssembledKeys,
  parseVaultContext,
  parseVaultPrefixes,
  readVaultContext,
  resolveStoredSpellings,
  storedSpellingFor,
  vaultContextUrl,
} from "./vaultContext";
import { serverErrorText, serverReasonOrNull } from "./serverError";

/** A record as the app holds it — the vault is the source of truth for every field. */
export interface BaseRecord {
  /** The opaque LWS/Base id (`/lws/r/<id>`). */
  id: string;
  /**
   * Canonical entity URI from the framed `@id` (e.g. `https://hytta.example.test/base/e/<id>`).
   * Required for owner-gated share: NEVER invent `https://platform.example.test/base/e/<id>` from apex
   * baseOrigin() — that resolves to the wrong vault and 403s "not the owner".
   */
  entityUri?: string;
  /** The absolute BaseVeda Type URI (`https://<host>/base/t/<Type>`). */
  typeUri: string;
  /**
   * True when `typeUri` is the app's "unknown" marker `t:Resource`, put there because the document named no type (or a stub awaits
   * hydration), not a claim about the record. The Plan card gates read it: such a record is never a Development Resource card.
   */
  typeSubstituted?: true;
  /** The typed facts, keyed by BaseVeda attribute slug (bare, e.g. `title`). */
  facts: Record<string, string>;
  /**
   * 🔴 Cycle161 `S33` — the slugs in {@link facts} that came off THE VAULT'S OWN served document.
   *
   * A write may only carry a bare key VERBATIM when the vault demonstrably stores something under
   * it; for a slug this app AUTHORS, this app's `a:` convention stands. That distinction is
   * knowable only here, at the read — one step later a slug from the vault and a slug the editor
   * invented are the same string. Hand it to a write as {@link WriteSource} and the inversion
   * stops manufacturing `a:c_geometry`; omit it and the write behaves exactly as it did before.
   *
   * ⚠ OPTIONAL on purpose, and it is a MEANING rather than a convenience: an ABSENT
   * `servedKeys` says *"no vault document stands behind this record"* — a placeholder row awaiting
   * hydration (`recordHooks`, `RecordGrid`, `entityRefChildren`, `searchHooks` all mint those),
   * or a hand-built fixture. For such a record there is nothing to invert and the pre-`S33` `a:`
   * mint is the right answer, so absence fails safe rather than fails closed. {@link readRecord}
   * — the ONLY constructor that has actually seen a served document — always sets it.
   */
  servedKeys?: readonly string[];
  /**
   * 🔴 Cycle159 — the slugs in {@link facts} whose string is a STAND-IN, not the value.
   *
   * `factToString` must hand the typed editor a string, and for a value it cannot express as
   * one (a language map, a structured scale, a condition record) the string it hands over is
   * `""`. That `""` is indistinguishable from "the person cleared this field", and the write
   * path reads it as exactly that — so an ordinary edit retracted a fact this app never
   * showed and never understood. Measured on M1 2026-08-29: **44 115 live facts on 14 755
   * entities** across 14 predicates and 3 vaults sit in that shape (see
   * `RecordDetail.objectFact.test.tsx` for the query and the served spellings).
   *
   * ⚠ This is a SIDECAR on purpose. Widening `facts` itself is the change that was tried and
   * reverted for 25 compile errors (see {@link RecordCreateFacts}) — and the runtime radius is
   * wider than the compile one, because ~12 sites call `.trim()` on a fact behind a
   * `Record<string, string>` parameter that `tsc` cannot see through. The editor stays a
   * string surface; this only records WHICH of its strings must not be believed.
   *
   * 🔴 REQUIRED, AND THAT IS THE WHOLE MECHANISM. There is deliberately ⛔ NO prose invariant
   * here about which producers set it, because the compiler now answers that question and a
   * comment cannot. Add a producer and `tsc` stops you; there is no closed set to remember,
   * and no sentence here that can rot away from the code.
   *
   * ⚠ 🔴 WHY IT IS WRITTEN THIS WAY — recorded because it took THREE attempts and two gates.
   * The first version claimed *"every producer that hands out a BaseRecord either sets it or
   * holds no facts at all"*. FALSIFIED by BVedanta's typing gate. It was replaced with
   * *"every producer whose record can reach `useUpdateRecord` sets it… each member is pinned
   * by a test"*. FALSIFIED AGAIN, by both gates independently: six producers wrote
   * inline-renameable rows into `recordsKey(vaultId)` with no marking, and `hydrateRecordsPage`
   * — a member that sentence NAMED and CREDITED — was measurably unpinned (removing its
   * propagation left the entire suite green).
   *
   * ⇒ ⛔ The defect was never the wording. It was asserting a closure property in prose that
   * nothing checked. A third rewrite would have been the same defect a third time, so the
   * claim was ⛔ not rewritten — it was DELETED and replaced by the type. `undefined` is now
   * unrepresentable, so the ambiguity that made the earlier sentences necessary is gone.
   *
   * ⚠ An empty array means "nothing was lost", and is now a statement a producer must make on
   * purpose rather than one it can make by forgetting. For the six create/stub producers it
   * is TRUE and cheap: they carry either `{}` or client-authored strings, which are faithful
   * by construction.
   *
   * `FanoutHit.opaqueFacts` is required for the same reason and was already proven enforced —
   * removing it from `toHit`'s return is a `TS2741`, measured, not assumed.
   */
  opaqueFacts: readonly string[];
  /** The strong ETag (`"sha256:<hash>"`) — the If-Match token for the next write. */
  etag: string | null;
  /**
   * 🔴 GAPP214.42 (N1) — the facts AS THE VAULT SERVED THEM at {@link readRecord}, before
   * `factToString` flattened them for the editor: a link stays `{"@id": …}`, a list stays a list.
   * A full-state write (the retype PUT, a share) sends these back for every fact the person did not
   * edit ({@link factsAsServed}); built from {@link facts} instead, a link was stored as text.
   *
   * ⚠ It describes the document read at `served.etag` ONLY. A cache row keeps it after a later save
   * changes {@link facts}, so ⛔ never use it for a write bound to any other ETag. OPTIONAL in the
   * same sense as {@link servedKeys}: absent means no served document is in hand.
   */
  served?: ServedDocument;
}

/** The facts of one served record document, unflattened — see {@link BaseRecord.served}. */
export interface ServedDocument {
  /** Bare slug → the served value, verbatim (string, number, boolean, `{"@id"}`, object, array). */
  readonly facts: Readonly<Record<string, unknown>>;
  /** The document's own `@context` as served. On `GET /lws/r` it is the LWS address (www.w3.org,
   *  404), ⛔ never fetched; only an inline part declares short forms ({@link factsAsServed}). */
  readonly context: unknown;
  /** The ETag the document was served with. */
  readonly etag: string | null;
  /** GAPP214.42 A1 (BVedanta) — slugs the document served as `a:<slug>`, ⛔ not under the term's own
   *  name. The context types a term by its own name only, so such a value is what was stored (text)
   *  and goes back as served ({@link factsAsServed}). Absent ⇒ none. */
  readonly prefixedKeys?: readonly string[];
}

/** 412 — a concurrent write advanced the record since our ETag (optimistic-concurrency
 * lost-update guard). The caller refetches + reconciles. */
export class RecordConflictError extends Error {
  constructor() {
    super("This record changed elsewhere since you opened it — reloaded the latest.");
    this.name = "RecordConflictError";
  }
}

/** 403 — the principal may not write this record (default-DENY at the D0 gate).
 *
 * 🔴 C152 — `reason` exists because the fixed sentence below is the CLIENT's guess at the
 * cause, and Base very often sends a better one ("You do not own parent vault …", "this
 * account's entitlement is off"). The refusal of an act of the owner's own authority must
 * say WHY, and the client does not know why — it only knows what the server said. The
 * default text is kept as the floor (a 403 with an empty body still reads), the server's
 * sentence is appended when there is one, and `instanceof RecordForbiddenError` is unchanged
 * for every caller that branches on the type. */
export class RecordForbiddenError extends Error {
  /** The server's own sentence, when it sent one. Null when the body carried no reason. */
  readonly reason: string | null;
  constructor(reason?: string | null) {
    const carried = reason && reason.trim() ? reason.trim() : null;
    super(
      carried
        ? `You do not have write access to this record. ${carried}`
        : "You do not have write access to this record.",
    );
    this.name = "RecordForbiddenError";
    this.reason = carried;
  }
}

/**
 * A fact value as the VAULT stores it — the datom value shapes the write door actually
 * accepts, not a client narrowing of them.
 *
 * Cycle107 · BAPP107.1 — WHY THIS WIDENED FROM `string`. Two of the vault's own step facts
 * are NOT strings, and a `Record<string, string>` alias has no way to express them (read at
 * `~/Developer/Base` @ `284f3592449b13f4ee052b352b6b5a23bd6261c2` = its `origin/main`;
 * ⛔ read off source, not exercised against a vault in this increment):
 *   • `a:processOf` is a CONTENT-ADDRESSED EDGE OBJECT `{"@id": <process>}` — the steps
 *     reverse-find matches on exactly that value (`src/lws/process-steps.ts:148-151`:
 *     "the value is content-addressed the same way the write path hashed it, so
 *     `{"@id": <process>}` matches the stored edge"). A string in its place is not a
 *     weaker edge, it is a DIFFERENT value there.
 *   • `a:stepOrder` is a NUMBER — `stepOrderOf` (`src/lws/process-steps.ts:62-63`) returns
 *     `Number.POSITIVE_INFINITY` for a value that is not a finite number, so a string
 *     sorts LAST.
 * The wire admits both at that ref: `POST /lws/vault/:vaultId/c` types its body
 * `facts: Record<string, DatomValue>` with `facts: { additionalProperties: true }`
 * (`src/lws/routes.ts:468-486`, `:591-600`) and `DatomValue = string | number | boolean |
 * object | array` (`src/write/canonical.ts:26-31`). It was THIS alias — `Record<string,
 * string>` — that made the two shapes unexpressible from BaseApp. The mirror already
 * existed on the PATCH side as `MergePatchValue` below; this brings the CREATE side to the
 * same truth. `null` is deliberately absent: on the create/replace path "no value" is
 * OMISSION (see {@link toWireFacts}); the delete-an-attribute meaning of `null` belongs to
 * merge-patch alone.
 */
export type RecordFactValue =
  | string
  | number
  | boolean
  | { readonly [key: string]: unknown }
  | readonly unknown[];

/**
 * The facts map a CREATE supplies — bare slugs, vault-shaped values.
 *
 * ⚠ THE WIDENING IS SCOPED TO THE CREATE DOOR ON PURPOSE, and the reason is MEASURED, not
 * stylistic. Widening {@link RecordFacts} itself (the typed-editor map) was tried and then
 * reverted: `tsc -b --noEmit` returned **25 errors across 3 files** — `recordHooks.ts` (12),
 * `RecordDetail.tsx` (8), `FileDetail.tsx` (5) — because that surface legitimately assumes
 * string facts end-to-end (it feeds them to `<input value>` and calls `.trim()` on them).
 * The typed record editor is a STRING surface and stays one; only the create door needs the
 * vault's richer shapes. `Record<string, string>` is assignable to this type, so the existing
 * create call sites needed no change — `tsc -b --noEmit` exits 0 at this head.
 */
export type RecordCreateFacts = Record<string, RecordFactValue>;

/** The facts map the typed editor holds and `replaceRecord` writes — bare slugs, STRING
 * values. Deliberately NOT widened; see {@link RecordCreateFacts}. */
export type RecordFacts = Record<string, string>;

/** The reserved JSON-LD keys a framed document carries that are NOT record facts. */
const FRAME_META_KEYS = new Set(["@context", "@id", "@type"]);

/** The Bearer auth header, minted/re-minted through the O.7 bridge.
 * For one request to `url`, through the one credential seam (`bearer.ts` `bearerHeaderFor`). */
function authHeader(url: string, method?: string): Promise<Record<string, string>> {
  return bearerHeaderFor(url, method);
}

/** Maps a non-ok response to the right typed error (and drops the BEARER token on 401 so the
 * next call re-mints off the live Base cookie). Used by the id-keyed reads/writes, which ride
 * the Bearer floor. */
async function throwForStatus(res: Response): Promise<never> {
  if (res.status === 401) {
    tokenManager.invalidate();
    throw new NotSignedInError();
  }
  // ⚠ Read the body BEFORE the 403 branch — a Response body reads once, and the 403 is exactly
  // the case whose sentence used to be dropped on the floor (C152). 412/428 keep their own
  // fixed copy: a lost If-Match race has one meaning and the client can state it precisely.
  const detail = await res.text().catch(() => "");
  if (res.status === 403) throw new RecordForbiddenError(serverReasonOrNull(detail));
  if (res.status === 412 || res.status === 428) throw new RecordConflictError();
  throw new Error(serverErrorText(res.status, detail, "LWS request failed"));
}

/** The create's error mapper — identical to `throwForStatus` except a 401 drops the DPoP
 * credential (the create authorizes with it, not the Bearer), so the next create re-mints off
 * the live cookie. A 403 is Base's FAIL-CLOSED write refusal for a vault the principal cannot
 * write (`resolveVaultTarget(…, "write")`) — surfaced as RecordForbiddenError, never swallowed. */
async function throwForCreateStatus(res: Response): Promise<never> {
  if (res.status === 401) {
    invalidateDpop();
    throw new NotSignedInError();
  }
  const detail = await res.text().catch(() => "");
  if (res.status === 403) throw new RecordForbiddenError(serverReasonOrNull(detail));
  // No status-bearing class on this path (401 and 403 are their own types). The status rides
  // on the Error so a caller can tell a 409 tag collision from any other refusal. The message
  // stays serverErrorText — today's sentence for every other status.
  const err = new Error(serverErrorText(res.status, detail, "LWS request failed"));
  (err as Error & { status: number }).status = res.status;
  throw err;
}

/** Reads the `<id>` out of a `…/lws/r/<id>` URL (the Location header / @id). */
function idFromResourceUrl(url: string): string {
  const marker = "/lws/r/";
  const i = url.indexOf(marker);
  return i === -1 ? url : url.slice(i + marker.length);
}

/** Coerces a framed fact value (string / number / boolean / `{ "@id" }` edge / array)
 * into the string the typed editor round-trips. */
function factToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(factToString).join(", ");
  if (typeof value === "object" && "@id" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)["@id"]);
  }
  return "";
}

/**
 * 🔴 Cycle159 — did {@link factToString} CARRY this value, or STAND IN for it?
 *
 * ⚠ `factToString` is deliberately NOT changed. It is correct at its own job and three other
 * surfaces depend on its exact output (`StandardsSection.tsx:1244` says so in terms). The
 * defect was never that it returns `""` — it is that `""` arrives at the write path carrying
 * two incompatible meanings, and the write path can only act on one of them:
 *
 *   • `value == null`      → the attribute is ABSENT. `""` is the honest answer. Retracting on
 *                            a later save is correct, and `recordHooks.test.tsx` pins it.
 *   • object with `@id`    → an edge. Carried as the target URI. Faithful.
 *   • string/number/bool   → carried verbatim. Faithful.
 *   • object with NO `@id` → 🔴 a value this app cannot express as a string. `""` is a
 *                            PLACEHOLDER, and believing it destroys the fact.
 *   • array                → faithful only if EVERY member is. A member that is not turns the
 *                            `", "` join into a silent drop, so `["a", {…}]` → `"a, "` loses
 *                            the second member just as surely as `[{…}]` → `""` loses the first.
 *
 * ⚠ `[]` is faithful (vacuously) — an empty list and an absent attribute are the same to a
 * string editor, and treating them apart would change behaviour this increment does not own.
 *
 * 🔴 This function mirrors `factToString`'s branch table for a different question, so the two
 * MUST be edited together. It is a JSON-SHAPE test and enumerates no field kind, tier, plane
 * or type slug (RuleBasepodNoNewEnumeration): it is the same five shapes the coercion above
 * already branches on.
 *
 * ⚠ PRECISELY WHAT IS AND IS NOT SHARED — corrected 2026-08-29 after BVedanta's typing gate
 * caught the first version of this line claiming `fanout.ts` "imports it rather than forking
 * it", which conflated two different functions. ✅ THIS PREDICATE is the one copy and
 * `fanout.ts` does import it. ⛔ `factToString` is NOT: `fanout.ts:105-111` holds a FORK that
 * DIVERGES — its floor is `String(value)`, so a non-`@id` object renders there as
 * `"[object Object]"` where this module renders `""`. That divergence is a real defect, it is
 * separately owed, and it is deliberately not repaired here. Sharing the predicate is what
 * makes both stand-in spellings recognisable to the write guard without touching either
 * coercion.
 */
export function isFactStringFaithful(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return true;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isFactStringFaithful);
  if (typeof value !== "object") return true;
  return "@id" in (value as Record<string, unknown>);
}

/** True when {@link typeUriFromFrame} will put the "unknown" marker `Resource` in place of a missing type. */
function typeWasSubstituted(rawType: unknown): boolean {
  const t = Array.isArray(rawType) ? rawType[0] : rawType;
  return typeof t !== "string" || t === "";
}

/** True when the record still carries the "unknown" marker type AND was marked as substituted: the one case a Plan card must refuse. */
export function hasSubstitutedType(rec: Pick<BaseRecord, "typeUri" | "typeSubstituted">): boolean {
  return !!rec.typeSubstituted && normalizeTypeUri(rec.typeUri) === normalizeTypeUri(typeUriFromFrame(undefined));
}

/** Resolves the absolute BaseVeda Type URI from a framed doc's `@type` (which may be a
 * full URI, a `t:Name` prefix form, or a bare `Name` under @vocab). */
function typeUriFromFrame(rawType: unknown): string {
  const t = Array.isArray(rawType) ? rawType[0] : rawType;
  if (typeof t !== "string" || t === "") return typeUri("Resource");
  // ONE normalizer for every type spelling the vault can hand back, shared with the vault-SET
  // path (vaultSets.ts). This logic used to live here only, which is exactly why the record
  // READ tolerated the host-free CURIE and the record LIST did not (2026-07-20).
  return normalizeTypeUri(t);
}

/** Turns a bare-slug facts map into the `a:<slug>` wire body the vault stores. Empty
 * strings are OMITTED (an unset attribute is absent, not an empty datom). Non-string
 * values pass through UNCHANGED — an `{"@id": …}` edge stays an object and an ordinal
 * stays a number, because that is what the vault matches and sorts on (see
 * {@link RecordFactValue}); C107-2 asserts both survive to the transmitted body with
 * `typeof` object and number. ⚠ The `!== ""` guard is a STRICT comparison, so the number 0
 * and the boolean false are kept; only the empty string and null/undefined are dropped. */
async function toWireFacts(
  facts: RecordCreateFacts,
  source?: WriteSource,
  /** GAPP214.42 (N1) — slugs whose `""` the vault SERVED (from {@link factsAsServed}): carried, ⛔ not
   *  dropped as unset, or a full replace would retract a stored empty value nobody edited. */
  keepEmpty?: ReadonlySet<string>,
): Promise<Record<string, RecordFactValue>> {
  const spell = await storedSpellings(Object.keys(facts), source);
  const out: Record<string, RecordFactValue> = {};
  for (const [slug, value] of Object.entries(facts)) {
    if (value == null) continue;
    if (value === "" && !keepEmpty?.has(slug)) continue;
    // 🔴 C161 `D` — `null` means the VAULT declared this key one it ASSEMBLES at read time. It
    // names no stored fact, so it is OMITTED rather than carried into a REFUSED-BA200 that
    // would take the WHOLE full-state write down with it.
    const key = spell(slug);
    if (key !== null) out[key] = value;
  }
  return out;
}

/**
 * 🔴 Cycle161 `S33` — WHERE A SLUG CAME FROM, WHICH IS WHAT DECIDES ITS STORED SPELLING.
 *
 * `readRecord` strips ONE `a:` and hands the editor bare slugs, and every write below used to
 * re-mint `a:` + slug UNCONDITIONALLY ({@link attrKey}). Proved at a real door on an
 * M1-byte-equal armed clone: a record the vault served with `c_geometry` (51,225 live rows on M1)
 * round-tripped out of this app as `a:c_geometry` → **HTTP 409 UndefinedTermError**, while the
 * true spelling wrote **201** in the same run. Six wire RENAMES (`shows`, `target`, `functions`,
 * `values`, `children`, `resources`) manufacture the same way here — `S31` repaired the ONTOLOGY
 * plane's inversion and ⛔ never reached this one.
 *
 * ⚠ `servedKeys` is what makes this a DERIVATION rather than a guess. Only a key the VAULT ITSELF
 * SERVED may be carried verbatim; a slug this app AUTHORS keeps this app's `a:` convention,
 * because the add-field surface already gates a new field on the same master probe. Omit
 * `source` — as every builder that mints its own slugs does — and the behaviour is
 * byte-for-byte the pre-`S33` {@link attrKey} mint, with ⛔ no network call.
 */
export interface WriteSource {
  /** The record's own entity URI — names the vault whose `@context` governs the inversion. */
  readonly at: string | null;
  /** The slugs that came off the vault's served document ({@link BaseRecord.servedKeys}).
   *  Empty / absent ⇒ nothing to invert ⇒ the pre-`S33` {@link attrKey} mint, with no request. */
  readonly servedKeys: readonly string[] | undefined;
}

/**
 * The {@link WriteSource} for a record — or `undefined` when the record carries no served
 * document, which is the same thing as *"there is nothing to invert"*.
 *
 * ⚠ It SPREADS — `patchRecord(id, patch, at, ...writeSource(rec))` — rather than passing a value,
 * so a record with no vault provenance produces a call of the SAME ARITY it had before `S33`. That
 * is not cosmetic and it is measured: passing an object turned three suite files RED against my
 * own baseline on call-argument assertions alone, and passing an explicit `undefined` turned the
 * same three RED again, because `toHaveBeenCalledWith` counts a trailing `undefined` as an
 * argument. A placeholder row, a cache-built row and a hand-built fixture therefore all take
 * byte-identically the path they took before, and ⛔ no shipped assertion moves.
 */
export function writeSource(
  rec: { entityUri?: string; servedKeys?: readonly string[] },
): [] | [WriteSource] {
  if (!rec.servedKeys?.length) return [];
  return [{ at: rec.entityUri ?? null, servedKeys: rec.servedKeys }];
}

/**
 * Resolves one slug→stored-key function for a write. ⛔ No `source` ⇒ the pre-`S33` mint.
 *
 * 🔴 Cycle161 `D` — RETURNS `null` FOR A KEY THAT NAMES NO STORED FACT, meaning **omit it**.
 *
 * ⚠ THIS ARM EXISTS BECAUSE A COMMENT OF MINE WAS CAUGHT CONTRADICTING ITS OWN CODE.
 * `namesNoStoredFact` shipped first on the ONTOLOGY plane only, under a docblock claiming an
 * assembled bucket *"belongs in no write body, under any spelling"*. Independent QA falsified
 * that on this file: `readRecord` copies **every** served key into `facts` + `servedKeys`
 * (`records.ts:478-495`), Base serves `GET /lws/r/:id` through the **same** `frameEntity`, and
 * so `replaceRecord` / `retypeRecord` still put `functions` on the wire **verbatim** — the exact
 * REFUSED-BA200 spelling the ontology plane had just stopped writing. The comment was true of
 * the intent and false of the program. ⛔ The remedy is ⛔ NOT to narrow the sentence: it is to
 * make the program match it, which is what this arm does. (The gap was not even undocumented —
 * the {@link WriteSource} block above already said `S31` *"never reached this one"*.)
 *
 * Safe for the same measured reason as on the ontology plane, and QA re-derived it STRONGER than
 * I did: **zero rows ALL-TIME** — not merely zero live — under all seven `@id`s *and* their bare
 * spellings, across **three** stores (`base`, `base_vaults`, `base_geo`). There is no fact to lose.
 *
 * @returns a resolver; `null` from it means the key names no stored fact and must be OMITTED
 */
export async function storedSpellings(
  slugs: readonly string[],
  source: WriteSource | undefined,
): Promise<(slug: string) => string | null> {
  if (!source?.servedKeys?.length) return attrKey;
  const served = new Set(source.servedKeys);
  const asked = slugs.filter((s) => served.has(s));
  // ⚠ Best-effort, exactly as `S31` made it on the ontology plane: an unreachable vault context
  // or datom log yields an empty map / `unknown`, under which every arm falls back to `a:` + slug.
  // A save must ⛔ never fail because the app could not reach a description of the vault.
  const ctx = await loadVaultContext(vaultContextUrl(source.at));
  // 🔴 C161 `S35` — the vault's own datom log, ⛔ not the master's `/base/a/<slug>` route. See the
  // block comment in `vaultContext.ts`: that route is structurally blind to `base-internal` terms,
  // so it can neither report a BARE binding nor an internal `a:` one, and the arm it gated fired
  // on 0 of 418 wire keys in production.
  const spellings = await resolveStoredSpellings(source.at, asked);
  // 🔴 C161 `D` r3 — the omission is gated on the VAULT'S OWN LOG, ⛔ not on the `@context` alone.
  // Asking only the `@context` would drop a REAL `a:constraints` row (an ADMITTED spelling) on a
  // vault that happens to hold one — a silent retraction. {@link omittableAssembledKeys} answers
  // from presence in both directions: unreadable log ⇒ EMPTY ⇒ omit nothing.
  const omit = await omittableAssembledKeys(source.at, ctx, asked);
  return (slug: string) =>
    // ⚠ Gated on `served.has(slug)`: only a key the VAULT ITSELF handed us may be dropped on the
    // vault's own say-so. A slug this app AUTHORS keeps this app's convention, whatever it is
    // called. A bucket NOT in this set is carried verbatim and the guard refuses — see
    // {@link omittableAssembledKeys} for why that is the only other safe answer.
    served.has(slug) && omit.has(slug)
      ? null
      : storedSpellingFor(slug, ctx, spellings.get(slug) ?? "unknown", served.has(slug));
}

/** A url-safe Slug hint for a legible minted URL (server still mints a unique id). */
function slugFromName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const clean = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return clean || undefined;
}

/**
 * POST /lws/vault/:vaultId/c — server-mints a NEW record of `type` INTO THE NAMED (viewed) vault
 * (Cycle053 VDS-4 FIX-1). `vaultNamespace` is the vault's `vault_id` NAMESPACE (`ReachableVault.vaultId`),
 * put in the request PATH; Base resolves it through the ONE write resolver and lands the create
 * in that vault iff the principal holds a whole-vault write grant on it — otherwise 403 (fail-closed,
 * NEVER the writer's own sign-in vault). Authorizes with the sender-constrained DPoP credential.
 * Returns the minted id + the initial ETag.
 */
export async function createRecord(
  vaultNamespace: string,
  typeUriValue: string,
  facts: RecordCreateFacts,
  nameHint?: string,
  /** C161 `S33` — where these slugs came from; omit for app-authored facts. {@link WriteSource} */
  source?: WriteSource,
): Promise<{ id: string; etag: string | null }> {
  const url = LWS_VAULT_CONTAINER_URL(vaultNamespace);
  const headers: Record<string, string> = {
    ...(await dpopWriteAuth("POST", url)),
    "content-type": "application/json",
  };
  const slug = slugFromName(nameHint);
  if (slug) headers["slug"] = slug;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: typeUriValue, facts: await toWireFacts(facts, source) }),
    // Survive a page unload / tab-hide that lands mid-request (the leave-time flush in
    // RecordDetail races navigation) — without this, Chrome/Firefox can abort an in-flight
    // fetch the instant the page starts unloading, silently dropping the write.
    keepalive: true,
  });
  if (!res.ok) await throwForCreateStatus(res);
  const location = res.headers.get("location");
  const etag = res.headers.get("etag");
  const id = location
    ? idFromResourceUrl(location)
    : idFromResourceUrl(String((await res.json().catch(() => ({})))["@id"] ?? ""));
  return { id, etag };
}

/**
 * GET /lws/r/:id — dereference a record from the vault. Returns null on 404 (absent /
 * unreadable / deleted — the non-disclosure floor). Carries the ETag for the next write.
 *
 * @param id the opaque record id
 * @param at 🔴 the record's OWN fully-qualified entity URI (`VaultRecordRef.entityUri`, a framed
 *   `@id`, a search hit, a 201 `Location`) — the request is addressed at ITS origin, because
 *   Base routes a dereference to a vault BY THE HOST THE REQUEST NAMES and answers about no
 *   other vault. Pass `null` ONLY where no URI exists (a `?rec=` deep link, a localStorage
 *   cache key); that falls back to `baseOrigin()` and therefore reaches only the vault that
 *   origin names. See {@link vaultOriginOf}. ⛔ Do not pass `undefined`/omit — the parameter is
 *   required so a site that discards the URI is a compile error, not a silent 404.
 */
/**
 * Cycle214 M3f r6 (Kai-Zen ruling on Agent.Tester s117 F-1): every read is its own request. Round 5 joined reads of one record asked
 * within 250 ms of each other; a write made through another transport of the page (process steps, relations, notes, files) did not
 * end the join, so a read after such a write could answer the record as it was before it. The join is removed; the card open stays
 * at or below main without it (the Stakeholders pages name the record's own vault, `snapshotKeyParts`).
 */
export async function readRecord(id: string, at: string | null): Promise<BaseRecord | null> {
  return readRecordOnce(id, LWS_RESOURCE_URL(id, at));
}

async function readRecordOnce(id: string, reqUrl: string): Promise<BaseRecord | null> {
  const res = await fetch(reqUrl, {
    method: "GET",
    headers: { ...(await authHeader(reqUrl)), accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) await throwForStatus(res);
  return recordFromServed(id, (await res.json()) as Record<string, unknown>, res.headers.get("etag"));
}

/**
 * A record as {@link readRecord} gives it, from a document the vault served for it and its ETag (M3f r5: also a row of a listing read
 * with `?include=body`, which carries the very document and ETag `GET /lws/r/<id>` serves — GilbPlatform VDT 119 S5a).
 *
 * @param id the record's id
 * @param doc the served document
 * @param etag the ETag served with it
 */
export function recordFromServed(id: string, doc: Record<string, unknown>, etag: string | null): BaseRecord {
  const facts: Record<string, string> = {};
  // 🔴 Cycle159 — recorded HERE, at the only place that still holds the served value. One
  // step later the object is gone and `""` is all there is, which is precisely how an
  // unreadable fact became an editable-looking empty field and then a retraction.
  const opaqueFacts: string[] = [];
  const served: Record<string, unknown> = {};
  const prefixed = new Set<string>();
  for (const [key, value] of Object.entries(doc)) {
    if (FRAME_META_KEYS.has(key)) continue;
    // Frame may use bare slug or a:slug — store bare for the editor.
    const slug = key.startsWith("a:") ? key.slice(2) : key;
    facts[slug] = factToString(value);
    served[slug] = value;
    // GAPP214.42 A1 — which spelling the kept value was served under ({@link ServedDocument.prefixedKeys}).
    if (key.startsWith("a:")) prefixed.add(slug);
    else prefixed.delete(slug);
    if (!isFactStringFaithful(value)) opaqueFacts.push(slug);
  }
  const atId = typeof doc["@id"] === "string" ? doc["@id"] : undefined;
  return {
    id,
    entityUri: atId,
    typeUri: typeUriFromFrame(doc["@type"]),
    ...(typeWasSubstituted(doc["@type"]) ? { typeSubstituted: true as const } : {}),
    facts,
    opaqueFacts,
    // 🔴 C161 `S33` — every slug here came off a document THE VAULT SERVED, which is the one
    // fact a write needs to invert its stored spelling honestly rather than re-mint `a:` + it.
    // Recorded HERE because one step later the provenance is gone. Free: no extra request.
    servedKeys: Object.keys(facts),
    etag,
    served: { facts: served, context: doc["@context"], etag, ...(prefixed.size ? { prefixedKeys: [...prefixed] } : {}) },
  };
}

/**
 * The served value of a fact cannot be sent back as a full address: a short form (`base:e/…`) whose
 * prefix the document's own `@context` does not declare. Nothing is written.
 * ([[Rule_Code_gilb-record-io#RuleBaseioNoReadReplaceRoundTrip]]: a short form that cannot be
 * expanded from the document's own context is refused, ⛔ not guessed.)
 */
export class ServedShortFormError extends Error {
  constructor(slug: string, value: string) {
    super(`This record holds a link this app cannot read in full (${slug}: ${value}), so nothing was changed.`);
    this.name = "ServedShortFormError";
  }
}

/**
 * GAPP214.42 F2 — a fact served as a bare address may be a link (a term the vault types
 * `"@type": "@id"`) or text, and the vault's own context, which says which, could not be read.
 * Sent as text, a link would be stored as text, so nothing is written.
 */
export class ServedLinkUnreadableError extends Error {
  constructor(slug: string, value: string) {
    super(`This app could not read the vault's description to tell whether ${slug} (${value}) is a link, so nothing was changed. Try again in a minute.`);
    this.name = "ServedLinkUnreadableError";
  }
}

/** The inline parts of a served `@context` (an object, or the objects in a list), merged. A URL in
 *  it is ⛔ never fetched: on `GET /lws/r` it is the LWS address (www.w3.org, 404). */
function inlineContext(ctx: unknown): Record<string, unknown> {
  const parts = Array.isArray(ctx) ? ctx : [ctx];
  return Object.assign({}, ...parts.filter((x) => x && typeof x === "object" && !Array.isArray(x)));
}

/** An address that names itself in full (`https://…`, `urn:…`) — no prefix to expand. */
const ABSOLUTE_IRI = /^(?:[A-Za-z][A-Za-z0-9+.-]*:\/\/|urn:)/;
/** A `prefix:rest` short form. */
const SHORT_FORM = /^([A-Za-z][A-Za-z0-9_.-]*):(.*)$/s;

/**
 * 🔴 GAPP214.42 (N1) — the facts a FULL-STATE write sends for a record: every fact the person did
 * not edit EXACTLY as the vault served it, and the person's own edits as typed.
 *
 * Why: a full replace (`PUT /lws/r/:id`, the share act) retracts every fact it omits and stores what
 * it is sent verbatim. Sent from {@link BaseRecord.facts}, a link `{"@id": X}` was stored as the text
 * `"X"` (measured: `a:statedBy` after a retype, `is_ref` false), a list of links became one string,
 * and every fact the editor never held (a grant, a value with no string form, another app's fact)
 * was retracted. ([[Rule_Code_gilb-record-io#RuleBaseioNoReadReplaceRoundTrip]]: send back what you
 * received for every attribute you did not edit.)
 *
 * Per served fact `k`:
 *   - `k` in `edit.send`: unedited when the string equals what the editor was handed
 *     (`factToString(served)`) ⇒ the SERVED value; else the person's string.
 *   - `k` held by the editor but not in `edit.send` ⇒ omitted: the write drops it on purpose (a retype
 *     into a party kind writes the name under its one home only).
 *   - `k` never held by the editor ⇒ the served value.
 * Then every `edit.send` key the document does not serve, as typed. No `edit` (a share) ⇒ every
 * served fact as served.
 *
 * A served value goes out with full addresses: a short form is expanded only by a prefix the
 * document itself declares inline ({@link ServedShortFormError} otherwise: nothing is sent). A term
 * typed `"@type": "@id"` (served as a bare string) goes back as `{"@id"}`.
 *
 * 🔴 GAPP214.42 F2/B1 — the term types come from the VAULT'S OWN context (`vaultContextUrl(at)`),
 * ⛔ not from the document's `@context`: on `GET /lws/r` that is `https://www.w3.org/ns/lws/v1`
 * (404), so the id-valued arm never ran and every such write asked www.w3.org. The vault's context
 * is read once ({@link readVaultContext}: time limit, kept), and only when a kept fact is a bare
 * address-shaped string. Its prefixes are ⛔ not used: `/lws/r` compacts with OWNER_HOST's, not the
 * vault host's. Not read ⇒ such a fact may be a link we cannot tell ⇒
 * {@link ServedLinkUnreadableError}: nothing is sent.
 *
 * 🔴 GAPP214.42 A1 (BVedanta) — a term's type applies only to a value served under the term's OWN
 * name. The read serves a link as `fvParent`; a value stored as TEXT under `a:fvParent` is served as
 * `a:fvParent` (the context's `"@type": "@id"` does not match it). That value goes back as served:
 * turning it into a link would change a value the person did not edit
 * ([[Rule_Code_gilb-record-io#RuleBaseioNoReadReplaceRoundTrip]]). It never asks for the context.
 *
 * @param served the document as {@link readRecord} served it — read at the ETag the write binds to
 * @param at the record's own entity URI (names the vault whose context is read when one is needed)
 * @param edit the editor's facts (`held`) and the write's string facts built from them (`send`)
 * @returns the facts, and the slugs whose served value is `""` (carried, ⛔ not dropped as unset)
 */
export async function factsAsServed(
  served: ServedDocument,
  at: string | null,
  edit?: { held: RecordFacts; send: RecordFacts },
): Promise<{ facts: RecordCreateFacts; keepEmpty: ReadonlySet<string> }> {
  const out: RecordCreateFacts = {};
  const keepEmpty = new Set<string>();
  const kept: [string, unknown][] = [];
  for (const [k, raw] of Object.entries(served.facts)) {
    if (raw == null) continue;
    if (edit) {
      if (k in edit.send) {
        if (edit.send[k] !== factToString(raw)) continue;
      } else if (k in edit.held) continue;
    }
    kept.push([k, raw]);
  }
  const inline = inlineContext(served.context);
  const prefixes = parseVaultPrefixes(inline);
  const inlineTerms = parseVaultContext(inline);
  const prefixed = new Set(served.prefixedKeys ?? []);
  const untyped = kept.filter(([k, raw]) => !prefixed.has(k) && !inlineTerms.has(k) && servedAsAddress(raw));
  const vault = untyped.length ? await readVaultContext(vaultContextUrl(at)) : null;
  if (vault && !vault.answered) {
    const [k, raw] = untyped[0]!;
    throw new ServedLinkUnreadableError(k, String(Array.isArray(raw) ? raw.find((x) => typeof x === "string") : raw));
  }
  const idValued = (k: string): boolean => !prefixed.has(k) && (inlineTerms.get(k) ?? vault?.terms.get(k))?.idValued === true;
  const full = (slug: string, id: string): string => {
    if (ABSOLUTE_IRI.test(id)) return id;
    const m = SHORT_FORM.exec(id);
    const base = m ? prefixes.get(m[1]!) : undefined;
    if (m && base) return `${base}${m[2]}`;
    throw new ServedShortFormError(slug, id);
  };
  const expand = (slug: string, v: unknown, idValued: boolean): unknown => {
    if (Array.isArray(v)) return v.map((x) => expand(slug, x, idValued));
    if (typeof v === "string") return idValued ? { "@id": full(slug, v) } : v;
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [key, x] of Object.entries(v as Record<string, unknown>)) {
        o[key] = key === "@id" && typeof x === "string" ? full(slug, x) : expand(slug, x, false);
      }
      return o;
    }
    return v;
  };
  for (const [k, raw] of kept) {
    out[k] = expand(k, raw, idValued(k)) as RecordFactValue;
    if (raw === "") keepEmpty.add(k);
  }
  if (edit) for (const [k, v] of Object.entries(edit.send)) if (!(k in out)) out[k] = v;
  return { facts: out, keepEmpty };
}

/** True when `v` is served as a bare string shaped like an address or short form (or a list holding
 *  one): what a term typed `"@type": "@id"` is served as, so its type decides link or text. */
function servedAsAddress(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(servedAsAddress);
  return typeof v === "string" && SHORT_FORM.test(v) && !/\s/.test(v);
}

/**
 * A JSON Merge Patch member value (RFC 7386). Scalar string|null remains the common
 * single-attribute path; arrays and objects are needed for structured attributes
 * (e.g. a process `entryCondition` array — arrays replace WHOLESALE).
 */
export type MergePatchValue =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: unknown }
  | readonly unknown[];

/**
 * PATCH /lws/r/:id — JSON Merge Patch (RFC 7386). A `null` member deletes that attribute;
 * any other value replaces it. No `If-Match` by default (a targeted single-attribute edit).
 * GAPP214.30b (D1 W2): a save that RETRACTS a fact by identity passes `ifMatch`, the version it
 * read, so the write is conditional (GilbPlatform .25d, PR #455). GilbPlatform `main` honours
 * `If-Match` on PATCH (measured at `e6a09255`, `src/lws/crud.ts`: the precondition is compared
 * inside the write's transaction, a mismatch answers 412, and the response's `etag` is exposed
 * cross-origin by `cors.ts`); a door built before that change ignores the header and writes
 * unconditionally. A 412 is a `RecordConflictError`, as on PUT. Returns the new ETag. Slugs go through
 * {@link attrKey} — callers never hand-build `a:` keys.
 *
 * @param at the record's own entity URI — see {@link readRecord}.
 */
export async function patchRecord(
  id: string,
  patch: Record<string, MergePatchValue>,
  at: string | null,
  /** C161 `S33` — where these slugs came from; omit for app-authored facts. {@link WriteSource} */
  source?: WriteSource,
  precondition?: { ifMatch?: string | null },
): Promise<{ etag: string | null }> {
  const spell = await storedSpellings(Object.keys(patch), source);
  const wire: Record<string, MergePatchValue> = {};
  for (const [slug, value] of Object.entries(patch)) {
    // 🔴 C161 `D` — same omission as the full-replace path. ⚠ Measured before relying on it:
    // NO caller passes an assembled bucket as a patch slug (0 non-test occurrences of all seven
    // as an object key), so this arm is a floor, ⛔ not a live behaviour change to the patch API.
    const key = spell(slug);
    if (key !== null) wire[key] = value;
  }
  const reqUrl = LWS_RESOURCE_URL(id, at);
  const res = await fetch(reqUrl, {
    method: "PATCH",
    headers: {
      ...(await authHeader(reqUrl, "PATCH")),
      "content-type": "application/merge-patch+json",
      ...(precondition?.ifMatch ? { "if-match": precondition.ifMatch } : {}),
    },
    body: JSON.stringify(wire),
    keepalive: true, // same unload-survival rationale as createRecord/replaceRecord
  });
  if (!res.ok) {
    try {
      await throwForStatus(res);
    } catch (e) {
      // createRecord already carries HTTP status on the Error. PATCH did not, so a 409 tag
      // collision on the card was only the generic "Couldn't save".
      if (e && typeof e === "object" && !("status" in e)) (e as { status: number }).status = res.status;
      throw e;
    }
  }
  return { etag: res.headers.get("etag") };
}
