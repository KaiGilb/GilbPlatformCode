// Ported from the Vue unit web-units/image-lightbox (commit ca9ca73): the viewer-level tests of
// src/ImageLightbox.test.ts lines 89-235 ("opening and closing"), src/fixes.test.ts lines 98-148 (D3, a slow or
// failing original), and the style tests of src/ImageLightbox.test.ts lines 371-395 and 407-412. Same inputs and
// expectations; where a test opened the viewer through ImageLightbox, it opens it with usePictureViewer from a button.
import { act, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { defaultWords } from "./lightboxCore";
import type { LightboxItem } from "./types";
import { Harness, ITEMS, axeIds, fire, flush, key, openViewer, q, shown, viewer, zoomOf, wheel, pointer, giveLayout, removeLayout, panOf } from "../test/kit";
import { PictureViewer } from "./PictureViewer";
import { createElement } from "react";
import { vi } from "vitest";

const PICTURE: LightboxItem[] = [{ src: "/a.jpg", alt: "A tree in a field", caption: "A tree in a field" }];

describe("PictureViewer: opening and closing", () => {
  test("a click opens a modal dialog named by its words, with the picture, its caption and a close button", async () => {
    await openViewer({ items: PICTURE });
    const v = viewer()!;
    expect(v.getAttribute("role")).toBe("dialog");
    expect(v.getAttribute("aria-modal")).toBe("true");
    expect(v.getAttribute("aria-label")).toBe("Image viewer");
    expect(v.parentElement).toBe(document.body);
    const big = v.querySelector("img")!;
    expect([big.getAttribute("src"), big.getAttribute("alt")]).toEqual(["/a.jpg", "A tree in a field"]);
    expect(v.querySelector(".ilb-caption")!.textContent!.trim()).toBe("A tree in a field");
    expect(v.querySelector(".ilb-caption")!.getAttribute("aria-hidden")).toBe("true");
    expect(v.querySelector(".ilb-close")!.getAttribute("aria-label")).toBe("Close image viewer");
  });
  test("the viewer shows the item's own src when given, and a caption of its own", async () => {
    await openViewer({ items: [{ src: "/a-big.jpg", alt: "A tree in a field", caption: "Ripe, in July", fallback: "/a.jpg" }] });
    expect(viewer()!.querySelector("img")!.getAttribute("src")).toBe("/a-big.jpg");
    const cap = viewer()!.querySelector(".ilb-caption")!;
    expect(cap.textContent!.trim()).toBe("Ripe, in July");
    expect(cap.hasAttribute("aria-hidden")).toBe(false);
  });
  test("Escape closes it from anywhere, also with focus on the page body after a click on the picture", async () => {
    await openViewer({ items: PICTURE });
    (document.activeElement as HTMLElement)?.blur();
    key("Escape");
    await flush();
    expect(viewer()).toBeNull();
  });
  test("the close button closes it", async () => {
    await openViewer({ items: PICTURE });
    await act(async () => { q(".ilb-close").click(); });
    await flush();
    expect(viewer()).toBeNull();
  });
  test("focus goes to the close button on open and back to the element that opened it on close", async () => {
    await openViewer({ items: PICTURE });
    expect(document.activeElement).toBe(q(".ilb-close"));
    key("Escape");
    await flush();
    expect(document.activeElement).toBe(document.getElementById("opener"));
  });
  test("a single picture has no counter, no previous or next", async () => {
    await openViewer({ items: PICTURE });
    expect(viewer()!.querySelector(".ilb-count")).toBeNull();
    expect(viewer()!.querySelector(".ilb-prev")).toBeNull();
    expect(viewer()!.querySelector(".ilb-next")).toBeNull();
  });
  test("while open the page behind is inert and fixed at its scroll position; on close both are undone", async () => {
    render(<Harness items={PICTURE} />);
    document.body.style.overflow = "scroll";
    const host = document.body.firstElementChild as HTMLElement;
    await act(async () => { document.getElementById("opener")!.click(); });
    await flush();
    expect(host.hasAttribute("inert")).toBe(true);
    expect(viewer()!.hasAttribute("inert")).toBe(false);
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.overflow).toBe("hidden");
    key("Escape");
    await flush();
    expect(host.hasAttribute("inert")).toBe(false);
    expect(document.body.style.position).toBe("");
    expect(document.body.style.overflow).toBe("scroll");
    expect(window.scrollTo).toHaveBeenCalled();
  });
  test("unmounting while open leaves the page unlocked", async () => {
    const { unmount } = await openViewer({ items: PICTURE });
    expect(document.body.style.position).toBe("fixed");
    unmount();
    await flush();
    expect(document.body.style.position).toBe("");
    expect(document.querySelector("[inert]")).toBeNull();
  });
  test("Tab stays inside the dialog: from the last button it wraps to the first, and Shift+Tab from the first to the last", async () => {
    await openViewer({ items: PICTURE });
    const btns = [...viewer()!.querySelectorAll<HTMLElement>("button:not([disabled])")];
    expect(btns.length).toBeGreaterThan(1);
    btns[btns.length - 1]!.focus();
    key("Tab");
    expect(document.activeElement).toBe(btns[0]);
    key("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(btns[btns.length - 1]);
  });
  test("+ - and 0 zoom and reset, held between fit and the maximum", async () => {
    await openViewer({ items: PICTURE });
    const zoom = () => Number(viewer()!.querySelector("img")!.getAttribute("data-zoom"));
    expect(zoom()).toBe(1);
    key("+");
    expect(zoom()).toBe(1.5);
    for (let i = 0; i < 10; i++) key("=");
    expect(zoom()).toBe(4);
    key("-");
    expect(zoom()).toBeCloseTo(4 / 1.5, 1);
    key("0");
    expect(zoom()).toBe(1);
    key("-");
    expect(zoom()).toBe(1);
  });
  test("the zoom buttons follow the zoom: out and fit are off at fit size, in is off at the maximum", async () => {
    await openViewer({ items: PICTURE });
    const tools = [...viewer()!.querySelectorAll<HTMLButtonElement>(".ilb-tools button")];
    expect(tools.map((t) => t.disabled)).toEqual([true, true, false]);
    await act(async () => { tools[2]!.click(); });
    expect(tools.map((t) => t.disabled)).toEqual([false, false, false]);
    expect(q(".ilb-fit")).toBe(tools[1]);
  });
  test("words are the host's: another language reaches every name", async () => {
    await openViewer({ items: PICTURE, options: { words: { dialog: "Bildevisning", close: "Lukk" } } });
    expect(viewer()!.getAttribute("aria-label")).toBe("Bildevisning");
    expect(q(".ilb-close").getAttribute("aria-label")).toBe("Lukk");
  });
  test("axe: no violations with the dialog open and with it closed (jsdom; colour contrast is measured in the browser run)", async () => {
    render(<Harness items={PICTURE} />);
    expect(await axeIds()).toEqual([]);
    await act(async () => { document.getElementById("opener")!.click(); });
    await flush();
    document.body.querySelectorAll("[inert]").forEach((e) => e.removeAttribute("inert"));
    expect(await axeIds()).toEqual([]);
  });
});

describe("PictureViewer: moving through a set", () => {
  test("the arrow keys and the buttons move through the set, held at the ends, and report the index", async () => {
    await openViewer({});
    expect(q(".ilb-count").textContent!.trim()).toBe("1 of 3");
    expect(q<HTMLButtonElement>(".ilb-prev").disabled).toBe(true);
    key("ArrowRight");
    expect(q(".ilb-count").textContent!.trim()).toBe("2 of 3");
    // two quick key presses before the next render both count
    key("ArrowRight"); key("ArrowRight");
    expect(q(".ilb-count").textContent!.trim()).toBe("3 of 3");
    expect(q<HTMLButtonElement>(".ilb-next").disabled).toBe(true);
    await act(async () => { q(".ilb-prev").click(); });
    expect(q(".ilb-count").textContent!.trim()).toBe("2 of 3");
    expect(shown().getAttribute("alt")).toBe("Ben on the hill");
  });
});

describe("PictureViewer used on its own (without the hook)", () => {
  const props = (over: Record<string, unknown> = {}) => ({ items: ITEMS, index: 0, onClose: () => {}, ...over });
  test("a new index from the parent moves the viewer; its own moves are reported", async () => {
    const onIndexChange = vi.fn();
    const r = render(createElement(PictureViewer, props({ onIndexChange })));
    expect(q(".ilb-count").textContent!.trim()).toBe("1 of 3");
    key("ArrowRight");
    expect(onIndexChange).toHaveBeenCalledWith(1);
    expect(onIndexChange).toHaveBeenCalledTimes(1);
    r.rerender(createElement(PictureViewer, props({ index: 2, onIndexChange })));
    await flush();
    expect(q(".ilb-count").textContent!.trim()).toBe("3 of 3");
    expect(onIndexChange).toHaveBeenCalledTimes(1);
  });
  test("two key presses before the next render both count", async () => {
    render(createElement(PictureViewer, props()));
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    });
    expect(q(".ilb-count").textContent!.trim()).toBe("3 of 3");
  });
  test("closing gives focus back to the shown picture if it is on the page, else to where the person was", async () => {
    const opener = document.createElement("button");
    const pic = document.createElement("img");
    pic.tabIndex = 0;
    document.body.append(opener, pic);
    opener.focus();
    const items = ITEMS.map((i, n) => ({ ...i, el: n === 1 ? pic : null }));
    const r = render(createElement(PictureViewer, props({ items, index: 1 })));
    expect(document.activeElement).toBe(q(".ilb-close"));
    r.unmount();
    expect(document.activeElement).toBe(pic);
    opener.focus();
    const r2 = render(createElement(PictureViewer, props()));
    expect(document.activeElement).toBe(q(".ilb-close"));
    r2.unmount();
    expect(document.activeElement).toBe(opener);
  });
  test("Tab and Shift+Tab with focus outside the buttons start at the first and the last", async () => {
    render(createElement(PictureViewer, props()));
    const btns = [...viewer()!.querySelectorAll<HTMLElement>("button:not([disabled])")];
    (document.activeElement as HTMLElement).blur();
    key("Tab");
    expect(document.activeElement).toBe(btns[0]);
    (document.activeElement as HTMLElement).blur();
    key("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(btns[btns.length - 1]);
  });
  test("a picture the browser already has (cache) fires no event: its state is read instead", async () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    const nat = vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(640);
    render(createElement(PictureViewer, props()));
    await flush();
    expect(viewer()!.querySelector(".ilb-loading")).toBeNull();
    expect(viewer()!.querySelector(".ilb-failed-note")).toBeNull();
    nat.mockReturnValue(0);
    key("ArrowRight");
    await flush();
    expect(shown().getAttribute("src")).toBe("https://example.test/ben.jpg"); // the original is broken: the fallback is tried
    complete.mockRestore();
  });
  test("a maximum zoom of 2 is held by the keys, the pinch and the wheel", async () => {
    giveLayout();
    try {
      render(createElement(PictureViewer, props({ maxZoom: 2 })));
      for (let i = 0; i < 5; i++) key("+");
      expect(zoomOf()).toBe(2);
      key("0");
      pointer("pointerdown", shown(), 1, 100, 150, 1000);
      pointer("pointerdown", shown(), 2, 200, 150, 1001);
      pointer("pointermove", shown(), 2, 900, 150, 1050);
      expect(zoomOf()).toBe(2);
      pointer("pointerup", shown(), 2, 900, 150, 1100);
      pointer("pointerup", shown(), 1, 100, 150, 1101);
      key("0");
      wheel(100, 150, -10000, true);
      expect(zoomOf()).toBe(2);
      expect(panOf().x).toBe(-100);
    } finally {
      removeLayout();
    }
  });
});

describe("PictureViewer: D3, a slow or failing original", () => {
  const open = () => openViewer({ index: 1, items: [
    { src: "/a.jpg", alt: "A" },
    { src: "/b-big.jpg", alt: "B", caption: "B", fallback: "/b.jpg" },
  ].map((i) => ({ caption: i.alt, ...i })) });
  test("while the original loads there is a visible, announced loading cue and the figure is busy", async () => {
    await open();
    expect(shown().getAttribute("src")).toBe("/b-big.jpg");
    const cue = viewer()!.querySelector(".ilb-loading")!;
    expect([cue.textContent!.trim(), cue.getAttribute("role")]).toEqual(["Loading picture", "status"]);
    expect(viewer()!.querySelector("figure")!.getAttribute("aria-busy")).toBe("true");
    fire(shown(), "load");
    expect(viewer()!.querySelector(".ilb-loading")).toBeNull();
    expect(viewer()!.querySelector("figure")!.hasAttribute("aria-busy")).toBe(false);
  });
  test("when the original fails the page's own picture is shown, with the alt text", async () => {
    await open();
    fire(shown(), "error");
    expect(shown().getAttribute("src")).toBe("/b.jpg");
    expect(shown().getAttribute("alt")).toBe("B");
    fire(shown(), "load");
    expect(viewer()!.querySelector(".ilb-failed-note")).toBeNull();
  });
  test("when both fail a visible, announced message says so; Escape and the arrows still work", async () => {
    await open();
    fire(shown(), "error");
    fire(shown(), "error");
    const note = viewer()!.querySelector(".ilb-failed-note")!;
    expect([note.textContent!.trim(), note.getAttribute("role")]).toEqual(["The picture could not be loaded", "status"]);
    expect(shown().classList.contains("ilb-failed")).toBe(true);
    key("ArrowLeft");
    expect(q(".ilb-count").textContent!.trim()).toBe("1 of 2");
    key("Escape");
    await flush();
    expect(viewer()).toBeNull();
  });
  test("a single picture with a fuller file falls back to its own file when that fails; the words are the host's", async () => {
    await openViewer({ items: [{ src: "/s-big.jpg", alt: "S", caption: "S", fallback: "/s.jpg" }], options: { words: { loading: "Laster", loadFailed: "Feil" } } });
    expect(viewer()!.querySelector(".ilb-loading")!.textContent!.trim()).toBe("Laster");
    fire(shown(), "error");
    expect(shown().getAttribute("src")).toBe("/s.jpg");
    fire(shown(), "error");
    expect(viewer()!.querySelector(".ilb-failed-note")!.textContent!.trim()).toBe("Feil");
  });
  test("axe: no violations while loading, when ready and when failed", async () => {
    await open();
    expect(await axeIds()).toEqual([]);
    fire(shown(), "load");
    expect(await axeIds()).toEqual([]);
  });
  test("axe: no violations when failed", async () => {
    await open();
    fire(shown(), "error");
    fire(shown(), "error");
    expect(await axeIds()).toEqual([]);
  });
});

describe("the unit's style", () => {
  const css = readFileSync(join(process.cwd(), "src", "pictureViewer.css"), "utf8");
  const style = css.replace(/\/\*[\s\S]*?\*\//g, "");
  test("every colour literal sits inside a var(--site-block-*, ...) fallback", () => {
    const bad = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(white|black|gray|grey)\b(?!-)/g)]
      .filter((m) => !/var\(--site-block-[a-z-]+,\s*$/.test(style.slice(Math.max(0, m.index! - 80), m.index)))
      .map((m) => style.slice(Math.max(0, m.index! - 40), m.index! + 10).replace(/\s+/g, " "));
    expect(bad).toEqual([]);
  });
  test("the viewer sizes every box with border-box", () => {
    expect(style).toContain(".ilb-backdrop, .ilb-backdrop * { box-sizing: border-box; }");
  });
  test("motion is only for visitors who have not asked for less: the fade and the zoom glide sit under prefers-reduced-motion: no-preference", () => {
    const outside = style.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}\n/, "");
    expect(style).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(outside).not.toMatch(/animation:|transition:/);
  });
  test("the dialog does not let the page behind scroll: contained overscroll and no touch default on the stage", () => {
    expect(style).toContain("overscroll-behavior: contain");
    expect(style).toContain("touch-action: none");
  });
  test("the controls hidden by a tap are hidden with visibility, so the focus order stays", () => {
    expect(style).toMatch(/\.ilb-chrome-hidden[^{]*\{\s*visibility: hidden;/);
    expect(style).not.toMatch(/\.ilb-chrome-hidden[^{]*\{[^}]*display:\s*none/);
  });
  test("the zoom-reset button's accessible name holds the word drawn on it (WCAG 2.5.3 label in name)", () => {
    expect(defaultWords.zoomReset.toLowerCase()).toContain(defaultWords.fit.toLowerCase());
  });
});

describe("Accessibility.Viewer: every action by keyboard, each one named", () => {
  test("open, close, next, previous, zoom in, zoom out, reset zoom and read the caption, with the keyboard alone", async () => {
    const user = userEvent.setup();
    render(<Harness index={1} />);
    // open: the opener is a button; Enter on it opens the viewer
    document.getElementById("opener")!.focus();
    await user.keyboard("{Enter}");
    await flush();
    expect(viewer()).not.toBeNull();
    expect(document.activeElement).toBe(q(".ilb-close"));
    // read the caption: it is text in the dialog, with the picture's alt text
    expect(q(".ilb-caption").textContent!.trim()).toBe("Ben, on the hill in July");
    expect(shown().getAttribute("alt")).toBe("Ben on the hill");
    expect(q(".ilb-count").textContent!.trim()).toBe("2 of 3");
    // every control reachable with Tab is a button with a name
    const names: string[] = [];
    for (let i = 0; i < 6; i++) {
      const el = document.activeElement as HTMLElement;
      expect(viewer()!.contains(el)).toBe(true);
      expect(el.tagName).toBe("BUTTON");
      names.push(el.getAttribute("aria-label") ?? "");
      await user.keyboard("{Tab}");
    }
    expect(names).toEqual(["Close image viewer", "Previous picture", "Next picture", "Zoom in", "Close image viewer", "Previous picture"]);
    expect(names.every((n) => n.length > 0)).toBe(true);
    // next and previous, from the buttons
    q<HTMLElement>(".ilb-next").focus();
    await user.keyboard("{Enter}");
    expect(q(".ilb-count").textContent!.trim()).toBe("3 of 3");
    // the button that just turned itself off hands focus to the dialog, not the page
    expect(document.activeElement).toBe(q(".ilb-close"));
    q<HTMLElement>(".ilb-prev").focus();
    await user.keyboard("{Enter}");
    expect(q(".ilb-count").textContent!.trim()).toBe("2 of 3");
    // zoom in, zoom out and reset, from the buttons
    q<HTMLElement>(".ilb-tools button:nth-child(3)").focus();
    await user.keyboard("{Enter}");
    expect(zoomOf()).toBe(1.5);
    q<HTMLElement>(".ilb-tools button:nth-child(1)").focus();
    await user.keyboard("{Enter}");
    expect(zoomOf()).toBe(1);
    q<HTMLElement>(".ilb-tools button:nth-child(3)").focus();
    await user.keyboard("{Enter}{Enter}");
    expect(zoomOf()).toBe(2.25);
    q<HTMLElement>(".ilb-fit").focus();
    await user.keyboard("{Enter}");
    expect(zoomOf()).toBe(1);
    // and from the keys
    await user.keyboard("{ArrowRight}");
    expect(q(".ilb-count").textContent!.trim()).toBe("3 of 3");
    await user.keyboard("{ArrowLeft}");
    expect(q(".ilb-count").textContent!.trim()).toBe("2 of 3");
    await user.keyboard("+");
    expect(zoomOf()).toBe(1.5);
    await user.keyboard("-");
    expect(zoomOf()).toBe(1);
    await user.keyboard("++0");
    expect(zoomOf()).toBe(1);
    // close: Escape, and focus is back on the opener
    await user.keyboard("{Escape}");
    await flush();
    expect(viewer()).toBeNull();
    expect(document.activeElement).toBe(document.getElementById("opener"));
  });
  test("the buttons are named in the host's language too", async () => {
    await openViewer({ items: ITEMS, options: { words: { close: "Lukk", previous: "Forrige", next: "Neste", zoomIn: "Zoom inn", zoomOut: "Zoom ut", zoomReset: "Tilpass bildet til skjermen", fit: "Tilpass" } } });
    const names = [...viewer()!.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Lukk", "Forrige", "Neste", "Zoom ut", "Tilpass bildet til skjermen", "Zoom inn"]);
  });
});
