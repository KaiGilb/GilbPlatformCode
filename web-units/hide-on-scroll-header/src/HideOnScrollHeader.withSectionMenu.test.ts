// Spec: the proposal (row 10): "sits beside web-units/section-menu ... a section-menu can sit in the slot".
// A separate file because it reads the neighbouring unit's source, which this unit's typecheck leaves out.
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

import SectionMenu from "../../section-menu/src/SectionMenu.vue";

const SLOTS = {
  logo: () => h("a", { href: "/" }, "Logo"),
  nav: () => h("nav", { "aria-label": "Sections" }, [h("a", { href: "#a" }, "A"), h("a", { href: "#b" }, "B")]),
  cta: () => h("a", { href: "#meeting", class: "mine" }, "Book"),
};
const header = () => document.querySelector("header")!;
const scrollTo = async (y: number) => { scrollY = y; window.dispatchEvent(new Event("scroll")); vi.advanceTimersByTime(20); await nextTick(); };
const input = () => window.dispatchEvent(new Event("wheel"));
const sentinel = async (visible: boolean) => { io!.cb([{ isIntersecting: visible }]); await nextTick(); };

describe("HideOnScrollHeader beside the section menu", () => {
  const MENU = { sections: [{ id: "home", label: "Home", to: "/" }, { id: "svc", label: "Services", to: "/services" }] };
  const withMenu = { logo: SLOTS.logo, nav: () => h(SectionMenu, { menu: MENU, currentPath: "/" }), cta: SLOTS.cta };
  test("a section menu sits in the nav slot, draws its landmark and keeps working while the bar hides and returns", async () => {
    wrapper = mount(HideOnScrollHeader, { slots: withMenu, attachTo: document.body });
    await nextTick();
    expect(header().querySelector("nav")).not.toBeNull();
    expect(header().querySelector("summary, button")).not.toBeNull();
    await sentinel(false); await scrollTo(300);
    expect(header().className).toContain("hsh-hidden");
    await scrollTo(250);
    expect(header().className).not.toContain("hsh-hidden");
    expect(header().querySelector("summary, button")).not.toBeNull();
  });
  test("axe: no violations with the section menu in the slot", async () => {
    wrapper = mount(HideOnScrollHeader, { slots: withMenu, attachTo: document.body });
    await nextTick();
    expect(await axeIds()).toEqual([]);
  });
  test("an open menu keeps the bar showing: the hidden rules do not apply while a button inside is aria-expanded", () => {
    const style = readFileSync(join(process.cwd(), "src", "HideOnScrollHeader.vue"), "utf8").split("<style scoped>")[1] ?? "";
    const hiddenRules = style.split("\n").filter((l) => l.startsWith(".hsh-hidden"));
    expect(hiddenRules.length).toBeGreaterThanOrEqual(5);
    for (const l of hiddenRules) expect(l).toContain(':not(:has([aria-expanded="true"]))');
  });
});

