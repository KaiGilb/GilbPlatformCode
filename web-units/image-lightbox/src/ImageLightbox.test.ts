// Spec: Rule_Code_gwcunit (RuleGwcunitA11yTest, RuleGwcunitTokens, RuleGwcunitStackFit), Rule_Code_accessibility and the
// Skalden proposal "Lightbox design". Tests written new for this unit. jsdom draws no layout, so touch gestures,
// real focus and scroll are proven in a browser by scripts/check-lightbox-browser.mjs.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, defineComponent, h, nextTick } from "vue";
import { renderToString } from "vue/server-renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import { ImageLightbox, LightboxScope, ProseImg } from "./index";

let wrapper: VueWrapper | undefined;
beforeEach(() => { window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; document.body.removeAttribute("style"); vi.restoreAllMocks(); });
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);
const viewer = () => document.querySelector<HTMLElement>("[data-lightbox-viewer]");
const key = (k: string, init: KeyboardEventInit = {}) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
const tick = async () => { await nextTick(); await nextTick(); };
const PROPS = { src: "/a.jpg", alt: "A jackfruit on a tree", width: 1200, height: 800 };

const Article = defineComponent({
  components: { LightboxScope },
  template: `<div id="host"><LightboxScope>
    <p>Text</p>
    <img id="p1" src="/1.jpg" alt="First">
    <figure><img id="p2" src="/2.jpg" alt="Second" data-full="/2-big.jpg"><figcaption>The second, described</figcaption></figure>
    <img id="p3" src="/3.jpg" alt="Third">
    <img id="skip-opt" src="/o.jpg" alt="Not this" data-no-lightbox>
    <a href="/go"><img id="skip-link" src="/l.jpg" alt="A link"></a>
    <img id="skip-alt" src="/d.jpg" alt="">
  </LightboxScope></div>`,
});

describe("ImageLightbox: the picture", () => {
  test("it is the picture as given: src, alt, size and every other attribute reach the img", () => {
    wrapper = mount(ImageLightbox, { props: PROPS, attrs: { class: "hero", loading: "eager", fetchpriority: "high", sizes: "100vw" }, attachTo: document.body });
    const img = document.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/a.jpg");
    expect(img.getAttribute("alt")).toBe("A jackfruit on a tree");
    expect([img.getAttribute("width"), img.getAttribute("height")]).toEqual(["1200", "800"]);
    expect(img.className).toContain("hero");
    expect([img.getAttribute("loading"), img.getAttribute("fetchpriority"), img.getAttribute("sizes")]).toEqual(["eager", "high", "100vw"]);
  });
  test("the host's own image component is used when given", () => {
    const Host = defineComponent({ props: ["src", "alt"], template: `<img class="host-img" :src="src" :alt="alt">` });
    wrapper = mount(ImageLightbox, { props: { ...PROPS, imageComponent: Host }, attachTo: document.body });
    expect(document.querySelector("img.host-img")).not.toBeNull();
  });
  test("the server's HTML is the plain picture: no button role, no tab stop, no handler, no viewer", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(ImageLightbox, { ...PROPS, class: "x" }) }));
    expect(html).toContain('src="/a.jpg"');
    expect(html).not.toMatch(/role=|tabindex|aria-haspopup|data-lightbox-viewer|\son[a-z]+=/);
  });
  test("after mount it is a button with a tab stop; the viewer is not in the page yet", async () => {
    wrapper = mount(ImageLightbox, { props: PROPS, attachTo: document.body });
    await tick();
    const img = document.querySelector("img")!;
    expect([img.getAttribute("role"), img.getAttribute("tabindex"), img.getAttribute("aria-haspopup")]).toEqual(["button", "0", "dialog"]);
    expect(viewer()).toBeNull();
  });
  test("a picture with no alt text, or disabled, stays a plain picture and does not open", async () => {
    wrapper = mount(ImageLightbox, { props: { ...PROPS, alt: "" }, attachTo: document.body });
    await tick();
    const img = document.querySelector("img")!;
    expect(img.hasAttribute("role")).toBe(false);
    img.click();
    await tick();
    expect(viewer()).toBeNull();
    wrapper.unmount();
    wrapper = mount(ImageLightbox, { props: { ...PROPS, disabled: true }, attachTo: document.body });
    await tick();
    document.querySelector("img")!.click();
    await tick();
    expect(viewer()).toBeNull();
  });
  test("the server's HTML hydrates in the browser with no mismatch warning", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(ImageLightbox, PROPS) }));
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.appendChild(el);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    createSSRApp({ render: () => h(ImageLightbox, PROPS) }).mount(el);
    expect([...warn.mock.calls, ...err.mock.calls].map((c) => c.map(String).join(" ")).filter((s) => /hydrat|mismatch/i.test(s))).toEqual([]);
  });
});

describe("ImageLightbox: opening and closing", () => {
  const open = async (props = PROPS) => {
    wrapper = mount(ImageLightbox, { props, attachTo: document.body });
    await tick();
    document.querySelector<HTMLElement>("img")!.focus();
    document.querySelector<HTMLElement>("img")!.click();
    await tick();
  };
  test("a click opens a modal dialog named by its words, with the picture, its caption and a close button", async () => {
    await open();
    const v = viewer()!;
    expect(v.getAttribute("role")).toBe("dialog");
    expect(v.getAttribute("aria-modal")).toBe("true");
    expect(v.getAttribute("aria-label")).toBe("Image viewer");
    expect(v.parentElement).toBe(document.body);
    const big = v.querySelector("img")!;
    expect([big.getAttribute("src"), big.getAttribute("alt")]).toEqual(["/a.jpg", "A jackfruit on a tree"]);
    expect(v.querySelector(".ilb-caption")!.textContent!.trim()).toBe("A jackfruit on a tree");
    expect(v.querySelector(".ilb-caption")!.getAttribute("aria-hidden")).toBe("true");
    expect(v.querySelector(".ilb-close")!.getAttribute("aria-label")).toBe("Close image viewer");
  });
  test("Enter and Space on the picture open it too", async () => {
    wrapper = mount(ImageLightbox, { props: PROPS, attachTo: document.body });
    await tick();
    document.querySelector("img")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await tick();
    expect(viewer()).not.toBeNull();
    key("Escape");
    await tick();
    document.querySelector("img")!.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    await tick();
    expect(viewer()).not.toBeNull();
  });
  test("the viewer shows fullSrc when given, and a caption of its own", async () => {
    await open({ ...PROPS, fullSrc: "/a-big.jpg", caption: "Ripe, in July" } as typeof PROPS);
    expect(viewer()!.querySelector("img")!.getAttribute("src")).toBe("/a-big.jpg");
    const cap = viewer()!.querySelector(".ilb-caption")!;
    expect(cap.textContent!.trim()).toBe("Ripe, in July");
    expect(cap.hasAttribute("aria-hidden")).toBe(false);
  });
  test("Escape closes it from anywhere, also with focus on the page body after a click on the picture", async () => {
    await open();
    (document.activeElement as HTMLElement)?.blur();
    key("Escape");
    await tick();
    expect(viewer()).toBeNull();
  });
  test("the close button and a tap on the dark edge close it", async () => {
    await open();
    viewer()!.querySelector<HTMLElement>(".ilb-close")!.click();
    await tick();
    expect(viewer()).toBeNull();
  });
  test("focus goes to the close button on open and back to the picture on close", async () => {
    await open();
    expect(document.activeElement).toBe(viewer()!.querySelector(".ilb-close"));
    key("Escape");
    await tick();
    expect(document.activeElement).toBe(document.querySelector("img"));
  });
  test("a single picture has no counter, no previous or next", async () => {
    await open();
    expect(viewer()!.querySelector(".ilb-count")).toBeNull();
    expect(viewer()!.querySelector(".ilb-prev")).toBeNull();
    expect(viewer()!.querySelector(".ilb-next")).toBeNull();
  });
  test("while open the page behind is inert and fixed at its scroll position; on close both are undone", async () => {
    wrapper = mount(ImageLightbox, { props: PROPS, attachTo: document.body });
    await tick();
    document.body.style.overflow = "scroll";
    const host = document.body.firstElementChild as HTMLElement;
    document.querySelector("img")!.click();
    await tick();
    expect(host.hasAttribute("inert")).toBe(true);
    expect(viewer()!.hasAttribute("inert")).toBe(false);
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.overflow).toBe("hidden");
    key("Escape");
    await tick();
    expect(host.hasAttribute("inert")).toBe(false);
    expect(document.body.style.position).toBe("");
    expect(document.body.style.overflow).toBe("scroll");
    expect(window.scrollTo).toHaveBeenCalled();
  });
  test("unmounting while open leaves the page unlocked", async () => {
    await open();
    wrapper!.unmount();
    wrapper = undefined;
    await tick();
    expect(document.body.style.position).toBe("");
    expect(document.querySelector("[inert]")).toBeNull();
  });
  test("Tab stays inside the dialog: from the last button it wraps to the first, and Shift+Tab from the first to the last", async () => {
    await open();
    const btns = [...viewer()!.querySelectorAll<HTMLElement>("button:not([disabled])")];
    expect(btns.length).toBeGreaterThan(1);
    btns[btns.length - 1]!.focus();
    key("Tab");
    expect(document.activeElement).toBe(btns[0]);
    key("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(btns[btns.length - 1]);
  });
  test("+ - and 0 zoom and reset, held between fit and the maximum", async () => {
    await open();
    const zoom = () => Number(viewer()!.querySelector("img")!.getAttribute("data-zoom"));
    expect(zoom()).toBe(1);
    key("+");
    await tick();
    expect(zoom()).toBe(1.5);
    for (let i = 0; i < 10; i++) key("=");
    await tick();
    expect(zoom()).toBe(4);
    key("-");
    await tick();
    expect(zoom()).toBeCloseTo(4 / 1.5, 1);
    key("0");
    await tick();
    expect(zoom()).toBe(1);
    key("-");
    await tick();
    expect(zoom()).toBe(1);
  });
  test("the zoom buttons follow the zoom: out and fit are off at fit size, in is off at the maximum", async () => {
    await open();
    const b = (c: string) => viewer()!.querySelector<HTMLButtonElement>(c)!;
    const tools = [...viewer()!.querySelectorAll<HTMLButtonElement>(".ilb-tools button")];
    expect(tools.map((t) => t.disabled)).toEqual([true, true, false]);
    tools[2]!.click();
    await tick();
    expect(tools.map((t) => t.disabled)).toEqual([false, false, false]);
    expect(b(".ilb-fit")).toBe(tools[1]);
  });
  test("words are the host's: another language reaches every name", async () => {
    await open({ ...PROPS, words: { dialog: "Bildevisning", close: "Lukk" } } as typeof PROPS);
    expect(viewer()!.getAttribute("aria-label")).toBe("Bildevisning");
    expect(viewer()!.querySelector(".ilb-close")!.getAttribute("aria-label")).toBe("Lukk");
  });
  test("axe: no violations with the dialog open and with it closed (jsdom; colour contrast is measured in the browser run)", async () => {
    wrapper = mount(ImageLightbox, { props: PROPS, attachTo: document.body });
    await tick();
    expect(await axeIds()).toEqual([]);
    document.querySelector("img")!.click();
    await tick();
    document.body.querySelectorAll("[inert]").forEach((e) => e.removeAttribute("inert"));
    expect(await axeIds()).toEqual([]);
  });
});

describe("LightboxScope: every picture in an article", () => {
  const mountArticle = async () => { wrapper = mount(Article, { attachTo: document.body }); await tick(); };
  const img = (id: string) => document.getElementById(id) as HTMLImageElement;
  test("it adds no box, and before mount nothing is marked (server HTML is the plain article)", async () => {
    const html = await renderToString(createSSRApp(Article));
    expect(html).not.toMatch(/role=|tabindex|data-lightbox=|aria-haspopup/);
    expect(html).toContain("ilb-scope");
    expect(readFileSync(join(process.cwd(), "src", "LightboxScope.vue"), "utf8")).toContain(".ilb-scope { display: contents; }");
  });
  test("after mount the pictures that open are buttons; the skipped ones are left as they were", async () => {
    await mountArticle();
    for (const id of ["p1", "p2", "p3"]) expect([img(id).getAttribute("role"), img(id).getAttribute("tabindex"), img(id).hasAttribute("data-lightbox")]).toEqual(["button", "0", true]);
    for (const id of ["skip-opt", "skip-link", "skip-alt"]) expect([img(id).hasAttribute("role"), img(id).hasAttribute("tabindex")]).toEqual([false, false]);
  });
  test("clicking any picture opens the set at that picture, with a counter, and a figcaption under it", async () => {
    await mountArticle();
    img("p2").click();
    await tick();
    const v = viewer()!;
    expect(v.querySelector(".ilb-count")!.textContent!.trim()).toBe("2 of 3");
    expect(v.querySelector(".ilb-count")!.getAttribute("aria-live")).toBe("polite");
    expect(v.querySelector("img")!.getAttribute("src")).toBe("/2-big.jpg");
    expect(v.querySelector(".ilb-caption")!.textContent!.trim()).toBe("The second, described");
    expect(v.querySelector(".ilb-caption")!.hasAttribute("aria-hidden")).toBe(false);
  });
  test("a picture with data-no-lightbox, a picture in a link and a picture with empty alt do not open", async () => {
    await mountArticle();
    document.addEventListener("click", (e) => e.preventDefault());
    for (const id of ["skip-opt", "skip-link", "skip-alt"]) { img(id).click(); await tick(); expect(viewer()).toBeNull(); }
  });
  test("a click on text does nothing", async () => {
    await mountArticle();
    document.querySelector("p")!.click();
    await tick();
    expect(viewer()).toBeNull();
  });
  test("arrow keys and the buttons move through the set, held at the ends, and reset the zoom", async () => {
    await mountArticle();
    img("p1").click();
    await tick();
    const v = viewer()!;
    const count = () => v.querySelector(".ilb-count")!.textContent!.trim();
    expect(v.querySelector<HTMLButtonElement>(".ilb-prev")!.disabled).toBe(true);
    key("ArrowLeft");
    await tick();
    expect(count()).toBe("1 of 3");
    key("ArrowRight");
    await tick();
    expect(count()).toBe("2 of 3");
    key("+");
    await tick();
    v.querySelector<HTMLElement>(".ilb-next")!.click();
    await tick();
    expect(count()).toBe("3 of 3");
    expect(v.querySelector("img")!.getAttribute("data-zoom")).toBe("1.00");
    expect(v.querySelector<HTMLButtonElement>(".ilb-next")!.disabled).toBe(true);
    key("ArrowRight");
    await tick();
    expect(count()).toBe("3 of 3");
    v.querySelector<HTMLElement>(".ilb-prev")!.click();
    await tick();
    expect(count()).toBe("2 of 3");
  });
  test("Enter on a marked picture opens it", async () => {
    await mountArticle();
    img("p3").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await tick();
    expect(viewer()!.querySelector(".ilb-count")!.textContent!.trim()).toBe("3 of 3");
  });
  test("closing returns focus to the picture last shown, not the one first opened", async () => {
    await mountArticle();
    img("p1").focus();
    img("p1").click();
    await tick();
    key("ArrowRight");
    key("ArrowRight");
    await tick();
    key("Escape");
    await tick();
    expect(document.activeElement).toBe(img("p3"));
  });
  test("a picture added to the article later is marked too", async () => {
    await mountArticle();
    const added = document.createElement("img");
    added.setAttribute("alt", "Late");
    added.setAttribute("src", "/late.jpg");
    document.getElementById("host")!.firstElementChild!.appendChild(added);
    await new Promise((r) => setTimeout(r, 0));
    expect(added.getAttribute("role")).toBe("button");
  });
  test("ProseImg inside a scope is a plain picture; on its own it opens by itself", async () => {
    const Inside = defineComponent({ components: { LightboxScope, ProseImg }, template: `<LightboxScope><ProseImg id="pi" src="/m.jpg" alt="Markdown picture" :width="10" :height="5" /></LightboxScope>` });
    wrapper = mount(Inside, { attachTo: document.body });
    await tick();
    document.getElementById("pi")!.click();
    await tick();
    expect(document.querySelectorAll("[data-lightbox-viewer]")).toHaveLength(1);
    key("Escape");
    await tick();
    wrapper.unmount();
    wrapper = mount(ProseImg, { props: { src: "/m.jpg", alt: "Alone" }, attachTo: document.body });
    await tick();
    document.querySelector("img")!.click();
    await tick();
    expect(viewer()).not.toBeNull();
  });
  test("ProseImg inside a scope names its Markdown file as data-full, so the viewer shows that file and not a resized copy", async () => {
    const Resized = defineComponent({ props: ["src", "alt"], template: `<img :src="'/_resized' + src" :alt="alt">` });
    const Inside = defineComponent({ components: { LightboxScope, ProseImg }, setup: () => ({ Resized }), template: `<LightboxScope><ProseImg id="pi" src="/m.jpg" alt="Markdown picture" :image-component="Resized" /></LightboxScope>` });
    wrapper = mount(Inside, { attachTo: document.body });
    await tick();
    expect(document.querySelector("img")!.getAttribute("data-full")).toBe("/m.jpg");
    document.querySelector("img")!.click();
    await tick();
    expect(viewer()!.querySelector("img")!.getAttribute("src")).toBe("/m.jpg");
  });
  test("ProseImg with data-no-lightbox inside a scope stays closed", async () => {
    const Inside = defineComponent({ components: { LightboxScope, ProseImg }, template: `<LightboxScope><ProseImg id="pi" src="/m.jpg" alt="Markdown picture" data-no-lightbox="true" /></LightboxScope>` });
    wrapper = mount(Inside, { attachTo: document.body });
    await tick();
    document.getElementById("pi")!.click();
    await tick();
    expect(viewer()).toBeNull();
  });
  test("axe: no violations on the marked article and on the open dialog", async () => {
    await mountArticle();
    expect(await axeIds()).toEqual([]);
    img("p1").click();
    await tick();
    document.body.querySelectorAll("[inert]").forEach((e) => e.removeAttribute("inert"));
    expect(await axeIds()).toEqual([]);
  });
});

describe("the unit's style and imports", () => {
  const read = (f: string) => readFileSync(join(process.cwd(), "src", f), "utf8");
  const styleOf = (f: string) => (read(f).split("<style scoped>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  // Spec: RuleGwcunitTokens
  test.each(["LightboxViewer.vue", "ImageLightbox.vue", "LightboxScope.vue"])("%s: every colour literal sits inside a var(--site-block-*, ...) fallback", (f) => {
    const style = styleOf(f);
    const bad = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|gray|grey)\b(?!-)/g)]
      .filter((m) => !/var\(--site-block-[a-z-]+,\s*$/.test(style.slice(Math.max(0, m.index! - 80), m.index)))
      .map((m) => style.slice(Math.max(0, m.index! - 40), m.index! + 10).replace(/\s+/g, " "));
    expect(bad).toEqual([]);
  });
  test("the viewer sizes every box with border-box", () => {
    expect(styleOf("LightboxViewer.vue")).toContain(".ilb-backdrop, .ilb-backdrop * { box-sizing: border-box; }");
  });
  test("motion is only for visitors who have not asked for less: the fade and the zoom glide sit under prefers-reduced-motion: no-preference", () => {
    const s = styleOf("LightboxViewer.vue");
    const outside = s.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}\n/, "");
    expect(s).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(outside).not.toMatch(/animation:|transition:/);
  });
  test("the dialog does not let the page behind scroll: contained overscroll and no touch default on the stage", () => {
    const s = styleOf("LightboxViewer.vue");
    expect(s).toContain("overscroll-behavior: contain");
    expect(s).toContain("touch-action: none");
  });
  test("the unit has no Nuxt, no vue-i18n, no Tailwind class, and imports only vue and its own files", () => {
    for (const f of ["LightboxViewer.vue", "ImageLightbox.vue", "LightboxScope.vue", "ProseImg.vue", "lightboxCore.ts", "index.ts", "scopeKey.ts"]) {
      const src = read(f);
      expect(src).not.toMatch(/NuxtImg|ClientOnly|#imports|useI18n|from "(?:nuxt|#)/);
      const imports = [...src.matchAll(/^(?:import|export) .* from "([^"]+)"/gm)].map((m) => m[1]!);
      expect(imports.every((i) => i === "vue" || i.startsWith("./"))).toBe(true);
    }
    expect(read("ImageLightbox.vue")).not.toMatch(/class="[^"]*\b(?:text|bg|border|rounded|px|py|mt|mb|flex|grid|z)-/);
  });
});

describe("the zoom-reset button's name contains the word drawn on it (WCAG 2.5.3 label in name)", () => {
  test("by default the accessible name holds the visible text", async () => {
    const { defaultWords } = await import("./lightboxCore");
    expect(defaultWords.zoomReset.toLowerCase()).toContain(defaultWords.fit.toLowerCase());
  });
});
