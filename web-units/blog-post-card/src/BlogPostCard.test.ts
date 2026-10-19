// Spec: handoff 00.Handoff-2026-10-19-ToAgentCoder-StarterModulesIntoWebsiteLibrary-GilbPlatformCode (one unit
// per block; content as props; tokens through CSS variables) and Rule_Code_accessibility (RuleA11yUnitTest,
// RuleA11yAltText, RuleA11ySemanticHtml, RuleA11yFormLabel). Behaviour is the starter's components/catalog/BlogPostCard.vue at 80ad391.
import { afterEach, describe, expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, markRaw } from "vue";
import axe from "axe-core";
import BlogPostCard from "./BlogPostCard.vue";

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; });
// Stand-ins for a host's router link (NuxtLink: takes `to`, never `href`) and image component (Nuxt Image).
const FakeLink = markRaw(defineComponent({ props: { to: String }, setup: (p, { slots }) => () => h("a", { href: `#route:${p.to}`, "data-fake-link": "" }, slots.default?.()) }));
const FakeImg = markRaw(defineComponent({ props: { src: String, alt: String, format: String }, setup: (p) => () => h("img", { src: `/_img/${p.format}${p.src}`, alt: p.alt, "data-fake-img": "" }) }));
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);
const base = { title: "A sample post", to: "/blog/hello-world" };

describe("BlogPostCard", () => {
  test("the whole card is one link to the post, with the title as an h3", () => {
    wrapper = mount(BlogPostCard, { props: base, attachTo: document.body });
    const a = document.querySelector("a.bpc")!;
    expect(a.getAttribute("href")).toBe("/blog/hello-world");
    expect(a.querySelector("h3")!.textContent).toBe("A sample post");
    expect(document.querySelector(".bpc-date")).toBeNull();
    expect(document.querySelector(".bpc-excerpt")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
  });
  test("the date is written by toLocaleDateString by default, or by formatDate", () => {
    wrapper = mount(BlogPostCard, { props: { ...base, date: "2026-05-28" }, attachTo: document.body });
    expect(document.querySelector(".bpc-date")!.textContent).toBe(new Date("2026-05-28").toLocaleDateString());
    wrapper.unmount();
    wrapper = mount(BlogPostCard, { props: { ...base, date: "2026-05-28", formatDate: (d: string) => `on ${d}` }, attachTo: document.body });
    expect(document.querySelector(".bpc-date")!.textContent).toBe("on 2026-05-28");
  });
  test("the cover loads lazily with the title as alt; a host image component gets the imageProps", () => {
    wrapper = mount(BlogPostCard, { props: { ...base, image: "/cover.jpg", excerpt: "Short." }, attachTo: document.body });
    const img = document.querySelector("img")!;
    expect([img.getAttribute("src"), img.getAttribute("alt"), img.getAttribute("loading")]).toEqual(["/cover.jpg", "A sample post", "lazy"]);
    expect(document.querySelector(".bpc-excerpt")!.textContent).toBe("Short.");
    wrapper.unmount();
    wrapper = mount(BlogPostCard, { props: { ...base, image: "/cover.jpg", imageComponent: FakeImg, imageProps: { format: "webp" } }, attachTo: document.body });
    expect(document.querySelector("[data-fake-img]")!.getAttribute("src")).toBe("/_img/webp/cover.jpg");
  });
  test("a host link component gets the route as `to`", () => {
    wrapper = mount(BlogPostCard, { props: { ...base, linkComponent: FakeLink }, attachTo: document.body });
    expect(document.querySelector("[data-fake-link]")!.getAttribute("href")).toBe("#route:/blog/hello-world");
  });
  // Spec: Rule_Code_accessibility RuleA11yUnitTest
  test("axe: no violations with every part drawn (jsdom; colour contrast not measurable here)", async () => {
    wrapper = mount(BlogPostCard, { props: { ...base, date: "2026-05-28", excerpt: "Short.", image: "/c.jpg" }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
  });
});

// Spec: Agent.Tester R1 D3 — the unit's widths must not depend on the page's reset. Vitest does not apply
// the component's scoped style, so this reads the style itself; the browser measure is in the R1 report.
describe("BlogPostCard box sizing", () => {
  test("every box of the unit sizes with border-box, so padding never widens it", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const style = readFileSync(join(process.cwd(), "src", "BlogPostCard.vue"), "utf8").split("<style scoped>")[1] ?? "";
    expect(style).toContain(".bpc, .bpc * { box-sizing: border-box; }");
  });
});
