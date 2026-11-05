// Tests written new for this unit. The source band is components/PageShell.vue
// at a01a155af3b9550b5f5d2f8b5d9d69fd3675a486. jsdom does not apply the scoped style, so the
// measured sizes are asserted against the component source.
import { afterEach, describe, expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import TitledSection from "./TitledSection.vue";

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; });

const SFC = readFileSync(join(process.cwd(), "src", "TitledSection.vue"), "utf8");
const style = SFC.split("<style scoped>")[1] ?? "";

describe("TitledSection", () => {
  test("default renders a section, an h2 of the title, labelled by that heading, no ornament, and a hidden rule", () => {
    wrapper = mount(TitledSection, { props: { title: "About" }, attachTo: document.body });
    const section = document.querySelector("section")!;
    const heading = section.querySelector("h2")!;
    expect(heading.textContent).toBe("About");
    expect(section.querySelector("h1")).toBeNull();
    expect(heading.id).not.toBe("");
    expect(section.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(section.querySelector("img")).toBeNull();
    const rule = section.querySelector(".ts-rule")!;
    expect(rule.tagName).toBe("DIV");
    expect(rule.getAttribute("aria-hidden")).toBe("true");
    expect(section.querySelector("hr")).toBeNull();
    expect(section.className).toBe("ts");
  });

  test.each(["h1", "h3"] as const)("headingLevel %s is the heading element", (level) => {
    wrapper = mount(TitledSection, { props: { title: "Team", headingLevel: level }, attachTo: document.body });
    expect(document.querySelector(level)!.textContent).toBe("Team");
    expect(document.querySelectorAll("h1, h2, h3")).toHaveLength(1);
    wrapper.unmount();
    wrapper = undefined;
  });

  test("ornamentSrc draws a decorative image at 25 by 29", () => {
    wrapper = mount(TitledSection, { props: { title: "About", ornamentSrc: "/icon-mark.svg" }, attachTo: document.body });
    const img = document.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/icon-mark.svg");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
    expect(img.getAttribute("width")).toBe("25");
    expect(img.getAttribute("height")).toBe("29");
    expect(img.getAttribute("style") ?? "").toMatch(/--_ow:\s*25px/);
  });

  test("no default slot renders no body wrapper; a slot renders one around the content", () => {
    wrapper = mount(TitledSection, { props: { title: "About" }, attachTo: document.body });
    const inner = document.querySelector(".ts-inner")!;
    expect(inner.querySelector(".ts-body")).toBeNull();
    expect(inner.children).toHaveLength(1);
    wrapper.unmount();
    wrapper = mount(TitledSection, {
      props: { title: "About" },
      slots: { default: () => h("p", "Body copy") },
      attachTo: document.body,
    });
    const filled = document.querySelector(".ts-inner")!;
    expect(filled.children).toHaveLength(2);
    const body = filled.querySelector(".ts-body")!;
    expect(body.querySelector("p")!.textContent).toBe("Body copy");
  });

  test("tone alt, padding sm and align start add ts--alt, ts--sm and ts--start", () => {
    wrapper = mount(TitledSection, {
      props: { title: "Contact", tone: "alt", padding: "sm", align: "start" },
      attachTo: document.body,
    });
    expect(document.querySelector("section")!.className).toBe("ts ts--alt ts--sm ts--start");
  });

  test("rule false draws no rule", () => {
    wrapper = mount(TitledSection, { props: { title: "About", rule: false }, attachTo: document.body });
    expect(document.querySelector(".ts-rule")).toBeNull();
    expect(document.querySelector("hr")).toBeNull();
  });

  test('id "about" is the section id and the heading id is about-title', () => {
    wrapper = mount(TitledSection, { props: { title: "About", id: "about" }, attachTo: document.body });
    const section = document.querySelector("section")!;
    expect(section.id).toBe("about");
    expect(section.querySelector("h2")!.id).toBe("about-title");
    expect(section.getAttribute("aria-labelledby")).toBe("about-title");
  });

  test("two bands without id get different heading ids", () => {
    const Pair = defineComponent({
      components: { TitledSection },
      setup: () => () => h("div", [h(TitledSection, { title: "One" }), h(TitledSection, { title: "Two" })]),
    });
    wrapper = mount(Pair, { attachTo: document.body });
    const headings = [...document.querySelectorAll("h2")];
    const sections = [...document.querySelectorAll("section")];
    expect(headings).toHaveLength(2);
    expect(headings[0]!.id).not.toBe("");
    expect(headings[1]!.id).not.toBe("");
    expect(headings[0]!.id).not.toBe(headings[1]!.id);
    expect(sections[0]!.hasAttribute("id")).toBe(false);
    expect(sections[1]!.hasAttribute("id")).toBe(false);
    expect(sections[0]!.getAttribute("aria-labelledby")).toBe(headings[0]!.id);
    expect(sections[1]!.getAttribute("aria-labelledby")).toBe(headings[1]!.id);
  });

  test("maxWidth is the inner element's --_max", () => {
    wrapper = mount(TitledSection, { props: { title: "About", maxWidth: "900px" }, attachTo: document.body });
    expect(document.querySelector(".ts-inner")!.getAttribute("style") ?? "").toMatch(/--_max:\s*900px/);
  });

  test("axe: no violations, with an ornament and slot content", async () => {
    wrapper = mount(TitledSection, {
      props: { title: "About", id: "about", ornamentSrc: "/icon-mark.svg" },
      slots: { default: () => h("p", "A paragraph of body copy.") },
      attachTo: document.body,
    });
    const violations = (await axe.run(document.body)).violations.map((v: { id: string }) => v.id);
    expect(violations).toEqual([]);
  });
});

describe("TitledSection measured styles", () => {
  test("the source numbers are the defaults, with no mobile heading step-down and no Tailwind", () => {
    expect(SFC).toContain('headingLevel: "h2"');
    expect(SFC).toContain('ornamentSrc: ""');
    expect(SFC).toContain("ornamentWidth: 25");
    expect(SFC).toContain("ornamentHeight: 29");
    expect(SFC).toContain('maxWidth: "1140px"');
    expect(SFC).not.toMatch(/@apply|@tailwind|theme\(/);
    expect(style).toContain("padding-inline: 1rem");
    expect(style).toContain("padding-block: 50px");
    expect(style).toContain("padding-block: 100px");
    expect(style).toContain("padding-block: 70px");
    expect(style).toContain("@media (min-width: 768px)");
    expect(style).toContain("var(--site-block-bg, transparent)");
    expect(style).toContain("var(--site-block-surface-alt, #e5e5e5)");
    expect(style).toContain("max-width: var(--_max, 1140px)");
    expect(style).toContain("margin: 0 auto 6px");
    expect(style).toContain("margin: 0 0 6px");
    expect(style).toContain("width: var(--_ow, 25px)");
    expect(style).toContain("height: auto");
    expect(style).toContain("font-size: var(--site-block-section-title-size, 39px)");
    expect(style).toContain("line-height: 1.3");
    expect(style).toContain("font-family: var(--site-block-display-font, inherit)");
    expect(style).toContain("font-weight: var(--site-block-section-title-weight, 400)");
    expect(style).toContain("var(--site-block-fg, #1a1a1a)");
    expect(style).toContain("width: 100px");
    expect(style).toContain("height: 3px");
    expect(style).toContain("margin: 1.25rem auto 0");
    expect(style).toContain("margin: 1.25rem 0 0");
    expect(style).toContain("var(--site-block-accent, #2563eb)");
    expect(style).toContain("margin-top: 3rem");
    expect(style).toContain("box-sizing: border-box");
    expect(style.match(/font-size:/g)).toHaveLength(1);
    const medias = [...style.matchAll(/@media[^{]*\{([\s\S]*?)\n\}/g)].map((m) => m[1] ?? "");
    expect(medias.join("\n")).not.toContain("font-size");
  });

  test("the rule's fallback is the neutral accent, not a source brand colour", () => {
    const stripped = style.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(stripped).toContain("var(--site-block-accent, #2563eb)");
    expect(stripped).not.toContain("#" + "0c447c");
  });
});
