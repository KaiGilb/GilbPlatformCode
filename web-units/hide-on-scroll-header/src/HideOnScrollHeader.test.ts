// Spec: Rule_Code_gwcunit (RuleGwcunitA11yTest, RuleGwcunitTokens, RuleGwcunitStackFit), Rule_Code_accessibility
// (WCAG 2.4.1 skip link) and the proposal (row 10). Tests written new. jsdom has no layout, so the slide itself
// (CSS) is read from the style; the state that drives it is driven here with real events and fake timers.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, h, nextTick } from "vue";
import { renderToString } from "vue/server-renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import HideOnScrollHeader from "./HideOnScrollHeader.vue";

let wrapper: VueWrapper | undefined;
let io: { cb: (e: { isIntersecting: boolean }[]) => void; observed: Element[]; disconnected: boolean } | undefined;
let scrollY = 0;
// axe waits on real timers, so the fake clock is put aside for the run.
const axeIds = async () => {
  vi.useRealTimers();
  try { return (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id); }
  finally { vi.useFakeTimers(); }
};

beforeEach(() => {
  vi.useFakeTimers();
  scrollY = 0;
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
  io = undefined;
  vi.stubGlobal("IntersectionObserver", class {
    cb: (e: { isIntersecting: boolean }[]) => void; observed: Element[] = []; disconnected = false;
    constructor(cb: (e: { isIntersecting: boolean }[]) => void) { this.cb = cb; io = this as unknown as typeof io; }
    observe(el: Element) { this.observed.push(el); }
    disconnect() { this.disconnected = true; }
  });
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => setTimeout(cb, 16) as unknown as number);
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; vi.useRealTimers(); vi.unstubAllGlobals(); });

const SLOTS = {
  logo: () => h("a", { href: "/" }, "Logo"),
  nav: () => h("nav", { "aria-label": "Sections" }, [h("a", { href: "#a" }, "A"), h("a", { href: "#b" }, "B")]),
  cta: () => h("a", { href: "#meeting", class: "mine" }, "Book"),
};
const header = () => document.querySelector("header")!;
const scrollTo = async (y: number) => { scrollY = y; window.dispatchEvent(new Event("scroll")); vi.advanceTimersByTime(20); await nextTick(); };
const input = () => window.dispatchEvent(new Event("wheel"));
const sentinel = async (visible: boolean) => { io!.cb([{ isIntersecting: visible }]); await nextTick(); };

describe("HideOnScrollHeader, markup", () => {
  test("the three slots land in the bar; a default call-to-action is drawn from ctaLabel only when no slot is given", () => {
    wrapper = mount(HideOnScrollHeader, { slots: SLOTS, attachTo: document.body });
    expect(header().textContent).toContain("Logo");
    expect(header().querySelector("nav")!.getAttribute("aria-label")).toBe("Sections");
    expect(header().querySelector(".mine")).not.toBeNull();
    wrapper.unmount();
    wrapper = mount(HideOnScrollHeader, { props: { ctaLabel: "Book a meeting", ctaHref: "#go" }, attachTo: document.body });
    expect(header().querySelector(".hsh-cta-link")!.getAttribute("href")).toBe("#go");
    wrapper.unmount();
    wrapper = mount(HideOnScrollHeader, { attachTo: document.body });
    expect(header().querySelector(".hsh-cta-link")).toBeNull();
  });
  test("the skip link comes first, points at the main content and says so in words the host can change", () => {
    wrapper = mount(HideOnScrollHeader, { slots: SLOTS, attachTo: document.body });
    const a = document.querySelector("a")!;
    expect(a.getAttribute("href")).toBe("#main");
    expect(a.textContent).toBe("Skip to content");
    wrapper.unmount();
    wrapper = mount(HideOnScrollHeader, { props: { skipTarget: "#innhold", skipLabel: "Hopp til innhold" }, attachTo: document.body });
    expect(document.querySelector("a")!.getAttribute("href")).toBe("#innhold");
    expect(document.querySelector("a")!.textContent).toBe("Hopp til innhold");
  });
  test("the sentinel is hidden from screen readers; the first draw is the clear, shown bar", () => {
    wrapper = mount(HideOnScrollHeader, { slots: SLOTS, attachTo: document.body });
    expect(document.querySelector(".hsh-sentinel")!.getAttribute("aria-hidden")).toBe("true");
    expect(header().className).toContain("hsh-clear");
    expect(header().className).not.toContain("hsh-hidden");
    expect(header().className).not.toContain("hsh-past-top");
  });
  test("the server's HTML is the clear bar with every slot, and no script handler", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(HideOnScrollHeader, null, SLOTS) }));
    expect(html).toContain("hsh-clear");
    for (const t of ["Logo", "Sections", "Book", "Skip to content"]) expect(html).toContain(t);
    expect(html).not.toMatch(/\son[a-z]+=/);
  });
  test("the server's HTML hydrates with no mismatch warning", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(HideOnScrollHeader, null, SLOTS) }));
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.appendChild(el);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    createSSRApp({ render: () => h(HideOnScrollHeader, null, SLOTS) }).mount(el);
    expect(warn.mock.calls.map((c) => c.map(String).join(" ")).filter((s) => /hydrat|mismatch/i.test(s))).toEqual([]);
    warn.mockRestore();
  });
  // Spec: RuleGwcunitA11yTest / RuleA11yUnitTest
  test("axe: no violations, clear, hidden and solid", async () => {
    wrapper = mount(HideOnScrollHeader, { slots: SLOTS, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
    await sentinel(false); await scrollTo(300);
    expect(header().className).toContain("hsh-hidden");
    expect(await axeIds()).toEqual([]);
    await scrollTo(250);
    expect(header().className).toContain("hsh-solid");
    expect(await axeIds()).toEqual([]);
  });
});

describe("HideOnScrollHeader, behaviour with the real window", () => {
  test("the sentinel is watched; leaving it marks the bar past the top, still clear", async () => {
    wrapper = mount(HideOnScrollHeader, { slots: SLOTS, attachTo: document.body });
    expect(io!.observed[0]).toBe(document.querySelector(".hsh-sentinel"));
    await sentinel(false);
    expect(header().className).toContain("hsh-past-top");
    expect(header().className).toContain("hsh-clear");
  });
  test("scroll down hides at once from clear; scroll up shows it solid", async () => {
    wrapper = mount(HideOnScrollHeader, { slots: SLOTS, attachTo: document.body });
    await sentinel(false);
    await scrollTo(60);
    expect(header().className).toContain("hsh-clear");
    await scrollTo(200);
    expect(header().className).toContain("hsh-hidden");
    expect(header().className).not.toContain("hsh-solid");
    await scrollTo(150);
    expect(header().className).not.toContain("hsh-hidden");
    expect(header().className).toContain("hsh-solid");
  });
  test("a solid bar ignores a downward nudge with no input, and hides after a wheel", async () => {
    wrapper = mount(HideOnScrollHeader, { slots: SLOTS, attachTo: document.body });
    await sentinel(false);
    await scrollTo(200); await scrollTo(150);
    expect(header().className).toContain("hsh-solid");
    vi.advanceTimersByTime(2000);
    await scrollTo(190);
    expect(header().className).not.toContain("hsh-hidden");
    input();
    await scrollTo(260);
    expect(header().className).toContain("hsh-hidden");
  });
  test("a page opened past the hero turns solid once it has been still for 150 ms", async () => {
    scrollY = 600;
    wrapper = mount(HideOnScrollHeader, { slots: SLOTS, attachTo: document.body });
    await sentinel(false);
    expect(header().className).toContain("hsh-clear");
    vi.advanceTimersByTime(160); await nextTick();
    expect(header().className).toContain("hsh-solid");
  });
  test("the thresholds can be set by the host", async () => {
    wrapper = mount(HideOnScrollHeader, { props: { thresholds: { hideAfterPx: 10 } }, slots: SLOTS, attachTo: document.body });
    await sentinel(false);
    await scrollTo(40);
    expect(header().className).toContain("hsh-hidden");
  });
  test("unmounting removes every listener and stops the observer", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    wrapper = mount(HideOnScrollHeader, { slots: SLOTS, attachTo: document.body });
    const added = add.mock.calls.map((c) => c[0]).sort();
    expect(added).toEqual(["keydown", "pointerdown", "scroll", "touchmove", "touchstart", "wheel"]);
    wrapper.unmount(); wrapper = undefined;
    expect(remove.mock.calls.map((c) => c[0]).sort()).toEqual(added);
    expect(io!.disconnected).toBe(true);
    vi.advanceTimersByTime(1000); // nothing left to fire
  });
  test("with no IntersectionObserver the bar still hides and shows, and stays clear (never solid)", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    delete (window as unknown as Record<string, unknown>).IntersectionObserver;
    wrapper = mount(HideOnScrollHeader, { slots: SLOTS, attachTo: document.body });
    await scrollTo(200);
    expect(header().className).toContain("hsh-hidden");
    await scrollTo(100);
    expect(header().className).not.toContain("hsh-hidden");
    expect(header().className).not.toContain("hsh-solid");
  });
});

describe("the unit's style", () => {
  const SFC = readFileSync(join(process.cwd(), "src", "HideOnScrollHeader.vue"), "utf8");
  const style = (SFC.split("<style scoped>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  // Spec: RuleGwcunitTokens
  test("every colour literal sits inside a var(--site-block-*, ...) fallback", () => {
    const bad = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|gray|grey)\b(?!-)/g)]
      .filter((m) => !/var\(--site-block-[a-z-]+,\s*$/.test(style.slice(Math.max(0, m.index! - 80), m.index)))
      .map((m) => style.slice(Math.max(0, m.index! - 40), m.index! + 10).replace(/\s+/g, " "));
    expect(bad).toEqual([]);
  });
  test("every box sizes with border-box", () => { expect(style).toContain(".hsh-root, .hsh-root * { box-sizing: border-box; }"); });
  test("the hidden bar leaves the tab order after the fade, and its empty strip lets clicks through, but the button stays clickable", () => {
    expect(style).toContain("visibility: hidden;");
    expect(style).toContain("visibility 0s linear 200ms");
    expect(style).toMatch(/\.hsh-hidden[^{]*\{\s*pointer-events: none;/);
    expect(style).toMatch(/\.hsh-cta \{ pointer-events: auto; \}/);
  });
  test("keyboard focus inside the bar shows the full bar and gives it a backing", () => {
    expect(style).toContain(".hsh-hidden:not(:has(:focus-visible))");
    expect(style).toContain(".hsh-past-top:has(:focus-visible)::before");
  });
  test("reduced motion turns every transition off", () => {
    expect(style).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*transition: none/);
  });
  test("the unit names no Tailwind class, no router and no site, and imports only vue and its own files", () => {
    expect(SFC).not.toMatch(/class="[^"]*\b(?:text|bg|border|rounded|px|py|mt|mb|flex|grid)-/);
    expect(SFC).not.toMatch(/useRoute|NuxtLink|useAppConfig|__lenis|queryCollection/);
    const imports = [...SFC.matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]);
    expect(imports.every((i) => i === "vue" || i!.startsWith("./"))).toBe(true);
  });
});
