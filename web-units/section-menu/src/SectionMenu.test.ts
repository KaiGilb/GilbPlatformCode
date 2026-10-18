// The website section menu: the same behaviour as the app menu (GilbPlatformCode units/section-menu).
// Spec: handoff 00.Handoff-2026-10-18-ToAgentCoder-SectionMenuAsDefaultSharedUnitAppAndWeb-GilbPlatformCode §3
// (instant open with the panel always mounted; sections left, hover preview of their pages right; the four ways
// to close; the phone sheet; focus trap and Esc; reduced motion; content is data).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import SectionMenu from "./SectionMenu.vue";
import { HOVER_INTENT_MS } from "./labels";
import type { WebMenu } from "./menu";

const MENU: WebMenu = {
  sections: [
    { id: "home", label: "Home", to: "/" },
    { id: "services", label: "Services", description: "What we do.", to: "/services",
      links: [
        { id: "services.web", label: "Websites", description: "Fast sites.", to: "/services/websites" },
        { id: "services.soon", label: "Training", coming: true },
      ], also: ["shop"] },
    { id: "blog", label: "Blog", to: "/blog", links: [{ id: "blog.tags", label: "Tags", to: "/blog/tag" }] },
    { id: "about", label: "About", description: "Who we are.", to: "/about" },
  ],
  places: [{ id: "shop", label: "Shop", description: "Elsewhere.", href: "https://example.test/shop", newTab: true }],
  cta: { label: "Contact us", to: "/contact" },
};

// jsdom 25 has no PointerEvent, so `pointerType` would be lost; a small stand-in carries it.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventStandIn extends MouseEvent {
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? "";
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventStandIn;
}

let hoverable = false;
let phone = false;
beforeEach(() => {
  hoverable = false;
  phone = false;
  window.matchMedia = ((q: string) => ({
    matches: (q.includes("hover: hover") && hoverable) || (q.includes("max-width: 599") && phone),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});

let wrapper: VueWrapper | undefined;
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

/** A stand-in for NuxtLink: renders `to` as an href, as NuxtLink does. */
const FakeLink = defineComponent({
  props: { to: { type: String, required: true } },
  setup(props, { slots, attrs }) {
    return () => h("a", { ...attrs, href: props.to, "data-router-link": "" }, slots.default?.());
  },
});

/** Mounts the menu and waits for the script to take over (the plain-HTML menu becomes the enhanced one). */
async function mountMenu(props: Record<string, unknown> = {}) {
  wrapper = mount(SectionMenu, { props: { menu: MENU, currentPath: "/services/websites", ...props }, attachTo: document.body });
  await nextTick();
  await nextTick();
  return wrapper;
}
const panel = () => document.querySelector<HTMLElement>("[data-testid='section-menu-panel']")!;
const trigger = () => document.querySelector<HTMLElement>("[data-testid='section-menu-trigger']")!;
const section = (id: string) => panel().querySelector<HTMLElement>(`[data-section="${id}"]`)!;
/** An option the visitor can see: in the page, and (after the script) in the shown section list. */
const option = (id: string) => {
  const el = panel().querySelector<HTMLElement>(`[data-option="${id}"]`);
  const list = el?.closest<HTMLElement>("[data-list-for]");
  return el && (!list || list.classList.contains("is-shown")) ? el : null;
};
const isOpen = () => panel().getAttribute("data-open") === "true";
const flush = async () => {
  await nextTick();
  await nextTick();
};
const key = (k: string, init: KeyboardEventInit = {}) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
async function press(k: string, init: KeyboardEventInit = {}) {
  // A section or option handles its own arrows; the document handles Esc and Tab.
  const el = document.activeElement as HTMLElement;
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
  await flush();
}

describe("web SectionMenu", () => {
  describe("the button", () => {
    test("says where you are; a sub-page counts as its section", async () => {
      await mountMenu();
      expect(trigger().textContent).toContain("Services");
      expect(trigger().getAttribute("aria-label")).toBe("Go to — you are on Services");
      expect(trigger().getAttribute("aria-controls")).toBe(panel().id);
    });
    test("a page in no section reads Menu", async () => {
      await mountMenu({ currentPath: "/catalog" });
      expect(trigger().textContent).toContain("Menu");
    });
  });

  describe("always mounted, instant", () => {
    test("closed: in the page, inert and hidden; open is a class change on the same node", async () => {
      await mountMenu();
      const p = panel();
      expect(p.getAttribute("aria-hidden")).toBe("true");
      expect(p.hasAttribute("inert")).toBe(true);
      expect(p.querySelectorAll("[data-section]").length).toBe(4);
      trigger().click();
      await flush();
      expect(panel()).toBe(p);
      expect(isOpen()).toBe(true);
      expect(p.hasAttribute("inert")).toBe(false);
      expect(trigger().getAttribute("aria-expanded")).toBe("true");
    });

    test("the closed menu is in the server-rendered HTML too", async () => {
      const { renderToString } = await import("vue/server-renderer");
      const { createSSRApp } = await import("vue");
      const html = await renderToString(createSSRApp(SectionMenu, { menu: MENU, currentPath: "/" }));
      expect(html).toContain('data-testid="section-menu-panel"');
      expect(html).toContain('data-open="false"');
      // Every section's pages are linked in the server's HTML, so a crawler finds them all.
      expect(html).toContain('href="/services/websites"');
      expect(html).toContain('href="/blog/tag"');
    });
  });

  describe("opening", () => {
    test("a click opens it and focus lands on the section you are on", async () => {
      await mountMenu();
      trigger().click();
      await flush();
      expect(document.activeElement).toBe(section("services"));
      expect(section("services").getAttribute("aria-current")).toBe("page");
      expect(panel().querySelector("[data-testid='section-menu-here-tag']")!.textContent).toBe("You are here");
    });

    test("a fine pointer that can hover opens it on enter; the click that follows keeps it open; a later click closes", async () => {
      hoverable = true;
      await mountMenu();
      trigger().dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" }));
      await flush();
      expect(isOpen()).toBe(true);
      trigger().click();
      await flush();
      expect(isOpen()).toBe(true);
      const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 5_000);
      trigger().click();
      await flush();
      expect(isOpen()).toBe(false);
      now.mockRestore();
    });

    test("touch, or a pointer that cannot hover, does not open on enter", async () => {
      hoverable = true;
      await mountMenu();
      trigger().dispatchEvent(new PointerEvent("pointerenter", { pointerType: "touch" }));
      await flush();
      expect(isOpen()).toBe(false);
      hoverable = false;
      trigger().dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" }));
      await flush();
      expect(isOpen()).toBe(false);
    });
  });

  describe("four ways to close", () => {
    test("Close, Esc and the dimmed edge close it and give focus back to the button", async () => {
      await mountMenu();
      for (const how of ["close", "esc", "scrim"] as const) {
        trigger().click();
        await flush();
        if (how === "close") panel().querySelector<HTMLElement>("[data-testid='section-menu-close']")!.click();
        if (how === "esc") key("Escape");
        if (how === "scrim") document.querySelector<HTMLElement>("[data-testid='section-menu-scrim']")!.click();
        await flush();
        expect(isOpen(), how).toBe(false);
        expect(document.activeElement, how).toBe(trigger());
      }
    });

    test("any link closes it and says which", async () => {
      const w = await mountMenu();
      trigger().click();
      await flush();
      option("services.web")!.click();
      await flush();
      expect(isOpen()).toBe(false);
      expect(w.emitted("navigate")![0]![0]).toMatchObject({ id: "services.web" });
      trigger().click();
      await flush();
      panel().querySelector<HTMLElement>("[data-testid='section-menu-cta']")!.click();
      await flush();
      expect(isOpen()).toBe(false);
    });

    test("a route change closes it", async () => {
      const w = await mountMenu();
      trigger().click();
      await flush();
      await w.setProps({ currentPath: "/about" });
      await flush();
      expect(isOpen()).toBe(false);
      expect(trigger().textContent).toContain("About");
    });
  });

  describe("content is data", () => {
    test("routes go through the host's link component; an address is a plain link, in a new tab when asked", async () => {
      await mountMenu({ linkComponent: FakeLink });
      expect(section("blog").hasAttribute("data-router-link")).toBe(true);
      expect(section("blog").getAttribute("href")).toBe("/blog");
      trigger().click();
      await flush();
      const shop = option("shop")!;
      expect(shop.hasAttribute("data-router-link")).toBe(false);
      expect(shop.getAttribute("href")).toBe("https://example.test/shop");
      expect(shop.getAttribute("target")).toBe("_blank");
      expect(shop.getAttribute("rel")).toBe("noopener noreferrer");
      expect(panel().querySelector("[data-testid='section-menu-cta']")!.getAttribute("href")).toBe("/contact");
    });

    test("a coming page is greyed and not a link", async () => {
      await mountMenu();
      trigger().click();
      await flush();
      const soon = option("services.soon")!;
      expect(soon.tagName).toBe("SPAN");
      expect(soon.getAttribute("aria-disabled")).toBe("true");
      expect(soon.textContent).toContain("Coming");
    });

    test("a site with no sub-pages anywhere has the sections column only", async () => {
      await mountMenu({ menu: { sections: MENU.sections.map(({ links: _l, also: _a, ...s }) => s) } });
      expect(panel().querySelector("[data-testid='section-menu-here']")).toBeNull();
      expect(panel().classList.contains("is-single")).toBe(true);
      expect(panel().querySelector("[data-testid='section-menu-cta']")).toBeNull();
    });

    test("the words are the site's", async () => {
      await mountMenu({ labels: { goTo: "Navigate", here: "Here", trigger: (l: string) => `Menu at ${l}` } });
      expect(panel().getAttribute("aria-label")).toBe("Navigate");
      expect(trigger().getAttribute("aria-label")).toBe("Menu at Services");
      expect(panel().querySelector("[data-testid='section-menu-here-tag']")!.textContent).toBe("Here");
    });
  });

  describe("preview", () => {
    test("resting the pointer 120 ms on a section previews its pages; a quick pass does not", async () => {
      vi.useFakeTimers();
      await mountMenu();
      trigger().click();
      await flush();
      section("blog").dispatchEvent(new MouseEvent("mouseenter"));
      vi.advanceTimersByTime(HOVER_INTENT_MS - 10);
      await flush();
      expect(option("blog.tags")).toBeNull();
      vi.advanceTimersByTime(20);
      await flush();
      expect(option("blog.tags")).not.toBeNull();
      const here = panel().querySelector("[data-testid='section-menu-here']")!.textContent!;
      expect(here).toContain("In Blog");
      expect(here).toContain("Click a page to go to Blog");
      expect(panel().querySelector("[data-testid='section-menu-places']")).toBeNull();
    });

    test("focus previews; each opening starts from where you are; a single-page section shows its line", async () => {
      await mountMenu();
      trigger().click();
      await flush();
      section("about").focus();
      await flush();
      expect(panel().querySelector("[data-testid='section-menu-here']")!.textContent).toContain("Who we are.");
      panel().querySelector<HTMLElement>("[data-testid='section-menu-close']")!.click();
      await flush();
      trigger().click();
      await flush();
      expect(option("services.web")).not.toBeNull();
    });
  });

  describe("keyboard", () => {
    test("Up, Down, Home, End move and preview; Right goes in; Left comes back", async () => {
      await mountMenu();
      trigger().click();
      await flush();
      await press("ArrowDown");
      expect(document.activeElement).toBe(section("blog"));
      await press("End");
      expect(document.activeElement).toBe(section("about"));
      await press("Home");
      expect(document.activeElement).toBe(section("home"));
      await press("ArrowUp");
      expect(document.activeElement).toBe(section("about"));
      await press("ArrowUp");
      await press("ArrowUp");
      expect(document.activeElement).toBe(section("services"));
      await press("ArrowRight");
      expect(document.activeElement).toBe(option("services.web"));
      await press("ArrowLeft");
      expect(document.activeElement).toBe(section("services"));
    });

    test("Tab stays inside: every section, the previewed section's pages and places after it, the CTA, then wraps", async () => {
      await mountMenu();
      trigger().click();
      await flush();
      const seen: string[] = [];
      for (let i = 0; i < 8; i++) {
        key("Tab");
        await flush();
        const el = document.activeElement as HTMLElement;
        seen.push(el.getAttribute("data-section") ?? el.getAttribute("data-option") ?? el.getAttribute("data-testid") ?? el.tagName);
      }
      expect(seen).toEqual(["services.web", "shop", "blog", "blog.tags", "about", "section-menu-cta", "section-menu-close", "home"]);
      key("Tab", { shiftKey: true });
      await flush();
      expect(document.activeElement!.getAttribute("data-testid")).toBe("section-menu-close");
    });
  });

  describe("phone", () => {
    test("no hover preview; the pages shown are those of the section you are on", async () => {
      vi.useFakeTimers();
      phone = true;
      await mountMenu();
      await flush();
      trigger().click();
      await flush();
      section("blog").dispatchEvent(new MouseEvent("mouseenter"));
      vi.advanceTimersByTime(HOVER_INTENT_MS * 3);
      section("blog").focus();
      await flush();
      expect(option("blog.tags")).toBeNull();
      expect(option("services.web")).not.toBeNull();
    });
  });
});
