// Spec: Agent.Tester R1 (Skalden units) D1, D2, D3 and RuleA11yUnitTest. jsdom has no layout and loads no pictures,
// so sizes are given by a stand-in getBoundingClientRect and load/error events are sent by hand; the same cases run on
// real layout and real loading in scripts/check-lightbox-browser.mjs.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import axe from "axe-core";
import { ImageLightbox, LightboxScope } from "./index";
import { isTooSmall, whySkipped } from "./lightboxCore";

let wrapper: VueWrapper | undefined;
beforeEach(() => { window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; document.body.removeAttribute("style"); vi.restoreAllMocks(); });
const tick = async () => { await nextTick(); await nextTick(); await new Promise((r) => setTimeout(r, 0)); await nextTick(); };
const viewer = () => document.querySelector<HTMLElement>("[data-lightbox-viewer]");
const box = (w: number, h: number) => ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON() {} }) as DOMRect;
const sized = (el: Element, w: number, h: number) => { el.getBoundingClientRect = () => box(w, h); };
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);

const Article = defineComponent({
  components: { LightboxScope },
  template: `<div><LightboxScope><img id="a" src="/a.jpg" alt="A"><img id="b" src="/b.jpg" alt="B" data-full="/b-big.jpg"></LightboxScope></div>`,
});
const el = (id: string) => document.getElementById(id)!;
const mountArticle = async () => { wrapper = mount(Article, { attachTo: document.body }); await tick(); };

describe("D1: a picture drawn under 24 px does not become a button", () => {
  test("isTooSmall: under 24 on either side is small; 24 is not; no layout (0 by 0) is not counted", () => {
    const i = document.createElement("img");
    sized(i, 16, 16); expect(isTooSmall(i)).toBe(true);
    sized(i, 200, 23); expect(isTooSmall(i)).toBe(true);
    sized(i, 24, 24); expect(isTooSmall(i)).toBe(false);
    sized(i, 0, 0); expect(isTooSmall(i)).toBe(false);
  });
  test("whySkipped names it too-small", () => {
    const i = document.createElement("img"); i.alt = "x"; sized(i, 10, 10);
    expect(whySkipped(i)).toBe("too-small");
  });
  test("in a scope a small picture stays plain and a normal one opens; when it grows it becomes a button", async () => {
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () { return this.id === "a" ? box(16, 16) : box(400, 300); };
    await mountArticle();
    expect([el("a").hasAttribute("role"), el("a").hasAttribute("tabindex")]).toEqual([false, false]);
    expect(el("b").getAttribute("role")).toBe("button");
    el("a").click(); await tick();
    expect(viewer()).toBeNull();
    sized(el("a"), 300, 200);
    window.dispatchEvent(new Event("resize")); await tick();
    expect(el("a").getAttribute("role")).toBe("button");
    Element.prototype.getBoundingClientRect = orig;
  });
  test("a single ImageLightbox drawn under 24 px is a plain picture", async () => {
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = () => box(12, 12);
    wrapper = mount(ImageLightbox, { props: { src: "/t.jpg", alt: "Tiny" }, attachTo: document.body });
    await tick();
    expect(document.querySelector("img")!.hasAttribute("role")).toBe(false);
    Element.prototype.getBoundingClientRect = orig;
  });
});

describe("D2: the scope follows attribute changes", () => {
  test("alt removed: the picture stops being a button; alt added back: it is one again", async () => {
    await mountArticle();
    expect(el("a").getAttribute("role")).toBe("button");
    el("a").removeAttribute("alt"); await tick();
    expect([el("a").hasAttribute("role"), el("a").hasAttribute("tabindex"), el("a").hasAttribute("data-lightbox")]).toEqual([false, false, false]);
    el("a").setAttribute("alt", "A again"); await tick();
    expect([el("a").getAttribute("role"), el("a").getAttribute("tabindex")]).toEqual(["button", "0"]);
  });
  test("data-no-lightbox added then removed (on the picture, and on a parent)", async () => {
    await mountArticle();
    el("a").setAttribute("data-no-lightbox", ""); await tick();
    expect(el("a").hasAttribute("role")).toBe(false);
    el("a").removeAttribute("data-no-lightbox"); await tick();
    expect([el("a").getAttribute("role"), el("a").getAttribute("tabindex")]).toEqual(["button", "0"]);
    el("b").parentElement!.setAttribute("data-no-lightbox", ""); await tick();
    expect(el("b").hasAttribute("role")).toBe(false);
  });
  test("a click after alt was removed does nothing, and the scope does not trigger itself in a loop", async () => {
    await mountArticle();
    el("a").removeAttribute("alt"); await tick();
    el("a").click(); await tick();
    expect(viewer()).toBeNull();
    const spy = vi.spyOn(Element.prototype, "setAttribute");
    await tick();
    expect(spy.mock.calls.length).toBe(0);
  });
});

describe("D3: a slow or failing original", () => {
  const open = async () => { await mountArticle(); el("b").click(); await tick(); };
  const shown = () => viewer()!.querySelector<HTMLImageElement>("img.ilb-img")!;
  test("while the original loads there is a visible, announced loading cue and the figure is busy", async () => {
    await open();
    expect(shown().getAttribute("src")).toBe("/b-big.jpg");
    const cue = viewer()!.querySelector(".ilb-loading")!;
    expect([cue.textContent!.trim(), cue.getAttribute("role")]).toEqual(["Loading picture", "status"]);
    expect(viewer()!.querySelector("figure")!.getAttribute("aria-busy")).toBe("true");
    shown().dispatchEvent(new Event("load")); await tick();
    expect(viewer()!.querySelector(".ilb-loading")).toBeNull();
    expect(viewer()!.querySelector("figure")!.hasAttribute("aria-busy")).toBe(false);
  });
  test("when the original fails the page's own picture is shown, with the alt text", async () => {
    await open();
    shown().dispatchEvent(new Event("error")); await tick();
    expect(shown().getAttribute("src")).toMatch(/\/b\.jpg$/); // the page picture, as the browser resolves it
    expect(shown().getAttribute("alt")).toBe("B");
    shown().dispatchEvent(new Event("load")); await tick();
    expect(viewer()!.querySelector(".ilb-failed-note")).toBeNull();
  });
  test("when both fail a visible, announced message says so; Escape and the arrows still work", async () => {
    await open();
    shown().dispatchEvent(new Event("error")); await tick();
    shown().dispatchEvent(new Event("error")); await tick();
    const note = viewer()!.querySelector(".ilb-failed-note")!;
    expect([note.textContent!.trim(), note.getAttribute("role")]).toEqual(["The picture could not be loaded", "status"]);
    expect(shown().classList.contains("ilb-failed")).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true })); await tick();
    expect(viewer()!.querySelector(".ilb-count")!.textContent!.trim()).toBe("1 of 2");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); await tick();
    expect(viewer()).toBeNull();
  });
  test("the single wrapper falls back to src when fullSrc fails; the words are the host's", async () => {
    wrapper = mount(ImageLightbox, { props: { src: "/s.jpg", alt: "S", fullSrc: "/s-big.jpg", words: { loading: "Laster", loadFailed: "Feil" } }, attachTo: document.body });
    await tick();
    document.querySelector<HTMLElement>("img")!.click(); await tick();
    expect(viewer()!.querySelector(".ilb-loading")!.textContent!.trim()).toBe("Laster");
    shown().dispatchEvent(new Event("error")); await tick();
    expect(shown().getAttribute("src")).toBe("/s.jpg");
    shown().dispatchEvent(new Event("error")); await tick();
    expect(viewer()!.querySelector(".ilb-failed-note")!.textContent!.trim()).toBe("Feil");
  });
  test("axe: no violations while loading and when failed", async () => {
    await open();
    expect(await axeIds()).toEqual([]);
    shown().dispatchEvent(new Event("error")); await tick();
    shown().dispatchEvent(new Event("error")); await tick();
    expect(await axeIds()).toEqual([]);
  });
});
