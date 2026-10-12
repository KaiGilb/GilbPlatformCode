// Left, centre and right regions with two draggable dividers.
// The dividers are visible and show focus; each region carries `data-region` (left, center, right).
// The divider classes are Tailwind utilities over the editorial-tokens variables (`--line-2`,
// `--focus`, `--accent`); without Tailwind they are inert and the dividers stay unstyled.

import { useCallback, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { dragWidth, keyWidth } from "./paneMath";

export interface PaneLayout {
  leftW: number;
  rightW: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  setLeftW: (next: number) => void;
  setRightW: (next: number) => void;
}

const DIVIDER =
  "w-1 flex-none cursor-col-resize bg-[var(--line-2)] hover:bg-[var(--focus)] " +
  "focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

export function Panes({ left, center, right, layout }: { left: ReactNode; center: ReactNode; right: ReactNode; layout: PaneLayout }) {
  const startDrag = useCallback(
    (side: "left" | "right") => (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = side === "left" ? layout.leftW : layout.rightW;
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture?.(e.pointerId);
      const onMove = (ev: globalThis.PointerEvent) => {
        const next = dragWidth(side, startW, ev.clientX - startX);
        if (side === "left") layout.setLeftW(next);
        else layout.setRightW(next);
      };
      const onUp = (ev: globalThis.PointerEvent) => {
        target.releasePointerCapture?.(ev.pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
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
          <div role="separator" aria-orientation="vertical" aria-label="Resize selection panel" tabIndex={0} className={DIVIDER} onPointerDown={startDrag("left")} onKeyDown={onKey("left")} />
        </>
      )}
      <div data-region="center" className="flex-1 min-w-0 min-h-0">{center}</div>
      {!layout.rightCollapsed && (
        <>
          <div role="separator" aria-orientation="vertical" aria-label="Resize detail panel" tabIndex={0} className={DIVIDER} onPointerDown={startDrag("right")} onKeyDown={onKey("right")} />
          <div data-region="right" className="flex-none min-h-0 overflow-auto" style={{ width: layout.rightW }}>{right}</div>
        </>
      )}
    </div>
  );
}
