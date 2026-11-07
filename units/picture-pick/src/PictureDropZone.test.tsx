import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { useRef } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PictureDropZone, PicturePickButtons, usePictureDrop } from "./index";

afterEach(cleanup);

const img = (name: string) => new File(["x"], name, { type: "image/png" });
const txt = () => new File(["x"], "notes.txt", { type: "text/plain" });
const axeIds = async (): Promise<string[]> =>
  (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v) => v.id);

/** A drag event carrying files, with `Files` in `types` as a browser has it. */
function drag(type: string, files: File[]) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, "dataTransfer", { value: { types: files.length ? ["Files"] : ["text/plain"], files } });
  return e;
}
function paste(files: File[]) {
  const e = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(e, "clipboardData", { value: { files } });
  return e;
}
function setup(props: { paste?: boolean } = {}) {
  const onPick = vi.fn();
  const r = render(
    <PictureDropZone onPick={onPick} className="zone" {...props}>
      <p data-testid="child">Pictures</p>
      <input data-testid="field" />
    </PictureDropZone>,
  );
  return { onPick, zone: document.querySelector(".zone") as HTMLElement, child: screen.getByTestId("child"), r };
}
const fire = (el: Element | Document, e: Event) => act(() => { el.dispatchEvent(e); });

describe("drop", () => {
  test("dragenter adds the class and prevents default", () => {
    const { zone } = setup();
    const e = drag("dragenter", [img("a.png")]);
    fire(zone, e);
    expect(zone.classList.contains("picture-drop-active")).toBe(true);
    expect(e.defaultPrevented).toBe(true);
  });

  test("dragover with files prevents default; without files it does not", () => {
    const { zone } = setup();
    const withFiles = drag("dragover", [img("a.png")]);
    fire(zone, withFiles);
    expect(withFiles.defaultPrevented).toBe(true);
    expect(zone.classList.contains("picture-drop-active")).toBe(true);
    cleanup();
    const again = setup();
    const text = drag("dragenter", []);
    fire(again.zone, text);
    expect(text.defaultPrevented).toBe(false);
    expect(again.zone.classList.contains("picture-drop-active")).toBe(false);
  });

  test("dragleave from a child does not remove the class; from the zone does", () => {
    const { zone, child } = setup();
    fire(zone, drag("dragenter", [img("a.png")]));
    fire(child, drag("dragenter", [img("a.png")]));
    fire(child, drag("dragleave", [img("a.png")]));
    expect(zone.classList.contains("picture-drop-active")).toBe(true);
    fire(zone, drag("dragleave", [img("a.png")]));
    expect(zone.classList.contains("picture-drop-active")).toBe(false);
  });

  test("drop calls onPick with the pictures only, and removes the class", () => {
    const { zone, onPick } = setup();
    const a = img("a.png");
    const b = img("b.png");
    fire(zone, drag("dragenter", [a]));
    const e = drag("drop", [a, txt(), b]);
    fire(zone, e);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]![0]).toEqual([a, b]);
    expect(zone.classList.contains("picture-drop-active")).toBe(false);
    expect(e.defaultPrevented).toBe(true);
  });

  test("a drop with no pictures does not call onPick, and removes the class", () => {
    const { zone, onPick } = setup();
    fire(zone, drag("dragenter", [txt()]));
    fire(zone, drag("drop", [txt()]));
    expect(onPick).not.toHaveBeenCalled();
    expect(zone.classList.contains("picture-drop-active")).toBe(false);
  });

  test("a drop after a child-enter and no leave still clears the class (depth reset)", () => {
    const { zone, child } = setup();
    fire(zone, drag("dragenter", [img("a.png")]));
    fire(child, drag("dragenter", [img("a.png")]));
    fire(child, drag("drop", [img("a.png")]));
    expect(zone.classList.contains("picture-drop-active")).toBe(false);
    fire(zone, drag("dragenter", [img("a.png")]));
    fire(zone, drag("dragleave", [img("a.png")]));
    expect(zone.classList.contains("picture-drop-active")).toBe(false);
  });

  test("the latest onPick is called after a re-render", () => {
    const first = vi.fn();
    const second = vi.fn();
    const r = render(<PictureDropZone onPick={first} className="zone" />);
    r.rerender(<PictureDropZone onPick={second} className="zone" />);
    fire(document.querySelector(".zone")!, drag("drop", [img("a.png")]));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("paste", () => {
  test("pictures pasted with focus on the body reach onPick and default is prevented", () => {
    const { onPick } = setup();
    const a = img("a.png");
    const e = paste([a]);
    fire(document, e);
    expect(onPick).toHaveBeenCalledWith([a]);
    expect(e.defaultPrevented).toBe(true);
  });

  test("with focus in an input: not called, not prevented", () => {
    const { onPick } = setup();
    (screen.getByTestId("field") as HTMLInputElement).focus();
    const e = paste([img("a.png")]);
    fire(document, e);
    expect(onPick).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  test("with focus in a textarea or a contenteditable: not called", () => {
    const { onPick } = setup();
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    ta.focus();
    fire(document, paste([img("a.png")]));
    ta.remove();
    const ce = document.createElement("div");
    ce.setAttribute("contenteditable", "true");
    ce.tabIndex = 0;
    document.body.appendChild(ce);
    ce.focus();
    fire(document, paste([img("a.png")]));
    ce.remove();
    expect(onPick).not.toHaveBeenCalled();
  });

  test("a text-only paste is not called and not prevented", () => {
    const { onPick } = setup();
    const e = paste([]);
    fire(document, e);
    expect(onPick).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  test("a paste of a non-picture file is left alone", () => {
    const { onPick } = setup();
    const e = paste([txt()]);
    fire(document, e);
    expect(onPick).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  test("paste: false means no paste listener", () => {
    const { onPick } = setup({ paste: false });
    const e = paste([img("a.png")]);
    fire(document, e);
    expect(onPick).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  test("unmount removes the listener", () => {
    const { onPick, r } = setup();
    r.unmount();
    const e = paste([img("a.png")]);
    fire(document, e);
    expect(onPick).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  test("toggling paste off removes the document listener", () => {
    const onPick = vi.fn();
    const r = render(<PictureDropZone onPick={onPick} />);
    r.rerender(<PictureDropZone onPick={onPick} paste={false} />);
    fire(document, paste([img("a.png")]));
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe("usePictureDrop on a target of the host's own", () => {
  function Host({ onPick }: { onPick: (f: File[]) => void }) {
    const ref = useRef<HTMLDivElement>(null);
    usePictureDrop(ref, onPick);
    return <div ref={ref} id="host">x</div>;
  }
  test("works on any element, and removes its listeners on unmount", () => {
    const onPick = vi.fn();
    const r = render(<Host onPick={onPick} />);
    const el = document.getElementById("host")!;
    fire(el, drag("drop", [img("a.png")]));
    expect(onPick).toHaveBeenCalledTimes(1);
    r.unmount();
    fire(el, drag("drop", [img("b.png")]));
    fire(document, paste([img("c.png")]));
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});

describe("usePictureDrop options", () => {
  function Host({ onPick, options }: { onPick: (f: File[]) => void; options?: { paste?: boolean } }) {
    const ref = useRef<HTMLDivElement>(null);
    usePictureDrop(ref, onPick, options);
    return <div ref={ref}>x</div>;
  }
  test("paste is on when the options are left out", () => {
    const onPick = vi.fn();
    render(<Host onPick={onPick} />);
    fire(document, paste([img("a.png")]));
    expect(onPick).toHaveBeenCalledTimes(1);
  });
  test("paste is on with an empty options object, off with paste: false", () => {
    const onPick = vi.fn();
    const r = render(<Host onPick={onPick} options={{}} />);
    fire(document, paste([img("a.png")]));
    expect(onPick).toHaveBeenCalledTimes(1);
    r.rerender(<Host onPick={onPick} options={{ paste: false }} />);
    fire(document, paste([img("b.png")]));
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});

describe("the live label", () => {
  test("is empty until pictures are dragged over, shows then, and clears after", () => {
    const { zone } = setup();
    const status = () => zone.querySelector('[aria-live="polite"]')!;
    expect(status().textContent).toBe("");
    fire(zone, drag("dragenter", [img("a.png")]));
    expect(status().textContent).toBe("Drop pictures here");
    fire(zone, drag("dragleave", [img("a.png")]));
    expect(status().textContent).toBe("");
  });
  test("the label is the host's words", () => {
    const r = render(<PictureDropZone onPick={() => {}} className="zone" label="Lass die Bilder hier fallen" />);
    const zone = r.container.querySelector(".zone")!;
    fire(zone, drag("dragenter", [img("a.png")]));
    expect(zone.querySelector('[aria-live="polite"]')!.textContent).toBe("Lass die Bilder hier fallen");
  });
});

describe("axe", () => {
  test("no violations on the buttons in the zone, idle and while dragging", async () => {
    const r = render(
      <PictureDropZone onPick={() => {}} className="zone">
        <PicturePickButtons onPick={() => {}} multiple />
      </PictureDropZone>,
    );
    expect(await axeIds()).toEqual([]);
    fire(r.container.querySelector(".zone")!, drag("dragenter", [img("a.png")]));
    expect(await axeIds()).toEqual([]);
  });
});
