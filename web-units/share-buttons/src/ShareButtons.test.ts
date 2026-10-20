// Spec: Rule_Code_gwcunit (RuleGwcunitA11yTest, RuleGwcunitTokens, RuleGwcunitStackFit) and the proposal
// PROPOSAL-2026-10-20-SkaldenComponentsIntoLibrary-GilbPlatformCode (row 2). Tests written new for this unit.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import ShareButtons from "./ShareButtons.vue";
import { defaultShareTargets, shareHref } from "./targets";

let wrapper: VueWrapper | undefined;
const writeText = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; vi.useRealTimers(); vi.restoreAllMocks(); });
const axeIds = async () => { vi.useRealTimers(); return (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id); };
const PROPS = { url: "https://example.test/post?a=1&b=2", title: "Hello & welcome" };

describe("shareHref", () => {
  test("fills url, title and text, each URL-encoded", () => {
    expect(shareHref("https://e.test/?u={url}&t={title}&x={text}", "https://a.test/p?q=1", "A B")).toBe(
      "https://e.test/?u=https%3A%2F%2Fa.test%2Fp%3Fq%3D1&t=A%20B&x=A%20B%20https%3A%2F%2Fa.test%2Fp%3Fq%3D1",
    );
  });
  test("the default links are the ones the Skalden site built", () => {
    const [u, t] = ["https://a.test/p", "T"];
    const href = Object.fromEntries(defaultShareTargets.map((d) => [d.id, shareHref(d.href, u, t)]));
    expect(href).toEqual({
      x: "https://twitter.com/intent/tweet?url=https%3A%2F%2Fa.test%2Fp&text=T",
      facebook: "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fa.test%2Fp",
      whatsapp: "https://wa.me/?text=T%20https%3A%2F%2Fa.test%2Fp",
      reddit: "https://www.reddit.com/submit?url=https%3A%2F%2Fa.test%2Fp&title=T",
      email: "mailto:?subject=T&body=https%3A%2F%2Fa.test%2Fp",
    });
  });
});

describe("ShareButtons", () => {
  test("five links and a copy button, in order, with the heading", () => {
    wrapper = mount(ShareButtons, { props: PROPS, attachTo: document.body });
    expect([...document.querySelectorAll("a")].map((a) => a.textContent!.trim())).toEqual([
      "Share on X (opens in a new tab)", "Share on Facebook (opens in a new tab)", "Share on WhatsApp (opens in a new tab)",
      "Share on Reddit (opens in a new tab)", "Share on email",
    ]);
    expect(document.querySelectorAll("button")).toHaveLength(1);
    expect(document.querySelector(".sb-heading")!.textContent).toBe("Share");
  });
  test("web links open a new tab with noopener; the email link does not", () => {
    wrapper = mount(ShareButtons, { props: PROPS, attachTo: document.body });
    const as = [...document.querySelectorAll("a")];
    for (const a of as.slice(0, 4)) { expect(a.getAttribute("target")).toBe("_blank"); expect(a.getAttribute("rel")).toBe("noopener"); }
    expect(as[4]!.hasAttribute("target")).toBe(false);
    expect(as[4]!.getAttribute("href")).toMatch(/^mailto:/);
  });
  test("every icon is hidden from screen readers; the name comes from text", () => {
    wrapper = mount(ShareButtons, { props: PROPS, attachTo: document.body });
    expect([...document.querySelectorAll("svg")].every((s) => s.getAttribute("aria-hidden") === "true")).toBe(true);
  });
  test("words and targets are the host's: another language, fewer targets, no heading", () => {
    wrapper = mount(ShareButtons, {
      props: { ...PROPS, heading: "", shareOn: "Del på", copyLabel: "Kopier lenke", newTabText: "(åpnes i ny fane)", targets: [{ id: "x", label: "X", href: "https://e.test/?u={url}", icon: "M0 0h1v1z" }] },
      attachTo: document.body,
    });
    expect(document.querySelectorAll("a")).toHaveLength(1);
    expect(document.querySelector("a")!.textContent!.trim()).toBe("Del på X (åpnes i ny fane)");
    expect(document.querySelector("button")!.textContent!.trim()).toBe("Kopier lenke");
    expect(document.querySelector(".sb-heading")).toBeNull();
  });
  test("the status region is in the page from the start, polite, and empty", () => {
    wrapper = mount(ShareButtons, { props: PROPS, attachTo: document.body });
    const s = document.querySelector("[role=status]")!;
    expect(s.getAttribute("aria-live")).toBe("polite");
    expect(s.textContent).toBe("");
  });
  test("copy writes the address, says copied in the same region, and clears after resetMs", async () => {
    wrapper = mount(ShareButtons, { props: { ...PROPS, resetMs: 1500 }, attachTo: document.body });
    const s = document.querySelector("[role=status]")!;
    (document.querySelector("button") as HTMLButtonElement).click();
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith(PROPS.url);
    expect(s.textContent).toBe("Link copied");
    expect(s.classList.contains("sb-sr")).toBe(false);
    expect(wrapper.emitted("copy")).toEqual([[true]]);
    vi.advanceTimersByTime(1499); await flushPromises();
    expect(s.textContent).toBe("Link copied");
    vi.advanceTimersByTime(2); await flushPromises();
    expect(s.textContent).toBe("");
  });
  test("a second copy restarts the timer", async () => {
    wrapper = mount(ShareButtons, { props: PROPS, attachTo: document.body });
    const b = document.querySelector("button") as HTMLButtonElement;
    b.click(); await flushPromises(); vi.advanceTimersByTime(1500);
    b.click(); await flushPromises(); vi.advanceTimersByTime(1500);
    expect(document.querySelector("[role=status]")!.textContent).toBe("Link copied");
    vi.advanceTimersByTime(600); await flushPromises();
    expect(document.querySelector("[role=status]")!.textContent).toBe("");
  });
  test("when the clipboard refuses, nothing is said and the host is told", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    wrapper = mount(ShareButtons, { props: PROPS, attachTo: document.body });
    (document.querySelector("button") as HTMLButtonElement).click();
    await flushPromises();
    expect(document.querySelector("[role=status]")!.textContent).toBe("");
    expect(wrapper.emitted("copy")).toEqual([[false]]);
  });
  test("when there is no clipboard at all, it does not throw", async () => {
    Object.defineProperty(globalThis.navigator, "clipboard", { value: undefined, configurable: true });
    wrapper = mount(ShareButtons, { props: PROPS, attachTo: document.body });
    (document.querySelector("button") as HTMLButtonElement).click();
    await flushPromises();
    expect(wrapper.emitted("copy")).toEqual([[false]]);
  });
  test("the server's HTML holds every link with its address and no script handler", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(ShareButtons, PROPS) }));
    expect(html).toContain("https://twitter.com/intent/tweet?url=https%3A%2F%2Fexample.test%2Fpost%3Fa%3D1%26b%3D2");
    expect(html).toContain("mailto:");
    expect(html).not.toMatch(/\son[a-z]+=/);
  });
  test("the server's HTML hydrates in the browser with no mismatch warning", async () => {
    vi.useRealTimers();
    const html = await renderToString(createSSRApp({ render: () => h(ShareButtons, PROPS) }));
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.appendChild(el);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    createSSRApp({ render: () => h(ShareButtons, PROPS) }).mount(el);
    expect([...warn.mock.calls, ...err.mock.calls].map((c) => c.map(String).join(" ")).filter((s) => /hydrat|mismatch/i.test(s))).toEqual([]);
  });
  // Spec: RuleGwcunitA11yTest / RuleA11yUnitTest
  test("axe: no violations, before and after a copy (jsdom; contrast is measured in the browser run)", async () => {
    wrapper = mount(ShareButtons, { props: PROPS, attachTo: document.body });
    expect(await axeIds()).toEqual([]);
    vi.useFakeTimers();
    (document.querySelector("button") as HTMLButtonElement).click();
    await flushPromises();
    expect(await axeIds()).toEqual([]);
  });
});

describe("the unit's style", () => {
  const SFC = readFileSync(join(process.cwd(), "src", "ShareButtons.vue"), "utf8");
  const style = (SFC.split("<style scoped>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  // Spec: RuleGwcunitTokens
  test("every colour literal sits inside a var(--site-block-*, ...) fallback", () => {
    const bad = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|gray|grey)\b(?!-)/g)]
      .filter((m) => !/var\(--site-block-[a-z-]+,\s*$/.test(style.slice(Math.max(0, m.index! - 80), m.index)))
      .map((m) => style.slice(Math.max(0, m.index! - 40), m.index! + 10).replace(/\s+/g, " "));
    expect(bad).toEqual([]);
  });
  test("every box sizes with border-box, so padding never widens it", () => {
    expect(style).toContain(".sb, .sb * { box-sizing: border-box; }");
  });
  test("the colour transition is turned off under reduced motion", () => {
    expect(style).toMatch(/prefers-reduced-motion: reduce\) \{ \.sb-btn \{ transition: none; \} \}/);
  });
  test("the unit names no Tailwind class, no i18n and imports nothing but vue and its own files", () => {
    expect(SFC).not.toMatch(/class="[^"]*\b(?:text|bg|border|rounded|px|py|mt|mb|flex|grid)-/);
    expect(SFC).not.toMatch(/useI18n|@apply|theme\(/);
    const imports = [...SFC.matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]);
    expect(imports.every((i) => i === "vue" || i!.startsWith("./"))).toBe(true);
  });
});
