// Adopted from Agent.Tester web round 12's gap tests for web-units/section-menu at 3c07cda (report
// AgentTester-WebUnit-3c07cda-EngineA-4ccc41f.md, 2026-10-19).
// Spec: Kai-Zen's decision (a), 2026-10-18: "after takeover the button reports its real expanded state";
// Rule_Code_accessibility RuleA11yWcagAa (WCAG 2.1 4.1.2). Measured in Chromium, Firefox and WebKit (probe12.mjs):
// a fragment navigation to the panel's id (or to anything inside it) makes the engine open the closed <details>
// itself. At 3c07cda the unit did not listen to `toggle`, so the menu stayed closed while the <summary> was exposed
// as expanded (Chromium AX: expanded=true, aria-expanded="false"); 397f226 shuts such an opening again (D26). jsdom has no engine auto-expand, so the test
// opens <details> as the engine does and waits for its `toggle` event.
import { afterEach, describe, expect, test } from "vitest";
import { createSSRApp, nextTick, type App } from "vue";
import { renderToString } from "vue/server-renderer";
import SectionMenu from "./SectionMenu.vue";
import type { WebMenu } from "./menu";

const MENU: WebMenu = {
  sections: [
    { id: "home", label: "Home", to: "/" },
    { id: "services", label: "Services", to: "/services", links: [{ id: "services.web", label: "Websites", to: "/services/websites" }] },
    { id: "about", label: "About", to: "/about" },
  ],
};
window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
let app: App | undefined;
afterEach(() => { app?.unmount(); app = undefined; document.body.innerHTML = ""; });

async function hydrate() {
  const html = await renderToString(createSSRApp(SectionMenu, { menu: MENU, currentPath: "/about" }));
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  app = createSSRApp(SectionMenu, { menu: MENU, currentPath: "/about" });
  app.mount(root);
  await nextTick(); await nextTick();
  return root;
}

describe("QA12 gaps: web SectionMenu, <details> opened by the engine after takeover", () => {
  test("D26: the engine opening <details> (fragment navigation into the panel) leaves the button's state true", async () => {
    const root = await hydrate();
    const d = root.querySelector<HTMLDetailsElement>("details")!;
    const t = root.querySelector<HTMLElement>("[data-testid='section-menu-trigger']")!;
    const panel = root.querySelector<HTMLElement>("[data-testid='section-menu-panel']")!;
    expect(d.open).toBe(false);
    const toggled = new Promise((ok) => d.addEventListener("toggle", ok, { once: true }));
    d.open = true;
    await toggled;
    await nextTick(); await nextTick();
    const menuOpen = panel.getAttribute("data-open") === "true";
    // Either the menu adopts the open (and says so), or <details> is shut again: never "closed, but expanded".
    expect(d.open).toBe(menuOpen);
    expect(t.getAttribute("aria-expanded")).toBe(menuOpen ? "true" : "false");
  });

  // The fade (Kai-Zen, round 12): 90 ms in and out, as the app menu; reduced motion: no fade, <details> shuts at once.
  test("closing fades for 90 ms: the panel is inert at once, <details> closes after the fade", async () => {
    const root = await hydrate();
    const d = root.querySelector<HTMLDetailsElement>("details")!;
    const t = root.querySelector<HTMLElement>("[data-testid='section-menu-trigger']")!;
    const panel = root.querySelector<HTMLElement>("[data-testid='section-menu-panel']")!;
    t.click();
    await nextTick(); await nextTick();
    expect(d.open).toBe(true);
    await new Promise((ok) => setTimeout(ok, 650)); // past the hover-click grace
    root.querySelector<HTMLElement>("[data-testid='section-menu-close']")!.click();
    await nextTick(); await nextTick();
    expect(panel.getAttribute("data-open")).toBe("false");
    expect(panel.hasAttribute("inert")).toBe(true);
    expect(panel.classList.contains("is-closing")).toBe(true);
    expect(d.open).toBe(true);
    await new Promise((ok) => setTimeout(ok, 130));
    await nextTick();
    expect(panel.classList.contains("is-closing")).toBe(false);
    expect(d.open).toBe(false);
  });

  test("under reduced motion closing does not fade: <details> closes at once", async () => {
    const before = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes("prefers-reduced-motion"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      const root = await hydrate();
      const d = root.querySelector<HTMLDetailsElement>("details")!;
      root.querySelector<HTMLElement>("[data-testid='section-menu-trigger']")!.click();
      await nextTick(); await nextTick();
      root.querySelector<HTMLElement>("[data-testid='section-menu-close']")!.click();
      await nextTick(); await nextTick();
      expect(d.open).toBe(false);
      expect(root.querySelector("[data-testid='section-menu-panel']")!.classList.contains("is-closing")).toBe(false);
    } finally {
      window.matchMedia = before;
    }
  });
});
