import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import axe from "axe-core";
import ParallaxLayer from "./ParallaxLayer.vue";

let reduced = false;
let wrapper: VueWrapper | undefined;
let rafQueue: FrameRequestCallback[] = [];
let mediaQueries: string[] = [];

const saved = {
  matchMedia: window.matchMedia,
  requestAnimationFrame: window.requestAnimationFrame,
  cancelAnimationFrame: window.cancelAnimationFrame,
  innerHeight: window.innerHeight,
};

function flushFrames() {
  const q = rafQueue;
  rafQueue = [];
  for (const cb of q) cb(0);
}

function box(top: number, height: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    left: 0,
    right: 100,
    bottom: top + height,
    width: 100,
    height,
    toJSON() {
      return {};
    },
  } as DOMRect;
}

function innerOf(w: VueWrapper): HTMLElement {
  const inner = w.element.firstElementChild;
  if (!(inner instanceof HTMLElement)) throw new Error("inner element missing");
  return inner;
}

/** Hyphenated names of every inline declaration. A shorthand read misses a longhand. */
function inlineProperties(el: HTMLElement): string[] {
  return Array.from({ length: el.style.length }, (_, i) => el.style.item(i)).sort();
}

/** Mount, then stub the outer box, then run the frame the bus already queued. */
function frameAt(top: number, height: number, props?: Record<string, unknown>) {
  wrapper?.unmount();
  rafQueue = [];
  wrapper = mount(ParallaxLayer, { props, attachTo: document.body });
  vi.spyOn(wrapper.element, "getBoundingClientRect").mockReturnValue(box(top, height));
  flushFrames();
  return { outer: wrapper.element as HTMLElement, inner: innerOf(wrapper) };
}

beforeEach(() => {
  reduced = false;
  rafQueue = [];
  mediaQueries = [];
  window.innerHeight = 800;
  window.matchMedia = ((query: string) => {
    mediaQueries.push(query);
    return {
      // True only for the exact reduce query, so a flipped word is not "reduced".
      matches: reduced && query === "(prefers-reduced-motion: reduce)",
      media: query,
      addEventListener() {},
      removeEventListener() {},
    };
  }) as unknown as typeof window.matchMedia;
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => {}) as typeof window.cancelAnimationFrame;
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
  window.matchMedia = saved.matchMedia;
  window.requestAnimationFrame = saved.requestAnimationFrame;
  window.cancelAnimationFrame = saved.cancelAnimationFrame;
  window.innerHeight = saved.innerHeight;
  vi.restoreAllMocks();
});

test("decorative by default: the outer div is inert and aria-hidden, the inner div holds the slot and innerClass", () => {
  wrapper = mount(ParallaxLayer, {
    props: { innerClass: "x y" },
    slots: { default: "<p>hi</p>" },
    attachTo: document.body,
  });
  const outer = wrapper.element as HTMLElement;
  expect(outer.tagName).toBe("DIV");
  expect([...outer.classList]).toContain("pl-inert");
  expect(outer.getAttribute("aria-hidden")).toBe("true");
  const inner = innerOf(wrapper);
  expect(inner.tagName).toBe("DIV");
  expect(inner.className).toBe("x y");
  expect(inner.innerHTML).toBe("<p>hi</p>");
});

test("decorative false: no aria-hidden and no inert class", () => {
  wrapper = mount(ParallaxLayer, { props: { decorative: false }, attachTo: document.body });
  const outer = wrapper.element as HTMLElement;
  expect(outer.hasAttribute("aria-hidden")).toBe(false);
  expect(outer.classList.contains("pl-inert")).toBe(false);
});

test("tag sets the outer element", () => {
  wrapper = mount(ParallaxLayer, { props: { tag: "section" }, attachTo: document.body });
  expect(wrapper.element.tagName).toBe("SECTION");
});

test("the offset is the layer centre's distance from the viewport centre times rate, negated, to 2 decimals", () => {
  // rate 0.12 is the default: centre 200, viewport centre 400, offset -(-200) * 0.12.
  const a = frameAt(100, 200);
  expect(a.inner.style.transform).toBe("translate3d(0, 24.00px, 0)");
  expect(a.outer.style.transform).toBe("");
  const b = frameAt(500, 100, { rate: -0.1 });
  expect(b.inner.style.transform).toBe("translate3d(0, 15.00px, 0)");
  expect(b.outer.style.transform).toBe("");
  const c = frameAt(600, 200);
  expect(c.inner.style.transform).toBe("translate3d(0, -36.00px, 0)");
  expect(c.outer.style.transform).toBe("");
});

test("will-change is transform on the inner element once it animates", () => {
  const { inner } = frameAt(100, 200);
  expect(inner.style.willChange).toBe("transform");
});

test("the moving element has a transform and an empty transition shorthand on the first frame", () => {
  const { inner } = frameAt(100, 200);
  expect(inner.style.transform).not.toBe("");
  expect(inner.style.transition).toBe("");
});

test("across 4 scroll frames the moving element's inline properties are exactly transform and will-change", () => {
  wrapper = mount(ParallaxLayer, { attachTo: document.body });
  const rect = vi.spyOn(wrapper.element, "getBoundingClientRect").mockReturnValue(box(100, 200));
  flushFrames();
  const tops = [140, 220, 300, 380];
  const seen: string[] = [];
  for (const top of tops) {
    rect.mockReturnValue(box(top, 200));
    window.dispatchEvent(new Event("scroll"));
    flushFrames();
    const inner = innerOf(wrapper);
    expect(inlineProperties(inner)).toEqual(["transform", "will-change"]);
    seen.push(inner.style.transform);
  }
  expect(new Set(seen).size).toBe(tops.length);
});

test("a layer more than 200px off screen does no work", () => {
  expect(frameAt(1001, 100).inner.style.transform).toBe("");
  expect(frameAt(1000, 100).inner.style.transform).not.toBe("");
  expect(frameAt(-400, 199).inner.style.transform).toBe("");
  expect(frameAt(-400, 200).inner.style.transform).not.toBe("");
});

test("a scroll moves it on the next frame", () => {
  wrapper = mount(ParallaxLayer, { attachTo: document.body });
  const rect = vi.spyOn(wrapper.element, "getBoundingClientRect").mockReturnValue(box(100, 200));
  flushFrames();
  expect(innerOf(wrapper).style.transform).toBe("translate3d(0, 24.00px, 0)");
  rect.mockReturnValue(box(300, 200));
  window.dispatchEvent(new Event("scroll"));
  flushFrames();
  expect(innerOf(wrapper).style.transform).toBe("translate3d(0, 0.00px, 0)");
});

test("with reduced motion there is no listener, no will-change and no transform", () => {
  reduced = true;
  const add = vi.spyOn(window, "addEventListener");
  wrapper = mount(ParallaxLayer, { attachTo: document.body });
  window.dispatchEvent(new Event("scroll"));
  flushFrames();
  expect(add.mock.calls.some((c) => c[0] === "scroll")).toBe(false);
  const inner = innerOf(wrapper);
  expect(inner.style.willChange).toBe("");
  expect(inner.style.transform).toBe("");
});

test("unmount removes the scroll and resize listeners", () => {
  const remove = vi.spyOn(window, "removeEventListener");
  wrapper = mount(ParallaxLayer, { attachTo: document.body });
  wrapper.unmount();
  wrapper = undefined;
  const types = remove.mock.calls.map((c) => c[0]);
  expect(types).toEqual(expect.arrayContaining(["scroll", "resize"]));
});

test("server-rendered HTML is the static plane: aria-hidden, the slot, no transform", async () => {
  const html = await renderToString(
    createSSRApp({ render: () => h(ParallaxLayer, null, { default: () => h("p", "hi") }) }),
  );
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain("<p>hi</p>");
  expect(html).not.toContain("transform");
});

test("axe finds no violations", async () => {
  const main = document.createElement("main");
  document.body.appendChild(main);
  wrapper = mount(ParallaxLayer, {
    props: { decorative: false },
    slots: { default: "<p>Text</p>" },
    attachTo: main,
  });
  const results = await axe.run(document.body);
  expect(results.violations).toEqual([]);
});

test("the inert class turns pointer events off", () => {
  const sfc = readFileSync(join(process.cwd(), "src", "ParallaxLayer.vue"), "utf8");
  const style = (sfc.split("<style scoped>")[1] ?? "").split("</style>")[0] ?? "";
  const stripped = style.replace(/\/\*[\s\S]*?\*\//g, "");
  expect(stripped.replace(/\s+/g, " ").trim()).toBe(".pl-inert { pointer-events: none; }");
});

test("the layer listens to scroll and resize, passive, not once", () => {
  const add = vi.spyOn(window, "addEventListener");
  wrapper = mount(ParallaxLayer, { attachTo: document.body });
  const scroll = add.mock.calls.filter((c) => c[0] === "scroll");
  const resize = add.mock.calls.filter((c) => c[0] === "resize");
  expect(scroll).toHaveLength(1);
  expect(resize).toHaveLength(1);
  expect(scroll[0]?.[2]).toEqual({ passive: true });
  expect(resize[0]?.[2]).toEqual({ passive: true });
});

test("two scrolls in one frame do the work once", () => {
  wrapper = mount(ParallaxLayer, { attachTo: document.body });
  const rect = vi.spyOn(wrapper.element, "getBoundingClientRect").mockReturnValue(box(100, 200));
  flushFrames();
  rect.mockClear();
  window.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new Event("scroll"));
  flushFrames();
  expect(rect).toHaveBeenCalledTimes(1);
});

test("reduced motion is read from exactly the reduce query", () => {
  wrapper = mount(ParallaxLayer, { attachTo: document.body });
  expect(mediaQueries).toEqual(["(prefers-reduced-motion: reduce)"]);
});

test("whole-style: the style block is exactly the rules this file means", () => {
  const sfc = readFileSync(join(process.cwd(), "src", "ParallaxLayer.vue"), "utf8");
  const style = (sfc.split("<style scoped>")[1] ?? "").split("</style>")[0] ?? "";
  const normalized = style.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
  expect(normalized).toBe(".pl-inert { pointer-events: none; }");
});

test("README Host must supply lists exactly the variables the style reads", () => {
  const sfc = readFileSync(join(process.cwd(), "src", "ParallaxLayer.vue"), "utf8");
  const inVue = [...new Set([...sfc.matchAll(/--site-block-[a-z-]+/g)].map((m) => m[0]))].sort();
  const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
  expect(readme.includes("## Host must supply")).toBe(true);
  const section = (readme.split("## Host must supply")[1] ?? "").split(/\n## /)[0] ?? "";
  const listed = [...new Set([...section.matchAll(/--site-block-[a-z-]+/g)].map((m) => m[0]))].sort();
  expect(listed).toEqual(inVue);
});
