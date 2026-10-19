// Spec: Rule_Code_gwcunit (RuleGwcunitA11yTest, RuleGwcunitTokens) and the proposal row 9. Tests written new.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import SectionHeading from "./SectionHeading.vue";
import { brightness } from "./brightness";

let wrapper: VueWrapper | undefined;
let reduced = false;
let rafQueue: Array<() => void> = [];
let top = 2000;
beforeEach(() => {
  reduced = false; rafQueue = []; top = 2000;
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduced && q.includes("reduce"), media: q }));
  window.requestAnimationFrame = ((cb: () => void) => { rafQueue.push(cb); return rafQueue.length; }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => { rafQueue = []; }) as typeof window.cancelAnimationFrame;
  Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true });
  Element.prototype.getBoundingClientRect = function () { return { top, bottom: top + 60, left: 0, right: 0, width: 0, height: 60, x: 0, y: top, toJSON() {} }; };
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; vi.unstubAllGlobals(); });
const flush = () => { const q = rafQueue; rafQueue = []; q.forEach((f) => f()); };
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);
const P = { pill: "Why us", line1: "Why choose us.", line2: "Built around you.", body: "A paragraph." };
const bright = () => (document.querySelector(".sh-bright") as HTMLElement).style.opacity;

describe("brightness", () => {
  test("0 below the start, 1 past the window, linear between", () => {
    expect(brightness(900, 1000)).toBe(0);
    expect(brightness(780, 1000)).toBe(0);
    expect(brightness(715, 1000)).toBeCloseTo(0.5, 5);
    expect(brightness(650, 1000)).toBe(1);
    expect(brightness(-50, 1000)).toBe(1);
  });
});

describe("SectionHeading", () => {
  test("pill, a heading with two lines, and a paragraph", () => {
    wrapper = mount(SectionHeading, { props: P, attachTo: document.body });
    expect(document.querySelector(".sh-pill")!.textContent).toBe("Why us");
    const h2 = document.querySelector("h2")!;
    expect(h2.querySelector(".sh-dim")!.textContent).toBe("Built around you.");
    expect(h2.textContent!.startsWith("Why choose us.")).toBe(true);
    expect(document.querySelector("p.sh-body")!.textContent).toBe("A paragraph.");
  });
  test("the bright copy of line 2 is hidden from screen readers, so the line is read once", () => {
    wrapper = mount(SectionHeading, { props: P, attachTo: document.body });
    expect(document.querySelector(".sh-bright")!.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector(".sh-dim")!.getAttribute("aria-hidden")).toBeNull();
  });
  test("the pill, line 2 and the paragraph are each left out when not given", () => {
    wrapper = mount(SectionHeading, { props: { line1: "Only this" }, attachTo: document.body });
    expect(document.querySelector(".sh-pill")).toBeNull();
    expect(document.querySelector(".sh-second")).toBeNull();
    expect(document.querySelector(".sh-body")).toBeNull();
    expect(document.querySelector("h2")!.textContent).toBe("Only this");
  });
  test("the heading level is the host's to set", () => {
    wrapper = mount(SectionHeading, { props: { ...P, level: 3 }, attachTo: document.body });
    expect(document.querySelector("h3")).not.toBeNull();
    expect(document.querySelector("h2")).toBeNull();
  });
  test("block attributes go on the pill, the headline and the paragraph", () => {
    wrapper = mount(SectionHeading, { props: { ...P, blockAttrs: { "data-reveal": "" } }, attachTo: document.body });
    expect(document.querySelectorAll("[data-reveal]")).toHaveLength(3);
  });
  test("the second line brightens with the scroll: 0 below the zone, between inside it, 1 once past", () => {
    top = 900;
    wrapper = mount(SectionHeading, { props: P, attachTo: document.body });
    flush(); expect(Number(bright())).toBe(0.0);
    top = 715; window.dispatchEvent(new Event("scroll")); flush(); expect(Number(bright())).toBe(0.5);
    top = 300; window.dispatchEvent(new Event("scroll")); flush(); expect(Number(bright())).toBe(1.0);
    top = 790; window.dispatchEvent(new Event("scroll")); flush(); expect(Number(bright())).toBe(0.0);
  });
  test("far off screen the frame writes nothing", () => {
    wrapper = mount(SectionHeading, { props: P, attachTo: document.body });
    top = 5000; window.dispatchEvent(new Event("scroll")); flush();
    expect(bright()).toBe("");
  });
  test("reduced motion writes nothing", () => {
    reduced = true;
    wrapper = mount(SectionHeading, { props: P, attachTo: document.body });
    top = 300; window.dispatchEvent(new Event("scroll")); flush();
    expect(bright()).toBe("");
  });
  test("unmounting stops the frames", () => {
    wrapper = mount(SectionHeading, { props: P, attachTo: document.body });
    wrapper.unmount(); wrapper = undefined;
    window.dispatchEvent(new Event("scroll"));
    expect(rafQueue).toHaveLength(0);
  });
  test("the server's HTML holds every text, a visible dim line and no handler", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(SectionHeading, P) }));
    for (const t of Object.values(P)) expect(html).toContain(t);
    expect(html).not.toMatch(/\son[a-z]+=|style="opacity/);
  });
  test("the server's HTML hydrates with no mismatch warning", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(SectionHeading, P) }));
    const el = document.createElement("div"); el.innerHTML = html; document.body.appendChild(el);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {}); const err = vi.spyOn(console, "error").mockImplementation(() => {});
    createSSRApp({ render: () => h(SectionHeading, P) }).mount(el);
    expect([...warn.mock.calls, ...err.mock.calls].map((c) => c.map(String).join(" ")).filter((s) => /hydrat|mismatch/i.test(s))).toEqual([]);
  });
  test("axe: no violations with every part, and with the headline alone", async () => {
    wrapper = mount(SectionHeading, { props: P, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
    wrapper.unmount();
    wrapper = mount(SectionHeading, { props: { line1: "Only this" }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
  });
});

describe("the unit's style", () => {
  const SFC = readFileSync(join(process.cwd(), "src", "SectionHeading.vue"), "utf8");
  const style = (SFC.split("<style scoped>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  test("every colour literal sits inside a var(--site-block-*, ...) fallback", () => {
    const bad = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|gray|grey)\b(?!-)/g)]
      .filter((m) => !/var\(--site-block-[a-z-]+,\s*$/.test(style.slice(Math.max(0, m.index! - 80), m.index)));
    expect(bad).toEqual([]);
  });
  test("no transition, and every box sizes with border-box", () => {
    expect(style).not.toMatch(/transition/);
    expect(style).toContain(".sh, .sh * { box-sizing: border-box; }");
  });
});
