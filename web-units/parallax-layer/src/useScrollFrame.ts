/**
 * A rAF-throttled scroll and resize frame bus, as the Gilb Websites landing page's `useScrollFrame` (see README
 * "Source"). Inlined in this unit because a packed copy cannot depend on another unit; the same file is in
 * `scroll-frame`. One passive scroll and one resize listener feed every subscriber on the next animation frame;
 * subscribers write transform and opacity directly, so scrolling never re-renders Vue.
 *
 * @returns `subscribe(fn)` registers a per-frame callback and returns its unsubscribe; `reduced` is true when the
 * visitor prefers reduced motion (then `subscribe` registers nothing, and callers should not arm any effect).
 */
import { onBeforeUnmount } from "vue";

export function useScrollFrame() {
  const handlers = new Set<() => void>();
  let rafId = 0;
  let listening = false;

  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function runFrame() {
    rafId = 0;
    for (const fn of handlers) fn();
  }
  function requestFrame() {
    if (!rafId) rafId = window.requestAnimationFrame(runFrame);
  }
  function start() {
    if (listening || typeof window === "undefined") return;
    listening = true;
    window.addEventListener("scroll", requestFrame, { passive: true });
    window.addEventListener("resize", requestFrame, { passive: true });
  }
  function stop() {
    if (!listening) return;
    listening = false;
    window.removeEventListener("scroll", requestFrame);
    window.removeEventListener("resize", requestFrame);
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
    handlers.clear();
  }
  function subscribe(fn: () => void) {
    if (reduced) return () => {};
    handlers.add(fn);
    start();
    // Run once at once, so a mid-page reload positions elements without waiting for a scroll event.
    requestFrame();
    return () => {
      handlers.delete(fn);
      if (handlers.size === 0) stop();
    };
  }
  onBeforeUnmount(stop);
  return { subscribe, reduced };
}
