// Spec: handoff 00.Handoff-2026-10-19-ToAgentCoder-StarterModulesIntoWebsiteLibrary-GilbPlatformCode (one unit
// per block; content as props; tokens through CSS variables) and Rule_Code_accessibility (RuleA11yUnitTest,
// RuleA11yAltText, RuleA11ySemanticHtml, RuleA11yFormLabel). Behaviour is the starter's components/catalog/Testimonial.vue at 80ad391.
import { afterEach, describe, expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, markRaw } from "vue";
import axe from "axe-core";
import Testimonial from "./Testimonial.vue";

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; });
// Stand-ins for a host's router link (NuxtLink: takes `to`, never `href`) and image component (Nuxt Image).
const FakeLink = markRaw(defineComponent({ props: { to: String }, setup: (p, { slots }) => () => h("a", { href: `#route:${p.to}`, "data-fake-link": "" }, slots.default?.()) }));
const FakeImg = markRaw(defineComponent({ props: { src: String, alt: String, format: String }, setup: (p) => () => h("img", { src: `/_img/${p.format}${p.src}`, alt: p.alt, "data-fake-img": "" }) }));
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);
const props = { quote: "They had our site live in a week.", author: "Ana Silva" };

describe("Testimonial", () => {
  test("the quote is a blockquote between curly quotes, with the author's name", () => {
    wrapper = mount(Testimonial, { props, attachTo: document.body });
    expect(document.querySelector("blockquote")!.textContent!.trim()).toBe("“They had our site live in a week.”");
    expect(document.querySelector(".tm-author")!.textContent).toBe("Ana Silva");
    expect(document.querySelector(".tm-role")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
  });
  test("role and picture show when given; the picture is 40 x 40 with the author's name as alt", () => {
    wrapper = mount(Testimonial, { props: { ...props, role: "Founder", avatar: "/ana.jpg" }, attachTo: document.body });
    expect(document.querySelector(".tm-role")!.textContent).toBe("Founder");
    const img = document.querySelector("img")!;
    expect([img.getAttribute("src"), img.getAttribute("alt"), img.getAttribute("width"), img.getAttribute("height")]).toEqual(["/ana.jpg", "Ana Silva", "40", "40"]);
  });
  test("a host image component gets src, alt and the imageProps", () => {
    wrapper = mount(Testimonial, { props: { ...props, avatar: "/ana.jpg", imageComponent: FakeImg, imageProps: { format: "webp" } }, attachTo: document.body });
    expect(document.querySelector("[data-fake-img]")!.getAttribute("src")).toBe("/_img/webp/ana.jpg");
  });
  // Spec: Rule_Code_accessibility RuleA11yUnitTest
  test("axe: no violations (jsdom; colour contrast not measurable here)", async () => {
    wrapper = mount(Testimonial, { props: { ...props, role: "Founder", avatar: "/ana.jpg" }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
  });
});

// Spec: Agent.Tester R1 D3 — the unit's widths must not depend on the page's reset. Vitest does not apply
// the component's scoped style, so this reads the style itself; the browser measure is in the R1 report.
describe("Testimonial box sizing", () => {
  test("every box of the unit sizes with border-box, so padding never widens it", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const style = readFileSync(join(process.cwd(), "src", "Testimonial.vue"), "utf8").split("<style scoped>")[1] ?? "";
    expect(style).toContain(".tm, .tm * { box-sizing: border-box; }");
  });
});
