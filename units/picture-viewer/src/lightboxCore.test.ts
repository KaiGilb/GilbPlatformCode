// Spec: Rule_Code_gwcunit (RuleGwcunitA11yTest, RuleGwcunitStackFit) and the Skalden proposal
// PROPOSAL-2026-10-20-SkaldenComponentsIntoLibrary-GilbPlatformCode, "Lightbox design". Tests written new.
// The pure rules of the viewer; the same rules are proven on real keys and fingers in scripts/check-lightbox-browser.mjs.
import { describe, expect, test } from "vitest";
import {
  DOUBLE_TAP_ZOOM, MAX_ZOOM, clampPan, collectSet, defaultWords, isDoubleTap, isTap, itemFromImg, pinchScale, readSwipe,
  resolveWords, stepIndex, whySkipped, zoomAround,
} from "./lightboxCore";

const html = (s: string) => { document.body.innerHTML = s; return document.body; };

describe("stepIndex", () => {
  test.each([[0, 5, -1, 0], [0, 5, 1, 1], [4, 5, 1, 4], [2, 5, -1, 1], [0, 1, 1, 0], [0, 0, 1, 0]] as const)("from %i of %i by %i gives %i (held at the ends, no wrap)", (i, n, d, out) => {
    expect(stepIndex(i, n, d)).toBe(out);
  });
});

describe("readSwipe", () => {
  test.each([
    [-80, 5, 5, "next"], [80, -5, 5, "previous"], [-49, 0, 5, null], [-80, 70, 5, null],
    [5, 120, 5, "close"], [5, 89, 5, null], [5, -200, 5, null], [0, 0, 5, null],
  ] as const)("dx %i dy %i in a set of %i reads %s", (dx, dy, n, out) => {
    expect(readSwipe(dx, dy, n)).toBe(out);
  });
  test("a sideways swipe does nothing when the set has one picture, a downward one still closes", () => {
    expect(readSwipe(-120, 0, 1)).toBeNull();
    expect(readSwipe(0, 150, 1)).toBe("close");
  });
});

describe("taps", () => {
  test("a short press that hardly moved is a tap", () => {
    expect(isTap(120, 3)).toBe(true);
    expect(isTap(400, 3)).toBe(false);
    expect(isTap(120, 20)).toBe(false);
  });
  test("two taps close in time and place are a double tap", () => {
    const a = { t: 1000, x: 100, y: 100 };
    expect(isDoubleTap(a, 1200, 110, 105)).toBe(true);
    expect(isDoubleTap(a, 1500, 100, 100)).toBe(false);
    expect(isDoubleTap(a, 1200, 200, 100)).toBe(false);
    expect(isDoubleTap(null, 1200, 100, 100)).toBe(false);
  });
});

describe("zoom and pan arithmetic", () => {
  test("a picture that still fits cannot be panned", () => {
    expect(clampPan(1, 50, 50, 400, 300, 800, 600)).toEqual({ tx: 0, ty: 0 });
  });
  test("a zoomed picture can be panned only as far as its edge", () => {
    // 400 wide at 3x = 1200 in an 800 box: 200 px of room each side. Height 300*3 = 900 in 600: 150.
    expect(clampPan(3, 500, -500, 400, 300, 800, 600)).toEqual({ tx: 200, ty: -150 });
    expect(clampPan(3, 40, 10, 400, 300, 800, 600)).toEqual({ tx: 40, ty: 10 });
  });
  test("zooming around a point keeps the spot under the point where it was", () => {
    // layout centre L, point offset o, pan t, scale s: the screen spot of picture point p is L + t + s*p.
    for (const [s, t, next, o] of [[1, 0, 2.5, 120], [2, 30, 3, -80], [3, -50, 1, 200]] as const) {
      const z = zoomAround(s, t, 0, next, o, 0);
      const p = (o - t) / s; // the picture point under the finger before
      expect(z.tx + z.scale * p).toBeCloseTo(o, 6);
    }
  });
  test("the double-tap scale and the pinch are held between 1 and the maximum", () => {
    expect(DOUBLE_TAP_ZOOM).toBeGreaterThan(1);
    expect(DOUBLE_TAP_ZOOM).toBeLessThan(MAX_ZOOM);
    expect(pinchScale(1, 100, 200)).toBe(2);
    expect(pinchScale(1, 100, 20)).toBe(1);
    expect(pinchScale(2, 100, 900)).toBe(MAX_ZOOM);
    expect(pinchScale(2, 0, 900)).toBe(2);
  });
});

describe("which pictures open", () => {
  test("a picture with alt text opens; no alt, empty alt and whitespace alt do not", () => {
    html(`<img id="a" alt="A cat" src="/a.jpg"><img id="b" src="/b.jpg"><img id="c" alt="" src="/c.jpg"><img id="d" alt="  " src="/d.jpg">`);
    const q = (id: string) => document.getElementById(id);
    expect(whySkipped(q("a"))).toBeNull();
    expect(["b", "c", "d"].map((i) => whySkipped(q(i)))).toEqual(["no-alt", "no-alt", "no-alt"]);
  });
  test("data-no-lightbox on the picture or a parent opts out; a picture in a link is left alone", () => {
    html(`<img id="a" alt="x" src="/a.jpg" data-no-lightbox><div data-no-lightbox><img id="b" alt="x" src="/b.jpg"></div><a href="/z"><img id="c" alt="x" src="/c.jpg"></a>`);
    expect(["a", "b", "c"].map((i) => whySkipped(document.getElementById(i)))).toEqual(["opt-out", "opt-out", "in-link"]);
  });
  test("a non-picture is not a picture", () => {
    html(`<p id="p">x</p>`);
    expect(whySkipped(document.getElementById("p"))).toBe("not-image");
    expect(whySkipped(null)).toBe("not-image");
  });
  test("the set is every opening picture in page order and the index is the clicked one", () => {
    html(`<main><img alt="one" src="/1.jpg"><img alt="" src="/x.jpg"><a href="#"><img alt="no" src="/n.jpg"></a><figure><img id="t" alt="three" src="/3.jpg" data-full="/3-big.jpg"><figcaption>Third, in words</figcaption></figure></main>`);
    const { items, index } = collectSet(document.querySelector("main")!, document.getElementById("t")!);
    expect(items.map((i) => i.alt)).toEqual(["one", "three"]);
    expect(index).toBe(1);
    expect(items[1]).toMatchObject({ src: "/3-big.jpg", caption: "Third, in words" });
    expect(items[0]!.caption).toBe("one");
  });
  test("with no data-full the viewer shows the picture's own file", () => {
    html(`<img id="a" alt="x" src="/a.jpg">`);
    expect(itemFromImg(document.getElementById("a") as HTMLImageElement).src).toContain("/a.jpg");
  });
});

describe("words", () => {
  test("English by default; the host's words win; the counter is built from two numbers", () => {
    expect(defaultWords.count(3, 12)).toBe("3 of 12");
    const w = resolveWords({ close: "Lukk", count: (a, b) => `${a} av ${b}` });
    expect(w.close).toBe("Lukk");
    expect(w.count(3, 12)).toBe("3 av 12");
    expect(w.next).toBe(defaultWords.next);
  });
});
