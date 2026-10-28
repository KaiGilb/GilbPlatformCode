import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SortableTree, TreeItem, flattenTree, type DropTarget, type TreeRow } from "./index";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const ROWS: TreeRow[] = [
  { id: "a", parentId: null, depth: 0, label: "Alpha" },
  { id: "b", parentId: null, depth: 0, label: "Beta" },
  { id: "bc", parentId: "b", depth: 1, label: "Gamma" },
];

function Tree(props: {
  rows?: TreeRow[];
  handle?: boolean;
  disabled?: boolean;
  status?: string | null;
  indent?: number;
  onDrop?: (d: DropTarget) => void | Promise<void | string | null | undefined>;
  refuse?: (m: { activeId: string; parentId: string | null; index: number }) => string | null;
}) {
  const rows = props.rows ?? ROWS;
  return (
    <SortableTree rows={rows} onDrop={props.onDrop ?? (() => {})} disabled={props.disabled} status={props.status} indent={props.indent} refuse={props.refuse}>
      {rows.map((r) => (
        <TreeItem key={r.id} id={r.id} label={r.label} depth={r.depth} handle={props.handle ?? true}>
          <span data-testid={`content-${r.id}`}>{r.label} content</span>
        </TreeItem>
      ))}
    </SortableTree>
  );
}

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

describe("rendering", () => {
  it("draws each row with data-tree-row and its content", () => {
    const { container } = render(<Tree />);
    const rows = [...container.querySelectorAll("[data-tree-row]")];
    expect(rows.map((r) => r.getAttribute("data-tree-row"))).toEqual(["a", "b", "bc"]);
    expect(screen.getByTestId("content-bc").textContent).toBe("Gamma content");
    expect(rows[0]?.contains(screen.getByTestId("content-a"))).toBe(true);
  });
  it("a row is a flex line with a relative position and no dragging mark at rest", () => {
    const { container } = render(<Tree />);
    const row = container.querySelector("[data-tree-row='a']") as HTMLElement;
    expect(row.className).toBe("group/row relative flex w-full gap-1");
    expect(row.hasAttribute("data-dragging")).toBe(false);
  });
  it("each row has a grip, data-tree-handle=<id>, named `Drag <label>`", () => {
    const { container } = render(<Tree />);
    const grips = [...container.querySelectorAll("[data-tree-handle]")] as HTMLButtonElement[];
    expect(grips.map((g) => g.getAttribute("data-tree-handle"))).toEqual(["a", "b", "bc"]);
    expect(grips.map((g) => g.getAttribute("aria-label"))).toEqual(["Drag Alpha", "Drag Beta", "Drag Gamma"]);
    expect(screen.getByLabelText("Drag Beta")).toBe(grips[1]);
    expect(grips[0]?.tagName).toBe("BUTTON");
    expect(grips[0]?.getAttribute("type")).toBe("button");
    expect(grips[0]?.textContent).toBe("⠿");
  });
  it("the grip is a 44 by 44 px target with a grab cursor, and is hidden until hover or focus", () => {
    render(<Tree />);
    const grip = screen.getByLabelText("Drag Alpha");
    expect(grip.style.minWidth).toBe("44px");
    expect(grip.style.minHeight).toBe("44px");
    expect(grip.style.cursor).toBe("grab");
    expect(grip.style.touchAction).toBe("manipulation");
    expect(grip.className).toMatch(/opacity-0/);
    expect(grip.className).toMatch(/focus-visible:opacity-100/);
    expect(grip.className).toMatch(/pointer-coarse:opacity-100/);
    expect(grip.className).toMatch(/group-hover\/row:opacity-100/);
  });
  it("with handle false there is no grip", () => {
    const { container } = render(<Tree handle={false} />);
    expect(container.querySelectorAll("[data-tree-handle]")).toHaveLength(0);
    expect(container.querySelectorAll("[data-tree-row]")).toHaveLength(3);
  });
  it("the grip is wired to dnd-kit: a draggable button with a description pointing at the instructions", () => {
    render(<Tree />);
    const grip = screen.getByLabelText("Drag Alpha");
    expect(grip.getAttribute("role")).toBe("button");
    expect(grip.getAttribute("aria-roledescription")).toBe("draggable");
    expect(grip.getAttribute("tabindex")).toBe("0");
    const instructions = document.getElementById(grip.getAttribute("aria-describedby") ?? "none");
    expect(instructions?.textContent).toBe(
      "To pick up a part, press space. Up and down move it, left and right change its level. Press space to drop it, escape to cancel.",
    );
  });
  it("disabled makes the grips aria-disabled", () => {
    render(<Tree disabled />);
    expect(screen.getByLabelText("Drag Alpha").getAttribute("aria-disabled")).toBe("true");
    cleanup();
    render(<Tree />);
    expect(screen.getByLabelText("Drag Alpha").getAttribute("aria-disabled")).toBe("false");
  });
  it("a click on the grip does not reach the row", () => {
    const rowClick = vi.fn();
    render(
      <SortableTree rows={ROWS} onDrop={() => {}}>
        <div onClick={rowClick}>
          <TreeItem id="a" label="Alpha" depth={0} handle>
            x
          </TreeItem>
        </div>
      </SortableTree>,
    );
    fireEvent.click(screen.getByLabelText("Drag Alpha"));
    expect(rowClick).not.toHaveBeenCalled();
  });
  it("a TreeItem outside a SortableTree throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <TreeItem id="a" label="A" depth={0} handle>
          x
        </TreeItem>,
      ),
    ).toThrow("TreeItem needs a SortableTree around it.");
    spy.mockRestore();
  });
});

describe("the status region", () => {
  it("is one polite, screen-reader-only region with data-tree-status", () => {
    const { container } = render(<Tree />);
    const region = container.querySelector("[data-tree-status]") as HTMLElement;
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.className).toBe("sr-only");
    expect(region.textContent).toBe("");
  });
  it("shows the status sentence it is given", () => {
    const { container, rerender } = render(<Tree status="Saving." />);
    expect(container.querySelector("[data-tree-status]")?.textContent).toBe("Saving.");
    rerender(<Tree status={null} />);
    expect(container.querySelector("[data-tree-status]")?.textContent).toBe("");
  });
});

describe("keyboard", () => {
  // Space picks up, the arrows move, Space drops, Escape cancels. jsdom has no layout, so every row has no size:
  // the step then falls back to 24 px a row, and the drop is read from the keys alone.
  const live = () => document.querySelector("[aria-live='assertive']") as HTMLElement;

  async function pickUp(id: string) {
    const grip = document.querySelector(`[data-tree-handle='${id}']`) as HTMLButtonElement;
    grip.focus();
    fireEvent.keyDown(grip, { code: "Space", key: " " });
    await flush();
    return grip;
  }
  const press = async (code: string) => {
    fireEvent.keyDown(document, { code, key: code });
    await flush();
  };

  it("Space on a grip picks the row up: it is marked dragging and the pick-up is read out", async () => {
    const { container } = render(<Tree />);
    await pickUp("a");
    expect(container.querySelector("[data-tree-row='a']")?.getAttribute("data-dragging")).toBe("true");
    expect(container.querySelector("[data-tree-row='a']")?.className).toMatch(/opacity-50/);
    expect(live().textContent).toMatch(/^Picked up Alpha\. To pick up a part, press space\./);
    expect(container.querySelector("[data-tree-row='b']")?.hasAttribute("data-dragging")).toBe(false);
  });

  it("down steps over a one-row part to the place under the next row; down again and left reach the top level after it; Space drops and tells the caller once", async () => {
    const onDrop = vi.fn();
    render(<Tree onDrop={onDrop} />);
    await pickUp("a");
    await press("ArrowDown");
    expect(live().textContent).toBe("Alpha moved under Beta, first");
    await press("ArrowDown");
    expect(live().textContent).toBe("Alpha moved under Beta, after Gamma");
    await press("ArrowLeft");
    expect(live().textContent).toBe("Alpha moved to the top level, after Beta");
    await press("Space");
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop.mock.calls[0]?.[0]).toMatchObject({ ok: true, activeId: "a", parentId: null, index: 1, gap: 3, depth: 0, unchanged: false, afterLabel: "Beta" });
    expect(live().textContent).toBe("Dropped. Alpha moved to the top level, after Beta.");
  });

  it("the drop line is drawn while a row is carried: ok, at its depth, at the edge of the row above", async () => {
    const { container } = render(<Tree />);
    await pickUp("a");
    await press("ArrowDown");
    const line = container.querySelector("[data-drop-line]") as HTMLElement;
    expect(line.getAttribute("data-drop-line")).toBe("ok");
    expect(line.getAttribute("data-drop-depth")).toBe("1");
    expect(line.getAttribute("aria-hidden")).toBe("true");
    expect(line.closest("[data-tree-row]")?.getAttribute("data-tree-row")).toBe("b");
    expect(line.className).toMatch(/bg-\[var\(--accent\)\]/);
  });

  it("right changes the level: Space, down, right, Space nests the row under the one above", async () => {
    const onDrop = vi.fn();
    render(<Tree rows={flattenTree([{ id: "a", l: "Alpha", c: [] }, { id: "b", l: "Beta", c: [] }], (n: { id: string; l: string; c: never[] }) => ({ id: n.id, label: n.l, children: n.c }))} onDrop={onDrop} />);
    await pickUp("a");
    await press("ArrowDown");
    await press("ArrowRight");
    expect(live().textContent).toBe("Alpha moved under Beta, first");
    await press("Space");
    expect(onDrop.mock.calls[0]?.[0]).toMatchObject({ parentId: "b", index: 0, depth: 1 });
  });

  it("Space with no move drops it where it was: nothing is reported", async () => {
    const onDrop = vi.fn();
    render(<Tree onDrop={onDrop} />);
    await pickUp("b");
    await press("Space");
    expect(onDrop).not.toHaveBeenCalled();
    expect(live().textContent).toBe("Dropped Beta where it was. Nothing changed.");
  });

  it("Escape cancels: nothing is reported, the row is back, and the grip has the focus again", async () => {
    const onDrop = vi.fn();
    const { container } = render(<Tree onDrop={onDrop} />);
    const grip = await pickUp("a");
    await press("ArrowDown");
    grip.blur();
    await press("Escape");
    expect(onDrop).not.toHaveBeenCalled();
    expect(live().textContent).toBe("Cancelled. Alpha stays where it was.");
    expect(container.querySelector("[data-tree-row='a']")?.hasAttribute("data-dragging")).toBe(false);
    expect(container.querySelector("[data-drop-line]")).toBeNull();
    await flush();
    expect(document.activeElement).toBe(grip);
  });

  it("Escape on the grip while a row is carried is already handled when it reaches the card around the tree (its default is prevented), so the card does not also leave Edit mode", async () => {
    const seen: boolean[] = [];
    render(
      <div onKeyDown={(e) => seen.push(e.defaultPrevented)}>
        <Tree />
      </div>,
    );
    const grip = await pickUp("a");
    seen.length = 0;
    fireEvent.keyDown(grip, { code: "Escape", key: "Escape" });
    expect(seen).toEqual([true]);
  });

  it("Escape on a grip when nothing is carried is not handled by the tree", async () => {
    const seen: boolean[] = [];
    render(
      <div onKeyDown={(e) => seen.push(e.defaultPrevented)}>
        <Tree />
      </div>,
    );
    fireEvent.keyDown(screen.getByLabelText("Drag Alpha"), { code: "Escape", key: "Escape" });
    expect(seen).toEqual([false]);
  });

  it("after a drop by keyboard the focus is back on the grip of the row that moved", async () => {
    render(<Tree onDrop={() => {}} />);
    const grip = await pickUp("a");
    await press("ArrowDown");
    grip.blur();
    expect(document.activeElement).not.toBe(grip);
    await press("Space");
    await flush();
    expect(document.activeElement).toBe(grip);
  });

  it("a failure that arrives after another drag has begun is not shown", async () => {
    let fail: (reason: string) => void = () => {};
    const first = new Promise<string>((resolve) => {
      fail = resolve;
    });
    const onDrop = vi.fn().mockReturnValueOnce(first).mockReturnValue(undefined);
    const { container } = render(<Tree onDrop={onDrop} />);
    await pickUp("a");
    await press("ArrowDown");
    await press("Space");
    await pickUp("b");
    await press("Escape");
    fail("late");
    await flush();
    expect(container.querySelector("[data-tree-status]")?.textContent).toBe("");
  });

  it("a failure that arrives while no other drag has begun is shown", async () => {
    let fail: (reason: string) => void = () => {};
    const first = new Promise<string>((resolve) => {
      fail = resolve;
    });
    const { container } = render(<Tree onDrop={() => first} />);
    await pickUp("a");
    await press("ArrowDown");
    await press("Space");
    expect(container.querySelector("[data-tree-status]")?.textContent).toBe("");
    fail("slow");
    await flush();
    expect(container.querySelector("[data-tree-status]")?.textContent).toBe("The move was not saved: slow.");
  });

  it("a refused place is drawn as refused and is not reported", async () => {
    const onDrop = vi.fn();
    const refuse = vi.fn(() => "Not under Beta.");
    const { container } = render(<Tree onDrop={onDrop} refuse={refuse} />);
    await pickUp("a");
    await press("ArrowDown");
    expect(live().textContent).toBe("Not under Beta.");
    expect(container.querySelector("[data-drop-line]")?.getAttribute("data-drop-line")).toBe("refused");
    await press("Space");
    expect(onDrop).not.toHaveBeenCalled();
    expect(live().textContent).toBe("Alpha was not moved. Not under Beta.");
  });

  it("a row cannot be carried inside its own parts: the announcement says why", async () => {
    const onDrop = vi.fn();
    render(<Tree onDrop={onDrop} />);
    await pickUp("b");
    await press("ArrowDown");
    expect(live().textContent).toBe("Beta cannot be put inside itself or its own parts.");
    await press("Space");
    expect(onDrop).not.toHaveBeenCalled();
    expect(live().textContent).toBe("Beta was not moved. Beta cannot be put inside itself or its own parts.");
  });

  it("a write that fails says so in the status region, after Dropped", async () => {
    const onDrop = vi.fn(async () => "the vault is down");
    const { container } = render(<Tree onDrop={onDrop} />);
    await pickUp("a");
    await press("ArrowDown");
    await press("Space");
    await flush();
    expect(container.querySelector("[data-tree-status]")?.textContent).toBe("The move was not saved: the vault is down.");
  });

  it("a write that rejects, or throws, is not an error here: the caller owns it", async () => {
    const rejecting = vi.fn(async () => {
      throw new Error("boom");
    });
    render(<Tree onDrop={rejecting} />);
    await pickUp("a");
    await press("ArrowDown");
    await press("Space");
    await flush();
    expect(rejecting).toHaveBeenCalledTimes(1);
    cleanup();
    const throwing = vi.fn(() => {
      throw new Error("boom");
    });
    render(<Tree onDrop={throwing} />);
    await pickUp("a");
    await press("ArrowDown");
    await press("Space");
    expect(throwing).toHaveBeenCalledTimes(1);
  });

  it("a disabled tree cannot pick a row up", async () => {
    const { container } = render(<Tree disabled />);
    await pickUp("a");
    expect(container.querySelector("[data-dragging]")).toBeNull();
  });
});
