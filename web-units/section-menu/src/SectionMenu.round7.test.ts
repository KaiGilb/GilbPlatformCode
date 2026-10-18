// Adopted from Agent.Tester (report AgentTester-WebUnit-6f0cd7b-EngineA-ed37d22.md, 2026-10-18).
// Agent.Tester round 7 gap tests (web-units/section-menu @ 6f0cd7b), written in the QA scratch copy.
// Spec: handoff 00.Handoff-2026-10-18-ToAgentCoder-SectionMenuAsDefaultSharedUnitAppAndWeb-GilbPlatformCode §3,
// Kai-Zen's decisions 2026-10-18: (a) works before the script and with it off; (c) a coming page or place is a
// focusable <button aria-disabled="true"> that the arrows land on and move past, Tab skips, a press does nothing.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, nextTick } from "vue";
import { renderToString } from "vue/server-renderer";
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
  vi.restoreAllMocks();
});
const flush = async () => { await nextTick(); await nextTick(); await nextTick(); };
const opt = (id: string) => document.querySelector<HTMLElement>(`[data-option="${id}"]`)!;
const activeId = () => {
  const a = document.activeElement as HTMLElement | null;
  return a?.getAttribute("data-option") ?? a?.getAttribute("data-section") ?? a?.getAttribute("data-testid");
};
const tab = (shift = false) => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true }));

describe("QA7 gaps — a coming page or place", () => {
  // Spec: decision (c) "Tab skips", with (a) "works before the script and with it off": the server HTML has no
  // focus trap, so the browser's own Tab order must already skip the coming button.
  test("in the server HTML (before the script, or with it off) a coming entry is not in the Tab order", async () => {
    const html = await renderToString(createSSRApp(SectionMenu, { menu: MENU, currentPath: "/services" }));
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    for (const id of ["services.soon", "planned"]) {
      const el = host.querySelector<HTMLElement>(`[data-option="${id}"]`)!;
      expect(el.tagName).toBe("BUTTON");
      expect(el.getAttribute("aria-disabled")).toBe("true");
      // A <button> is in the sequential Tab order unless its tabIndex is negative.
      expect(el.tabIndex, `${id} tabIndex`).toBeLessThan(0);
    }
  });

  // Spec: decision (c) "Tab skips" after the script (the focus trap).
  test("after the script, Tab and Shift+Tab pass over a coming page and a coming place", async () => {
    wrapper = mount(SectionMenu, { props: { menu: MENU, currentPath: "/services" }, attachTo: document.body });
    await flush();
    document.querySelector<HTMLElement>("[data-testid='section-menu-trigger']")!.click();
    await flush();
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) { tab(); seen.push(String(activeId())); }
    expect(seen).toContain("services.apps");
    expect(seen).not.toContain("services.soon");
    expect(seen).not.toContain("planned");
    opt("services.apps").focus();
    tab(true);
    expect(activeId()).toBe("services.web");
  });

  // Spec: decision (c) "a press does nothing": no navigate event, the menu stays open.
  test("a click on a coming entry emits no navigate and does not close the menu", async () => {
    wrapper = mount(SectionMenu, { props: { menu: MENU, currentPath: "/services" }, attachTo: document.body });
    await flush();
    document.querySelector<HTMLElement>("[data-testid='section-menu-trigger']")!.click();
    await flush();
    opt("services.soon").click();
    opt("planned").click();
    await flush();
    expect(wrapper.emitted("navigate")).toBeUndefined();
    expect(wrapper.emitted("open-change")).toEqual([[true]]);
  });

  // Spec: (a) the takeover of server HTML that holds coming buttons is clean.
  test("hydrating server HTML with coming entries gives no hydration mismatch", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = await renderToString(createSSRApp(SectionMenu, { menu: MENU, currentPath: "/services" }));
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    const app = createSSRApp(SectionMenu, { menu: MENU, currentPath: "/services" });
    app.mount(host);
    await flush();
    const all = [...warn.mock.calls, ...err.mock.calls].map((c) => String(c[0]));
    expect(all.filter((m) => /hydrat/i.test(m))).toEqual([]);
    expect(host.querySelector('[data-option="services.soon"]')!.tagName).toBe("BUTTON");
    app.unmount();
  });
});
