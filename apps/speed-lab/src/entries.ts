// The Entries list: the loader (completeCopy over the platform client) and its cache key.
import { cache, hub } from "@kaigilb/gilbplatformcode-speed-kit";
import type { LoadContext } from "@kaigilb/gilbplatformcode-session-cache";
import { completeCopy } from "@kaigilb/gilbplatformcode-speed-kit/complete-copy";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { TYPE } from "./catalog";
import { provenance } from "./session";

export interface Entry { id: string; name: string; description: string }

export const entriesKey = (ws: string): string => cache.cacheKey(ws, "entries");

const idOf = (entity: string): string => entity.slice(entity.lastIndexOf("/") + 1);
const text = (v: unknown): string => (typeof v === "string" ? v : "");

const toEntry = (r: { entity: string; body?: Record<string, unknown>; label: string | null }): Entry => ({ id: idOf(r.entity), name: text(r.body?.name) || text(r.body?.["a:name"]) || r.label || "", description: text(r.body?.description) });

/**
 * A loader for one workspace's entries. Take the key and the guard BEFORE the await (README: session-cache, `cacheKey`).
 * Each walk page shows the rows so far as a preview (never stored, never marked as coming from the device); the answer replaces it.
 */
export function loadEntries(client: PlatformClient, ws: string): (ctx?: LoadContext<Entry[]>) => Promise<Entry[]> {
  const key = entriesKey(ws);
  return async (ctx) => {
    const stillHim = hub.principalGuard();
    const copy = await completeCopy(client, ws, TYPE, { onPage: (page) => { if (stillHim()) ctx?.preview(page.records.map(toEntry)); } });
    if (stillHim()) provenance.set(key, "network"); // a full network answer: an earlier "device" mark is stale now
    return copy.records.map(toEntry);
  };
}
