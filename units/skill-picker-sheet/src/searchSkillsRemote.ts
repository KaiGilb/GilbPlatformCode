// Live skill search: `GET /base/search?match=prefix` over the ESCO corpus in the ontology vault
// (~16k concepts x 29 languages), authorized Find + phrase_prefix. Replaces a static typeahead catalogue.
// The picker's `{tag, typeUri}` contract is preserved; the hierarchy path is not emitted by the server and is
// not invented here.
//
// WHERE the catalogue is asked: the ontology origin the host set once (`setTermOrigin`, unit `term-origin`),
// with `vault=<that origin>/base`. The request is anonymous (public vocabulary Find).

import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { readResultTotal, exactCount, type ResultTotal } from "@kaigilb/gilbplatformcode-result-total";
import type { ThinSkill } from "@kaigilb/gilbplatformcode-contact-rows";

/** Debounce for the skill typeahead — matches BaseApp TypeChooser. */
export const SKILL_SEARCH_DEBOUNCE_MS = 140;

/**
 * SEARCH_MIN_CHARS stays at 1 so the latency criterion is measured at the shape
 * most at risk. The UI renders 1 char as keep-typing; the list appears at 2–3
 * (relevance, not speed — a flat-scored 1-char prefix is an arbitrary 20 of ~15k).
 */
export const SKILL_SEARCH_MIN_CHARS = 1;

/** Characters at which the result list is shown (keep-typing below this). */
export const SKILL_SEARCH_LIST_CHARS = 2;

/**
 * Cap reconciles with Base `SEARCH_PAGE_SIZE = 20`. Raising the server clamp
 * would widen every Find surface; the picker moves to 20.
 */
export const SKILL_SEARCH_RESULT_CAP = 20;

/** The ESCO / ontology system vault the skill Find scans: read at call time from the origin the host set. */
export function vedaVaultId(): string {
  return `${termOrigin()}/base`;
}

/** Shape of one enriched hit from `GET /base/search?match=prefix`. */
export interface SkillSearchHit {
  entity: string;
  label: string | null;
  typeUri: string | null;
  does: string | null;
}

export interface SkillSearchResponse {
  /** The DISCLOSED total: the figure AND what it is. `null` when the
   * read established none. Absent entirely on an older server. */
  total?: { kind?: unknown; value?: unknown } | null;
  /** EXACT-ONLY: present IFF the total is a census. Do not read
   * this field; read `total` through `readResultTotal`. */
  count?: number;
  ids: string[];
  hits?: SkillSearchHit[];
  complete?: boolean;
  pageSize?: number;
}

export interface SkillSearchResult {
  skills: ThinSkill[];
  /** The DISCLOSED corpus total, or `null` when the server established
   * none. NOT a bare number: a picker that prints `value` without `kind` would
   * show a BOUND as a census. Render it via `formatResultTotal`. */
  total: ResultTotal | null;
  complete: boolean;
  /** Reality disclosure: the answer is from the live corpus, not the thin catalog. */
  source: "live-corpus";
}

export class SkillSearchError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(`SkillSearch ${status}${detail ? ` — ${detail}` : ""}`);
    this.name = "SkillSearchError";
    this.status = status;
  }
}

/**
 * Search skills on the live ESCO corpus via the authorized Find + phrase_prefix.
 *
 * Anonymous public read on the ontology vault; the request goes to the host's term origin with `?vault=<that origin>/base`.
 * No client-side filtering of a wider fetch — the server applies LIMIT and authz.
 *
 * @param q raw user query (tokens lowercased server-side via queryTokens)
 * @param opts.signal abort in-flight on new keystroke
 */
export async function searchSkillsRemote(
  q: string,
  opts: { signal?: AbortSignal; limit?: number; preferHeld?: boolean } = {},
): Promise<SkillSearchResult> {
  const needle = q.trim();
  if (needle.length < SKILL_SEARCH_MIN_CHARS) {
    // An exhausted set of size zero IS a census, declared as one.
    return { skills: [], total: { kind: "exact", value: 0 }, complete: true, source: "live-corpus" };
  }

  // The canonical skill referent shape: `<origin>/base/t/<PascalName>`, built at call time from the same origin.
  const MASTER = termOrigin().replace(/[.*+?^$()|[\]\\/{}]/g, "\\$&");
  const CANONICAL_REFERENT = new RegExp(`^${MASTER}/base/t/[A-Z][A-Za-z0-9]*$`);

  const params = new URLSearchParams({
    q: needle,
    match: "prefix",
    vault: vedaVaultId(),
  });
  // People-search only. The picker omits this so its ranking stays the catalogue typeahead.
  if (opts.preferHeld === true) params.set("prefer", "held");
  const url = `${termOrigin()}/base/search?${params.toString()}`;
  // Public vocabulary Find — no Authorization header. Carrying a token can force a
  // CORS preflight that the public search surface does not need; anonymous is the
  // measured production path.
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: opts.signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new SkillSearchError(res.status, detail.slice(0, 200));
  }
  const body = (await res.json()) as SkillSearchResponse;
  const hits = Array.isArray(body.hits) ? body.hits : [];
  const limit = opts.limit ?? SKILL_SEARCH_RESULT_CAP;
  const skills: ThinSkill[] = [];
  for (const h of hits) {
    if (skills.length >= limit) break;
    const typeUri = h.typeUri?.trim() || null;
    if (!typeUri || !CANONICAL_REFERENT.test(typeUri)) continue;
    const tag = (h.label?.trim() || typeUri.split("/").pop() || "").trim();
    if (!tag) continue;
    skills.push({
      tag,
      uri: h.entity,
      typeUri,
      does: h.does?.trim() || "",
      escoUri: null,
      harnessRole: null,
      // Hierarchy path is not on the wire today — retired for remote results
      // Do not invent a path.
    });
  }
  // Read `total`, never `count`. An older line here fell back to
  // `skills.length` when `count` was missing, which after the server change would have
  // rendered "Top 20 of 20 matches" over a corpus the server said had thousands: a
  // silent lie that no test would catch, on exactly the large answer sets where the
  // server now reports a bound.
  const total = readResultTotal(body);
  const census = exactCount(total);
  return {
    skills,
    total,
    // "This page IS the whole answer" is knowable ONLY from a census. Under a BOUND the
    // answer is by construction larger than the window, and under no total at all it is
    // unknown ⇒ not complete. The server's own `complete` flag still wins when present.
    complete: body.complete === true || (census !== null && census <= skills.length),
    source: "live-corpus",
  };
}
