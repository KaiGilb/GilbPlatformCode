// Spec: Rule_Code_gwcunit (RuleGwcunitA11yTest, RuleGwcunitTokens) and the proposal row 6. Tests written new.
// jsdom has no layout or scroll frames: the tests mock matchMedia, rAF and each line's top, and drive the frames.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import ScrubText from "./ScrubText.vue";
import { lineOpacity } from "./opacity";

let wrapper: VueWrapper | undefined;
let reduced = false;
let rafQueue: Array<() => void> = [];
const tops = new Map<string, number>();
beforeEach(() => {
  reduced = false; rafQueue = []; tops.clear();
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduced && q.includes("reduce"), media: q }));
  window.requestAnimationFrame = ((cb: () => void) => { rafQueue.push(cb); return rafQueue.length; }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => { rafQueue = []; }) as typeof window.cancelAnimationFrame;
  Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true });
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const el = this as HTMLElement;
    const t = el.dataset.scrubLine !== undefined ? (tops.get(el.textContent ?? "") ?? 0) : (tops.get("wrap") ?? 0);
    return { top: t, bottom: t + 100, left: 0, right: 0, width: 0, height: 100, x: 0, y: t, toJSON() {} };
  };
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; vi.unstubAllGlobals(); });
const flush = () => { const q = rafQueue; rafQueue = []; q.forEach((f) => f()); };
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);
const LINES = ["First line.", "Second line.", "Third line."];
const op = (i: number) => (document.querySelectorAll("[data-scrub-line]")[i] as HTMLElement).style.opacity;

describe("lineOpacity", () => {
  test("dim below the zone, lit above it, half way at the middle of the zone, eased", () => {
    expect(lineOpacity(900, 1000, 0.38, 1, 0.85, 0.55)).toBe(0.38);
    expect(lineOpacity(850, 1000, 0.38, 1, 0.85, 0.55)).toBe(0.38);
    expect(lineOpacity(550, 1000, 0.38, 1, 0.85, 0.55)).toBe(1);
    expect(lineOpacity(100, 1000, 0.38, 1, 0.85, 0.55)).toBe(1);
    expect(lineOpacity(700, 1000, 0.38, 1, 0.85, 0.55)).toBe(0.69);
    expect(lineOpacity(775, 1000, 0.38, 1, 0.85, 0.55)).toBeLessThan(0.69);
  });
  test("it never leaves the range dim..lit and rises as the line rises", () => {
    let prev = 0;
    for (let top = 1200; top >= -100; top -= 10) {
      const o = lineOpacity(top, 1000, 0.38, 1, 0.85, 0.55);
      expect(o).toBeGreaterThanOrEqual(0.38); expect(o).toBeLessThanOrEqual(1); expect(o).toBeGreaterThanOrEqual(prev);
      prev = o;
    }
  });
});

describe("ScrubText", () => {
  test("a block below the fold is armed at the dim value; frames then set each line from its top, one after another", () => {
    tops.set("wrap", 1500); tops.set(LINES[0]!, 1500); tops.set(LINES[1]!, 1560); tops.set(LINES[2]!, 1620);
    wrapper = mount(ScrubText, { props: { lines: LINES }, attachTo: document.body });
    expect([0, 1, 2].map(op)).toEqual(["0.38", "0.38", "0.38"]);
    tops.set("wrap", 700); tops.set(LINES[0]!, 500); tops.set(LINES[1]!, 700); tops.set(LINES[2]!, 900);
    window.dispatchEvent(new Event("scroll")); flush();
    expect(op(0)).toBe("1");
    expect(Number(op(1))).toBeGreaterThan(0.38); expect(Number(op(1))).toBeLessThan(1);
    expect(op(2)).toBe("0.38");
  });
  test("scrolling back up un-fills a line that drops below the zone", () => {
    tops.set("wrap", 1500); tops.set(LINES[0]!, 1500);
    wrapper = mount(ScrubText, { props: { lines: LINES }, attachTo: document.body });
    tops.set("wrap", 400); tops.set(LINES[0]!, 500); window.dispatchEvent(new Event("scroll"));
    flush(); expect(op(0)).toBe("1");
    tops.set(LINES[0]!, 950); window.dispatchEvent(new Event("scroll")); flush();
    expect(op(0)).toBe("0.38");
  });
  test("a block already on screen at mount is not dimmed first (a mid-page reload keeps its text readable)", () => {
    tops.set("wrap", 300); LINES.forEach((l) => tops.set(l, 300));
    wrapper = mount(ScrubText, { props: { lines: LINES }, attachTo: document.body });
    expect([0, 1, 2].map(op)).toEqual(["", "", ""]);
  });
  test("a block far off screen is left alone by the frame", () => {
    tops.set("wrap", 5000); LINES.forEach((l) => tops.set(l, 5000));
    wrapper = mount(ScrubText, { props: { lines: LINES }, attachTo: document.body });
    flush();
    expect(op(0)).toBe("0.38");
  });
  test("an unchanged value is not written again", () => {
    tops.set("wrap", 700); tops.set(LINES[0]!, 100);
    wrapper = mount(ScrubText, { props: { lines: ["First line."] }, attachTo: document.body });
    flush();
    const el = document.querySelector("[data-scrub-line]") as HTMLElement;
    const set = vi.spyOn(el.style, "opacity", "set");
    window.dispatchEvent(new Event("scroll")); flush();
    expect(set).not.toHaveBeenCalled();
  });
  test("dim, lit and the zone are props", () => {
    tops.set("wrap", 1500); LINES.forEach((l) => tops.set(l, 1500));
    wrapper = mount(ScrubText, { props: { lines: LINES, dim: 0.5, lit: 0.9 }, attachTo: document.body });
    expect(op(0)).toBe("0.5");
    tops.set("wrap", 100); LINES.forEach((l) => tops.set(l, 100));
    window.dispatchEvent(new Event("scroll")); flush();
    expect(op(0)).toBe("0.9");
  });
  test("under reduced motion nothing is written, whatever the scroll", () => {
    reduced = true;
    tops.set("wrap", 1500); LINES.forEach((l) => tops.set(l, 1500));
    wrapper = mount(ScrubText, { props: { lines: LINES }, attachTo: document.body });
    window.dispatchEvent(new Event("scroll")); flush();
    expect([0, 1, 2].map(op)).toEqual(["", "", ""]);
  });
  test("unmounting stops the frames", () => {
    tops.set("wrap", 1500); LINES.forEach((l) => tops.set(l, 1500));
    wrapper = mount(ScrubText, { props: { lines: LINES }, attachTo: document.body });
    wrapper.unmount(); wrapper = undefined;
    window.dispatchEvent(new Event("scroll"));
    expect(rafQueue).toHaveLength(0);
  });
  test("the server's HTML has every line, no opacity and no handler (readable with JavaScript off)", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(ScrubText, { lines: LINES }) }));
    for (const l of LINES) expect(html).toContain(l);
    expect(html).not.toMatch(/opacity|\son[a-z]+=/);
  });
  test("the server's HTML hydrates with no mismatch warning", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(ScrubText, { lines: LINES }) }));
    const el = document.createElement("div"); el.innerHTML = html; document.body.appendChild(el);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {}); const err = vi.spyOn(console, "error").mockImplementation(() => {});
    createSSRApp({ render: () => h(ScrubText, { lines: LINES }) }).mount(el);
    expect([...warn.mock.calls, ...err.mock.calls].map((c) => c.map(String).join(" ")).filter((s) => /hydrat|mismatch/i.test(s))).toEqual([]);
  });
  test("axe: no violations, dimmed or lit", async () => {
    tops.set("wrap", 1500);
    wrapper = mount(ScrubText, { props: { lines: LINES }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
  });
});

describe("the unit's style", () => {
  const SFC = readFileSync(join(process.cwd(), "src", "ScrubText.vue"), "utf8");
  const style = (SFC.split("<style scoped>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  test("every colour literal sits inside a var(--site-block-*, ...) fallback", () => {
    const bad = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|gray|grey)\b(?!-)/g)]
      .filter((m) => !/var\(--site-block-[a-z-]+,\s*$/.test(style.slice(Math.max(0, m.index! - 80), m.index)));
    expect(bad).toEqual([]);
  });
  test("there is no CSS transition on opacity, and every box sizes with border-box", () => {
    expect(style).not.toMatch(/transition/);
    expect(style).toContain(".st, .st * { box-sizing: border-box; }");
  });
  test("the default dim is the AA-safe 0.38: #EDEFF5 at 0.38 on #000 is at least 3:1", () => {
    const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const L = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const c = (v: number) => Math.round(v * 0.38);
    expect((L(c(0xed), c(0xef), c(0xf5)) + 0.05) / 0.05).toBeGreaterThanOrEqual(3);
    expect(/dim\?: number;[\s\S]*dim: 0\.38/.test(SFC)).toBe(true);
  });
});
