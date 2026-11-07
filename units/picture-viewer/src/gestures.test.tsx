// Gestures on synthetic pointer events (jsdom draws no layout: the sizes are given by the kit's giveLayout, and the
// event times by hand). The numbers asserted are the thresholds of lightboxCore: SWIPE_DISTANCE 50, SWIPE_CLOSE_DISTANCE 90,
// TAP_SLOP 10, DOUBLE_TAP_TIME 350, DOUBLE_TAP_ZOOM 2.5, MAX_ZOOM 4.
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ITEMS, fire, giveLayout, key, openViewer, panOf, pointer, q, removeLayout, shown, stage, viewer, wheel, zoomOf } from "../test/kit";

beforeEach(giveLayout);
afterEach(removeLayout);
const count = () => q(".ilb-count").textContent!.trim();

/** A one-finger drag from (x0, y0) to (x1, y1) taking `ms`, ending at time `t0 + ms`. */
function drag(target: Element, x0: number, y0: number, x1: number, y1: number, t0 = 1000, ms = 120, id = 1): void {
  pointer("pointerdown", target, id, x0, y0, t0);
  pointer("pointermove", target, id, (x0 + x1) / 2, (y0 + y1) / 2, t0 + ms / 2);
  pointer("pointermove", target, id, x1, y1, t0 + ms - 10);
  pointer("pointerup", target, id, x1, y1, t0 + ms);
}
function tap(target: Element, x: number, y: number, t: number): void {
  pointer("pointerdown", target, 1, x, y, t);
  pointer("pointerup", target, 1, x, y, t + 50);
}

describe("swipes at fit size", () => {
  test("a swipe left shows the next picture, right the previous", async () => {
    await openViewer({ index: 1 });
    expect(count()).toBe("2 of 3");
    drag(shown(), 300, 150, 200, 150); // 100 px left
    expect(count()).toBe("3 of 3");
    drag(shown(), 100, 150, 200, 150); // 100 px right
    expect(count()).toBe("2 of 3");
    drag(shown(), 100, 150, 200, 150);
    expect(count()).toBe("1 of 3");
  });
  test("a sideways move of 49 px is not a swipe, 50 px is", async () => {
    await openViewer({ index: 1 });
    drag(shown(), 300, 150, 251, 150);
    expect(count()).toBe("2 of 3");
    drag(shown(), 300, 150, 250, 150);
    expect(count()).toBe("3 of 3");
  });
  test("a swipe down of 90 px closes the viewer; 89 px does not", async () => {
    await openViewer({});
    drag(shown(), 200, 100, 200, 189);
    expect(viewer()).not.toBeNull();
    drag(shown(), 200, 100, 200, 190);
    expect(viewer()).toBeNull();
  });
  test("a swipe is not read on a picture alone in its set, and the picture springs back", async () => {
    await openViewer({ items: [ITEMS[0]!] });
    drag(shown(), 300, 150, 100, 150);
    expect(viewer()).not.toBeNull();
    expect(panOf()).toEqual({ x: 0, y: 0 });
  });
  test("while the finger moves the picture follows it (down only), and lets go at rest", async () => {
    await openViewer({});
    pointer("pointerdown", shown(), 1, 200, 100, 1000);
    pointer("pointermove", shown(), 1, 230, 140, 1050);
    expect(panOf()).toEqual({ x: 30, y: 40 });
    pointer("pointermove", shown(), 1, 230, 60, 1100);
    expect(panOf()).toEqual({ x: 30, y: 0 });
    pointer("pointerup", shown(), 1, 230, 60, 1150);
    expect(panOf()).toEqual({ x: 0, y: 0 });
  });
});

describe("pinch, double tap, drag and wheel", () => {
  test("two fingers moving apart zoom in, held at the maximum; letting go at fit size resets", async () => {
    await openViewer({});
    pointer("pointerdown", shown(), 1, 100, 150, 1000);
    pointer("pointerdown", shown(), 2, 200, 150, 1001);
    pointer("pointermove", shown(), 2, 300, 150, 1050); // 100 -> 200 apart
    expect(zoomOf()).toBe(2);
    pointer("pointermove", shown(), 2, 900, 150, 1100); // far beyond: held at 4
    expect(zoomOf()).toBe(4);
    pointer("pointermove", shown(), 2, 100, 150, 1150); // together again: back to 1
    expect(zoomOf()).toBe(1);
    pointer("pointerup", shown(), 2, 100, 150, 1200);
    pointer("pointerup", shown(), 1, 100, 150, 1201);
    expect(zoomOf()).toBe(1);
    expect(panOf()).toEqual({ x: 0, y: 0 });
  });
  test("a double tap on the picture zooms to 2.5, a second double tap returns to fit", async () => {
    await openViewer({});
    tap(shown(), 200, 150, 1000);
    expect(zoomOf()).toBe(1);
    tap(shown(), 205, 150, 1200);
    expect(zoomOf()).toBe(2.5);
    tap(shown(), 200, 150, 5000);
    tap(shown(), 200, 150, 5200);
    expect(zoomOf()).toBe(1);
  });
  test("two taps 351 ms apart, or 31 px apart, are not a double tap", async () => {
    await openViewer({});
    tap(shown(), 200, 150, 1000); // up at 1050
    tap(shown(), 200, 150, 1400); // down at 1400, up at 1450: 400 after the first up
    expect(zoomOf()).toBe(1);
    tap(shown(), 100, 150, 3000);
    tap(shown(), 140, 150, 3100);
    expect(zoomOf()).toBe(1);
  });
  test("a press of more than 10 px is a move, not a tap", async () => {
    await openViewer({});
    tap(shown(), 200, 150, 1000);
    pointer("pointerdown", shown(), 1, 200, 150, 1200);
    pointer("pointermove", shown(), 1, 215, 150, 1220);
    pointer("pointerup", shown(), 1, 200, 150, 1250);
    expect(zoomOf()).toBe(1);
  });
  test("a zoomed picture is dragged with the finger, and held inside its box", async () => {
    await openViewer({});
    key("+"); key("+"); key("+"); // 3.375: the picture is 400 px wide in a 400 px box, so it may move 475 px each way
    expect(zoomOf()).toBe(3.38);
    drag(shown(), 200, 150, 250, 170);
    expect(panOf()).toEqual({ x: 50, y: 20 });
    expect(viewer()).not.toBeNull();
    drag(shown(), 200, 150, 2000, 150);
    expect(panOf().x).toBeCloseTo(475, 5);
    drag(shown(), 200, 150, -4000, 150);
    expect(panOf().x).toBeCloseTo(-475, 5);
    drag(shown(), 200, 150, 200, 3000);
    expect(panOf().y).toBeCloseTo(0.5 * (300 * 3.375 - 300), 5);
  });
  test("a zoomed picture is not swiped away: a long drag stays on the same picture", async () => {
    await openViewer({ index: 1 });
    key("+");
    drag(shown(), 300, 150, 100, 150);
    expect(count()).toBe("2 of 3");
  });
  test("a trackpad pinch (wheel with ctrl) zooms and is kept from the page; a plain wheel does nothing", async () => {
    await openViewer({});
    const plain = wheel(200, 150, -100, false);
    expect(plain.defaultPrevented).toBe(false);
    expect(zoomOf()).toBe(1);
    const pinch = wheel(200, 150, -100, true);
    expect(pinch.defaultPrevented).toBe(true);
    expect(zoomOf()).toBe(2.72); // e to the 1
    wheel(200, 150, 1000, true);
    expect(zoomOf()).toBe(1);
    wheel(200, 150, -10000, true);
    expect(zoomOf()).toBe(4);
  });
  test("a tap on the dark edge closes the viewer; a tap on the picture does not", async () => {
    await openViewer({});
    tap(shown(), 200, 150, 1000);
    expect(viewer()).not.toBeNull();
    tap(stage(), 5, 5, 2000);
    expect(viewer()).toBeNull();
  });
  test("a cancelled gesture resets a picture left at fit size", async () => {
    await openViewer({});
    pointer("pointerdown", shown(), 1, 200, 100, 1000);
    pointer("pointermove", shown(), 1, 230, 140, 1050);
    pointer("pointercancel", shown(), 1, 230, 140, 1060);
    expect(panOf()).toEqual({ x: 0, y: 0 });
  });
  test("the zoom-in and fit buttons reach the views the keys reach", async () => {
    await openViewer({});
    await act(async () => { q(".ilb-tools button:nth-child(3)").click(); });
    expect(zoomOf()).toBe(1.5);
    await act(async () => { q(".ilb-fit").click(); });
    expect(zoomOf()).toBe(1);
    fire(shown(), "load");
  });
});
