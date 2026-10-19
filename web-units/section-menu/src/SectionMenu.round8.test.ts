// Adopted from Agent.Tester web round 8 (report AgentTester-WebUnit-18d5fb7-EngineA-c5d7b36.md, 2026-10-18).
// Agent.Tester round 8 gap tests (web-units/section-menu @ 18d5fb7).
// Spec: handoff 00.Handoff-2026-10-18-ToAgentCoder-SectionMenuAsDefaultSharedUnitAppAndWeb-GilbPlatformCode §3
// ("focus trap and Tab order"), Kai-Zen's decision 2026-10-18 (c): a coming page or place is a focusable
// <button aria-disabled="true"> that the arrows land on and move past, that Tab skips; Rule_Code_accessibility
// RuleA11yWcagAa (WCAG 2.4.3 Focus Order).
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
const activeId = () => {
  const a = document.activeElement as HTMLElement | null;
  return a?.getAttribute("data-option") ?? a?.getAttribute("data-section") ?? a?.getAttribute("data-testid");
};
const key = (k: string, shift = false) =>
  (document.activeElement ?? document).dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey: shift, bubbles: true }));

async function openOnServices() {
  wrapper = mount(SectionMenu, { props: { menu: MENU, currentPath: "/services" }, attachTo: document.body });
  await flush();
  document.querySelector<HTMLElement>("[data-testid='section-menu-trigger']")!.click();
  await flush();
}

describe("QA8 gaps — Tab from a coming entry the arrows landed on", () => {
  // Spec: (c) + §3 Tab order: from the coming page, Tab goes on to the next page, not back to Close.
  test("Tab from a coming page goes to the next page", async () => {
    await openOnServices();
    opt("services.web").focus();
    key("ArrowDown");
    expect(activeId()).toBe("services.soon");
    key("Tab");
    expect(activeId()).toBe("services.apps");
  });

  // Spec: (c) + §3 Tab order: Shift+Tab from the coming page goes back to the page before it, not to the CTA or Close.
  test("Shift+Tab from a coming page goes to the page before it", async () => {
    await openOnServices();
    opt("services.web").focus();
    key("ArrowDown");
    expect(activeId()).toBe("services.soon");
    key("Tab", true);
    expect(activeId()).toBe("services.web");
  });

  // Spec: (c) + §3 Tab order, for a place.
  test("Tab from a coming place goes to the next place", async () => {
    await openOnServices();
    opt("shop").focus();
    key("ArrowDown");
    expect(activeId()).toBe("planned");
    key("Tab");
    expect(activeId()).toBe("docs");
  });
});
