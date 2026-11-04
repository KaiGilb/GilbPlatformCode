import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import axe from "axe-core";
import ParallaxLayer from "./ParallaxLayer.vue";

let reduced = false;
let wrapper: VueWrapper | undefined;
let rafQueue: FrameRequestCallback[] = [];

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
  window.innerHeight = 800;
  window.matchMedia = ((query: string) => ({
    matches: reduced,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
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
