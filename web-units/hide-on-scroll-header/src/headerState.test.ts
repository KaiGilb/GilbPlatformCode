// Spec: Rule_Code_gwcunit and the proposal PROPOSAL-2026-10-20-WebsitesGilbComponentsIntoLibrary-GilbPlatformCode
// (row 10). Tests written new. The ORACLE below is the former layouts/landing.vue logic (b78b1f9) copied line for
// line onto plain variables; the controller must give the same view after every step of thousands of random
// scroll / input / timer sequences ("looks and behaves as before", a frame for a frame).
import { describe, expect, test } from "vitest";
import { createHeaderController, DEFAULT_CONFIG, isSolid, type HeaderEnv, type HeaderView } from "./headerState";

/** A fake browser: a manual clock, queued animation frames and timers. */
function fakeEnv() {
  let t = 1000;
  let y = 0;
  let nextId = 1;
  const frames = new Map<number, () => void>();
  const timers = new Map<number, { at: number; cb: () => void }>();
  const env: HeaderEnv = {
    scrollY: () => y,
    now: () => t,
    requestFrame: (cb) => { const id = nextId++; frames.set(id, cb); return id; },
    cancelFrame: (id) => { frames.delete(id); },
    setTimer: (cb, ms) => { const id = nextId++; timers.set(id, { at: t + ms, cb }); return id; },
    clearTimer: (h) => { timers.delete(h as number); },
  };
  return {
    env,
    setY: (v: number) => { y = v; },
    /** Run the pending animation frames (one display frame). */
    frame() { const fs = [...frames.values()]; frames.clear(); fs.forEach((f) => f()); },
    /** Move the clock, firing due timers in order. */
    advance(ms: number) {
      const end = t + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        t = Math.max(t, due[1].at);
        due[1].cb();
      }
      t = end;
    },
    pending: () => ({ frames: frames.size, timers: timers.size }),
  };
}

/** The former code, on plain variables (comments dropped; logic unchanged). */
function oracle(f: ReturnType<typeof fakeEnv>) {
  const HIDE_AFTER_PX = 96, DEAD_ZONE_PX = 8, TOP_PX = 48, SETTLE_MS = 150, INPUT_WINDOW_MS = 1000;
  const s = { scrolled: false, hidden: false, holdClear: true };
  let lastInputAt = -Infinity, anchorY = 0, frameId = 0;
  let settleTimer: unknown;
  function readScrollDirection() {
    frameId = 0;
    const y = f.env.scrollY();
    if (y <= HIDE_AFTER_PX) {
      if (y < TOP_PX) s.holdClear = true;
      s.hidden = false;
      anchorY = y;
      return;
    }
    const delta = y - anchorY;
    if (Math.abs(delta) < DEAD_ZONE_PX) return;
    if (delta > 0 && !s.holdClear && f.env.now() - lastInputAt > INPUT_WINDOW_MS) { anchorY = y; return; }
    s.hidden = delta > 0;
    if (delta < 0) s.holdClear = false;
    anchorY = y;
  }
  function settleAfterMount() {
    settleTimer = undefined;
    if (!s.hidden && f.env.scrollY() > HIDE_AFTER_PX) s.holdClear = false;
  }
  return {
    s,
    mount() { anchorY = f.env.scrollY(); settleTimer = f.env.setTimer(settleAfterMount, SETTLE_MS); },
    onScroll() {
      if (settleTimer !== undefined) { f.env.clearTimer(settleTimer); settleTimer = f.env.setTimer(settleAfterMount, SETTLE_MS); }
      if (frameId) return;
      frameId = f.env.requestFrame(readScrollDirection);
    },
    noteInput() { lastInputAt = f.env.now(); },
    setScrolled(b: boolean) { s.scrolled = b; },
  };
}

function rig(startY = 0, config = {}) {
  const f = fakeEnv();
  f.setY(startY);
  const seen: HeaderView[] = [];
  const c = createHeaderController(f.env, (v) => seen.push(v), config);
  c.mount();
  return { f, c, seen, view: () => c.view() };
}
const scrollTo = (r: ReturnType<typeof rig>, y: number) => { r.f.setY(y); r.c.onScroll(); r.f.frame(); };

describe("the controller, rule by rule", () => {
  test("starts clear and shown, as the server draws it", () => {
    const r = rig();
    expect(r.view()).toEqual({ scrolled: false, hidden: false, holdClear: true });
    expect(isSolid(r.view())).toBe(false);
  });
  test("leaving the top by scrolling down goes straight to hidden and never through a dark frame", () => {
    const r = rig();
    r.c.setScrolled(true); // the sentinel leaves view at 48 px, before hiding starts at 96 px
    scrollTo(r, 60);
    expect(isSolid(r.view())).toBe(false);
    scrollTo(r, 120);
    expect(r.view().hidden).toBe(true);
    for (const v of r.seen) expect(isSolid(v)).toBe(false);
  });
  test("a scroll up brings the bar back, and then it is solid", () => {
    const r = rig();
    r.c.setScrolled(true);
    scrollTo(r, 400);
    expect(r.view().hidden).toBe(true);
    scrollTo(r, 380);
    expect(r.view()).toEqual({ scrolled: true, hidden: false, holdClear: false });
    expect(isSolid(r.view())).toBe(true);
  });
  test("being back at the very top arms the clear bar again", () => {
    const r = rig();
    r.c.setScrolled(true);
    scrollTo(r, 400);
    scrollTo(r, 380);
    r.c.setScrolled(false);
    scrollTo(r, 10);
    expect(r.view()).toEqual({ scrolled: false, hidden: false, holdClear: true });
  });
  test("never hides at or above 96 px", () => {
    const r = rig();
    scrollTo(r, 96);
    expect(r.view().hidden).toBe(false);
    scrollTo(r, 97);
    expect(r.view().hidden).toBe(false); // delta from the anchor (96) is 1: inside the dead zone
    scrollTo(r, 110);
    expect(r.view().hidden).toBe(true);
  });
  test("moves under the dead zone are ignored, and many small moves add up because the anchor stays", () => {
    const r = rig(200);
    r.c.setScrolled(true);
    scrollTo(r, 204);
    scrollTo(r, 207);
    expect(r.view().hidden).toBe(false);
    scrollTo(r, 209);
    expect(r.view().hidden).toBe(true);
  });
  test("a solid bar hides only after the visitor's own input (a layout nudge cannot hide it)", () => {
    const r = rig(300);
    r.f.advance(200); // settle: opened past the hero, so the bar turns solid
    r.c.setScrolled(true);
    expect(isSolid(r.view())).toBe(true);
    scrollTo(r, 340); // a nudge, no input
    expect(r.view().hidden).toBe(false);
    r.c.noteInput();
    scrollTo(r, 400);
    expect(r.view().hidden).toBe(true);
  });
  test("the input counts for one second, not longer", () => {
    const r = rig(300);
    r.f.advance(200);
    r.c.setScrolled(true);
    r.c.noteInput();
    r.f.advance(1001);
    scrollTo(r, 400);
    expect(r.view().hidden).toBe(false);
    r.f.advance(0);
    r.c.noteInput();
    r.f.advance(999);
    scrollTo(r, 500);
    expect(r.view().hidden).toBe(true);
  });
  test("a clear bar hides without input (the touch that woke the page came before the listeners)", () => {
    const r = rig(0);
    r.c.setScrolled(true);
    scrollTo(r, 150);
    expect(r.view().hidden).toBe(true);
  });
  test("opened past the hero (reload or a link): once still for 150 ms the bar turns solid; while it still moves it waits", () => {
    const r = rig(500);
    r.c.setScrolled(true);
    r.f.advance(100);
    r.c.onScroll();
    r.f.advance(100); // the scroll restarted the wait
    expect(r.view().holdClear).toBe(true);
    r.f.advance(60);
    expect(r.view().holdClear).toBe(false);
    expect(isSolid(r.view())).toBe(true);
  });
  test("if a downward move already hid the bar before the page settled, it stays hidden and clear", () => {
    const r = rig(0);
    r.c.setScrolled(true);
    scrollTo(r, 300);
    r.f.advance(200);
    expect(r.view()).toEqual({ scrolled: true, hidden: true, holdClear: true });
  });
  test("one read per frame, however many scroll events", () => {
    const r = rig(0);
    r.f.setY(200);
    r.c.onScroll(); r.c.onScroll(); r.c.onScroll();
    expect(r.f.pending().frames).toBe(1);
  });
  test("onChange fires only when the view changes", () => {
    const r = rig(0);
    scrollTo(r, 10);
    scrollTo(r, 20);
    expect(r.seen).toEqual([]);
    r.c.setScrolled(true);
    r.c.setScrolled(true);
    expect(r.seen).toHaveLength(1);
  });
  test("destroy cancels the pending frame and timer", () => {
    const r = rig(0);
    r.f.setY(200);
    r.c.onScroll();
    r.c.destroy();
    expect(r.f.pending()).toEqual({ frames: 0, timers: 0 });
  });
  test("the thresholds can be overridden", () => {
    const r = rig(0, { hideAfterPx: 10, deadZonePx: 2 });
    r.c.setScrolled(true);
    scrollTo(r, 20);
    expect(r.view().hidden).toBe(true);
    expect(DEFAULT_CONFIG.hideAfterPx).toBe(96);
  });
});

// A seeded generator, so a failure repeats.
function rng(seed: number) { return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; }

describe("the controller against the former code (the oracle)", () => {
  test("6000 random visits of 60 steps each give the same view after every step", () => {
    const rand = rng(20261020);
    let steps = 0, hiddenSeen = 0, solidSeen = 0;
    for (let visit = 0; visit < 6000; visit++) {
      const startY = rand() < 0.5 ? 0 : Math.floor(rand() * 1500);
      const a = fakeEnv(), b = fakeEnv();
      a.setY(startY); b.setY(startY);
      const views: HeaderView[] = [];
      const c = createHeaderController(a.env, (v) => views.push(v));
      const o = oracle(b);
      c.mount(); o.mount();
      let y = startY;
      for (let i = 0; i < 60; i++) {
        const r = rand();
        if (r < 0.45) { // a scroll event, with a random move (small, jitter, big, or a jump to the top)
          const m = rand();
          y = m < 0.5 ? y + Math.round((rand() - 0.5) * 12) : m < 0.9 ? y + Math.round((rand() - 0.5) * 300) : m < 0.95 ? 0 : Math.floor(rand() * 2000);
          y = Math.max(0, y);
          a.setY(y); b.setY(y); c.onScroll(); o.onScroll();
        } else if (r < 0.6) { c.noteInput(); o.noteInput(); }
        else if (r < 0.75) { a.frame(); b.frame(); }
        else if (r < 0.9) { const ms = [0, 10, 100, 149, 150, 151, 400, 999, 1001, 3000][Math.floor(rand() * 10)]!; a.advance(ms); b.advance(ms); }
        else { const sc = y >= 48 && rand() < 0.9; c.setScrolled(sc); o.setScrolled(sc); }
        const got = c.view();
        expect(got, `visit ${visit} step ${i}`).toEqual(o.s);
        steps++; if (got.hidden) hiddenSeen++; if (isSolid(got)) solidSeen++;
      }
      void views;
    }
    expect(steps).toBe(360000);
    // The random walk must have visited the interesting states, or the comparison proves little.
    expect(hiddenSeen).toBeGreaterThan(10000);
    expect(solidSeen).toBeGreaterThan(10000);
  });
  test("the oracle itself reproduces the 2026-10-12 case: clear to hidden with no solid frame in between", () => {
    const f = fakeEnv(); const o = oracle(f);
    o.mount(); o.setScrolled(true); f.setY(60); o.onScroll(); f.frame();
    expect(o.s.holdClear && !o.s.hidden).toBe(true);
    f.setY(130); o.onScroll(); f.frame();
    expect(o.s.hidden).toBe(true);
  });
});
