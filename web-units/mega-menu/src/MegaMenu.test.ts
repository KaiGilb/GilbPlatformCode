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
import type { MenuGroup, MenuStack } from "./types";

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

describe("stack and quiet links", () => {
  test("a stack draws one cell holding each stacked group with its own heading and items", async () => {
    const groups: (MenuGroup | MenuStack)[] = [
      { heading: "Build", items: [{ label: "Pricing", href: "/pricing" }] },
      {
        stack: [
          {
            heading: "Apps",
            items: [
              { label: "Ledger", href: "/ledger" },
              { label: "Notes", href: "/notes" },
            ],
            cta: { label: "See apps", href: "/apps" },
          },
          { heading: "Use cases", items: [{ label: "Teams", sub: "Share the thing." }] },
        ],
      },
    ];
    await mountOpen({ groups });
    const cells = [...document.querySelectorAll<HTMLElement>(".mm-group")];
    expect(cells).toHaveLength(2);
    const stacks = cells.filter((el) => el.classList.contains("mm-stack"));
    expect(stacks).toHaveLength(1);
    const stack = stacks[0]!;
    expect(stack.firstElementChild?.classList.contains("mm-stack-inner")).toBe(true);
    expect(stack.firstElementChild?.children).toHaveLength(2);
    expect([...stack.querySelectorAll(".mm-label")].map((el) => el.textContent)).toEqual(["Apps", "Use cases"]);
    expect(stack.querySelectorAll(".mm-list")).toHaveLength(2);
    expect(stack.textContent).toContain("Ledger");
    expect(stack.textContent).toContain("Notes");
    expect(stack.textContent).toContain("Teams");
    expect(stack.textContent).toContain("Share the thing.");
    expect(stack.querySelector(".mm-cta")?.textContent).toContain("See apps");
    expect(stack.querySelectorAll(".mm-group")).toHaveLength(0);
    expect(cells[0]!.classList.contains("mm-stack")).toBe(false);
    expect(cells[0]!.querySelector(".mm-label")?.textContent).toBe("Build");
  });

  test("a stack counts as one cell for the default span, and its stagger continues across its groups", async () => {
    const groups: (MenuGroup | MenuStack)[] = [
      { heading: "Build", items: [{ label: "One", href: "/one" }] },
      { heading: "Who", items: [{ label: "Two", href: "/two" }, { label: "Three", href: "/three" }] },
      {
        stack: [
          { heading: "Apps", items: [{ label: "App", href: "/app" }] },
          { heading: "Use cases", items: [{ label: "Case", href: "/case" }, { label: "Other", href: "/other" }] },
        ],
      },
    ];
    await mountOpen({ groups });
    const cells = [...document.querySelectorAll<HTMLElement>(".mm-group")];
    expect(cells).toHaveLength(3);
    expect(cells.map((el) => el.style.getPropertyValue("--mm-span"))).toEqual(["4", "4", "4"]);
    const stack = cells[2]!;
    expect(stack.classList.contains("mm-stack")).toBe(true);
    const inStack = [...stack.querySelectorAll<HTMLElement>(".mm-item")].map((el) => Number(el.style.getPropertyValue("--i")));
    expect(inStack).toEqual([3, 4, 5]);
    const all = [...document.querySelectorAll<HTMLElement>(".mm-item")].map((el) => Number(el.style.getPropertyValue("--i")));
    expect(all).toEqual([0, 1, 2, 3, 4, 5]);
    for (let i = 1; i < inStack.length; i += 1) expect(inStack[i]!).toBeGreaterThan(inStack[i - 1]!);
  });

  test("a quiet group draws its links with the quiet class; a group without tone draws the link class", async () => {
    const groups: MenuGroup[] = [
      { heading: "Product", items: [{ label: "Pricing", href: "/pricing" }] },
      { heading: "Apps", tone: "quiet", items: [{ label: "Ledger", sub: "The books.", href: "/ledger" }, { label: "Teams" }] },
    ];
    await mountOpen({ groups });
    const pricing = document.querySelector("a[href='/pricing']");
    expect(pricing).not.toBeNull();
    expect(pricing!.classList.contains("mm-link")).toBe(true);
    expect(pricing!.classList.contains("mm-quiet")).toBe(false);
    expect(pricing!.querySelector(".mm-quiet")).toBeNull();
    expect(pricing!.querySelector(".mm-item-label")?.textContent).toBe("Pricing");
    expect(pricing!.querySelector(".mm-display")?.textContent).toBe("Pricing");

    const ledger = document.querySelector("a[href='/ledger']");
    expect(ledger).not.toBeNull();
    expect(ledger!.classList.contains("mm-link")).toBe(true);
    const quiet = ledger!.querySelector(".mm-quiet");
    expect(quiet).not.toBeNull();
    expect(quiet!.textContent).toBe("Ledger");
    expect(ledger!.querySelector(".mm-item-label")).toBeNull();

    const teams = [...document.querySelectorAll(".mm-static")].find((el) => el.textContent?.includes("Teams"));
    expect(teams?.querySelector(".mm-quiet")?.textContent).toBe("Teams");
    expect(teams?.querySelector(".mm-item-label")).toBeNull();
  });

  test("tone card draws audience cards even on a link; a group of only static rows does too; links stay display", async () => {
    const groups: MenuGroup[] = [
      { heading: "Build", items: [{ label: "Pricing", sub: "Pay.", href: "/pricing" }] },
      { heading: "Who", tone: "card", items: [{ label: "Founders", sub: "Ship.", href: "/founders" }] },
      { heading: "Plain", items: [{ label: "Families", sub: "Share." }] },
      { heading: "Kept", tone: "link", items: [{ label: "Builders" }] },
    ];
    await mountOpen({ groups });
    const lists = [...document.querySelectorAll(".mm-list")];
    expect(lists[0]!.classList.contains("mm-list-card")).toBe(false);
    expect(lists[0]!.querySelector(".mm-display")?.textContent).toBe("Pricing");
    expect(lists[1]!.classList.contains("mm-list-card")).toBe(true);
    expect(lists[1]!.querySelector(".mm-display")).toBeNull();
    expect(lists[1]!.querySelector(".mm-item-label")?.textContent).toBe("Founders");
    expect(lists[1]!.querySelector("a")!.classList.contains("mm-link")).toBe(true);
    expect(lists[2]!.classList.contains("mm-list-card")).toBe(true);
    expect(lists[2]!.querySelector(".mm-display")).toBeNull();
    expect(lists[3]!.classList.contains("mm-list-card")).toBe(false);
    expect(lists[3]!.querySelector(".mm-display")?.textContent).toBe("Builders");
  });

  test("a quiet group with a sub uses the apps list; one without a sub uses the plain list", async () => {
    const groups: MenuGroup[] = [
      { heading: "Apps", tone: "quiet", items: [{ label: "Ledger", sub: "The books.", href: "/ledger" }] },
      { heading: "Use cases", tone: "quiet", items: [{ label: "Teams" }, { label: "Notes" }] },
    ];
    await mountOpen({ groups });
    const lists = [...document.querySelectorAll(".mm-list")];
    expect(lists[0]!.classList.contains("mm-list-quiet")).toBe(true);
    expect(lists[0]!.classList.contains("mm-list-plain")).toBe(false);
    expect(lists[1]!.classList.contains("mm-list-quiet")).toBe(true);
    expect(lists[1]!.classList.contains("mm-list-plain")).toBe(true);
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

  function normCss(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }

  /** Rules in source order. A rule inside @media is recorded as `@media … > selector`. */
  function styleRules(css: string): { selector: string; body: string }[] {
    const rules: { selector: string; body: string }[] = [];
    function walk(text: string, medias: string[]): void {
      let i = 0;
      while (i < text.length) {
        while (i < text.length && /\s/.test(text.charAt(i))) i += 1;
        if (i >= text.length) break;
        const open = text.indexOf("{", i);
        if (open < 0) break;
        const prelude = text.slice(i, open).trim();
        let depth = 1;
        let j = open + 1;
        while (j < text.length && depth > 0) {
          const ch = text.charAt(j);
          if (ch === "{") depth += 1;
          else if (ch === "}") depth -= 1;
          j += 1;
        }
        const inner = text.slice(open + 1, j - 1);
        if (prelude.startsWith("@media")) walk(inner, [...medias, normCss(prelude)]);
        else if (!prelude.startsWith("@") && prelude) {
          rules.push({ selector: [...medias, normCss(prelude)].join(" > "), body: normCss(inner) });
        }
        i = j;
      }
    }
    walk(css, []);
    return rules;
  }

  test("links and the call to action are at least 44px tall", () => {
    expect(ruleBodies(".mm-link").some((body) => /min-height:\s*44px/.test(body))).toBe(true);
    expect(ruleBodies(".mm-cta").some((body) => /min-height:\s*44px/.test(body))).toBe(true);
  });

  test("the call to action colour is the on-cta variable, falling back to on-accent", () => {
    expect(ruleBodies(".mm-cta").some((body) => /color:\s*var\(\s*--site-block-on-cta,\s*var\(\s*--site-block-on-accent\b/.test(body))).toBe(true);
  });

  test("every colour literal sits inside a var(--site-block-*, ...) fallback, except the call-to-action hover mix's black", () => {
    const bad = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|gray|grey)\b(?!-)/g)]
      .filter((m) => !/var\(--site-block-[a-z-]+,\s*$/.test(style.slice(Math.max(0, m.index! - 80), m.index)))
      .filter((m) => !(m[0] === "black" && /88%,\s*$/.test(style.slice(Math.max(0, m.index! - 8), m.index))))
      .filter((m) => !(m[0].startsWith("rgb") && /^rgba?\(from var\(--site-block-/.test(style.slice(m.index!))))
      .map((m) => style.slice(Math.max(0, m.index! - 40), m.index! + 10).replace(/\s+/g, " "));
    expect(bad).toEqual([]);
  });

  test("the sheet, the type, the 44px targets and the capped stagger are the ones specified", () => {
    expect(style).toContain(".mm, .mm * { box-sizing: border-box; }");
    expect(style).toContain("padding: 5rem 1.25rem 0.5rem");
    expect(style).toContain("padding-right: 2rem; padding-left: 2rem;");
    expect(style).toContain("padding-right: 2.5rem; padding-left: 2.5rem;");
    expect(style).toContain("box-shadow: 0 4px 12px -2px var(--site-block-shadow, rgba(28, 28, 20, 0.08))");
    expect(style).toContain("letter-spacing: 0.14em");
    expect(style).toContain("font-size: 1.1rem");
    expect(style).toContain("font-weight: 600");
    expect(style).toContain("font-size: clamp(1.7rem, 3.2vw, 2.4rem)");
    expect(style).toContain("font-size: 0.9rem");
    expect(style).toContain("min-height: 44px");
    expect(style).toContain("outline: 2px solid var(--site-block-accent, #b45309)");
    expect(style).toContain("outline-offset: 3px");
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
    expect(SFC).toContain(".mm-nav {");
    expect(SFC).toContain("min-height: 100%;");
    expect(SFC).toContain("padding: 5rem 1.25rem 0.5rem;");
  });

  test("with reduced motion the link, call-to-action and Close colour transitions are off", () => {
    expect(style).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.mm-link, \.mm-cta, \.mm-close \{ transition: none; \}\s*\}/,
    );
  });

  test("rule inventory: transitions on links, the call-to-action and Close", () => {
    const found = styleRules(style)
      .filter(
        (rule) =>
          (rule.selector.includes("mm-link") || rule.selector.includes("mm-cta") || rule.selector.includes("mm-close")) &&
          rule.body.includes("transition"),
      )
      .map((rule) => `${rule.selector} { ${rule.body} }`);
    expect(found).toEqual([
      ".mm-link { display: block; width: 100%; padding: 0; color: var(--site-block-fg, #1a1a1a); font: inherit; text-decoration: none; cursor: pointer; transition: color var(--site-block-motion, 180ms) ease; }",
      "@media (prefers-reduced-motion: reduce) > .mm-link, .mm-cta, .mm-close { transition: none; }",
    ]);
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

  test("whole-style: the style block is exactly the rules this file means", () => {
    expect(SFC.match(/<style[\s>]/g)?.length ?? 0).toBe(1);
    const templateStart = SFC.indexOf("<template>");
    const templateEnd = SFC.lastIndexOf("</template>");
    const template = SFC.slice(templateStart, templateEnd);
    const styleAttrs = [...template.matchAll(/:?style="[^"]*"/g)].map((m) => m[0]);
    expect(styleAttrs).toEqual([
      `:style="{ zIndex, '--mm-sheet': sheetHeight, '--mm-max': maxWidth }"`,
      `:style="{ '--mm-span': String(cell.span) }"`,
      `:style="{ '--i': String(entry.i) }"`,
    ]);
    const block = (SFC.split("<style scoped>")[1] ?? "").split("</style>")[0] ?? "";
    const flat = block.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
    expect(flat).toBe(".mm, .mm * { box-sizing: border-box; } .mm { position: fixed; inset: 0; } .mm-sheet { position: fixed; top: 0; right: 0; left: 0; display: flex; flex-direction: column; height: var(--mm-sheet, 80dvh); overflow-y: auto; color: var(--site-block-fg, #1a1a1a); box-shadow: 0 4px 12px -2px var(--site-block-shadow, rgba(28, 28, 20, 0.08)); border-bottom-right-radius: var(--site-block-radius, 0.5rem); border-bottom-left-radius: var(--site-block-radius, 0.5rem); } .mm-ground { position: absolute; inset: 0; background: var(--site-block-bg, #ffffff); background-image: var(--site-block-sheet-wash, none); border-bottom-right-radius: inherit; border-bottom-left-radius: inherit; } .mm-catcher { position: absolute; right: 0; bottom: 0; left: 0; top: var(--mm-sheet, 80dvh); cursor: pointer; } .mm-nav { position: relative; display: flex; flex: 1 1 0%; flex-direction: column; width: 100%; min-height: 100%; padding: 5rem 1.25rem 0.5rem; } .mm-body { display: flex; flex: 1 0 auto; flex-direction: column; justify-content: center; } .mm-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 3rem; align-content: start; width: 100%; max-width: var(--mm-max, 80rem); margin-inline: auto; } .mm-group { min-width: 0; } .mm-stack-inner { display: grid; gap: 2.5rem; } .mm-stack-inner > * { min-width: 0; } .mm-label { margin: 0; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; color: var(--site-block-muted, #4b5563); } .mm-list { list-style: none; display: grid; gap: 0.5rem; margin: 0.75rem 0 0; padding: 0; } .mm-list-card { gap: 0.5rem 1.5rem; margin-top: 1.5rem; } .mm-list-quiet { gap: 0.75rem; margin-top: 1.25rem; } .mm-list-plain { gap: 0.625rem; } .mm-item { margin: 0; padding: 0; min-width: 0; } .mm-link, .mm-cta, .mm-close { min-height: 44px; } .mm-link { display: block; width: 100%; padding: 0; color: var(--site-block-fg, #1a1a1a); font: inherit; text-decoration: none; cursor: pointer; transition: color var(--site-block-motion, 180ms) ease; } .mm-item-label { display: block; font-size: 1.1rem; font-weight: 600; line-height: 1.375; color: var(--site-block-fg, #1a1a1a); } .mm-display { display: inline-block; font-weight: 650; letter-spacing: -0.03em; line-height: 1.12; font-size: clamp(1.7rem, 3.2vw, 2.4rem); color: var(--site-block-fg, #1a1a1a); } .mm-link:hover .mm-item-label, .mm-link:hover .mm-display { color: var(--site-block-accent, #b45309); } .mm-quiet { display: inline-flex; align-items: center; min-height: 32px; font-size: 1.02rem; font-weight: 500; color: var(--site-block-fg, #1a1a1a); } .mm-quiet:hover, .mm-link:hover .mm-quiet { color: var(--site-block-accent, #b45309); } .mm-sub { display: block; margin-top: 0; font-size: 0.9rem; font-weight: 400; line-height: 1.45; color: var(--site-block-muted, #4b5563); } .mm-list-card .mm-sub { margin-top: 0.25rem; } .mm-static { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; min-height: 44px; background: transparent; cursor: default; } .mm-list-card .mm-static, .mm-list-card .mm-link:not(.mm-cta) { display: block; width: auto; margin: 0 -0.75rem; padding: 0.7rem 0.75rem; border-radius: 8px; min-height: 0; } .mm-list-plain .mm-static { display: contents; } .mm-static, .mm-static:hover, .mm-static:hover .mm-item-label, .mm-static .mm-item-label, .mm-static:hover .mm-quiet, .mm-static .mm-quiet { color: var(--site-block-fg, #1a1a1a); background: transparent; cursor: default; } .mm-cta { display: inline-flex; flex-direction: row; align-items: center; align-self: flex-start; width: auto; margin-top: 0; padding: 0.75rem 1.75rem; border-radius: var(--site-block-cta-radius, var(--site-block-radius, 0.5rem)); background: var(--site-block-cta, var(--site-block-accent, #b45309)); color: var(--site-block-on-cta, var(--site-block-on-accent, #ffffff)); font-size: 1rem; font-weight: 500; line-height: 1.5; } .mm-cta:hover, .mm-cta:focus-visible { background: var(--site-block-cta-hover, color-mix(in srgb, var(--site-block-cta, var(--site-block-accent, #b45309)) 88%, black)); } .mm-link:focus-visible, .mm-cta:focus-visible, .mm-close:focus-visible { outline: 2px solid var(--site-block-accent, #b45309); outline-offset: 3px; } .mm-link:not(.mm-cta):focus-visible { border-radius: 2px; } .mm-footer { margin-top: 1.25rem; color: var(--site-block-fg, #1a1a1a); } .mm-close { position: sticky; bottom: 0; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 0.4rem; width: 100%; margin-top: auto; padding: 0.85rem 0.5rem 0.65rem; border: 0; background-color: transparent; background-image: linear-gradient(180deg, var(--site-block-bg-fade, rgba(247, 244, 237, 0)) 0%, var(--site-block-bg, #ffffff) 36%); color: var(--site-block-muted, #4b5563); font: inherit; font-size: 0.9rem; font-weight: 500; cursor: pointer; } .mm-close:hover { color: var(--site-block-fg, #1a1a1a); } .mm-close-icon { display: block; } @media (min-width: 640px) { .mm-nav { padding-right: 2rem; padding-left: 2rem; } .mm-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); } .mm-stack-inner { grid-template-columns: repeat(2, minmax(0, 1fr)); } } @media (min-width: 768px) { .mm-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3rem 2.5rem; } .mm-stack { grid-column: span 2; } } @media (min-width: 1024px) { .mm-nav { padding-right: 2.5rem; padding-left: 2.5rem; } .mm-grid { grid-template-columns: repeat(12, minmax(0, 1fr)); } .mm-group { grid-column: span var(--mm-span, 12); } .mm-stack-inner { grid-template-columns: repeat(1, minmax(0, 1fr)); gap: 2.25rem; } } @media (prefers-reduced-motion: no-preference) { .mm-fade-enter-active { transition: opacity var(--site-block-motion-enter, 240ms) ease; } .mm-fade-leave-active { transition: opacity var(--site-block-motion, 180ms) ease; } .mm-fade-enter-from, .mm-fade-leave-to { opacity: 0; } } @media (prefers-reduced-motion: reduce) { .mm-link, .mm-cta, .mm-close { transition: none; } } @media (prefers-reduced-motion: no-preference) { .mm-item { animation: mm-in var(--site-block-motion-rise, 0.55s) cubic-bezier(0.25, 0.05, 0.3, 0.7) both; animation-delay: calc(min(var(--i), 10) * 40ms); } } @keyframes mm-in { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }");
  });

  test("the stack, quiet, call-to-action and wash rules are as written", () => {
    const block = (SFC.split("<style scoped>")[1] ?? "").split("</style>")[0] ?? "";
    const css = block.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
    expect(css).toContain(".mm-stack-inner { display: grid; gap: 2.5rem; }");
    expect(css).toContain("@media (min-width: 640px) { .mm-nav { padding-right: 2rem; padding-left: 2rem; } .mm-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); } .mm-stack-inner { grid-template-columns: repeat(2, minmax(0, 1fr)); } }");
    expect(css).toContain("@media (min-width: 768px) { .mm-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3rem 2.5rem; } .mm-stack { grid-column: span 2; } }");
    expect(css).toContain("@media (min-width: 1024px) { .mm-nav { padding-right: 2.5rem; padding-left: 2.5rem; } .mm-grid { grid-template-columns: repeat(12, minmax(0, 1fr)); } .mm-group { grid-column: span var(--mm-span, 12); } .mm-stack-inner { grid-template-columns: repeat(1, minmax(0, 1fr)); gap: 2.25rem; } }");
    expect(css).toContain(".mm-quiet { display: inline-flex; align-items: center; min-height: 32px; font-size: 1.02rem; font-weight: 500; color: var(--site-block-fg, #1a1a1a); }");
    expect(css).toContain(".mm-quiet:hover, .mm-link:hover .mm-quiet { color: var(--site-block-accent, #b45309); }");
    expect(css).toContain(".mm-display { display: inline-block; font-weight: 650; letter-spacing: -0.03em; line-height: 1.12; font-size: clamp(1.7rem, 3.2vw, 2.4rem); color: var(--site-block-fg, #1a1a1a); }");
    expect(css).toContain(".mm-list-card .mm-static, .mm-list-card .mm-link:not(.mm-cta) { display: block; width: auto; margin: 0 -0.75rem; padding: 0.7rem 0.75rem; border-radius: 8px; min-height: 0; }");
    expect(css).toContain(".mm-cta { display: inline-flex; flex-direction: row; align-items: center; align-self: flex-start; width: auto; margin-top: 0; padding: 0.75rem 1.75rem; border-radius: var(--site-block-cta-radius, var(--site-block-radius, 0.5rem)); background: var(--site-block-cta, var(--site-block-accent, #b45309)); color: var(--site-block-on-cta, var(--site-block-on-accent, #ffffff)); font-size: 1rem; font-weight: 500; line-height: 1.5; }");
    expect(css).toContain(".mm-cta:hover, .mm-cta:focus-visible { background: var(--site-block-cta-hover, color-mix(in srgb, var(--site-block-cta, var(--site-block-accent, #b45309)) 88%, black)); }");
    expect(css).toContain("background: var(--site-block-bg, #ffffff); background-image: var(--site-block-sheet-wash, none);");
  });

  test("README Host must supply lists exactly the variables the style reads", () => {
    const css = ((SFC.split("<style scoped>")[1] ?? "").split("</style>")[0] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
    const inStyle = [...new Set([...css.matchAll(/--site-block-[a-z-]+/g)].map((m) => m[0]))].sort();
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
    const section = (readme.split("## Host must supply")[1] ?? "").split(/\n## /)[0] ?? "";
    const listed = section
      .split("\n")
      .filter((line) => line.startsWith("- "))
      .map((line) => {
        const found = line.match(/^- `(--site-block-[a-z-]+)`/);
        if (!found?.[1]) throw new Error(`bullet does not start with a variable: ${line}`);
        return found[1];
      })
      .sort();
    expect(listed).toEqual(inStyle);
  });
});
