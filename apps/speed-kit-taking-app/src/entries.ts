// The Entries list: the loader (completeCopy over the platform client) and its cache key.
import { cache, hub } from "@kaigilb/gilbplatformcode-speed-kit";
import { completeCopy } from "@kaigilb/gilbplatformcode-speed-kit/complete-copy";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { TYPE } from "./catalog";
import { provenance } from "./session";

export interface Entry { id: string; name: string; description: string }

export const entriesKey = (ws: string): string => cache.cacheKey(ws, "entries");

const idOf = (entity: string): string => entity.slice(entity.lastIndexOf("/") + 1);
const text = (v: unknown): string => (typeof v === "string" ? v : "");

/** A loader for one workspace's entries. Take the key and the guard BEFORE the await (README: session-cache, `cacheKey`). */
export function loadEntries(client: PlatformClient, ws: string): () => Promise<Entry[]> {
  const key = entriesKey(ws);
  return async () => {
    const stillHim = hub.principalGuard();
    const copy = await completeCopy(client, ws, TYPE);
    if (stillHim()) provenance.set(key, "network");
    return copy.records.map((r) => ({ id: idOf(r.entity), name: text(r.body?.name) || text(r.body?.["a:name"]) || r.label || "", description: text(r.body?.description) }));
  };
}
