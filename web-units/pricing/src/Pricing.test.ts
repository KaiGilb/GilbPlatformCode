// Spec: handoff 00.Handoff-2026-10-19-ToAgentCoder-StarterModulesIntoWebsiteLibrary-GilbPlatformCode (one unit
// per block; content as props; tokens through CSS variables) and Rule_Code_accessibility (RuleA11yUnitTest,
// RuleA11yAltText, RuleA11ySemanticHtml, RuleA11yFormLabel). Behaviour is the starter's components/catalog/Pricing.vue at 80ad391.
import { afterEach, describe, expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, markRaw } from "vue";
import axe from "axe-core";
import Pricing from "./Pricing.vue";
import type { Plan } from "./types";

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; });
// Stand-ins for a host's router link (NuxtLink: takes `to`, never `href`) and image component (Nuxt Image).
const FakeLink = markRaw(defineComponent({ props: { to: String }, setup: (p, { slots }) => () => h("a", { href: `#route:${p.to}`, "data-fake-link": "" }, slots.default?.()) }));
const FakeImg = markRaw(defineComponent({ props: { src: String, alt: String, format: String }, setup: (p) => () => h("img", { src: `/_img/${p.format}${p.src}`, alt: p.alt, "data-fake-img": "" }) }));
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);
const PLANS: Plan[] = [
  { name: "Starter", price: "$0", period: "mo", features: ["1 site", "Domain-only cost"], ctaLabel: "Choose" },
  { name: "Growth", price: "$29", period: "mo", features: ["Everything in Starter"], ctaLabel: "Choose", ctaTo: "/buy/growth", featured: true },
  { name: "Custom", price: "Ask", features: [] },
];

describe("Pricing", () => {
  test("one column per plan with name, price and the period after a slash", () => {
    wrapper = mount(Pricing, { props: { plans: PLANS }, attachTo: document.body });
    const cols = document.querySelectorAll(".pr-plan");
    expect(cols).toHaveLength(3);
    expect(cols[0]!.querySelector("h3")!.textContent).toBe("Starter");
    expect(cols[0]!.querySelector(".pr-price")!.textContent).toBe("$0");
    expect(cols[0]!.querySelector(".pr-period")!.textContent).toBe("/mo");
    expect(cols[2]!.querySelector(".pr-period")).toBeNull();
  });
  test("each included item is a list item with a check hidden from screen readers", () => {
    wrapper = mount(Pricing, { props: { plans: PLANS }, attachTo: document.body });
    const items = document.querySelectorAll(".pr-plan")[0]!.querySelectorAll("li");
    expect([...items].map((li) => li.textContent!.trim())).toEqual(["✓1 site", "✓Domain-only cost"]);
    expect(items[0]!.querySelector(".pr-check")!.getAttribute("aria-hidden")).toBe("true");
  });
  test("only the featured plan is marked; the button goes to ctaTo or else /contact; no label, no button", () => {
    wrapper = mount(Pricing, { props: { plans: PLANS }, attachTo: document.body });
    const cols = document.querySelectorAll(".pr-plan");
    expect([...cols].map((c) => c.classList.contains("is-featured"))).toEqual([false, true, false]);
    expect(cols[0]!.querySelector("a.pr-cta")!.getAttribute("href")).toBe("/contact");
    expect(cols[1]!.querySelector("a.pr-cta")!.getAttribute("href")).toBe("/buy/growth");
    expect(cols[2]!.querySelector(".pr-cta")).toBeNull();
  });
  test("a host link component gets the route as `to`", () => {
    wrapper = mount(Pricing, { props: { plans: PLANS, linkComponent: FakeLink }, attachTo: document.body });
    expect([...document.querySelectorAll("[data-fake-link]")].map((a) => a.getAttribute("href"))).toEqual(["#route:/contact", "#route:/buy/growth"]);
  });
  // Spec: Rule_Code_accessibility RuleA11yUnitTest
  test("axe: no violations (jsdom; colour contrast not measurable here)", async () => {
    wrapper = mount(Pricing, { props: { heading: "Pricing", plans: PLANS }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
  });
});

// Spec: Agent.Tester R1 D3 — the unit's widths must not depend on the page's reset. Vitest does not apply
// the component's scoped style, so this reads the style itself; the browser measure is in the R1 report.
describe("Pricing box sizing", () => {
  test("every box of the unit sizes with border-box, so padding never widens it", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const style = readFileSync(join(process.cwd(), "src", "Pricing.vue"), "utf8").split("<style scoped>")[1] ?? "";
    expect(style).toContain(".pr, .pr * { box-sizing: border-box; }");
  });
});
