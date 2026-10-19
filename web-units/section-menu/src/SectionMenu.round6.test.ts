// Adopted from Agent.Tester (report AgentTester-WebUnit-943363c-EngineA-4df8986.md, 2026-10-18).
// Agent.Tester round 6 gap tests (web-units/section-menu @ 943363c).
// Spec: handoff 00.Handoff-2026-10-18-ToAgentCoder-SectionMenuAsDefaultSharedUnitAppAndWeb-GilbPlatformCode §3,
// and Kai-Zen's decision 2026-10-18 (b): a section that arrives with `coming: true` at run time is left out
// entirely, with a console warning in development mode only.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, nextTick } from "vue";
import { renderToString } from "vue/server-renderer";
import SectionMenu from "./SectionMenu.vue";
import type { WebMenu } from "./menu";

const UNTYPED = {
  sections: [
    { id: "home", label: "Home", to: "/" },
    { id: "shop", label: "Shop", to: "/shop", coming: true, links: [{ id: "shop.cart", label: "Cart", to: "/shop/cart" }] },
    { id: "blog", label: "Blog", to: "/blog", coming: false, links: [{ id: "blog.a", label: "A post", to: "/blog/a" }] },
  ],
} as unknown as WebMenu;

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
let wrapper: VueWrapper | undefined;
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const flush = async () => { await nextTick(); await nextTick(); await nextTick(); };

describe("QA6 gaps — a section arriving with coming at run time", () => {
  // Spec: Kai-Zen (b) "left out entirely" — after the script, not only in the server HTML.
  test("after the script: not drawn, the arrows and the trigger never meet it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    wrapper = mount(SectionMenu, { props: { menu: UNTYPED, currentPath: "/shop/cart" }, attachTo: document.body });
    await flush();
    expect(document.querySelector("[data-testid='section-menu-trigger-label']")!.textContent).toBe("Menu");
    document.querySelector<HTMLElement>("[data-testid='section-menu-trigger']")!.click();
    await flush();
    expect(document.querySelector('[data-section="shop"]')).toBeNull();
    expect(document.querySelector('[href="/shop"]')).toBeNull();
    expect(document.querySelector('[href="/shop/cart"]')).toBeNull();
    const home = document.querySelector<HTMLElement>('[data-section="home"]')!;
    home.focus();
    home.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement?.getAttribute("data-section")).toBe("blog");
  });

  // Spec: Kai-Zen (b) — only `coming: true` leaves a section out; `coming: false` is an ordinary section.
  test("a section with coming: false is drawn as usual", async () => {
    const html = await renderToString(createSSRApp(SectionMenu, { menu: UNTYPED, currentPath: "/blog/a" }));
    expect(html).toContain('data-section="blog"');
    expect(html).toContain('href="/blog/a"');
  });

  // Spec: Kai-Zen (b) "with a development-mode console warning": not in production. vi.stubEnv does not reach
  // import.meta.env.DEV here (known-answer probe, round 6), so this test runs only under
  // `NODE_ENV=production vitest run --mode production`, where DEV is false.
  test.runIf(!(import.meta as { env?: { DEV?: boolean } }).env?.DEV)("outside development, no console warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const html = await renderToString(createSSRApp(SectionMenu, { menu: UNTYPED, currentPath: "/" }));
    expect(html).not.toContain('data-section="shop"');
    expect(warn.mock.calls.filter((c) => String(c[0]).includes("[section-menu]"))).toEqual([]);
  });

  // Spec: §3 before hydration — the takeover of a server HTML with a left-out section is clean.
  test("hydrating the server HTML gives no hydration mismatch", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = await renderToString(createSSRApp(SectionMenu, { menu: UNTYPED, currentPath: "/blog" }));
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    const app = createSSRApp(SectionMenu, { menu: UNTYPED, currentPath: "/blog" });
    app.mount(host);
    await flush();
    const all = [...warn.mock.calls, ...err.mock.calls].map((c) => String(c[0]));
    expect(all.filter((m) => /hydrat/i.test(m))).toEqual([]);
    app.unmount();
  });
});
