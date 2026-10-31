/**
 * A country's flag, READ from the geo catalogue and kept on the device. React-free.
 *
 * A flag is the country's own picture, held by the geo catalogue with the country. This reads it once, with no sign-in, and keeps
 * it on the device; a flag already kept is drawn with no network call. If a flag cannot be read the caller shows the neutral globe.
 * The unit owns no country table. It never reads the country entity (0.5 MB for Norway, 3.6 MB for Russia: it holds its polygon).
 * It makes the file id by the rule in `flag-choice` (`flag-` + the country's local id), reads the small file entity (a few hundred
 * bytes: its `a:fileTag` holds the ISO code, so the country can be named in the reader's language) and the SVG.
 *
 * THE FLAG SOURCE IS ONE SEAM ({@link FlagSource}, {@link setFlagSource}). The real source is the geo catalogue; nothing here
 * writes to it. This file reads the flag of whatever catalogue address it is given; which places get a flag is the caller's rule.
 */
import { ENTITY_ADDRESS, flagFileId } from "@kaigilb/gilbplatformcode-flag-choice";
import { FetchTimeoutError, pooledGet } from "@kaigilb/gilbplatformcode-language-fetch-pool";

/** One flag as read: the SVG text and the country's ISO code when the file entity named it. */
export interface CountryFlag {
  svg: string;
  code: string | null;
  /** When it was read from GilbGeo (ms since the epoch); set when it is kept. A flag with none is of unknown age. */
  savedAt?: number;
}

/** Where a flag comes from. `null` = the country has no flag; a throw = the read failed (not "no flag"). */
export interface FlagSource {
  read(country: string, signal?: AbortSignal): Promise<CountryFlag | null>;
}

/** Where kept flags live between visits (the device). */
export interface FlagStore {
  get(country: string): Promise<CountryFlag | null>;
  put(country: string, flag: CountryFlag): Promise<void>;
  /** Forget a kept flag (GilbGeo answered that the country holds none any more). */
  delete?(country: string): Promise<void>;
}

export class FlagReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlagReadError";
  }
}

/** The text without its prolog (`<?xml?>`, comments, doctype), trimmed. */
function svgBody(svg: string): string {
  return (svg ?? "")
    .trim()
    .replace(/^<\?xml[^>]*\?>\s*/i, "")
    .replace(/^(<!--[\s\S]*?-->\s*)+/, "")
    .replace(/^<!DOCTYPE[^>]*>\s*/i, "");
}

/** Does the text START as an SVG picture (its root is `<svg`)? */
export function flagSvgStarts(svg: string): boolean {
  return /^<svg[\s>/]/i.test(svgBody(svg));
}

/**
 * Is the SVG COMPLETE: its root is closed (`</svg>`), or it is one self-closed root? A body cut short by a
 * proxy or a dropped connection is not (a cut file was once drawn and kept).
 */
export function flagSvgIsComplete(svg: string): boolean {
  const body = svgBody(svg);
  if (!/^<svg[\s>/]/i.test(body)) return false;
  return /<\/svg\s*>$/i.test(body) || /^<svg\b[^>]*\/>$/i.test(body);
}

/** Is this a complete, plain SVG picture (no script, no handler, no embedded page, no outside reference)? */
export function flagSvgIsSafe(svg: string): boolean {
  const text = (svg ?? "").trim();
  if (text === "" || text.length > 1_000_000) return false;
  if (!flagSvgIsComplete(text)) return false;
  if (/<script|<foreignObject|<image|<iframe|<embed|<object/i.test(text)) return false;
  if (/\son[a-z]+\s*=/i.test(text)) return false;
  if (/javascript:/i.test(text)) return false;
  if (/(?:xlink:)?href\s*=\s*["']\s*(?!#)/i.test(text)) return false;
  return true;
}

/** `fileTag: ["flag", "no"]` → "no". */
function codeOf(doc: unknown): string | null {
  if (!doc || typeof doc !== "object") return null;
  const d = doc as Record<string, unknown>;
  const raw = d["fileTag"] ?? d["a:fileTag"];
  const tags = (Array.isArray(raw) ? raw : [raw]).filter((t): t is string => typeof t === "string");
  const code = tags.find((t) => /^[A-Za-z]{2}$/.test(t));
  return code ? code.toLowerCase() : null;
}

/**
 * The real source: GilbGeo, at the country's own host, anonymously (no credential, no cookie).
 *
 * ⛔ It reads only the two SMALL files by the slug rule (`flag-<local id>`): the flag file and its file entity.
 * It never reads the country entity. Both reads go through the shared pool (at most
 * {@link LANGUAGE_FETCH_PARALLEL} at once) and each is bounded by a timeout.
 *
 * What it answers: a flag; `null` = "this country holds no flag" (404, or a file that is not a plain SVG
 * picture); a THROW = the read failed (no answer, a server error, a body that is not an image, a picture cut
 * short). A thrown read is ⛔ never kept (`readFlag` backs off instead).
 *
 * @param opts.fetchFn the fetch to use (a test hands a local geo-like fixture here)
 * @param opts.timeoutMs the longest one read may take
 */
export function geoFlagSource(opts: { fetchFn?: typeof fetch; timeoutMs?: number } = {}): FlagSource {
  return {
    async read(country, signal) {
      const id = flagFileId(country);
      const origin = ENTITY_ADDRESS.exec(country.trim())?.[1];
      if (!id || !origin) return null;
      const get = async <T>(url: string, accept: string, read: (res: Response) => Promise<T>): Promise<T> => {
        try {
          return await pooledGet(url, { method: "GET", headers: { Accept: accept }, credentials: "omit", signal }, read, {
            fetchFn: opts.fetchFn,
            timeoutMs: opts.timeoutMs,
          });
        } catch (e) {
          if (e instanceof FlagReadError) throw e;
          if (e instanceof FetchTimeoutError) throw new FlagReadError("GilbGeo did not answer in time.");
          throw new FlagReadError("GilbGeo could not be reached.");
        }
      };
      const [file, entity] = await Promise.all([
        get(`${origin}/files/${id}`, "image/svg+xml", async (res): Promise<{ status: number; type: string; text: string }> => ({
          status: res.status,
          type: res.headers.get("content-type") ?? "",
          // A body that stops half-way rejects here: that is a failed read, not a flag.
          text: res.status === 200 ? await res.text() : "",
        })),
        // The entity is a nicety (it names the country): its failure never fails the flag.
        get(`${origin}/base/e/${id}`, "application/ld+json, application/json", async (res) => (res.ok ? codeOf(await res.json().catch(() => null)) : null)).catch(
          () => null,
        ),
      ]);
      // 404 is an ANSWER: this country holds no flag. Anything else that is not 200 is a failed read.
      if (file.status === 404) return null;
      if (file.status !== 200) throw new FlagReadError(`GilbGeo answered ${file.status} for a flag.`);
      // 🔴 Never trusted unless it IS an image and it is WHOLE (F6): a page served as 200, or a picture cut short,
      // is a failed read (tried again later, never kept) — not "no flag" and not a flag.
      if (!/^image\//i.test(file.type)) throw new FlagReadError("GilbGeo did not answer a flag with an image.");
      if (flagSvgStarts(file.text) && !flagSvgIsComplete(file.text)) throw new FlagReadError("The flag file came cut short.");
      if (!flagSvgIsSafe(file.text)) return null;
      return { svg: file.text, code: entity };
    },
  };
}

let source: FlagSource = geoFlagSource();
let store: FlagStore | null | undefined;
/** What this session knows: the answer for a country, positive or "no flag". A failed read is not kept. */
const known = new Map<string, Promise<CountryFlag | null>>();
/** Countries whose read failed lately: no new read before `until` (a remount does not retry at once). */
const backoff = new Map<string, { until: number; failures: number }>();

/** A kept flag is read from GilbGeo again after this long, so a flag GilbGeo changed is drawn changed. */
export const FLAG_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** After a failed read of a country: wait this long, doubled for each failure in a row, up to the cap. */
export const FLAG_BACKOFF_MS = 60_000;
export const FLAG_BACKOFF_MAX_MS = 10 * 60_000;

/** Swap the source (the one seam). `null` puts the real one back. */
export function setFlagSource(next: FlagSource | null): void {
  source = next ?? geoFlagSource();
  known.clear();
  backoff.clear();
}

/** Swap the device store. `null` = none. Undefined (the start) = the browser's Cache Storage when it has one. */
export function setFlagStore(next: FlagStore | null): void {
  store = next;
  known.clear();
}

/** Test seam — forgets what this session knows, as a reload does. The device store is ⛔ not touched. */
export function __resetFlags(): void {
  known.clear();
  backoff.clear();
}

const CACHE_NAME = "gilb-flags-v1";

/** The device's Cache Storage as the flag store, or null where the browser has none. */
function cacheStorageStore(): FlagStore | null {
  if (typeof caches === "undefined") return null;
  const keyOf = (country: string) => `https://flag-cache.invalid/${encodeURIComponent(country)}`;
  return {
    async get(country) {
      try {
        const hit = await (await caches.open(CACHE_NAME)).match(keyOf(country));
        if (!hit) return null;
        const flag = (await hit.json()) as CountryFlag;
        // Trusted only if it is still a WHOLE, plain picture (an older build kept a cut one).
        if (typeof flag?.svg !== "string" || !flagSvgIsSafe(flag.svg)) return null;
        return { svg: flag.svg, code: flag.code ?? null, ...(typeof flag.savedAt === "number" ? { savedAt: flag.savedAt } : {}) };
      } catch {
        return null;
      }
    },
    async put(country, flag) {
      try {
        await (await caches.open(CACHE_NAME)).put(keyOf(country), new Response(JSON.stringify(flag), { headers: { "content-type": "application/json" } }));
      } catch {
        // A device that will not keep it still draws it this session.
      }
    },
    async delete(country) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.delete(keyOf(country));
      } catch {
        // Nothing to forget.
      }
    },
  };
}

function theStore(): FlagStore | null {
  if (store === undefined) store = cacheStorageStore();
  return store;
}

const isFresh = (flag: CountryFlag, now: number): boolean => typeof flag.savedAt === "number" && now - flag.savedAt <= FLAG_TTL_MS;

/** One read of a country: kept and fresh → no call; kept but old → read again; none → read (unless it failed lately). */
async function load(key: string, signal?: AbortSignal): Promise<{ flag: CountryFlag | null; keep: boolean }> {
  const kept = await theStore()?.get(key);
  if (kept && isFresh(kept, Date.now())) return { flag: kept, keep: true };
  const wait = backoff.get(key);
  // It failed a moment ago: no new call yet. A kept (old) flag is still drawn; with none, the globe.
  if (wait && Date.now() < wait.until) return { flag: kept ?? null, keep: false };
  try {
    const flag = await source.read(key, signal);
    backoff.delete(key);
    if (flag) {
      const stamped: CountryFlag = { ...flag, savedAt: Date.now() };
      await theStore()?.put(key, stamped);
      return { flag: stamped, keep: true };
    }
    // GilbGeo answered "no flag": an old copy is no longer to be trusted.
    if (kept) await theStore()?.delete?.(key);
    return { flag: null, keep: true };
  } catch {
    const failures = (wait?.failures ?? 0) + 1;
    backoff.set(key, { until: Date.now() + Math.min(FLAG_BACKOFF_MS * 2 ** (failures - 1), FLAG_BACKOFF_MAX_MS), failures });
    // GilbGeo could not be asked: the old copy (if any) is still the best picture there is.
    return { flag: kept ?? null, keep: false };
  }
}

/**
 * The flag of a country, or `null` for the globe: no country, no flag held, or a failed read. Kept in memory
 * for the session and on the device. A kept flag is drawn with no call until it is {@link FLAG_TTL_MS} old;
 * then it is read again (a changed flag refreshes; if GilbGeo cannot be asked, the old one stays). A failed
 * read is ⛔ not remembered as an answer, and is not tried again before its back-off has passed.
 */
export function readFlag(country: string | null | undefined, signal?: AbortSignal): Promise<CountryFlag | null> {
  const key = (country ?? "").trim();
  if (key === "") return Promise.resolve(null);
  let p = known.get(key);
  if (!p) {
    const made = load(key, signal).then(({ flag, keep }) => {
      if (!keep && known.get(key) === made) known.delete(key);
      return flag;
    });
    p = made;
    known.set(key, p);
  }
  return p;
}

