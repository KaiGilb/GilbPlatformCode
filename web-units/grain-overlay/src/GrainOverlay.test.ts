import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import axe from "axe-core";
import GrainOverlay from "./GrainOverlay.vue";

const SOURCE_GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23g)'/%3E%3C/svg%3E\")";

/** The JS string literal of `const GRAIN_URI` in the SFC, unescaped. */
function grainUriInSource(sfc: string): string {
  const m = sfc.match(/const GRAIN_URI =\s*"((?:\\.|[^"\\])*)"/);
  if (m?.[1] === undefined) throw new Error("GRAIN_URI missing");
  return JSON.parse(`"${m[1]}"`);
}

/** decodeURIComponent of the data part of an inline background-image. */
function svgFromBackgroundImage(value: string): string {
  const marker = "data:image/svg+xml,";
  const at = value.indexOf(marker);
  if (at < 0) throw new Error(`no svg data in ${value}`);
  let data = value.slice(at + marker.length);
  data = data.replace(/["']?\)$/, "").replace(/["']$/, "");
  return decodeURIComponent(data);
}

let wrapper: VueWrapper | undefined;
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
});

test("renders one inert element: a div with class go, aria-hidden true, no children, no role, no tabindex", () => {
  wrapper = mount(GrainOverlay, { attachTo: document.body });
  const el = wrapper.element as HTMLElement;
  expect(el.tagName).toBe("DIV");
  expect([...el.classList]).toEqual(["go"]);
  expect(el.getAttribute("aria-hidden")).toBe("true");
  expect(el.childNodes).toHaveLength(0);
  expect(el.hasAttribute("role")).toBe(false);
  expect(el.hasAttribute("tabindex")).toBe(false);
  expect(document.querySelectorAll(".go")).toHaveLength(1);
  expect(el.parentElement?.children).toHaveLength(1);
});

test("z-index is 30 by default, the source's grain plane", () => {
  wrapper = mount(GrainOverlay, { attachTo: document.body });
  const el = wrapper.element as HTMLElement;
  expect(el.style.zIndex).toBe("30");
  expect(el.getAttribute("style") ?? "").toMatch(/z-index:\s*30/);
});

test("zIndex sets the stacking order", () => {
  wrapper = mount(GrainOverlay, { props: { zIndex: 7 }, attachTo: document.body });
  const el = wrapper.element as HTMLElement;
  expect(el.style.zIndex).toBe("7");
  expect(el.getAttribute("style") ?? "").toMatch(/z-index:\s*7/);
});

test("the texture is the source's 180px fractal-noise tile", () => {
  const sfc = readFileSync(join(process.cwd(), "src", "GrainOverlay.vue"), "utf8");
  expect(grainUriInSource(sfc)).toBe(SOURCE_GRAIN_URI);
  wrapper = mount(GrainOverlay, { attachTo: document.body });
  // jsdom's CSS parser drops this data URI, so read the inline style Vue bound onto the element.
  const style = wrapper.vm.$.subTree?.props?.style;
  const backgroundImage =
    style !== null && typeof style === "object" && !Array.isArray(style) ? style.backgroundImage : undefined;
  expect(typeof backgroundImage).toBe("string");
  const svg = svgFromBackgroundImage(String(backgroundImage));
  expect(svg).toContain("width='180'");
  expect(svg).toContain("height='180'");
  expect(svg).toContain("feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'");
});

test("the inline style holds only z-index and the texture; no background size is set", () => {
  wrapper = mount(GrainOverlay, { attachTo: document.body });
  const el = wrapper.element as HTMLElement;
  // jsdom drops this data URI, so element.style.length is 1 (z-index only), not 2.
  // The two inline declarations are the style object Vue bound onto the element.
  const bound = wrapper.vm.$.subTree?.props?.style;
  const declared =
    bound !== null && typeof bound === "object" && !Array.isArray(bound) ? Object.keys(bound).sort() : [];
  expect(declared).toEqual(["backgroundImage", "zIndex"]);
  expect(declared).toHaveLength(2);
  expect(el.style.backgroundSize).toBe("");
});

test("the style is fixed, full-page, inert, at 3 percent, repeated", () => {
  const SFC = readFileSync(join(process.cwd(), "src", "GrainOverlay.vue"), "utf8");
  const style = (SFC.split("<style scoped>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  expect(style).toMatch(
    /\.go\s*\{\s*position:\s*fixed;\s*inset:\s*0;\s*pointer-events:\s*none;\s*opacity:\s*0\.03;\s*background-repeat:\s*repeat;\s*\}/,
  );
});

test("server-rendered HTML holds the element with aria-hidden", async () => {
  const html = await renderToString(createSSRApp(GrainOverlay));
  expect(html).toContain('class="go"');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain("z-index:30");
});

test("axe finds no violations", async () => {
  wrapper = mount(GrainOverlay, { attachTo: document.body });
  const results = await axe.run(document.body);
  expect(results.violations).toEqual([]);
});

test("whole-style: the style block is exactly the rules this file means", () => {
  const sfc = readFileSync(join(process.cwd(), "src", "GrainOverlay.vue"), "utf8");
  const style = (sfc.split("<style scoped>")[1] ?? "").split("</style>")[0] ?? "";
  const normalized = style.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
  expect(normalized).toBe(
    ".go { position: fixed; inset: 0; pointer-events: none; opacity: 0.03; background-repeat: repeat; }",
  );
});
