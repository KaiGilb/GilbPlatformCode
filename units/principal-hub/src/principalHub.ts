// ONE place that knows whose session this tab is in, and that every in-memory cache of a person's content registers with.
// When the person changes (another person signs in, a sign-out, or the first person after none) every registered cache is cleared SYNCHRONOUSLY, before the next person's first render:
// nothing of A is left in memory for B to see. A load of A that is still in flight lands in a cache that no longer holds its key (or a generation that ended) and is not shown.
// A module that keeps person-specific state at module level calls registerCache(name, clear) next to it; an app is expected to scan for module-level state that does not.
// This file imports nothing: every module may import it.
const caches = new Map<string, (next: string | null) => void>();
let current: string | null = null;
let version = 0;

/** Registers a cache that holds a person's content. Registering the same name again replaces the clearer. */
/** `clear` is told who comes next (null: nobody): a cache that lives on the DEVICE (not in memory) keeps what is the same person's across a page load and clears the rest. */
export function registerCache(name: string, clear: (next: string | null) => void): void { caches.set(name, clear); }
export const registeredCaches = (): string[] => [...caches.keys()];
/** The person this tab is in (null: nobody). */
export const currentPrincipal = (): string | null => current;
/** Bumped each time the caches are cleared: a loader that started under an older value knows its answer is not for this person. */
export const principalVersion = (): number => version;

/**
 * THE guard for a late answer. An async producer that will write into a registered cache (or to disk) calls this when it STARTS and asks the returned function when its answer ARRIVES: false means the person changed
 * in between, and the answer is the previous person's: it is dropped, never stored, never shown.
 *   const alive = principalGuard();   const v = await load();   if (alive()) cache.set(key, v);
 * `guardLate(promise, land)` is the same in one call: `land` runs only if the person is still the one who asked. Never hand-compare versions at a call site.
 */
export function principalGuard(): () => boolean { const at = version; return () => version === at; }
export function guardLate<T>(answer: Promise<T>, land: (value: T) => void): Promise<T> {
  const alive = principalGuard();
  return answer.then((v) => { if (alive()) land(v); return v; });
}

/** Clears every registered cache now. A cache that throws does not stop the others. */
export function clearAllCaches(next: string | null = current): void {
  version++;
  for (const clear of [...caches.values()]) { try { clear(next); } catch { /* one cache's failure must not leave another holding a person's content */ } }
}

/**
 * Says whose tab this is. A different person (including "nobody" and including the first person after nobody) clears everything first; the same person again changes nothing.
 * Call it before anything of the new person is read or shown.
 */
export function setPrincipal(next: string | null): void {
  if (next === current) return;
  current = next;
  clearAllCaches(next);
}

/** Tests only: a FRESH PAGE of the same browser. The tab has no person yet and nothing is cleared (the page's memory is new; what the browser stored stays). Then setPrincipal(A) is the first person after nobody, as at a reload. */
export function __freshPageForTests(): void { current = null; version++; }
