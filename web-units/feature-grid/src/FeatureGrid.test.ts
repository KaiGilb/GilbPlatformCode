// Spec: handoff 00.Handoff-2026-10-19-ToAgentCoder-StarterModulesIntoWebsiteLibrary-GilbPlatformCode (one unit
// per block; content as props; tokens through CSS variables) and Rule_Code_accessibility (RuleA11yUnitTest,
// RuleA11yAltText, RuleA11ySemanticHtml, RuleA11yFormLabel). Behaviour is the starter's components/catalog/FeatureGrid.vue at 80ad391.
import { afterEach, describe, expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import axe from "axe-core";
import FeatureGrid from "./FeatureGrid.vue";

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; });
const FEATURES = [
  { title: "Fast", description: "Static pages.", icon: "⚡" },
  { title: "Found", description: "Sitemap and schema." },
];
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);

describe("FeatureGrid", () => {
  test("one tile per feature, in order, each with an h3 title and its line", () => {
    wrapper = mount(FeatureGrid, { props: { features: FEATURES }, attachTo: document.body });
    const tiles = document.querySelectorAll(".fg-tile");
    expect(tiles).toHaveLength(2);
    expect([...document.querySelectorAll("h3")].map((e) => e.textContent)).toEqual(["Fast", "Found"]);
    expect(tiles[1]!.querySelector(".fg-text")!.textContent).toBe("Sitemap and schema.");
  });
  test("the icon shows only when given, hidden from screen readers", () => {
    wrapper = mount(FeatureGrid, { props: { features: FEATURES }, attachTo: document.body });
    const icons = document.querySelectorAll(".fg-icon");
    expect(icons).toHaveLength(1);
    expect(icons[0]!.getAttribute("aria-hidden")).toBe("true");
  });
  test("the heading is an h2, drawn only when given", () => {
    wrapper = mount(FeatureGrid, { props: { features: FEATURES }, attachTo: document.body });
    expect(document.querySelector("h2")).toBeNull();
    wrapper.unmount();
    wrapper = mount(FeatureGrid, { props: { heading: "Why us", features: FEATURES }, attachTo: document.body });
    expect(document.querySelector("h2")!.textContent).toBe("Why us");
  });
  test("an empty list draws an empty grid, not an error", () => {
    wrapper = mount(FeatureGrid, { props: { features: [] }, attachTo: document.body });
    expect(document.querySelectorAll(".fg-tile")).toHaveLength(0);
  });
  // Spec: Rule_Code_accessibility RuleA11yUnitTest
  test("axe: no violations (jsdom; colour contrast not measurable here)", async () => {
    wrapper = mount(FeatureGrid, { props: { heading: "Why us", features: FEATURES }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
  });
});

// Spec: Agent.Tester R1 D3 — the unit's widths must not depend on the page's reset. Vitest does not apply
// the component's scoped style, so this reads the style itself; the browser measure is in the R1 report.
describe("FeatureGrid box sizing", () => {
  test("every box of the unit sizes with border-box, so padding never widens it", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const style = readFileSync(join(process.cwd(), "src", "FeatureGrid.vue"), "utf8").split("<style scoped>")[1] ?? "";
    expect(style).toContain(".fg, .fg * { box-sizing: border-box; }");
  });
});
