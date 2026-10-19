// Spec: Rule_Code_gwcunit (RuleGwcunitA11yTest, RuleGwcunitTokens, RuleGwcunitStackFit) and the proposal
// PROPOSAL-2026-10-20-WebsitesGilbComponentsIntoLibrary-GilbPlatformCode (rows 3 and 4). Tests written new for this unit.
// The pick's CSS (:checked) is not run by jsdom; the tests read the style text and the radios' state.
import { afterEach, describe, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import PlanPicker from "./PlanPicker.vue";
import { readPick } from "./pick";

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; vi.restoreAllMocks(); });
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);

const PLANS = [
  { name: "Start", price: "From 1 000", features: ["One page", "Contact form"] },
  { name: "Grow", price: "From 3 000", features: ["Ten pages", "Blog"], featured: true, featuredNote: "Most chosen" },
  { name: "Scale", price: "From 6 000", features: ["Unlimited pages"] },
];
const EXTRAS = { heading: "Extras", teaser: "One-off add-ons", fromPrice: "From 100", openLabel: "See all extras", closeLabel: "Hide extras", body: "Priced once.", items: [{ name: "Logo", price: "400", body: "A mark." }, { name: "Photos", price: "100" }] };
const PROPS = { plans: PLANS, label: "Pricing", extras: EXTRAS };
const radios = () => [...document.querySelectorAll<HTMLInputElement>("input[type=radio]")];
const click = (i: number) => { const r = radios()[i]!; r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); };

describe("PlanPicker, the cards", () => {
  test("a radio group named by its label, one radio and one card per plan", () => {
    wrapper = mount(PlanPicker, { props: PROPS, attachTo: document.body });
    const g = document.querySelector("[role=radiogroup]")!;
    expect(g.getAttribute("aria-label")).toBe("Pricing");
    expect(radios()).toHaveLength(3);
    expect(document.querySelectorAll("article")).toHaveLength(3);
    expect(new Set(radios().map((r) => r.name)).size).toBe(1);
  });
  test("the featured plan starts picked; with none featured nothing is", () => {
    wrapper = mount(PlanPicker, { props: PROPS, attachTo: document.body });
    expect(radios().map((r) => r.checked)).toEqual([false, true, false]);
    wrapper.unmount();
    wrapper = mount(PlanPicker, { props: { ...PROPS, plans: PLANS.map((p) => ({ ...p, featured: false })) }, attachTo: document.body });
    expect(radios().map((r) => r.checked)).toEqual([false, false, false]);
  });
  test("each radio is named by its plan's name and described by price and features", () => {
    wrapper = mount(PlanPicker, { props: PROPS, attachTo: document.body });
    const r = radios()[0]!;
    expect(document.getElementById(r.getAttribute("aria-labelledby")!)!.textContent).toBe("Start");
    const d = r.getAttribute("aria-describedby")!.split(" ").map((id) => document.getElementById(id)!.textContent);
    expect(d[0]).toBe("From 1 000");
    expect(d[1]).toContain("One page");
  });
  test("the click target is a label for the radio, hidden from screen readers", () => {
    wrapper = mount(PlanPicker, { props: PROPS, attachTo: document.body });
    const l = document.querySelector("label")!;
    expect(l.getAttribute("for")).toBe(radios()[0]!.id);
    expect(l.getAttribute("aria-hidden")).toBe("true");
    expect(l.textContent).toBe("");
  });
  test("the featured note is drawn only on the plan that has one", () => {
    wrapper = mount(PlanPicker, { props: PROPS, attachTo: document.body });
    expect(document.querySelectorAll(".pp-note")).toHaveLength(1);
  });
  test("two pickers on one page do not share ids or names", () => {
    const host = (id: string) => { const d = document.createElement("div"); d.id = id; document.body.appendChild(d); return d; };
    const two = mount({ render: () => h("div", [h(PlanPicker, PROPS), h(PlanPicker, PROPS)]) }, { attachTo: host("a") });
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(radios().map((r) => r.name)).size).toBe(2);
    two.unmount();
  });
  test("a name given by the host is used", () => {
    wrapper = mount(PlanPicker, { props: { ...PROPS, name: "plan" }, attachTo: document.body });
    expect(radios().every((r) => r.name === "plan")).toBe(true);
  });
  test("the plan level is the host's to set", () => {
    wrapper = mount(PlanPicker, { props: { ...PROPS, headingLevel: 4 }, attachTo: document.body });
    expect(document.querySelectorAll("h4")).toHaveLength(4);
    expect(document.querySelector("h3")).toBeNull();
  });
  test("item attributes go on each card's wrapper and on the extras wrapper", () => {
    wrapper = mount(PlanPicker, { props: { ...PROPS, itemAttrs: { "data-reveal": "" } }, attachTo: document.body });
    expect(document.querySelectorAll("[data-reveal]")).toHaveLength(4);
  });
});

describe("PlanPicker, the pick", () => {
  test("on mount it reports the default, not by the visitor", () => {
    wrapper = mount(PlanPicker, { props: PROPS, attachTo: document.body });
    expect(wrapper.emitted("pick")![0]).toEqual([{ plan: "Grow", byVisitor: false }]);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });
  test("a click reports the pick by the visitor and updates v-model; it stays 'by visitor' after picking the default again", () => {
    wrapper = mount(PlanPicker, { props: PROPS, attachTo: document.body });
    click(2);
    expect(wrapper.emitted("update:modelValue")![0]).toEqual(["Scale"]);
    expect(wrapper.emitted("pick")!.at(-1)).toEqual([{ plan: "Scale", byVisitor: true }]);
    click(1);
    expect(wrapper.emitted("pick")!.at(-1)).toEqual([{ plan: "Grow", byVisitor: true }]);
  });
  test("a pick made before the script ran (a checked radio other than the default) counts as the visitor's", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(PlanPicker, PROPS) }));
    document.body.innerHTML = `<div id="r">${html}</div>`;
    radios()[0]!.checked = true; // the visitor clicked before hydration
    const seen: unknown[] = [];
    createSSRApp({ render: () => h(PlanPicker, { ...PROPS, onPick: (p: unknown) => seen.push(p) }) }).mount(document.getElementById("r")!);
    expect(seen[0]).toEqual({ plan: "Start", byVisitor: true });
    expect(radios()[0]!.checked).toBe(true);
  });
  test("v-model sets the picked plan", async () => {
    wrapper = mount(PlanPicker, { props: { ...PROPS, modelValue: "Start" }, attachTo: document.body });
    expect(radios().map((r) => r.checked)).toEqual([true, false, false]);
    await wrapper.setProps({ modelValue: "Scale" });
    expect(radios().map((r) => r.checked)).toEqual([false, false, true]);
  });
  test("readPick reads the checked radio of the named group only", () => {
    document.body.innerHTML = `<div id="g"><input type="radio" name="a" value="x"><input type="radio" name="b" value="y" checked></div>`;
    const g = document.getElementById("g")!;
    expect(readPick(g, "a", "x", false, false)).toEqual({ plan: "", byVisitor: false });
    expect(readPick(g, "b", "x", false, false)).toEqual({ plan: "y", byVisitor: true });
    expect(readPick(g, "b", "y", false, false)).toEqual({ plan: "y", byVisitor: false });
    expect(readPick(g, "b", "y", true, false).byVisitor).toBe(true);
  });
});

describe("PlanPicker, the extras", () => {
  test("a closed native details: heading, teaser, lowest price and both cues are in the summary", () => {
    wrapper = mount(PlanPicker, { props: PROPS, attachTo: document.body });
    const d = document.querySelector("details")!;
    expect(d.open).toBe(false);
    const s = d.querySelector("summary")!;
    expect(s.textContent).toContain("Extras");
    expect(s.textContent).toContain("One-off add-ons");
    expect(s.textContent).toContain("From 100");
    expect(s.querySelector(".pp-ex-open")!.textContent).toBe("See all extras");
    expect(s.querySelector(".pp-ex-close")!.textContent).toBe("Hide extras");
    expect(s.querySelector(".pp-icon")!.getAttribute("aria-hidden")).toBe("true");
  });
  test("the list is named by the heading and each item has name, price and its line", () => {
    wrapper = mount(PlanPicker, { props: PROPS, attachTo: document.body });
    const ul = document.querySelector(".pp-ex-list")!;
    expect(document.getElementById(ul.getAttribute("aria-labelledby")!)!.textContent).toBe("Extras");
    const li = ul.querySelectorAll("li");
    expect(li).toHaveLength(2);
    expect(li[0]!.textContent).toContain("Logo");
    expect(li[0]!.querySelector(".pp-ex-line")!.textContent).toBe("A mark.");
    expect(li[1]!.querySelector(".pp-ex-line")).toBeNull();
  });
  test("no extras, or an empty list, draws no details", () => {
    wrapper = mount(PlanPicker, { props: { plans: PLANS, label: "P" }, attachTo: document.body });
    expect(document.querySelector("details")).toBeNull();
    wrapper.unmount();
    wrapper = mount(PlanPicker, { props: { plans: PLANS, label: "P", extras: { items: [] } }, attachTo: document.body });
    expect(document.querySelector("details")).toBeNull();
  });
  test("without a heading the list has no label reference; the cues are optional", () => {
    wrapper = mount(PlanPicker, { props: { plans: PLANS, label: "P", extras: { items: EXTRAS.items } }, attachTo: document.body });
    expect(document.querySelector(".pp-ex-list")!.hasAttribute("aria-labelledby")).toBe(false);
    expect(document.querySelector(".pp-ex-open")).toBeNull();
  });
});

describe("PlanPicker, rendering and accessibility", () => {
  test("the server's HTML holds every plan, feature and extra, the default checked, and no script handler", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(PlanPicker, PROPS) }));
    for (const t of ["Start", "Grow", "Scale", "Blog", "Logo", "Photos", "See all extras"]) expect(html).toContain(t);
    expect(html.match(/checked/g)).toHaveLength(1);
    expect(html).not.toMatch(/\son[a-z]+=/);
  });
  test("the server's HTML hydrates in the browser with no mismatch warning (ids included)", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(PlanPicker, PROPS) }));
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.appendChild(el);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    createSSRApp({ render: () => h(PlanPicker, PROPS) }).mount(el);
    expect([...warn.mock.calls, ...err.mock.calls].map((c) => c.map(String).join(" ")).filter((s) => /hydrat|mismatch/i.test(s))).toEqual([]);
  });
  // Spec: RuleGwcunitA11yTest / RuleA11yUnitTest
  test("axe: no violations with extras closed and open, and with plans only", async () => {
    wrapper = mount(PlanPicker, { props: PROPS, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
    document.querySelector("details")!.open = true;
    expect(await axeIds()).toEqual([]);
    wrapper.unmount();
    wrapper = mount(PlanPicker, { props: { plans: PLANS, label: "P" }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
  });
});

describe("the unit's style", () => {
  const SFC = readFileSync(join(process.cwd(), "src", "PlanPicker.vue"), "utf8");
  const style = (SFC.split("<style scoped>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  test("the pick is CSS only: the picked look follows the checked radio, the lift is desktop only", () => {
    expect(style).toContain(".pp-input:checked + .pp-card {");
    expect(style).toMatch(/@media \(min-width: 1024px\) \{[\s\S]*\.pp-input:checked \+ \.pp-card \{ transform: translateY\(-1\.5rem\) scale\(1\.03\)/);
    expect(style).toContain(".pp-input:focus-visible + .pp-card");
  });
  test("motion is only declared for no-preference, so reduced motion has none", () => {
    expect(style.match(/transition/g)!.length).toBeGreaterThan(0);
    const outside = style.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}\n/g, "");
    expect(outside).not.toContain("transition");
  });
  test("every colour literal sits inside a var(--site-block-*, ...) fallback, except the drop shadow's black", () => {
    const bad = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|gray|grey)\b(?!-)/g)]
      .filter((m) => !/var\(--site-block-[a-z-]+,\s*$/.test(style.slice(Math.max(0, m.index! - 80), m.index)))
      .map((m) => style.slice(Math.max(0, m.index! - 40), m.index! + 20).replace(/\s+/g, " "));
    expect(bad.every((b) => b.includes("rgb(0 0 0 / 0.35)"))).toBe(true);
  });
  test("every box sizes with border-box", () => {
    expect(style).toContain(".pp, .pp * { box-sizing: border-box; }");
  });
  test("the unit names no Nuxt, no Tailwind class, and imports only vue and its own files", () => {
    expect(SFC).not.toMatch(/useState|useNuxtApp|#imports|nuxt/i);
    expect(SFC).not.toMatch(/class="[^"]*\b(?:text|bg|border|rounded|px|py|mt|mb|flex|grid)-/);
    const imports = [...SFC.matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]);
    expect(imports.every((i) => i === "vue" || i!.startsWith("./"))).toBe(true);
  });
});
