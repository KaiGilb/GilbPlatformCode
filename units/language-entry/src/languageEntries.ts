/**
 * One language catalogue entry as a list needs it (its address, name, tag, code and countries), and the one read of it.
 *
 * The entry is read at its own address, once per session, through the shared pool, with a timeout; a failed read is not
 * remembered and says so, so a row is never shown as another language.
 */
import { FetchTimeoutError, pooledGet } from "@kaigilb/gilbplatformcode-language-fetch-pool";
import { contactLanguageTagFor, iso6393CodeOf, languageEntryReadUrl } from "./contactLanguageTag";

/** The first (language) subtag of a BCP-47 tag, lower case: `pt-BR` → `pt`. */
export function primaryLanguageSubtag(tag: string): string {
  return (tag.trim().toLowerCase().split(/[-_]/)[0] ?? "").trim();
}

/** Do two tags name the same language (same primary subtag)? Nothing equals nothing. */
export function sameLanguageTag(a: string, b: string): boolean {
  const x = primaryLanguageSubtag(a);
  return x !== "" && x === primaryLanguageSubtag(b);
}

/** One catalogue language, as the list needs it. */
export interface LanguageEntryInfo {
  /** The entry's address (`https://<host>/base/e/…`). */
  uri: string;
  /** The entry's own name ("Norwegian"). */
  label: string;
  /** The BCP-47 tag the browser makes from the entry's ISO 639-3 code, or null when it has none. */
  tag: string | null;
  /** The entry's own ISO 639-3 code (three letters, lower case), or null when it has none. */
  code: string | null;
  /** The countries the entry names (`a:languageCountry`), as addresses; empty when it names none. */
  countries: readonly string[];
}

export class LanguageEntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LanguageEntryError";
  }
}

function textOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(textOf).find((s) => s) ?? "";
  if (v && typeof v === "object" && typeof (v as { "@value"?: unknown })["@value"] === "string") return (v as { "@value": string })["@value"];
  return "";
}

function refsOf(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
  const out: string[] = [];
  for (const x of raw) {
    const id = typeof x === "string" ? x : x && typeof x === "object" ? (x as { "@id"?: unknown })["@id"] : null;
    if (typeof id === "string" && /^https:\/\/[^/\s]+\/.+/.test(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** One served `t:HumanLanguage` document as the list needs it. Pure. */
export function languageEntryInfoOf(uri: string, doc: unknown): LanguageEntryInfo {
  const d = (doc && typeof doc === "object" && !Array.isArray(doc) ? doc : {}) as Record<string, unknown>;
  const pick = (bare: string): unknown => d[bare] ?? d[`a:${bare}`];
  const code = iso6393CodeOf(d);
  return {
    uri,
    label: textOf(pick("label")).trim() || uri.slice(uri.lastIndexOf("/") + 1),
    tag: code ? contactLanguageTagFor(code) : null,
    code,
    countries: refsOf(pick("languageCountry")),
  };
}

const entries = new Map<string, Promise<LanguageEntryInfo>>();

/** Test seam — ⛔ never called by product code. */
export function __resetLanguageEntries(): void {
  entries.clear();
}

/** The longest one catalogue entry may take to answer before the read is given up (and said so). */
export const LANGUAGE_ENTRY_TIMEOUT_MS = 8000;

/**
 * Reads one catalogue language (one GET, kept for the session). A failed read is ⛔ not remembered, and
 * says so: the row is then listed by its address and cannot be marked, ⛔ never shown as another language.
 * The read goes through the shared pool (at most 8 files at once, `fetchPool.ts`) and is bounded by a timeout
 * that starts when the read starts, so one entry that never answers cannot hold the others back.
 */
export function readLanguageEntry(uri: string, opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<LanguageEntryInfo> {
  let p = entries.get(uri);
  if (!p) {
    p = (async () => {
      try {
        return await pooledGet(
          languageEntryReadUrl(uri),
          { headers: { Accept: "application/ld+json, application/json" }, signal: opts.signal },
          async (res) => {
            if (!res.ok) throw new LanguageEntryError(`The language list answered ${res.status} for this language.`);
            return languageEntryInfoOf(uri, await res.json().catch(() => null));
          },
          { timeoutMs: opts.timeoutMs ?? LANGUAGE_ENTRY_TIMEOUT_MS },
        );
      } catch (e) {
        if (e instanceof LanguageEntryError) throw e;
        if (e instanceof FetchTimeoutError) throw new LanguageEntryError("The language list did not answer in time.");
        throw new LanguageEntryError("The language list could not be reached right now.");
      }
    })();
    entries.set(uri, p);
    void p.catch(() => {
      if (entries.get(uri) === p) entries.delete(uri);
    });
  }
  return p;
}
