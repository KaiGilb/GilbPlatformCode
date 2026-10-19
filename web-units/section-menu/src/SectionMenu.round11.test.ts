// Adopted from Agent.Tester web round 11's gap tests for web-units/section-menu at ecc849b (report
// AgentTester-WebUnit-ecc849b-EngineA-c83e618.md, 2026-10-18); the <details> test follows D23's fix.
// Spec: handoff 00.Handoff-2026-10-18-ToAgentCoder-SectionMenuAsDefaultSharedUnitAppAndWeb-GilbPlatformCode §3;
// Kai-Zen's decision (a), 2026-10-18 (pre-hydration state is a native <details>, never in the address; a panel the
// visitor opened stays open; behaviour after hydration unchanged); Rule_Code_accessibility (RuleA11yWcagAa).
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
  cta: { label: "Contact us", to: "/contact" },
};
const PATH = "/services/websites";
window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

let app: App | undefined;
afterEach(() => { app?.unmount(); app = undefined; document.body.innerHTML = ""; });
const flush = async () => { await nextTick(); await nextTick(); };

/** The server's HTML in the page, the visitor's `prepare`, then hydration (the script taking over). */
async function hydrate(prepare: (root: HTMLElement) => void = () => {}) {
  const html = await renderToString(createSSRApp(SectionMenu, { menu: MENU, currentPath: PATH }));
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  prepare(root);
  app = createSSRApp(SectionMenu, { menu: MENU, currentPath: PATH });
  app.mount(root);
  await flush();
  return root;
}
const q = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`[data-testid='${id}']`)!;
const openBefore = (r: HTMLElement) => { r.querySelector<HTMLDetailsElement>("details")!.open = true; };

describe("QA11 gaps: web SectionMenu, the <details> takeover", () => {
  // Spec: decision (a), "a panel the visitor opened before hydration stays open after it". Mutant m2 (the panel shut
  // 1.5 s after takeover) passed all 86 of the unit's tests; it is caught here.
  test("a panel opened before the script is still open 2.5 s after takeover", async () => {
    const root = await hydrate(openBefore);
    expect(q(root, "section-menu-panel").getAttribute("data-open")).toBe("true");
    await new Promise((ok) => setTimeout(ok, 2500));
    expect(q(root, "section-menu-panel").getAttribute("data-open")).toBe("true");
    expect(root.querySelector<HTMLDetailsElement>("details")!.open).toBe(true);
  }, 10000);

  // Spec: decision (a), "a menu nobody touched stays closed" — read late, not only at once.
  test("a menu nobody touched is still closed 2.5 s after takeover", async () => {
    const root = await hydrate();
    await new Promise((ok) => setTimeout(ok, 2500));
    expect(q(root, "section-menu-panel").getAttribute("data-open")).toBe("false");
  }, 10000);

  // Spec: "behaviour after hydration is unchanged". After takeover a click on the <summary> must not toggle it
  // natively (mutant m5, no preventDefault, passed all 86 tests); <details> follows the menu's state (D23).
  test("after takeover a click on the button is default-prevented and <details> follows the menu, open and closed", async () => {
    const root = await hydrate();
    const t = q(root, "section-menu-trigger");
    const details = root.querySelector<HTMLDetailsElement>("details")!;
    for (const want of ["true", "false", "true", "false"]) {
      await new Promise((ok) => setTimeout(ok, 650)); // past the hover-click grace
      const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
      t.dispatchEvent(ev);
      await flush();
      expect(ev.defaultPrevented).toBe(true);
      // On close <details> waits for the 90 ms fade.
      if (want === "false") await new Promise((ok) => setTimeout(ok, 120));
      expect(details.open).toBe(want === "true");
      expect(q(root, "section-menu-panel").getAttribute("data-open")).toBe(want);
    }
  }, 10000);

  // Spec: decision (a), "NEVER kept in the address" — the whole address, not only the fragment.
  test("opening and closing after takeover leaves the whole address unchanged (path, query and fragment)", async () => {
    window.history.replaceState(null, "", "/services/websites?x=1");
    const before = window.location.href;
    const root = await hydrate(openBefore);
    expect(window.location.href).toBe(before);
    q(root, "section-menu-close").click();
    await flush();
    q(root, "section-menu-trigger").click();
    await flush();
    expect(window.location.href).toBe(before);
    window.history.replaceState(null, "", "/");
  });

  // Spec: Rule_Code_accessibility RuleA11yWcagAa (4.1.2 Name, Role, Value: the button's expanded state). Measured in
  // Chromium (CDP Accessibility.getPartialAXTree, round 11): a <summary> whose <details> is open is exposed as
  // expanded=true whatever its aria-expanded says. At ecc849b <details> was always open after takeover, so a
  // closed menu was announced "expanded" (D23). The closed menu's button must not be a <summary> of an open <details>.
  test("D23: after takeover, the closed menu's button is not exposed as expanded", async () => {
    const root = await hydrate();
    const t = q(root, "section-menu-trigger");
    expect(t.getAttribute("aria-expanded")).toBe("false");
    const nativelyExpanded = t.tagName === "SUMMARY" && (t.parentElement as HTMLDetailsElement | null)?.open === true;
    expect(nativelyExpanded).toBe(false);
  });
});
