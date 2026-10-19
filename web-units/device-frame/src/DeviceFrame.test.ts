// Spec: Rule_Code_gwcunit (RuleGwcunitA11yTest, RuleGwcunitTokens, RuleGwcunitStackFit), Rule_Code_accessibility
// (RuleA11yAltText) and the proposal PROPOSAL-2026-10-20-WebsitesGilbComponentsIntoLibrary-GilbPlatformCode (row 5).
// Tests written new for this unit.
import { afterEach, describe, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import DeviceFrame from "./DeviceFrame.vue";

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; vi.restoreAllMocks(); });
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);
const BROWSER = { image: "/shots/a.png", alt: "The Example home page", domain: "example.test" };
const PHONE = { image: "/shots/p.png", alt: "The Example app home screen", device: "iphone" as const };

describe("DeviceFrame, browser", () => {
  test("three dots and the domain sit over the picture; the picture has its alt text", () => {
    wrapper = mount(DeviceFrame, { props: BROWSER, attachTo: document.body });
    expect(document.querySelectorAll(".df-dot")).toHaveLength(3);
    expect(document.querySelector(".df-domain")!.textContent).toBe("example.test");
    const img = document.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("The Example home page");
    expect(img.getAttribute("src")).toBe("/shots/a.png");
  });
  test("the bar is hidden from screen readers, so the picture's alt is all they get", () => {
    wrapper = mount(DeviceFrame, { props: BROWSER, attachTo: document.body });
    expect(document.querySelector(".df-bar")!.getAttribute("aria-hidden")).toBe("true");
  });
  test("without a url the frame is a plain block; with one it is a link that opens in a new tab", () => {
    wrapper = mount(DeviceFrame, { props: BROWSER, attachTo: document.body });
    expect(document.querySelector("a")).toBeNull();
    wrapper.unmount();
    wrapper = mount(DeviceFrame, { props: { ...BROWSER, url: "https://example.test/" }, attachTo: document.body });
    const a = document.querySelector("a")!;
    expect(a.getAttribute("href")).toBe("https://example.test/");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener");
  });
  test("a smaller picture is offered under 640 px only when given", () => {
    wrapper = mount(DeviceFrame, { props: BROWSER, attachTo: document.body });
    expect(document.querySelector("source")).toBeNull();
    wrapper.unmount();
    wrapper = mount(DeviceFrame, { props: { ...BROWSER, imagePhone: "/shots/a-s.png" }, attachTo: document.body });
    const s = document.querySelector("source")!;
    expect(s.getAttribute("media")).toBe("(max-width: 639px)");
    expect(s.getAttribute("srcset")).toBe("/shots/a-s.png");
  });
  test("lazy by default, eager when asked", () => {
    wrapper = mount(DeviceFrame, { props: BROWSER, attachTo: document.body });
    expect(document.querySelector("img")!.getAttribute("loading")).toBe("lazy");
    wrapper.unmount();
    wrapper = mount(DeviceFrame, { props: { ...BROWSER, eager: true }, attachTo: document.body });
    expect(document.querySelector("img")!.getAttribute("loading")).toBe("eager");
  });
  test("the capture's size is set only when given (then the frame holds its final size before the picture loads)", () => {
    wrapper = mount(DeviceFrame, { props: BROWSER, attachTo: document.body });
    expect(document.querySelector("img")!.hasAttribute("width")).toBe(false);
    wrapper.unmount();
    wrapper = mount(DeviceFrame, { props: { ...BROWSER, imageWidth: 2880, imageHeight: 1800 }, attachTo: document.body });
    expect(document.querySelector("img")!.getAttribute("width")).toBe("2880");
    expect(document.querySelector("img")!.getAttribute("height")).toBe("1800");
  });
  test("no domain draws no pill", () => {
    wrapper = mount(DeviceFrame, { props: { image: "/a.png", alt: "x" }, attachTo: document.body });
    expect(document.querySelector(".df-domain")).toBeNull();
  });
});

describe("DeviceFrame, phone", () => {
  test("the island is drawn on a status bar and the picture starts below it", () => {
    wrapper = mount(DeviceFrame, { props: PHONE, attachTo: document.body });
    expect(document.querySelector(".df-phone-island")).not.toBeNull();
    expect(document.querySelector(".df-phone-statusbar")!.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector("img")!.classList.contains("df-has-island")).toBe(true);
  });
  test("the bezel top draws no island and the picture fills the screen", () => {
    wrapper = mount(DeviceFrame, { props: { ...PHONE, chrome: "bezel" }, attachTo: document.body });
    expect(document.querySelector(".df-phone-island")).toBeNull();
    expect(document.querySelector("img")!.classList.contains("df-has-island")).toBe(false);
  });
  test("the phone has no browser bar and no domain, and the picture is 780 by 1688 unless told", () => {
    wrapper = mount(DeviceFrame, { props: { ...PHONE, domain: "ignored.test" }, attachTo: document.body });
    expect(document.querySelector(".df-bar")).toBeNull();
    expect(document.body.textContent).not.toContain("ignored.test");
    const img = document.querySelector("img")!;
    expect([img.getAttribute("width"), img.getAttribute("height")]).toEqual(["780", "1688"]);
    wrapper.unmount();
    wrapper = mount(DeviceFrame, { props: { ...PHONE, phoneWidth: 390, phoneHeight: 844 }, attachTo: document.body });
    expect([document.querySelector("img")!.getAttribute("width"), document.querySelector("img")!.getAttribute("height")]).toEqual(["390", "844"]);
  });
  test("the phone can be a link too", () => {
    wrapper = mount(DeviceFrame, { props: { ...PHONE, url: "https://example.test/app" }, attachTo: document.body });
    expect(document.querySelector("a.df-phone")).not.toBeNull();
  });
});

describe("DeviceFrame, rendering and accessibility", () => {
  test.each([["browser", BROWSER], ["phone", PHONE]])("the server's HTML for the %s holds the picture and no script handler", async (_n, props) => {
    const html = await renderToString(createSSRApp({ render: () => h(DeviceFrame, props) }));
    expect(html).toContain(props.image);
    expect(html).toContain(props.alt);
    expect(html).not.toMatch(/\son[a-z]+=/);
  });
  test.each([["browser", BROWSER], ["phone", PHONE]])("the server's HTML for the %s hydrates with no mismatch warning", async (_n, props) => {
    const html = await renderToString(createSSRApp({ render: () => h(DeviceFrame, props) }));
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.appendChild(el);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    createSSRApp({ render: () => h(DeviceFrame, props) }).mount(el);
    expect([...warn.mock.calls, ...err.mock.calls].map((c) => c.map(String).join(" ")).filter((s) => /hydrat|mismatch/i.test(s))).toEqual([]);
  });
  // Spec: RuleGwcunitA11yTest / RuleA11yUnitTest
  test("axe: no violations for the browser, the phone with island, the bezel phone, and each as a link", async () => {
    const all: InstanceType<typeof DeviceFrame>['$props'][] = [BROWSER, PHONE, { ...PHONE, chrome: "bezel" as const }, { ...BROWSER, url: "https://example.test/" }, { ...PHONE, url: "https://example.test/" }];
    for (const props of all) {
      wrapper = mount(DeviceFrame, { props, attachTo: document.body });
      expect(await axeIds()).toEqual([]);
      wrapper.unmount();
    }
  });
  test("an empty alt is drawn as given (a decorative picture)", () => {
    wrapper = mount(DeviceFrame, { props: { ...BROWSER, alt: "" }, attachTo: document.body });
    expect(document.querySelector("img")!.getAttribute("alt")).toBe("");
  });
});

describe("the unit's style", () => {
  const SFC = readFileSync(join(process.cwd(), "src", "DeviceFrame.vue"), "utf8");
  const style = (SFC.split("<style scoped>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  // Spec: RuleGwcunitTokens
  test("every colour literal sits inside a var(--site-block-*, ...) fallback", () => {
    const bad = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|gray|grey)\b(?!-)/g)]
      .filter((m) => !/var\(--site-block-[a-z-]+,\s*$/.test(style.slice(Math.max(0, m.index! - 80), m.index)))
      .map((m) => style.slice(Math.max(0, m.index! - 40), m.index! + 10).replace(/\s+/g, " "));
    expect(bad).toEqual([]);
  });
  test("every box sizes with border-box, so padding never widens it", () => {
    expect(style).toContain(".df, .df * { box-sizing: border-box; }");
  });
  test("the hover lift is turned off under reduced motion", () => {
    expect(style).toMatch(/prefers-reduced-motion: reduce\) \{ a\.df-link:hover \{ transform: none; \} \}/);
  });
  test("the unit names no Tailwind class, no @nuxt/image and imports nothing but vue and its own files", () => {
    expect(SFC).not.toMatch(/class="[^"]*\b(?:text|bg|border|rounded|px|py|mt|mb|flex|grid)-/);
    expect(SFC).not.toContain("NuxtImg");
    const imports = [...SFC.matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]);
    expect(imports.every((i) => i === "vue" || i!.startsWith("./"))).toBe(true);
  });
});
