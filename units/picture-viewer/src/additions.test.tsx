// The five named additions to the Vue source (A1 full screen, A2 neighbours load first, A3 shown at once,
// A4 signed sources, A5 tap shows and hides the controls) and the usePictureViewer helper.
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { LightboxItem } from "./types";
import { Harness, ITEMS, axeIds, fire, flush, giveLayout, key, openViewer, panOf, pointer, q, removeLayout, shown, stage, viewer } from "../test/kit";

const five: LightboxItem[] = [1, 2, 3, 4, 5].map((n) => ({ src: `https://example.test/p${n}.jpg`, alt: `Picture ${n}`, caption: `Picture ${n}` }));
const tools = () => [...viewer()!.querySelectorAll<HTMLButtonElement>(".ilb-tools button")];

// ---- A1 ---------------------------------------------------------------------------------------------------------------
describe("A1: full screen", () => {
  let fsElement: Element | null = null;
  function stubFullscreen(enabled: boolean) {
    fsElement = null;
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: enabled });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fsElement });
    const request = vi.fn(function (this: Element) { fsElement = this; document.dispatchEvent(new Event("fullscreenchange")); return Promise.resolve(); });
    const exit = vi.fn(() => { fsElement = null; document.dispatchEvent(new Event("fullscreenchange")); return Promise.resolve(); });
    (HTMLElement.prototype as unknown as { requestFullscreen: unknown }).requestFullscreen = request;
    (document as unknown as { exitFullscreen: unknown }).exitFullscreen = exit;
    return { request, exit };
  }
  afterEach(() => {
    for (const k of ["fullscreenEnabled", "fullscreenElement", "exitFullscreen"]) delete (document as unknown as Record<string, unknown>)[k];
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).requestFullscreen;
  });
  test("the button is drawn only when the browser can do full screen", async () => {
    stubFullscreen(false);
    await openViewer({});
    expect(viewer()!.querySelector(".ilb-fullscreen")).toBeNull();
    expect(tools().length).toBe(3);
  });
  test("when it can, the button is named, after the zoom buttons, and asks the dialog to go full screen", async () => {
    const { request, exit } = stubFullscreen(true);
    await openViewer({});
    const b = q<HTMLButtonElement>(".ilb-fullscreen");
    expect(b.getAttribute("aria-label")).toBe("Full screen");
    expect(tools().indexOf(b)).toBe(3);
    expect(tools()[1]).toBe(q(".ilb-fit"));
    await act(async () => { b.click(); });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.contexts[0]).toBe(viewer());
    expect(b.getAttribute("aria-label")).toBe("Leave full screen");
    await act(async () => { b.click(); });
    expect(exit).toHaveBeenCalledTimes(1);
    expect(b.getAttribute("aria-label")).toBe("Full screen");
  });
  test("the words are the host's", async () => {
    stubFullscreen(true);
    await openViewer({ options: { words: { fullScreen: "Fullskjerm", exitFullScreen: "Avslutt fullskjerm" } } });
    expect(q(".ilb-fullscreen").getAttribute("aria-label")).toBe("Fullskjerm");
    key("f");
    expect(q(".ilb-fullscreen").getAttribute("aria-label")).toBe("Avslutt fullskjerm");
  });
  test("the key f toggles it, and does nothing (and is not taken) where full screen is not available", async () => {
    const { request, exit } = stubFullscreen(true);
    await openViewer({});
    key("f");
    expect(request).toHaveBeenCalledTimes(1);
    key("F");
    expect(exit).toHaveBeenCalledTimes(1);
    key("f", { ctrlKey: true });
    expect(request).toHaveBeenCalledTimes(1);
  });
  test("f does nothing where full screen is not available", async () => {
    const { request } = stubFullscreen(false);
    await openViewer({});
    const ev = new KeyboardEvent("keydown", { key: "f", bubbles: true, cancelable: true });
    act(() => { document.dispatchEvent(ev); });
    expect(request).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });
  test("closing the viewer while it is full screen leaves full screen", async () => {
    const { exit } = stubFullscreen(true);
    await openViewer({});
    key("f");
    expect(fsElement).toBe(viewer());
    key("Escape");
    await flush();
    expect(exit).toHaveBeenCalledTimes(1);
    expect(fsElement).toBeNull();
  });
  test("closing the viewer when it is not full screen does not call exit", async () => {
    const { exit } = stubFullscreen(true);
    await openViewer({});
    key("Escape");
    await flush();
    expect(exit).not.toHaveBeenCalled();
  });
  test("axe: no violations with the full screen button drawn", async () => {
    stubFullscreen(true);
    await openViewer({});
    expect(await axeIds()).toEqual([]);
  });
});

// ---- A2 ---------------------------------------------------------------------------------------------------------------
describe("A2: the neighbours load first", () => {
  function spyImage() {
    const srcs: string[] = [];
    vi.stubGlobal("Image", class { set src(v: string) { srcs.push(v); } });
    return srcs;
  }
  afterEach(() => { vi.unstubAllGlobals(); });
  test("nothing is preloaded until the current picture is ready", async () => {
    const srcs = spyImage();
    await openViewer({ items: five, index: 2 });
    expect(srcs).toEqual([]);
    fire(shown(), "load");
    expect(srcs.sort()).toEqual(["https://example.test/p2.jpg", "https://example.test/p4.jpg"]);
  });
  test("exactly the two neighbours are asked for, never more; the ends have one", async () => {
    const srcs = spyImage();
    await openViewer({ items: five, index: 0 });
    fire(shown(), "load");
    expect(srcs).toEqual(["https://example.test/p2.jpg"]);
  });
  test("moving on asks for the new neighbours only, each picture once", async () => {
    const srcs = spyImage();
    await openViewer({ items: five, index: 2 });
    fire(shown(), "load");
    expect(srcs.length).toBe(2);
    key("ArrowRight");
    fire(shown(), "load");
    expect(srcs.slice(2).sort()).toEqual(["https://example.test/p3.jpg", "https://example.test/p5.jpg"]);
    expect(srcs.every((s) => !s.endsWith("p1.jpg"))).toBe(true);
    expect(new Set(srcs).size).toBe(srcs.length);
  });
  test("a failed picture does not start the neighbours", async () => {
    const srcs = spyImage();
    await openViewer({ items: five, index: 2 });
    fire(shown(), "error");
    expect(srcs).toEqual([]);
  });
  test("with resolveSrc the answer is what is preloaded, for the two neighbours only", async () => {
    const srcs = spyImage();
    const resolveSrc = vi.fn(async (it: LightboxItem) => `${it.src}?sig=1`);
    await openViewer({ items: five, index: 2, options: { resolveSrc } });
    expect(resolveSrc.mock.calls.map((c) => c[0].alt)).toEqual(["Picture 3"]);
    fire(shown(), "load");
    await flush();
    expect(resolveSrc.mock.calls.map((c) => c[0].alt)).toEqual(["Picture 3", "Picture 2", "Picture 4"]);
    expect(srcs.sort()).toEqual(["https://example.test/p2.jpg?sig=1", "https://example.test/p4.jpg?sig=1"]);
  });
});

// ---- A3 ---------------------------------------------------------------------------------------------------------------
describe("A3: shown at once", () => {
  const withThumb: LightboxItem[] = [{ src: "https://example.test/ann-full.jpg", thumbSrc: "https://example.test/ann-thumb.jpg", alt: "Ann at the lake", caption: "Ann at the lake" }];
  const thumb = () => viewer()!.querySelector<HTMLImageElement>("img.ilb-img-thumb");
  test("the small version is drawn at once, in the picture's box, and there is no loading cue", async () => {
    await openViewer({ items: withThumb });
    expect(thumb()!.getAttribute("src")).toBe("https://example.test/ann-thumb.jpg");
    expect(thumb()!.className).toContain("ilb-img ilb-img-thumb");
    expect(viewer()!.querySelector(".ilb-loading")).toBeNull();
    expect(shown().getAttribute("src")).toBe("https://example.test/ann-full.jpg");
    expect(viewer()!.querySelector("figure")!.getAttribute("aria-busy")).toBe("true");
  });
  test("it is read once: the unseen file is hidden from a screen reader while the small version stands in", async () => {
    await openViewer({ items: withThumb });
    expect(shown().getAttribute("aria-hidden")).toBe("true");
    expect(shown().className).toContain("ilb-img-pending");
    expect(await axeIds()).toEqual([]);
    fire(shown(), "load");
    expect(shown().hasAttribute("aria-hidden")).toBe(false);
    expect(shown().className).not.toContain("ilb-img-pending");
  });
  test("when the full file loads it replaces the small version", async () => {
    await openViewer({ items: withThumb });
    fire(shown(), "load");
    expect(thumb()).toBeNull();
    expect(viewer()!.querySelectorAll("img").length).toBe(1);
    expect(viewer()!.querySelector("figure")!.hasAttribute("aria-busy")).toBe(false);
  });
  test("when the full file fails, the small version stays behind the failed message", async () => {
    await openViewer({ items: withThumb });
    fire(shown(), "error");
    expect(thumb()).not.toBeNull();
    expect(viewer()!.querySelector(".ilb-failed-note")!.textContent!.trim()).toBe("The picture could not be loaded");
    expect(viewer()!.querySelector(".ilb-loading")).toBeNull();
    expect(await axeIds()).toEqual([]);
  });
  test("the fallback rule is kept: the fallback is tried, then the failed message; the small version stays throughout", async () => {
    await openViewer({ items: [{ ...withThumb[0]!, fallback: "https://example.test/ann-page.jpg" }] });
    fire(shown(), "error");
    expect(shown().getAttribute("src")).toBe("https://example.test/ann-page.jpg");
    expect(thumb()).not.toBeNull();
    expect(viewer()!.querySelector(".ilb-failed-note")).toBeNull();
    fire(shown(), "error");
    expect(thumb()).not.toBeNull();
    expect(viewer()!.querySelector(".ilb-failed-note")).not.toBeNull();
  });
  test("a picture without a small version shows the loading cue and no thumb", async () => {
    await openViewer({ items: [{ src: "https://example.test/ann-full.jpg", alt: "Ann", caption: "Ann" }] });
    expect(thumb()).toBeNull();
    expect(viewer()!.querySelector(".ilb-loading")).not.toBeNull();
  });
  test("a zoomed small version is dragged inside its own size, not the size of the unseen file", async () => {
    giveLayout();
    try {
      await openViewer({ items: withThumb });
      key("+"); key("+"); key("+");
      const t = thumb()!;
      pointer("pointerdown", t, 1, 200, 150, 1000);
      pointer("pointermove", t, 1, 250, 150, 1050);
      pointer("pointerup", t, 1, 250, 150, 1100);
      expect(Number(/translate3d\((-?[\d.]+)px/.exec(t.style.transform)![1])).toBe(50);
    } finally {
      removeLayout();
    }
  });
  test("the small version zooms with the keys like the picture", async () => {
    await openViewer({ items: withThumb });
    key("+");
    expect(thumb()!.getAttribute("data-zoom")).toBe("1.50");
    fire(shown(), "load");
    expect(shown().getAttribute("data-zoom")).toBe("1.50");
  });
});

// ---- A4 ---------------------------------------------------------------------------------------------------------------
describe("A4: signed sources", () => {
  const signed: LightboxItem[] = [{ src: "https://example.test/x.jpg", fileUri: "https://example.test/vault/ann/x", alt: "Ann", caption: "Ann", fallback: "https://example.test/x-page.jpg" }];
  test("without resolveSrc the item's src is the file", async () => {
    await openViewer({ items: signed });
    expect(shown().getAttribute("src")).toBe("https://example.test/x.jpg");
  });
  test("with resolveSrc, the answer is the file; until it comes there is a cue and no picture", async () => {
    let done!: (u: string) => void;
    const resolveSrc = vi.fn((_it: LightboxItem) => new Promise<string>((r) => { done = r; }));
    await openViewer({ items: signed, options: { resolveSrc } });
    expect(resolveSrc).toHaveBeenCalledTimes(1);
    expect(resolveSrc.mock.calls[0]![0]).toBe(signed[0]);
    expect(viewer()!.querySelector("img")).toBeNull();
    expect(viewer()!.querySelector(".ilb-loading")).not.toBeNull();
    await act(async () => { done("https://example.test/signed/x.jpg?sig=ann"); });
    expect(shown().getAttribute("src")).toBe("https://example.test/signed/x.jpg?sig=ann");
    fire(shown(), "load");
    expect(viewer()!.querySelector(".ilb-loading")).toBeNull();
  });
  test("a rejection counts as a failed load: the fallback is tried", async () => {
    await openViewer({ items: signed, options: { resolveSrc: () => Promise.reject(new Error("no access")) } });
    expect(shown().getAttribute("src")).toBe("https://example.test/x-page.jpg");
  });
  test("a rejection with no fallback is the failed message, and the keys still work", async () => {
    await openViewer({ items: [{ ...signed[0]!, fallback: undefined }, ITEMS[1]!], options: { resolveSrc: () => Promise.reject(new Error("no access")) } });
    expect(viewer()!.querySelector(".ilb-failed-note")!.textContent!.trim()).toBe("The picture could not be loaded");
    key("Escape");
    await flush();
    expect(viewer()).toBeNull();
  });
  test("an answer for a picture the person has already left is ignored", async () => {
    const waiting: Record<string, (u: string) => void> = {};
    const resolveSrc = (it: LightboxItem) => new Promise<string>((r) => { waiting[it.alt] = r; });
    await openViewer({ items: ITEMS, options: { resolveSrc } });
    key("ArrowRight");
    await flush();
    await act(async () => { waiting["Ben on the hill"]!("https://example.test/signed/ben.jpg"); });
    await act(async () => { waiting["Ann at the lake"]!("https://example.test/signed/ann.jpg"); });
    expect(shown().getAttribute("src")).toBe("https://example.test/signed/ben.jpg");
  });
  test("a rejection for a picture the person has already left does not fail the one now shown", async () => {
    const waiting: Record<string, [(u: string) => void, (e: Error) => void]> = {};
    const resolveSrc = (it: LightboxItem) => new Promise<string>((r, j) => { waiting[it.alt] = [r, j]; });
    await openViewer({ items: ITEMS, options: { resolveSrc } });
    key("ArrowRight");
    await flush();
    await act(async () => { waiting["Ben on the hill"]![0]("https://example.test/signed/ben.jpg"); });
    await act(async () => { waiting["Ann at the lake"]![1](new Error("late")); });
    expect(shown().getAttribute("src")).toBe("https://example.test/signed/ben.jpg");
    expect(viewer()!.querySelector(".ilb-failed-note")).toBeNull();
  });
});

// ---- A5 ---------------------------------------------------------------------------------------------------------------
describe("A5: a tap shows and hides the controls", () => {
  const hidden = () => viewer()!.classList.contains("ilb-chrome-hidden");
  const tapAt = (target: Element, t: number, x = 200) => { pointer("pointerdown", target, 1, x, 150, t); pointer("pointerup", target, 1, x, 150, t + 50); };
  async function open() {
    await openViewer({});
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  }
  const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
  test("a single tap on the picture hides the controls once the double-tap window has passed, a second tap shows them", async () => {
    await open();
    tapAt(shown(), 1000);
    expect(hidden()).toBe(false);
    advance(349);
    expect(hidden()).toBe(false);
    advance(1);
    expect(hidden()).toBe(true);
    tapAt(shown(), 3000);
    advance(350);
    expect(hidden()).toBe(false);
  });
  test("a double tap zooms and hides nothing", async () => {
    await open();
    tapAt(shown(), 1000);
    tapAt(shown(), 1200);
    advance(1000);
    expect(hidden()).toBe(false);
    expect(shown().getAttribute("data-zoom")).toBe("2.50");
  });
  test("a swipe or a drag hides nothing", async () => {
    await open();
    pointer("pointerdown", shown(), 1, 200, 150, 1000);
    pointer("pointermove", shown(), 1, 215, 150, 1010);
    pointer("pointerup", shown(), 1, 215, 150, 1050);
    advance(1000);
    expect(hidden()).toBe(false);
  });
  test("the controls are back in the same instant the key arrives, before the key is read (a hidden button cannot take focus)", async () => {
    await open();
    tapAt(shown(), 1000);
    advance(350);
    expect(hidden()).toBe(true);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true, cancelable: true }));
      expect(hidden()).toBe(false);
    } finally {
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    }
  });
  test("any key shows them again, and Tab then lands on a button of the dialog", async () => {
    await open();
    tapAt(shown(), 1000);
    advance(350);
    expect(hidden()).toBe(true);
    (document.activeElement as HTMLElement)?.blur();
    key("Tab");
    expect(hidden()).toBe(false);
    expect(viewer()!.contains(document.activeElement)).toBe(true);
    expect(document.activeElement!.tagName).toBe("BUTTON");
    tapAt(shown(), 3000);
    advance(350);
    expect(hidden()).toBe(true);
    key("x");
    expect(hidden()).toBe(false);
  });
  test("a tap on the dark edge closes at once, as before", async () => {
    await open();
    tapAt(stage(), 1000, 3);
    expect(viewer()).toBeNull();
  });
  test("closing while the double-tap window is open is quiet", async () => {
    await open();
    tapAt(shown(), 1000);
    key("Escape");
    expect(viewer()).toBeNull();
    advance(1000);
    expect(viewer()).toBeNull();
  });
  test("the buttons, counter and caption are hidden by class, not removed: they stay in the page", async () => {
    await open();
    tapAt(shown(), 1000);
    advance(350);
    expect(viewer()!.querySelectorAll("button").length).toBeGreaterThan(3);
    expect(viewer()!.querySelector(".ilb-count")).not.toBeNull();
  });
});

// ---- usePictureViewer ---------------------------------------------------------------------------------------------------
describe("usePictureViewer", () => {
  test("viewer is null until open is called, and open starts at the given index", async () => {
    render(<Harness index={2} />);
    expect(viewer()).toBeNull();
    await act(async () => { document.getElementById("opener")!.click(); });
    expect(q(".ilb-count").textContent!.trim()).toBe("3 of 3");
  });
  test("an empty list does not open; an index out of range opens the first", async () => {
    render(<Harness items={[]} />);
    await act(async () => { document.getElementById("opener")!.click(); });
    expect(viewer()).toBeNull();
  });
  test("an index out of range opens the first picture", async () => {
    render(<Harness index={9} />);
    await act(async () => { document.getElementById("opener")!.click(); });
    expect(q(".ilb-count").textContent!.trim()).toBe("1 of 3");
  });
  test("closing gives focus back to the element that had it when open was called, also when an item names another", async () => {
    const other = document.createElement("button");
    document.body.appendChild(other);
    const items = ITEMS.map((i) => ({ ...i, el: other }));
    await openViewer({ items });
    expect(document.activeElement).toBe(q(".ilb-close"));
    await act(async () => { q(".ilb-close").click(); });
    await flush();
    expect(viewer()).toBeNull();
    expect(document.activeElement).toBe(document.getElementById("opener"));
  });
  test("it can be opened again after it was closed, from the index given then, not the one left at", async () => {
    await openViewer({ index: 1 });
    key("ArrowRight");
    expect(q(".ilb-count").textContent!.trim()).toBe("3 of 3");
    key("Escape");
    await flush();
    document.getElementById("opener")!.focus();
    await act(async () => { document.getElementById("opener")!.click(); });
    expect(q(".ilb-count").textContent!.trim()).toBe("2 of 3");
  });
  test("the options reach the viewer: words, caption, maximum zoom", async () => {
    await openViewer({ options: { words: { dialog: "Bilder" }, showCaption: false, maxZoom: 2 } });
    expect(viewer()!.getAttribute("aria-label")).toBe("Bilder");
    expect(viewer()!.querySelector(".ilb-caption")).toBeNull();
    for (let i = 0; i < 5; i++) key("+");
    expect(q("img").getAttribute("data-zoom")).toBe("2.00");
    expect(q<HTMLButtonElement>(".ilb-tools button:nth-child(3)").disabled).toBe(true);
  });
});
