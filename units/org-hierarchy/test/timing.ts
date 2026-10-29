// Test support: time without waiting for time.
//   turns(n)          yields n turns of the event loop (a zero-delay timer queues behind the ones already queued, so pending zero-delay work runs first).
//   virtualTimers()   a clock for the LONG timers only (delay of 100 ms or more: the search pause, the sheet's history fallback, the stale-entry guard).
//                     Short timers stay real, so the test library and the query cache still run. `advance(ms)` fires the long timers that fall due.
export const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
export async function turns(n = 6): Promise<void> {
  for (let i = 0; i < n; i++) await turn();
}

const LONG_MS = 100;

export function virtualTimers() {
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  let now = 0;
  let seq = 0;
  const queue = new Map<number, { due: number; fn: () => void }>();
  const fakeSet = ((fn: unknown, ms?: number, ...args: unknown[]) => {
    if (typeof fn !== "function" || (ms ?? 0) < LONG_MS) return realSet(fn as () => void, ms, ...(args as []));
    const id = -(++seq);
    queue.set(id, { due: now + (ms as number), fn: () => (fn as (...a: unknown[]) => void)(...args) });
    return id;
  }) as unknown as typeof setTimeout;
  const fakeClear = ((id?: unknown) => {
    if (typeof id === "number" && id < 0) queue.delete(id);
    else realClear(id as Parameters<typeof clearTimeout>[0]);
  }) as typeof clearTimeout;
  return {
    install() {
      now = 0;
      seq = 0;
      queue.clear();
      globalThis.setTimeout = fakeSet;
      globalThis.clearTimeout = fakeClear;
    },
    uninstall() {
      globalThis.setTimeout = realSet;
      globalThis.clearTimeout = realClear;
      queue.clear();
    },
    /** Fire, in order of due time, every long timer that falls due within the next `ms` (timers set while firing count too). */
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        let next: [number, { due: number; fn: () => void }] | null = null;
        for (const e of queue) if (e[1].due <= end && (next === null || e[1].due < next[1].due)) next = e;
        if (!next) break;
        queue.delete(next[0]);
        now = Math.max(now, next[1].due);
        next[1].fn();
      }
      now = end;
    },
    pending: () => queue.size,
  };
}
