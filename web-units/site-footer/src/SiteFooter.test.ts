// Tests written new for this unit. The gilb-web and mynet-web footers had none.
import { afterEach, describe, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, markRaw } from "vue";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import SiteFooter from "./SiteFooter.vue";

let wrapper: VueWrapper | undefined;
afterEach(() => {
  vi.useRealTimers();
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
});

// A host route link (NuxtLink): it takes `to` and never `href`.
const FakeLink = markRaw(defineComponent({
  name: "FakeLink",
  props: { to: { type: String, required: true } },
  setup: (p, { slots }) => () => h("a", { "data-fake-link": "", "data-to": p.to }, slots.default?.()),
}));

const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);

const LINKS = [
  { label: "About", href: "/about" },
  { label: "Privacy", href: "/privacy" },
  { label: "News", href: "/news" },
];

describe("SiteFooter", () => {
  test("renders the brand name and the tagline, and no tagline paragraph when the tagline is empty", () => {
    wrapper = mount(SiteFooter, { props: { brandName: "Acme", tagline: "We make things." }, attachTo: document.body });
    expect(document.querySelector(".sf-name")!.textContent).toBe("Acme");
    expect(document.querySelector(".sf-tagline")!.textContent).toBe("We make things.");
    expect(document.querySelector(".sf-tagline")!.tagName).toBe("P");
    wrapper.unmount();
    wrapper = mount(SiteFooter, { props: { brandName: "Acme", tagline: "" }, attachTo: document.body });
    expect(document.querySelector(".sf-name")!.textContent).toBe("Acme");
    expect(document.querySelector(".sf-tagline")).toBeNull();
    expect(document.querySelectorAll(".sf-brand p")).toHaveLength(1);
  });

  test("draws no nav when links is empty", () => {
    wrapper = mount(SiteFooter, { props: { brandName: "Acme" }, attachTo: document.body });
    expect(document.querySelector("nav")).toBeNull();
    expect(document.querySelector("[data-site-footer]")!.tagName).toBe("FOOTER");
  });

  test("three links, in order, inside a nav named Footer", () => {
    wrapper = mount(SiteFooter, { props: { brandName: "Acme", links: LINKS }, attachTo: document.body });
    const nav = document.querySelector("nav")!;
    expect(nav.getAttribute("aria-label")).toBe("Footer");
    const anchors = [...nav.querySelectorAll("a")];
    expect(anchors).toHaveLength(3);
    expect(anchors.map((a) => a.textContent)).toEqual(["About", "Privacy", "News"]);
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual(["/about", "/privacy", "/news"]);
    expect([...nav.querySelectorAll("li")].map((li) => li.querySelector("a"))).toEqual(anchors);
  });

  test("a footer with exactly one link still draws the nav", () => {
    wrapper = mount(SiteFooter, { props: { brandName: "Acme", links: [LINKS[0]!] }, attachTo: document.body });
    const nav = document.querySelector("nav");
    expect(nav).not.toBeNull();
    expect(nav!.querySelectorAll("a")).toHaveLength(1);
    wrapper.unmount();
    wrapper = mount(SiteFooter, { props: { brandName: "Acme", links: [] }, attachTo: document.body });
    expect(document.querySelector("nav")).toBeNull();
  });

  test("a custom navLabel is the nav's name", () => {
    wrapper = mount(SiteFooter, { props: { brandName: "Acme", links: LINKS, navLabel: "Company" }, attachTo: document.body });
    expect(document.querySelector("nav")!.getAttribute("aria-label")).toBe("Company");
  });

  test("the brand slot replaces the brand-name paragraph", () => {
    wrapper = mount(SiteFooter, {
      props: { brandName: "Acme", tagline: "We make things.", year: 2031 },
      slots: { brand: '<span class="lockup">Logo lockup</span>' },
      attachTo: document.body,
    });
    expect(document.querySelector(".sf-name")).toBeNull();
    expect(document.querySelector(".sf-brand")!.textContent).toContain("Logo lockup");
    expect(document.querySelector(".sf-brand")!.textContent).not.toContain("Acme");
    expect(document.querySelector(".sf-tagline")!.textContent).toBe("We make things.");
    expect(document.querySelector(".sf-copy")!.textContent).toBe("© 2031 Acme.");
  });

  test("the default year is the current year", () => {
    vi.setSystemTime(new Date("2031-06-01"));
    wrapper = mount(SiteFooter, { props: { brandName: "Acme" }, attachTo: document.body });
    expect(document.querySelector(".sf-copy")!.textContent).toBe("© 2031 Acme.");
  });

  test("endLink has no target", () => {
    wrapper = mount(SiteFooter, {
      props: { brandName: "Acme", endLink: { label: "Built on Gilb", href: "https://example.test/platform" } },
      attachTo: document.body,
    });
    expect(document.querySelector(".sf-end")!.hasAttribute("target")).toBe(false);
  });

  test("the copyright line uses the year and the brand, and copyrightName overrides the name", () => {
    wrapper = mount(SiteFooter, { props: { brandName: "Acme", year: 2031 }, attachTo: document.body });
    expect(document.querySelector(".sf-copy")!.textContent).toBe("© 2031 Acme.");
    wrapper.unmount();
    wrapper = mount(SiteFooter, { props: { brandName: "Acme", year: 2031, copyrightName: "Acme Incorporated" }, attachTo: document.body });
    expect(document.querySelector(".sf-copy")!.textContent).toBe("© 2031 Acme Incorporated.");
    expect(document.querySelector(".sf-name")!.textContent).toBe("Acme");
  });

  test("endLink is the right-hand link, and it is absent when null", () => {
    wrapper = mount(SiteFooter, {
      props: { brandName: "Acme", year: 2031, endLink: { label: "Built on Gilb", href: "https://example.test/platform" } },
      attachTo: document.body,
    });
    const end = document.querySelector(".sf-end")!;
    expect(end.tagName).toBe("A");
    expect(end.textContent).toBe("Built on Gilb");
    expect(end.getAttribute("href")).toBe("https://example.test/platform");
    expect(end.parentElement!.classList.contains("sf-bottom-inner")).toBe(true);
    wrapper.unmount();
    wrapper = mount(SiteFooter, { props: { brandName: "Acme", endLink: null }, attachTo: document.body });
    expect(document.querySelector(".sf-end")).toBeNull();
  });

  test("linkComponent receives `to` for internal links; an external link stays an anchor with rel=noopener", () => {
    wrapper = mount(SiteFooter, {
      props: {
        brandName: "Acme",
        linkComponent: FakeLink,
        links: [
          { label: "About", href: "/about" },
          { label: "Privacy", href: "/privacy" },
          { label: "Docs", href: "https://example.test/docs", external: true },
        ],
      },
      attachTo: document.body,
    });
    const internals = wrapper.findAllComponents(FakeLink);
    expect(internals.map((c) => c.props("to"))).toEqual(["/about", "/privacy"]);
    for (const c of internals) {
      expect(c.props()).not.toHaveProperty("href");
      expect(c.attributes("href")).toBeUndefined();
      expect(c.element.getAttribute("href")).toBeNull();
    }
    const ext = document.querySelector("nav a:not([data-fake-link])")!;
    expect(ext.tagName).toBe("A");
    expect(ext.textContent).toBe("Docs");
    expect(ext.getAttribute("href")).toBe("https://example.test/docs");
    expect(ext.getAttribute("rel")).toBe("noopener");
    expect(ext.hasAttribute("target")).toBe(false);
  });

  test("maxWidth is the inner width, set once on the footer", () => {
    wrapper = mount(SiteFooter, { props: { brandName: "Acme" }, attachTo: document.body });
    expect(document.querySelector("footer")!.style.getPropertyValue("--_max")).toBe("1400px");
    wrapper.unmount();
    wrapper = mount(SiteFooter, { props: { brandName: "Acme", maxWidth: "72rem" }, attachTo: document.body });
    expect(document.querySelector("footer")!.style.getPropertyValue("--_max")).toBe("72rem");
  });

  test("axe: no violations on a full footer (jsdom; colour contrast is not measurable here)", async () => {
    wrapper = mount(SiteFooter, {
      props: {
        brandName: "Acme",
        tagline: "We make things.",
        links: [
          { label: "About", href: "/about" },
          { label: "Privacy", href: "/privacy" },
          { label: "Docs", href: "https://example.test/docs", external: true },
        ],
        navLabel: "Footer",
        copyrightName: "Acme Incorporated",
        year: 2031,
        endLink: { label: "Built on Gilb", href: "https://example.test/platform" },
        maxWidth: "1400px",
      },
      attachTo: document.body,
    });
    expect(await axeIds()).toEqual([]);
  });
});

describe("the unit's style", () => {
  const SFC = readFileSync(join(process.cwd(), "src", "SiteFooter.vue"), "utf8");
  const style = (SFC.split("<style scoped>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");

  function ruleBodies(source: string, selector: string): string[] {
    const bodies: string[] = [];
    for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectorText = match[1];
      const body = match[2];
      if (selectorText === undefined || body === undefined) continue;
      const selectors = selectorText.split(",").map((s) => s.trim());
      if (selectors.includes(selector)) bodies.push(body);
    }
    return bodies;
  }

  test("footer links are inline-flex", () => {
    expect(ruleBodies(style, ".sf-link").some((body) => /display:\s*inline-flex/.test(body))).toBe(true);
  });

  test("footer links are at least 44px", () => {
    expect(ruleBodies(style, ".sf-link").some((body) => /min-height:\s*44px/.test(body))).toBe(true);
  });

  test("the tagline is at most 48ch", () => {
    expect(ruleBodies(style, ".sf-tagline").some((body) => /max-width:\s*48ch/.test(body))).toBe(true);
  });

  test("the top band is two columns from 768px", () => {
    const media = style.match(/@media \(min-width:\s*768px\)\s*\{([\s\S]*?)\n\}/);
    const inner = media?.[1] ?? "";
    expect(ruleBodies(inner, ".sf-top").some((body) => /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*1fr\)/.test(body))).toBe(true);
  });

  test("footer links have a focus-visible outline", () => {
    expect(ruleBodies(style, ".sf-link:focus-visible").some((body) => /outline\s*:/.test(body))).toBe(true);
  });

  test("the bottom row is spaced apart", () => {
    expect(ruleBodies(style, ".sf-bottom-inner").some((body) => /justify-content:\s*space-between/.test(body))).toBe(true);
  });

  test("the right-hand link is 0.75rem on a 1rem line (mynet-web's text-xs), still 44px tall", () => {
    const withSize = ruleBodies(style, ".sf-end").filter((body) => /font-size:/.test(body));
    // The last rule that sets it wins, so it is the last one that must say 0.75rem.
    expect(withSize[withSize.length - 1]).toMatch(/font-size:\s*0\.75rem;\s*line-height:\s*1rem/);
    expect(ruleBodies(style, ".sf-end").some((body) => /min-height:\s*44px/.test(body))).toBe(true);
  });

  test("the bottom band's padding is 1.5rem (gilb-web's py-6)", () => {
    expect(ruleBodies(style, ".sf-bottom-inner").some((body) => /padding:\s*1\.5rem 1rem/.test(body))).toBe(true);
  });

  test("the top band's padding is 3.5rem", () => {
    expect(ruleBodies(style, ".sf-top").some((body) => /padding:\s*3\.5rem\b/.test(body))).toBe(true);
  });

  test("every colour literal sits inside a var(--site-block-*, ...) fallback", () => {
    const bad = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|gray|grey)\b(?!-)/g)]
      .filter((m) => !/var\(--site-block-[a-z-]+,\s*$/.test(style.slice(Math.max(0, m.index! - 80), m.index)))
      .map((m) => style.slice(Math.max(0, m.index! - 40), m.index! + 10).replace(/\s+/g, " "));
    expect(bad).toEqual([]);
  });

  test("every box sizes with border-box, so padding never widens it", () => {
    expect(style).toContain(".sf, .sf * { box-sizing: border-box; }");
  });

  test("the colour transition is only where reduced motion is not requested", () => {
    const inside = style.match(/@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/);
    expect(inside?.[1]).toContain("transition: color var(--site-block-motion, 150ms)");
    const outside = style.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g, "");
    expect(outside).not.toMatch(/transition\s*:/);
  });

  test("the unit names no Tailwind class, no i18n and imports nothing but vue and its own files", () => {
    expect(SFC).not.toMatch(/class="[^"]*\b(?:text|bg|border|rounded|px|py|mt|mb|flex|grid)-/);
    expect(SFC).not.toMatch(/useI18n|useAppConfig|@apply|theme\(/);
    const imports = [...SFC.matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]);
    expect(imports.every((i) => i === "vue" || i!.startsWith("./"))).toBe(true);
  });
});
