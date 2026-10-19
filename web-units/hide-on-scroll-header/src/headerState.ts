/**
 * The scroll behaviour of the hide-on-scroll header, as a controller that touches no DOM. The browser (window,
 * clock, animation frames, timers) is passed in as `env`, so the tests drive it with a fake clock.
 *
 * Moved without change in behaviour from the Gilb Websites landing layout (layouts/landing.vue, the
 * `readScrollDirection`, `settleAfterMount`, `noteInput` and `onScroll` functions; see README "Source").
 * It took three QA rounds to get right; every rule below has a reason from those rounds:
 *
 * - Never hide while the top of the page is on screen (`hideAfterPx`); ignore moves smaller than `deadZonePx`, so
 *   trackpad jitter or the last frames of a smooth-scroll glide cannot flip the bar back and forth. The position
 *   the direction was last decided at (`anchorY`) only moves once the visitor has gone past the dead zone, so a
 *   slow scroll made of many 1 to 2 px frames still adds up.
 * - Leaving the top by scrolling DOWN goes straight from the clear bar to hidden, never through a dark frame.
 *   `holdClear` keeps the bar clear until a scroll UP brings it back; being at the very top (`topPx`) arms it again.
 * - After mount the page must be still for `settleMs` before its position counts as "arrived without scrolling
 *   down" (a reload or a #link). Then, if the bar is showing past the hero, it turns solid.
 * - A SOLID bar hides only within `inputWindowMs` after wheel, touch, key or pointer input, so a layout nudge
 *   (scroll anchoring) cannot paint it solid and hide it a moment later. A clear bar may hide without input: the
 *   touch or wheel that woke the page (delayed hydration) came before the listeners existed.
 */

export interface HeaderConfig {
  /** Never hide at or above this scroll position, px. */
  hideAfterPx: number;
  /** Ignore moves smaller than this, px. */
  deadZonePx: number;
  /** Above this the visitor is "at the top" (the height of the top sentinel), px. */
  topPx: number;
  /** After mount, how long the page must be still before its position counts as arrived, ms. */
  settleMs: number;
  /** A downward move hides a solid bar only this long after input, ms. */
  inputWindowMs: number;
}

export const DEFAULT_CONFIG: Readonly<HeaderConfig> = {
  hideAfterPx: 96,
  deadZonePx: 8,
  topPx: 48,
  settleMs: 150,
  inputWindowMs: 1000,
};

/** The input events whose arrival opens the input window. */
export const INPUT_EVENTS = ["wheel", "touchstart", "touchmove", "keydown", "pointerdown"] as const;

export interface HeaderView {
  /** The top sentinel has left the screen. */
  scrolled: boolean;
  /** The bar has slid away (the call-to-action stays). */
  hidden: boolean;
  /** Keep the bar clear (not solid) even when `scrolled`. Starts true: the server's bar is clear. */
  holdClear: boolean;
}

/** Whether the bar is drawn solid. */
export const isSolid = (v: HeaderView): boolean => v.scrolled && !v.holdClear;

/** The browser, as far as the controller needs it. */
export interface HeaderEnv {
  scrollY(): number;
  now(): number;
  requestFrame(cb: () => void): number;
  cancelFrame(id: number): void;
  setTimer(cb: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface HeaderController {
  /** Start: remember the position and wait for the page to settle. Call once the page is mounted. */
  mount(): void;
  /** A scroll event. */
  onScroll(): void;
  /** A wheel, touch, key or pointer event. */
  noteInput(): void;
  /** The top sentinel entered or left the screen. */
  setScrolled(scrolled: boolean): void;
  /** Stop: cancel the pending frame and timer. */
  destroy(): void;
  view(): HeaderView;
}

/**
 * @param env the browser
 * @param onChange called with the view after every change of it
 * @param config overrides of {@link DEFAULT_CONFIG}
 */
export function createHeaderController(env: HeaderEnv, onChange: (v: HeaderView) => void, config: Partial<HeaderConfig> = {}): HeaderController {
  const cfg: HeaderConfig = { ...DEFAULT_CONFIG, ...config };
  const v: HeaderView = { scrolled: false, hidden: false, holdClear: true };
  let lastInputAt = -Infinity;
  let anchorY = 0;
  let frameId = 0;
  let settleTimer: unknown;
  let settlePending = false;

  const emit = (prev: HeaderView) => {
    if (prev.scrolled !== v.scrolled || prev.hidden !== v.hidden || prev.holdClear !== v.holdClear) onChange({ ...v });
  };
  const edit = (fn: () => void) => {
    const prev = { ...v };
    fn();
    emit(prev);
  };

  function readScrollDirection() {
    frameId = 0;
    edit(() => {
      const y = env.scrollY();
      if (y <= cfg.hideAfterPx) {
        if (y < cfg.topPx) v.holdClear = true;
        v.hidden = false;
        anchorY = y;
        return;
      }
      const delta = y - anchorY;
      if (Math.abs(delta) < cfg.deadZonePx) return;
      if (delta > 0 && !v.holdClear && env.now() - lastInputAt > cfg.inputWindowMs) {
        anchorY = y;
        return;
      }
      v.hidden = delta > 0;
      if (delta < 0) v.holdClear = false;
      anchorY = y;
    });
  }

  function settleAfterMount() {
    settlePending = false;
    edit(() => {
      if (!v.hidden && env.scrollY() > cfg.hideAfterPx) v.holdClear = false;
    });
  }

  return {
    mount() {
      anchorY = env.scrollY();
      settlePending = true;
      settleTimer = env.setTimer(settleAfterMount, cfg.settleMs);
    },
    onScroll() {
      if (settlePending) {
        env.clearTimer(settleTimer);
        settleTimer = env.setTimer(settleAfterMount, cfg.settleMs);
      }
      if (frameId) return;
      frameId = env.requestFrame(readScrollDirection);
    },
    noteInput() {
      lastInputAt = env.now();
    },
    setScrolled(scrolled) {
      edit(() => {
        v.scrolled = scrolled;
      });
    },
    destroy() {
      if (frameId) env.cancelFrame(frameId);
      frameId = 0;
      env.clearTimer(settleTimer);
      settlePending = false;
    },
    view: () => ({ ...v }),
  };
}

/** The controller on the real window. */
export const browserEnv = (): HeaderEnv => ({
  scrollY: () => window.scrollY,
  now: () => performance.now(),
  requestFrame: (cb) => requestAnimationFrame(cb),
  cancelFrame: (id) => cancelAnimationFrame(id),
  setTimer: (cb, ms) => setTimeout(cb, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
});
