// Spec: Rule_Code_gwcunit (RuleGwcunitA11yTest, RuleGwcunitTokens, RuleGwcunitStackFit) and the proposal
// PROPOSAL-2026-10-20-SkaldenComponentsIntoLibrary-GilbPlatformCode (row 3). Tests written new for this unit.
import { afterEach, describe, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, h, nextTick } from "vue";
import { renderToString } from "vue/server-renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import LanguageSwitcher from "./LanguageSwitcher.vue";

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; vi.restoreAllMocks(); });
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);
const LANGS = [
  { code: "en", name: "English", flag: "us" },
  { code: "nb", name: "Norsk", flag: "no" },
  { code: "de", name: "Deutsch", flag: "de" },
];
const mountIt = (props: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  (wrapper = mount(LanguageSwitcher, { props: { languages: LANGS, current: "en", ...props }, attachTo: document.body, ...extra }));
const btn = () => document.querySelector(".ls-button") as HTMLButtonElement;
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

describe("LanguageSwitcher, closed", () => {
  test("a button named for the current language, collapsed, controlling the list; no list in the page", () => {
    mountIt();
    expect(btn().getAttribute("aria-label")).toBe("Language: English. Change language");
    expect(btn().getAttribute("aria-expanded")).toBe("false");
    expect(btn().getAttribute("aria-controls")).toBeTruthy();
    expect(document.querySelector("ul")).toBeNull();
  });
  test("it is a disclosure, not a listbox: no listbox, option or menu roles and no aria-haspopup", () => {
    mountIt();
    btn().click();
    return nextTick().then(() => {
      expect(document.querySelector("[role=listbox],[role=option],[role=menu],[role=menuitem]")).toBeNull();
      expect(btn().hasAttribute("aria-haspopup")).toBe(false);
    });
  });
  test("flags are data: the same code can show any flag, and the current flag is the one given", () => {
    mountIt({ languages: [{ code: "en", name: "English", flag: "gb" }, { code: "nb", name: "Norsk" }] });
    expect(btn().querySelector("svg.fi")!.getAttribute("viewBox")).toBe("0 0 60 30");
  });
  test("an unknown flag key, or none, is a badge with the first two letters", async () => {
    mountIt({ languages: [{ code: "en", name: "English" }, { code: "pt-br", name: "Português", flag: "br" }, { code: "sv", name: "Svenska" }] });
    btn().click(); await nextTick();
    expect([...document.querySelectorAll(".fi-badge")].map((e) => e.textContent)).toEqual(["EN", "BR", "SV"]);
  });
  test("a code the list does not hold falls back to the first language", () => {
    mountIt({ current: "xx" });
    expect(btn().getAttribute("aria-label")).toContain("English");
  });
  test("no languages draws nothing", () => {
    mountIt({ languages: [] });
    expect(document.body.querySelector(".ls")).toBeNull();
  });
  test("the button's words are the host's", () => {
    mountIt({ buttonLabel: "Språk: {name}. Bytt språk" });
    expect(btn().getAttribute("aria-label")).toBe("Språk: English. Bytt språk");
  });
});

describe("LanguageSwitcher, open", () => {
  test("a click opens a list of the OTHER languages, as buttons, with the language set on each; focus stays on the button", async () => {
    mountIt();
    btn().focus(); btn().click(); await nextTick();
    expect(btn().getAttribute("aria-expanded")).toBe("true");
    const items = [...document.querySelectorAll(".ls-item")];
    expect(items.map((i) => i.textContent!.trim())).toEqual(["Norsk", "Deutsch"]);
    expect(items.every((i) => i.tagName === "BUTTON")).toBe(true);
    expect(items.map((i) => i.getAttribute("lang"))).toEqual(["nb", "de"]);
    expect(document.querySelector("ul")!.id).toBe(btn().getAttribute("aria-controls"));
    expect(document.activeElement).toBe(btn());
  });
  test("choosing emits select with the code, closes the list and returns focus to the button", async () => {
    mountIt();
    btn().click(); await nextTick();
    (document.querySelectorAll(".ls-item")[0] as HTMLElement).click(); await nextTick();
    expect(wrapper!.emitted("select")).toEqual([["nb"]]);
    expect(document.querySelector("ul")).toBeNull();
    expect(document.activeElement).toBe(btn());
  });
  test("with hrefFor each item is a link with its address and hreflang, and select is still emitted", async () => {
    mountIt({ hrefFor: (c: string) => `/${c}/` });
    btn().click(); await nextTick();
    const a = [...document.querySelectorAll("a.ls-item")] as HTMLAnchorElement[];
    expect(a.map((x) => x.getAttribute("href"))).toEqual(["/nb/", "/de/"]);
    expect(a.map((x) => x.getAttribute("hreflang"))).toEqual(["nb", "de"]);
    a[1]!.addEventListener("click", (e) => e.preventDefault());
    a[1]!.click(); await nextTick();
    expect(wrapper!.emitted("select")).toEqual([["de"]]);
  });
  test("Escape closes it and returns focus to the button, even when focus was still on the page", async () => {
    mountIt();
    btn().click(); await nextTick();
    (document.activeElement as HTMLElement).blur();
    key(document.body, "Escape"); await nextTick();
    expect(document.querySelector("ul")).toBeNull();
    expect(btn().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(btn());
  });
  test("Escape with focus inside the list closes it and returns focus", async () => {
    mountIt();
    btn().click(); await nextTick();
    (document.querySelector(".ls-item") as HTMLElement).focus();
    key(document.activeElement!, "Escape"); await nextTick();
    expect(document.querySelector("ul")).toBeNull();
    expect(document.activeElement).toBe(btn());
  });
  test("a press outside closes it without moving focus; a press inside does not", async () => {
    mountIt();
    const other = document.createElement("button"); document.body.appendChild(other);
    btn().click(); await nextTick();
    document.querySelector("ul")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(document.querySelector("ul")).not.toBeNull();
    other.dispatchEvent(new Event("pointerdown", { bubbles: true })); await nextTick();
    expect(document.querySelector("ul")).toBeNull();
  });
  test("focus moving to something outside (Tab out) closes it", async () => {
    mountIt();
    const other = document.createElement("button"); document.body.appendChild(other);
    btn().click(); await nextTick();
    other.focus(); await nextTick();
    expect(document.querySelector("ul")).toBeNull();
    expect(document.activeElement).toBe(other);
  });
  test("ArrowDown on the button opens it and focuses the first item; arrows, Home and End move and wrap", async () => {
    mountIt();
    btn().focus(); key(btn(), "ArrowDown"); await nextTick(); await nextTick();
    const items = [...document.querySelectorAll(".ls-item")] as HTMLElement[];
    expect(document.activeElement).toBe(items[0]);
    key(items[0]!, "ArrowDown"); expect(document.activeElement).toBe(items[1]);
    key(items[1]!, "ArrowDown"); expect(document.activeElement).toBe(items[0]);
    key(items[0]!, "ArrowUp"); expect(document.activeElement).toBe(items[1]);
    key(items[1]!, "Home"); expect(document.activeElement).toBe(items[0]);
    key(items[0]!, "End"); expect(document.activeElement).toBe(items[1]);
  });
  test("ArrowUp on the button opens it and focuses the last item", async () => {
    mountIt();
    btn().focus(); key(btn(), "ArrowUp"); await nextTick(); await nextTick();
    const items = [...document.querySelectorAll(".ls-item")];
    expect(document.activeElement).toBe(items[items.length - 1]);
  });
  test("a custom flag slot replaces the drawn flag on the button and the items", async () => {
    mountIt({}, { slots: { flag: `<template #flag="{ language }"><i class="custom">{{ language.code }}</i></template>` } });
    btn().click(); await nextTick();
    expect([...document.querySelectorAll(".custom")].map((e) => e.textContent)).toEqual(["en", "nb", "de"]);
    expect(document.querySelector("svg.fi")).toBeNull();
  });
  test("the document listeners are removed when it closes and when it unmounts", async () => {
    const add = vi.spyOn(document, "addEventListener"); const rem = vi.spyOn(document, "removeEventListener");
    mountIt();
    btn().click(); await nextTick();
    expect(add.mock.calls.map((c) => c[0]).sort()).toEqual(["focusin", "keydown", "pointerdown"]);
    wrapper!.unmount(); wrapper = undefined;
    expect(rem.mock.calls.map((c) => c[0]).sort()).toEqual(["focusin", "keydown", "pointerdown"]);
  });
  test("placement start lines the list up with the button's left edge", async () => {
    mountIt({ placement: "start" });
    btn().click(); await nextTick();
    expect(document.querySelector("ul")!.classList.contains("ls-start")).toBe(true);
  });
});

describe("LanguageSwitcher, rendering and accessibility", () => {
  test("the server's HTML holds the button and no script handler", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(LanguageSwitcher, { languages: LANGS, current: "nb" }) }));
    expect(html).toContain("Language: Norsk. Change language");
    expect(html).not.toMatch(/\son[a-z]+=/);
    expect(html).not.toContain("<ul");
  });
  test("the server's HTML hydrates in the browser with no mismatch warning", async () => {
    const props = { languages: LANGS, current: "en" };
    const html = await renderToString(createSSRApp({ render: () => h(LanguageSwitcher, props) }));
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.appendChild(el);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    createSSRApp({ render: () => h(LanguageSwitcher, props) }).mount(el);
    expect([...warn.mock.calls, ...err.mock.calls].map((c) => c.map(String).join(" ")).filter((s) => /hydrat|mismatch/i.test(s))).toEqual([]);
  });
  // Spec: RuleGwcunitA11yTest / RuleA11yUnitTest
  test("axe: no violations closed, open with buttons, and open with links (jsdom; contrast is measured in the browser run)", async () => {
    mountIt();
    expect(await axeIds()).toEqual([]);
    btn().click(); await nextTick();
    expect(await axeIds()).toEqual([]);
    wrapper!.unmount(); document.body.innerHTML = "";
    mountIt({ hrefFor: (c: string) => `/${c}/` });
    btn().click(); await nextTick();
    expect(await axeIds()).toEqual([]);
  });
});

// Spec: WCAG 2.5.3 Label in Name (axe label-content-name-mismatch), Agent.Tester R1 D4: a language without a built-in
// flag is drawn as a text badge, whose text must be in the button's name.
describe("a language without a built-in flag", () => {
  const AR = [{ code: "en", name: "English", flag: "us" }, { code: "ar", name: "العربية" }, { code: "ja", name: "日本語", flag: "ja" }];
  test("the button's name starts with the badge text and axe finds no violation, closed and open, as buttons and as links", async () => {
    for (const hrefFor of [undefined, (c: string) => `/${c}/`]) {
      wrapper = mount(LanguageSwitcher, { props: { languages: AR, current: "ar", hrefFor }, attachTo: document.body });
      const b = document.querySelector(".ls-button") as HTMLElement;
      expect(b.textContent!.trim()).toBe("AR");
      expect(b.getAttribute("aria-label")).toBe("AR Language: العربية. Change language");
      expect(await axeIds()).toEqual([]);
      b.click(); await nextTick();
      expect(await axeIds()).toEqual([]);
      wrapper.unmount(); document.body.innerHTML = "";
    }
  });
  test("a badge from a two-letter flag key other than the code is named by the badge", () => {
    wrapper = mount(LanguageSwitcher, { props: { languages: AR, current: "ja" }, attachTo: document.body });
    expect(document.querySelector(".ls-button")!.getAttribute("aria-label")).toBe("JA Language: 日本語. Change language");
  });
  test("a built-in flag keeps the plain label, and a label that already starts with the badge is not doubled", () => {
    wrapper = mount(LanguageSwitcher, { props: { languages: AR, current: "en" }, attachTo: document.body });
    expect(document.querySelector(".ls-button")!.getAttribute("aria-label")).toBe("Language: English. Change language");
    wrapper.unmount();
    wrapper = mount(LanguageSwitcher, { props: { languages: AR, current: "ar", buttonLabel: "AR {name}" }, attachTo: document.body });
    expect(document.querySelector(".ls-button")!.getAttribute("aria-label")).toBe("AR العربية");
  });
});

describe("the unit's style", () => {
  const SFC = readFileSync(join(process.cwd(), "src", "LanguageSwitcher.vue"), "utf8");
  const style = (SFC.split("<style scoped>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  // Spec: RuleGwcunitTokens
  test("every colour literal sits inside a var(--site-block-*, ...) fallback", () => {
    const bad = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|gray|grey)\b(?!-)/g)]
      .filter((m) => !/var\(--site-block-[a-z-]+,\s*$/.test(style.slice(Math.max(0, m.index! - 80), m.index)))
      .map((m) => style.slice(Math.max(0, m.index! - 40), m.index! + 10).replace(/\s+/g, " "));
    expect(bad).toEqual([]);
  });
  test("every box sizes with border-box, so padding never widens it", () => {
    expect(style).toContain(".ls, .ls * { box-sizing: border-box; }");
  });
  test("transitions are turned off under reduced motion", () => {
    expect(style).toMatch(/prefers-reduced-motion: reduce\) \{ \.ls-button, \.ls-caret, \.ls-item \{ transition: none; \} \}/);
  });
  test("the unit names no Tailwind class, no i18n and imports nothing but vue and its own files", () => {
    expect(SFC).not.toMatch(/class="[^"]*\b(?:text|bg|border|rounded|px|py|mt|mb|flex|grid)-/);
    expect(SFC).not.toMatch(/useI18n|@apply|theme\(/);
    const imports = [...SFC.matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]);
    expect(imports.every((i) => i === "vue" || i!.startsWith("./"))).toBe(true);
  });
  test("no code hard-wires a language to a flag", () => {
    expect(SFC).not.toMatch(/=== ?["'](en|nb)["']/);
  });
});
