// Adopted into the unit's own suite from Agent.Tester's probes (2026-10-18).
// Agent.Tester web round 9 gap tests (web-units/section-menu @ ec46d96).
// Spec: handoff 00.Handoff-2026-10-18-ToAgentCoder-SectionMenuAsDefaultSharedUnitAppAndWeb-GilbPlatformCode §3
// ("focus trap and Tab order"), Kai-Zen's decision 2026-10-18 (c): from a coming page or place, Tab and Shift+Tab
// go on to the next and previous usable entries; Rule_Code_accessibility RuleA11yWcagAa (WCAG 2.4.3 Focus Order).
// These cover the edges of the D18 fix that round 8's three tests do not: a coming entry first or last in its list,
// two coming entries in a row, every page coming, the last place with and without a call to action, Shift+Tab
// from a place, and the phone width.
import { afterEach, describe, expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import SectionMenu from "./SectionMenu.vue";
import type { WebMenu } from "./menu";

function menu(withCta: boolean): WebMenu {
  return {
    sections: [
      { id: "home", label: "Home", to: "/" },
      { id: "services", label: "Services", to: "/services", also: ["shop", "planned"], links: [
        { id: "s.first", label: "First", to: "/services/first", coming: true },
        { id: "s.a", label: "A", to: "/services/a" },
        { id: "s.c1", label: "C1", to: "/services/c1", coming: true },
        { id: "s.c2", label: "C2", to: "/services/c2", coming: true },
        { id: "s.b", label: "B", to: "/services/b" },
        { id: "s.last", label: "Last", to: "/services/last", coming: true },
      ] },
      { id: "allsoon", label: "All soon", to: "/allsoon", links: [
        { id: "z.1", label: "Z1", to: "/allsoon/1", coming: true },
        { id: "z.2", label: "Z2", to: "/allsoon/2", coming: true },
      ] },
      { id: "blog", label: "Blog", to: "/blog" },
    ],
    places: [
      { id: "shop", label: "Shop", href: "https://example.net/shop" },
      { id: "planned", label: "Planned", href: "https://example.net/planned", coming: true },
    ],
    ...(withCta ? { cta: { label: "Contact", to: "/contact" } } : {}),
  };
}

let wrapper: VueWrapper | undefined;
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
});
const flush = async () => { await nextTick(); await nextTick(); await nextTick(); };
const opt = (id: string) => document.querySelector<HTMLElement>(`[data-option="${id}"]`)!;
const sec = (id: string) => document.querySelector<HTMLElement>(`[data-section="${id}"]`)!;
const activeId = () => {
  const a = document.activeElement as HTMLElement | null;
  return a?.getAttribute("data-option") ?? a?.getAttribute("data-section") ?? a?.getAttribute("data-testid");
};
const key = async (k: string, shift = false) => {
  (document.activeElement ?? document).dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey: shift, bubbles: true, cancelable: true }));
  await flush();
};

async function open(path: string, { phone = false, cta = true } = {}) {
  window.matchMedia = ((q: string) => ({ matches: phone ? q.includes("max-width") : false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  wrapper = mount(SectionMenu, { props: { menu: menu(cta), currentPath: path }, attachTo: document.body });
  await flush();
  document.querySelector<HTMLElement>("[data-testid='section-menu-trigger']")!.click();
  await flush();
}

describe("QA9 gaps — Tab from a coming entry, at the edges", () => {
  // Spec: (c): a coming page first in its list; Shift+Tab goes back to its section.
  test("Shift+Tab from a coming first page goes to its section", async () => {
    await open("/services");
    sec("services").focus();
    await key("ArrowRight");
    expect(activeId()).toBe("s.first");
    await key("Tab", true);
    expect(activeId()).toBe("services");
  });

  // Spec: (c): Tab from a coming first page goes to the first usable page.
  test("Tab from a coming first page goes to the next usable page", async () => {
    await open("/services");
    sec("services").focus();
    await key("ArrowRight");
    await key("Tab");
    expect(activeId()).toBe("s.a");
  });

  // Spec: (c): two coming pages in a row; the arrows land on both, Tab skips the second.
  test("two coming pages in a row: arrows land on both, Tab and Shift+Tab go past them", async () => {
    await open("/services");
    opt("s.a").focus();
    await key("ArrowDown");
    expect(activeId()).toBe("s.c1");
    await key("ArrowDown");
    expect(activeId()).toBe("s.c2");
    await key("Tab", true);
    expect(activeId()).toBe("s.a");
    opt("s.c1").focus();
    await key("Tab");
    expect(activeId()).toBe("s.b");
  });

  // Spec: (c): a coming last page; Tab goes on to the first place.
  test("Tab from a coming last page goes to the first place", async () => {
    await open("/services");
    opt("s.b").focus();
    await key("ArrowDown");
    expect(activeId()).toBe("s.last");
    await key("Tab");
    expect(activeId()).toBe("shop");
  });

  // Spec: (c): Shift+Tab from a coming place goes to the place before it.
  test("Shift+Tab from a coming place goes to the place before it", async () => {
    await open("/services");
    opt("shop").focus();
    await key("ArrowDown");
    expect(activeId()).toBe("planned");
    await key("Tab", true);
    expect(activeId()).toBe("shop");
  });

  // Spec: (c) + README Tab order (places are followed by the next section): Tab from the coming last place.
  test("Tab from a coming last place goes to the next section", async () => {
    await open("/services");
    opt("shop").focus();
    await key("ArrowDown");
    await key("Tab");
    expect(activeId()).toBe("allsoon");
  });

  // Spec: (c): a section whose pages are all coming; Tab from them goes to the next section.
  test("every page coming: Tab goes to the next section, Shift+Tab back to the section", async () => {
    await open("/allsoon");
    sec("allsoon").focus();
    await key("ArrowRight");
    expect(activeId()).toBe("z.1");
    await key("Tab");
    expect(activeId()).toBe("blog");
    // Back to the section (focusing it previews it again), then onto the second coming page.
    sec("allsoon").focus();
    await flush();
    await key("ArrowRight");
    await key("ArrowDown");
    expect(activeId()).toBe("z.2");
    await key("Tab", true);
    expect(activeId()).toBe("allsoon");
  });

  // Spec: §3 focus trap: the last entry is a coming one and there is no call to action; Tab wraps to Close.
  test("Tab from a coming entry last in the whole order wraps to Close", async () => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    wrapper = mount(SectionMenu, { props: { currentPath: "/x", menu: { sections: [
      { id: "home", label: "Home", to: "/" },
      { id: "x", label: "X", to: "/x", links: [{ id: "x.a", label: "XA", to: "/x/a" }, { id: "x.soon", label: "Soon", to: "/x/s", coming: true }] },
    ] } }, attachTo: document.body });
    await flush();
    document.querySelector<HTMLElement>("[data-testid='section-menu-trigger']")!.click();
    await flush();
    opt("x.a").focus();
    await key("ArrowDown");
    expect(activeId()).toBe("x.soon");
    await key("Tab");
    expect(activeId()).toBe("section-menu-close");
  });

  // Spec: (c) at the phone width (one column): the same order.
  test("phone: Tab from a coming page goes to the next usable page", async () => {
    await open("/services", { phone: true });
    opt("s.a").focus();
    await key("ArrowDown");
    expect(activeId()).toBe("s.c1");
    await key("Tab");
    expect(activeId()).toBe("s.b");
  });

  // Spec: (c): a press on a coming entry does nothing; the menu stays open and focus stays put.
  test("Enter and Space on a coming entry do nothing", async () => {
    await open("/services");
    opt("s.c1").focus();
    await key("Enter");
    await key(" ");
    opt("s.c1").click();
    await flush();
    expect(document.querySelector("[data-testid='section-menu-panel']")!.getAttribute("data-open")).toBe("true");
    expect(activeId()).toBe("s.c1");
  });
});
