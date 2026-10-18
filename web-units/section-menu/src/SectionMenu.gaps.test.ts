// Adopted from Agent.Tester's round-1 gap tests of web-units/section-menu at c76f682 (report
// AgentTester-WebUnit-c76f682-EngineA-bdf90e6.md, 2026-10-18), with the fixes' own tests after them.
// Spec: handoff 00.Handoff-2026-10-18-ToAgentCoder-SectionMenuAsDefaultSharedUnitAppAndWeb-GilbPlatformCode §3
// and Rule_Code_accessibility (RuleA11yUnitTest, RuleA11ySemanticHtml, RuleA11yContrast).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import SectionMenu from "./SectionMenu.vue";
import type { WebMenu } from "./menu";

// Vitest runs from the unit's folder (jsdom gives import.meta.url no file scheme).
const SFC = join(process.cwd(), "src", "SectionMenu.vue");

const MENU: WebMenu = {
  sections: [
    { id: "home", label: "Home", to: "/" },
    { id: "services", label: "Services", to: "/services", links: [{ id: "services.web", label: "Websites", to: "/services/websites" }] },
    // A section with pages but no page of its own: the type allows `to` and `href` to be absent.
    { id: "products", label: "Products", links: [{ id: "products.a", label: "Product A", to: "/products/a" }] },
    { id: "about", label: "About", to: "/about" },
  ],
  cta: { label: "Contact us", to: "/contact" },
};

let phone = false;
beforeEach(() => {
  phone = false;
  window.matchMedia = ((q: string) => ({ matches: q.includes("max-width: 599") && phone, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; });
const flush = async () => { await nextTick(); await nextTick(); };
const panel = () => document.querySelector<HTMLElement>("[data-testid='section-menu-panel']")!;
const trigger = () => document.querySelector<HTMLElement>("[data-testid='section-menu-trigger']")!;
const visibleOption = (id: string) => {
  const el = panel().querySelector<HTMLElement>(`[data-option="${id}"]`);
  const list = el?.closest<HTMLElement>("[data-list-for]");
  return el && (!list || list.classList.contains("is-shown")) ? el : null;
};
async function mountMenu(props: Record<string, unknown> = {}) {
  wrapper = mount(SectionMenu, { props: { menu: MENU, currentPath: "/services/websites", ...props }, attachTo: document.body });
  await flush();
  return wrapper;
}

// sRGB contrast helpers
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x! + 0.05) / (y! + 0.05); };
const mix = (a: string, b: string, pa: number) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * pa + parseInt(b.slice(i, i + 2), 16) * (1 - pa)).toString(16).padStart(2, "0")).join("");

describe("QA gaps — web SectionMenu", () => {
  // Spec: Rule_Code_accessibility RuleA11yUnitTest — every component test file has an axe check.
  test("axe: the open menu has no violations (jsdom; colour contrast not measurable here)", async () => {
    await mountMenu();
    trigger().click();
    await flush();
    const r = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(r.violations.map((v: { id: string }) => v.id)).toEqual([]);
  });

  // Spec: RuleA11yContrast — normal text ≥ 4.5:1. The "You are here" tag is accent text on the current
  // section's accent-12% tint, with the unit's own fallbacks (#2563eb on #fff).
  test("default theme: the 'You are here' tag clears 4.5:1 on the current section's tint", () => {
    // The tag's colour is the accent mixed 75% toward the ink (the --section-menu-accent-text fallback).
    const sfc = readFileSync(SFC, "utf8");
    expect(sfc).toMatch(/\.sm-here \{ color: var\(--section-menu-accent-text, color-mix\(in srgb, var\(--section-menu-accent, #2563eb\) 75%, var\(--section-menu-fg, #1a1a1a\)\)\); \}/);
    const bg = mix("#2563eb", "#ffffff", 0.12);
    expect(ratio(mix("#2563eb", "#1a1a1a", 0.75), bg)).toBeGreaterThanOrEqual(4.5);
  });

  // Spec: RuleA11ySemanticHtml (<nav>); the source MegaMenu.vue drew a <nav>, and the starter's old header had one.
  test("the menu's site links sit in a navigation landmark", async () => {
    await mountMenu();
    expect(panel().querySelector("nav, [role='navigation']") ?? panel().closest("nav, [role='navigation']")).not.toBeNull();
  });

  // Spec: §3 "the phone sheet" + "content is data": every page the data lists is reachable on a phone.
  test("phone: a section with pages but no page of its own still lets the visitor reach its pages", async () => {
    phone = true;
    await mountMenu();
    await flush();
    trigger().click();
    await flush();
    panel().querySelector<HTMLElement>("[data-section='products']")!.click();
    await flush();
    expect(visibleOption("products.a")).not.toBeNull();
  });

  // Spec: §3 "the same behaviour as the app menu": the app's choose() closes with focus back on the button.
  test("choosing the page you are on leaves focus on the button, not on the body", async () => {
    await mountMenu({ currentPath: "/about" });
    trigger().click();
    await flush();
    const about = panel().querySelector<HTMLElement>("[data-section='about']")!;
    about.addEventListener("click", (e) => e.preventDefault());
    about.click();
    await flush();
    expect(document.activeElement).toBe(trigger());
  });

  // Spec: §3 reduced motion.
  test("reduced motion: the stylesheet removes the panel's, chevron's and button's transitions", () => {
    const sfc = readFileSync(SFC, "utf8");
    const block = sfc.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
    for (const sel of [".sm-panel", ".sm-chevron", ".sm-trigger"]) expect(block).toContain(sel);
    expect(block).toMatch(/transition:\s*none/);
  });

  // Spec: §3 focus trap — focus outside the panel (a click on the header) is pulled back in by Tab.
  test("Tab from outside the open panel lands inside it", async () => {
    await mountMenu();
    trigger().click();
    await flush();
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    await flush();
    expect(panel().contains(document.activeElement)).toBe(true);
  });

  // Spec: §3 Esc — once closed, Esc and Tab are the page's again (the listener is removed).
  test("closed: Esc and Tab are not taken from the page", async () => {
    await mountMenu();
    trigger().click();
    await flush();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await flush();
    const ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  // Spec: §3 content is data — a section that is an address elsewhere is a plain link in a new tab.
  test("a section with href draws a plain link, opened in a new tab when asked", async () => {
    await mountMenu({ menu: { sections: [{ id: "shop", label: "Shop", href: "https://example.test/", newTab: true }] } });
    const shop = panel().querySelector<HTMLElement>("[data-section='shop']")!;
    expect(shop.tagName).toBe("A");
    expect(shop.getAttribute("href")).toBe("https://example.test/");
    expect(shop.getAttribute("target")).toBe("_blank");
  });

  // Kai-Zen's decision, 2026-10-18: websites work before hydration and with JavaScript off.
  describe("before the script (server HTML, JavaScript off)", () => {
    async function serverHtml(menu: WebMenu = MENU) {
      const { renderToString } = await import("vue/server-renderer");
      const { createSSRApp } = await import("vue");
      const host = document.createElement("div");
      host.innerHTML = await renderToString(createSSRApp(SectionMenu, { menu, currentPath: "/services/websites" }));
      return host;
    }

    test("a nav landmark holds every section and every page as plain links", async () => {
      const host = await serverHtml();
      const nav = host.querySelector("nav")!;
      expect(nav.getAttribute("aria-label")).toBe("Site");
      const hrefs = Array.from(nav.querySelectorAll("a[href]")).map((a) => a.getAttribute("href"));
      for (const h of ["/", "/services", "/services/websites", "/products/a", "/about", "/contact"]) expect(hrefs).toContain(h);
    });

    // Kai-Zen's decision, 2026-10-18 (after D19-D21): the pre-script open state lives in a native <details>,
    // never in the address.
    test("the button is the <summary> of a native <details>; no link points into the menu; nothing is inert", async () => {
      const host = await serverHtml();
      const panel = host.querySelector<HTMLElement>("[data-testid='section-menu-panel']")!;
      const trig = host.querySelector<HTMLElement>("[data-testid='section-menu-trigger']")!;
      const details = host.querySelector<HTMLDetailsElement>("[data-testid='section-menu-details']")!;
      expect(trig.tagName).toBe("SUMMARY");
      expect(trig.parentElement).toBe(details);
      expect(details.hasAttribute("open")).toBe(false);
      expect(details.contains(panel)).toBe(true);
      expect(host.querySelectorAll("a[href^='#']").length).toBe(0);
      expect(panel.hasAttribute("inert")).toBe(false);
      expect(host.querySelector(".sm-root")!.classList.contains("is-enhanced")).toBe(false);
    });

    test("the stylesheet opens the panel by <details open> only before the script, and shows every list then", () => {
      const sfc = readFileSync(SFC, "utf8");
      expect(sfc).toContain(".sm-root:not(.is-enhanced) .sm-details[open] > .sm-panel {");
      expect(sfc).not.toMatch(/:target\s*[{~,]/);
      expect(sfc).toContain(".sm-root.is-enhanced .sm-group:not(.is-shown) { display: none; }");
      expect(sfc).toMatch(/\.sm-panel \{[^}]*visibility: hidden;/);
    });

    async function hydrateWith(prepare: (root: HTMLElement) => void) {
      const { renderToString } = await import("vue/server-renderer");
      const { createSSRApp } = await import("vue");
      const html = await renderToString(createSSRApp(SectionMenu, { menu: MENU, currentPath: "/services/websites" }));
      const root = document.createElement("div");
      root.innerHTML = html;
      document.body.appendChild(root);
      prepare(root);
      const app = createSSRApp(SectionMenu, { menu: MENU, currentPath: "/services/websites" });
      app.mount(root);
      await flush();
      return { root, app };
    }

    test("a panel the visitor opened before the script stays open when the script takes over; the address is untouched", async () => {
      window.history.replaceState(null, "", "/services/websites");
      const { root, app } = await hydrateWith((r) => { r.querySelector<HTMLDetailsElement>("details")!.open = true; });
      expect(root.querySelector("[data-testid='section-menu-panel']")!.getAttribute("data-open")).toBe("true");
      expect(window.location.hash).toBe("");
      expect(window.location.pathname).toBe("/services/websites");
      app.unmount();
    });

    test("nobody touched the menu: it stays closed at takeover, and <details> stays closed with it (D23)", async () => {
      const { root, app } = await hydrateWith(() => {});
      expect(root.querySelector("[data-testid='section-menu-panel']")!.getAttribute("data-open")).toBe("false");
      expect(root.querySelector<HTMLDetailsElement>("details")!.open).toBe(false);
      expect(root.querySelector("[data-testid='section-menu-panel']")!.hasAttribute("inert")).toBe(true);
      app.unmount();
    });
  });

  describe("after the script", () => {
    test("phone: a section with no page of its own is a button that shows its pages; it goes nowhere", async () => {
      phone = true;
      await mountMenu();
      trigger().click();
      await flush();
      const products = panel().querySelector<HTMLElement>("[data-section='products']")!;
      expect(products.tagName).toBe("BUTTON");
      products.click();
      await flush();
      expect(document.querySelector("[data-testid='section-menu-panel']")!.getAttribute("data-open")).toBe("true");
      expect(visibleOption("services.web")).toBeNull();
    });

    test("the phone stylesheet is one column, and two columns from 600 px", () => {
      const sfc = readFileSync(SFC, "utf8");
      expect(sfc).toMatch(/@media \(max-width: 599\.98px\) \{[\s\S]*grid-template-columns: 1fr;/);
      expect(sfc).toMatch(/@media \(max-width: 839\.98px\) \{[\s\S]*grid-template-columns: 1fr 1fr;/);
    });
  });
});
