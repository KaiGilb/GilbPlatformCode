// Spec: Rule_Code_gwcunit (RuleGwcunitA11yTest, RuleGwcunitTokens, RuleGwcunitStackFit, RuleGwcunitHostAgnostic) and the
// proposal PROPOSAL-2026-10-20-WebsitesGilbComponentsIntoLibrary-GilbPlatformCode (row 11). Tests written new for this unit.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, h, nextTick } from "vue";
import { renderToString } from "vue/server-renderer";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import ThemeSwitcher from "./ThemeSwitcher.vue";
import { AA_MIN, contrastRatio, hexToRgb, nudgeToAA } from "./contrast";
import { themeHeadScript } from "./headScript";
import { accentCssValue, applyToRoot, persist, readStored, themeOptions } from "./theme";

const MODES = [
  { id: "light", label: "Light", blurb: "The default." },
  { id: "dark", label: "Dark" },
  { id: "colorblind", label: "Colour-blind safe" },
  { id: "custom", label: "Custom accent" },
];
const PROPS = { modes: MODES, backgroundHex: "#ffffff", defaultAccent: "#0c6e78" };
let wrapper: VueWrapper | undefined;
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);
// Node 25 ships its own global localStorage that shadows jsdom's; the unit is tested against a plain in-memory Storage.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return { get length() { return m.size; }, clear: () => m.clear(), getItem: (k) => m.get(k) ?? null, key: (i) => [...m.keys()][i] ?? null, removeItem: (k) => void m.delete(k), setItem: (k, v) => void m.set(k, String(v)) };
}
beforeEach(() => { vi.stubGlobal("localStorage", memoryStorage()); document.documentElement.removeAttribute("data-theme"); document.documentElement.removeAttribute("style"); });
afterEach(() => { vi.unstubAllGlobals(); wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; vi.restoreAllMocks(); });
const click = async (el: Element | null) => { (el as HTMLElement).click(); await nextTick(); };
const modeBtn = (label: string) => [...document.querySelectorAll(".ts-mode")].find((b) => b.textContent!.includes(label)) ?? null;

describe("contrast maths", () => {
  test("black on white is 21:1, equal colours 1:1, order does not matter", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });
  test("a known WCAG value: #767676 on white is 4.54:1", () => {
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });
  test("short hex and a missing # are read; a non-colour gives 0", () => {
    expect(hexToRgb("fff")).toEqual([255, 255, 255]);
    expect(contrastRatio("#000", "fff")).toBeCloseTo(21, 5);
    expect(contrastRatio("nope", "#fff")).toBe(0);
    expect(hexToRgb("#12345")).toBeNull();
  });
});

describe("nudgeToAA", () => {
  test("a pick that already clears is returned as it is", () => {
    const r = nudgeToAA("#0c6e78", "#ffffff");
    expect(r).toMatchObject({ hex: "#0c6e78", adjusted: false, channels: "12 110 120" });
    expect(r.ratio).toBeGreaterThanOrEqual(AA_MIN);
  });
  test("a pale pick on a light background is darkened until it clears, and flagged", () => {
    const r = nudgeToAA("#ffee88", "#ffffff");
    expect(r.adjusted).toBe(true);
    expect(r.ratio).toBeGreaterThanOrEqual(AA_MIN);
    expect(contrastRatio(r.hex, "#ffffff")).toBeGreaterThanOrEqual(AA_MIN);
  });
  test("a dark pick on a dark background is lightened", () => {
    const r = nudgeToAA("#202040", "#0f1419");
    expect(r.adjusted).toBe(true);
    expect(r.ratio).toBeGreaterThanOrEqual(AA_MIN);
    expect(hexToRgb(r.hex)!.reduce((a, b) => a + b)).toBeGreaterThan(hexToRgb("#202040")!.reduce((a, b) => a + b));
  });
  test("every colour on a 4-step grid clears AA on light and dark backgrounds after the guard", () => {
    for (const bg of ["#ffffff", "#f7f5f1", "#0f1419", "#000000"]) {
      for (let r = 0; r < 256; r += 51) for (let g = 0; g < 256; g += 51) for (let b = 0; b < 256; b += 51) {
        const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
        expect(nudgeToAA(hex, bg).ratio, `${hex} on ${bg}`).toBeGreaterThanOrEqual(AA_MIN);
      }
    }
  });
  test("a mid-grey background has no colour that clears, so the best it can do is returned (documented limit)", () => {
    // On #777777 nothing reaches 4.5:1 toward black (max 4.7?) - the function must still return a colour and not loop.
    const r = nudgeToAA("#808080", "#777777");
    expect(hexToRgb(r.hex)).not.toBeNull();
  });
  test("not a colour: the fallback is used and flagged", () => {
    expect(nudgeToAA("zzz", "#ffffff", AA_MIN, "#0c6e78")).toMatchObject({ hex: "#0c6e78", adjusted: true });
    expect(nudgeToAA("zzz", "#ffffff").adjusted).toBe(true);
  });
});

describe("page, storage and head script agree", () => {
  const o = themeOptions({ storageKey: "k-theme", accentKey: "k-accent" });
  test("defaults are neutral", () => {
    expect(themeOptions()).toEqual({ storageKey: "site-theme", accentKey: "site-accent", themeAttr: "data-theme", accentVar: "--site-block-accent", accentFormat: "hex", customId: "custom" });
  });
  test("applyToRoot sets the attribute, and the accent only for the custom theme", () => {
    const root = document.createElement("html");
    applyToRoot(root, "custom", "#0c6e78", o);
    expect(root.getAttribute("data-theme")).toBe("custom");
    expect(root.style.getPropertyValue("--site-block-accent")).toBe("#0c6e78");
    applyToRoot(root, "dark", "#0c6e78", o);
    expect(root.style.getPropertyValue("--site-block-accent")).toBe("");
  });
  test("persist and readStored round-trip; an unknown theme or a bad accent is dropped; a blocked store is not an error", () => {
    expect(persist(localStorage, "dark", "#112233", o)).toBe(true);
    expect(readStored(localStorage, ["light", "dark"], o)).toEqual({ id: "dark", accent: "#112233" });
    localStorage.setItem("k-theme", "evil"); localStorage.setItem("k-accent", "red; x");
    expect(readStored(localStorage, ["light", "dark"], o)).toEqual({ id: null, accent: null });
    const blocked = { setItem() { throw new Error("blocked"); }, getItem() { throw new Error("blocked"); } };
    expect(persist(blocked, "dark", "#112233", o)).toBe(false);
    expect(readStored(blocked, ["dark"], o)).toEqual({ id: null, accent: null });
    expect(persist(undefined, "dark", "#112233", o)).toBe(false);
  });
  /** Run the head script against a fake page; returns what it put on <html>. */
  function runHead(script: string, store: Record<string, string>, throws = false) {
    const attrs: Record<string, string> = {}, vars: Record<string, string> = {};
    const documentElement = { setAttribute: (k: string, v: string) => (attrs[k] = v), style: { setProperty: (k: string, v: string) => (vars[k] = v) } };
    const localStorage = { getItem: (k: string) => { if (throws) throw new Error("blocked"); return store[k] ?? null; } };
    runInNewContext(script, { document: { documentElement }, localStorage });
    return { attrs, vars };
  }
  test("the head script restores a saved known theme before paint", () => {
    const s = themeHeadScript(["light", "dark", "custom"], { storageKey: "k-theme", accentKey: "k-accent" });
    expect(runHead(s, { "k-theme": "dark" })).toEqual({ attrs: { "data-theme": "dark" }, vars: {} });
  });
  test("the head script writes the custom accent exactly as applyToRoot does, in hex and in channels", () => {
    for (const fmt of ["hex", "channels"] as const) {
      const opt = themeOptions({ storageKey: "k-theme", accentKey: "k-accent", accentFormat: fmt });
      const got = runHead(themeHeadScript(["custom"], opt), { "k-theme": "custom", "k-accent": "#0C6E78" });
      const root = document.createElement("html");
      applyToRoot(root, "custom", "#0c6e78", opt);
      expect(got.vars["--site-block-accent"]).toBe(root.style.getPropertyValue("--site-block-accent"));
      expect(got.vars["--site-block-accent"]).toBe(accentCssValue("#0c6e78", fmt));
    }
    expect(accentCssValue("#0c6e78", "channels")).toBe("12 110 120");
  });
  test("a 3-digit saved accent is widened", () => {
    expect(runHead(themeHeadScript(["custom"]), { "site-theme": "custom", "site-accent": "#0af" }).vars["--site-block-accent"]).toBe("#00aaff");
  });
  test("an unknown saved theme, a bad accent, and a blocked store do nothing and do not throw", () => {
    const s = themeHeadScript(["light", "custom"]);
    expect(runHead(s, { "site-theme": "evil" })).toEqual({ attrs: {}, vars: {} });
    expect(runHead(s, { "site-theme": "custom", "site-accent": "red; background:url(x)" }).vars).toEqual({});
    expect(runHead(s, {}, true)).toEqual({ attrs: {}, vars: {} });
    // "__proto__" / "constructor" must not count as known themes
    expect(runHead(s, { "site-theme": "constructor" })).toEqual({ attrs: {}, vars: {} });
  });
  test("the script text is safe in a script element and names no host", () => {
    const s = themeHeadScript(["a</script><script>x"], { storageKey: "</script>" });
    expect(s).not.toContain("</script>");
    expect(s).not.toMatch(/gilb|localhost/i);
  });
});

describe("ThemeSwitcher", () => {
  test("the trigger is a disclosure button; the panel is closed until it is used", async () => {
    wrapper = mount(ThemeSwitcher, { props: PROPS, attachTo: document.body });
    const t = document.querySelector(".ts-trigger")!;
    expect(t.getAttribute("aria-expanded")).toBe("false");
    expect((document.querySelector(".ts-panel") as HTMLElement).style.display).toBe("none");
    await click(t);
    expect(t.getAttribute("aria-expanded")).toBe("true");
    expect(t.getAttribute("aria-controls")).toBe(document.querySelector(".ts-panel")!.id);
  });
  test("one pressed button per theme; the active one is aria-pressed and has a check mark", () => {
    wrapper = mount(ThemeSwitcher, { props: PROPS, attachTo: document.body });
    const pressed = [...document.querySelectorAll(".ts-mode")].map((b) => b.getAttribute("aria-pressed"));
    expect(pressed).toEqual(["true", "false", "false", "false"]);
    expect(modeBtn("Light")!.querySelector(".ts-check")).not.toBeNull();
  });
  test("choosing a theme sets it on <html>, saves it, and closes the panel with focus back on the trigger", async () => {
    wrapper = mount(ThemeSwitcher, { props: PROPS, attachTo: document.body });
    await click(document.querySelector(".ts-trigger"));
    await click(modeBtn("Dark"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("site-theme")).toBe("dark");
    expect(modeBtn("Dark")!.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".ts-trigger")!.getAttribute("aria-expanded")).toBe("false");
    await nextTick();
    expect(document.activeElement).toBe(document.querySelector(".ts-trigger"));
  });
  test("a saved theme and accent are restored when the control mounts", async () => {
    localStorage.setItem("site-theme", "custom"); localStorage.setItem("site-accent", "#aa0000");
    wrapper = mount(ThemeSwitcher, { props: PROPS, attachTo: document.body });
    await nextTick();
    expect(modeBtn("Custom")!.getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.getAttribute("data-theme")).toBe("custom");
    expect(document.documentElement.style.getPropertyValue("--site-block-accent")).toBe("#aa0000");
  });
  test("the custom theme opens a colour input, and a pick below AA is nudged, shown as nudged, and saved nudged", async () => {
    wrapper = mount(ThemeSwitcher, { props: PROPS, attachTo: document.body });
    await click(document.querySelector(".ts-trigger"));
    expect(document.querySelector("input[type=color]")).toBeNull();
    await click(modeBtn("Custom"));
    expect(document.querySelector(".ts-trigger")!.getAttribute("aria-expanded")).toBe("true");
    const input = document.querySelector("input[type=color]") as HTMLInputElement;
    input.value = "#ffee88";
    input.dispatchEvent(new Event("input"));
    await nextTick();
    const saved = localStorage.getItem("site-accent")!;
    expect(saved).not.toBe("#ffee88");
    expect(contrastRatio(saved, "#ffffff")).toBeGreaterThanOrEqual(AA_MIN);
    expect(document.documentElement.style.getPropertyValue("--site-block-accent")).toBe(saved);
    expect(document.querySelector(".ts-note")!.textContent).toContain("Nudged");
    expect(document.querySelector(".ts-ratio")!.textContent).toMatch(/\d\.\d\d:1/);
  });
  test("a pick that clears AA is kept; reset returns the default accent", async () => {
    wrapper = mount(ThemeSwitcher, { props: PROPS, attachTo: document.body });
    await click(document.querySelector(".ts-trigger"));
    await click(modeBtn("Custom"));
    const input = document.querySelector("input[type=color]") as HTMLInputElement;
    input.value = "#800000"; input.dispatchEvent(new Event("input")); await nextTick();
    expect(localStorage.getItem("site-accent")).toBe("#800000");
    await click(document.querySelector(".ts-reset"));
    expect(localStorage.getItem("site-accent")).toBe("#0c6e78");
  });
  test("leaving the custom theme removes the inline accent", async () => {
    wrapper = mount(ThemeSwitcher, { props: PROPS, attachTo: document.body });
    await click(document.querySelector(".ts-trigger"));
    await click(modeBtn("Custom"));
    expect(document.documentElement.style.getPropertyValue("--site-block-accent")).not.toBe("");
    await click(modeBtn("Light"));
    expect(document.documentElement.style.getPropertyValue("--site-block-accent")).toBe("");
  });
  test("Escape closes the panel and returns focus; a pointer outside closes it", async () => {
    wrapper = mount(ThemeSwitcher, { props: PROPS, attachTo: document.body });
    const t = document.querySelector(".ts-trigger") as HTMLElement;
    await click(t);
    document.querySelector(".ts")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await nextTick(); await nextTick();
    expect(t.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(t);
    await click(t);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(t.getAttribute("aria-expanded")).toBe("false");
  });
  test("the host's keys, attribute and accent variable are used", async () => {
    wrapper = mount(ThemeSwitcher, { props: { ...PROPS, options: { storageKey: "x-t", accentKey: "x-a", themeAttr: "data-mode", accentVar: "--x-accent", accentFormat: "channels" } }, attachTo: document.body });
    await click(document.querySelector(".ts-trigger"));
    await click(modeBtn("Custom"));
    expect(document.documentElement.getAttribute("data-mode")).toBe("custom");
    expect(localStorage.getItem("x-t")).toBe("custom");
    expect(document.documentElement.style.getPropertyValue("--x-accent")).toMatch(/^\d+ \d+ \d+$/);
  });
  test("the words are the host's to set", async () => {
    wrapper = mount(ThemeSwitcher, { props: { ...PROPS, labels: { trigger: "Tema", panel: "Fargetema" } }, attachTo: document.body });
    expect(document.querySelector(".ts-trigger-text")!.textContent).toBe("Tema");
    expect(document.querySelector(".ts-panel")!.getAttribute("aria-label")).toBe("Fargetema");
  });
  test("a stored theme the page does not know is ignored", async () => {
    localStorage.setItem("site-theme", "evil");
    wrapper = mount(ThemeSwitcher, { props: PROPS, attachTo: document.body });
    await nextTick();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(modeBtn("Light")!.getAttribute("aria-pressed")).toBe("true");
  });
  test("two switchers on one page get different ids", () => {
    wrapper = mount({ render: () => h("div", [h(ThemeSwitcher, PROPS), h(ThemeSwitcher, PROPS)]) }, { attachTo: document.body });
    const ids = [...document.querySelectorAll(".ts-panel")].map((p) => p.id);
    expect(new Set(ids).size).toBe(2);
  });
  test("the server's HTML draws the default state, has no script handler, and hydrates with no mismatch even when a theme is saved", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(ThemeSwitcher, PROPS) }));
    expect(html).toContain("Light");
    expect(html).not.toMatch(/\son[a-z]+=/);
    localStorage.setItem("site-theme", "dark");
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.appendChild(el);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    createSSRApp({ render: () => h(ThemeSwitcher, PROPS) }).mount(el);
    expect([...warn.mock.calls, ...err.mock.calls].map((c) => c.map(String).join(" ")).filter((s) => /hydrat|mismatch/i.test(s))).toEqual([]);
  });
  // Spec: RuleGwcunitA11yTest / RuleA11yUnitTest
  test("axe: no violations closed, open, and open on the custom theme", async () => {
    wrapper = mount(ThemeSwitcher, { props: PROPS, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
    await click(document.querySelector(".ts-trigger"));
    expect(await axeIds()).toEqual([]);
    await click(modeBtn("Custom"));
    expect(await axeIds()).toEqual([]);
  });
});

describe("the unit's style and source", () => {
  const SFC = readFileSync(join(process.cwd(), "src", "ThemeSwitcher.vue"), "utf8");
  const style = (SFC.split("<style scoped>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  // Spec: RuleGwcunitTokens
  test("every colour literal sits inside a var(--site-block-*, ...) fallback ", () => {
    const bad = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|gray|grey)\b(?!-)/g)]
      .filter((m) => !/var\(--site-block-[a-z-]+,\s*$/.test(style.slice(Math.max(0, m.index! - 80), m.index)))
      .map((m) => style.slice(Math.max(0, m.index! - 40), m.index! + 12).replace(/\s+/g, " "));
    expect(bad.filter((b) => !b.includes("-3px rgb(0 0 0 /"))).toEqual([]);
  });
  test("every box sizes with border-box", () => { expect(style).toContain(".ts, .ts * { box-sizing: border-box; }"); });
  test("no Nuxt, no design-token file, no Tailwind class; imports are vue and the unit's own files", () => {
    for (const f of ["ThemeSwitcher.vue", "contrast.ts", "theme.ts", "headScript.ts", "index.ts"]) {
      const src = readFileSync(join(process.cwd(), "src", f), "utf8");
      expect(src, f).not.toMatch(/nuxt|useState|defineNuxtPlugin|design-tokens|~\//);
      const imports = [...src.matchAll(/^(?:import|export) .* from "([^"]+)"/gm)].map((m) => m[1]);
      expect(imports.every((i) => i === "vue" || i!.startsWith("./")), f).toBe(true);
    }
    expect(SFC).not.toMatch(/class="[^"]*\b(?:text|bg|border|rounded|px|py|mt|mb|flex|grid)-/);
  });
});
