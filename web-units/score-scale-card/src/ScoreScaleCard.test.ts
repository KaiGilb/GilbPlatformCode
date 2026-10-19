// Spec: Rule_Code_gwcunit (RuleGwcunitA11yTest, RuleGwcunitTokens, RuleGwcunitStackFit) and the proposal
// PROPOSAL-2026-10-20-WebsitesGilbComponentsIntoLibrary-GilbPlatformCode (row 1). Tests written new for this unit;
// the oracle below is the landing page's former Tailwind-class code (b78b1f9), kept to prove "same behaviour".
import { afterEach, describe, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import ScoreScaleCard from "./ScoreScaleCard.vue";
import { pct, scaleSentence, statGrid } from "./grid";
import type { ScoreStat } from "./types";

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; vi.restoreAllMocks(); });
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);

const SCALE = { min: "0", max: "100", typical: "Most sites: under 50", typicalAt: 40, ours: "Ours: 95+", oursAt: 95 };
const STATS: ScoreStat[] = [
  { value: "95+", title: "Speed", what: "How fast it loads.", scale: SCALE },
  { value: "A", title: "Security", what: "How well it is protected.", scale: { ...SCALE, min: "F", max: "A+" } },
  { value: "AI", title: "Blog", what: "Post in minutes." },
  { value: "4+", title: "Languages", what: "Four so far." },
  { value: "0", label: "Monthly fee" },
];

// The oracle: the former pages/index.vue code, class strings and all.
function oracle(stats: ScoreStat[]) {
  const scored = stats.filter((s) => s.scale).length;
  const plain = stats.length - scored;
  const sixUp = scored > 0 && scored % 2 === 0 && plain % 3 === 0;
  let cols = "lg:grid-cols-3";
  if (sixUp) cols = "lg:grid-cols-6";
  else if (stats.length <= 2) cols = "";
  else if (stats.length === 4) cols = "lg:grid-cols-4";
  else if (stats.length === 5) cols = "lg:grid-cols-5";
  const lastPlain = stats.map((s) => !s.scale).lastIndexOf(true);
  const cells = stats.map((s, i) => {
    const classes: string[] = [];
    if (s.scale) classes.push("col-span-2 sm:col-span-1");
    else if (i === lastPlain && plain % 2 === 1) classes.push("col-span-2");
    if (i === stats.length - 1 && stats.length % 2 === 1) classes.push("sm:col-span-2");
    else if (i === lastPlain && plain % 2 === 1) classes.push("sm:col-span-1");
    if (sixUp) classes.push(s.scale ? "lg:col-span-3" : "lg:col-span-2");
    else if (classes.length) classes.push("lg:col-span-1");
    return classes.join(" ");
  });
  return { cols, cells };
}
// What the browser does with those classes: per width the largest span class wins (Tailwind sorts them by value),
// and a width with no class of its own keeps the narrower width's span.
function effective(cell: string) {
  const at = (p: string) => {
    const ns = [...cell.matchAll(new RegExp(`(?:^| )${p}col-span-(\\d)`, "g"))].map((m) => Number(m[1]));
    return ns.length ? Math.max(...ns) : undefined;
  };
  const base = at("") ?? 1;
  const sm = at("sm:") ?? base;
  return { base, sm, lg: at("lg:") ?? sm };
}

describe("statGrid (same grid as the landing page's former code)", () => {
  test("every arrangement of 1 to 8 scored and plain cards gives the old columns and spans", () => {
    let n = 0;
    for (let len = 1; len <= 8; len++) {
      for (let mask = 0; mask < 1 << len; mask++) {
        const stats: ScoreStat[] = Array.from({ length: len }, (_, i) => (mask >> i) & 1 ? { value: "1", scale: SCALE } : { value: "1" });
        const old = oracle(stats);
        const now = statGrid(stats);
        expect(now.lgCols, `cols for mask ${mask} len ${len}`).toBe(Number(/grid-cols-(\d)/.exec(old.cols)?.[1] ?? 2));
        expect(now.cells, `cells for mask ${mask} len ${len}`).toEqual(old.cells.map(effective));
        n++;
      }
    }
    expect(n).toBe(510);
  });
  test("two scored and three plain cards (the landing page's case) is the 6-column grid", () => {
    const g = statGrid(STATS);
    expect(g.lgCols).toBe(6);
    expect(g.cells.map((c) => c.lg)).toEqual([3, 3, 2, 2, 2]);
    expect(g.cells.map((c) => c.base)).toEqual([2, 2, 1, 1, 2]);
  });
  test("no cards gives an empty grid", () => {
    expect(statGrid([]).cells).toEqual([]);
  });
});

describe("pct and scaleSentence", () => {
  test.each([[40, "40%"], [-5, "0%"], [250, "100%"], [Number.NaN, "0%"], ["abc" as unknown as number, "0%"]])("pct(%s) is %s", (n, out) => {
    expect(pct(n)).toBe(out);
  });
  test("the sentence reads the end labels and both legend lines and ends each with a full stop", () => {
    expect(scaleSentence(SCALE)).toBe("Scale 0 to 100. Most sites: under 50. Ours: 95+.");
    expect(scaleSentence({ ...SCALE, typical: "Typical!", ours: "Ours?" })).toBe("Scale 0 to 100. Typical! Ours?");
  });
  test("a site can word the opening itself", () => {
    expect(scaleSentence(SCALE, (a, b) => `Skala ${a} til ${b}.`)).toBe("Skala 0 til 100. Most sites: under 50. Ours: 95+.");
  });
});

describe("ScoreScaleCard", () => {
  test("a list of cards: value, then title and line (or the short label)", () => {
    wrapper = mount(ScoreScaleCard, { props: { items: STATS }, attachTo: document.body });
    const lis = document.querySelectorAll("ul[role=list] > li");
    expect(lis).toHaveLength(5);
    expect(lis[0]!.querySelector(".ssc-value")!.textContent).toBe("95+");
    expect(lis[0]!.querySelector("h3")!.textContent).toBe("Speed");
    expect(lis[0]!.querySelector(".ssc-what")!.textContent).toBe("How fast it loads.");
    expect(lis[4]!.querySelector("h3")).toBeNull();
    expect(lis[4]!.querySelector(".ssc-label")!.textContent).toBe("Monthly fee");
  });
  test("only a scored card has a bar; the bar is hidden from screen readers and a sentence replaces it", () => {
    wrapper = mount(ScoreScaleCard, { props: { items: STATS }, attachTo: document.body });
    const lis = document.querySelectorAll("li");
    expect(document.querySelectorAll(".ssc-scale")).toHaveLength(2);
    expect(lis[2]!.querySelector(".ssc-scale")).toBeNull();
    expect(lis[0]!.querySelector(".ssc-scale")!.getAttribute("aria-hidden")).toBe("true");
    expect(lis[0]!.querySelector(".ssc-sr")!.textContent).toBe("Scale 0 to 100. Most sites: under 50. Ours: 95+.");
    expect(lis[1]!.querySelector(".ssc-sr")!.textContent).toContain("Scale F to A+.");
  });
  test("the markers sit at their percent; a wrong number is held on the bar", () => {
    const items = [{ value: "x", scale: { ...SCALE, typicalAt: -20, oursAt: 140 } }];
    wrapper = mount(ScoreScaleCard, { props: { items }, attachTo: document.body });
    expect((document.querySelector(".ssc-typical") as HTMLElement).style.left).toBe("0%");
    expect((document.querySelector(".ssc-ours") as HTMLElement).style.left).toBe("100%");
  });
  test("each card carries its spans as variables for the three widths", () => {
    wrapper = mount(ScoreScaleCard, { props: { items: STATS }, attachTo: document.body });
    const first = document.querySelector("li") as HTMLElement;
    expect(first.style.getPropertyValue("--ssc-span")).toBe("2");
    expect(first.style.getPropertyValue("--ssc-span-sm")).toBe("1");
    expect(first.style.getPropertyValue("--ssc-span-lg")).toBe("3");
    expect((document.querySelector("ul") as HTMLElement).style.getPropertyValue("--ssc-lg-cols")).toBe("6");
  });
  test("the title level and the card attributes are the host's to set", () => {
    wrapper = mount(ScoreScaleCard, { props: { items: STATS, headingLevel: 4, cardAttrs: { "data-reveal": "" } }, attachTo: document.body });
    expect(document.querySelector("h3")).toBeNull();
    expect(document.querySelectorAll("h4")).toHaveLength(4);
    expect(document.querySelectorAll("li[data-reveal]")).toHaveLength(5);
  });
  test("cards with the same value but different titles do not share a key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    wrapper = mount(ScoreScaleCard, { props: { items: [{ value: "1", title: "A" }, { value: "1", title: "B" }] }, attachTo: document.body });
    expect(warn.mock.calls.map((c) => c.join(" ")).filter((s) => /duplicate key/i.test(s))).toEqual([]);
  });
  test("an empty list draws an empty list", () => {
    wrapper = mount(ScoreScaleCard, { props: { items: [] }, attachTo: document.body });
    expect(document.querySelectorAll("li")).toHaveLength(0);
  });
  test("the server's HTML holds every figure and sentence and no script handler", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(ScoreScaleCard, { items: STATS }) }));
    for (const s of STATS) expect(html).toContain(s.value);
    expect(html).toContain("Scale 0 to 100.");
    expect(html).not.toMatch(/\son[a-z]+=/);
  });
  test("the server's HTML hydrates in the browser with no mismatch warning", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(ScoreScaleCard, { items: STATS }) }));
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.appendChild(el);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    createSSRApp({ render: () => h(ScoreScaleCard, { items: STATS }) }).mount(el);
    expect([...warn.mock.calls, ...err.mock.calls].map((c) => c.map(String).join(" ")).filter((s) => /hydrat|mismatch/i.test(s))).toEqual([]);
  });
  // Spec: RuleGwcunitA11yTest / RuleA11yUnitTest
  test("axe: no violations with scored and plain cards, and with only plain cards (jsdom; contrast is measured in the browser run)", async () => {
    wrapper = mount(ScoreScaleCard, { props: { items: STATS }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
    wrapper.unmount();
    wrapper = mount(ScoreScaleCard, { props: { items: [{ value: "1", title: "T", what: "W" }] }, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
  });
});

describe("the unit's style", () => {
  const SFC = readFileSync(join(process.cwd(), "src", "ScoreScaleCard.vue"), "utf8");
  const style = (SFC.split("<style scoped>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  // Spec: RuleGwcunitTokens
  test("every colour literal sits inside a var(--site-block-*, ...) fallback", () => {
    const bad = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|gray|grey)\b(?!-)/g)]
      .filter((m) => !/var\(--site-block-[a-z-]+,\s*$/.test(style.slice(Math.max(0, m.index! - 80), m.index)))
      .map((m) => style.slice(Math.max(0, m.index! - 40), m.index! + 10).replace(/\s+/g, " "));
    expect(bad).toEqual([]);
  });
  test("every box sizes with border-box, so padding never widens it", () => {
    expect(style).toContain(".ssc, .ssc * { box-sizing: border-box; }");
  });
  test("the unit names no Tailwind class and imports nothing but vue and its own files", () => {
    expect(SFC).not.toMatch(/class="[^"]*\b(?:text|bg|border|rounded|px|py|mt|mb|flex|grid)-/);
    const imports = [...SFC.matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]);
    expect(imports.every((i) => i === "vue" || i!.startsWith("./"))).toBe(true);
  });
});
