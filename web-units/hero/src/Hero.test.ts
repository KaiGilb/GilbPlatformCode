// Spec: handoff 00.Handoff-2026-10-19-ToAgentCoder-StarterModulesIntoWebsiteLibrary-GilbPlatformCode (one unit
// per block; content as props; tokens through CSS variables) and Rule_Code_accessibility (RuleA11yUnitTest,
// RuleA11yAltText, RuleA11ySemanticHtml). Behaviour is the starter's components/catalog/Hero.vue at 80ad391.
import { afterEach, describe, expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, markRaw } from "vue";
import { renderToString } from "vue/server-renderer";
import { createSSRApp } from "vue";
import axe from "axe-core";
import Hero from "./Hero.vue";

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; });
const mountHero = (props: Record<string, unknown>) => (wrapper = mount(Hero, { props: { title: "Leaks fixed today", ...props }, attachTo: document.body }));

// A stand-in for a router link (NuxtLink): it takes `to`, never `href`.
const FakeLink = markRaw(defineComponent({ props: { to: String }, setup: (p, { slots }) => () => h("a", { href: `#route:${p.to}`, "data-fake-link": "" }, slots.default?.()) }));
const FakeImg = markRaw(defineComponent({ props: { src: String, alt: String, format: String }, setup: (p) => () => h("img", { src: `/_img/${p.format}${p.src}`, alt: p.alt, "data-fake-img": "" }) }));

describe("Hero", () => {
  describe("content", () => {
    test("draws the title as the page's one h1, and the line only when given", () => {
      mountHero({});
      expect(document.querySelectorAll("h1")).toHaveLength(1);
      expect(document.querySelector("h1")!.textContent).toBe("Leaks fixed today");
      expect(document.querySelector(".hero-subtitle")).toBeNull();
      wrapper!.unmount();
      mountHero({ subtitle: "Same day, all of Oslo." });
      expect(document.querySelector(".hero-subtitle")!.textContent).toBe("Same day, all of Oslo.");
    });
    test("draws the button only with ctaLabel; it goes to /contact unless ctaTo says otherwise", () => {
      mountHero({});
      expect(document.querySelector(".hero-cta")).toBeNull();
      wrapper!.unmount();
      mountHero({ ctaLabel: "Book a visit" });
      expect(document.querySelector<HTMLAnchorElement>("a.hero-cta")!.getAttribute("href")).toBe("/contact");
      wrapper!.unmount();
      mountHero({ ctaLabel: "Book a visit", ctaTo: "/book" });
      expect(document.querySelector("a.hero-cta")!.getAttribute("href")).toBe("/book");
    });
    test("a host link component gets the route as `to`", () => {
      mountHero({ ctaLabel: "Book", ctaTo: "/book", linkComponent: FakeLink });
      expect(document.querySelector("[data-fake-link]")!.getAttribute("href")).toBe("#route:/book");
    });
  });

  describe("picture", () => {
    test("no picture: the text is centred and spans both columns", () => {
      mountHero({});
      expect(document.querySelector(".hero-inner")!.classList.contains("has-image")).toBe(false);
      expect(document.querySelector("img")).toBeNull();
    });
    test("a picture loads eagerly, its alt is imageAlt or else the title", () => {
      mountHero({ image: "/van.jpg" });
      const img = document.querySelector("img")!;
      expect(img.getAttribute("src")).toBe("/van.jpg");
      expect(img.getAttribute("alt")).toBe("Leaks fixed today");
      expect(img.getAttribute("loading")).toBe("eager");
      expect(document.querySelector(".hero-inner")!.classList.contains("has-image")).toBe(true);
      wrapper!.unmount();
      mountHero({ image: "/van.jpg", imageAlt: "Our van" });
      expect(document.querySelector("img")!.getAttribute("alt")).toBe("Our van");
    });
    test("a host image component gets src, alt and the imageProps", () => {
      mountHero({ image: "/van.jpg", imageComponent: FakeImg, imageProps: { format: "webp" } });
      expect(document.querySelector("[data-fake-img]")!.getAttribute("src")).toBe("/_img/webp/van.jpg");
    });
  });

  test("renders on the server with no browser (static site generation)", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(Hero, { title: "T", ctaLabel: "Go" }) }));
    expect(html).toContain("<h1");
    expect(html).toContain('href="/contact"');
  });

  // Spec: Rule_Code_accessibility RuleA11yUnitTest — every component test file has an axe check.
  test("axe: no violations with every part drawn (jsdom; colour contrast not measurable here)", async () => {
    mountHero({ subtitle: "Line", ctaLabel: "Go", image: "/a.jpg", imageAlt: "A van" });
    const r = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(r.violations.map((v: { id: string }) => v.id)).toEqual([]);
  });
});

// Spec: Agent.Tester R1 D3 — the unit's widths must not depend on the page's reset. Vitest does not apply
// the component's scoped style, so this reads the style itself; the browser measure is in the R1 report.
describe("Hero box sizing", () => {
  test("every box of the unit sizes with border-box, so padding never widens it", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const style = readFileSync(join(process.cwd(), "src", "Hero.vue"), "utf8").split("<style scoped>")[1] ?? "";
    expect(style).toContain(".hero, .hero * { box-sizing: border-box; }");
  });
});
