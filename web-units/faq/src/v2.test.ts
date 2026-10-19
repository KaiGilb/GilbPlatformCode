// Spec: Kai-Zen decision 2026-10-20 (faq 0.2.0: plus-minus icon and scroll margin as opt-ins). Behaviour read from the
// Gilb Websites page (Jairam-Gilb/gilb-websites-web redesign-scrollcraft b78b1f9, pages/index.vue and main.css sc-faq*). Tests written new.
import { afterEach, describe, expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import Faq from "./Faq.vue";

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; });
const ITEMS = [{ q: "Q1", a: "A1" }, { q: "Q2", a: "A2" }];
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);

describe("Faq 0.2.0 options", () => {
  test("by default the sign is the + text and no summary has a style (unchanged)", () => {
    wrapper = mount(Faq, { props: { items: ITEMS }, attachTo: document.body });
    expect(document.querySelector(".faq-sign")!.textContent).toBe("+");
    expect(document.querySelector(".faq-bars")).toBeNull();
    expect(document.querySelector("summary")!.hasAttribute("style")).toBe(false);
  });
  test("icon=plus-minus draws two bars, no text, hidden from screen readers; the summary text is only the question", () => {
    wrapper = mount(Faq, { props: { items: ITEMS, icon: "plus-minus" }, attachTo: document.body });
    const s = document.querySelectorAll(".faq-bars");
    expect(s).toHaveLength(2);
    expect(s[0]!.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector("summary")!.textContent!.trim()).toBe("Q1");
  });
  test("scrollMarginTop is put on every summary", () => {
    wrapper = mount(Faq, { props: { items: ITEMS, scrollMarginTop: "6rem" }, attachTo: document.body });
    expect([...document.querySelectorAll("summary")].map((e) => (e as HTMLElement).style.scrollMarginTop)).toEqual(["6rem", "6rem"]);
  });
  test("the bars turn flat when open, use the library's motion variable and stop under reduced motion; no raw colour", () => {
    const style = (readFileSync(join(process.cwd(), "src", "Faq.vue"), "utf8").split("<style scoped>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(style).toContain(".faq-item[open] .faq-bars::after { transform: rotate(0deg); }");
    expect(style).toContain("transition: transform var(--site-block-motion, 150ms) ease");
    expect(style).toContain("@media (prefers-reduced-motion: reduce) { .faq-bars::after { transition: none; } }");
    expect(style).toContain("background: currentColor");
  });
  test("axe: no violations with both options, closed and open", async () => {
    wrapper = mount(Faq, { props: { heading: "FAQ", items: ITEMS, icon: "plus-minus", scrollMarginTop: "6rem" }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
    document.querySelector("details")!.open = true;
    expect(await axeIds()).toEqual([]);
  });
});
