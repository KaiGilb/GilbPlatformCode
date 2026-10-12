// Left, centre and right regions with two draggable dividers.
// The dividers are visible and show focus; each region carries `data-region` (left, center, right).
// The divider classes are Tailwind utilities over the editorial-tokens variables (`--line-2`,
// `--focus`, `--accent`); without Tailwind they are inert and the dividers stay unstyled.

import { useCallback, useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { dragWidth, keyWidth } from "./paneMath";

export interface PaneLayout {
  leftW: number;
  rightW: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  setLeftW: (next: number) => void;
  setRightW: (next: number) => void;
  /** The smallest left width the host allows. Read by assistive technology as the divider's range. */
  leftMin?: number;
  /** The largest left width the host allows. Read by assistive technology as the divider's range. */
  leftMax?: number;
  /** The smallest right width the host allows. Read by assistive technology as the divider's range. */
  rightMin?: number;
  /** The largest right width the host allows. Read by assistive technology as the divider's range. */
  rightMax?: number;
}

// The dividers report the width they control (aria-valuenow), and the range when the host passes the limits.
const DIVIDER =
  "w-1 flex-none cursor-col-resize bg-[var(--line-2)] hover:bg-[var(--focus)] " +
  "focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

// A drag on a touch screen moves the divider, not the page under it.
const DIVIDER_STYLE: CSSProperties = { touchAction: "none" };

export function Panes({ left, center, right, layout }: { left: ReactNode; center: ReactNode; right: ReactNode; layout: PaneLayout }) {
  // The drag in progress, if any: how to end it. Ended on pointerup, on pointercancel (the browser
  // took the pointer away), and when Panes unmounts mid-drag.
  const endDragRef = useRef<(() => void) | null>(null);
  useEffect(() => () => endDragRef.current?.(), []);

  const startDrag = useCallback(
    (side: "left" | "right") => (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      endDragRef.current?.();
      const startX = e.clientX;
      const startW = side === "left" ? layout.leftW : layout.rightW;
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture?.(e.pointerId);
      const onMove = (ev: globalThis.PointerEvent) => {
        const next = dragWidth(side, startW, ev.clientX - startX);
        if (side === "left") layout.setLeftW(next);
        else layout.setRightW(next);
      };
      const pointerId = e.pointerId;
      const end = () => {
        target.releasePointerCapture?.(pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        if (endDragRef.current === end) endDragRef.current = null;
      };
      endDragRef.current = end;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [layout],
  );

  const onKey = useCallback(
    (side: "left" | "right") => (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const current = side === "left" ? layout.leftW : layout.rightW;
      const next = keyWidth(side, current, e.key, e.shiftKey);
      if (side === "left") layout.setLeftW(next);
      else layout.setRightW(next);
    },
    [layout],
  );

  return (
    <div className="h-full flex items-stretch overflow-hidden">
      {!layout.leftCollapsed && (
        <>
          <div data-region="left" className="flex-none min-h-0 overflow-auto" style={{ width: layout.leftW }}>{left}</div>
          <div role="separator" aria-orientation="vertical" aria-label="Resize selection panel" aria-valuenow={Math.round(layout.leftW)} aria-valuemin={layout.leftMin} aria-valuemax={layout.leftMax} tabIndex={0} className={DIVIDER} style={DIVIDER_STYLE} onPointerDown={startDrag("left")} onKeyDown={onKey("left")} />
        </>
      )}
      <div data-region="center" className="flex-1 min-w-0 min-h-0">{center}</div>
      {!layout.rightCollapsed && (
        <>
          <div role="separator" aria-orientation="vertical" aria-label="Resize detail panel" aria-valuenow={Math.round(layout.rightW)} aria-valuemin={layout.rightMin} aria-valuemax={layout.rightMax} tabIndex={0} className={DIVIDER} style={DIVIDER_STYLE} onPointerDown={startDrag("right")} onKeyDown={onKey("right")} />
          <div data-region="right" className="flex-none min-h-0 overflow-auto" style={{ width: layout.rightW }}>{right}</div>
        </>
      )}
    </div>
  );
}
