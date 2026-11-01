// A meter a browser run can read. The host drives every count and every timer. One createSpeedMeter call, one reading.
export type PaintSource = "memory" | "device" | "preview" | "network";
/** `ms` is the start of `timePage` to the first `rows`; `fullMs` is to the first `full` after that, set once. */
export interface LastPaint { page: string; ms: number; source: PaintSource; fullMs?: number }
/** What the host recorded for the last start. */
export interface StartReading { disk: boolean; hydrated: boolean; ms: number; entries: number; at: string }
export interface WriteReading { kind: string; ms: number; ok: boolean; at: string }
export interface SpeedReading {
  requests: Record<string, number>; // received, by route
  answered: Record<string, number>; // answered, by route
  log: { route: string; method: string; url: string }[];
  lastPaint: LastPaint | null;
  start: StartReading | null;
  writes: WriteReading[]; // newest last, at most maxWrites kept (oldest dropped)
}
export interface SpeedMeterOptions {
  routes?: string[]; // route names that start at 0 in requests (and answered, unless answeredRoutes is set); default []
  answeredRoutes?: string[]; // routes that start at 0 in answered; default = routes
  globalKey?: string | null; // where the reading is exposed; default "__speedMeter"; null = not exposed
  target?: object; // the object it is exposed on; default globalThis
  maxLog?: number; // default 500; oldest dropped beyond it
  maxWrites?: number; // default 200
  now?: () => number; // clock in ms for timers; default performance.now(), or Date.now() when performance is absent
  isoNow?: () => string; // wall clock for `at`; default () => new Date().toISOString()
}
export interface SpeedMeter {
  readonly reading: SpeedReading; // the same object every time (a browser run reads it by reference)
  countRequest(route: string, method: string, url: string): void; // requests[route] += 1 (created at 0 if new) and appends to log
  countAnswered(route: string): void; // answered[route] += 1 (created if new)
  setPaint(p: LastPaint | null): void;
  getPaint(): LastPaint | null;
  setStart(s: StartReading | null): void;
  getStart(): StartReading | null;
  timePage(page: string): { rows(source: PaintSource): void; full(): void };
  timeWrite(kind: string): (ok: boolean) => void;
  subscribe(fn: () => void): () => void; // after setPaint, setStart, a timePage write and a timeWrite stop; not after counts
  reset(): void; // initial state in place (same reading object); notifies subscribers
}

/** `start: disk yes|no, hydrated yes|no, N entries, M ms` */
export const startLine = (s: StartReading): string => `start: disk ${s.disk ? "yes" : "no"}, hydrated ${s.hydrated ? "yes" : "no"}, ${s.entries} entries, ${s.ms} ms`;

/** Test hooks for a browser run, only when `search` carries `proofHooks=1`. Sets `target[globalKey]` to `hooks`. */
export function installProofHooks(search: string, target: object, hooks: Record<string, () => void>, globalKey?: string): void {
  if (new URLSearchParams(search).get("proofHooks") !== "1") return;
  (target as Record<string, unknown>)[globalKey ?? "__speedMeterHooks"] = hooks;
}

function defaultNow(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  if (perf && typeof perf.now === "function") return perf.now();
  return Date.now();
}

/** Nearest 0.1 ms. */
function roundTenth(ms: number): number {
  return Math.round(ms * 10) / 10;
}

function zeros(names: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const name of names) out[name] = 0;
  return out;
}

function refill(bucket: Record<string, number>, names: readonly string[]): void {
  for (const key of Object.keys(bucket)) delete bucket[key];
  for (const name of names) bucket[name] = 0;
}

function dropOldest<T>(items: T[], max: number): void {
  // A negative cap would never finish: shifting an empty array leaves the length at 0.
  const cap = max < 0 ? 0 : max;
  while (items.length > cap) items.shift();
}

export function createSpeedMeter(options?: SpeedMeterOptions): SpeedMeter {
  const routes = [...(options?.routes ?? [])];
  const answeredRoutes = [...(options?.answeredRoutes ?? routes)];
  const globalKey = options?.globalKey === undefined ? "__speedMeter" : options.globalKey;
  const target = options?.target ?? globalThis;
  const maxLog = options?.maxLog ?? 500;
  const maxWrites = options?.maxWrites ?? 200;
  const now = options?.now ?? defaultNow;
  const isoNow = options?.isoNow ?? (() => new Date().toISOString());

  const reading: SpeedReading = {
    requests: zeros(routes),
    answered: zeros(answeredRoutes),
    log: [],
    lastPaint: null,
    start: null,
    writes: [],
  };
  if (globalKey !== null) (target as Record<string, unknown>)[globalKey] = reading;

  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // One listener's throw must not stop the others, or this call.
      }
    }
  };

  function countRequest(route: string, method: string, url: string): void {
    reading.requests[route] = (reading.requests[route] ?? 0) + 1;
    reading.log.push({ route, method, url });
    dropOldest(reading.log, maxLog);
  }

  function countAnswered(route: string): void {
    reading.answered[route] = (reading.answered[route] ?? 0) + 1;
  }

  function setPaint(p: LastPaint | null): void {
    reading.lastPaint = p;
    notify();
  }
  function getPaint(): LastPaint | null {
    return reading.lastPaint;
  }
  function setStart(s: StartReading | null): void {
    reading.start = s;
    notify();
  }
  function getStart(): StartReading | null {
    return reading.start;
  }

  function timePage(page: string): { rows(source: PaintSource): void; full(): void } {
    const t0 = now();
    let paint: LastPaint | null = null;
    let filled = false;
    return {
      rows(source: PaintSource): void {
        if (paint) return;
        paint = { page, ms: roundTenth(now() - t0), source };
        reading.lastPaint = paint;
        notify();
      },
      full(): void {
        if (!paint || filled) return;
        if (reading.lastPaint !== paint) return; // never write onto a paint this page did not record
        const fullMs = roundTenth(now() - t0);
        filled = true;
        paint.fullMs = fullMs;
        notify();
      },
    };
  }

  function timeWrite(kind: string): (ok: boolean) => void {
    const t0 = now();
    let done = false;
    return (ok: boolean): void => {
      if (done) return;
      const row: WriteReading = { kind, ms: roundTenth(now() - t0), ok, at: isoNow() };
      done = true;
      reading.writes.push(row);
      dropOldest(reading.writes, maxWrites);
      notify();
    };
  }

  function subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }

  function reset(): void {
    refill(reading.requests, routes);
    refill(reading.answered, answeredRoutes);
    reading.log.length = 0;
    reading.writes.length = 0;
    reading.lastPaint = null;
    reading.start = null;
    notify();
  }

  return { reading, countRequest, countAnswered, setPaint, getPaint, setStart, getStart, timePage, timeWrite, subscribe, reset };
}
