// Spec: handoff 00.Handoff-2026-10-19-ToAgentCoder-StarterModulesIntoWebsiteLibrary-GilbPlatformCode (one unit
// per block; content as props; tokens through CSS variables) and Rule_Code_accessibility (RuleA11yUnitTest,
// RuleA11yAltText, RuleA11ySemanticHtml, RuleA11yFormLabel). Behaviour is the starter's components/catalog/CTASection.vue at 80ad391, with one deliberate change: the line
// under the heading is the full on-accent colour (RuleA11yContrast), not white at 85 %.
import { afterEach, describe, expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, markRaw } from "vue";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import CtaSection from "./CtaSection.vue";

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; });
// Stand-ins for a host's router link (NuxtLink: takes `to`, never `href`) and image component (Nuxt Image).
const FakeLink = markRaw(defineComponent({ props: { to: String }, setup: (p, { slots }) => () => h("a", { href: `#route:${p.to}`, "data-fake-link": "" }, slots.default?.()) }));
const FakeImg = markRaw(defineComponent({ props: { src: String, alt: String, format: String }, setup: (p) => () => h("img", { src: `/_img/${p.format}${p.src}`, alt: p.alt, "data-fake-img": "" }) }));
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);
// sRGB contrast (WCAG 2.1)
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x! + 0.05) / (y! + 0.05); };
const mix = (a: string, b: string, pa: number) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * pa + parseInt(b.slice(i, i + 2), 16) * (1 - pa)).toString(16).padStart(2, "0")).join("");
// Vitest runs from the unit's folder (jsdom gives import.meta.url no file scheme).
const SFC = readFileSync(join(process.cwd(), "src", "CtaSection.vue"), "utf8");

describe("CtaSection", () => {
  test("heading h2, the line only when given, and one link that goes to /contact unless ctaTo says otherwise", () => {
    wrapper = mount(CtaSection, { props: { title: "Ready?", ctaLabel: "Get started" }, attachTo: document.body });
    expect(document.querySelector("h2")!.textContent).toBe("Ready?");
    expect(document.querySelector(".cta-subtitle")).toBeNull();
    expect(document.querySelectorAll("a")).toHaveLength(1);
    expect(document.querySelector("a")!.getAttribute("href")).toBe("/contact");
    wrapper.unmount();
    wrapper = mount(CtaSection, { props: { title: "Ready?", subtitle: "One line.", ctaLabel: "Go", ctaTo: "/start" }, attachTo: document.body });
    expect(document.querySelector(".cta-subtitle")!.textContent).toBe("One line.");
    expect(document.querySelector("a")!.getAttribute("href")).toBe("/start");
  });
  test("a host link component gets the route as `to`", () => {
    wrapper = mount(CtaSection, { props: { title: "T", ctaLabel: "Go", ctaTo: "/start", linkComponent: FakeLink }, attachTo: document.body });
    expect(document.querySelector("[data-fake-link]")!.getAttribute("href")).toBe("#route:/start");
  });
  // Spec: RuleA11yContrast — normal text at least 4.5:1. The starter's white/85 line was 4.2:1 on #2563eb.
  test("the line is drawn in the on-accent colour itself, which clears 4.5:1 on the default accent", () => {
    expect(SFC).toMatch(/\.cta-subtitle \{[^}]*color: var\(--site-block-on-accent-soft, var\(--site-block-on-accent, #ffffff\)\)/);
    expect(ratio("#ffffff", "#2563eb")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(mix("#ffffff", "#2563eb", 0.85), "#2563eb")).toBeLessThan(4.5);
  });
  // Spec: Rule_Code_accessibility RuleA11yUnitTest
  test("axe: no violations (jsdom; colour contrast not measurable here)", async () => {
    wrapper = mount(CtaSection, { props: { title: "Ready?", subtitle: "One line.", ctaLabel: "Go" }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
  });
});

// Spec: Agent.Tester R1 D3 — the unit's widths must not depend on the page's reset. Vitest does not apply
// the component's scoped style, so this reads the style itself; the browser measure is in the R1 report.
describe("CtaSection box sizing", () => {
  test("every box of the unit sizes with border-box, so padding never widens it", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const style = readFileSync(join(process.cwd(), "src", "CtaSection.vue"), "utf8").split("<style scoped>")[1] ?? "";
    expect(style).toContain(".cta, .cta * { box-sizing: border-box; }");
  });
});
