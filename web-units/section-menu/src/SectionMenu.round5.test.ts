// Adopted from Agent.Tester round 5 (report AgentTester-WebUnit-71c948e-EngineA-052d2aa.md, 2026-10-18), plus
// the run-time guard for a section marked coming (Kai-Zen's decision, 2026-10-18).
// Agent.Tester round 5 gap tests (web-units/section-menu @ 71c948e), written in the QA scratch copy.
// Spec: handoff 00.Handoff-2026-10-18-ToAgentCoder-SectionMenuAsDefaultSharedUnitAppAndWeb-GilbPlatformCode §3
// ("bring it to the same behaviour as the app menu": arrows), Kai-Zen 2026-10-18 (only pages and places may be
// coming, drawn greyed, not links). The app unit draws a coming option as a focusable
// <button aria-disabled>, so Up/Down pass over it; the web unit draws a <span>, which cannot take focus.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import SectionMenu from "./SectionMenu.vue";
import type { WebMenu } from "./menu";

const MENU: WebMenu = {
  sections: [
    { id: "home", label: "Home", to: "/" },
    { id: "services", label: "Services", to: "/services", also: ["shop", "planned", "docs"], links: [
      { id: "services.web", label: "Websites", to: "/services/websites" },
      { id: "services.soon", label: "Training", to: "/services/training", coming: true },
      { id: "services.apps", label: "Apps", to: "/services/apps" },
    ] },
  ],
  places: [
    { id: "shop", label: "Shop", href: "https://example.net/shop" },
    { id: "planned", label: "Planned", href: "https://example.net/planned", coming: true },
    { id: "docs", label: "Docs", href: "https://example.net/docs" },
  ],
};

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
let wrapper: VueWrapper | undefined;
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
});
const flush = async () => { await nextTick(); await nextTick(); await nextTick(); };
const opt = (id: string) => document.querySelector<HTMLElement>(`[data-option="${id}"]`)!;
const key = (el: HTMLElement, k: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
const activeOption = () => (document.activeElement as HTMLElement | null)?.getAttribute("data-option");

async function openAtServices() {
  wrapper = mount(SectionMenu, { props: { menu: MENU, currentPath: "/services" }, attachTo: document.body });
  await flush();
  document.querySelector<HTMLElement>("[data-testid='section-menu-trigger']")!.click();
  await flush();
}

describe("QA5 gaps — arrows over a coming page or place", () => {
  test("ArrowDown from the page above a coming page reaches the page below it", async () => {
    await openAtServices();
    opt("services.web").focus();
    key(opt("services.web"), "ArrowDown");
    expect(activeOption()).toBe("services.apps");
  });

  test("ArrowUp from the page below a coming page reaches the page above it", async () => {
    await openAtServices();
    opt("services.apps").focus();
    key(opt("services.apps"), "ArrowUp");
    expect(activeOption()).toBe("services.web");
  });

  test("ArrowDown from the place above a coming place reaches the place below it", async () => {
    await openAtServices();
    opt("shop").focus();
    key(opt("shop"), "ArrowDown");
    expect(activeOption()).toBe("docs");
  });
});

describe("round 5 — a section arriving with coming at run time", () => {
  test("is left out entirely, pages and all, in the server HTML and after the script, with a dev warning", async () => {
    const { vi } = await import("vitest");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const untyped = { sections: [
      { id: "home", label: "Home", to: "/" },
      { id: "shop", label: "Shop", to: "/shop", coming: true, links: [{ id: "shop.cart", label: "Cart", to: "/shop/cart" }] },
    ] } as unknown as import("./menu").WebMenu;
    const { renderToString } = await import("vue/server-renderer");
    const { createSSRApp } = await import("vue");
    const html = await renderToString(createSSRApp(SectionMenu, { menu: untyped, currentPath: "/shop/cart" }));
    expect(html).not.toContain('href="/shop"');
    expect(html).not.toContain('href="/shop/cart"');
    expect(html).not.toContain('data-section="shop"');
    expect(html).toContain('href="/"');
    // A page under the left-out section is in no section.
    expect(html).toContain(">Menu<");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('section "shop" is marked coming and is left out'));
    warn.mockRestore();
  });
});
