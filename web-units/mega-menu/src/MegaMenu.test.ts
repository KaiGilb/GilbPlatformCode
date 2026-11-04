// The sheet mechanism: render nothing while closed, lock scroll, trap focus, and report close.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createSSRApp, defineComponent, h, nextTick } from "vue";
import { renderToString } from "vue/server-renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import MegaMenu from "./MegaMenu.vue";
import { FOCUSABLE_SELECTOR } from "./focusTrap";
import type { MenuGroup } from "./types";

let wrapper: VueWrapper | undefined;

/** jsdom follows a real click on `<a href>`. Stop that without touching the component's own handler. */
function stopAnchorNav(event: Event) {
  const target = event.target;
  if (target instanceof Element && target.closest("a")) event.preventDefault();
}

beforeEach(() => {
  document.addEventListener("click", stopAnchorNav, true);
});

afterEach(() => {
  document.removeEventListener("click", stopAnchorNav, true);
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
  document.body.style.overflow = "";
  vi.restoreAllMocks();
});

const GROUPS: MenuGroup[] = [
  {
    heading: "Product",
    span: 6,
    items: [
      { label: "Pricing", sub: "Pay for what you keep.", href: "/pricing" },
      { label: "News", href: "/news" },
    ],
    cta: { label: "Join", href: "/waitlist" },
  },
  {
    heading: "Who it is for",
    columns: 2,
    span: 6,
    items: [
      { label: "Founders", sub: "Ship something you can keep." },
      { label: "Families", sub: "Share the thing." },
    ],
  },
  {
    heading: "Apps",
    items: [
      { label: "External app", sub: "Leaves the site.", href: "https://example.test/app", external: true },
      { label: "Library", sub: "Apps built here.", href: "/apps" },
    ],
  },
];

/** A stand-in for a route link: renders `to` as the href. */
const FakeLink = defineComponent({
  name: "FakeLink",
  inheritAttrs: false,
  props: { to: { type: String, required: true } },
  setup(props, { slots, attrs }) {
    return () => h("a", { ...attrs, href: props.to, "data-stub": "" }, slots.default?.());
  },
});

async function mountOpen(props: Record<string, unknown> = {}, slots?: Record<string, string>) {
  wrapper = mount(MegaMenu, {
    props: { open: true, groups: GROUPS, ...props },
    slots,
    attachTo: document.body,
  });
  await nextTick();
  await flushPromises();
  return wrapper;
}

function key(name: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init }));
}

function panel() {
  const el = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!el) throw new Error("panel missing");
  return el;
}

function destinations() {
  return [...panel().querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
}

const axeIds = async () =>
  (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v: { id: string }) => v.id);

describe("closed", () => {
  test("open=false renders nothing and leaves body overflow and the keyboard alone", async () => {
    document.body.style.overflow = "scroll";
    const add = vi.spyOn(window, "addEventListener");
    wrapper = mount(MegaMenu, { props: { open: false, groups: GROUPS }, attachTo: document.body });
    await nextTick();
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(document.body.textContent).not.toContain("Pricing");
    expect(document.body.style.overflow).toBe("scroll");
    expect(add.mock.calls.filter((c) => c[0] === "keydown")).toHaveLength(0);
    key("Escape");
    expect(wrapper.emitted("close")).toBeUndefined();
    wrapper.unmount();
    wrapper = undefined;
    expect(document.body.style.overflow).toBe("scroll");
  });
});

describe("open sheet", () => {
  test("a dialog and a nav have their own names, with one heading and list per group", async () => {
    await mountOpen();
    const dialog = document.querySelector("[role=dialog]");
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute("aria-modal")).toBe("true");
    expect(dialog!.getAttribute("aria-label")).toBe("Site menu");
    expect(dialog!.id).not.toBe("");
    const nav = document.querySelector("nav");
    expect(nav!.getAttribute("aria-label")).toBe("Main");
    const headings = [...document.querySelectorAll(".mm-label")].map((el) => el.textContent);
    expect(headings).toEqual(["Product", "Who it is for", "Apps"]);
    const lists = [...document.querySelectorAll(".mm-list")];
    expect(lists).toHaveLength(3);
    lists.forEach((ul, i) => {
      const id = ul.getAttribute("aria-labelledby");
      expect(id).toBeTruthy();
      expect(document.getElementById(id!)?.textContent).toBe(headings[i]);
    });
    expect(document.querySelector(".mm-list.mm-cols-2")).toBe(document.querySelectorAll(".mm-list")[1]);
    const spans = [...document.querySelectorAll<HTMLElement>(".mm-group")].map((el) => el.style.getPropertyValue("--mm-span"));
    // Two explicit spans, and the third takes floor(12 / 3).
    expect(spans).toEqual(["6", "6", "4"]);
    expect((document.querySelector(".mm") as HTMLElement).style.zIndex).toBe("40");
    expect(document.querySelector(".mm-close")!.textContent).toContain("Close");
  });

  test("the label, the close word and the overlay props are the host's", async () => {
    await mountOpen({ label: "Main menu", navLabel: "Pages", closeLabel: "Dismiss", zIndex: 45, sheetHeight: "70dvh", maxWidth: "60rem" });
    expect(document.querySelector("[role=dialog]")!.getAttribute("aria-label")).toBe("Main menu");
    expect(document.querySelector("nav")!.getAttribute("aria-label")).toBe("Pages");
    expect(document.querySelector(".mm-close")!.textContent).toContain("Dismiss");
    const root = document.querySelector(".mm") as HTMLElement;
    expect(root.style.zIndex).toBe("45");
    expect(root.style.getPropertyValue("--mm-sheet")).toBe("70dvh");
    expect(root.style.getPropertyValue("--mm-max")).toBe("60rem");
  });

  test("an item with href is a link; an item without is plain text with no tab stop", async () => {
    await mountOpen();
    const pricing = document.querySelector("a[href='/pricing']");
    expect(pricing).not.toBeNull();
    expect(pricing!.textContent).toContain("Pricing");
    expect(pricing!.textContent).toContain("Pay for what you keep.");
    const founders = [...document.querySelectorAll(".mm-static")].find((el) => el.textContent?.includes("Founders"));
    expect(founders).toBeTruthy();
    expect(founders!.tagName).not.toBe("A");
    expect(founders!.querySelector("a")).toBeNull();
    expect(founders!.hasAttribute("tabindex")).toBe(false);
    expect(founders!.querySelector("[tabindex]")).toBeNull();
    expect(document.body.textContent).toContain("Families");
  });

  test("two menus get different panel ids, and a given panelId is the dialog id", async () => {
    const Pair = defineComponent({
      components: { MegaMenu },
      setup: () => () => h("div", [
        h(MegaMenu, { open: true, groups: GROUPS, panelId: "menu-a" }),
        h(MegaMenu, { open: true, groups: GROUPS }),
      ]),
    });
    wrapper = mount(Pair, { attachTo: document.body });
    await nextTick();
    await flushPromises();
    const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
    expect(dialogs).toHaveLength(2);
    expect(dialogs[0]!.id).toBe("menu-a");
    expect(dialogs[1]!.id).not.toBe("");
    expect(dialogs[1]!.id).not.toBe(dialogs[0]!.id);
    expect(dialogs[1]!.id).not.toBe("mega-menu-panel");
  });

  test("the footer wrapper is absent when there is no footer slot", async () => {
    await mountOpen();
    expect(document.querySelector(".mm-footer")).toBeNull();
  });

  test("the footer slot sits above the Close button", async () => {
    await mountOpen({}, { footer: '<p class="mm-note">Note</p>' });
    const note = document.querySelector(".mm-note");
    const close = document.querySelector(".mm-close");
    expect(note).not.toBeNull();
    expect(note!.closest(".mm-sheet")).not.toBeNull();
    expect(note!.compareDocumentPosition(close!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("scroll lock", () => {
  test("opening sets body overflow to hidden and closing puts the previous value back", async () => {
    document.body.style.overflow = "scroll";
    wrapper = mount(MegaMenu, { props: { open: false, groups: GROUPS }, attachTo: document.body });
    await nextTick();
    expect(document.body.style.overflow).toBe("scroll");
    await wrapper.setProps({ open: true });
    await nextTick();
    expect(document.body.style.overflow).toBe("hidden");
    await wrapper.setProps({ open: false });
    await nextTick();
    expect(document.body.style.overflow).toBe("scroll");
    expect(document.querySelector("[role=dialog]")).toBeNull();
  });

  test("opening again locks scroll and focuses the first item, and the second close restores the original overflow", async () => {
    document.body.style.overflow = "scroll";
    wrapper = mount(MegaMenu, { props: { open: false, groups: GROUPS }, attachTo: document.body });
    await nextTick();
    await wrapper.setProps({ open: true });
    await nextTick();
    await flushPromises();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(document.querySelector("a[href='/pricing']"));
    await wrapper.setProps({ open: false });
    await nextTick();
    expect(document.body.style.overflow).toBe("scroll");
    await wrapper.setProps({ open: true });
    await nextTick();
    await flushPromises();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(document.querySelector("a[href='/pricing']"));
    await wrapper.setProps({ open: false });
    await nextTick();
    expect(document.body.style.overflow).toBe("scroll");
  });

  test("unmount while open restores the previous overflow and removes the keydown listener", async () => {
    document.body.style.overflow = "scroll";
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const w = await mountOpen();
    const added = add.mock.calls.filter((c) => c[0] === "keydown").map((c) => c[1]);
    expect(added).toHaveLength(1);
    expect(document.body.style.overflow).toBe("hidden");
    w.unmount();
    wrapper = undefined;
    expect(document.body.style.overflow).toBe("scroll");
    expect(remove.mock.calls).toContainEqual(["keydown", added[0]]);
    key("Escape");
  });
});

describe("keyboard", () => {
  test("Escape calls preventDefault", async () => {
    await mountOpen();
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  test("Escape still closes after the sheet was closed and opened again", async () => {
    const w = await mountOpen();
    await w.setProps({ open: false });
    await w.setProps({ open: true });
    await nextTick();
    key("Escape");
    expect(w.emitted("close")).toEqual([["esc"]]);
  });

  test("Tab at the last destination wraps to the first and is default-prevented", async () => {
    await mountOpen();
    const els = destinations();
    els[els.length - 1]!.focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    window.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(els[0]);
  });

  test("Tab and Shift+Tab from a control outside the sheet both move to the first destination", async () => {
    const before = document.createElement("button");
    before.type = "button";
    before.textContent = "Before";
    document.body.appendChild(before);
    await mountOpen();
    const els = destinations();
    const first = els[0];
    const last = els[els.length - 1];
    if (!first || !last) throw new Error("expected destinations");
    before.focus();
    expect(document.activeElement).toBe(before);
    key("Tab");
    expect(document.activeElement).toBe(first);
    before.focus();
    key("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(first);
    expect(document.activeElement).not.toBe(last);
  });

  test("a focusable footer control that is not a destination keeps the browser's Tab", async () => {
    await mountOpen({}, { footer: '<input class="mm-extra" type="text">' });
    const input = document.querySelector<HTMLInputElement>(".mm-extra");
    if (!input) throw new Error("footer input missing");
    input.focus();
    expect(document.activeElement).toBe(input);
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    window.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(input);
    const shift = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true, shiftKey: true });
    window.dispatchEvent(shift);
    expect(shift.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(input);
  });

  test("Escape emits close('esc') and a later Escape does not", async () => {
    const w = await mountOpen();
    key("Escape");
    expect(w.emitted("close")).toEqual([["esc"]]);
    await w.setProps({ open: false });
    key("Escape");
    expect(w.emitted("close")).toEqual([["esc"]]);
  });

  test("Tab on the last destination wraps to the first, and Shift+Tab on the first wraps to the last", async () => {
    await mountOpen();
    const els = destinations();
    const first = els[0];
    const last = els[els.length - 1];
    if (!first || !last) throw new Error("expected destinations");
    expect(first.getAttribute("href")).toBe("/pricing");
    expect(last.classList.contains("mm-close")).toBe(true);
    expect(document.activeElement).toBe(first);
    last.focus();
    key("Tab");
    expect(document.activeElement).toBe(first);
    first.focus();
    key("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  test("the first destination is focused on open, skipping static text", async () => {
    await mountOpen();
    expect(document.activeElement).toBe(document.querySelector("a[href='/pricing']"));

    wrapper?.unmount();
    wrapper = mount(MegaMenu, {
      props: {
        open: true,
        groups: [{ heading: "A", items: [{ label: "Plain" }, { label: "Go", href: "/go" }] }],
      },
      attachTo: document.body,
    });
    await nextTick();
    await flushPromises();
    expect(document.activeElement).toBe(document.querySelector("a[href='/go']"));
    expect(document.activeElement).not.toBe(document.querySelector(".mm-static"));
  });

  test("opening after the first render still focuses the first destination", async () => {
    wrapper = mount(MegaMenu, { props: { open: false, groups: GROUPS }, attachTo: document.body });
    await nextTick();
    expect(document.activeElement).not.toBe(document.body.querySelector("a"));
    await wrapper.setProps({ open: true });
    await nextTick();
    await flushPromises();
    expect(document.activeElement).toBe(document.querySelector("a[href='/pricing']"));
  });
});

describe("events", () => {
  test("a click on the sheet itself emits close('outside'), and a click on a child does not", async () => {
    const w = await mountOpen();
    await w.get(".mm-label").trigger("click");
    expect(w.emitted("close")).toBeUndefined();
    await w.get(".mm-sheet").trigger("click");
    expect(w.emitted("close")).toEqual([["outside"]]);
  });

  test("a link, the catcher and the Close button each emit their own reason", async () => {
    const w = await mountOpen();
    document.querySelector<HTMLAnchorElement>("a[href='/pricing']")!.click();
    document.querySelector<HTMLElement>(".mm-catcher")!.click();
    document.querySelector<HTMLButtonElement>(".mm-close")!.click();
    expect(w.emitted("close")).toEqual([["link"], ["outside"], ["button"]]);
  });

  test("the call to action is a link too, so it emits close('link')", async () => {
    const w = await mountOpen();
    document.querySelector<HTMLAnchorElement>("a[href='/waitlist']")!.click();
    expect(w.emitted("close")).toEqual([["link"]]);
  });

  test("pointer enter and leave are reported from the sheet", async () => {
    const w = await mountOpen();
    await w.get(".mm-sheet").trigger("mouseenter");
    await w.get(".mm-sheet").trigger("mouseleave");
    expect(w.emitted("pointer-enter")).toHaveLength(1);
    expect(w.emitted("pointer-leave")).toHaveLength(1);
  });

  test("pointerenter and pointerleave alone do not report (a touch lift fires pointerleave)", async () => {
    const w = await mountOpen();
    await w.get(".mm-sheet").trigger("pointerenter");
    await w.get(".mm-sheet").trigger("pointerleave");
    expect(w.emitted("pointer-enter")).toBeUndefined();
    expect(w.emitted("pointer-leave")).toBeUndefined();
  });

  test("a click on empty space in the sheet, the nav or the body wrapper closes it; a click on a link's child does not", async () => {
    const w = await mountOpen();
    for (const selector of [".mm-sheet", ".mm-nav", ".mm-body"]) {
      await w.get(selector).trigger("click");
    }
    expect(w.emitted("close")).toEqual([["outside"], ["outside"], ["outside"]]);
    await w.get(".mm-item-label").trigger("click");
    // The label sits inside a link, so the click bubbles to the link: 'link', never 'outside'.
    expect(w.emitted("close")).toEqual([["outside"], ["outside"], ["outside"], ["link"]]);
    await w.get(".mm-grid").trigger("click");
    await w.get(".mm-group").trigger("click");
    expect(w.emitted("close")).toHaveLength(4);
  });

  test("the Close button is type=button, and the Close svg and the catcher are aria-hidden", async () => {
    await mountOpen();
    expect(document.querySelector(".mm-close")!.getAttribute("type")).toBe("button");
    expect(document.querySelector(".mm-close svg")!.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector(".mm-catcher")!.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("link component", () => {
  test("an internal link and call to action get `to` on the stub; an external one stays an anchor", async () => {
    await mountOpen({ linkComponent: FakeLink });
    const stubs = [...document.querySelectorAll("[data-stub]")].map((a) => a.getAttribute("href"));
    expect(stubs).toEqual(["/pricing", "/news", "/waitlist", "/apps"]);
    const native = [...document.querySelectorAll("a")].filter((a) => !a.hasAttribute("data-stub"));
    expect(native.map((a) => a.getAttribute("href"))).toEqual(["https://example.test/app"]);
    expect(native[0]!.hasAttribute("to")).toBe(false);

    wrapper?.unmount();
    wrapper = mount(MegaMenu, {
      props: {
        open: true,
        linkComponent: FakeLink,
        groups: [{
          heading: "Go",
          items: [{ label: "Out", href: "https://example.test/out", external: true }],
          cta: { label: "Away", href: "https://example.test/away", external: true },
        }],
      },
      attachTo: document.body,
    });
    await nextTick();
    expect(document.querySelectorAll("[data-stub]")).toHaveLength(0);
    expect([...document.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([
      "https://example.test/out",
      "https://example.test/away",
    ]);
  });
});

describe("rows and spans", () => {
  test("a static row draws its sub line", async () => {
    await mountOpen({ groups: [{ heading: "A", items: [{ label: "Plain", sub: "the promise" }] }] });
    expect(document.querySelector(".mm-static .mm-sub")?.textContent).toBe("the promise");
  });

  test.each([
    [1, "12"],
    [2, "6"],
    [3, "4"],
    [5, "2"],
    [7, "1"],
  ])("with %i group(s) the default span is floor(12 / count) = %s", async (count, span) => {
    const groups: MenuGroup[] = Array.from({ length: count }, (_, i) => ({ heading: `G${i}`, items: [{ label: `L${i}`, href: `/${i}` }] }));
    await mountOpen({ groups });
    const spans = [...document.querySelectorAll<HTMLElement>(".mm-group")].map((el) => el.style.getPropertyValue("--mm-span"));
    expect(spans).toEqual(Array(count).fill(span));
  });
});

describe("fade", () => {
  test("opening and closing run a Transition (the real one, not the test stub)", async () => {
    wrapper = mount(MegaMenu, {
      props: { open: false, groups: GROUPS },
      attachTo: document.body,
      global: { stubs: { transition: false } },
    });
    await wrapper.setProps({ open: true });
    expect(document.querySelector(".mm")!.classList.contains("mm-fade-enter-active")).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    await wrapper.setProps({ open: false });
    // Still in the document during the leave.
    expect(document.querySelector(".mm")!.classList.contains("mm-fade-leave-active")).toBe(true);
  });
});

describe("stagger", () => {
  test("the call to action is the last row of its group and continues the --i sequence", async () => {
    await mountOpen();
    const groups = [...document.querySelectorAll(".mm-group")];
    const product = [...groups[0]!.querySelectorAll<HTMLElement>(".mm-list > .mm-item")];
    expect(product).toHaveLength(3);
    expect(product[2]!.querySelector(".mm-cta")!.textContent).toContain("Join");
    expect(product.map((li) => li.style.getPropertyValue("--i"))).toEqual(["0", "1", "2"]);
    const who = [...groups[1]!.querySelectorAll<HTMLElement>(".mm-list > .mm-item")];
    expect(who.map((li) => li.style.getPropertyValue("--i"))).toEqual(["3", "4"]);
    const apps = [...groups[2]!.querySelectorAll<HTMLElement>(".mm-list > .mm-item")];
    expect(apps.map((li) => li.style.getPropertyValue("--i"))).toEqual(["5", "6"]);
  });
});

describe("axe", () => {
  test("no violations when the sheet is open", async () => {
    await mountOpen({}, { footer: "<p>A note under the lists.</p>" });
    expect(await axeIds()).toEqual([]);
  });
});

describe("server render", () => {
  test("open HTML holds the sheet and closed HTML holds nothing, with no inline handler", async () => {
    const openHtml = await renderToString(createSSRApp({ render: () => h(MegaMenu, { open: true, groups: GROUPS }) }));
    expect(openHtml).toContain('role="dialog"');
    expect(openHtml).toContain("aria-modal=\"true\"");
    expect(openHtml).toContain("Pricing");
    expect(openHtml).toContain("Founders");
    expect(openHtml).toContain('href="/pricing"');
    expect(openHtml).toContain("mm-static");
    expect(openHtml).not.toMatch(/\son[a-z]+=/);
    const closed = await renderToString(createSSRApp({ render: () => h(MegaMenu, { open: false, groups: GROUPS }) }));
    expect(closed).not.toContain("dialog");
    expect(closed).not.toContain("Pricing");
  });

  test("the server HTML hydrates with no mismatch warning", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(MegaMenu, { open: true, groups: GROUPS }) }));
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.appendChild(el);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createSSRApp({ render: () => h(MegaMenu, { open: true, groups: GROUPS }) });
    app.mount(el);
    expect(
      [...warn.mock.calls, ...err.mock.calls].map((c) => c.map(String).join(" ")).filter((s) => /hydrat|mismatch/i.test(s)),
    ).toEqual([]);
    app.unmount();
  });
});

describe("the unit's style", () => {
  const SFC = readFileSync(join(process.cwd(), "src", "MegaMenu.vue"), "utf8");
  const style = (SFC.split("<style scoped>")[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");

  function ruleBodies(selector: string): string[] {
    const bodies: string[] = [];
    for (const match of style.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectorText = match[1];
      const body = match[2];
      if (selectorText === undefined || body === undefined) continue;
      const selectors = selectorText.split(",").map((s) => s.trim());
      if (selectors.includes(selector)) bodies.push(body);
    }
    return bodies;
  }

  test("links and the call to action are at least 44px tall", () => {
    expect(ruleBodies(".mm-link").some((body) => /min-height:\s*44px/.test(body))).toBe(true);
    expect(ruleBodies(".mm-cta").some((body) => /min-height:\s*44px/.test(body))).toBe(true);
  });

  test("the call to action colour is the on-accent variable", () => {
    expect(ruleBodies(".mm-cta").some((body) => /color:\s*var\(\s*--site-block-on-accent\b/.test(body))).toBe(true);
  });

  test("every colour literal sits inside a var(--site-block-*, ...) fallback", () => {
    const bad = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|gray|grey)\b(?!-)/g)]
      .filter((m) => !/var\(--site-block-[a-z-]+,\s*$/.test(style.slice(Math.max(0, m.index! - 80), m.index)))
      .map((m) => style.slice(Math.max(0, m.index! - 40), m.index! + 10).replace(/\s+/g, " "));
    expect(bad).toEqual([]);
  });

  test("the sheet, the type, the 44px targets and the capped stagger are the ones specified", () => {
    expect(style).toContain(".mm, .mm * { box-sizing: border-box; }");
    expect(style).toContain("padding: 5rem 1.25rem 0.5rem");
    expect(style).toContain("padding-right: 2rem; padding-left: 2rem;");
    expect(style).toContain("padding-right: 2.5rem; padding-left: 2.5rem;");
    expect(style).toContain("box-shadow: 0 24px 48px -24px color-mix(in srgb, var(--site-block-fg, #1a1a1a) 25%, transparent)");
    expect(style).toContain("letter-spacing: 0.12em");
    expect(style).toContain("font-size: 1.1rem");
    expect(style).toContain("font-weight: 600");
    expect(style).toContain("font-size: 0.875rem");
    expect(style).toContain("min-height: 44px");
    expect(style).toContain("outline: 2px solid var(--site-block-accent, #b45309)");
    expect(style).toContain("outline-offset: 2px");
    expect(style).toContain("var(--site-block-on-accent, #ffffff)");
    expect(style).toContain("var(--site-block-radius, 0.5rem)");
    expect(style).toMatch(/\.mm-static:hover[^{]*\{[^}]*cursor:\s*default/);
    expect(style).toMatch(
      /@media \(prefers-reduced-motion: no-preference\) \{\s*\.mm-item \{\s*animation: mm-in var\(--site-block-motion-rise, 0\.55s\) cubic-bezier\(0\.25, 0\.05, 0\.3, 0\.7\) both;\s*animation-delay: calc\(min\(var\(--i\), 10\) \* 40ms\);/,
    );
    expect(style).not.toMatch(/@apply|theme\(/);
  });

  test("rows rise as in the source: --site-block-motion-rise (0.55s), the source's curve, 18px; links colour over --site-block-motion (180ms)", () => {
    expect(SFC).toContain("animation: mm-in var(--site-block-motion-rise, 0.55s) cubic-bezier(0.25, 0.05, 0.3, 0.7) both;");
    expect(SFC).toContain("from { opacity: 0; transform: translateY(18px); }");
    expect(SFC).toMatch(/\.mm-link \{[^}]*transition: color var\(--site-block-motion, 180ms\) ease;/);
  });

  test("the grid is centred in the sheet's free height, as the source's wrapper did", () => {
    expect(SFC).toContain(".mm-body { display: flex; flex: 1 0 auto; flex-direction: column; justify-content: center; }");
    expect(SFC).toContain(".mm-nav { display: flex; flex: 1 0 auto; flex-direction: column; }");
  });

  test("with reduced motion the link, call-to-action and Close colour transitions are off", () => {
    expect(style).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.mm-link, \.mm-cta, \.mm-close \{ transition: none; \}\s*\}/,
    );
  });

  test("the fade is opacity only, --site-block-motion-enter (240ms) in, --site-block-motion (180ms) out, and only without reduced motion", () => {
    expect(style).toMatch(
      /@media \(prefers-reduced-motion: no-preference\) \{\s*\.mm-fade-enter-active \{ transition: opacity var\(--site-block-motion-enter, 240ms\) ease; \}\s*\.mm-fade-leave-active \{ transition: opacity var\(--site-block-motion, 180ms\) ease; \}\s*\.mm-fade-enter-from, \.mm-fade-leave-to \{ opacity: 0; \}\s*\}/,
    );
    expect(SFC).toContain('<Transition name="mm-fade">');
  });

  test("the component names no site menu and imports nothing but vue and its own files", () => {
    expect(SFC).not.toMatch(/MyJackfruit|NuxtLink|zPlanes|AUDIENCES|USE_CASES|@apply|theme\(/);
    expect(SFC).not.toMatch(/gilb\.com|localhost|127\.0\.0\.1/);
    expect(SFC).not.toMatch(/class="[^"]*\b(?:text|bg|border|rounded|px|py|mt|mb|flex|grid)-/);
    const imports = [...SFC.matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]);
    expect(imports.every((i) => i === "vue" || i!.startsWith("./"))).toBe(true);
  });
});
