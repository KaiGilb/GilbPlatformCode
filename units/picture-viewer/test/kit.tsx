import { act, render } from "@testing-library/react";
import axe from "axe-core";
import type { ReactElement } from "react";
import { usePictureViewer, type LightboxItem, type UsePictureViewerOptions } from "../src/index";

export const ITEMS: LightboxItem[] = [
  { src: "https://example.test/ann-1.jpg", alt: "Ann at the lake", caption: "Ann at the lake" },
  { src: "https://example.test/ben-big.jpg", alt: "Ben on the hill", caption: "Ben, on the hill in July", fallback: "https://example.test/ben.jpg" },
  { src: "https://example.test/ann-3.jpg", alt: "Ann and Ben", caption: "Ann and Ben" },
];

/** A page with a button that opens the viewer through `usePictureViewer`. */
export function Harness({ items = ITEMS, index = 0, options }: { items?: LightboxItem[]; index?: number; options?: UsePictureViewerOptions }): ReactElement {
  const { open, viewer } = usePictureViewer(options);
  return (
    <div id="page">
      <button type="button" id="opener" onClick={() => open(items, index)}>Open pictures</button>
      <p>Page text</p>
      {viewer}
    </div>
  );
}

export const viewer = (): HTMLElement | null => document.querySelector<HTMLElement>("[data-lightbox-viewer]");
export const q = <T extends Element = HTMLElement>(sel: string): T => viewer()!.querySelector<T>(sel)!;
export const key = (k: string, init: KeyboardEventInit = {}): void => {
  act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init })); });
};
export const flush = async (): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
export const axeIds = async (): Promise<string[]> =>
  (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v) => v.id);

/** Render the harness and open the viewer by clicking its button. */
export async function openViewer(props: Parameters<typeof Harness>[0] = {}): Promise<{ unmount: () => void }> {
  const r = render(<Harness {...props} />);
  const b = document.getElementById("opener") as HTMLButtonElement;
  b.focus();
  await act(async () => { b.click(); });
  await flush();
  return { unmount: r.unmount };
}

/** The picture the viewer shows (the real one, not a thumbnail). */
export const shown = (): HTMLImageElement => viewer()!.querySelector<HTMLImageElement>("img.ilb-img:not(.ilb-img-thumb)")!;
export const fire = (el: Element, type: "load" | "error"): void => { act(() => { el.dispatchEvent(new Event(type)); }); };

// ---- synthetic pointers --------------------------------------------------------------------------------------------
export function pointer(type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel", target: Element, id: number, x: number, y: number, t: number): void {
  const ev = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, clientX: x, clientY: y });
  Object.defineProperty(ev, "timeStamp", { value: t });
  act(() => { target.dispatchEvent(ev); });
}
export const stage = (): HTMLElement => q(".ilb-stage");
export const wheel = (x: number, y: number, deltaY: number, ctrlKey: boolean): WheelEvent => {
  const ev = new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: x, clientY: y, deltaY, ctrlKey });
  act(() => { stage().dispatchEvent(ev); });
  return ev;
};
export const zoomOf = (): number => Number(shown().getAttribute("data-zoom"));
export const panOf = (): { x: number; y: number } => {
  const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(shown().style.transform)!;
  return { x: Number(m[1]), y: Number(m[2]) };
};
/** Give every element a layout size, so a zoomed picture has room to be dragged in. */
export function giveLayout(): void {
  for (const [p, v] of [["offsetWidth", 400], ["offsetHeight", 300], ["clientWidth", 400], ["clientHeight", 300]] as const) {
    // a picture waiting unseen beside its thumbnail (class ilb-img-pending) has no size
    Object.defineProperty(HTMLElement.prototype, p, { configurable: true, get(this: HTMLElement) { return this.classList.contains("ilb-img-pending") ? 0 : v; } });
  }
}
export function removeLayout(): void {
  for (const p of ["offsetWidth", "offsetHeight", "clientWidth", "clientHeight"]) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[p];
}
