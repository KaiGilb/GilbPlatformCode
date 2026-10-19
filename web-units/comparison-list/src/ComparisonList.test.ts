// Spec: Rule_Code_gwcunit (RuleGwcunitA11yTest, RuleGwcunitTokens, RuleGwcunitStackFit) and the proposal
// PROPOSAL-2026-10-20-WebsitesGilbComponentsIntoLibrary-GilbPlatformCode (row 2). Tests written new for this unit.
import { afterEach, describe, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import ComparisonList from "./ComparisonList.vue";

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; vi.restoreAllMocks(); });
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);

const ROWS = [
  { topic: "Built around you", them: "Often a template", us: "We start with your goals" },
  { topic: "Speed", them: "Often slow on phones", us: "Fast, measured before you accept" },
  { topic: "Found on Google", them: "Search setup sold as an extra", us: "Included" },
];
const PROPS = { rows: ROWS, themLabel: "Typical web agency", usLabel: "Example Studio", themShort: "Typical:", usShort: "Us:" };

describe("ComparisonList", () => {
  test("a list with one item per row: the topic is a heading, the two answers are paragraphs", () => {
    wrapper = mount(ComparisonList, { props: PROPS, attachTo: document.body });
    const lis = document.querySelectorAll("ul[role=list] > li");
    expect(lis).toHaveLength(3);
    expect(lis[1]!.querySelector("h3")!.textContent).toBe("Speed");
    expect(lis[1]!.querySelectorAll("p")).toHaveLength(2);
  });
  test("each answer is read with its full column name, whatever the width", () => {
    wrapper = mount(ComparisonList, { props: PROPS, attachTo: document.body });
    const [them, us] = document.querySelectorAll("li")[0]!.querySelectorAll("p");
    expect(them!.textContent).toContain("Typical web agency: Often a template");
    expect(us!.textContent).toContain("Example Studio: We start with your goals");
  });
  test("the column header, the short labels and the check mark are hidden from screen readers", () => {
    wrapper = mount(ComparisonList, { props: PROPS, attachTo: document.body });
    expect(document.querySelector(".cmp-head")!.getAttribute("aria-hidden")).toBe("true");
    expect([...document.querySelectorAll(".cmp-short")].map((e) => e.getAttribute("aria-hidden"))).toEqual(Array(6).fill("true"));
    expect(document.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  });
  test("the short labels are left out when not given", () => {
    wrapper = mount(ComparisonList, { props: { rows: ROWS, themLabel: "A", usLabel: "B" }, attachTo: document.body });
    expect(document.querySelectorAll(".cmp-short")).toHaveLength(0);
  });
  test("the topic's heading level is the host's to set", () => {
    wrapper = mount(ComparisonList, { props: { ...PROPS, headingLevel: 4 }, attachTo: document.body });
    expect(document.querySelectorAll("h4")).toHaveLength(3);
    expect(document.querySelector("h3")).toBeNull();
  });
  test("row attributes go on the header and every row", () => {
    wrapper = mount(ComparisonList, { props: { ...PROPS, rowAttrs: { "data-reveal": "" } }, attachTo: document.body });
    expect(document.querySelectorAll("[data-reveal]")).toHaveLength(4);
  });
  test("no rows draws nothing", () => {
    wrapper = mount(ComparisonList, { props: { ...PROPS, rows: [] }, attachTo: document.body });
    expect(document.body.innerHTML).not.toContain("cmp-rows");
  });
  test("text is drawn as text, not as markup", () => {
    wrapper = mount(ComparisonList, { props: { ...PROPS, rows: [{ topic: "<b>t</b>", them: "<i>x</i>", us: "<u>y</u>" }] }, attachTo: document.body });
    expect(document.querySelector("b, i, u")).toBeNull();
    expect(document.querySelector("h3")!.textContent).toBe("<b>t</b>");
  });
  test("the server's HTML holds every row and no script handler", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(ComparisonList, PROPS) }));
    for (const r of ROWS) for (const t of [r.topic, r.them, r.us]) expect(html).toContain(t);
    expect(html).not.toMatch(/\son[a-z]+=/);
  });
  test("the server's HTML hydrates in the browser with no mismatch warning", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(ComparisonList, PROPS) }));
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.appendChild(el);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    createSSRApp({ render: () => h(ComparisonList, PROPS) }).mount(el);
    expect([...warn.mock.calls, ...err.mock.calls].map((c) => c.map(String).join(" ")).filter((s) => /hydrat|mismatch/i.test(s))).toEqual([]);
  });
  // Spec: RuleGwcunitA11yTest / RuleA11yUnitTest. jsdom has one layout (the narrow one is the markup; the wide one is CSS only).
  test("axe: no violations (jsdom; contrast is measured in the browser run)", async () => {
    wrapper = mount(ComparisonList, { props: PROPS, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
  });
});

describe("the unit's style", () => {
  const SFC = readFileSync(join(process.cwd(), "src", "ComparisonList.vue"), "utf8");
  const style = (SFC.split("<style scoped>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  // Spec: RuleGwcunitTokens
  test("every colour literal sits inside a var(--site-block-*, ...) fallback", () => {
    const bad = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|gray|grey)\b(?!-)/g)]
      .filter((m) => !/var\(--site-block-[a-z-]+,\s*$/.test(style.slice(Math.max(0, m.index! - 80), m.index)))
      .map((m) => style.slice(Math.max(0, m.index! - 40), m.index! + 10).replace(/\s+/g, " "));
    expect(bad).toEqual([]);
  });
  test("every box sizes with border-box, so padding never widens it", () => {
    expect(style).toContain(".cmp, .cmp * { box-sizing: border-box; }");
  });
  test("the wide layout starts at 768 px and the phone layout needs no media query", () => {
    expect(style).toContain("@media (min-width: 768px)");
    expect(style.split("@media (min-width: 768px)")[0]).not.toContain("@media");
  });
  test("the unit names no Tailwind class and imports nothing but vue and its own files", () => {
    expect(SFC).not.toMatch(/class="[^"]*\b(?:text|bg|border|rounded|px|py|mt|mb|flex|grid)-/);
    const imports = [...SFC.matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]);
    expect(imports.every((i) => i === "vue" || i!.startsWith("./"))).toBe(true);
  });
});
