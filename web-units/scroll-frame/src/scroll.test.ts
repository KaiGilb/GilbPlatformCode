// Spec: Rule_Code_gwcunit (RuleGwcunitA11yTest, RuleGwcunitTokens) and the proposal row 7. Tests written new.
// jsdom has no layout, no IntersectionObserver and no scroll frames: the tests mock them and drive them by hand.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import ScrollReveal from "./ScrollReveal.vue";
import { useScrollFrame } from "./useScrollFrame";
import { useReveal } from "./useReveal";

let wrapper: VueWrapper | undefined;
let reduced = false;
let rafQueue: Array<() => void> = [];
let ioCallback: ((e: Array<{ target: Element; isIntersecting: boolean }>) => void) | undefined;
const observed: Element[] = [];
const unobserved: Element[] = [];
let disconnected = 0;
const tops = new Map<Element, number>();

beforeEach(() => {
  reduced = false;
  rafQueue = [];
  ioCallback = undefined;
  observed.length = 0; unobserved.length = 0; disconnected = 0; tops.clear();
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduced && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
  window.requestAnimationFrame = ((cb: () => void) => { rafQueue.push(cb); return rafQueue.length; }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => { rafQueue = []; }) as typeof window.cancelAnimationFrame;
  vi.stubGlobal("IntersectionObserver", class {
    constructor(cb: typeof ioCallback) { ioCallback = cb; }
    observe(e: Element) { observed.push(e); }
    unobserve(e: Element) { unobserved.push(e); }
    disconnect() { disconnected++; }
  });
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
  Element.prototype.getBoundingClientRect = function () { const t = tops.get(this) ?? 0; return { top: t, bottom: t + 10, left: 0, right: 0, width: 0, height: 10, x: 0, y: t, toJSON() {} }; };
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; document.documentElement.className = ""; vi.unstubAllGlobals(); });
const flush = () => { const q = rafQueue; rafQueue = []; q.forEach((f) => f()); };
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);

function harness(setup: (api: ReturnType<typeof useScrollFrame>) => void) {
  return mount(defineComponent({ setup() { setup(useScrollFrame()); return () => h("div"); } }), { attachTo: document.body });
}

describe("useScrollFrame", () => {
  test("a subscriber runs once at once, then on the next frame after a scroll, one batch per frame", () => {
    const fn = vi.fn();
    wrapper = harness((a) => a.subscribe(fn));
    expect(fn).not.toHaveBeenCalled();
    flush();
    expect(fn).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("scroll")); window.dispatchEvent(new Event("scroll")); window.dispatchEvent(new Event("resize"));
    expect(rafQueue).toHaveLength(1);
    flush();
    expect(fn).toHaveBeenCalledTimes(2);
  });
  test("the unsubscribe stops it, and the last one removes the listeners", () => {
    const add = vi.spyOn(window, "addEventListener"); const rem = vi.spyOn(window, "removeEventListener");
    const fn = vi.fn(); let off = () => {};
    wrapper = harness((a) => { off = a.subscribe(fn); });
    expect(add.mock.calls.filter((c) => c[0] === "scroll" && (c[2] as AddEventListenerOptions).passive)).toHaveLength(1);
    off(); flush();
    expect(fn).not.toHaveBeenCalled();
    expect(rem.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(["scroll", "resize"]));
  });
  test("unmounting removes the listeners and drops the subscribers", () => {
    const fn = vi.fn();
    wrapper = harness((a) => a.subscribe(fn));
    wrapper.unmount(); wrapper = undefined;
    window.dispatchEvent(new Event("scroll")); flush();
    expect(fn).not.toHaveBeenCalled();
  });
  test("under reduced motion `reduced` is true and nothing is registered", () => {
    reduced = true;
    const fn = vi.fn(); let r = false;
    wrapper = harness((a) => { r = a.reduced; a.subscribe(fn); });
    window.dispatchEvent(new Event("scroll")); flush();
    expect(r).toBe(true); expect(fn).not.toHaveBeenCalled(); expect(rafQueue).toHaveLength(0);
  });
});

function mountReveal(tops_: number[]) {
  const els: HTMLElement[] = [];
  wrapper = mount(defineComponent({
    setup() { const r = ref<HTMLElement | null>(null); useReveal(r); return () => h("section", { ref: r }, tops_.map((_, i) => h("p", { "data-reveal": "", id: "p" + i }, "t" + i))); },
  }), { attachTo: document.body, });
  return els;
}

describe("useReveal", () => {
  test("only elements below 92 % of the viewport are armed and observed; those on screen stay visible", () => {
    // The mock layout is read at mount, so set tops by id order through a prototype hook.
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () { const t = this.id === "p0" ? 100 : 2000; return { ...orig.call(this), top: t } as DOMRect; };
    mountReveal([0, 0, 0]);
    expect(document.documentElement.classList.contains("sf-motion")).toBe(true);
    expect(document.getElementById("p0")!.classList.contains("sf-hidden")).toBe(false);
    expect(document.getElementById("p1")!.classList.contains("sf-hidden")).toBe(true);
    expect(observed.map((e) => e.id)).toEqual(["p1", "p2"]);
  });
  test("entering the view shows an element, staggers a batch by 100 ms capped at 500 ms, and stops observing it", () => {
    Element.prototype.getBoundingClientRect = function () { return { top: 2000 } as DOMRect; };
    mountReveal(Array(8).fill(0));
    ioCallback!(observed.map((target) => ({ target, isIntersecting: true })));
    const delays = observed.map((e) => (e as HTMLElement).style.getPropertyValue("--sf-delay"));
    expect(delays).toEqual(["0ms", "100ms", "200ms", "300ms", "400ms", "500ms", "500ms", "500ms"]);
    expect(observed.every((e) => e.classList.contains("sf-shown"))).toBe(true);
    expect(unobserved).toHaveLength(8);
  });
  test("an entry that is not intersecting changes nothing", () => {
    Element.prototype.getBoundingClientRect = function () { return { top: 2000 } as DOMRect; };
    mountReveal([0]);
    ioCallback!([{ target: observed[0]!, isIntersecting: false }]);
    expect(observed[0]!.classList.contains("sf-shown")).toBe(false);
  });
  test("reduced motion arms nothing and adds no class", () => {
    reduced = true;
    Element.prototype.getBoundingClientRect = function () { return { top: 2000 } as DOMRect; };
    mountReveal([0, 0]);
    expect(document.querySelectorAll(".sf-hidden")).toHaveLength(0);
    expect(document.documentElement.classList.contains("sf-motion")).toBe(false);
    expect(observed).toHaveLength(0);
  });
  test("no IntersectionObserver arms nothing", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    delete (window as unknown as Record<string, unknown>).IntersectionObserver;
    Element.prototype.getBoundingClientRect = function () { return { top: 2000 } as DOMRect; };
    mountReveal([0]);
    expect(document.querySelectorAll(".sf-hidden")).toHaveLength(0);
  });
  test("unmounting disconnects the observer", () => {
    Element.prototype.getBoundingClientRect = function () { return { top: 2000 } as DOMRect; };
    mountReveal([0]);
    wrapper!.unmount(); wrapper = undefined;
    expect(disconnected).toBe(1);
  });
});

describe("ScrollReveal", () => {
  test("renders its slot in a div (or the tag given) and arms the data-reveal children below the fold", () => {
    Element.prototype.getBoundingClientRect = function () { return { top: 2000 } as DOMRect; };
    wrapper = mount(ScrollReveal, { props: { tag: "section" }, slots: { default: '<h2 data-reveal>Hi</h2>' }, attachTo: document.body });
    expect(document.querySelector("section > h2")!.classList.contains("sf-hidden")).toBe(true);
  });
  test("the server's HTML is the slot, fully visible, with no handler and no sf- class", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(ScrollReveal, null, { default: () => h("p", { "data-reveal": "" }, "Hello") }) }));
    expect(html).toContain("Hello");
    expect(html).not.toMatch(/sf-hidden|sf-shown|\son[a-z]+=/);
  });
  test("axe: no violations", async () => {
    wrapper = mount(ScrollReveal, { slots: { default: "<h2 data-reveal>Hi</h2><p data-reveal>Body</p>" }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
  });
});

describe("the unit's style", () => {
  const SFC = readFileSync(join(process.cwd(), "src", "ScrollReveal.vue"), "utf8");
  const style = (SFC.split("<style>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  test("the hidden state exists only under html.sf-motion and no-preference, and no colour is named", () => {
    expect(style).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(style).toContain("html.sf-motion .sf-hidden");
    expect(style).not.toMatch(/#[0-9a-f]{3,8}\b|rgb|hsl|var\(--(?!sf-)/i);
  });
  test("it imports nothing but vue and its own files", () => {
    for (const f of ["ScrollReveal.vue", "useReveal.ts", "useScrollFrame.ts"]) {
      const src = readFileSync(join(process.cwd(), "src", f), "utf8");
      expect([...src.matchAll(/^import .* from "([^"]+)"/gm)].every((m) => m[1] === "vue" || m[1]!.startsWith("./"))).toBe(true);
    }
  });
});
