// The React side of the session cache. The data is on the FIRST render when the cache holds it (a page the person has opened before is not blank),
// a background revalidation follows when it is older than 30 s or the tab regained focus, and `updating` says one is running.
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { sessionCache, type CacheState, type Loader, type SessionCache } from "@kaigilb/gilbplatformcode-session-cache";

export interface Cached<T> { data: T | undefined; updating: boolean; error: unknown; updatedAt: number | undefined; /** Loads again, always (after a write). */ refresh: () => Promise<void> }

const NONE: CacheState<never> = { data: undefined, updating: false, error: undefined, updatedAt: undefined };

/**
 * @param key `workspace|resource` (cacheKey), or null while the workspace is not known (nothing is loaded)
 * @param loader how to read it; the latest one is used, a new function each render does not reload. It is handed the cache's LoadContext, so it may `ctx?.preview(rows)` for a first visit
 * @param cache the cache (the app's own unless a test passes one)
 */
export function useCached<T>(key: string | null, loader: Loader<T>, cache: SessionCache = sessionCache): Cached<T> {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const state = useSyncExternalStore(
    useCallback((fn) => (key ? cache.subscribe(key, fn) : () => undefined), [key, cache]),
    () => (key ? cache.peek<T>(key) : (NONE as CacheState<T>)),
  );
  useEffect(() => {
    if (!key) return;
    void cache.swr<T>(key, (ctx) => loaderRef.current(ctx)).promise.catch(() => undefined);
  }, [key, cache]);
  const refresh = useCallback(async () => {
    if (!key) return;
    try { await cache.refresh<T>(key, (ctx) => loaderRef.current(ctx)); } catch { /* the entry holds the error */ }
  }, [key, cache]);
  return { data: state.data, updating: state.updating, error: state.error, updatedAt: state.updatedAt, refresh };
}
