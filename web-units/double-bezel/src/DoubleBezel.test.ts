import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { compileStyle } from "vue/compiler-sfc";
import axe from "axe-core";
import DoubleBezel from "./DoubleBezel.vue";

const RULES = [
  `.bz {
  padding: 0.375rem;
  border-radius: 2rem;
  background:
    linear-gradient(color-mix(in srgb, var(--bz-tint) calc(var(--bz-tint-a) * 100%), transparent), color-mix(in srgb, var(--bz-tint) calc(var(--bz-tint-a) * 100%), transparent)),
    color-mix(in srgb, var(--site-block-bg, #ffffff) 78%, white);
  border: 1px solid color-mix(in srgb, var(--site-block-fg, #1a1a1a) 8%, transparent);
  box-shadow: var(--site-block-shadow-lg, 0 16px 40px -8px rgb(0 0 0 / 0.12));
}`,
  `.bz-core {
  overflow: hidden;
  border-radius: 1.625rem;
  background-color: color-mix(in srgb, var(--site-block-bg, #ffffff) 86%, white);
  box-shadow:
    inset 0 1px 0 var(--site-block-bezel-highlight, rgb(255 255 255 / 0.55)),
    inset 0 0 0 1px color-mix(in srgb, var(--site-block-fg, #1a1a1a) 6%, transparent);
}`,
  `.bz-core :deep(.df-browser) {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}`,
  `.bz--dark {
  background:
    linear-gradient(color-mix(in srgb, var(--bz-tint) 10%, transparent), color-mix(in srgb, var(--bz-tint) 10%, transparent)),
    color-mix(in srgb, var(--site-block-fg, #1a1a1a) 86%, white);
  border-color: color-mix(in srgb, var(--site-block-bg, #ffffff) 16%, transparent);
}`,
  `.bz--dark .bz-core {
  background-color: color-mix(in srgb, var(--site-block-fg, #1a1a1a) 92%, white);
  box-shadow:
    inset 0 1px 0 var(--site-block-bezel-highlight-dark, rgb(255 255 255 / 0.14)),
    inset 0 0 0 1px color-mix(in srgb, var(--site-block-bg, #ffffff) 10%, transparent);
}`,
] as const;

/** Comment-stripped `<style scoped>` text, as grain-overlay's style test does. */
function styleText(): string {
  const sfc = readFileSync(join(process.cwd(), "src", "DoubleBezel.vue"), "utf8");
  const style = (sfc.split("<style scoped>")[1] ?? "").split("</style>")[0] ?? "";
  return style.replace(/\/\*[\s\S]*?\*\//g, "");
}

function flat(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

let wrapper: VueWrapper | undefined;
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
});

test("renders the shell, the core and the slot inside the core", () => {
  wrapper = mount(DoubleBezel, {
    slots: { default: '<img alt="x" src="a.png">' },
    attachTo: document.body,
  });
  const shell = wrapper.element as HTMLElement;
  expect(shell.tagName).toBe("DIV");
  expect(shell.classList.contains("bz")).toBe(true);
  const core = shell.firstElementChild;
  expect(core).toBeInstanceOf(HTMLElement);
  expect(core?.classList.contains("bz-core")).toBe(true);
  expect(core?.parentElement).toBe(shell);
  const img = core?.firstElementChild;
  expect(img).toBeInstanceOf(HTMLImageElement);
  expect(img?.getAttribute("alt")).toBe("x");
  expect(img?.getAttribute("src")).toBe("a.png");
});

test("no tint: --bz-tint is transparent and --bz-tint-a is 0.16", () => {
  wrapper = mount(DoubleBezel, { attachTo: document.body });
  const el = wrapper.element as HTMLElement;
  expect(el.style.getPropertyValue("--bz-tint")).toBe("transparent");
  expect(el.style.getPropertyValue("--bz-tint-a")).toBe("0.16");
});

test("tint and tintAlpha set the two variables", () => {
  wrapper = mount(DoubleBezel, { props: { tint: "#e5d0b1", tintAlpha: 0.3 }, attachTo: document.body });
  const el = wrapper.element as HTMLElement;
  expect(el.style.getPropertyValue("--bz-tint")).toBe("#e5d0b1");
  expect(el.style.getPropertyValue("--bz-tint-a")).toBe("0.3");
});

test("onDark adds bz--dark; without it the class is absent", () => {
  wrapper = mount(DoubleBezel, { props: { onDark: true }, attachTo: document.body });
  expect((wrapper.element as HTMLElement).classList.contains("bz--dark")).toBe(true);
  wrapper.unmount();
  wrapper = mount(DoubleBezel, { attachTo: document.body });
  expect((wrapper.element as HTMLElement).classList.contains("bz--dark")).toBe(false);
});

test("the styles are the source's, written on the site-block variables", () => {
  const style = flat(styleText());
  for (const rule of RULES) expect(style).toContain(flat(rule));
});

test("a device-frame browser frame inside drops its border, corner and shadow", () => {
  const source = (readFileSync(join(process.cwd(), "src", "DoubleBezel.vue"), "utf8").split("<style scoped>")[1] ?? "").split("</style>")[0] ?? "";
  expect(flat(styleText())).toContain(flat(RULES[2]));
  wrapper = mount(DoubleBezel, {
    slots: { default: '<div class="df-browser"></div>' },
    attachTo: document.body,
  });
  const frame = (wrapper.element as HTMLElement).querySelector(".df-browser");
  expect(frame).toBeInstanceOf(HTMLElement);
  expect(frame?.parentElement?.classList.contains("bz-core")).toBe(true);
  const compiled = compileStyle({ source, filename: "DoubleBezel.vue", id: "data-v-test", scoped: true });
  expect(compiled.errors).toEqual([]);
  expect(compiled.code).toContain(".bz-core[data-v-test] .df-browser");
});

test("server-rendered HTML holds both shells, the variables and the slot", async () => {
  const html = await renderToString(
    createSSRApp({
      render: () => h(DoubleBezel, null, { default: () => h("img", { alt: "x", src: "a.png" }) }),
    }),
  );
  expect(html).toContain('class="bz"');
  expect(html).toContain('class="bz-core"');
  expect(html).toContain("--bz-tint:transparent");
  expect(html).toContain("<img");
  expect(html).toContain('alt="x"');
  expect(html).toContain('src="a.png"');
});

test("axe finds no violations", async () => {
  const main = document.createElement("main");
  document.body.appendChild(main);
  wrapper = mount(DoubleBezel, {
    slots: { default: '<img alt="A screenshot" src="a.png">' },
    attachTo: main,
  });
  const results = await axe.run(document.body);
  expect(results.violations).toEqual([]);
});

test("README Host must supply lists exactly the variables the style reads", () => {
  const sfc = readFileSync(join(process.cwd(), "src", "DoubleBezel.vue"), "utf8");
  const inVue = [...new Set([...sfc.matchAll(/--site-block-[a-z-]+/g)].map((m) => m[0]))].sort();
  const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
  expect(readme.includes("## Host must supply")).toBe(true);
  const section = (readme.split("## Host must supply")[1] ?? "").split(/\n## /)[0] ?? "";
  const listed = [...new Set([...section.matchAll(/--site-block-[a-z-]+/g)].map((m) => m[0]))].sort();
  expect(listed).toEqual(inVue);
});

test("every --site-block-bezel fallback the README states under Host must supply is the var() fallback in the component", () => {
  const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
  expect(readme.includes("## Host must supply")).toBe(true);
  const section = (readme.split("## Host must supply")[1] ?? "").split(/\n## /)[0] ?? "";
  const sfc = readFileSync(join(process.cwd(), "src", "DoubleBezel.vue"), "utf8");
  const pairs = [...section.matchAll(/`(--site-block-bezel[a-z-]*)`[\s\S]*?Fallback `([^`]+)`/g)];
  expect(pairs.map((m) => m[1])).toEqual(["--site-block-bezel-highlight", "--site-block-bezel-highlight-dark"]);
  for (const m of pairs) expect(sfc).toContain(`var(${m[1]}, ${m[2]})`);
});

test("whole-style: the style block is exactly the rules this file means", () => {
  const sfc = readFileSync(join(process.cwd(), "src", "DoubleBezel.vue"), "utf8");
  const style = (sfc.split("<style scoped>")[1] ?? "").split("</style>")[0] ?? "";
  const normalized = style.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
  expect(normalized).toBe(
    ".bz { padding: 0.375rem; border-radius: 2rem; background: linear-gradient(color-mix(in srgb, var(--bz-tint) calc(var(--bz-tint-a) * 100%), transparent), color-mix(in srgb, var(--bz-tint) calc(var(--bz-tint-a) * 100%), transparent)), color-mix(in srgb, var(--site-block-bg, #ffffff) 78%, white); border: 1px solid color-mix(in srgb, var(--site-block-fg, #1a1a1a) 8%, transparent); box-shadow: var(--site-block-shadow-lg, 0 16px 40px -8px rgb(0 0 0 / 0.12)); } .bz-core { overflow: hidden; border-radius: 1.625rem; background-color: color-mix(in srgb, var(--site-block-bg, #ffffff) 86%, white); box-shadow: inset 0 1px 0 var(--site-block-bezel-highlight, rgb(255 255 255 / 0.55)), inset 0 0 0 1px color-mix(in srgb, var(--site-block-fg, #1a1a1a) 6%, transparent); } .bz-core :deep(.df-browser) { border: 0; border-radius: 0; box-shadow: none; } .bz--dark { background: linear-gradient(color-mix(in srgb, var(--bz-tint) 10%, transparent), color-mix(in srgb, var(--bz-tint) 10%, transparent)), color-mix(in srgb, var(--site-block-fg, #1a1a1a) 86%, white); border-color: color-mix(in srgb, var(--site-block-bg, #ffffff) 16%, transparent); } .bz--dark .bz-core { background-color: color-mix(in srgb, var(--site-block-fg, #1a1a1a) 92%, white); box-shadow: inset 0 1px 0 var(--site-block-bezel-highlight-dark, rgb(255 255 255 / 0.14)), inset 0 0 0 1px color-mix(in srgb, var(--site-block-bg, #ffffff) 10%, transparent); }",
  );
});
