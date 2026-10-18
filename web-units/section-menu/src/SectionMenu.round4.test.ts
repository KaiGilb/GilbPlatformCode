// Adopted from Agent.Tester round 4 (report AgentTester-WebUnit-b3efe88.md, 2026-10-18), adapted to Kai's
// decision on its D11 (2026-10-18): a section is never `coming`, as in the app unit; only pages and places may be.
// Spec: handoff 00.Handoff-2026-10-18-ToAgentCoder-SectionMenuAsDefaultSharedUnitAppAndWeb-GilbPlatformCode §3,
// Rule_Code_gilb-app-nav-truth (RuleBaserenderNoUnbuiltDestination). Kai 2026-10-18: websites work before
// hydration and with JavaScript off, so the server HTML is what a visitor without the script, and a crawler, gets.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import SectionMenu from "./SectionMenu.vue";
import type { WebMenu, WebMenuSection } from "./menu";

const MENU: WebMenu = {
  sections: [
    { id: "home", label: "Home", to: "/" },
    { id: "services", label: "Services", to: "/services", also: ["docs"], links: [
      { id: "services.web", label: "Websites", to: "/services/websites" },
      { id: "services.soon", label: "Training", to: "/services/training", coming: true },
    ] },
  ],
  places: [{ id: "docs", label: "Docs", href: "https://example.net/docs", coming: true }],
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

describe("round 4 — coming", () => {
  test("a section cannot be named as coming (type check)", () => {
    // @ts-expect-error a section has no `coming` (Kai, 2026-10-18)
    const bad: WebMenuSection = { id: "shop", label: "Shop", coming: true, links: [] };
    expect(bad.id).toBe("shop");
  });

  test("a coming page or place is not a live link, in the server HTML or after the script", async () => {
    const { renderToString } = await import("vue/server-renderer");
    const { createSSRApp } = await import("vue");
    const html = await renderToString(createSSRApp(SectionMenu, { menu: MENU, currentPath: "/services" }));
    expect(html).toContain('href="/services/websites"');
    expect(html).not.toContain('href="/services/training"');
    expect(html).not.toContain('href="https://example.net/docs"');
    wrapper = mount(SectionMenu, { props: { menu: MENU, currentPath: "/services" }, attachTo: document.body });
    await nextTick();
    await nextTick();
    expect(document.querySelector("a[href='/services/training']")).toBeNull();
    expect(document.querySelector("a[href='https://example.net/docs']")).toBeNull();
    const docs = document.querySelector<HTMLElement>("[data-option='docs']")!;
    expect(docs.getAttribute("aria-disabled")).toBe("true");
    expect(docs.textContent).toContain("Coming");
  });
});
