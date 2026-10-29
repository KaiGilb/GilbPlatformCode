/**
 * A full-window sheet is a HISTORY ENTRY, so on a phone the system Back button closes the sheet and does not leave the card.
 *   - opening pushes one entry (same address, a marker in the history state; the router's own state is kept, so it is not confused);
 *   - the system Back (a `popstate` with the marker gone) closes the sheet and nothing else;
 *   - closing from inside (Back button, Escape, a pick) closes the sheet AT ONCE and removes the entry it pushed (`history.back()`, guarded
 *     by the marker so it can never leave the card), so the history is as it was: nothing is left behind;
 *   - closing to go somewhere (`after`, a tap on a person) removes the entry first and runs `after` when that is done, so the new page is the
 *     next entry after the card and not after a dead one (a fallback timer runs it if the browser never answers);
 *   - a reload with the sheet open comes back with the marker in the state and no sheet: `dropStaleSheetEntry` (on mount) steps back off it once.
 * A sheet that closes by being unmounted while its entry is still the current one removes the entry too.
 */
import { useEffect, useRef } from "react";

const KEY = "gilbSheet";
const FALLBACK_MS = 400;

const marked = () => {
  const s = typeof window !== "undefined" ? (window.history.state as Record<string, unknown> | null) : null;
  return !!s && !!s[KEY];
};

let dropping = false;
/** Test seam — ⛔ never called by product code. */
export function __resetSheetHistory(): void {
  dropping = false;
}
/**
 * Called when a card mounts: a reload (or a forward press) that landed on a sheet's entry steps back off it, ONCE even when several cards, or
 * StrictMode, call it together (a second `back()` would leave the card).
 */
export function dropStaleSheetEntry(): void {
  if (!marked() || dropping) return;
  dropping = true;
  setTimeout(() => {
    dropping = false;
  }, 500);
  window.history.back();
}

export function useSheetHistory(open: boolean, onClosed: () => void): { requestClose: (after?: () => void) => void } {
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const active = useRef(false); // our entry is pushed and the sheet is open
  const pendingBack = useRef<{ after?: () => void; timer: ReturnType<typeof setTimeout> | null } | null>(null);

  useEffect(() => {
    if (!open) return;
    const prior = (window.history.state as Record<string, unknown> | null) ?? {};
    window.history.pushState({ ...prior, [KEY]: true }, "");
    active.current = true;
    const onPop = () => {
      const p = pendingBack.current;
      if (p) {
        // our own history.back(): the entry is gone, now go on to where the person asked
        pendingBack.current = null;
        if (p.timer) clearTimeout(p.timer);
        p.after?.();
        return;
      }
      if (active.current && !marked()) {
        // the system Back: the sheet closes, nothing else
        active.current = false;
        onClosedRef.current();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (active.current && marked() && !pendingBack.current) window.history.back();
      active.current = false;
    };
  }, [open]);

  const requestClose = (after?: () => void) => {
    if (!active.current) {
      onClosedRef.current();
      after?.();
      return;
    }
    active.current = false;
    onClosedRef.current();
    if (!marked()) {
      after?.();
      return;
    }
    const p: { after?: () => void; timer: ReturnType<typeof setTimeout> | null } = { after, timer: null };
    pendingBack.current = p;
    p.timer = setTimeout(() => {
      if (pendingBack.current === p) {
        pendingBack.current = null;
        p.after?.();
      }
    }, FALLBACK_MS);
    window.history.back();
  };
  return { requestClose };
}
