// A sortable tree over @dnd-kit, meant to be an app's ONE drag and drop: nothing beside it should use
// HTML5 `draggable`. It does not write anything: it reads the rows, shows where a part will land, and tells the caller
// (`onDrop`) the new parent and place. The caller writes, through its own move functions.
//
//   <SortableTree rows={flattenTree(...)} refuse={...} onDrop={(drop) => ...}>
//     <TreeItem id label depth handle>  ... one part's row (not its child parts) ... </TreeItem>
//   </SortableTree>
//
// Mouse: a 5 px move on the grip. Touch: press the grip for 200 ms (a swipe before that scrolls). Keyboard: focus the grip,
// Space picks up, arrows move (up and down by row, left and right by level), Space drops, Escape cancels. Each step is read out.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useSensor,
  useSensors,
  type Announcements,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type PointerSensorOptions,
} from "@dnd-kit/core";
import {
  lineOf,
  placeWords,
  resolveDrop,
  stepGap,
  type DropTarget,
  type DropVerdict,
  type RefuseMove,
  type TreeRow,
} from "./treeDrop";

export { flattenTree, resolveDrop, type DropTarget, type DropVerdict, type RefuseMove, type TreeRow } from "./treeDrop";

const INDENT = 24;
// Mouse: 5 px. Touch: a 200 ms press that stays within 5 px (a swipe before that scrolls the card).
const MOUSE = { activationConstraint: { distance: 5 } };
const TOUCH = { activationConstraint: { delay: 200, tolerance: 5 } };
const ARROWS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
const INSTRUCTIONS =
  "To pick up a part, press space. Up and down move it, left and right change its level. Press space to drop it, escape to cancel.";

// The mouse sensor: dnd-kit's pointer sensor, but not for a finger. A finger has its own sensor (a press, so a swipe still scrolls).
const pointerActivator = PointerSensor.activators[0]!;
class MousePointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: (event: ReactPointerEvent, options: PointerSensorOptions) =>
        event.nativeEvent.pointerType === "touch" ? false : pointerActivator.handler(event, options),
    },
  ];
}

type TreeCtx = {
  disabled: boolean;
  indent: number;
  activeId: string | null;
  line: { rowId: string; edge: "top" | "bottom"; depth: number; ok: boolean } | null;
  focusId: string | null;
  clearFocus: () => void;
  registerRow: (id: string, el: HTMLElement | null) => void;
};

const Ctx = createContext<TreeCtx | null>(null);

function coordsOf(ev: Event): { x: number; y: number } | null {
  const t = ev as Partial<TouchEvent> & Partial<MouseEvent>;
  const touch = t.touches?.[0] ?? t.changedTouches?.[0];
  if (touch) return { x: touch.clientX, y: touch.clientY };
  if (typeof t.clientX === "number" && typeof t.clientY === "number") return { x: t.clientX, y: t.clientY };
  return null;
}

export function SortableTree({
  rows,
  onDrop,
  refuse,
  disabled = false,
  indent = INDENT,
  status = null,
  children,
}: {
  /** The visible rows, top to bottom, parents before their children. */
  rows: readonly TreeRow[];
  /** A drop that changes something. May return a promise; the caller owns the write and its errors.
   * A string is the reason the write failed. It is announced after "Dropped". */
  onDrop: (drop: DropTarget) => void | Promise<void | string | null | undefined>;
  /** The caller's own rule: a sentence refuses that move. A part going inside itself is always refused here. */
  refuse?: RefuseMove;
  disabled?: boolean;
  indent?: number;
  /** A sentence for the one polite region. A drag failure still wins while it is set. */
  status?: string | null;
  children: ReactNode;
}) {
  const latest = useRef({ rows, refuse, onDrop, indent });
  latest.current = { rows, refuse, onDrop, indent };
  const rowEls = useRef(new Map<string, HTMLElement>());
  const activeRef = useRef<string | null>(null);
  const modeRef = useRef<"pointer" | "keyboard" | null>(null);
  const cursor = useRef<{ gap: number; depth: number } | null>(null);
  const verdictRef = useRef<DropVerdict | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const said = useRef("");
  const dragGen = useRef(0);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [mode, setMode] = useState<"pointer" | "keyboard" | null>(null);
  const [verdict, setVerdict] = useState<DropVerdict | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const stepRef = useRef(keyboardStep);
  stepRef.current = keyboardStep;
  const keyboardOptions = useMemo(
    () => ({ coordinateGetter: ((event, args) => stepRef.current(event, args)) as KeyboardCoordinateGetter }),
    [],
  );
  const sensors = useSensors(
    useSensor(MousePointerSensor, MOUSE),
    useSensor(TouchSensor, TOUCH),
    useSensor(KeyboardSensor, keyboardOptions),
  );

  const registerRow = useCallback((id: string, el: HTMLElement | null) => {
    if (el) rowEls.current.set(id, el);
    else rowEls.current.delete(id);
  }, []);
  const clearFocus = useCallback(() => setFocusId(null), []);

  function labelOf(id: string | null): string {
    return latest.current.rows.find((r) => r.id === id)?.label ?? "the part";
  }

  function show(next: DropVerdict | null) {
    const prev = verdictRef.current;
    verdictRef.current = next;
    if (
      prev && next && prev.ok === next.ok && prev.gap === next.gap && prev.depth === next.depth &&
      (prev.ok ? prev.parentId : null) === (next.ok ? next.parentId : null)
    ) {
      return;
    }
    setVerdict(next);
  }

  function reset() {
    activeRef.current = null;
    modeRef.current = null;
    cursor.current = null;
    origin.current = null;
    pointer.current = null;
    verdictRef.current = null;
    setActive(null);
    setMode(null);
    setVerdict(null);
  }

  /** Where the line is in the page: the bottom edge of the row above it (or the top of the first row). */
  function lineY(gap: number): number {
    const list = latest.current.rows;
    const row = gap <= 0 ? list[0] : list[Math.min(gap, list.length) - 1];
    const el = row ? rowEls.current.get(row.id) : undefined;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return gap <= 0 ? r.top : r.bottom;
  }

  function keyboardStep(...args: Parameters<KeyboardCoordinateGetter>): ReturnType<KeyboardCoordinateGetter> {
    const [event, { currentCoordinates }] = args;
    const id = activeRef.current;
    const at = cursor.current;
    if (!id || !at || !ARROWS.includes(event.code)) return undefined;
    event.preventDefault();
    const list = latest.current.rows;
    let gap = at.gap;
    let depth = at.depth;
    if (event.code === "ArrowUp") gap = stepGap(list, id, gap, -1);
    else if (event.code === "ArrowDown") gap = stepGap(list, id, gap, 1);
    else if (event.code === "ArrowLeft") depth -= 1;
    else depth += 1;
    const next = resolveDrop(list, id, gap, depth, latest.current.refuse);
    const label = labelOf(id);
    const moved = next.gap !== at.gap || next.depth !== at.depth;
    cursor.current = { gap: next.gap, depth: next.depth };
    show(next);
    said.current = placeWords(label, next);
    if (!moved) return undefined;
    // The keyboard has no pointer: the move is the step (a row, a level). The drag layer is told it moved so it speaks.
    const real = lineY(next.gap) - lineY(at.gap);
    const dy = real !== 0 ? real : (next.gap - at.gap) * 24;
    return { x: currentCoordinates.x + (next.depth - at.depth) * latest.current.indent, y: currentCoordinates.y + dy };
  }

  /** From the pointer: the row whose middle is below it is the row under the line; the depth is how far right it was dragged. */
  function readPointer() {
    const id = activeRef.current;
    const p = pointer.current;
    const o = origin.current;
    if (!id || !p || !o) return;
    const list = latest.current.rows;
    let gap = list.length;
    for (let i = 0; i < list.length; i++) {
      const el = rowEls.current.get(list[i]!.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (p.y < r.top + r.height / 2) {
        gap = i;
        break;
      }
    }
    const row = list.find((r) => r.id === id);
    const depth = (row?.depth ?? 0) + Math.trunc((p.x - o.x) / latest.current.indent);
    show(resolveDrop(list, id, gap, depth, latest.current.refuse));
  }

  useEffect(() => {
    if (mode !== "pointer" || !active) return;
    const on = (e: Event) => {
      const p = coordsOf(e);
      if (!p) return;
      pointer.current = p;
      readPointer();
    };
    document.addEventListener("pointermove", on);
    document.addEventListener("touchmove", on, { passive: true });
    return () => {
      document.removeEventListener("pointermove", on);
      document.removeEventListener("touchmove", on);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, active]);

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    const list = latest.current.rows;
    const at = list.findIndex((r) => r.id === id);
    const row = list[at];
    if (!row) return;
    dragGen.current += 1;
    setFollowUp(null);
    const keyboard = e.activatorEvent.type.startsWith("key");
    activeRef.current = id;
    modeRef.current = keyboard ? "keyboard" : "pointer";
    setActive(id);
    setMode(modeRef.current);
    const stay = resolveDrop(list, id, at, row.depth, latest.current.refuse);
    show(stay);
    if (keyboard) {
      cursor.current = { gap: at, depth: row.depth };
      said.current = `Picked up ${row.label}. ${INSTRUCTIONS}`;
    } else {
      const start = coordsOf(e.activatorEvent);
      origin.current = start;
      pointer.current = start;
      said.current = `Picked up ${row.label}.`;
    }
  }

  function onDragEnd() {
    const id = activeRef.current;
    const v = verdictRef.current;
    const wasKeyboard = modeRef.current === "keyboard";
    const label = labelOf(id);
    reset();
    if (!id) return;
    if (wasKeyboard) setFocusId(id);
    if (!v) {
      said.current = `Dropped ${label} where it was. Nothing changed.`;
      return;
    }
    if (!v.ok) {
      said.current = `${label} was not moved. ${v.reason}`;
      return;
    }
    if (v.unchanged) {
      said.current = `Dropped ${label} where it was. Nothing changed.`;
      return;
    }
    said.current = `Dropped. ${placeWords(label, v)}.`;
    const gen = dragGen.current;
    try {
      void Promise.resolve(latest.current.onDrop(v))
        .then((reason) => {
          if (gen !== dragGen.current) return;
          if (typeof reason !== "string" || !reason) return;
          setFollowUp(`The move was not saved: ${reason}.`);
        })
        .catch(() => undefined);
    } catch {
      /* the caller says what went wrong */
    }
  }

  function onDragCancel() {
    const id = activeRef.current;
    const wasKeyboard = modeRef.current === "keyboard";
    const label = labelOf(id);
    reset();
    if (wasKeyboard && id) setFocusId(id);
    said.current = `Cancelled. ${label} stays where it was.`;
  }

  const announcements: Announcements = {
    onDragStart: () => said.current,
    onDragMove: () => (modeRef.current === "keyboard" ? said.current : undefined),
    onDragOver: () => undefined,
    onDragEnd: () => said.current,
    onDragCancel: () => said.current,
  };

  const line = verdict ? lineOf(rows, verdict) : null;
  const value = useMemo<TreeCtx>(
    () => ({ disabled, indent, activeId: active, line, focusId, clearFocus, registerRow }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled, indent, active, line?.rowId, line?.edge, line?.depth, line?.ok, focusId, clearFocus, registerRow],
  );
  const id = useId();

  return (
    <DndContext
      id={id}
      sensors={sensors}
      accessibility={{ announcements, screenReaderInstructions: { draggable: INSTRUCTIONS } }}
      onDragStart={onDragStart}
      onDragMove={() => {
        if (modeRef.current === "pointer") readPointer();
      }}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
      <div role="status" aria-live="polite" className="sr-only" data-tree-status>
        {followUp ?? status}
      </div>
      <DragOverlay dropAnimation={null}>
        {active && mode === "pointer" ? (
          <div className="inline-block rounded-[var(--r-md)] border border-[var(--accent)] bg-[var(--surface)] px-3 py-2 text-[14px] font-semibold text-[var(--ink)] shadow-md">
            {labelOf(active)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * One row of the tree: its grip at the left, its content, and the drop line when the line is at its edge. Put the row's own
 * content in it, not its child rows (they are rows of their own).
 */
export function TreeItem({
  id,
  label,
  depth,
  handle,
  children,
}: {
  id: string;
  label: string;
  depth: number;
  /** Draw the grip (Edit mode, and the person may write). */
  handle: boolean;
  children: ReactNode;
}) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("TreeItem needs a SortableTree around it.");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useDraggable({ id, disabled: ctx.disabled || !handle });
  const grip = useRef<HTMLButtonElement | null>(null);
  const { registerRow, focusId, clearFocus } = ctx;
  const rowRef = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el);
      registerRow(id, el);
    },
    [id, setNodeRef, registerRow],
  );
  const gripRef = useCallback(
    (el: HTMLButtonElement | null) => {
      grip.current = el;
      setActivatorNodeRef(el);
    },
    [setActivatorNodeRef],
  );
  useEffect(() => {
    if (focusId !== id) return;
    grip.current?.focus();
    clearFocus();
  });
  const dragging = ctx.activeId === id;
  const line = ctx.line && ctx.line.rowId === id ? ctx.line : null;
  return (
    <div
      ref={rowRef}
      data-tree-row={id}
      data-dragging={dragging ? "true" : undefined}
      className={`group/row relative flex w-full gap-1${dragging ? " opacity-50" : ""}`}
    >
      {handle ? (
        <button
          type="button"
          {...attributes}
          {...listeners}
          ref={gripRef}
          aria-label={`Drag ${label}`}
          data-tree-handle={id}
          style={{ minWidth: 44, minHeight: 44, cursor: "grab", touchAction: "manipulation" }}
          className="inline-flex min-h-11 min-w-11 shrink-0 cursor-grab self-start select-none items-center justify-center rounded-[var(--r-md)] text-[20px] leading-none text-[var(--ink-soft)] opacity-0 hover:bg-[var(--sel)] hover:text-[var(--ink)] focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] group-hover/row:opacity-100 pointer-coarse:opacity-100 aria-disabled:opacity-40"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e: ReactKeyboardEvent<HTMLButtonElement>) => {
            // While a part is picked up Escape cancels the drag; it must not also leave Edit mode (the card does that on an unhandled Escape).
            if (e.key === "Escape" && ctx.activeId === id) e.preventDefault();
            listeners?.onKeyDown?.(e);
          }}
        >
          {"⠿"}
        </button>
      ) : null}
      <div className="w-full min-w-0 flex-1">{children}</div>
      {line ? (
        <span
          aria-hidden="true"
          data-drop-line={line.ok ? "ok" : "refused"}
          data-drop-depth={line.depth}
          className={`pointer-events-none absolute right-0 h-0.5 rounded-full ${line.ok ? "bg-[var(--accent)]" : "bg-[var(--bad)]"}`}
          style={{ left: (line.depth - depth) * ctx.indent, [line.edge]: -1 }}
        />
      ) : null}
    </div>
  );
}
