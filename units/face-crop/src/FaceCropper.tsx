// The crop surface. ONE component, for every app.
//
// The surface on which a person decides which part of their own picture represents them: they
// put a picture in, mark the area that becomes their face, and later come back to that face, see
// the whole picture again, and mark a different area instead. One surface, two ways in.
// 🔴 ONE surface, not two — so ONE component, entered either way. `mode` only changes the wording.
//
// ── SKIPPING IS A BUTTON, NOT A CANCEL ──
// A person may select a crop, or not. The person who does not want to crop must have somewhere
// to press that MOVES THEM FORWARD. "Use the whole picture" is that button, it sits beside the
// other one with equal weight. ⛔ Making them cancel out of a crop dialog to skip cropping would
// turn "or not" into a failure path.
//
// ── MOBILE FIRST, BECAUSE THAT IS WHERE IT IS USED ──
// Pointer Events throughout, so one code path serves finger, pen and
// mouse; `touch-action: none` on the draggables so a drag does not scroll the page under it;
// hit targets at least 44 px; the whole sheet works at 320 px wide.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { initialSquare, rectFromDisplayedBox, type FaceRect } from "./faceRect";

/** A displayed selection, in CSS pixels relative to the rendered image's top-left. */
interface Box {
  left: number;
  top: number;
  size: number;
}

export interface FaceCropperProps {
  /**
   * The picture to frame. A `File`/`Blob` from a picker, or a URL of a picture already stored
   * (the re-cut case, where this is the master fetched back out of the vault).
   */
  source: Blob | string;
  /**
   * Which way in the person came, which changes only the words on screen.
   * - `"new"`   — they just chose or took a picture.
   * - `"recut"` — they tapped their existing face and asked to frame it again.
   */
  mode?: "new" | "recut";
  /** Disables both actions while the upload is in flight. */
  busy?: boolean;
  /**
   * Called with the marked rectangle, or `null` when the person chose the whole picture.
   * 🔴 `null` is a real answer meaning "use all of it" — ⛔ it is never "they cancelled".
   */
  onUse: (rect: FaceRect | null) => void;
  /** Called when the person backs out entirely. Leaves the current face alone. */
  onCancel: () => void;
}

const MIN_BOX_PX = 48;

/**
 * Lets a person mark the area of their own picture that becomes their face.
 *
 * @param props see {@link FaceCropperProps}
 */
export function FaceCropper({ source, mode = "new", busy = false, onUse, onCancel }: FaceCropperProps) {
  const [url, setUrl] = useState<string | null>(typeof source === "string" ? source : null);
  const [box, setBox] = useState<Box | null>(null);
  const [shown, setShown] = useState<{ width: number; height: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ kind: "move" | "resize"; x: number; y: number; box: Box } | null>(null);

  // An object URL for a Blob source, revoked on unmount. A leaked object URL pins the whole
  // decoded picture in memory, which on a 26 MP camera original is not a small leak.
  useEffect(() => {
    if (typeof source === "string") {
      setUrl(source);
      return;
    }
    const made = URL.createObjectURL(source);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [source]);

  // The box lives in DISPLAYED pixels, so it must be re-derived whenever the displayed size
  // changes — first paint, rotation, a window resize, or the image finally decoding.
  const measure = useCallback(() => {
    const el = imgRef.current;
    if (el === null) return;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (width <= 0 || height <= 0) return;
    setShown((prev) => (prev !== null && prev.width === width && prev.height === height ? prev : { width, height }));
    setBox((prev) => (prev === null ? initialSquare({ width, height }) : clampBox(prev, { width, height })));
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = imgRef.current;
    if (el === null || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, url]);

  // ── THE DIALOG CONTRACT. `aria-modal="true"` is a PROMISE, and it was unkept. ──
  // The sheet declared itself a modal dialog while Escape did nothing, focus was never moved
  // into it, and Tab walked straight out into the page behind the overlay — where the controls
  // are visually covered and, to a screen-reader or keyboard user, silently reachable.
  // ⚠ This is a SHARED component: whatever is wrong here is wrong in every app at once.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (sheet === null) return;

    // Initial focus goes to the sheet itself rather than to a button, so a screen reader reads
    // the heading and the hint — what this is and that the original is kept — before the person
    // is standing on "Use this area".
    const previously = document.activeElement as HTMLElement | null;
    sheet.focus();

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        // ⚠ Escape is CANCEL, never "use the whole picture". Backing out must not silently
        //   commit a framing decision the person did not make.
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        sheet.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // Put focus back where the person left it, so dismissing the sheet does not dump them at
      // the top of the document.
      previously?.focus?.();
    };
  }, [onCancel]);

  const onPointerDown = (kind: "move" | "resize") => (e: React.PointerEvent) => {
    if (box === null || busy) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { kind, x: e.clientX, y: e.clientY, box };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag === null || shown === null) return;
    e.preventDefault();
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (drag.kind === "move") {
      setBox(clampBox({ ...drag.box, left: drag.box.left + dx, top: drag.box.top + dy }, shown));
    } else {
      // One handle drives both axes: the selection stays square, which is what a face wants and
      // what every avatar renders into a circle.
      const size = drag.box.size + Math.max(dx, dy);
      setBox(clampBox({ ...drag.box, size }, shown));
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
  };

  const useArea = () => {
    if (box === null || shown === null) {
      onUse(null);
      return;
    }
    onUse(rectFromDisplayedBox(box, shown));
  };

  const heading = mode === "recut" ? "Frame your face again" : "Choose your face";

  return (
    <div className="gp-crop" role="dialog" aria-modal="true" aria-label={heading}>
      <div className="gp-crop__sheet" ref={sheetRef} tabIndex={-1}>
        <h2 className="gp-crop__title">{heading}</h2>
        <p className="gp-crop__hint">
          Drag the square over your face, or just use the whole picture. Your original is kept either way.
        </p>

        <div className="gp-crop__stage">
          {url !== null && (
            <img
              ref={imgRef}
              src={url}
              alt="The picture you are framing"
              className="gp-crop__img"
              onLoad={measure}
              draggable={false}
            />
          )}
          {box !== null && (
            <div
              className="gp-crop__box"
              style={{ left: box.left, top: box.top, width: box.size, height: box.size }}
              onPointerDown={onPointerDown("move")}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              role="slider"
              tabIndex={0}
              aria-label="The area of the picture that becomes your face"
              aria-valuenow={Math.round(box.size)}
              aria-valuemin={MIN_BOX_PX}
              aria-valuemax={shown === null ? MIN_BOX_PX : Math.round(Math.min(shown.width, shown.height))}
              onKeyDown={(e) => {
                if (shown === null) return;
                const step = e.shiftKey ? 20 : 5;
                const moves: Record<string, Partial<Box>> = {
                  ArrowLeft: { left: box.left - step },
                  ArrowRight: { left: box.left + step },
                  ArrowUp: { top: box.top - step },
                  ArrowDown: { top: box.top + step },
                  "+": { size: box.size + step },
                  "-": { size: box.size - step },
                };
                const next = moves[e.key];
                if (next === undefined) return;
                e.preventDefault();
                setBox(clampBox({ ...box, ...next }, shown));
              }}
            >
              <span
                className="gp-crop__handle"
                onPointerDown={onPointerDown("resize")}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                aria-hidden="true"
              />
            </div>
          )}
        </div>

        <div className="gp-crop__actions">
          {/* Equal weight, on purpose — see the note at the top of this file. */}
          <button type="button" className="gp-crop__btn" onClick={() => onUse(null)} disabled={busy}>
            Use the whole picture
          </button>
          <button type="button" className="gp-crop__btn gp-crop__btn--primary" onClick={useArea} disabled={busy}>
            Use this area
          </button>
        </div>
        <button type="button" className="gp-crop__cancel" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Keeps a box square, at least MIN_BOX_PX, and wholly inside the displayed picture. */
function clampBox(box: Box, shown: { width: number; height: number }): Box {
  const max = Math.min(shown.width, shown.height);
  const size = Math.max(MIN_BOX_PX, Math.min(box.size, max));
  return {
    size,
    left: Math.max(0, Math.min(box.left, shown.width - size)),
    top: Math.max(0, Math.min(box.top, shown.height - size)),
  };
}
