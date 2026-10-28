import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { NotSignedInError, bearerHeaderFor, tokenManager } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { readResultTotal, type ResultTotal } from "@kaigilb/gilbplatformcode-result-total";
import { typeLocalName } from "./recordPlane";

/** One facet bucket — a category value + how many matches fall in it. */
export interface FacetBucket {
  key: string;
  count: number;
}

/** The Find result — the DISCLOSED total + the ranked entity-URI page (+ optional facets). */
export interface SearchResult {
  /**
   * 🔴 Cycle144 — the DISCLOSED total: the figure AND what it is
   * ([3P.C.ResultTotal.DisclosedApproximationAndExactOnRequest.Base]). `null` when the
   * server established none. ⛔ NEVER read `.value` without `.kind`; use
   * `exactCount()` for a census and `formatResultTotal()` for anything a human reads.
   */
  total: ResultTotal | null;
  /**
   * 🔴 Cycle161 — the OPAQUE keyset continuation, or `null` when this page IS the whole
   * answer. Feed it back as `?cursor=` to get the next page.
   *
   * ⚠ `undefined` and `null` mean DIFFERENT things and the difference is load-bearing:
   * `null` is a Base that paged and said "there is no more"; `undefined` is a Base that
   * predates the continuation and cannot say either way. A caller must not read `undefined`
   * as "complete" — it is "unknown", and the honest response to unknown is to stop asking
   * rather than to claim the list is whole.
   */
  next?: string | null;
  /**
   * ⚠ EXACT-ONLY and OPTIONAL since Cycle144 — present IFF the total is a census.
   * ⛔ `undefined` is PRESERVED here on purpose: the old parse collapsed it to `0`,
   * which is indistinguishable from "no matches" and made `narrowTotal`'s correct
   * missing-total branch dead code on this route.
   */
  count?: number;
  /** The ranked page of matching entity URIs, most-relevant first. */
  ids: string[];
  /** Facet buckets when `?facet=` was given. */
  facets?: FacetBucket[];
}

/** Raised when the Find surface cannot be reached — a genuine outage (the vault is down,
 * the network dropped, the route errored). It is NOT a "not built yet" state: the route
 * is live, so if this fires something is actually wrong and the UI says so plainly. */
export class SearchUnavailableError extends Error {
  constructor(cause?: string) {
    super(`Search could not reach your vault${cause ? ` (${cause})` : ""}`);
    this.name = "SearchUnavailableError";
  }
}

/** The Bearer auth header, minted/re-minted through the O.7 bridge (same seam as records).
 * For one request to `url`, through the one credential seam (`bearer.ts` `bearerHeaderFor`). */
function authHeader(url: string): Promise<Record<string, string>> {
  return bearerHeaderFor(url);
}

/** The `<id>` (trailing opaque segment) of a `…/base/e/<id>` entity URI. */
export function idFromEntityUri(uri: string): string {
  const i = uri.lastIndexOf("/");
  return i === -1 ? uri : uri.slice(i + 1);
}

/**
 * Cycle165 BAPP165.R6 — F-TEXT named types. Bare local names (`NoteDocument`), ⛔ not `t:`.
 * Empty / blank is a miss.
 */
export function bareTypeNames(types: readonly string[] | null | undefined): string[] {
  return [...new Set((types ?? []).map((t) => t.trim()).filter((n) => n.length > 0))];
}

/**
 * The `types` argument that asks for the vault to be searched **by words alone** — no `type=`
 * conjunct on the wire, still vault-scoped and still authorization-filtered row-by-row by the
 * server.
 *
 * 🔴 IT IS A NAMED VALUE, ⛔ an empty array, and that distinction is the whole of Cycle165 R6.
 * R6 ruled that "empty types is a miss, ⛔ not an untyped BM25 fetch" — the concern being that a
 * page of rows nobody scoped should never be what an empty array silently DECAYS into. Passing
 * `UNTYPED_FIND` cannot happen by accident: an empty list, a filtered-to-nothing list and an
 * undefined variable all still take the miss branch. A reader of any call site can see which of
 * the two was chosen, which is exactly what R6 protects.
 *
 * ⚠ R6's stated RATIONALE — that an untyped page returns rows of unknown identity — was measured
 * FALSE on 2026-09-04: `base.entity_state.type_uri` is `NOT NULL` and
 * `SELECT count(*) FROM base.entity_state WHERE type_uri = ''` is **0** on both the `base` and
 * the `base_vaults` store. Every row this returns carries a type and renders under its own type
 * name; the caller simply did not enumerate the types in advance.
 */
export const UNTYPED_FIND = "untyped-find" as const;

/**
 * GET /base/search — F-TEXT (Type + words). Returns count + ranked entity-URI page (+ facets).
 *
 * A 401 is a real sign-out (the token expired / the session ended), so it drops the token
 * and raises NotSignedInError — the same posture records.ts and files.ts take on this
 * origin. It is NOT swallowed into an "unavailable" state any more: doing that told a
 * signed-out user the feature was unbuilt. A network/transport failure raises
 * SearchUnavailableError, which now means what it says. Bodies are NOT returned — hydrate
 * the ids via `GET /lws/r/<id>` (readRecord).
 *
 * Cycle165 BAPP165.R6 — `types` is required. Empty types is a miss (no fetch). Each bare
 * name is sent as `type=<TYPE_BARE>`. ⛔ Untyped BM25 is not the identity of a row.
 */
export async function searchEntities(
  q: string,
  types: readonly string[] | typeof UNTYPED_FIND,
  facet?: string,
  /** Optional vault namespace URI — scopes the Find to the vault the SPA is browsing. */
  vaultId?: string | null,
  /** 🔴 Cycle127 · BAPP127.1-M — `"prefix"` asks the vault to match from the START of a word
   * (`?match=prefix`, Base Cycle128 A′ → `paradedb.phrase_prefix` with an UNCAPPED expansion).
   * ⚠ Omitted keeps the shipped whole-token BM25 for every existing caller — the route's own
   * default is `text`, so no current surface changes shape. */
  match?: "text" | "prefix",
  /** 🔴 Cycle161 — the opaque `next` from the previous page. Omitted ⇒ the FIRST page,
   * byte-identical to every pre-Cycle161 call. */
  cursor?: string | null,
  /** Cycle211 — `anonymous: true` asks with NO token (a public vault, nobody signed in). The
   * vault's public-read grant is then the only authority; everything else is this same client. */
  opts?: { anonymous?: boolean },
): Promise<SearchResult> {
  if (types === UNTYPED_FIND) return issueFind(q, null, facet, vaultId, match, cursor, opts);
  const typeNames = bareTypeNames(types);
  if (typeNames.length === 0) {
    // F-TEXT miss: ⛔ not an untyped BM25 fetch. Empty is complete.
    // 🔴 Cycle165 R6 STANDS, UNCHANGED. Naming no type here is still a MISS and still issues no
    // request. A caller that genuinely wants the vault searched without a type conjunct must say
    // so by passing `UNTYPED_FIND` — a named value a reader and a reviewer can both see at the
    // call site. ⛔ Do not "fix" this branch by falling through to the untyped fetch.
    return { total: null, ids: [] };
  }
  return issueFind(q, typeNames, facet, vaultId, match, cursor, opts);
}

/**
 * The ONE `/base/search` client — shared by the typed and the untyped act.
 *
 * ⛔ There is no second Find client and no second copy of the 401 / 403 / transport handling or
 * of the `total` reading ([[Rule_Code_reuse-and-parity-guards#RuleReuseguardBehaviourNotFiles]]).
 *
 * @param typeNames the bare names to conjoin, or `null` to send no `type=` at all
 */
async function issueFind(
  q: string,
  typeNames: readonly string[] | null,
  facet?: string,
  vaultId?: string | null,
  match?: "text" | "prefix",
  cursor?: string | null,
  opts?: { anonymous?: boolean },
): Promise<SearchResult> {
  const params = new URLSearchParams({ q });
  // F-TEXT template: `/base/search` **plus** `type=<TYPE_BARE>`. Bare local name, repeatable.
  //
  // 🔴 STALE-COMMENT CORRECTION, 2026-09-04. This said Base "does not yet declare `type` and
  // sets `additionalProperties: false` — a live 400 is a Base serving gap". It was wrong in the
  // way that mattered: Base DID declare `type`, as a bare **string**, so a repeated param
  // arrived as an array and ajv answered `400 querystring/type must be string`. The gap was
  // string-vs-array, ⛔ absence — and reading it as absence is why that 400 was filed as someone
  // else's serving gap instead of a two-shape schema. Base `vacoder/c161-search-type-array`
  // declares `anyOf[string, string[]]`. ⚠ STALE-COMMENT CORRECTION, 2026-09-05, flagged by
  // independent QA: this said the array was "bounded at SEARCH_TYPE_PARAM_MAX = 200". That
  // constant NO LONGER EXISTS — the route deleted its private cap and moved the token grammar
  // and the bound onto the SHIPPED `requestedTypeNames` selector, because two normalisations
  // disagreed and `?type=t:` passed the private guard then reduced to nothing in the read
  // layer, widening a TYPED Find to an untyped one with a 200. Naming a deleted constant here
  // would send the next reader looking for a cap that is enforced somewhere else entirely.
  // Over the bound is still a 400, never a truncated 200. Hit-list fill still keeps only named types after F-OPEN.
  for (const t of typeNames ?? []) params.append("type", t);
  if (facet) params.set("facet", facet);
  if (vaultId) params.set("vault", vaultId);
  if (match === "prefix") params.set("match", "prefix");
  // 🔴 Cycle161 — the continuation. ⛔ Only ever a token THIS ROUTE issued (Base refuses a
  // hand-made one with a 400 rather than serving page 1), so it is passed through opaquely
  // and never constructed here.
  if (cursor) params.set("cursor", cursor);
  let res: Response;
  try {
    // vaultId's authority IS the vault's host, so Find is asked of the node that holds
    // the vault. `vault=` stays: the server resolves which vault from it — the host says
    // which node answers, not which vault.
    const reqUrl = `${vaultOriginOf(vaultId)}/base/search?${params.toString()}`;
    res = await fetch(reqUrl, {
      method: "GET",
      headers: { ...(opts?.anonymous ? {} : await authHeader(reqUrl)), accept: "application/json" },
    });
  } catch (e) {
    // A transport-level rejection (vault unreachable, connection dropped). The route is
    // CORS-covered, so this is a real failure, not an expected block.
    if (e instanceof NotSignedInError) throw e;
    throw new SearchUnavailableError("network");
  }
  if (res.status === 401) {
    // A real sign-out — the same handling every other call on this origin gives a 401.
    tokenManager.invalidate();
    throw new NotSignedInError();
  }
  if (res.status === 403) throw new SearchUnavailableError("403");
  if (!res.ok) throw new SearchUnavailableError(String(res.status));
  const body = (await res.json()) as { total?: unknown; count?: unknown; ids?: string[]; facets?: FacetBucket[]; next?: unknown };
  // 🔴 Cycle144 — read `total`, and PRESERVE an absent `count`. `?? 0` here was the
  // single highest-leverage defect in this repo: it turned "the server declined to
  // establish a census" into "zero matches", and every surface downstream inherited it
  // — including the Standards tab, which printed "the vault found nothing matching X"
  // above the rows it had just rendered.
  const total = readResultTotal(body);
  return {
    total,
    ...(typeof body.count === "number" ? { count: body.count } : {}),
    ids: body.ids ?? [],
    // ⚠ Carried through with its THREE states intact — a string continues, `null` ends the
    // walk, and ABSENT stays absent (a Base that predates this door cannot say either way, and
    // flattening that to `null` would let a caller claim a list is whole on a server that never
    // said so).
    ...(typeof body.next === "string" || body.next === null ? { next: body.next } : {}),
    ...(body.facets ? { facets: body.facets } : {}),
  };
}
