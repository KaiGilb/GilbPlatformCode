// Adopted from Agent.Tester round 2 (report AgentTester-WebUnit-1c1c469-EngineA-5c3a91d.md, 2026-10-18).
// Agent.Tester round 2 gap tests (web-units/section-menu @ 1c1c469).
// Spec: handoff 00.Handoff-2026-10-18-ToAgentCoder-SectionMenuAsDefaultSharedUnitAppAndWeb-GilbPlatformCode §3
// + Kai-Zen's decision, 2026-10-18: websites work before hydration and with JavaScript off (SEO, first impressions).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
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
const PROPS = { menu: MENU, currentPath: "/services/websites" };

let fineHover = true;
const realMatches = Element.prototype.matches;
let hovered: string | null = null;
beforeEach(() => {
  fineHover = true;
  hovered = null;
  window.history.replaceState(null, "", "/services/websites");
  window.matchMedia = ((q: string) => ({
    matches: q.includes("hover: hover") ? fineHover : false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  // jsdom cannot answer :hover; the pointer "rests" on whatever testid `hovered` names.
  Element.prototype.matches = function (this: Element, sel: string) {
    if (sel === ":hover") return hovered !== null && this.getAttribute("data-testid") === hovered;
    return realMatches.call(this, sel);
  };
});
let app: App | undefined;
afterEach(() => {
  app?.unmount();
  app = undefined;
  Element.prototype.matches = realMatches;
  document.body.innerHTML = "";
});
const flush = async () => { await nextTick(); await nextTick(); await nextTick(); };

/** Server HTML in the page, then the script takes over (hydration), as on a delayed-hydration site. */
async function hydrateAfter(before: (root: HTMLElement) => void) {
  const html = await renderToString(createSSRApp(SectionMenu, PROPS));
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  before(root);
  app = createSSRApp(SectionMenu, PROPS);
  app.mount(root);
  await flush();
  return root;
}

describe("QA2 gaps — web SectionMenu takeover", () => {
  // Spec: Outcome "opens instantly on hover"; Kai-Zen 2026-10-18 before hydration. A hover that began before the
  // script ran is carried over.
  test("a fine pointer already resting on the button when the script takes over opens the menu", async () => {
    const root = await hydrateAfter(() => { hovered = "section-menu-trigger"; });
    expect(root.querySelector("[data-testid='section-menu-panel']")!.getAttribute("data-open")).toBe("true");
  });

  // Spec: §3 phone sheet — a touch screen never opens on hover, also not at takeover.
  test("no hover carry-over where the pointer cannot hover finely", async () => {
    fineHover = false;
    const root = await hydrateAfter(() => { hovered = "section-menu-trigger"; });
    expect(root.querySelector("[data-testid='section-menu-panel']")!.getAttribute("data-open")).toBe("false");
  });

  // Spec: Rule_Code_accessibility RuleA11yKeyboard — the keyboard stays where it was when the link becomes a button.
  test("focus on the button-link before the script stays on the button after it", async () => {
    const root = await hydrateAfter((r) => r.querySelector<HTMLElement>("[data-testid='section-menu-trigger']")!.focus());
    const now = root.querySelector<HTMLElement>("[data-testid='section-menu-trigger']")!;
    expect(now.tagName).toBe("BUTTON");
    expect(document.activeElement).toBe(now);
    expect(root.querySelector("[data-testid='section-menu-panel']")!.getAttribute("data-open")).toBe("false");
  });

  // Spec: Kai-Zen 2026-10-18 SEO — the server HTML's links each carry a name a crawler or link checker can read
  // (the starter's nuxt-link-checker flags an empty link as "Missing link textContent, title or aria-label").
  test("server HTML: every link has text, a title or an aria-label", async () => {
    const host = document.createElement("div");
    host.innerHTML = await renderToString(createSSRApp(SectionMenu, PROPS));
    const nameless = Array.from(host.querySelectorAll("a[href]"))
      .filter((a) => !a.textContent?.trim() && !a.getAttribute("title") && !a.getAttribute("aria-label"))
      .map((a) => a.getAttribute("data-testid") ?? a.getAttribute("href"));
    expect(nameless).toEqual([]);
  });
});
