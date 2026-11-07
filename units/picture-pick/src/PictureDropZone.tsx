import { useRef, type ReactNode } from "react";
import { usePictureDrop } from "./usePictureDrop";

const VISUALLY_HIDDEN = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

export type PictureDropZoneProps = {
  onPick: (files: File[]) => void;
  children?: ReactNode;
  className?: string;
  /** Also take pictures pasted anywhere on the page. Default true. */
  paste?: boolean;
  /** What a screen reader hears while pictures are dragged over. Default "Drop pictures here". */
  label?: string;
};

export function PictureDropZone({ onPick, children, className, paste = true, label = "Drop pictures here" }: PictureDropZoneProps) {
  const ref = useRef<HTMLDivElement>(null);
  const active = usePictureDrop(ref, onPick, { paste });
  return (
    <div ref={ref} className={className}>
      {children}
      <div aria-live="polite" role="status" style={VISUALLY_HIDDEN}>{active ? label : ""}</div>
    </div>
  );
}
