// Spec: handoff 00.Handoff-2026-10-19-ToAgentCoder-StarterModulesIntoWebsiteLibrary-GilbPlatformCode (one unit
// per block; content as props; tokens through CSS variables) and Rule_Code_accessibility (RuleA11yUnitTest,
// RuleA11yAltText, RuleA11ySemanticHtml, RuleA11yFormLabel). Behaviour is the starter's components/catalog/FAQ.vue at 80ad391.
import { afterEach, describe, expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import axe from "axe-core";
import Faq from "./Faq.vue";

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; });
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);
const ITEMS = [
  { q: "Who maintains the content?", a: "You do." },
  { q: "What does it cost?", a: "Domain only." },
];

describe("Faq", () => {
  test("each item is a closed native details whose summary is the question", () => {
    wrapper = mount(Faq, { props: { items: ITEMS }, attachTo: document.body });
    const ds = document.querySelectorAll("details");
    expect(ds).toHaveLength(2);
    expect([...ds].map((d) => d.open)).toEqual([false, false]);
    expect(ds[0]!.querySelector("summary")!.textContent!.replace("+", "").trim()).toBe("Who maintains the content?");
    expect(ds[0]!.querySelector(".faq-a")!.textContent).toBe("You do.");
  });
  test("the + sign is hidden from screen readers", () => {
    wrapper = mount(Faq, { props: { items: ITEMS }, attachTo: document.body });
    expect(document.querySelector(".faq-sign")!.getAttribute("aria-hidden")).toBe("true");
  });
  test("the server's HTML holds every question and answer and no script handler (works with JavaScript off)", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(Faq, { heading: "FAQ", items: ITEMS }) }));
    for (const i of ITEMS) { expect(html).toContain(i.q); expect(html).toContain(i.a); }
    expect(html).toMatch(/<details/);
    expect(html).not.toMatch(/\son[a-z]+=/);
  });
  test("the heading is an h2, drawn only when given", () => {
    wrapper = mount(Faq, { props: { items: ITEMS }, attachTo: document.body });
    expect(document.querySelector("h2")).toBeNull();
  });
  // Spec: Rule_Code_accessibility RuleA11yUnitTest
  test("axe: no violations, closed and with one item open (jsdom; colour contrast not measurable here)", async () => {
    wrapper = mount(Faq, { props: { heading: "FAQ", items: ITEMS }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
    document.querySelector("details")!.open = true;
    expect(await axeIds()).toEqual([]);
  });
});

// Spec: Agent.Tester R1 D3 — the unit's widths must not depend on the page's reset. Vitest does not apply
// the component's scoped style, so this reads the style itself; the browser measure is in the R1 report.
describe("Faq box sizing", () => {
  test("every box of the unit sizes with border-box, so padding never widens it", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const style = readFileSync(join(process.cwd(), "src", "Faq.vue"), "utf8").split("<style scoped>")[1] ?? "";
    expect(style).toContain(".faq, .faq * { box-sizing: border-box; }");
  });
});
