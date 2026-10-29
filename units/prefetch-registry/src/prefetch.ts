// Prefetch. Warm the pages' cache keys before the person asks: when the browser is idle after a first paint, and when a nav button is pointed at, focused or pressed.
// The registry holds warmers per page and starts each one at most once per workspace within the stale window, and not again while it runs. It does no loading of its own: a warmer is a function the host gives it.
// No React here.
//
// A page registers its own warmers with registerWarm(page, fn); they run with the same context.
import { registerCache } from "@kaigilb/gilbplatformcode-principal-hub";

/** What every warmer is given. The host's context type extends it: `ws` is the workspace the warmers run for; `vault` is the host's client, compared by identity (a different client is a different dedupe key). */
export interface WarmContext { ws: string; vault: unknown }
export type Warmer<Ctx extends WarmContext = WarmContext> = (ctx: Ctx) => Promise<unknown> | void;

/** What the browser says of the connection, and the width the layout is drawn at (px). Tests replace members. */
export interface PrefetchNetwork {
  read: () => { saveData?: boolean; effectiveType?: string } | undefined;
  width: () => number;
}

export interface PrefetchOptions {
  /** A warmer is not started again for the same workspace and client within this many ms (default 30 000). */
  staleMs?: number;
  /** The name the registry registers itself under with the principal hub, which empties it when the person changes (default "prefetch"). */
  cacheName?: string;
  /** How many pictures are fetched ahead on a wide screen (default 3). */
  wideCount?: number;
  /** ... and on a narrow one (default 2). */
  narrowCount?: number;
  /** A width below this (px) is narrow (default 640). */
  narrowBelow?: number;
  /** Replaces the browser readers (`read`, `width`). */
  network?: Partial<PrefetchNetwork>;
}

export interface PrefetchRegistry<Ctx extends WarmContext = WarmContext> {
  /** The client and workspace the warmers run for (null: nothing is warmed). */
  setWarmContext(c: Ctx | null): void;
  getWarmContext(): Ctx | null;
  /**
   * Adds a warmer for a page. Returns the remover.
   * `heavy: true` marks one that costs real data (pictures, a deep walk): it does not run when the person asked the browser to save data or the connection is 2g.
   */
  registerWarm(page: string, fn: Warmer<Ctx>, o?: { heavy?: boolean }): () => void;
  network: PrefetchNetwork;
  /** Heavy prefetch is allowed unless save-data is on or the connection is slow-2g/2g. Light prefetch always runs. */
  heavyPrefetchOk(): boolean;
  /** How many of a list's pictures are fetched ahead: `wideCount` on a wide screen, `narrowCount` on a narrow one, none when heavy prefetch is off. */
  prefetchPictureCount(): number;
  setPrefetchClock(now: () => number): void;
  /** Runs the warmers of one page (deduplicated). Safe to call from every pointer-over, focus and press. */
  prefetchPage(page: string): void;
  /** Every page's warmers, once. */
  prefetchAll(): void;
}

export function createPrefetchRegistry<Ctx extends WarmContext = WarmContext>(options: PrefetchOptions = {}): PrefetchRegistry<Ctx> {
  const staleMs = options.staleMs ?? 30_000;
  const wideCount = options.wideCount ?? 3;
  const narrowCount = options.narrowCount ?? 2;
  const narrowBelow = options.narrowBelow ?? 640;

  let context: Ctx | null = null;
  const registry = new Map<string, Set<Warmer<Ctx>>>();
  const heavyWarmers = new WeakSet<Warmer<Ctx>>();

  function registerWarm(page: string, fn: Warmer<Ctx>, o: { heavy?: boolean } = {}): () => void {
    let set = registry.get(page);
    if (!set) { set = new Set(); registry.set(page, set); }
    set.add(fn);
    if (o.heavy) heavyWarmers.add(fn);
    return () => { registry.get(page)?.delete(fn); };
  }

  /** What the browser says of the connection (Network Information API; absent on Safari and Firefox, where nothing is assumed). */
  const network: PrefetchNetwork = {
    read: (): { saveData?: boolean; effectiveType?: string } | undefined => (typeof navigator === "undefined" ? undefined : (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection),
    width: (): number => (typeof window === "undefined" ? 1024 : window.innerWidth),
    ...options.network,
  };
  function heavyPrefetchOk(): boolean {
    const c = network.read();
    if (!c) return true;
    return c.saveData !== true && c.effectiveType !== "slow-2g" && c.effectiveType !== "2g";
  }
  function prefetchPictureCount(): number {
    if (!heavyPrefetchOk()) return 0;
    return network.width() < narrowBelow ? narrowCount : wideCount;
  }

  /** When a warmer last started, per workspace: the same warmer is not started again within staleMs, nor while it runs (pointer-over, focus and press arrive together). */
  let started = new WeakMap<Warmer<Ctx>, { ws: string; vault: unknown; at: number; running: boolean }>();
  // The person changed: nothing is warmed for the person before (the context goes; the next person's app sets its own).
  registerCache(options.cacheName ?? "prefetch", () => { context = null; started = new WeakMap(); });
  const clock = { now: () => Date.now() };

  function runWarmer(fn: Warmer<Ctx>, ctx: Ctx): void {
    if (heavyWarmers.has(fn) && !heavyPrefetchOk()) return; // data saver or a slow link: the page will ask when it is opened
    const s = started.get(fn);
    if (s && s.ws === ctx.ws && s.vault === ctx.vault && (s.running || clock.now() - s.at < staleMs)) return;
    const entry = { ws: ctx.ws, vault: ctx.vault, at: clock.now(), running: true };
    started.set(fn, entry);
    let ran: Promise<unknown>;
    try { ran = Promise.resolve(fn(ctx)); } catch (e) { ran = Promise.reject(e); } // started now, in the tick of the hover
    void ran.catch(() => undefined).finally(() => { entry.running = false; });
  }

  function prefetchPage(page: string): void {
    if (!context || !context.ws) return;
    for (const fn of [...(registry.get(page) ?? [])]) runWarmer(fn, context);
  }
  function prefetchAll(): void { for (const page of [...registry.keys()]) prefetchPage(page); }

  return {
    setWarmContext(c) { context = c; },
    getWarmContext: () => context,
    registerWarm,
    network,
    heavyPrefetchOk,
    prefetchPictureCount,
    setPrefetchClock(now) { clock.now = now; },
    prefetchPage,
    prefetchAll,
  };
}

/** Runs `fn` when the browser is idle (requestIdleCallback, else a short timeout). Returns the canceller. */
export function onIdle(fn: () => void, timeoutMs = 300): () => void {
  const w = globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
  if (typeof w.requestIdleCallback === "function") {
    const h = w.requestIdleCallback(fn, { timeout: 2000 });
    return () => w.cancelIdleCallback?.(h);
  }
  const t = setTimeout(fn, timeoutMs);
  return () => clearTimeout(t);
}
