// Spec: handoff 00.Handoff-2026-10-19-ToAgentCoder-StarterModulesIntoWebsiteLibrary-GilbPlatformCode (one unit
// per block; content as props; tokens through CSS variables) and Rule_Code_accessibility (RuleA11yUnitTest,
// RuleA11yAltText, RuleA11ySemanticHtml, RuleA11yFormLabel). Behaviour is the starter's components/catalog/ImageGallery.vue at 80ad391.
import { afterEach, describe, expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, markRaw } from "vue";
import axe from "axe-core";
import ImageGallery from "./ImageGallery.vue";

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; });
// Stand-ins for a host's router link (NuxtLink: takes `to`, never `href`) and image component (Nuxt Image).
const FakeLink = markRaw(defineComponent({ props: { to: String }, setup: (p, { slots }) => () => h("a", { href: `#route:${p.to}`, "data-fake-link": "" }, slots.default?.()) }));
const FakeImg = markRaw(defineComponent({ props: { src: String, alt: String, format: String }, setup: (p) => () => h("img", { src: `/_img/${p.format}${p.src}`, alt: p.alt, "data-fake-img": "" }) }));
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);
const IMAGES = [{ src: "/a.jpg", alt: "The kitchen" }, { src: "/b.jpg", alt: "The hall" }];

describe("ImageGallery", () => {
  test("one lazy picture per image, in order, each with its own alt", () => {
    wrapper = mount(ImageGallery, { props: { images: IMAGES }, attachTo: document.body });
    const imgs = [...document.querySelectorAll("img")];
    expect(imgs.map((i) => [i.getAttribute("src"), i.getAttribute("alt"), i.getAttribute("loading")])).toEqual([["/a.jpg", "The kitchen", "lazy"], ["/b.jpg", "The hall", "lazy"]]);
  });
  test("the heading is an h2, drawn only when given", () => {
    wrapper = mount(ImageGallery, { props: { images: IMAGES }, attachTo: document.body });
    expect(document.querySelector("h2")).toBeNull();
    wrapper.unmount();
    wrapper = mount(ImageGallery, { props: { heading: "Our work", images: IMAGES }, attachTo: document.body });
    expect(document.querySelector("h2")!.textContent).toBe("Our work");
  });
  test("a host image component gets src, alt and the imageProps for every picture", () => {
    wrapper = mount(ImageGallery, { props: { images: IMAGES, imageComponent: FakeImg, imageProps: { format: "webp" } }, attachTo: document.body });
    expect([...document.querySelectorAll("[data-fake-img]")].map((i) => i.getAttribute("src"))).toEqual(["/_img/webp/a.jpg", "/_img/webp/b.jpg"]);
  });
  // Spec: Rule_Code_accessibility RuleA11yUnitTest
  test("axe: no violations (jsdom; colour contrast not measurable here)", async () => {
    wrapper = mount(ImageGallery, { props: { heading: "Our work", images: IMAGES }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
  });
});

// Spec: Agent.Tester R1 D3 — the unit's widths must not depend on the page's reset. Vitest does not apply
// the component's scoped style, so this reads the style itself; the browser measure is in the R1 report.
describe("ImageGallery box sizing", () => {
  test("every box of the unit sizes with border-box, so padding never widens it", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const style = readFileSync(join(process.cwd(), "src", "ImageGallery.vue"), "utf8").split("<style scoped>")[1] ?? "";
    expect(style).toContain(".ig, .ig * { box-sizing: border-box; }");
  });
});
