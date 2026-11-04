// Tests written new for this unit. The sources named the link with aria-label and again with the image alt
// (and, in website-engine-a, a third time with the visible wordmark). These tests lock the fix.
import { afterEach, describe, expect, test } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, markRaw } from "vue";
import axe from "axe-core";
import SiteLogo from "./SiteLogo.vue";
import vueSource from "./SiteLogo.vue?raw";
import type { SiteLogoProps } from "./types";

const styleText = [...vueSource.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? "").join("\n");

/** Declaration blocks whose selector list contains `selector` as one whole selector. */
function ruleBodies(selector: string): string[] {
  const bodies: string[] = [];
  for (const match of styleText.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectorText = match[1];
    const body = match[2];
    if (selectorText === undefined || body === undefined) continue;
    const selectors = selectorText.split(",").map((s) => s.trim());
    if (selectors.includes(selector)) bodies.push(body);
  }
  return bodies;
}

let wrapper: VueWrapper | undefined;
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ""; });

const mountLogo = (props: SiteLogoProps) => (wrapper = mount(SiteLogo, { props, attachTo: document.body }));

// A stand-in for a router link (NuxtLink): it takes `to`, never `href`.
const FakeLink = markRaw(defineComponent({
  name: "FakeLink",
  props: { to: { type: String, required: true } },
  setup: (p, { slots }) => () => h("a", { href: `#route:${p.to}`, "data-fake-link": "" }, slots.default?.()),
}));
// A stand-in for a host image (NuxtImg). It declares the attributes this unit passes through.
const FakeImg = markRaw(defineComponent({
  name: "FakeImg",
  props: { src: String, alt: String, width: [String, Number], height: [String, Number], decoding: String, loading: String },
  setup: (p) => () => h("img", { src: p.src, alt: p.alt, width: p.width, height: p.height, decoding: p.decoding, loading: p.loading, "data-fake-img": "" }),
}));

// jsdom cannot measure colour, and the component is mounted outside a page landmark.
const axeIds = async () => (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);

describe("SiteLogo", () => {
  test("default: an anchor to / with the wordmark and no image", () => {
    mountLogo({ name: "Acme" });
    const a = document.querySelector("a");
    expect(a).not.toBeNull();
    expect(a!.getAttribute("href")).toBe("/");
    expect(a!.textContent!.trim()).toBe("Acme");
    expect(a!.querySelector("span")!.textContent).toBe("Acme");
    expect(document.querySelector("img")).toBeNull();
    expect(a!.hasAttribute("aria-label")).toBe(false);
  });

  test("a logo with the wordmark always: empty image alt, size attributes, eager, and the name once", () => {
    mountLogo({ name: "Acme", logoSrc: "/logo.svg", logoWidth: 74, logoHeight: 50 });
    const a = document.querySelector("a")!;
    const img = document.querySelector("img")!;
    expect(a.hasAttribute("aria-label")).toBe(false);
    expect(a.textContent!.trim()).toBe("Acme");
    expect(a.querySelector("span")!.textContent).toBe("Acme");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.hasAttribute("alt")).toBe(true);
    expect(img.getAttribute("src")).toBe("/logo.svg");
    expect(img.getAttribute("width")).toBe("74");
    expect(img.getAttribute("height")).toBe("50");
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("decoding")).toBe("async");
  });

  test("wordmark when-no-logo with a logo: no wordmark, alt is logoAlt or else the name", () => {
    mountLogo({ name: "Acme", logoSrc: "/logo.svg", logoAlt: "Acme mark", wordmark: "when-no-logo" });
    const a = document.querySelector("a")!;
    expect(a.querySelector("span")).toBeNull();
    expect(a.hasAttribute("aria-label")).toBe(false);
    expect(document.querySelector("img")!.getAttribute("alt")).toBe("Acme mark");
    wrapper!.unmount();
    mountLogo({ name: "Acme", logoSrc: "/logo.svg", wordmark: "when-no-logo" });
    expect(document.querySelector("span")).toBeNull();
    expect(document.querySelector("img")!.getAttribute("alt")).toBe("Acme");
  });

  test("wordmark never with no logo still renders the name, so the link is not empty", () => {
    mountLogo({ name: "Acme", wordmark: "never" });
    const a = document.querySelector("a")!;
    expect(a.getAttribute("href")).toBe("/");
    expect(a.textContent!.trim()).toBe("Acme");
    expect(document.querySelector("img")).toBeNull();
    wrapper!.unmount();
    mountLogo({ name: "Acme", logoSrc: "/logo.svg", wordmark: "never" });
    expect(document.querySelector("span")).toBeNull();
    expect(document.querySelector("img")!.getAttribute("alt")).toBe("Acme");
  });

  test("an external address stays an anchor even with a link stub; an internal stub receives to", () => {
    mountLogo({ name: "Acme", href: "https://example.test/home", external: true, linkComponent: FakeLink });
    expect(document.querySelector("[data-fake-link]")).toBeNull();
    const a = document.querySelector("a")!;
    expect(a.tagName).toBe("A");
    expect(a.getAttribute("href")).toBe("https://example.test/home");
    expect(a.hasAttribute("aria-label")).toBe(false);
    wrapper!.unmount();
    mountLogo({ name: "Acme", href: "/pricing", linkComponent: FakeLink });
    const stub = wrapper!.findComponent(FakeLink);
    expect(stub.props("to")).toBe("/pricing");
    expect(stub.vm.$attrs).not.toHaveProperty("href");
    expect(document.querySelector("[data-fake-link]")!.getAttribute("href")).toBe("#route:/pricing");
  });

  test("an image stub receives src, alt, width and height", () => {
    mountLogo({ name: "Acme", logoSrc: "/logo.svg", logoWidth: 74, logoHeight: 50, imageComponent: FakeImg });
    const img = wrapper!.findComponent(FakeImg);
    expect(img.props("src")).toBe("/logo.svg");
    expect(img.props("alt")).toBe("");
    expect(Number(img.props("width"))).toBe(74);
    expect(Number(img.props("height"))).toBe(50);
    const node = document.querySelector("[data-fake-img]")!;
    expect(node.getAttribute("src")).toBe("/logo.svg");
    expect(node.getAttribute("alt")).toBe("");
    expect(node.getAttribute("width")).toBe("74");
    expect(node.getAttribute("height")).toBe("50");
    expect(node.getAttribute("decoding")).toBe("async");
    expect(node.getAttribute("loading")).toBe("eager");
  });

  test("decorative draws only the image, with an empty alt and aria-hidden, and no link", () => {
    mountLogo({ name: "Acme", logoSrc: "/logo.svg", decorative: true, linkComponent: FakeLink });
    expect(document.querySelector("a")).toBeNull();
    expect(document.querySelector("[data-fake-link]")).toBeNull();
    expect(document.querySelector("span")).toBeNull();
    const img = document.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
    expect(img.getAttribute("src")).toBe("/logo.svg");
    expect(document.body.textContent!.trim()).toBe("");
  });

  test("a decorative image loads eager", () => {
    mountLogo({ name: "Acme", logoSrc: "/logo.svg", decorative: true });
    expect(document.querySelector("img")!.getAttribute("loading")).toBe("eager");
  });

  test("decorative with an empty logoSrc renders nothing", () => {
    mountLogo({ name: "Acme", logoSrc: "", decorative: true });
    expect(document.querySelector("a, img, span")).toBeNull();
    expect(document.body.textContent!.trim()).toBe("");
  });

  test("the link rule sets a 44px minimum height", () => {
    expect(ruleBodies(".sl").some((body) => /min-height:\s*44px/.test(body))).toBe(true);
  });

  test("the logo image rule is 2rem tall", () => {
    expect(ruleBodies(".sl-img").some((body) => /height:\s*2rem/.test(body))).toBe(true);
  });

  test("the link has a focus-visible outline", () => {
    expect(ruleBodies(".sl:focus-visible").some((body) => /outline\s*:/.test(body))).toBe(true);
  });

  test("the link colour is the accent variable", () => {
    expect(ruleBodies(".sl").some((body) => /color:\s*var\(\s*--site-block-accent\b/.test(body))).toBe(true);
  });

  test("axe: no violations for the default, a logo with the wordmark, and a logo without it (jsdom)", async () => {
    mountLogo({ name: "Acme" });
    expect(await axeIds()).toEqual([]);
    wrapper!.unmount();
    mountLogo({ name: "Acme", logoSrc: "/logo.svg" });
    expect(await axeIds()).toEqual([]);
    wrapper!.unmount();
    mountLogo({ name: "Acme", logoSrc: "/logo.svg", logoAlt: "Acme mark", wordmark: "when-no-logo" });
    expect(await axeIds()).toEqual([]);
  });
});
