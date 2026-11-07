import { useEffect, useRef, useState, type RefObject } from "react";
import { pictureFiles } from "./pictureFiles";

export const DROP_ACTIVE_CLASS = "picture-drop-active";

const EDITABLE = "input, textarea, [contenteditable]";

function carriesFiles(e: DragEvent): boolean {
  const dt = e.dataTransfer;
  if (!dt) return false;
  return Array.from(dt.types ?? []).includes("Files") || (dt.files?.length ?? 0) > 0;
}

/**
 * Pictures dropped on the target, and (unless `paste` is false) pictures pasted anywhere on the page
 * outside an editable field, are handed to `onPick`. While files are dragged over the target it has
 * the class `picture-drop-active`. Returns whether a drag is over the target now.
 */
export function usePictureDrop(
  target: RefObject<HTMLElement | null>,
  onPick: (files: File[]) => void,
  options: { paste?: boolean } = {},
): boolean {
  const paste = options.paste ?? true;
  const latest = useRef(onPick);
  latest.current = onPick;
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    let depth = 0;
    const setOver = (on: boolean) => {
      el.classList.toggle(DROP_ACTIVE_CLASS, on);
      setActive(on);
    };
    const onEnter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth += 1;
      setOver(true);
    };
    const onOver = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      setOver(true);
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const files = pictureFiles(e.dataTransfer?.files);
      if (files.length > 0) latest.current(files);
    };
    el.addEventListener("dragenter", onEnter);
    el.addEventListener("dragover", onOver);
    el.addEventListener("dragleave", onLeave);
    el.addEventListener("drop", onDrop);

    const onPaste = (e: ClipboardEvent) => {
      const files = pictureFiles(e.clipboardData?.files);
      if (files.length === 0) return;
      const focus = document.activeElement;
      if (focus && focus.closest(EDITABLE)) return;
      e.preventDefault();
      latest.current(files);
    };
    if (paste) document.addEventListener("paste", onPaste);

    return () => {
      el.removeEventListener("dragenter", onEnter);
      el.removeEventListener("dragover", onOver);
      el.removeEventListener("dragleave", onLeave);
      el.removeEventListener("drop", onDrop);
      document.removeEventListener("paste", onPaste);
      el.classList.remove(DROP_ACTIVE_CLASS);
    };
  }, [target, paste]);

  return active;
}
