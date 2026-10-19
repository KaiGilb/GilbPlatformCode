// Spec: Rule_Code_gwcunit (RuleGwcunitA11yTest, RuleGwcunitTokens) and the proposal row 8. Tests written new.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import StickyCardDeck from "./StickyCardDeck.vue";
import { activeStep, coverProgress } from "./progress";

let wrapper: VueWrapper | undefined;
let reduced = false;
let rafQueue: Array<() => void> = [];
let stackTop = 0;
const cardTops: number[] = [];
beforeEach(() => {
  reduced = false; rafQueue = []; stackTop = 0; cardTops.length = 0;
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduced && q.includes("reduce"), media: q }));
  window.requestAnimationFrame = ((cb: () => void) => { rafQueue.push(cb); return rafQueue.length; }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => { rafQueue = []; }) as typeof window.cancelAnimationFrame;
  Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true });
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const cards = [...document.querySelectorAll("[data-stack-card]")];
    const i = cards.indexOf(this);
    const t = i >= 0 ? (cardTops[i] ?? 0) : stackTop;
    return { top: t, bottom: t + 300, left: 0, right: 0, width: 0, height: 300, x: 0, y: t, toJSON() {} };
  };
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; vi.unstubAllGlobals(); });
const flush = () => { const q = rafQueue; rafQueue = []; q.forEach((f) => f()); };
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);
const STEPS = [{ title: "Meet", body: "We talk.", tag: "Meeting 1" }, { title: "Build", body: "We build." }, { title: "Launch", body: "You own it." }];
const card = (i: number) => document.querySelectorAll("[data-stack-card]")[i] as HTMLElement;
const veil = (i: number) => document.querySelectorAll("[data-stack-dim]")[i] as HTMLElement;
const tick = (i: number) => document.querySelectorAll("[data-stack-tick]")[i] as HTMLElement;

describe("coverProgress and activeStep", () => {
  test("0 while the next card is far below, 1 once it is at the pin, in between linear", () => {
    expect(coverProgress(2000, 1000)).toBe(0);
    expect(coverProgress(840, 1000)).toBe(0);
    expect(coverProgress(490, 1000)).toBeCloseTo(0.5, 5);
    expect(coverProgress(140, 1000)).toBe(1);
    expect(coverProgress(-300, 1000)).toBe(1);
  });
  test("the active step is the last card whose top crossed 55 % of the viewport", () => {
    expect(activeStep([700, 900, 1500], 1000)).toBe(0);
    expect(activeStep([100, 500, 1500], 1000)).toBe(1);
    expect(activeStep([-300, 100, 500], 1000)).toBe(2);
  });
});

describe("StickyCardDeck", () => {
  test("one article per step: tag (when given), a hidden number, an h3 title and the paragraph", () => {
    wrapper = mount(StickyCardDeck, { props: { steps: STEPS }, attachTo: document.body });
    expect(document.querySelectorAll("article")).toHaveLength(3);
    expect(card(0).querySelector(".sd-pill")!.textContent).toBe("Meeting 1");
    expect(card(1).querySelector(".sd-pill")).toBeNull();
    expect(card(2).querySelector("h3")!.textContent).toBe("Launch");
    expect(card(2).querySelector(".sd-num")!.textContent!.trim()).toBe("03");
    expect(card(2).querySelector(".sd-num")!.getAttribute("aria-hidden")).toBe("true");
    expect(card(2).querySelector(".sd-body")!.textContent).toBe("You own it.");
  });
  test("each card pins a little lower than the one before: --sd-i is its index", () => {
    wrapper = mount(StickyCardDeck, { props: { steps: STEPS }, attachTo: document.body });
    expect([0, 1, 2].map((i) => card(i).style.getPropertyValue("--sd-i"))).toEqual(["0", "1", "2"]);
  });
  test("the card slot replaces the default content and gets the step, index and number", () => {
    wrapper = mount(StickyCardDeck, { props: { steps: STEPS }, slots: { card: `<template #card="{ step, index, number }"><div class="mine">{{ number }}-{{ index }}-{{ step.title }}</div></template>` }, attachTo: document.body });
    expect([...document.querySelectorAll(".mine")].map((e) => e.textContent)).toEqual(["01-0-Meet", "02-1-Build", "03-2-Launch"]);
    expect(document.querySelector(".sd-title")).toBeNull();
    expect(document.querySelectorAll("[data-stack-dim]")).toHaveLength(3);
  });
  test("the rail has one number per step and is hidden from screen readers", () => {
    wrapper = mount(StickyCardDeck, { props: { steps: STEPS }, attachTo: document.body });
    expect(document.querySelector(".sd-rail")!.getAttribute("aria-hidden")).toBe("true");
    expect([...document.querySelectorAll("[data-stack-tick]")].map((e) => e.textContent)).toEqual(["01", "02", "03"]);
  });
  test("content attributes go on the default card's tag row, title row and paragraph", () => {
    wrapper = mount(StickyCardDeck, { props: { steps: STEPS, contentAttrs: { "data-reveal": "" } }, attachTo: document.body });
    expect(document.querySelectorAll("[data-reveal]")).toHaveLength(2 + 3 + 3 - 1 + 0);
  });
  test("as the next card travels up, the one under it scales back and its veil darkens; the last card is never touched", () => {
    stackTop = 100; cardTops.push(140, 490, 1500);
    wrapper = mount(StickyCardDeck, { props: { steps: STEPS }, attachTo: document.body });
    flush();
    // card 1 is half way up over card 0; card 2 is far below card 1.
    expect(card(0).style.transform).toBe("scale(0.9775)");
    expect(Number(veil(0).style.opacity)).toBeCloseTo(0.25, 3);
    expect(card(1).style.transform).toBe("scale(1.0000)");
    expect(Number(veil(1).style.opacity)).toBe(0);
    expect(card(2).style.transform).toBe("");
    expect(veil(2).style.opacity).toBe("");
  });
  test("a card fully covered is at the full scale-back and veil", () => {
    stackTop = 100; cardTops.push(-200, 140, 1500);
    wrapper = mount(StickyCardDeck, { props: { steps: STEPS }, attachTo: document.body });
    flush();
    expect(card(0).style.transform).toBe("scale(0.9550)");
    expect(Number(veil(0).style.opacity)).toBeCloseTo(0.5, 3);
  });
  test("scaleBack and veil are props", () => {
    stackTop = 100; cardTops.push(140, 140, 1500);
    wrapper = mount(StickyCardDeck, { props: { steps: STEPS, scaleBack: 0.1, veil: 0.8 }, attachTo: document.body });
    flush();
    expect(card(0).style.transform).toBe("scale(0.9000)");
    expect(Number(veil(0).style.opacity)).toBeCloseTo(0.8, 3);
  });
  test("the rail marks the active step", () => {
    stackTop = 100; cardTops.push(-300, 100, 500);
    wrapper = mount(StickyCardDeck, { props: { steps: STEPS }, attachTo: document.body });
    flush();
    expect([0, 1, 2].map((i) => tick(i).classList.contains("is-active"))).toEqual([false, false, true]);
  });
  test("a deck far off screen is left alone", () => {
    stackTop = 5000; cardTops.push(5000, 5400, 5800);
    wrapper = mount(StickyCardDeck, { props: { steps: STEPS }, attachTo: document.body });
    flush();
    expect(card(0).style.transform).toBe("");
  });
  test("one card has nothing to cover: no frames are subscribed", () => {
    wrapper = mount(StickyCardDeck, { props: { steps: [STEPS[0]!] }, attachTo: document.body });
    expect(rafQueue).toHaveLength(0);
  });
  test("reduced motion writes nothing", () => {
    reduced = true; stackTop = 100; cardTops.push(140, 140, 1500);
    wrapper = mount(StickyCardDeck, { props: { steps: STEPS }, attachTo: document.body });
    window.dispatchEvent(new Event("scroll")); flush();
    expect(card(0).style.transform).toBe("");
  });
  test("unmounting stops the frames", () => {
    wrapper = mount(StickyCardDeck, { props: { steps: STEPS }, attachTo: document.body });
    wrapper.unmount(); wrapper = undefined;
    window.dispatchEvent(new Event("scroll"));
    expect(rafQueue).toHaveLength(0);
  });
  test("the server's HTML holds every card and no transform, opacity or handler", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(StickyCardDeck, { steps: STEPS }) }));
    for (const s of STEPS) { expect(html).toContain(s.title); expect(html).toContain(s.body); }
    expect(html).not.toMatch(/transform:|opacity:|\son[a-z]+=/);
  });
  test("the server's HTML hydrates with no mismatch warning", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(StickyCardDeck, { steps: STEPS }) }));
    const el = document.createElement("div"); el.innerHTML = html; document.body.appendChild(el);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {}); const err = vi.spyOn(console, "error").mockImplementation(() => {});
    createSSRApp({ render: () => h(StickyCardDeck, { steps: STEPS }) }).mount(el);
    expect([...warn.mock.calls, ...err.mock.calls].map((c) => c.map(String).join(" ")).filter((s) => /hydrat|mismatch/i.test(s))).toEqual([]);
  });
  test("axe: no violations, default cards and slot cards", async () => {
    wrapper = mount(StickyCardDeck, { props: { steps: STEPS }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
    wrapper.unmount();
    wrapper = mount(StickyCardDeck, { props: { steps: STEPS }, slots: { card: `<template #card="{ step }"><h3>{{ step.title }}</h3></template>` }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
  });
});

describe("the unit's style", () => {
  const SFC = readFileSync(join(process.cwd(), "src", "StickyCardDeck.vue"), "utf8");
  const style = (SFC.split("<style scoped>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  test("every colour literal sits inside a var(--site-block-*, ...) fallback", () => {
    const bad = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|gray|grey)\b(?!-)/g)]
      .filter((m) => !/var\(--site-block-[a-z-]+,\s*$/.test(style.slice(Math.max(0, m.index! - 80), m.index)));
    expect(bad).toEqual([]);
  });
  test("every box sizes with border-box", () => { expect(style).toContain(".sd, .sd * { box-sizing: border-box; }"); });
  test("the cards pin with position: sticky and reduced motion makes them a static list", () => {
    expect(style).toMatch(/\.sd-card \{\s*position: sticky;/);
    const rm = style.split("@media (prefers-reduced-motion: reduce)")[1] ?? "";
    expect(rm).toContain("position: static");
    expect(rm).toContain(".sd-veil, .sd-rail { display: none; }");
  });
});
