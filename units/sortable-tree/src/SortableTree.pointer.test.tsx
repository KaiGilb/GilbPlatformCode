// A mouse drag, driven in jsdom. jsdom has no layout and no PointerEvent, so this file gives both:
//  - a small PointerEvent class (a MouseEvent with pointerType, isPrimary and pointerId), installed for this file only;
//  - a fixed layout: rows are 300 px wide and 40 px tall, one under the other (row i spans y = 40*i to 40*i + 40).
// A drop is read where the pointer is: the row whose middle is below the pointer is the row under the line.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SortableTree, TreeItem, type DropTarget, type TreeRow } from "./index";

class TestPointerEvent extends MouseEvent {
  pointerType: string;
  isPrimary: boolean;
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? "mouse";
    this.isPrimary = init.isPrimary ?? true;
    this.pointerId = init.pointerId ?? 1;
  }
}

let saved: unknown;
beforeAll(() => {
  saved = (window as unknown as { PointerEvent?: unknown }).PointerEvent;
  (window as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent;
});
afterAll(() => {
  (window as unknown as { PointerEvent: unknown }).PointerEvent = saved;
});

const ROWS: TreeRow[] = [
  { id: "a", parentId: null, depth: 0, label: "Alpha" },
  { id: "b", parentId: null, depth: 0, label: "Beta" },
  { id: "c", parentId: null, depth: 0, label: "Gamma" },
];
const INDEX: Record<string, number> = { a: 0, b: 1, c: 2 };

let rect: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const id = this.getAttribute("data-tree-row");
    const i = id ? (INDEX[id] ?? 0) : 0;
    return { x: 0, y: i * 40, top: i * 40, bottom: i * 40 + 40, left: 0, right: 300, width: 300, height: 40, toJSON() {} } as DOMRect;
  });
});
afterEach(() => {
  rect.mockRestore();
  cleanup();
  document.body.innerHTML = "";
});

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

function tree(onDrop: (d: DropTarget) => void, indent?: number) {
  return render(
    <SortableTree rows={ROWS} onDrop={onDrop} indent={indent}>
      {ROWS.map((r) => (
        <TreeItem key={r.id} id={r.id} label={r.label} depth={0} handle>
          {r.label}
        </TreeItem>
      ))}
    </SortableTree>,
  );
}
const down = (el: Element, x: number, y: number) => fireEvent.pointerDown(el, { button: 0, isPrimary: true, pointerType: "mouse", clientX: x, clientY: y, pointerId: 1 });
const move = async (x: number, y: number) => {
  fireEvent.pointerMove(document, { pointerType: "mouse", isPrimary: true, clientX: x, clientY: y, pointerId: 1 });
  await flush();
};
const up = async (x: number, y: number) => {
  fireEvent.pointerUp(document, { pointerType: "mouse", isPrimary: true, clientX: x, clientY: y, pointerId: 1 });
  await flush();
};

describe("a mouse drag", () => {
  it("starts after the pointer has moved 5 px on the grip, not before", async () => {
    tree(() => {});
    down(screen.getByLabelText("Drag Alpha"), 10, 10);
    await flush();
    await move(10, 13);
    expect(document.querySelector("[data-dragging]")).toBeNull();
    await move(10, 16);
    expect(document.querySelector("[data-dragging]")?.getAttribute("data-tree-row")).toBe("a");
  });

  it("carries a label of the row under the pointer, draws the line where it would land, and reports the drop once", async () => {
    const onDrop = vi.fn();
    tree(onDrop);
    down(screen.getByLabelText("Drag Alpha"), 10, 10);
    await flush();
    await move(10, 30);
    await move(10, 95);
    const line = document.querySelector("[data-drop-line]") as HTMLElement;
    expect(line.getAttribute("data-drop-line")).toBe("ok");
    expect(line.getAttribute("data-drop-depth")).toBe("0");
    expect(line.closest("[data-tree-row]")?.getAttribute("data-tree-row")).toBe("b");
    expect(document.body.textContent).toContain("Alpha");
    await up(10, 95);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop.mock.calls[0]?.[0]).toEqual({
      ok: true,
      activeId: "a",
      parentId: null,
      index: 1,
      gap: 2,
      depth: 0,
      unchanged: false,
      parentLabel: null,
      afterLabel: "Beta",
    });
    expect(document.querySelector("[data-dragging]")).toBeNull();
    expect(document.querySelector("[data-drop-line]")).toBeNull();
  });

  it("the pointer above the middle of the first row is the top of the list", async () => {
    const onDrop = vi.fn();
    tree(onDrop);
    down(screen.getByLabelText("Drag Gamma"), 10, 90);
    await flush();
    await move(10, 60);
    await move(10, 5);
    await up(10, 5);
    expect(onDrop.mock.calls[0]?.[0]).toMatchObject({ activeId: "c", parentId: null, index: 0, gap: 0, afterLabel: null });
  });

  it("each indent to the right (24 px) is one level deeper, so the row goes under the row above the line", async () => {
    const onDrop = vi.fn();
    tree(onDrop);
    down(screen.getByLabelText("Drag Alpha"), 10, 10);
    await flush();
    await move(10, 30);
    await move(40, 95);
    await up(40, 95);
    expect(onDrop.mock.calls[0]?.[0]).toMatchObject({ activeId: "a", parentId: "b", index: 0, depth: 1, parentLabel: "Beta", afterLabel: null });
  });

  it("the indent step can be set: a move of 30 px is no level with an indent of 50", async () => {
    const onDrop = vi.fn();
    tree(onDrop, 50);
    down(screen.getByLabelText("Drag Alpha"), 10, 10);
    await flush();
    await move(10, 30);
    await move(40, 95);
    await up(40, 95);
    expect(onDrop.mock.calls[0]?.[0]).toMatchObject({ parentId: null, depth: 0 });
  });

  it("a drop back where the row started reports nothing", async () => {
    const onDrop = vi.fn();
    tree(onDrop);
    down(screen.getByLabelText("Drag Beta"), 10, 50);
    await flush();
    await move(10, 70);
    await move(10, 55);
    await up(10, 55);
    expect(onDrop).not.toHaveBeenCalled();
    expect(document.querySelector("[data-tree-status]")?.textContent).toBe("");
  });

  it("Escape during the drag cancels it and reports nothing", async () => {
    const onDrop = vi.fn();
    tree(onDrop);
    down(screen.getByLabelText("Drag Alpha"), 10, 10);
    await flush();
    await move(10, 30);
    await move(10, 95);
    fireEvent.keyDown(document, { code: "Escape", key: "Escape" });
    await flush();
    await up(10, 95);
    expect(onDrop).not.toHaveBeenCalled();
    expect(document.querySelector("[data-dragging]")).toBeNull();
  });

  it("a finger on the grip is not a mouse drag (the pointer sensor leaves touch to the touch sensor)", async () => {
    tree(() => {});
    fireEvent.pointerDown(screen.getByLabelText("Drag Alpha"), { button: 0, isPrimary: true, pointerType: "touch", clientX: 10, clientY: 10, pointerId: 1 });
    await flush();
    fireEvent.pointerMove(document, { pointerType: "touch", isPrimary: true, clientX: 10, clientY: 60, pointerId: 1 });
    await flush();
    expect(document.querySelector("[data-dragging]")).toBeNull();
  });
});
