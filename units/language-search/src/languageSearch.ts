// Language search: the catalogue's human languages by name, and the one catalogue entry for a stored contact-language tag.
// A sibling of the skill search, not a reuse of it: skill search drops every hit whose typeUri is not a /base/t/ name,
// and language hits have typeUri null, so that filter would return nothing.
//
// WHERE the catalogue is asked: the ontology origin the host set once (`setTermOrigin`, unit `term-origin`), read at
// each call, with `vault=<that origin>/base`. The request is anonymous.
import { contactLanguageName, primaryLanguageSubtag, readLanguageEntry, sameLanguageTag } from "@kaigilb/gilbplatformcode-language-entry";
import type { LanguageEntryInfo } from "@kaigilb/gilbplatformcode-language-entry";
import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";

export const LANGUAGE_SEARCH_DEBOUNCE_MS = 140;
export const LANGUAGE_SEARCH_MIN_CHARS = 1;
export const LANGUAGE_SEARCH_LIST_CHARS = 2;

/** The ontology vault the language Find scans: read at call time from the origin the host set. */
function languageVaultId(): string {
  return `${termOrigin()}/base`;
}

/**
 * A catalogue language entry's address on the ontology origin the host set, read NOW (not when this file loads). A held
 * language claim refuses anything else, so an address on another origin is refused.
 */
export function languageEntityPattern(): RegExp {
  return new RegExp(`^${termOrigin().replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}/base/e/[A-Za-z0-9]+$`);
}

export interface LanguageHit {
  /** The entry to store. Never the name, never a /base/t/ IRI. */
  entity: string;
  label: string;
}

export interface LanguageSearchPage {
  hits: LanguageHit[];
  /** Present when the server has another page. */
  next: string | null;
}

export class LanguageSearchError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(`LanguageSearch ${status}${detail ? ` — ${detail}` : ""}`);
    this.name = "LanguageSearchError";
    this.status = status;
  }
}

interface WireHit {
  entity?: unknown;
  label?: unknown;
  typeUri?: unknown;
}

/**
 * Search human languages. Always sends type=HumanLanguage.
 * Without that type, the same words also return deprecated terms and skills.
 */
export async function searchLanguagesRemote(
  q: string,
  opts: { signal?: AbortSignal; cursor?: string } = {},
): Promise<LanguageSearchPage> {
  const needle = q.trim();
  if (needle.length < LANGUAGE_SEARCH_MIN_CHARS && !opts.cursor) {
    return { hits: [], next: null };
  }
  const params = new URLSearchParams({
    q: needle,
    match: "prefix",
    vault: languageVaultId(),
    type: "HumanLanguage",
  });
  if (opts.cursor) params.set("cursor", opts.cursor);
  const url = `${termOrigin()}/base/search?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: opts.signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new LanguageSearchError(res.status, detail.slice(0, 200));
  }
  const body = (await res.json()) as { hits?: unknown; next?: unknown };
  const raw = Array.isArray(body.hits) ? (body.hits as WireHit[]) : [];
  const entityPattern = languageEntityPattern();
  const hits: LanguageHit[] = [];
  for (const hit of raw) {
    const entity = typeof hit.entity === "string" ? hit.entity.trim() : "";
    if (!entityPattern.test(entity)) continue;
    // A /t/ IRI is a term, not a language entry. Never offer one.
    if (typeof hit.typeUri === "string" && hit.typeUri.includes("/base/t/")) continue;
    const label = typeof hit.label === "string" ? hit.label.trim() : "";
    if (!label) continue;
    hits.push({ entity, label });
  }
  const next = typeof body.next === "string" && body.next ? body.next : null;
  return { hits, next };
}

/** How many catalogue hits are read to find a legacy value's entry. */
const LEGACY_LOOKUP_MAX = 12;

/**
 * The catalogue entry for a stored contact-language tag, so a legacy value can be listed: search the
 * catalogue by the browser's name for the tag's language, keep only the hits whose own tag has the same
 * primary subtag. Exactly one → that entry. Zero or several → `null`: it does not guess, and the row stays
 * the marked legacy row.
 */
export async function findEntryForLegacyTag(tag: string, opts: { signal?: AbortSignal } = {}): Promise<LanguageEntryInfo | null> {
  const primary = primaryLanguageSubtag(tag);
  if (primary === "") return null;
  const name = contactLanguageName(primary) ?? contactLanguageName(primary, ["en"]);
  if (!name) return null;
  const page = await searchLanguagesRemote(name, { signal: opts.signal });
  // The hits are read together (a name like "English" has a dozen catalogue neighbours); one that does not read is
  // not a match, and is ⛔ never guessed into one.
  const read = await Promise.all(
    page.hits.slice(0, LEGACY_LOOKUP_MAX).map((hit) => readLanguageEntry(hit.entity, { signal: opts.signal }).catch(() => null)),
  );
  const found = read.filter((info): info is LanguageEntryInfo => info !== null && info.tag !== null && sameLanguageTag(info.tag, primary));
  return found.length === 1 ? found[0]! : null;
}
