/**
 * "Added by <name>" on a held detail: whoever may see something a person added sees THAT person's name on it, and nothing else of the card, with a
 * link to the card.
 *
 * The platform route is `GET /base/source-name?items=<addr>,<addr>,…` (1 to 50 absolute item addresses): always 200
 * `{ items: { [address]: { statedBy: string|null, name: string|null } } }`; null/null means "not disclosed", for any reason, and the client
 * cannot tell which and must not try. The single form `?item=` answers 404 on any refusal: ⛔ never used here.
 *
 *   - {@link fetchSourceNames}: the pure client. Dedupes, groups by the host that serves the item, chunks at 50, URL-encodes. A 404 on the route
 *     (an older platform), any other refusal, a network error or a timeout gives null for every address of the chunk: nothing is shown, nothing
 *     is retried, and it is said once per page at debug level.
 *   - {@link useAddedBy}: the hook for the sections. ONE react-query entry per item address (same store as the held claims, same staleness). The
 *     entries asked for in one breath, by any number of sections, are sent as ONE batch (a short collecting window), ⛔ never one request per row.
 *     The viewer's own details are never asked about: they read "Added by you".
 */
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { bearerHeaderFor } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";

/** The most addresses one call may carry (the platform's bound). */
export const SOURCE_NAME_MAX_ITEMS = 50;
/** How old a read of a name may be before it is read again: the same as the held claims'. */
export const ADDED_BY_STALE_MS = 60_000;
/** A read that takes longer than this is given up on; nothing is shown. */
const TIMEOUT_MS = 10_000;
/** How long requests asked for are collected before the one batch goes out. */
export const ADDED_BY_COLLECT_MS = 20;

/** What the platform discloses of an adder: the address of the card and its name, both present, or neither. */
export interface SourceName {
  statedBy: string;
  name: string;
}

/** The react-query key of one item's adder (keyed by item address, beside the held claims). */
export const addedByKey = (item: string) => ["mynet", "added-by", item] as const;

let saidOnce = false;
/** Said once per page at debug level: why nothing is shown for some detail. ⛔ Never to the person. */
function sayOnce(why: string): void {
  if (saidOnce) return;
  saidOnce = true;
  console.debug(`[added-by] no name shown for some details: ${why}`);
}
/** Test seam — ⛔ never called by product code. */
export function __resetAddedByForTest(): void {
  saidOnce = false;
  pending.clear();
  if (timer) clearTimeout(timer);
  timer = null;
}

/** One answered entry as a {@link SourceName}, or null when it names nothing usable. */
function entryOf(v: unknown): SourceName | null {
  if (typeof v !== "object" || v === null) return null;
  const { statedBy, name } = v as { statedBy?: unknown; name?: unknown };
  if (typeof statedBy !== "string" || statedBy.trim() === "") return null;
  if (typeof name !== "string" || name.trim() === "") return null;
  return { statedBy: statedBy.trim(), name: name.trim() };
}

/** One call of up to 50 addresses at one host. Never throws: a failure is null for each. */
async function fetchChunk(origin: string, chunk: readonly string[]): Promise<Map<string, SourceName | null>> {
  const out = new Map<string, SourceName | null>(chunk.map((a) => [a, null]));
  const url = `${origin}/base/source-name?items=${chunk.map((a) => encodeURIComponent(a)).join(",")}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "GET", headers: { ...(await bearerHeaderFor(url)), accept: "application/json" }, signal: ctl.signal });
    if (!res.ok) {
      sayOnce(`the platform answered ${res.status}`);
      return out;
    }
    const body = (await res.json()) as { items?: Record<string, unknown> } | null;
    const items = body && typeof body === "object" && body.items && typeof body.items === "object" ? body.items : {};
    for (const a of chunk) out.set(a, entryOf(items[a]));
    return out;
  } catch (e) {
    sayOnce(e instanceof Error ? e.message : String(e));
    return out;
  } finally {
    clearTimeout(t);
  }
}

/**
 * The adder's name for each item, in as few calls as the platform allows: addresses deduped, grouped by the host that serves them, 50 to a call.
 *
 * @param items absolute item addresses
 * @returns every address given, mapped to its adder, or null when not disclosed, refused or failed (⛔ the caller cannot tell which)
 */
export async function fetchSourceNames(items: readonly string[]): Promise<Map<string, SourceName | null>> {
  const unique = [...new Set(items.map((i) => i.trim()).filter(Boolean))];
  const byOrigin = new Map<string, string[]>();
  for (const a of unique) {
    const origin = vaultOriginOf(a);
    byOrigin.set(origin, [...(byOrigin.get(origin) ?? []), a]);
  }
  const calls: Promise<Map<string, SourceName | null>>[] = [];
  for (const [origin, list] of byOrigin) {
    for (let i = 0; i < list.length; i += SOURCE_NAME_MAX_ITEMS) calls.push(fetchChunk(origin, list.slice(i, i + SOURCE_NAME_MAX_ITEMS)));
  }
  const out = new Map<string, SourceName | null>();
  for (const m of await Promise.all(calls)) for (const [k, v] of m) out.set(k, v);
  return out;
}

// --- the collecting window: every entry asked for within it goes out as ONE batch ---------------------------------------------------------------
const pending = new Map<string, Array<(v: SourceName | null) => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
  timer = null;
  const batch = new Map(pending);
  pending.clear();
  void fetchSourceNames([...batch.keys()]).then((got) => {
    for (const [addr, waiters] of batch) for (const w of waiters) w(got.get(addr) ?? null);
  });
}

/** One item's adder, joined to the batch being collected. */
function collected(item: string): Promise<SourceName | null> {
  return new Promise((resolve) => {
    pending.set(item, [...(pending.get(item) ?? []), resolve]);
    if (!timer) timer = setTimeout(flush, ADDED_BY_COLLECT_MS);
  });
}

/** What a detail shows for its adder: the viewer themself, a named person with the address of their card, or nothing (null). */
export type AddedBy = { kind: "you" } | { kind: "name"; name: string; card: string } | null;

/** One held detail the section shows: where it lives and whether the viewer added it. */
export interface AddedByItem {
  /** The detail's own address (the claim). */
  item: string;
  /** The viewer's own card is its one `a:statedBy`. */
  own: boolean;
  /** False when the claim names no source at all (nothing to ask). Default true. */
  hasSource?: boolean;
}

/**
 * The adders of a set of held details. Own details answer `{kind:"you"}` with no request; a detail stated by another is asked of the platform
 * in the ONE batch, cached per item address; whatever is not disclosed (or fails) answers null.
 *
 * @param items the details shown
 * @returns a function from an item address to what its line says
 */
export function useAddedBy(items: readonly AddedByItem[]): (item: string) => AddedBy {
  const asked = useMemo(() => [...new Set(items.filter((i) => !i.own && i.hasSource !== false && i.item).map((i) => i.item))], [items]);
  const results = useQueries({
    queries: asked.map((item) => ({
      queryKey: addedByKey(item),
      // Never rejects, never undefined: not disclosed is a stored null (so a refusal is not asked again until it is stale).
      queryFn: () => collected(item),
      staleTime: ADDED_BY_STALE_MS,
      retry: false,
    })),
  });
  const seen = results.map((r) => (r.data ? `${r.data.statedBy}\u0000${r.data.name}` : "-")).join("\u0001");
  const ownKey = items.filter((i) => i.own).map((i) => i.item).join("\u0001");
  return useMemo(() => {
    const own = new Set(items.filter((i) => i.own).map((i) => i.item));
    const named = new Map<string, SourceName | null | undefined>(asked.map((a, i) => [a, results[i]?.data]));
    return (item: string): AddedBy => {
      if (own.has(item)) return { kind: "you" };
      const got = named.get(item);
      return got ? { kind: "name", name: got.name, card: got.statedBy } : null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownKey, asked, seen]);
}
