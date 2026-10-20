// Spec: Rule_Code_gwcunit (RuleGwcunitA11yTest, RuleGwcunitTokens, RuleGwcunitStackFit) and the proposal
// PROPOSAL-2026-10-20-SkaldenComponentsIntoLibrary-GilbPlatformCode (row 4). Tests written new for this unit.
import { afterEach, describe, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import AppStoreButton from "./AppStoreButton.vue";

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; vi.restoreAllMocks(); });
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);
const HREF = "https://apps.example.test/app/id1";
const mountIt = (props: Record<string, unknown> = {}) => (wrapper = mount(AppStoreButton, { props: { href: HREF, ...props }, attachTo: document.body }));

describe("AppStoreButton", () => {
  test("a link to the store address that opens a new tab with noopener, with the default words", () => {
    mountIt();
    const a = document.querySelector("a")!;
    expect(a.getAttribute("href")).toBe(HREF);
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener");
    expect(a.textContent!.trim()).toBe("Get the app");
  });
  test.each([[""], [undefined]])("with no address (%s) nothing is drawn", (href) => {
    wrapper = mount(AppStoreButton, { props: { href }, attachTo: document.body });
    expect(document.querySelector("a")).toBeNull();
    expect(document.querySelector("svg")).toBeNull();
  });
  test("the words are the host's; the name is the visible words unless a longer one is given", () => {
    mountIt({ label: "Last ned appen" });
    expect(document.querySelector("a")!.hasAttribute("aria-label")).toBe(false);
    expect(document.querySelector("a")!.textContent!.trim()).toBe("Last ned appen");
    wrapper!.unmount();
    mountIt({ label: "Get the app", ariaLabel: "Get Example on the App Store" });
    expect(document.querySelector("a")!.getAttribute("aria-label")).toBe("Get Example on the App Store");
  });
  test("a longer aria-label still contains the visible words (label in name)", () => {
    mountIt({ label: "Get the app", ariaLabel: "Get the app: Example on the App Store" });
    expect(document.querySelector("a")!.getAttribute("aria-label")!.toLowerCase()).toContain("get the app");
  });
  test("variant sets the size class; header is the default", () => {
    mountIt();
    expect(document.querySelector("a")!.classList.contains("asb-header")).toBe(true);
    wrapper!.unmount();
    mountIt({ variant: "inline" });
    expect(document.querySelector("a")!.classList.contains("asb-inline")).toBe(true);
  });
  test("a click emits the address, the words and the location, and does not stop the link", () => {
    mountIt({ location: "footer" });
    const a = document.querySelector("a")!;
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    a.addEventListener("click", (e) => e.preventDefault()); // jsdom does not navigate; this only keeps it quiet
    a.dispatchEvent(ev);
    expect(wrapper!.emitted("click")).toEqual([[{ href: HREF, label: "Get the app", location: "footer" }]]);
    // The unit's own handler never calls preventDefault: only the test's listener above did.
    expect(readFileSync(join(process.cwd(), "src", "AppStoreButton.vue"), "utf8")).not.toMatch(/preventDefault|stopPropagation/);
  });
  test("the glyph is hidden from screen readers and cannot take focus", () => {
    mountIt();
    const s = document.querySelector("svg")!;
    expect(s.getAttribute("aria-hidden")).toBe("true");
    expect(s.getAttribute("focusable")).toBe("false");
  });
  test("the server's HTML holds the link and no script handler; with no address it holds no link", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(AppStoreButton, { href: HREF }) }));
    expect(html).toContain(HREF);
    expect(html).not.toMatch(/\son[a-z]+=/);
    expect(await renderToString(createSSRApp({ render: () => h(AppStoreButton, {}) }))).not.toContain("<a");
  });
  test("the server's HTML hydrates in the browser with no mismatch warning", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(AppStoreButton, { href: HREF }) }));
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.appendChild(el);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    createSSRApp({ render: () => h(AppStoreButton, { href: HREF }) }).mount(el);
    expect([...warn.mock.calls, ...err.mock.calls].map((c) => c.map(String).join(" ")).filter((s) => /hydrat|mismatch/i.test(s))).toEqual([]);
  });
  // Spec: RuleGwcunitA11yTest / RuleA11yUnitTest
  test("axe: no violations, for each variant and with a longer name (jsdom; contrast is measured in the browser run)", async () => {
    for (const props of [{}, { variant: "inline" }, { ariaLabel: "Get the app on the store" }]) {
      mountIt(props);
      expect(await axeIds()).toEqual([]);
      wrapper!.unmount();
    }
  });
});

describe("the unit's style", () => {
  const SFC = readFileSync(join(process.cwd(), "src", "AppStoreButton.vue"), "utf8");
  const style = (SFC.split("<style scoped>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  // Spec: RuleGwcunitTokens
  test("every colour literal sits inside a var(--site-block-*, ...) fallback", () => {
    const bad = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|gray|grey)\b(?!-)/g)]
      .filter((m) => !/var\(--site-block-[a-z-]+,\s*$/.test(style.slice(Math.max(0, m.index! - 80), m.index)))
      .map((m) => style.slice(Math.max(0, m.index! - 40), m.index! + 10).replace(/\s+/g, " "));
    expect(bad).toEqual([]);
  });
  test("every box sizes with border-box, and the tap target is at least 44 px", () => {
    expect(style).toContain(".asb, .asb * { box-sizing: border-box; }");
    expect(style).toContain("min-height: 44px");
  });
  test("the fade is turned off under reduced motion", () => {
    expect(style).toMatch(/prefers-reduced-motion: reduce\) \{ \.asb \{ transition: none; \} \}/);
  });
  test("the unit names no Tailwind class, no posthog, no app config, no i18n and imports nothing but vue-free own files", () => {
    expect(SFC).not.toMatch(/class="[^"]*\b(?:text|bg|border|rounded|px|py|mt|mb|flex|grid)-/);
    expect(SFC).not.toMatch(/posthog|useAppConfig|useI18n|@apply|theme\(|window\./i);
    const imports = [...SFC.matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]);
    expect(imports.every((i) => i === "vue" || i!.startsWith("./"))).toBe(true);
  });
});
